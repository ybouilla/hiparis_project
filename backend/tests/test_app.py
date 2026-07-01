import pytest
from backend.app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True

    with app.test_client() as client:
        yield client


class TestAllMovies:

    def test_01_no_filters(self, client):
        response = client.get("/allmovies")

        assert response.status_code == 201
        data = response.get_json()

        assert data["message"] == "ok"

    def test_02_title_filter(self, client):
        response = client.get(
            "/allmovies",
            query_string={"title": "Avatar"}
        )

        data = response.get_json()

        for movie in data["movies"]:
            assert "avatar" in movie["Title"].lower()

    def test_03_language_filter(self, client):
        response = client.get(
            "/allmovies",
            query_string={"lang": "en"}
        )

        data = response.get_json()

        for movie in data["movies"]:
            assert movie["Original_Language"] == "en"

    def test_04_score_filter(self, client):
        response = client.get(
            "/allmovies",
            query_string={"score": 7}
        )

        data = response.get_json()

        for movie in data["movies"]:
            assert movie["Vote_Average"] >= 7