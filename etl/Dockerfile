# Image of the CSV -> PostgreSQL pipeline (python loader + dbt). Built from the repository root:
#   docker build -f etl/Dockerfile -t movie-explorer-etl .      (or: podman build ...)
# Separate from the web image so that dbt does not end up in the app.
# The base image is fully qualified: Podman refuses short names when it cannot ask a registry.
FROM docker.io/library/python:3.12-slim

WORKDIR /app

# unprivileged user (same uid as the web image)
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --create-home --shell /usr/sbin/nologin app

COPY etl/requirements.txt etl/requirements.txt
RUN pip install --no-cache-dir -r etl/requirements.txt

# only what the loader needs from the backend: the CSV parser and the CSV
COPY backend/__init__.py backend/load_csv.py backend/movies.csv ./backend/
COPY etl/ ./etl/
# dbt writes target/, logs/ and .user.yml in its project folder: that one belongs to the user
COPY --chown=app:app dbt/ ./dbt/

ENV PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    DBT_SEND_ANONYMOUS_USAGE_STATS=false

USER 10001:10001

ENTRYPOINT ["sh", "etl/run.sh"]
