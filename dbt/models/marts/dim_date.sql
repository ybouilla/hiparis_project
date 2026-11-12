-- One row per release date present in the data, plus the "unknown" member (key 0).
with dates as (
    select distinct release_date as full_date
    from {{ ref('stg_movies') }}
    where release_date is not null
)

select
    to_char(full_date, 'YYYYMMDD')::integer                       as date_key,
    full_date,
    extract(year    from full_date)::smallint                     as year,
    extract(quarter from full_date)::smallint                     as quarter,
    extract(month   from full_date)::smallint                     as month,
    trim(to_char(full_date, 'Month'))                             as month_name,
    extract(day     from full_date)::smallint                     as day,
    extract(isodow  from full_date)::smallint                     as day_of_week,
    trim(to_char(full_date, 'Day'))                               as day_name,
    (extract(year from full_date)::integer / 10 * 10)::smallint   as decade
from dates

union all

select
    0,
    null::date,
    null::smallint,
    null::smallint,
    null::smallint,
    null::text,
    null::smallint,
    null::smallint,
    null::text,
    null::smallint
