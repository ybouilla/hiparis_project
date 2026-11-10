-- One row per language code, plus the "unknown" member (key 0).
-- Names come from the `language_names` seed; a code without a name keeps the code.
with codes as (
    select distinct language_code
    from {{ ref('stg_movies') }}
    where language_code <> 'unknown'
),

numbered as (
    select
        row_number() over (order by language_code)::smallint as language_key,
        language_code
    from codes
)

select
    n.language_key,
    n.language_code,
    coalesce(s.language_name, n.language_code) as language_name
from numbered as n
left join {{ ref('language_names') }} as s on s.language_code = n.language_code

union all

select 0::smallint, 'unknown', 'Unknown'
