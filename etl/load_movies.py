"""Pipeline: movies.csv -> PostgreSQL star schema (see schema.sql).

    python -m etl.load_movies                      # full refresh using $DATABASE_URL
    python -m etl.load_movies --dry-run            # extract + transform + validate, no database
    python -m etl.load_movies --recreate           # drop and recreate the tables first

Steps: extract (backend.load_csv, which also repairs the CSV's multi-line rows),
transform (pure pandas, no I/O), validate, then load everything in ONE transaction:
the tables are emptied and refilled, so readers never see a half-loaded warehouse and
a failure leaves the previous data untouched. Running it twice gives the same result.
"""
import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd

from backend.load_csv import load_csv

SCHEMA_FILE = Path(__file__).with_name("schema.sql")
DEFAULT_DATABASE_URL = "postgresql://movies:movies@localhost:5432/movies"

# English names for the language codes of the dataset (TMDB codes: "cn" = Cantonese).
# A code that is not listed here simply keeps the code as its name.
LANGUAGE_NAMES = {
    "ar": "Arabic", "bn": "Bengali", "ca": "Catalan", "cn": "Cantonese", "cs": "Czech",
    "da": "Danish", "de": "German", "el": "Greek", "en": "English", "es": "Spanish",
    "et": "Estonian", "eu": "Basque", "fa": "Persian", "fi": "Finnish", "fr": "French",
    "he": "Hebrew", "hi": "Hindi", "hu": "Hungarian", "id": "Indonesian", "is": "Icelandic",
    "it": "Italian", "ja": "Japanese", "ko": "Korean", "la": "Latin", "lv": "Latvian",
    "ml": "Malayalam", "ms": "Malay", "nb": "Norwegian Bokmål", "nl": "Dutch", "no": "Norwegian",
    "pl": "Polish", "pt": "Portuguese", "ro": "Romanian", "ru": "Russian", "sr": "Serbian",
    "sv": "Swedish", "ta": "Tamil", "te": "Telugu", "th": "Thai", "tl": "Tagalog",
    "tr": "Turkish", "uk": "Ukrainian", "xx": "No language", "zh": "Chinese (Mandarin)",
}

UNKNOWN_KEY = 0
UNKNOWN_LANGUAGE_CODE = "unknown"
UNKNOWN_GENRE_NAME = "Unknown"

# Load order = dependency order (dimensions first); also the column order of each COPY.
TABLE_COLUMNS = {
    "dim_date": ["date_key", "full_date", "year", "quarter", "month", "month_name",
                 "day", "day_of_week", "day_name", "decade"],
    "dim_language": ["language_key", "language_code", "language_name"],
    "dim_genre": ["genre_key", "genre_name"],
    "dim_movie": ["movie_key", "title", "overview", "poster_url"],
    "fact_movie": ["movie_key", "date_key", "language_key", "popularity", "vote_count", "vote_average"],
    "bridge_movie_genre": ["movie_key", "genre_key"],
}


# --------------------------------------------------------------------------- extract

def extract() -> pd.DataFrame:
    return load_csv()


# ------------------------------------------------------------------------- transform

def _clean_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip()


def _build_dim_date(dates: pd.Series) -> pd.DataFrame:
    distinct = pd.Series(pd.to_datetime(dates.dropna().unique())).sort_values()
    dim = pd.DataFrame({
        "date_key": distinct.dt.year * 10000 + distinct.dt.month * 100 + distinct.dt.day,
        "full_date": distinct.dt.date,
        "year": distinct.dt.year,
        "quarter": distinct.dt.quarter,
        "month": distinct.dt.month,
        "month_name": distinct.dt.month_name(),
        "day": distinct.dt.day,
        "day_of_week": distinct.dt.dayofweek + 1,
        "day_name": distinct.dt.day_name(),
        "decade": distinct.dt.year // 10 * 10,
    })
    unknown = pd.DataFrame([{c: None for c in dim.columns} | {"date_key": UNKNOWN_KEY}])
    return pd.concat([unknown, dim], ignore_index=True)


def transform(movies: pd.DataFrame) -> dict:
    """Turn the flat movies table into the star-schema tables (a dict of DataFrames)."""
    movies = movies.reset_index(drop=True)
    movie_key = pd.Series(range(1, len(movies) + 1), name="movie_key")

    # --- dim_date
    dates = pd.to_datetime(movies["Release_Date"], errors="coerce")
    dim_date = _build_dim_date(dates)
    date_key = (dates.dt.year * 10000 + dates.dt.month * 100 + dates.dt.day).fillna(UNKNOWN_KEY).astype(int)

    # --- dim_language
    codes = _clean_text(movies["Original_Language"]).replace("", UNKNOWN_LANGUAGE_CODE)
    real_codes = sorted(set(codes) - {UNKNOWN_LANGUAGE_CODE})
    dim_language = pd.DataFrame({
        "language_key": [UNKNOWN_KEY] + list(range(1, len(real_codes) + 1)),
        "language_code": [UNKNOWN_LANGUAGE_CODE] + real_codes,
    })
    dim_language["language_name"] = [
        "Unknown" if c == UNKNOWN_LANGUAGE_CODE else LANGUAGE_NAMES.get(c, c)
        for c in dim_language["language_code"]
    ]
    language_key = codes.map(dict(zip(dim_language["language_code"], dim_language["language_key"])))

    # --- dim_genre + bridge (a movie has 1..n genres; none -> the "Unknown" genre)
    genre_lists = movies["Genre"].fillna("").astype(str).str.split(",").apply(
        lambda names: sorted({n.strip() for n in names if n.strip() and n.strip().lower() != "nan"})
    )
    real_genres = sorted({g for names in genre_lists for g in names})
    dim_genre = pd.DataFrame({
        "genre_key": [UNKNOWN_KEY] + list(range(1, len(real_genres) + 1)),
        "genre_name": [UNKNOWN_GENRE_NAME] + real_genres,
    })
    genre_key = dict(zip(dim_genre["genre_name"], dim_genre["genre_key"]))
    bridge = pd.DataFrame(
        [(mk, genre_key[g]) for mk, names in zip(movie_key, genre_lists) for g in (names or [UNKNOWN_GENRE_NAME])],
        columns=["movie_key", "genre_key"],
    )

    # --- dim_movie / fact_movie
    dim_movie = pd.DataFrame({
        "movie_key": movie_key,
        "title": _clean_text(movies["Title"]),
        "overview": movies["Overview"],
        "poster_url": movies["Poster_Url"],
    })
    fact_movie = pd.DataFrame({
        "movie_key": movie_key,
        "date_key": date_key,
        "language_key": language_key,
        "popularity": pd.to_numeric(movies["Popularity"], errors="coerce"),
        "vote_count": pd.to_numeric(movies["Vote_Count"], errors="coerce").astype("Int64"),
        "vote_average": pd.to_numeric(movies["Vote_Average"], errors="coerce"),
    })

    return {
        "dim_date": dim_date,
        "dim_language": dim_language,
        "dim_genre": dim_genre,
        "dim_movie": dim_movie,
        "fact_movie": fact_movie,
        "bridge_movie_genre": bridge,
    }


def validate(tables: dict) -> None:
    """Fail before touching the database if the transformed data is inconsistent."""
    problems = []
    keys = {"dim_date": "date_key", "dim_language": "language_key", "dim_genre": "genre_key",
            "dim_movie": "movie_key", "fact_movie": "movie_key"}
    for table, key in keys.items():
        if tables[table][key].duplicated().any():
            problems.append(f"{table}.{key} has duplicates")
    if tables["bridge_movie_genre"].duplicated().any():
        problems.append("bridge_movie_genre has duplicate (movie, genre) pairs")

    fact = tables["fact_movie"]
    foreign_keys = [
        (fact["date_key"], tables["dim_date"]["date_key"], "fact_movie.date_key"),
        (fact["language_key"], tables["dim_language"]["language_key"], "fact_movie.language_key"),
        (fact["movie_key"], tables["dim_movie"]["movie_key"], "fact_movie.movie_key"),
        (tables["bridge_movie_genre"]["movie_key"], fact["movie_key"], "bridge_movie_genre.movie_key"),
        (tables["bridge_movie_genre"]["genre_key"], tables["dim_genre"]["genre_key"], "bridge_movie_genre.genre_key"),
    ]
    for child, parent, name in foreign_keys:
        orphans = (~child.isin(parent)).sum()
        if orphans:
            problems.append(f"{name}: {orphans} value(s) missing from the parent table")
    if set(tables["bridge_movie_genre"]["movie_key"]) != set(fact["movie_key"]):
        problems.append("some movies have no genre row in bridge_movie_genre")
    if problems:
        raise ValueError("invalid transformed data: " + "; ".join(problems))


# ---------------------------------------------------------------------------- load

def _rows(df: pd.DataFrame):
    """DataFrame -> tuples of plain Python values (NaN / NA / NaT -> None) for COPY."""
    for row in df.astype(object).itertuples(index=False, name=None):
        yield tuple(
            None if pd.isna(v) else (v.item() if hasattr(v, "item") else v)  # numpy scalar -> Python
            for v in row
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


def load(database_url: str, tables: dict, recreate: bool = False) -> dict:
    """Replace the content of the warehouse by `tables`, atomically. Returns the row counts."""
    with connect(database_url) as conn:      # leaving the block commits; an exception rolls back
        with conn.cursor() as cur:
            if recreate:
                cur.execute("DROP VIEW IF EXISTS vw_movies")
                cur.execute("DROP TABLE IF EXISTS " + ", ".join(reversed(TABLE_COLUMNS)) + " CASCADE")
            cur.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
            cur.execute("TRUNCATE " + ", ".join(TABLE_COLUMNS))

            for table, columns in TABLE_COLUMNS.items():
                with cur.copy(f"COPY {table} ({', '.join(columns)}) FROM STDIN") as copy:
                    for row in _rows(tables[table][columns]):
                        copy.write_row(row)

            counts = {}
            for table in TABLE_COLUMNS:
                cur.execute(f"SELECT count(*) FROM {table}")
                counts[table] = cur.fetchone()[0]
                if counts[table] != len(tables[table]):
                    raise RuntimeError(f"{table}: loaded {counts[table]} rows, expected {len(tables[table])}")
            cur.execute("ANALYZE")           # fresh planner statistics for the new data
    return counts


# ----------------------------------------------------------------------------- CLI

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Load movies.csv into the PostgreSQL star schema.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
                        help="default: $DATABASE_URL, else %(default)s")
    parser.add_argument("--dry-run", action="store_true", help="extract, transform and validate only")
    parser.add_argument("--recreate", action="store_true", help="drop and recreate the tables first")
    args = parser.parse_args(argv)

    started = time.perf_counter()
    movies = extract()
    print(f"extracted {len(movies)} movies", flush=True)
    tables = transform(movies)
    validate(tables)
    print("transformed: " + ", ".join(f"{name}={len(df)}" for name, df in tables.items()), flush=True)

    if args.dry_run:
        print("dry run: database not touched")
        return 0

    counts = load(args.database_url, tables, recreate=args.recreate)
    print("loaded: " + ", ".join(f"{name}={n}" for name, n in counts.items())
          + f" in {time.perf_counter() - started:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
