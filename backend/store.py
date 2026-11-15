"""Where the movies come from: movies.csv (pandas) or the PostgreSQL star schema (see dbt/).

Both stores answer the same two questions, with the same JSON-ready dictionaries, so the API
(backend/app.py), its caches and the React front end do not care which one is used:

    store.query_movies(n_start, n_end, title, genre, language, min_rate, dates, order_by, order_desc)
    store.statistics(dates)

Which store: the environment variable DATA_SOURCE.
    csv       (default) read movies.csv, as before. Needs nothing else.
    postgres  query the warehouse built by `etl/run.sh`; a database problem is an error (HTTP 503).
    auto      PostgreSQL when it is reachable and built, the CSV otherwise (and again PostgreSQL
              when it is back).
The database is reached through DATABASE_URL, or POSTGRES_HOST / _PORT / _USER / _PASSWORD / _DB.

Both stores follow the same rules, checked query by query by backend/tests/test_store.py:
the title is a plain, case-insensitive substring; a genre filter matches whole genre names (any
of them, case-insensitive); the genres of a movie keep the order of the CSV; movies with the same
sort value keep their file order.
"""
import functools
import logging
import os
import re
import threading
import time
from math import floor
from urllib.parse import quote

import pandas as pd

from backend.load_csv import MOVIE_FILE, load_csv

log = logging.getLogger(__name__)

SORTED_VALUES_AVAIL = {
    "popularity": "Popularity",
    "release_date": "Release_Date",
    "vote_count": "Vote_Count",
    "vote_average": "Vote_Average",
}


class DataSourceError(Exception):
    """The chosen data source cannot answer (database down, warehouse not built...)."""


def _year_range(dates):
    """["1990", "2000"] -> (1990, 2000), the end excluded; two equal years mean that one year."""
    low, high = dates[0], dates[1]
    if low == high:
        high = 1 + int(high)
    return int(low), int(high)


# --------------------------------------------------------------------------------------------
# movies.csv
# --------------------------------------------------------------------------------------------

class CsvStore:
    name = "csv"

    def version(self):
        """Identifies the content of movies.csv; part of every cache key."""
        try:
            stat = os.stat(MOVIE_FILE)
            return f"{stat.st_size}-{int(stat.st_mtime)}"
        except OSError:
            return "unknown"

    def total(self):
        return len(load_csv())

    @functools.cache
    def _dataset_info(self):
        """Constants of the (read-only) dataset: computed once per worker, not on every request."""
        df = load_csv()
        all_genres = sorted(
            df["Genre"]
            .dropna()
            .str.split(",")
            .explode()
            .str.strip()
            .unique()
        )
        return all_genres, df["Release_Date"].min().year

    def query_movies(self, n_start, n_end, title, genre, language, min_rate, dates, order_by, order_desc):
        """Filter, sort and paginate the movies. Arguments are hashable so results can be cached."""
        df = load_csv()
        all_genres, min_date = self._dataset_info()
        dates = list(dates)

        if title:
            # plain text, not a regular expression: "(" or "+" in a title must not break the search
            mask = df["Title"].str.contains(title, case=False, na=False, regex=False)
            df = df[mask]
        if len(genre) > 0:
            wanted = {g.lower() for g in genre}
            mask = df["Genre_List"].apply(lambda genres: any(g.lower() in wanted for g in genres))
            df = df[mask]
        if language:
            df = df[df["Original_Language"] == language]

        if floor(min_rate):
            df = df[df["Vote_Average"] >= min_rate]

        if len(dates) == 2:
            if dates[0] == dates[1]:
                dates[1] = 1 + int(dates[1])
            df = df[(df["Release_Date"].dt.year >= int(dates[0])) & (df["Release_Date"].dt.year < int(dates[1]))]

        total_movies = len(df)
        # from here; size of df is not changing

        if order_by is not None:
            if order_by not in SORTED_VALUES_AVAIL.keys():
                print("unknown key ", order_by)
            else:
                # stable: movies with the same value stay in file order, so two pages never overlap
                df = df.sort_values(SORTED_VALUES_AVAIL[order_by], ascending=order_desc == "asc", kind="stable")
        df = df.iloc[n_start:n_end]
        movies = df.to_dict(orient="records")
        # compute max (for chart only)
        popularity_max = df["Popularity"].max()
        popularity_max = 1 if pd.isna(popularity_max) else popularity_max

        vote_count_max = df["Vote_Count"].max()
        vote_count_max = 1 if pd.isna(vote_count_max) else vote_count_max

        vote_avg_max = df["Vote_Average"].max()
        vote_avg_max = 1 if pd.isna(vote_avg_max) else vote_avg_max
        max_val = {
            "Popularity": int(popularity_max),
            "Vote_Count": int(vote_count_max),
            "Vote_Average": float(vote_avg_max),
        }
        return {
            'message': 'ok',
            'movies': movies,
            'total_movies': total_movies,
            'all_genres': list(all_genres),
            'min_date': min_date,
            'max_val': max_val,
        }

    def statistics(self, dates):
        """Statistics for a release-year range (`dates` is a tuple, so results are cacheable)."""
        df = load_csv()
        dates = list(dates)

        if len(dates) == 2:
            if dates[0] == dates[1]:
                dates[1] = 1 + int(dates[1])
            df = df[(df["Release_Date"].dt.year >= int(dates[0])) & (df["Release_Date"].dt.year < int(dates[1]))]

        # min
        mins = [df["Popularity"].min(), df["Vote_Count"].min(), df["Vote_Average"].min()]
        # maxs
        maxs = [df["Popularity"].max(), df["Vote_Count"].max(), df["Vote_Average"].max()]

        # quartiles
        q_pop = df["Popularity"].quantile([0.25, 0.5, 0.75]).to_list()
        q_vote_count = df["Vote_Count"].quantile([0.25, 0.5, 0.75]).to_list()
        q_vote_avg = df["Vote_Average"].quantile([0.25, 0.5, 0.75]).to_list()

        # count by country
        countries_stats = {}
        for country in set(df["Original_Language"]):
            countries_stats[country] = len(df[df["Original_Language"] == country])
        # count by genre
        genre_stats = (
            df["Genre"]
            .str.split(",")
            .explode()
            .str.strip()
            .value_counts()
            .to_dict()
        )
        return _statistics_answer(mins, maxs, q_pop, q_vote_count, q_vote_avg, countries_stats, genre_stats)


def _statistics_answer(mins, maxs, q_pop, q_vote_count, q_vote_avg, countries, genres):
    """The /statistics answer, from the numbers both stores compute."""
    def block(index, quartiles):
        return {'min': int(mins[index]), 'q1': quartiles[0], 'q2': quartiles[1], 'q3': quartiles[2], 'max': int(maxs[index])}
    return {
        'message': 'ok',
        'stats_pop': block(0, q_pop),
        'stats_vote_count': block(1, q_vote_count),
        'stats_vote_avg': block(2, q_vote_avg),
        'stats_countries': countries,
        'stats_genre': genres,
    }


# --------------------------------------------------------------------------------------------
# PostgreSQL star schema
# --------------------------------------------------------------------------------------------

def database_url(env=os.environ):
    """$DATABASE_URL, else built from the POSTGRES_* variables (the ones docker compose and dbt use)."""
    if env.get("DATABASE_URL"):
        return env["DATABASE_URL"]
    return "postgresql://{user}:{password}@{host}:{port}/{db}".format(
        user=quote(env.get("POSTGRES_USER", "movies"), safe=""),
        password=quote(env.get("POSTGRES_PASSWORD", "movies"), safe=""),
        host=env.get("POSTGRES_HOST", "localhost"),
        port=env.get("POSTGRES_PORT", "5432"),
        db=env.get("POSTGRES_DB", "movies"),
    )


def escape_like(text):
    """A text to look for literally inside ILIKE '%...%'."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


_FROM = """
    FROM fact_movie f
    JOIN dim_movie m    ON m.movie_key = f.movie_key
    JOIN dim_date d     ON d.date_key = f.date_key
    JOIN dim_language l ON l.language_key = f.language_key"""

_SORT_COLUMNS = {"popularity": "f.popularity", "release_date": "d.full_date",
                 "vote_count": "f.vote_count", "vote_average": "f.vote_average"}

_GENRES_OF_MOVIE = """
    SELECT g.genre_name FROM bridge_movie_genre b JOIN dim_genre g ON g.genre_key = b.genre_key
    WHERE b.movie_key = f.movie_key AND g.genre_key <> 0
    ORDER BY b.genre_position"""

_CHECK_EVERY = 30.0   # seconds between two looks at the database for its version / size


class PostgresStore:
    name = "postgres"

    def __init__(self, url=None):
        self._url = url or database_url()
        self._local = threading.local()          # one connection per thread (gunicorn threads)
        self._info = None                        # (checked at, version, total, all genres, first year)
        self._lock = threading.Lock()

    # ---- connection ------------------------------------------------------------------------
    def _connection(self):
        import psycopg
        connection = getattr(self._local, "connection", None)
        if connection is None or connection.closed:
            connection = psycopg.connect(self._url, autocommit=True, connect_timeout=2,
                                         options="-c statement_timeout=10000")
            self._local.connection = connection
        return connection

    def _run(self, sql, params=()):
        """Rows of a query. One retry on a lost connection; any database problem -> DataSourceError."""
        import psycopg
        for attempt in (1, 2):
            try:
                with self._connection().cursor() as cursor:
                    cursor.execute(sql, params)
                    return cursor.fetchall()
            except (psycopg.OperationalError, psycopg.InterfaceError) as error:
                self._local.connection = None
                if attempt == 2:
                    raise DataSourceError(f"database unreachable: {error}") from error
            except psycopg.errors.UndefinedTable as error:
                raise DataSourceError("the warehouse is not built: run etl/run.sh") from error
            except psycopg.Error as error:
                raise DataSourceError(f"database error: {error}") from error

    # ---- what does not change between two loads of the data ----------------------------------
    def _dataset(self):
        """(version, total, all genres, first year), looked up again at most every 30 s."""
        with self._lock:
            if self._info and time.monotonic() - self._info[0] < _CHECK_EVERY:
                return self._info[1:]
        (version, total), = self._run("SELECT coalesce(max(loaded_at)::text, 'empty'), count(*) FROM raw.movies")
        if total == 0:
            raise DataSourceError("raw.movies is empty: run etl/run.sh")
        (built,), = self._run("SELECT count(*) FROM fact_movie")
        if built == 0:
            raise DataSourceError("the warehouse is empty: run etl/run.sh")
        genres = [row[0] for row in self._run(
            'SELECT genre_name FROM dim_genre WHERE genre_key <> 0 ORDER BY genre_name COLLATE "C"')]
        (first_year,), = self._run("SELECT min(year) FROM dim_date WHERE date_key <> 0")
        info = (re.sub(r"[^A-Za-z0-9]+", "-", version), built, genres, first_year)
        with self._lock:
            self._info = (time.monotonic(),) + info
        return info

    def version(self):
        return self._dataset()[0]

    def total(self):
        return self._dataset()[1]

    # ---- filters -----------------------------------------------------------------------------
    @staticmethod
    def _filters(title="", genre=(), language="", min_rate=0.0, dates=()):
        clauses, params = [], []
        if title:
            clauses.append("m.title ILIKE %s")
            params.append("%" + escape_like(title) + "%")
        if genre:
            clauses.append(f"EXISTS (SELECT 1 FROM bridge_movie_genre b JOIN dim_genre g ON g.genre_key = b.genre_key "
                           f"WHERE b.movie_key = f.movie_key AND lower(g.genre_name) = ANY(%s))")
            params.append([g.lower() for g in genre])
        if language:
            clauses.append("l.language_code = %s")
            params.append(language)
        if floor(min_rate):
            clauses.append("f.vote_average >= %s")
            params.append(min_rate)
        if len(dates) == 2:
            clauses.append("d.year >= %s AND d.year < %s")
            params.extend(_year_range(dates))
        return (" WHERE " + " AND ".join(clauses)) if clauses else "", params

    # ---- /allmovies --------------------------------------------------------------------------
    def query_movies(self, n_start, n_end, title, genre, language, min_rate, dates, order_by, order_desc):
        _, _, all_genres, min_date = self._dataset()
        where, params = self._filters(title, genre, language, min_rate, dates)

        (total_movies,), = self._run("SELECT count(*)" + _FROM + where, params)

        order = "f.movie_key"
        if order_by in _SORT_COLUMNS:
            direction = "ASC" if order_desc == "asc" else "DESC"    # same odd naming as the CSV store
            order = f"{_SORT_COLUMNS[order_by]} {direction} NULLS LAST, f.movie_key"
        elif order_by is not None:
            print("unknown key ", order_by)

        rows = self._run(
            "SELECT d.full_date, m.title, m.overview, f.popularity, f.vote_count, f.vote_average, "
            f"l.language_code, m.poster_url, ARRAY({_GENRES_OF_MOVIE})"
            + _FROM + where + f" ORDER BY {order} OFFSET %s LIMIT %s",
            params + [max(n_start, 0), max(n_end - n_start, 0)])

        movies = []
        for date, title_, overview, popularity, vote_count, vote_average, language_code, poster, genres in rows:
            movies.append({
                "Release_Date": date,
                "Title": title_,
                "Overview": overview,
                "Popularity": None if popularity is None else float(popularity),
                "Vote_Count": vote_count,
                "Vote_Average": None if vote_average is None else float(vote_average),
                "Original_Language": language_code,
                "Genre": ", ".join(genres),
                "Poster_Url": poster,
                "Genre_List": list(genres),
            })

        # maxima of the page, for the charts (same rule as the CSV store)
        def maximum(key, default=1):
            values = [m[key] for m in movies if m[key] is not None]
            return max(values) if values else default
        return {
            'message': 'ok',
            'movies': movies,
            'total_movies': total_movies,
            'all_genres': list(all_genres),
            'min_date': min_date,
            'max_val': {"Popularity": int(maximum("Popularity")), "Vote_Count": int(maximum("Vote_Count")),
                        "Vote_Average": float(maximum("Vote_Average"))},
        }

    # ---- /statistics -------------------------------------------------------------------------
    def statistics(self, dates):
        where, params = self._filters(dates=list(dates))
        measures = ("f.popularity::float8", "f.vote_count::float8", "f.vote_average::float8")
        columns = ", ".join(
            f"min({m}), max({m}), percentile_cont(ARRAY[0.25, 0.5, 0.75]) WITHIN GROUP (ORDER BY {m})" for m in measures)
        row, = self._run("SELECT " + columns + _FROM + where, params)
        mins, maxs, quartiles = row[0::3], row[1::3], row[2::3]
        zero = lambda value: 0 if value is None else value
        quartiles = [list(q) if q is not None else [None, None, None] for q in quartiles]

        countries = dict(self._run("SELECT l.language_code, count(*)" + _FROM + where + " GROUP BY 1", params))
        genres = dict(self._run(
            "SELECT g.genre_name, count(*)" + _FROM
            + " JOIN bridge_movie_genre b ON b.movie_key = f.movie_key"
            + " JOIN dim_genre g ON g.genre_key = b.genre_key AND g.genre_key <> 0"
            + where + " GROUP BY 1 ORDER BY 2 DESC, 1", params))
        return _statistics_answer([zero(v) for v in mins], [zero(v) for v in maxs], *quartiles, countries, genres)


# --------------------------------------------------------------------------------------------
# choosing the store
# --------------------------------------------------------------------------------------------

class StoreSelector:
    """What the API asks: which store answers this request, and what to do if it fails."""

    def __init__(self, mode, csv_store=None, postgres_store=None):
        if mode not in ("csv", "postgres", "auto"):
            raise ValueError(f"DATA_SOURCE must be csv, postgres or auto, not {mode!r}")
        self.mode = mode
        self.csv = csv_store or CsvStore()
        self.postgres = postgres_store if mode != "csv" else None
        if mode != "csv" and self.postgres is None:
            self.postgres = PostgresStore()
        self._down_until = 0.0

    def current(self):
        """The store for this request. In `auto` mode, the CSV while PostgreSQL is known to be down."""
        if self.mode == "csv":
            return self.csv
        if self.mode == "auto":
            if time.monotonic() < self._down_until:
                return self.csv
            try:
                self.postgres.version()
            except DataSourceError as error:
                self.failed(error)
                return self.csv
        return self.postgres

    def failed(self, error):
        """The current store failed: the CSV store to use instead (auto mode), or None (the error is final)."""
        if self.mode != "auto":
            return None
        self._down_until = time.monotonic() + _CHECK_EVERY
        log.warning("PostgreSQL not used for %.0f s (%s): answering from movies.csv", _CHECK_EVERY, error)
        return self.csv


def build_store(env=os.environ):
    return StoreSelector(env.get("DATA_SOURCE", "csv").strip().lower() or "csv")
