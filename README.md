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

## Deploy

### 1. Deploy with Docker (recommanded)

For docker installation, please visit [docker website](https://docs.docker.com/engine/install/) 

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

#### Caching

The movie data is a read-only CSV, so answers can be cached safely. Three layers, from the inside out:

| Layer | What | Details |
|---|---|---|
| Flask app (`backend/app.py`) | genre list / min year (once per worker), `/statistics` by year range, `/allmovies` pages of at most 100 movies (`lru_cache`) | per worker, so it also works without nginx. Big answers (e.g. the whole dataset) are not cached to bound memory. |
| nginx (`nginx/nginx.conf`) | `/allmovies` and `/statistics` for 60 s, shared by all replicas | the `X-Cache-Status` response header says `HIT`, `MISS` or `BYPASS`. Send `X-No-Cache: 1` to skip it. |
| Cloudflare / browser | see below | `Cache-Control` set by nginx |

To load-test the replicas rather than the cache, run Locust with `NO_CACHE=1` (it sends `X-No-Cache: 1`):
```shell
NO_CACHE=1 locust -f backend/performance/locustfile.py --host=http://localhost:5000 --headless -u 100 -t 1m
```
Caches are emptied when the app / nginx container is recreated, e.g. after a redeploy.

#### Cloudflare (optional)

Cloudflare can sit in front of nginx to give you HTTPS, DDoS/WAF protection and edge caching, without opening any inbound port. The stack then looks like: `Cloudflare -> cloudflared tunnel -> nginx -> app replicas`.

- **Tunnel**: the `cloudflared` service is in the `cloudflare` compose profile, so a plain `docker compose up` ignores it.
  1. In Cloudflare Zero Trust, go to *Networks > Tunnels*, create a tunnel and copy its token.
  2. In the tunnel, add a public hostname (a domain on your Cloudflare account) with the service set to `http://nginx:80`.
  3. Put the token in a `.env` file (see `.env.example`, `.env` is git-ignored) and start the stack:
     ```shell
     CLOUDFLARE_TUNNEL_TOKEN=<token> docker compose --profile cloudflare up -d
     ```
- **Caching**: nginx sets the `Cache-Control` headers (`nginx/nginx.conf`): `/static/*` is cached for a year (the React build hashes file names), `/allmovies` and `/statistics` get `s-maxage=60`, everything else (including `index.html`) is `no-cache`. Cloudflare does not cache JSON by default: to cache the two API routes, add a *Cache Rule* (*Caching > Cache Rules*) for them with "Eligible for cache" and edge TTL "Use cache-control header if present".
- **Origin still reachable**: port `5000` stays published on the host, so the app can be reached without going through Cloudflare. Once the tunnel works, bind it to localhost (`127.0.0.1:${PORT:-5000}:80` in the `nginx` service) or remove the published port.
- **Client IPs**: behind the tunnel, the client address is in the `CF-Connecting-IP` header (nginx currently sees the `cloudflared` container).
- **No account or domain?** `cloudflared tunnel --url http://localhost:5000` opens a temporary `https://<random>.trycloudflare.com` URL (no caching or WAF rules, for testing only).

### 2. Deploy without docker
Not recommanded for production
Run the following command from the project root directory:

```shell
source .venv/bin/activate
gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
```
Then open the application in your web browser: http://localhost:5000
If it does not work, try to open it from an incognito browser window

## Data warehouse (PostgreSQL, star schema)

`movies.csv` can be loaded into PostgreSQL as a star schema. This is optional: the web app still reads the CSV directly.

It is an ELT pipeline: Python extracts the CSV and loads it as-is into a `raw` table, then [dbt](https://www.getdbt.com/) transforms it into the star schema (SQL models, database constraints and tests).

```shell
docker compose --profile db up -d db       # PostgreSQL 17, data kept in the `pgdata` volume
docker compose --profile db run --rm etl   # load raw.movies, then dbt build (a few seconds, safe to re-run)
psql postgresql://movies:movies@localhost:5432/movies   # user / password / database: see .env.example
```
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

### Model (`dbt/models/marts/`)

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

I provided a mode  to be able to run tests through docker:
in a terminal, enter:

```shell
docker run  --rm -it -e MODE=test -p 5000:5000 webserver --name webserver 

docker logs webserver # display test logs
```

### CI/CD

Tests are re-used when running CI:
for more details, please see `.github/workflow/build_test` file.

Besides the unit/integration tests, the workflow has load-test jobs (Locust, see `backend/performance/locustfile.py`):
- `scalability-test`: starts the compose stack with 2 replicas, scales it to 4, load-tests through nginx and checks every replica served requests.
- `cloudflare-quick-tunnel-test`: same test through a temporary `trycloudflare.com` tunnel (no secret needed).
- `cloudflare-test`: same test through your own tunnel and domain. It is skipped unless the repository has a `CLOUDFLARE_TUNNEL_TOKEN` secret and a `CLOUDFLARE_URL` variable (e.g. `https://movies.example.com`).
 
## Possible improvements:

**Regarding architecture**:
- Use a SQL database and Grafana (more production-oriented) 
- Deploy with Docker
- refactor some methods

**frontend**: 
- Search within movie descriptions and other text fields.
- Improve React UI components.
- add button to get directly to the top / the bottom of the results
- display more points for graph (current chart displays only 500 points)
- Improve page responsiveness.
- measure website perfs

**backend**:
- Handle errors and invalid API requests. 
- improve application security
- add middleware + nginx as reverse proxy