-- Descriptive (text) attributes of a movie, kept out of the fact table.
select
    movie_id as movie_key,
    title,
    overview,
    poster_url
from {{ ref('stg_movies') }}
