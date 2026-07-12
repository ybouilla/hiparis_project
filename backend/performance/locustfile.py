from locust import HttpUser, task, between


class MovieUser(HttpUser):
    wait_time = between(1, 2)

    @task
    def movies(self):
        with self.client.get("/allmovies", catch_response=True) as response:
            if response.status_code != 201:
                response.failure(f"Unexpected status: {response.status_code}")
                return

            data = response.json()

            if "movies" not in data:
                response.failure("Missing 'movies' key")
            else:
                response.success()