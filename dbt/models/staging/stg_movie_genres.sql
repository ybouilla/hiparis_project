-- One row per (movie, genre): the comma-separated `genre` column, split and de-duplicated.
select distinct
    m.movie_id,
    trim(g.genre_name) as genre_name
from {{ ref('stg_movies') }} as m
cross join lateral regexp_split_to_table(coalesce(m.genre, ''), ',') as g (genre_name)
where trim(g.genre_name) <> ''
  and lower(trim(g.genre_name)) <> 'nan'
