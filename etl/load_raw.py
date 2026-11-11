"""Extract + Load: movies.csv -> raw.movies (PostgreSQL).

    python -m etl.load_raw                 # full refresh of raw.movies
    python -m etl.load_raw --dry-run       # parse the CSV only, no database
    python -m etl.load_raw --recreate      # drop and recreate raw.movies first

This is only the "EL" of the pipeline. The star schema (the "T") is built from raw.movies
by dbt, see ../dbt and etl/run.sh.

The CSV is parsed by backend.load_csv, which repairs the records that span several lines.
The table is emptied and refilled in ONE transaction: readers never see it half loaded, and
a failed run leaves the previous data in place.
"""
import argparse
import os
import sys
import time
from urllib.parse import quote

import pandas as pd

from backend.load_csv import load_csv

RAW_TABLE = "raw.movies"

COLUMNS = ["movie_id", "release_date", "title", "overview", "popularity", "vote_count",
           "vote_average", "original_language", "genre", "poster_url"]

DDL = """
CREATE SCHEMA IF NOT EXISTS raw;
CREATE TABLE IF NOT EXISTS raw.movies (
    movie_id           INTEGER PRIMARY KEY,   -- position in the CSV (1-based)
    release_date       DATE,
    title              TEXT,
    overview           TEXT,
    popularity         DOUBLE PRECISION,
    vote_count         INTEGER,
    vote_average       DOUBLE PRECISION,
    original_language  TEXT,
    genre              TEXT,                  -- comma-separated, as in the CSV
    poster_url         TEXT,
    loaded_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def extract() -> pd.DataFrame:
    return load_csv()


def to_raw(movies: pd.DataFrame) -> pd.DataFrame:
    """CSV columns -> raw table columns, plus a technical movie_id. The values stay as they are
    in the CSV: cleaning and modelling are dbt's job."""
    movies = movies.reset_index(drop=True)
    return pd.DataFrame({
        "movie_id": range(1, len(movies) + 1),
        "release_date": pd.to_datetime(movies["Release_Date"], errors="coerce").dt.date,
        "title": movies["Title"],
        "overview": movies["Overview"],
        "popularity": pd.to_numeric(movies["Popularity"], errors="coerce"),
        "vote_count": pd.to_numeric(movies["Vote_Count"], errors="coerce").astype("Int64"),
        "vote_average": pd.to_numeric(movies["Vote_Average"], errors="coerce"),
        "original_language": movies["Original_Language"],
        "genre": movies["Genre"],
        "poster_url": movies["Poster_Url"],
    })[COLUMNS]


def _rows(df: pd.DataFrame):
    """DataFrame -> tuples of plain Python values (NaN / NA / NaT -> None) for COPY."""
    for row in df.astype(object).itertuples(index=False, name=None):
        yield tuple(
            None if pd.isna(v) else (v.item() if hasattr(v, "item") else v)  # numpy scalar -> Python
            for v in row
        )


def default_database_url() -> str:
    """$DATABASE_URL, else built from the POSTGRES_* variables (the ones dbt and docker compose use)."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = os.environ.get
    return "postgresql://{user}:{password}@{host}:{port}/{db}".format(
        user=quote(env("POSTGRES_USER", "movies"), safe=""),
        password=quote(env("POSTGRES_PASSWORD", "movies"), safe=""),
        host=env("POSTGRES_HOST", "localhost"),
        port=env("POSTGRES_PORT", "5432"),
        db=env("POSTGRES_DB", "movies"),
    )


def connect(database_url: str, attempts: int = 30, delay: float = 2.0):
    """Connect, waiting for the database to accept connections (it may still be starting)."""
    import psycopg

    for attempt in range(1, attempts + 1):
        try:
            return psycopg.connect(database_url)
        except psycopg.OperationalError as error:
            if attempt == attempts:
                raise
            print(f"database not ready ({attempt}/{attempts}): {str(error).strip()[:100]}", flush=True)
            time.sleep(delay)


def load(database_url: str, raw: pd.DataFrame, recreate: bool = False) -> int:
    """Replace the content of raw.movies by `raw`, atomically. Returns the row count."""
    with connect(database_url) as conn:      # leaving the block commits; an exception rolls back
        with conn.cursor() as cur:
            if recreate:
                cur.execute(f"DROP TABLE IF EXISTS {RAW_TABLE} CASCADE")
            cur.execute(DDL)
            cur.execute(f"TRUNCATE {RAW_TABLE}")
            with cur.copy(f"COPY {RAW_TABLE} ({', '.join(COLUMNS)}) FROM STDIN") as copy:
                for row in _rows(raw):
                    copy.write_row(row)
            cur.execute(f"SELECT count(*) FROM {RAW_TABLE}")
            count = cur.fetchone()[0]
            if count != len(raw):
                raise RuntimeError(f"loaded {count} rows, expected {len(raw)}")
            cur.execute(f"ANALYZE {RAW_TABLE}")
    return count


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Load movies.csv into raw.movies (PostgreSQL).")
    parser.add_argument("--database-url", default=None,
                        help="default: $DATABASE_URL, else built from the POSTGRES_* variables")
    parser.add_argument("--dry-run", action="store_true", help="parse the CSV only, do not touch the database")
    parser.add_argument("--recreate", action="store_true", help="drop and recreate raw.movies first")
    args = parser.parse_args(argv)

    started = time.perf_counter()
    raw = to_raw(extract())
    print(f"extracted {len(raw)} movies", flush=True)
    if args.dry_run:
        print("dry run: database not touched")
        return 0

    count = load(args.database_url or default_database_url(), raw, recreate=args.recreate)
    print(f"loaded {count} rows into {RAW_TABLE} in {time.perf_counter() - started:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
