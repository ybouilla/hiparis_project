-- Fails (returns rows) for release dates before cinema existed or far in the future.
select date_key, full_date
from {{ ref('dim_date') }}
where full_date is not null
  and (full_date < date '1880-01-01' or full_date > current_date + interval '5 years')
