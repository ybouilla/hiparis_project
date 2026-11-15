# Project: Challenge – Visualisation d’une base de données de films

## Goal: Sujet
Vous disposez d’un fichier contenant une base de données de films (movies.csv). Votre mission est de produire une plateforme permettant de visualiser au mieux l’intégralité de cette base de données.  


Here is a short illustration of the rendered page.

<img src="./imgs/movie_interface_pres.gif" width="50%" height="50%"/>

## Setup (not needed if docker is used - see below)
The project requires the following dependencies:

* [`uv`](https://docs.astral.sh/uv/) or any other Python virtual environment
* npm (version 10 or above) or pnpm
* [nodejs](https://nodejs.org/en/download/), version 22 or above.


* Using [`uv`](https://docs.astral.sh/uv/) package manager

(*Note: this project uses `uv` as the package manager. Other package managers may work but have not been tested.*)
```shell
uv venv --python 3.12  # version 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
```
* Using `npm`package manager
(*Nota: here we are using `npm`as package manager; other packages manager should be working but havenot been tested*)
```shell
cd frontend
npm install
npm run build
```

## How the website works

The site is a React single-page app served by a small Flask API. The API reads `backend/movies.csv` once (`backend/load_csv.py` repairs the records that span several lines) and keeps it as a pandas DataFrame in memory, so by default there is no database in the request path. With `DATA_SOURCE=postgres` (or `auto`) the API reads the PostgreSQL warehouse instead, see "Using the database from the website". The project also possesses a ELT pipeline for loading the csv into a database, and use data from this database. This makes the solution more scalable (see below ELT and postgreSQL pipeline).

### The stack

```mermaid
flowchart LR
    user(["Browser<br/>React app + its own cache"])
    cf["Cloudflare<br/>HTTPS, WAF, edge cache"]

    subgraph stack["docker compose / podman-compose"]
        nginx["nginx :8080<br/>load balancer<br/>response cache 60 s"]
        subgraph replicas["app replicas, 2 by default (--scale app=N)"]
            app1["gunicorn + Flask<br/>replica 1<br/>movies.csv in memory"]
            app2["gunicorn + Flask<br/>replica N<br/>movies.csv in memory"]
        end
        mc[("memcached<br/>64 MB, shared answers")]
    end

    user -->|"http://localhost:5000"| nginx
    user -.->|"HTTPS (optional)"| cf
    cf -.->|"tunnel"| nginx
    nginx -->|"each request goes to one replica"| app1
    nginx --> app2
    app1 <-->|"answers"| mc
    app2 <-->|"answers"| mc

    subgraph optional["optional data warehouse (PostgreSQL)"]
        csv[("movies.csv")] -->|"python loader"| raw[("PostgreSQL<br/>raw.movies")]
        raw -->|"dbt"| star[("star schema")]
    end
    app1 -.->|"DATA_SOURCE=postgres"| star
    app2 -.-> star
```

nginx is the only entry point. It finds the replicas through the network's DNS name `app` (so scaling up or down needs no reload) and answers repeated `/allmovies` and `/statistics` requests from its own cache. The replicas share the answers they compute through memcached. Cloudflare and the PostgreSQL pipeline are optional.

### Web description
See ![web_descr](./web_description.md) for further information.

## Deploy (Docker, Podman, or without)

### 1. Deploy with Docker (recommanded)

For docker installation, please visit [docker website](https://docs.docker.com/engine/install/). Podman works too (rootless, more secure): see "Podman" below.

From the root folder, enter in your terminal: 
```shell
docker build -t webserver .

docker run  --rm -it -e MODE=serve -p 5000:5000 webserver --name webserver 
# or
docker run -d \
  -e MODE=serve
  --name webserver \
  -p 5000:5000 \
    webserver
```

#### Scaled deployment (docker compose)

nginx load-balances several stateless app replicas:
```shell
docker compose up -d --build          # 2 replicas by default
docker compose up -d --scale app=4    # rescale live
APP_REPLICAS=4 WEB_CONCURRENCY=2 PORT=5000 docker compose up -d
```

#### Podman & Podman compose (rootless, more secure alternative to docker comppose)

[Podman](https://podman.io/) runs the same containers without a daemon and without root: it is more secure than Docker's default setup, because there is no privileged daemon socket and "root" inside a container is only your own unprivileged user on the host. `docker-compose.yml` works unchanged with `podman-compose`.

```shell
# install: e.g. `sudo apt install podman` or `sudo dnf install podman`, then
pipx install podman-compose              # or: pip install --user podman-compose

podman-compose up -d --build             # 2 replicas by default, http://localhost:5000
podman-compose up -d --scale app=4       # rescale live
podman-compose down

# the optional parts work the same way
podman-compose --profile db up -d db                 # PostgreSQL (see "Data warehouse")
podman-compose --profile db build etl                # image of the pipeline (python + dbt)
podman-compose --profile db run --rm etl             # load the CSV, then build the star schema with dbt
CLOUDFLARE_TUNNEL_TOKEN=<token> podman-compose --profile cloudflare up -d

# without compose (a single container, no load balancer)
podman build -t webserver .
podman run --rm -e MODE=serve -p 5000:5000 webserver
```

### 2. Deploy without docker
Not recommanded for production
Run the following command from the project root directory:

```shell
source .venv/bin/activate
gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
```
Then open the application in your web browser: http://localhost:5000
If it does not work, try to open it from an incognito browser window

## Caching setting
#### Local cache with memcached (optional)

Run like this, each gunicorn worker only has the cache in its own memory. To share the answers between the workers, and keep them across restarts, run memcached too. `scripts/localcache.sh` starts a private one for you: no Docker, no root, listening on `127.0.0.1` only.

```shell
sudo apt install memcached                # once (macOS: brew install memcached); only the program is needed
WEB_CONCURRENCY=2 scripts/localcache.sh run gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
```
`run` starts memcached if needed, sets `MEMCACHED_SERVERS`, then runs the command you give it (it works the same with `flask`: see "Debug"). The other commands:

```shell
scripts/localcache.sh stats      # items, memory, hit rate
scripts/localcache.sh flush      # forget every cached answer
scripts/localcache.sh status
scripts/localcache.sh stop       # memcached keeps running after the app stops, until you do this
eval "$(scripts/localcache.sh env)"   # to set MEMCACHED_SERVERS in your shell instead of using `run`
```

To see it work, ask for the same page twice and look at the `X-App-Cache` header (`memory` for the worker's own cache, `memcached` when another worker computed it):
```shell
curl -si "http://localhost:5000/allmovies?start=0&end=20" | grep -i x-app-cache
```

## Example of usage:

### How to use it? 

The interface provides two pages, detailed below:
1. **main search**: 

This page allows users to search for movies, a side bar can be used to filter or sort results:
- title: look for specific titles
- genre: display movies by genres
- stars (a star equals 2 points): filter movies by rating (average score)
- language: filter movies from their original languages
- release date: narrows the release date range
Another panel called `sort` let the user orders the results, given Popularity, Vote_Count, Vote_Average, and relase dates.  

<img src="./imgs/movie_explorer1.jpg" width="50%" height="50%"/>

2. **Movie statistics**

This webpage displays statistics on popularity, vote count and vote average.
It allows users to explore whether popularity is correlated with vote count or vote average, regarding the release dates.
Axes are normalized when 2 or more features are displayed (min-max normalization).

<img src="./imgs/movie_explorer2.jpg" width="50%" height="50%"/>

Nota: only a maximum of 500 points can be displayed. 

Illustration:

<img src="./imgs/movie_interface_stats.gif" width="50%" height="50%"/>

## Debug
for debugging or switching to development mode
* **for backend**:
```shell
cd backend
flask --app app.py --debug run
```
  (with memcached: `../scripts/localcache.sh run flask --app app.py --debug run`, then `../scripts/localcache.sh flush` after changing how an answer is computed)
* **for frontend**:

```shell
cd frontend
npm start
```

To run the full project in development mode, start the backend and frontend in two separate terminals.

## Tests
### Backend tests (without docker)
To test backend, run from the root folder: 

**Unit and integration tests**
```shell

uv run -m pytest 
```
get test backend test coverage table by running:

```shell
uv run -m pytest --cov=backend
```

**Api performance evaluation (stress test):**

First launch the application; either through `gunicorn`
```shell
gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
```
or with docker:

```shell
docker run  --rm -it -e MODE=serve -p 5000:5000 webserver --name webserver 
```
then run the tests:
```shell
locust -f backend/performance/locustfile.py --host=http://localhost:5000 --headless -u 100 -t 2m --html report.html
```
with `u`number of users
`-t`: stress test time (2m = 2 mins)
### Frontend tests (without docker)


**Unit tests**

jest is defined in the `packages.json`. From the root folder
```shell
cd frontend
npm test
```

**End-to-end tests**

End-to-end Tests are done using playwright. From the root folder:
```shell
cd frontend
npm build
npx playwright test
```

If you want to run test with an interface (very ressource consuming): 
```shell
npx playwright install chromium 
npx playwright test --ui
```

### Test with docker

The image has a mode that runs the backend tests (pytest) inside the container. It runs in the foreground and the container's exit code is pytest's, so a failing test makes the command fail:

```shell
docker build -t webserver .
docker run --rm -e MODE=test webserver
echo $?        # 0 when every test passed
```
(The image has no Node.js: the frontend tests run on your machine or in CI, see above.) The CI job `docker-test` runs this, then starts the container in `MODE=serve` and checks what it serves, before load-testing it: see `CI_CD.md`.

### CI/CD & tests desccription
CI/CD also features a frontend performance review facility (ligthouse), unit, integration, stress tests.
For further information reagrding CI/CD, please visit the page ![CI_CD](./CI_CD.md)



## Load data (PostgreSQL, star schema)

`movies.csv` can be loaded into PostgreSQL. This is optional: by default the web app still reads the CSV directly; "Using the database from the website" below makes it read this database.

It is an ELT pipeline: Python extracts the CSV and loads it as-is into a `raw` table, then [dbt](https://www.getdbt.com/) transforms it into the star schema (SQL models, database constraints and tests).

```shell
docker compose --profile db up -d db       # PostgreSQL 17, data kept in the `pgdata` volume
docker compose --profile db run --rm etl   # load raw.movies, then dbt build (a few seconds, safe to re-run)
psql postgresql://movies:movies@localhost:5432/movies   # user / password / database: see .env.example
```
With Podman, replace `docker compose` by `podman-compose` (and run `podman-compose --profile db build etl` once before `run`).

Without docker (a PostgreSQL of your own, in the project folder):
```shell
# once: the PostgreSQL *server* programs must be installed (no need to start any service)
#   Debian / Ubuntu / WSL:  sudo apt install postgresql        macOS:  brew install postgresql@17
scripts/localdb.sh start                  # creates ./.localdb on the first run, then starts the server
uv pip install -r etl/requirements.txt       # pandas, psycopg, dbt-postgres (in a virtual environment)
sh etl/run.sh                             # = python -m etl.load_raw  then  dbt build --project-dir dbt --profiles-dir dbt
scripts/localdb.sh psql                   # SQL shell on the result
scripts/localdb.sh stop                   # the data stays in ./.localdb until `scripts/localdb.sh reset`
```
`scripts/localdb.sh` needs no Docker, no root and no system service: it runs its own server, listening on `127.0.0.1` only, with the same default user, password and database as the compose setup (`url` prints the connection string, `status` tells whether it runs). If port 5432 is taken (Ubuntu starts a system PostgreSQL after `apt install postgresql`), use another one for both commands: `export POSTGRES_PORT=5433`. Any PostgreSQL you already run works as well: point the `POSTGRES_*` variables below to it and skip the script.

The connection comes from `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` (defaults: `localhost`, `5432`, and `movies` for the last three). Arguments of `etl/run.sh` go to the loader: `--dry-run` only parses the CSV, `--recreate` drops and recreates `raw.movies`.

### Using the database from the website

The API (`backend/store.py`) can answer from the warehouse instead of the CSV. The choice is the environment variable `DATA_SOURCE`:

| `DATA_SOURCE` | the API reads | if the database is down or not built |
|---|---|---|
| `csv` (default) | `movies.csv`, as before | not concerned: it never connects to the database |
| `postgres` | the star schema | `503` with a JSON message (`{"message": "database unreachable: ..."}`); answers again as soon as the database is back |
| `auto` | PostgreSQL, else the CSV | answers from the CSV, tries PostgreSQL again after 30 s |

```shell
# with docker compose: build the warehouse once, then start the website on it
docker compose --profile db up -d db
docker compose --profile db run --rm etl
DATA_SOURCE=postgres docker compose up -d --build app nginx

# without docker
scripts/localdb.sh start && sh etl/run.sh
DATA_SOURCE=postgres gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
```
The connection comes from `DATABASE_URL`, or from `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` (the same variables as the pipeline; in `docker-compose.yml` the host is `db`). The `X-Data-Source` header of every API answer says which source produced it: `curl -si "localhost:5000/allmovies?start=0&end=5" | grep -i x-data-source`.

- **Same API, same front end.** The two sources return the same JSON; a test compares them query by query (totals, genres, every field of every movie, sort order, quartiles).
- **The caches follow the data.** The source and the version of the data are part of every cache key, so an answer from the CSV is never served for the database. The version of the database is the date of the last load of `raw.movies`, looked up at most every 30 s: after running the pipeline again, new answers appear within that time (and within nginx's 60 s).
- **Small differences of the SQL source**, on purpose: the title is searched as plain text (the CSV source reads it as a regular expression, so `(` made it fail), a genre filter must equal a genre name (the CSV source accepts any substring), the genres of a movie come in alphabetical order, and movies with the same sort value keep their file order.
- Each request costs one or two SQL queries, and the caches (worker memory, memcached, nginx) sit in front of them as before.

### Database Model (`dbt/models/marts/`)

One row per movie in the fact table. Genre is multi-valued, so it goes through a bridge table.

```
                     dim_date
                        |
  dim_movie ---- fact_movie ---- dim_language
                        |
              bridge_movie_genre ---- dim_genre
```

| Table | Content |
|---|---|
| `fact_movie` | measures `popularity`, `vote_count`, `vote_average`; keys to the dimensions |
| `dim_date` | release date: year, quarter, month, day, weekday, decade |
| `dim_language` | language code and English name |
| `dim_genre`, `bridge_movie_genre` | the 19 genres and the movie-genre links (a movie has 1 to n genres) |
| `dim_movie` | title, overview, poster URL (kept out of the fact table so that scans over the measures stay narrow) |
| `vw_movies` | view with the same columns as the CSV, one row per movie |

Key `0` is the "unknown" member of `dim_date`, `dim_language` and `dim_genre`, so foreign keys are never `NULL`. Don't sum a measure across genres: a movie with 3 genres has 3 rows in the bridge (count movies per genre instead).

### Pipeline

```
movies.csv --python (etl/load_raw.py)--> raw.movies --dbt--> stg_* views --> dim_*, fact_movie, bridge tables --> vw_movies
```

1. **Extract + Load** (`etl/load_raw.py`): `backend/load_csv.py` parses the CSV (it also repairs the multi-line rows), then one transaction empties and refills `raw.movies` (`COPY`) and checks the row count. A failed run leaves the previous data in place. This step stays in Python because dbt seeds are meant for small reference files (the CSV has broken rows), and a platform like Airbyte would be far too heavy for one static file.
2. **Transform** (`dbt/`): `stg_movies` and `stg_movie_genres` (views: cleaning, splitting the genre list), then the marts (tables). The language names come from the `language_names` seed.
3. **Constraints**: every mart has an enforced dbt contract, so dbt checks the column types and creates the primary keys, foreign keys and `CHECK`s in the database. A violation makes the model fail, and the previous table stays in place.
4. **Tests** (`dbt build` runs seeds, models and tests in dependency order; a failing test skips what depends on it): not-null / unique on the raw data, one fact row per raw movie, every movie has a genre, plausible release dates, valid weekdays, and a warning for language codes without a name.

A model is replaced before its own tests run. So when a *test* fails (not a constraint), that table already holds the new data while the tables downstream keep the previous one. To inspect the lineage: `dbt docs generate` then `dbt docs serve` (with `--project-dir dbt --profiles-dir dbt`).

Examples:
```sql
-- movies and average rating per genre
SELECT g.genre_name, count(*) AS movies, round(avg(f.vote_average), 2) AS avg_rating
FROM bridge_movie_genre b
JOIN dim_genre g ON g.genre_key = b.genre_key
JOIN fact_movie f ON f.movie_key = b.movie_key
GROUP BY g.genre_name ORDER BY movies DESC;

-- movies per decade
SELECT d.decade, count(*) AS movies, round(avg(f.vote_average), 2) AS avg_rating
FROM fact_movie f JOIN dim_date d ON d.date_key = f.date_key
GROUP BY d.decade ORDER BY d.decade;
```

Tests: the dbt tests run as part of `dbt build`; the loader has `pytest etl/tests` (its database test runs only if `TEST_DATABASE_URL` points to a PostgreSQL database that may be overwritten). CI job `etl-test` runs both against a PostgreSQL container, running the pipeline twice.

## Possible improvements:

**Regarding architecture**:
- refactor some methods

**frontend**: 
- Search within movie descriptions and other text fields.
- Improve React UI components.
- display more points for graph (current chart displays only 500 points)
- Improve page responsiveness.

**backend**:
- Handle errors and invalid API requests. 
- improve application security
