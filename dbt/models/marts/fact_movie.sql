-- Grain: one row per movie.
select
    m.movie_id                                                    as movie_key,
    coalesce(to_char(m.release_date, 'YYYYMMDD')::integer, 0)     as date_key,
    l.language_key                                                as language_key,
    m.popularity::numeric(10, 3)                                  as popularity,
    m.vote_count::integer                                         as vote_count,
    m.vote_average::numeric(3, 1)                                 as vote_average
from {{ ref('stg_movies') }} as m
join {{ ref('dim_language') }} as l on l.language_code = m.language_code
