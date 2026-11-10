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

#### Security hardening

The containers are locked down (`docker-compose.yml`, `Dockerfile`):

| Measure | Where |
|---|---|
| Runs as a non-root user (uid 10001 for the app; the `nginx-unprivileged` image, uid 101, listening on port 8080) | `app`, `nginx` |
| All Linux capabilities dropped (`cap_drop: ALL`) and `no-new-privileges` | every service |
| Read-only root filesystem; only small `tmpfs` mounts (`/tmp`, nginx's generated config) are writable | `app`, `nginx` |
| Memory limit and a cap on the number of processes | `app`, `nginx` |
| Fully qualified image names (`docker.io/...`), so the registry is never guessed | all images |

#### Podman (rootless)

[Podman](https://podman.io/) runs the same containers without a daemon and without root: it is more secure than Docker's default setup, because there is no privileged daemon socket and "root" inside a container is only your own unprivileged user on the host. `docker-compose.yml` works unchanged with `podman-compose`.

```shell
# install: e.g. `sudo apt install podman` or `sudo dnf install podman`, then
pipx install podman-compose              # or: pip install --user podman-compose

podman-compose up -d --build             # 2 replicas by default, http://localhost:5000
podman-compose up -d --scale app=4       # rescale live
podman-compose down

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
- **Health checks** (`podman ps` shows them) run from systemd timers: without systemd (e.g. WSL without systemd enabled) they stay at "starting", and `podman-compose up --wait` would wait forever. That is why nginx only waits for the app to be *started*.

CI job `podman-test` starts the stack with rootless Podman and checks that the containers run as non-root.

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