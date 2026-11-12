-- Fails (returns a row) if the fact table does not have exactly one row per raw movie.
select
    (select count(*) from {{ source('raw', 'movies') }}) as raw_rows,
    (select count(*) from {{ ref('fact_movie') }})       as fact_rows
where (select count(*) from {{ source('raw', 'movies') }})
   <> (select count(*) from {{ ref('fact_movie') }})
