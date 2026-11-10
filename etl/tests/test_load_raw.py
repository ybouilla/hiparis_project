"""Tests of the extract + load step (the transformation is tested by dbt, see dbt/tests).

The load test runs only when TEST_DATABASE_URL points to a PostgreSQL database that may be
overwritten, e.g.
    TEST_DATABASE_URL=postgresql://movies:movies@localhost:5432/movies pytest etl/tests
"""
import os

import numpy as np
import pandas as pd
import pytest

from backend.load_csv import load_csv
from etl.load_raw import COLUMNS, _rows, default_database_url, load, to_raw


def _movies():
    return pd.DataFrame({
        "Release_Date": pd.to_datetime(["2021-12-15", None]),
        "Title": ["Spider-Man: No Way Home", "Mystery"],
        "Overview": ["a", None],
        "Popularity": [5083.954, np.nan],
        "Vote_Count": pd.array([8940, None], dtype="Int64"),
        "Vote_Average": [8.3, np.nan],
        "Original_Language": ["en", "fr"],
        "Genre": ["Action, Adventure", None],
        "Poster_Url": ["u1", None],
    })


def test_to_raw_adds_an_id_and_keeps_the_values():
    raw = to_raw(_movies())
    assert list(raw.columns) == COLUMNS
    assert list(raw["movie_id"]) == [1, 2]
    assert raw.loc[0, "title"] == "Spider-Man: No Way Home"
    assert raw.loc[0, "genre"] == "Action, Adventure"          # not split or cleaned here: that is dbt's job
    assert str(raw.loc[0, "release_date"]) == "2021-12-15"


def test_missing_values_become_none():
    row = list(_rows(to_raw(_movies())))[1]
    assert row[1:] == (None, "Mystery", None, None, None, None, "fr", None, None)


def test_rows_are_plain_python_values():
    # psycopg cannot adapt numpy scalars
    for value in list(_rows(to_raw(_movies())))[0]:
        assert type(value).__module__ != "numpy"


def test_real_csv():
    movies = load_csv()
    raw = to_raw(movies)
    assert len(raw) == len(movies)
    assert raw["movie_id"].is_unique and raw["movie_id"].min() == 1 and raw["movie_id"].max() == len(movies)


def test_database_url_is_built_from_the_postgres_variables(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.delenv("POSTGRES_PORT", raising=False)         # whatever the developer has exported
    monkeypatch.setenv("POSTGRES_USER", "me")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss/word")      # special characters must be escaped
    monkeypatch.setenv("POSTGRES_DB", "warehouse")
    assert default_database_url() == "postgresql://me:p%40ss%2Fword@db:5432/warehouse"
    monkeypatch.setenv("DATABASE_URL", "postgresql://explicit")
    assert default_database_url() == "postgresql://explicit"


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not set")
def test_load_is_repeatable_and_atomic():
    import psycopg

    url = os.environ["TEST_DATABASE_URL"]
    raw = to_raw(load_csv())
    assert load(url, raw, recreate=True) == len(raw)
    assert load(url, raw) == len(raw)                          # a second run must not duplicate anything

    broken = raw.copy()
    broken.loc[1, "movie_id"] = broken.loc[0, "movie_id"]       # duplicate primary key, fails during COPY
    with pytest.raises(psycopg.errors.UniqueViolation):
        load(url, broken)
    with psycopg.connect(url) as conn:                         # the failed run left the previous data in place
        assert conn.execute("SELECT count(*) FROM raw.movies").fetchone()[0] == len(raw)
