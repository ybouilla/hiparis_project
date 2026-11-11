# Image of the CSV -> PostgreSQL pipeline (python loader + dbt). Built from the repository root:
#   docker build -f etl/Dockerfile -t movie-explorer-etl .
# Separate from the web image so that dbt does not end up in the app.
FROM python:3.12-slim

WORKDIR /app

COPY etl/requirements.txt etl/requirements.txt
RUN pip install --no-cache-dir -r etl/requirements.txt

# only what the loader needs from the backend: the CSV parser and the CSV
COPY backend/__init__.py backend/load_csv.py backend/movies.csv ./backend/
COPY etl/ ./etl/
COPY dbt/ ./dbt/

ENV PYTHONPATH=/app \
    DBT_SEND_ANONYMOUS_USAGE_STATS=false

ENTRYPOINT ["sh", "etl/run.sh"]
