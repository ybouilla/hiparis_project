-- Star schema for the movie dataset.
--
-- Grain of the fact table: one row per movie.
--
--                      dim_date
--                         |
--   dim_movie ---- fact_movie ---- dim_language
--                         |
--               bridge_movie_genre ---- dim_genre
--
-- * Measures (fact_movie): popularity, vote_count, vote_average.
-- * Genre is multi-valued (a movie has 1..n genres), so it hangs off the fact through a
--   bridge table. Count movies by genre; do NOT sum the measures across genres without
--   thinking about it (a movie with 3 genres appears 3 times).
-- * dim_movie keeps the long text columns (title, overview, poster) out of the fact table
--   so that scans over the measures stay narrow.
-- * Surrogate keys are assigned by the pipeline. Key 0 is the "unknown" member of
--   dim_date / dim_language / dim_genre, so foreign keys are never NULL.
--
-- Safe to run repeatedly (CREATE ... IF NOT EXISTS); the pipeline empties the tables
-- before reloading them. To change the schema, run the pipeline with --recreate.

CREATE TABLE IF NOT EXISTS dim_date (
    date_key     INTEGER  PRIMARY KEY,           -- yyyymmdd, 0 = unknown
    full_date    DATE     UNIQUE,
    year         SMALLINT,
    quarter      SMALLINT,
    month        SMALLINT,
    month_name   TEXT,
    day          SMALLINT,
    day_of_week  SMALLINT,                       -- ISO: 1 = Monday ... 7 = Sunday
    day_name     TEXT,
    decade       SMALLINT                        -- 1990 for 1990-1999
);

CREATE TABLE IF NOT EXISTS dim_language (
    language_key   SMALLINT PRIMARY KEY,         -- 0 = unknown
    language_code  TEXT NOT NULL UNIQUE,         -- as in the CSV ("en", "ja", ...)
    language_name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_genre (
    genre_key   SMALLINT PRIMARY KEY,            -- 0 = unknown
    genre_name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS dim_movie (
    movie_key   INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    overview    TEXT,
    poster_url  TEXT
);

CREATE TABLE IF NOT EXISTS fact_movie (
    movie_key      INTEGER  PRIMARY KEY REFERENCES dim_movie (movie_key),
    date_key       INTEGER  NOT NULL REFERENCES dim_date (date_key),
    language_key   SMALLINT NOT NULL REFERENCES dim_language (language_key),
    popularity     NUMERIC(10, 3),
    vote_count     INTEGER CHECK (vote_count >= 0),
    vote_average   NUMERIC(3, 1) CHECK (vote_average BETWEEN 0 AND 10)
);
CREATE INDEX IF NOT EXISTS ix_fact_movie_date     ON fact_movie (date_key);
CREATE INDEX IF NOT EXISTS ix_fact_movie_language ON fact_movie (language_key);

CREATE TABLE IF NOT EXISTS bridge_movie_genre (
    movie_key  INTEGER  NOT NULL REFERENCES fact_movie (movie_key),
    genre_key  SMALLINT NOT NULL REFERENCES dim_genre (genre_key),
    PRIMARY KEY (movie_key, genre_key)
);
CREATE INDEX IF NOT EXISTS ix_bridge_movie_genre_genre ON bridge_movie_genre (genre_key);

-- One row per movie with the same columns as the original CSV (genres joined back into
-- a string). Handy for checking the load and for switching an application over to SQL.
CREATE OR REPLACE VIEW vw_movies AS
SELECT
    m.movie_key,
    d.full_date    AS release_date,
    m.title,
    m.overview,
    f.popularity,
    f.vote_count,
    f.vote_average,
    l.language_code AS original_language,
    (SELECT string_agg(g.genre_name, ', ' ORDER BY g.genre_name)
       FROM bridge_movie_genre b
       JOIN dim_genre g ON g.genre_key = b.genre_key
      WHERE b.movie_key = m.movie_key) AS genre,
    m.poster_url
FROM fact_movie f
JOIN dim_movie    m ON m.movie_key    = f.movie_key
JOIN dim_date     d ON d.date_key     = f.date_key
JOIN dim_language l ON l.language_key = f.language_key;
