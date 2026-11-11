#!/bin/sh
# Full pipeline, run from the repository root (or /app in the image):
#   1. Extract + Load: movies.csv -> raw.movies           (python)
#   2. Transform + test: raw.movies -> star schema         (dbt: seeds, models, tests, in order)
# Extra arguments go to the loader, e.g. `sh etl/run.sh --recreate`.
set -e

python -m etl.load_raw "$@"
dbt build --project-dir dbt --profiles-dir dbt
