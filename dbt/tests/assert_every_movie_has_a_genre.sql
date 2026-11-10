-- Fails (returns rows) for movies without any row in the genre bridge.
select f.movie_key
from {{ ref('fact_movie') }} as f
left join {{ ref('bridge_movie_genre') }} as b on b.movie_key = f.movie_key
where b.movie_key is null
