-- One row per (movie, genre): the comma-separated `genre` column, split and de-duplicated.
-- `position` is the place of the genre in the movie's own list (1, 2, 3...), so that the genres can be
-- given back in their original order: a bridge table alone would only be a set.
with split as (
    select
        m.movie_id,
        trim(g.genre_name) as genre_name,
        g.position         as raw_position
    from {{ ref('stg_movies') }} as m
    cross join lateral regexp_split_to_table(coalesce(m.genre, ''), ',') with ordinality as g (genre_name, position)
    where trim(g.genre_name) <> ''
      and lower(trim(g.genre_name)) <> 'nan'
),

first_seen as (
    -- a genre written twice keeps its first place
    select movie_id, genre_name, min(raw_position) as raw_position
    from split
    group by movie_id, genre_name
)

select
    movie_id,
    genre_name,
    -- 1, 2, 3... without the holes left by blank or repeated entries
    (row_number() over (partition by movie_id order by raw_position))::smallint as position
from first_seen
