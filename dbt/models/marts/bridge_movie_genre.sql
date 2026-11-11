-- A movie has 1..n genres. A movie without any genre points to the "unknown" genre (key 0),
-- so every movie has at least one row here.
select
    m.movie_id                       as movie_key,
    coalesce(g.genre_key, 0)::smallint as genre_key
from {{ ref('stg_movies') }} as m
left join {{ ref('stg_movie_genres') }} as mg on mg.movie_id = m.movie_id
left join {{ ref('dim_genre') }} as g on g.genre_name = mg.genre_name
