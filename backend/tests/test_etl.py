"""Tests of the CSV -> PostgreSQL pipeline.

The transform/validate tests need no database. The load test runs only when
TEST_DATABASE_URL points to a PostgreSQL database that may be overwritten, e.g.
    TEST_DATABASE_URL=postgresql://movies:movies@localhost:5432/movies pytest backend/tests/test_etl.py
"""
import os

import numpy as np
import pandas as pd
import pytest

from backend.load_csv import load_csv
from etl.load_movies import UNKNOWN_GENRE_NAME, load, transform, validate


def _movies():
    return pd.DataFrame({
        "Release_Date": pd.to_datetime(["2021-12-15", "2019-06-28", None]),
        "Title": ["Spider-Man: No Way Home", "  Far From Home ", "Mystery"],
        "Overview": ["a", None, "c"],
        "Popularity": [5083.954, 224.4, np.nan],
        "Vote_Count": pd.array([8940, 12176, None], dtype="Int64"),
        "Vote_Average": [8.3, 7.5, np.nan],
        "Original_Language": ["en", "fr", " "],
        "Genre": ["Action, Adventure, Action", "Action", None],   # duplicate / single / missing
        "Poster_Url": ["u1", "u2", None],
    })


class TestTransform:
    def test_tables_and_keys(self):
        t = transform(_movies())
        assert list(t["fact_movie"]["movie_key"]) == [1, 2, 3]
        assert len(t["dim_movie"]) == 3

    def test_date_dimension(self):
        t = transform(_movies())
        dim = t["dim_date"].set_index("date_key")
        assert list(t["fact_movie"]["date_key"]) == [20211215, 20190628, 0]   # missing date -> unknown member
        row = dim.loc[20211215]
        assert (row.year, row.quarter, row.month, row.day, row.decade) == (2021, 4, 12, 15, 2020)
        assert row.day_name == "Wednesday" and row.day_of_week == 3
        assert pd.isna(dim.loc[0, "full_date"])

    def test_language_dimension(self):
        t = transform(_movies())
        names = dict(zip(t["dim_language"]["language_code"], t["dim_language"]["language_name"]))
        assert names == {"unknown": "Unknown", "en": "English", "fr": "French"}
        assert list(t["fact_movie"]["language_key"])[2] == 0                  # blank language -> unknown

    def test_genres_are_deduplicated_and_bridged(self):
        t = transform(_movies())
        genre = dict(zip(t["dim_genre"]["genre_name"], t["dim_genre"]["genre_key"]))
        bridge = t["bridge_movie_genre"]
        by_movie = {m: sorted(g) for m, g in bridge.groupby("movie_key")["genre_key"]}
        assert by_movie[1] == sorted([genre["Action"], genre["Adventure"]])
        assert by_movie[2] == [genre["Action"]]
        assert by_movie[3] == [genre[UNKNOWN_GENRE_NAME]]                    # no genre -> unknown member

    def test_measures_keep_missing_values(self):
        fact = transform(_movies())["fact_movie"]
        assert fact.loc[0, "popularity"] == pytest.approx(5083.954)
        assert pd.isna(fact.loc[2, "popularity"]) and pd.isna(fact.loc[2, "vote_count"])

    def test_text_is_stripped(self):
        assert transform(_movies())["dim_movie"].loc[1, "title"] == "Far From Home"


class TestValidate:
    def test_accepts_consistent_tables(self):
        validate(transform(_movies()))

    def test_rejects_orphan_foreign_key(self):
        t = transform(_movies())
        t["fact_movie"].loc[0, "language_key"] = 999
        with pytest.raises(ValueError, match="language_key"):
            validate(t)

    def test_rejects_duplicate_keys(self):
        t = transform(_movies())
        t["dim_genre"] = pd.concat([t["dim_genre"], t["dim_genre"].iloc[[1]]], ignore_index=True)
        with pytest.raises(ValueError, match="duplicates"):
            validate(t)


def test_real_csv_is_fully_transformed():
    movies = load_csv()
    t = transform(movies)
    validate(t)
    assert len(t["fact_movie"]) == len(t["dim_movie"]) == len(movies)
    assert t["bridge_movie_genre"]["movie_key"].nunique() == len(movies)      # every movie has a genre row


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not set")
def test_load_into_postgres_is_repeatable():
    import psycopg

    url = os.environ["TEST_DATABASE_URL"]
    tables = transform(load_csv())
    first = load(url, tables, recreate=True)
    second = load(url, tables)                                                # a second run must not duplicate anything
    assert first == second == {name: len(df) for name, df in tables.items()}

    with psycopg.connect(url) as conn:
        assert conn.execute("SELECT count(*) FROM vw_movies").fetchone()[0] == len(tables["dim_movie"])
