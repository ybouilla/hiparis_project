{{ config(materialized='view') }}

-- One row per movie with the same columns as the original CSV (genres joined back into a string).
-- Handy for checking the load and for switching an application over to SQL.
select
    m.movie_key,
    d.full_date                     as release_date,
    m.title,
    m.overview,
    f.popularity,
    f.vote_count,
    f.vote_average,
    l.language_code                 as original_language,
    (
        select string_agg(g.genre_name, ', ' order by g.genre_name)
        from {{ ref('bridge_movie_genre') }} as b
        join {{ ref('dim_genre') }} as g on g.genre_key = b.genre_key
        where b.movie_key = m.movie_key
    )                               as genre,
    m.poster_url
from {{ ref('fact_movie') }} as f
join {{ ref('dim_movie') }}    as m on m.movie_key    = f.movie_key
join {{ ref('dim_date') }}     as d on d.date_key     = f.date_key
join {{ ref('dim_language') }} as l on l.language_key = f.language_key
