# Deatils of CI/CD: executed tests

CI CD mainly executes unit tests, as well as end to end tests using differents setups and environments, and for stress tests. 

`.github/workflows/build_test.yml` runs on every push and pull request to `dev` and `master`. It has 12 jobs with no dependency between them, so they all start at the same time (some run on several operating systems).

```mermaid
flowchart LR
    trigger(["push or pull request<br/>to dev / master"]) --> gha["GitHub Actions<br/>12 independent jobs, in parallel"]

    subgraph data["Data pipeline"]
        et["etl-test<br/>PostgreSQL service container:<br/>loader tests, pipeline twice, dbt tests"]
        lt["local-db-test<br/>private PostgreSQL<br/>(scripts/localdb.sh)"]
        pdt["podman-db-test<br/>database profile on Podman,<br/>non-blocking"]
    end

    subgraph deploy["The whole stack"]
        sc["scalability-test<br/>compose: 2 then 4 replicas,<br/>cache check, load test"]
        qt["cloudflare-quick-tunnel-test<br/>same test through a<br/>temporary Cloudflare tunnel"]
        ct["cloudflare-test<br/>your own tunnel and domain,<br/>skipped without secrets"]
        pt["podman-test<br/>rootless Podman, non-blocking"]
    end

    subgraph perf["Load tests with Locust"]
        st["stress-test<br/>ubuntu, macOS<br/>gunicorn, 100 users, 2 min"]
        dt["docker-test<br/>builds the image, runs it,<br/>100 users, 2 min"]
    end

    subgraph code["Code tests"]
        ut["unit-tests-frontend<br/>ubuntu, macOS, Windows<br/>Jest + Testing Library"]
        it["integration-tests-frontend<br/>ubuntu, macOS<br/>build, then Playwright end-to-end<br/>against a real gunicorn"]
        bt["tests-backend<br/>ubuntu, macOS<br/>pytest: API and loader"]
    end

    gha --> data
    gha --> deploy
    gha --> perf
    gha --> code
    sc --> reports["Locust HTML reports<br/>(downloadable artifacts)"]
    qt --> reports
    ct --> reports
```

| Job | What it runs | It fails when |
|---|---|---|
| `unit-tests-frontend` | `npm ci`, then Jest tests of the page, the infinite scroll, the reload on filter change and the movie card | a test fails (the npm debug log is printed if `npm ci` itself fails) |
| `integration-tests-frontend` | builds the React app, then Playwright drives a real browser against gunicorn: 20 cards, then 40 after scrolling, and the navigation to the statistics page | an end-to-end test fails |
| `tests-backend` | `pytest`: the API (status, title, language and score filters) and the loader | a test fails |
| `stress-test` | gunicorn started locally, then Locust for 2 minutes with 100 users | any request is not a `201` with the expected JSON key (Locust then exits with code 1) |
| `docker-test` | builds the Docker image, runs it, runs Locust against the container, then starts the image's own test mode | the build fails or a Locust request fails (the test-mode run is started but its result is not checked yet) |
| `scalability-test` | see the diagram below | a step fails, or a replica received no request |
| `cloudflare-quick-tunnel-test` | 4 replicas behind a temporary `trycloudflare.com` URL (no account needed), Locust through it, every replica must have received requests | same as above |
| `cloudflare-test` | the same through your own tunnel and domain. Skipped unless the repository has the `CLOUDFLARE_TUNNEL_TOKEN` secret and the `CLOUDFLARE_URL` variable, and on pull requests from forks | a load-test request fails |
| `podman-test` | the stack on rootless Podman: it starts, the API answers, the cache works, the containers do not run as root | a step fails (the job does not block the others yet: `continue-on-error`) |
| `etl-test` | PostgreSQL as a service container: loader tests, then the pipeline twice (load `raw.movies`, then `dbt build` with its tests), then checks on the warehouse | a test, a dbt model or a dbt test fails |
| `local-db-test` | the same pipeline against the private PostgreSQL started by `scripts/localdb.sh` (no Docker) | the pipeline or the final row count fails |
| `podman-db-test` | the database profile on rootless Podman | non-blocking, like `podman-test` |

The Locust test is not a single request: each simulated user waits 1 to 2 seconds between requests and picks one, with these weights (`backend/performance/locustfile.py`):

| Task | Weight | Request |
|---|---|---|
| `browse_page` | 5 | a page of 20 movies, no filter |
| `filtered` | 4 | title, genres, language, minimum score and year range, chosen at random |
| `sorted` | 2 | a random sort field and direction |
| `statistics` | 2 | `/statistics`, with or without a year range |
| `all_movies` | 1 | no parameter: the whole dataset, the worst case |

What `scalability-test` does, step by step:

```mermaid
flowchart TD
    s1["Start the stack<br/>2 replicas"] --> s2["Scale to 4 replicas<br/>nginx finds them through DNS"]
    s2 --> s3["Cache check on one URL:<br/>MISS, then HIT,<br/>then BYPASS with X-No-Cache"]
    s3 --> s4["Locust, 100 users, 1 min<br/>with X-No-Cache, so the<br/>replicas get the load, not the cache"]
    s4 --> s5["Each replica's log must show<br/>GET /allmovies"]
    s5 --> s6["Upload the Locust HTML report"]
```