{{ config(severity='warn') }}

-- Warns (does not fail) about language codes missing from the language_names seed.
select language_code
from {{ ref('dim_language') }}
where language_key <> 0
  and language_name = language_code
