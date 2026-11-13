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

The site is a React single-page app served by a small Flask API. The API reads `backend/movies.csv` once (`backend/load_csv.py` repairs the records that span several lines) and keeps it as a pandas DataFrame in memory, so there is no database in the request path.

### The stack

```mermaid
flowchart LR
    user(["Browser<br/>React single-page app"])
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

    subgraph optional["optional data warehouse, not used by the site yet"]
        csv[("movies.csv")] -->|"python loader"| raw[("PostgreSQL<br/>raw.movies")]
        raw -->|"dbt"| star[("star schema")]
    end
```

nginx is the only entry point. It finds the replicas through the network's DNS name `app` (so scaling up or down needs no reload) and answers repeated `/allmovies` and `/statistics` requests from its own cache. The replicas share the answers they compute through memcached. Cloudflare and the PostgreSQL pipeline are optional.

### What happens when you browse

```mermaid
sequenceDiagram
    actor U as User
    participant R as React app
    participant N as nginx
    participant F as Flask replica
    participant M as memcached
    participant D as DataFrame in memory

    U->>R: opens the site
    R->>N: GET / (index.html and the JavaScript)
    N->>F: forward
    F-->>R: static files from frontend/build

    R->>N: GET /allmovies?start=0&end=20&genre=...&order_by=...
    alt same URL answered during the last 60 s
        N-->>R: 201 JSON, X-Cache-Status HIT
    else not in the cache
        N->>F: forward to one replica
        alt in the worker's memory, or already in memcached
            F->>M: get (unless it is in the worker's memory)
            M-->>F: the stored JSON
        else computed now
            F->>D: filter, sort, take 20 rows
            D-->>F: movies, total, genres
            F->>M: set, for the other replicas
        end
        F-->>N: 201 JSON, X-App-Cache memory, memcached or miss
        N-->>R: 201 JSON, X-Cache-Status MISS
    end

    U->>R: scrolls down, or changes a filter or the sort
    R->>R: scroll: ask for the next page. Filter: abort the pending request, empty the list
    R->>N: GET /allmovies?start=20&end=40&...
```

### Inside the page

```mermaid
flowchart TD
    filters["Filters: search, genres, language,<br/>minimum rating, years, sort"] --> debounce["the search text is debounced 300 ms"]
    debounce --> reload["reload: abort the pending request,<br/>empty the list"]
    reload --> page1["GET /allmovies, page 1 (20 movies)"]
    page1 --> cards["cards in grid or list view,<br/>skeletons while loading"]
    page1 -->|"no result"| empty["empty state with Clear all filters"]
    cards -->|"bottom sentinel enters the viewport"| next["GET /allmovies, next page"]
    next --> cards
    next -->|"no more results"| finish["End of results"]
    cards -->|"top sentinel enters the viewport"| prev["load the previous page"]
    prev --> cards
```

| Route | Purpose | Parameters |
|---|---|---|
| `GET /` | the React app (`frontend/build`) | |
| `GET /allmovies` | a page of movies, plus total, genre list and maxima | `start`, `end`, `title`, `genre` (repeatable), `lang`, `score`, `dates` (twice), `order_by`, `order_desc` |
| `GET /statistics` | quartiles and counts by language and genre for the charts page | `dates` (twice) |

Both API routes answer `201` with JSON. The `/statistics` page of the app draws its charts from that answer.

## Deploy

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

#### Caching

The movie data is a read-only CSV, so answers can be cached safely. Four layers, from the inside out:

| Layer | What | Details |
|---|---|---|
| Memory of each gunicorn worker (`backend/cache.py`) | the genre list / min year (once), then the JSON of `/statistics` by year range and of `/allmovies` pages of at most 100 movies (256 answers, least recently used first) | the fastest, but private to the worker. Big answers (e.g. the whole dataset) are never cached, to bound memory. |
| memcached (`memcached` service) | the same JSON answers, for 1 hour | shared by **all workers of all replicas**: the first one to get a request computes the answer, the others reuse it, and it survives a restart of the app. Optional: see below. |
| nginx (`nginx/nginx.conf`) | `/allmovies` and `/statistics` for 60 s, shared by all replicas | the `X-Cache-Status` response header says `HIT`, `MISS` or `BYPASS`. Send `X-No-Cache: 1` to skip it. |
| Cloudflare / browser | see below | `Cache-Control` set by nginx |

The `X-App-Cache` response header tells where an answer came from: `memory` (the worker), `memcached` (another worker computed it) or `miss` (computed now).

memcached is configured by `MEMCACHED_SERVERS` (default `memcached:11211` in `docker-compose.yml`; several servers can be listed, separated by commas) and `MEMCACHED_TTL` (seconds, default 3600). Set `MEMCACHED_SERVERS=off`, or leave it unset (the default when you run gunicorn yourself), to use only the cache in each worker's memory: the app never needs memcached. If memcached is down or slow, the answer is simply computed, and memcached is not tried again for 10 seconds. The data version (size and date of `movies.csv`) is part of every key, so a new CSV never gets answers computed from the old one. To try it without Docker: install memcached (`sudo apt install memcached`), run `memcached -m 64 -l 127.0.0.1`, then `MEMCACHED_SERVERS=127.0.0.1:11211 gunicorn --bind 0.0.0.0:5000 backend.wsgi:app`.

A browser cannot talk to memcached (it is a TCP protocol, not HTTP), so it is used by the Flask replicas, not by the React code. The front end benefits indirectly: answers come back faster, and the browser itself keeps what `Cache-Control` allows.

To load-test the replicas rather than the cache, run Locust with `NO_CACHE=1` (it sends `X-No-Cache: 1`):
```shell
NO_CACHE=1 locust -f backend/performance/locustfile.py --host=http://localhost:5000 --headless -u 100 -t 1m
```
The memory caches and nginx's cache are emptied when their container is recreated, e.g. after a redeploy (memcached too, as it has no volume).

#### Security hardening

The containers are locked down (`docker-compose.yml`, `Dockerfile`):

| Measure | Where |
|---|---|
| Runs as a non-root user: uid 10001 for the app and the pipeline, uid 101 for nginx (the `nginx-unprivileged` image, listening on port 8080), uid 70 for PostgreSQL, the image's `memcache` user for memcached | every service |
| All Linux capabilities dropped (`cap_drop: ALL`) and `no-new-privileges` | every service |
| Read-only root filesystem; only small `tmpfs` mounts are writable: `/tmp`, nginx's generated config and its response cache (`/var/cache/nginx`, in memory), PostgreSQL's socket directory (and its data volume) | `app`, `nginx`, `memcached`, `db` |
| Cap on the number of processes; memory limit | `app`, `nginx`, `memcached`, `db` (processes); `app`, `memcached` (memory) |
| Fully qualified image names (`docker.io/...`), so the registry is never guessed | all images |
| The database port is published on `127.0.0.1` only; memcached (no authentication) publishes no port at all, only the other containers can reach it | `db`, `memcached` |

#### Podman (rootless)

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
(`podman compose` without the dash also works: it calls whichever compose tool is installed.) On macOS and Windows, first run `podman machine init && podman machine start`.

Things that differ from Docker:
- **Ports below 1024 cannot be published** without root, which is why nginx listens on 8080 (published as 5000).
- **Service names**: Podman's DNS is not at Docker's `127.0.0.11`. nginx therefore reads the DNS server from the container's `/etc/resolv.conf` when it starts (`nginx/nginx.conf` is a template), so the same file works on both.
- **No CPU limit** is set: a rootless Podman refuses to start a container with `cpus` unless the `cpu` cgroup controller is delegated to your user (`systemctl edit user@.service` with `Delegate=cpu cpuset io memory pids`). After that you can add `cpus: "1.0"` under `deploy.resources.limits`.
- **SELinux** hosts (Fedora, RHEL): the bind-mounted nginx file is relabelled with `:z`, already in the compose file.
- **Starting at boot**: `restart: unless-stopped` does not survive a reboot of a rootless setup. Run `loginctl enable-linger $USER`, then `podman-compose systemd -a create-unit` (or use Quadlet).
- **Health checks** (`podman ps` shows them) run from systemd timers: without systemd (e.g. WSL without systemd enabled) they stay at "starting", and `podman-compose up --wait` would wait forever. That is why nginx only waits for the app to be *started*, and the pipeline only for the database to be *started* (the loader retries its connection for about a minute).
- **The nginx response cache lives in memory** (a `tmpfs` of 128 MB, above the 100 MB `max_size` of the cache), so it is emptied at every restart and, like any container memory, does not survive a reboot.
- **The database volume** (`pgdata`) is a named volume of your user's Podman storage (`podman volume ls`). PostgreSQL runs as the image's own user (uid 70), which Podman maps to a sub-uid of yours; the volume's files are owned accordingly, so back it up with `podman volume export pgdata`, not by copying files from your home directory.

CI jobs `podman-test` and `podman-db-test` start the stack and the database profile with rootless Podman, and check the cache and that the containers run as non-root.


#### Cloudflare (optional)

Cloudflare can sit in front of nginx to give you HTTPS, DDoS/WAF protection and edge caching, without opening any inbound port. The stack then looks like: `Cloudflare -> cloudflared tunnel -> nginx -> app replicas`.

- **Tunnel**: the `cloudflared` service is in the `cloudflare` compose profile, so a plain `docker compose up` ignores it.
  1. In Cloudflare Zero Trust, go to *Networks > Tunnels*, create a tunnel and copy its token.
  2. In the tunnel, add a public hostname (a domain on your Cloudflare account) with the service set to `http://nginx:8080`.
  3. Put the token in a `.env` file (see `.env.example`, `.env` is git-ignored) and start the stack:
     ```shell
     CLOUDFLARE_TUNNEL_TOKEN=<token> docker compose --profile cloudflare up -d
     ```
- **Caching**: nginx sets the `Cache-Control` headers (`nginx/nginx.conf`): `/static/*` is cached for a year (the React build hashes file names), `/allmovies` and `/statistics` get `s-maxage=60`, everything else (including `index.html`) is `no-cache`. Cloudflare does not cache JSON by default: to cache the two API routes, add a *Cache Rule* (*Caching > Cache Rules*) for them with "Eligible for cache" and edge TTL "Use cache-control header if present".
- **Origin still reachable**: port `5000` stays published on the host, so the app can be reached without going through Cloudflare. Once the tunnel works, bind it to localhost (`127.0.0.1:${PORT:-5000}:8080` in the `nginx` service) or remove the published port.
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
For further information reagrding CI/CD, please visit the page ![CI_CD](./CI_CD.md)

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