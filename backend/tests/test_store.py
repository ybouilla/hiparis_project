"""Tests of the data sources (backend/store.py) and of how the API uses them.

Most tests need no database. The last class compares the PostgreSQL store with the CSV store, and
runs only when TEST_DATABASE_URL points to a database in which the warehouse has been built
(`sh etl/run.sh`), e.g.
    TEST_DATABASE_URL=postgresql://movies:movies@localhost:5432/movies pytest backend/tests/test_store.py
"""
import math
import os

import pytest

import backend.app as backend_app
from backend.cache import ResponseCache
from backend.store import (CsvStore, DataSourceError, PostgresStore, StoreSelector, build_store,
                           database_url, escape_like)


class FakeStore:
    """Stands for a store: answers what it is told to, or fails."""
    def __init__(self, name, total=3, fail=None):
        self.name, self._total, self.fail, self.calls = name, total, fail, 0

    def _check(self):
        if self.fail:
            raise DataSourceError(self.fail)

    def version(self):
        self._check()
        return "v1"

    def total(self):
        self._check()
        return self._total

    def query_movies(self, *args):
        self._check()
        self.calls += 1
        return {"message": "ok", "movies": [{"Title": f"from {self.name}"}], "total_movies": 1,
                "all_genres": [], "min_date": 1900, "max_val": {}}

    def statistics(self, dates):
        self._check()
        return {"message": "ok", "source": self.name}


class TestConfiguration:
    def test_csv_is_the_default(self):
        assert build_store({}).mode == "csv"
        assert build_store({"DATA_SOURCE": ""}).mode == "csv"
        assert build_store({}).postgres is None                   # nothing about the database is even created

    def test_modes_and_a_typo(self):
        assert build_store({"DATA_SOURCE": "Postgres"}).mode == "postgres"
        assert build_store({"DATA_SOURCE": " auto "}).mode == "auto"
        with pytest.raises(ValueError, match="DATA_SOURCE"):
            build_store({"DATA_SOURCE": "postgress"})

    def test_database_url(self):
        assert database_url({"DATABASE_URL": "postgresql://x"}) == "postgresql://x"
        env = {"POSTGRES_HOST": "db", "POSTGRES_USER": "me", "POSTGRES_PASSWORD": "p@ss/word", "POSTGRES_DB": "wh"}
        assert database_url(env) == "postgresql://me:p%40ss%2Fword@db:5432/wh"
        assert database_url({}) == "postgresql://movies:movies@localhost:5432/movies"

    def test_like_characters_are_taken_literally(self):
        assert escape_like("50%_off\\") == "50\\%\\_off\\\\"


class TestSelector:
    def test_csv_mode_never_touches_the_database(self):
        csv = FakeStore("csv")
        selector = StoreSelector("csv", csv_store=csv)
        assert selector.current() is csv and selector.failed(DataSourceError("x")) is None

    def test_postgres_mode_has_no_fallback(self):
        postgres = FakeStore("postgres", fail="down")
        selector = StoreSelector("postgres", csv_store=FakeStore("csv"), postgres_store=postgres)
        assert selector.current() is postgres                       # the error comes when it is used
        assert selector.failed(DataSourceError("down")) is None

    def test_auto_mode_falls_back_then_comes_back(self):
        csv, postgres = FakeStore("csv"), FakeStore("postgres", fail="down")
        selector = StoreSelector("auto", csv_store=csv, postgres_store=postgres)
        assert selector.current() is csv                            # postgres is down: the CSV answers
        postgres.fail = None
        assert selector.current() is csv                            # still in its 30 s of rest
        selector._down_until = 0                                    # the rest is over
        assert selector.current() is postgres


class TestApi:
    @pytest.fixture
    def client(self, monkeypatch):
        monkeypatch.setattr(backend_app, "_cache", ResponseCache())      # a cache of its own
        backend_app.app.config["TESTING"] = True
        with backend_app.app.test_client() as client:
            yield client

    def _use(self, monkeypatch, selector):
        monkeypatch.setattr(backend_app, "_store", selector)

    def test_the_answer_says_which_source_it_comes_from(self, client, monkeypatch):
        self._use(monkeypatch, StoreSelector("postgres", csv_store=FakeStore("csv"), postgres_store=FakeStore("postgres")))
        response = client.get("/allmovies?start=0&end=5")
        assert response.status_code == 201 and response.headers["X-Data-Source"] == "postgres"
        assert response.get_json()["movies"][0]["Title"] == "from postgres"
        assert client.get("/statistics").get_json()["source"] == "postgres"

    def test_postgres_mode_answers_503_with_a_message_when_the_database_fails(self, client, monkeypatch):
        self._use(monkeypatch, StoreSelector("postgres", csv_store=FakeStore("csv"),
                                             postgres_store=FakeStore("postgres", fail="database unreachable")))
        for url in ("/allmovies?start=0&end=5", "/statistics"):
            response = client.get(url)
            assert response.status_code == 503
            assert "database unreachable" in response.get_json()["message"]

    def test_auto_mode_answers_from_the_csv_when_the_database_fails(self, client, monkeypatch):
        self._use(monkeypatch, StoreSelector("auto", csv_store=FakeStore("csv"),
                                             postgres_store=FakeStore("postgres", fail="down")))
        response = client.get("/allmovies?start=0&end=5")
        assert response.status_code == 201 and response.headers["X-Data-Source"] == "csv"

    def test_auto_mode_survives_a_failure_in_the_middle_of_a_query(self, client, monkeypatch):
        """The database passes the health check, then fails on the real query."""
        class Flaky(FakeStore):
            def query_movies(self, *args):
                raise DataSourceError("connection lost")
        self._use(monkeypatch, StoreSelector("auto", csv_store=FakeStore("csv"), postgres_store=Flaky("postgres")))
        response = client.get("/allmovies?start=0&end=5")
        assert response.status_code == 201 and response.headers["X-Data-Source"] == "csv"

    def test_cached_answers_are_never_shared_between_sources(self, client, monkeypatch):
        csv, postgres = FakeStore("csv"), FakeStore("postgres")
        url = "/allmovies?start=0&end=5&genre=Drama"
        self._use(monkeypatch, StoreSelector("csv", csv_store=csv))
        assert client.get(url).headers["X-App-Cache"] == "miss"
        assert client.get(url).headers["X-App-Cache"] == "memory"
        self._use(monkeypatch, StoreSelector("postgres", csv_store=csv, postgres_store=postgres))
        other = client.get(url)
        assert other.headers["X-App-Cache"] == "miss"                    # same URL, other source: computed again
        assert other.get_json()["movies"][0]["Title"] == "from postgres"

    def test_a_new_load_of_the_data_is_a_new_cache_key(self, client, monkeypatch):
        store = FakeStore("postgres")
        self._use(monkeypatch, StoreSelector("postgres", csv_store=FakeStore("csv"), postgres_store=store))
        url = "/allmovies?start=0&end=5"
        client.get(url)
        assert client.get(url).headers["X-App-Cache"] == "memory"
        store.version = lambda: "v2"                                      # the pipeline ran again
        assert client.get(url).headers["X-App-Cache"] == "miss"

    def test_big_pages_are_not_cached(self, client, monkeypatch):
        self._use(monkeypatch, StoreSelector("csv", csv_store=FakeStore("csv", total=10000)))   # a dataset bigger than the page
        response = client.get("/allmovies?start=0&end=500")
        assert response.status_code == 201 and "X-App-Cache" not in response.headers
        assert response.headers["X-Data-Source"] == "csv"


# ----------------------------------------------------------------------------------------------
# PostgreSQL against the CSV
# ----------------------------------------------------------------------------------------------

def _warehouse():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    store = PostgresStore(url)
    try:
        store.version()
    except DataSourceError as error:
        pytest.skip(f"the warehouse is not available: {error}")
    return store


def args(start=0, end=20, title="", genre=(), language="", min_rate=0.0, dates=(), order_by=None, order_desc="asc"):
    return (start, end, title, tuple(sorted(genre)), language, min_rate, tuple(dates), order_by, order_desc)


QUERIES = [
    args(), args(40, 60), args(0, 500, genre=["Drama"]), args(title="spider"),
    args(title="man", genre=["Action", "Adventure"]), args(language="ja", min_rate=7.0),
    args(dates=("1990", "2000")), args(dates=("2010", "2010")), args(min_rate=0.5),
    args(min_rate=8.0, language="en", genre=["Comedy"]), args(title="zzzzzzzz"), args(1000, 1020),
]
SORT_KEYS = {"popularity": "Popularity", "release_date": "Release_Date", "vote_count": "Vote_Count", "vote_average": "Vote_Average"}
QUERIES += [args(order_by=field, order_desc=direction, genre=["Action"], dates=("1980", "2024"))
            for field in SORT_KEYS for direction in ("asc", "desc")]


def _same_movie(a, b):
    date = lambda m: str(m["Release_Date"])[:10]
    return (a["Title"], date(a)) == (b["Title"], date(b)) and a["Overview"] == b["Overview"] \
        and a["Poster_Url"] == b["Poster_Url"] and a["Original_Language"] == b["Original_Language"] \
        and math.isclose(a["Popularity"], b["Popularity"], abs_tol=5e-4) and int(a["Vote_Count"]) == int(b["Vote_Count"]) \
        and math.isclose(a["Vote_Average"], b["Vote_Average"], abs_tol=0.051) \
        and sorted(a["Genre_List"]) == sorted(b["Genre_List"])


class TestPostgresMatchesCsv:
    @pytest.mark.parametrize("query", QUERIES, ids=lambda q: f"{q[0]}-{q[1]}-{q[2]}-{q[3]}-{q[4]}-{q[5]}-{q[6]}-{q[7]}-{q[8]}")
    def test_allmovies(self, query):
        pg, csv = _warehouse(), CsvStore()
        a, b = csv.query_movies(*query), pg.query_movies(*query)
        assert (a["total_movies"], a["all_genres"], a["min_date"]) == (b["total_movies"], b["all_genres"], b["min_date"])
        assert len(a["movies"]) == len(b["movies"])
        sort_key = SORT_KEYS.get(query[7])
        if sort_key:     # same values in the same order (movies with equal values may come in another order)
            value = lambda m: str(m[sort_key])[:10] if sort_key == "Release_Date" else float(m[sort_key])
            assert [value(m) for m in a["movies"]] == [value(m) for m in b["movies"]]
        else:            # same movies, in file order
            assert all(_same_movie(x, y) for x, y in zip(a["movies"], b["movies"]))
            for key in ("Popularity", "Vote_Count"):
                assert a["max_val"][key] == b["max_val"][key]

    @pytest.mark.parametrize("dates", [(), ("1990", "2000"), ("2010", "2010"), ("1950", "1960")])
    def test_statistics(self, dates):
        pg, csv = _warehouse(), CsvStore()
        a, b = csv.statistics(dates), pg.statistics(dates)
        for block in ("stats_pop", "stats_vote_count", "stats_vote_avg"):
            for key in a[block]:
                assert math.isclose(a[block][key], b[block][key], rel_tol=1e-9, abs_tol=1e-9), (block, key)
        assert a["stats_countries"] == b["stats_countries"]
        assert a["stats_genre"] == b["stats_genre"]
        assert list(b["stats_genre"].values()) == sorted(b["stats_genre"].values(), reverse=True)

    def test_titles_are_searched_as_plain_text(self):
        pg = _warehouse()
        assert pg.query_movies(*args(title="(((")) ["total_movies"] == 0       # a regular expression would raise an error
        assert pg.query_movies(*args(title="%"))["total_movies"] < pg.total()   # % is not a wildcard

    def test_the_api_end_to_end(self, monkeypatch):
        pg = _warehouse()
        monkeypatch.setattr(backend_app, "_store", StoreSelector("postgres", postgres_store=pg))
        monkeypatch.setattr(backend_app, "_cache", ResponseCache())
        response = backend_app.app.test_client().get("/allmovies?start=0&end=20&genre=Drama&order_by=popularity&order_desc=desc")
        body = response.get_json()
        assert response.status_code == 201 and response.headers["X-Data-Source"] == "postgres"
        assert len(body["movies"]) == 20 and all("Drama" in m["Genre_List"] for m in body["movies"])
        assert body["movies"][0]["Release_Date"].endswith("GMT")               # same date format as with the CSV
