import random

from locust import HttpUser, task, between

PAGE_SIZE = 20  # same as the frontend
GENRES = ["Drama", "Comedy", "Action", "Thriller", "Adventure", "Romance"]
LANGUAGES = ["en", "ja", "es", "fr", "ko"]
TITLES = ["the", "man", "love", "war", "night"]
SORT_FIELDS = ["popularity", "release_date", "vote_count", "vote_average"]


class MovieUser(HttpUser):
    wait_time = between(1, 2)

    def _get(self, path, name, expected_key, params=None):
        """GET and check status 201 + expected key. `name` groups URLs with
        different query strings into one line in the Locust stats."""
        with self.client.get(path, params=params, name=name, catch_response=True) as response:
            if response.status_code != 201:
                # status 0 = no HTTP response at all; say why (timeout, reset, ...)
                error = getattr(response, "error", None)
                detail = f" ({type(error).__name__}: {error})" if error else ""
                response.failure(f"Unexpected status: {response.status_code}{detail}")
                return

            data = response.json()

            if expected_key not in data:
                response.failure(f"Missing '{expected_key}' key")
            else:
                response.success()

    @task(5)
    def browse_page(self):
        """Infinite scroll: one page of 20 movies, no filter."""
        start = random.randint(0, 100) * PAGE_SIZE
        self._get("/allmovies", "/allmovies [page]", "movies",
                  {"start": start, "end": start + PAGE_SIZE})

    @task(4)
    def filtered(self):
        """Filter panel: title / genres / language / min score / year range."""
        params = {"start": 0, "end": PAGE_SIZE}
        if random.random() < 0.5:
            params["title"] = random.choice(TITLES)
        if random.random() < 0.7:
            params["genre"] = random.sample(GENRES, random.randint(1, 2))
        if random.random() < 0.5:
            params["lang"] = random.choice(LANGUAGES)
        if random.random() < 0.5:
            params["score"] = random.choice([4, 6, 7, 8])
        if random.random() < 0.5:
            year = random.randint(1950, 2015)
            params["dates"] = [year, year + random.randint(1, 10)]
        self._get("/allmovies", "/allmovies [filtered]", "movies", params)

    @task(2)
    def sorted(self):
        """Sort panel (sorting runs on the whole filtered dataframe)."""
        self._get("/allmovies", "/allmovies [sorted]", "movies", {
            "start": 0,
            "end": PAGE_SIZE,
            "order_by": random.choice(SORT_FIELDS),
            "order_desc": random.choice(["asc", "desc"]),
        })

    @task(2)
    def statistics(self):
        """Statistics page, with or without a year range."""
        params = {}
        if random.random() < 0.5:
            year = random.randint(1950, 2015)
            params["dates"] = [year, year + random.randint(1, 20)]
        self._get("/statistics", "/statistics", "stats_genre", params)

    @task(1)
    def all_movies(self):
        """Worst case: no parameters returns the whole dataset."""
        self._get("/allmovies", "/allmovies [all]", "movies")
