-- One row per movie, lightly cleaned. No business logic here.
select
    movie_id,
    release_date,
    coalesce(trim(title), '')                                  as title,
    overview,
    popularity,
    vote_count,
    vote_average,
    coalesce(nullif(trim(original_language), ''), 'unknown')   as language_code,
    genre,
    poster_url
from {{ source('raw', 'movies') }}
