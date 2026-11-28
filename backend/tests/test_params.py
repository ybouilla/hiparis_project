"""Query parameters: bad values get a 400 with a message, and pages have a maximum size."""
import pytest

from backend import app as backend_app
from backend.cache import ResponseCache
from backend.params import MAX_PAGE_SIZE


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(backend_app, "_cache", ResponseCache())
    with backend_app.app.test_client() as client:
        yield client


@pytest.mark.parametrize("query, parameter", [
    ("start=abc", "start"), ("start=-5&end=10", "start"), ("start=1.5", "start"), ("start=" + "9" * 5000, "start"),
    ("end=abc", "end"), ("start=10&end=5", "end"), (f"start=0&end={MAX_PAGE_SIZE + 1}", "end"), ("end=999999999", "end"),
    ("score=abc", "score"), ("score=nan", "score"), ("score=inf", "score"), ("score=-1", "score"), ("score=11", "score"),
    ("dates=1990", "dates"), ("dates=abc&dates=2000", "dates"), ("dates=2000&dates=1990", "dates"),
    ("dates=1990&dates=2000&dates=2010", "dates"), ("dates=1&dates=99999999999999999999", "dates"),
    ("title=" + "a" * 201, "title"), ("title=a%00b", "title"),
    ("genre=" + "a" * 51, "genre"), ("&".join(["genre=Drama"] * 31), "genres"), ("genre=%00", "genre"),
    ("lang=en%27%3B--", "lang"), ("order_by=nope", "order_by"), ("order_desc=up", "order_desc"),
])
def test_bad_values_are_refused_with_a_message(client, query, parameter):
    response = client.get("/allmovies?" + query)
    assert response.status_code == 400
    assert parameter in response.get_json()["message"]


@pytest.mark.parametrize("query", ["dates=abc&dates=def", "dates=1990", "dates=2000&dates=1990"])
def test_statistics_refuses_bad_dates(client, query):
    response = client.get("/statistics?" + query)
    assert response.status_code == 400 and "dates" in response.get_json()["message"]


@pytest.mark.parametrize("query", [
    # what the front end sends before the user chose anything
    "start=0&end=20&title=&lang=&score=0&dates=1900&dates=2026&order_by=&order_desc=desc",
    "start=20&end=40&title=%28%28%28&genre=Drama&genre=Science+Fiction&lang=ja&score=7.5&order_by=vote_count",
    "start=0&end=500&dates=2010&dates=2010",     # the statistics page; one single year
    "start=1000000",                             # past the last movie: an empty page
    "unknown=1",                                 # ignored
])
def test_normal_queries_are_accepted(client, query):
    assert client.get("/allmovies?" + query).status_code == 201


def test_a_page_never_exceeds_the_maximum(client):
    for url in ("/allmovies", "/allmovies?start=100"):
        body = client.get(url).get_json()
        assert len(body["movies"]) == MAX_PAGE_SIZE < body["total_movies"]


def test_a_genre_filter_on_an_empty_result_is_not_a_crash(client):
    response = client.get("/allmovies?title=zzzzzzzz&genre=Drama&lang=ja&score=7&order_by=popularity")
    assert response.status_code == 201
    assert response.get_json()["movies"] == [] and response.get_json()["total_movies"] == 0
