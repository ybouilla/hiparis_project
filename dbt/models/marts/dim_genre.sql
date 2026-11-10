-- One row per genre, plus the "unknown" member (key 0) used by movies without any genre.
select
    row_number() over (order by genre_name)::smallint as genre_key,
    genre_name
from (select distinct genre_name from {{ ref('stg_movie_genres') }}) as genres

union all

select 0::smallint, 'Unknown'
