# app.py
#
# The API. Where the movies come from (movies.csv or the PostgreSQL warehouse) is decided by
# DATA_SOURCE, see backend/store.py; the answers are cached, see backend/cache.py.

import os

from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from backend.cache import build_cache
from backend.store import DataSourceError, build_store

BUILD_DIR = os.path.join('..', 'frontend', 'build')
app = Flask(__name__, static_folder=BUILD_DIR, static_url_path='/')
CORS(app)

app.config.from_prefixed_env()
app.static_folder = app.config.get('FRONTEND_PATH', BUILD_DIR)

# Pages of at most this many movies are cached; bigger answers (e.g. the whole
# dataset) are not, to keep the memory used by the cache bounded.
MAX_CACHED_PAGE_SIZE = 100

# csv (default), postgres or auto: DATA_SOURCE
_store = build_store()

# In-process LRU, plus memcached when MEMCACHED_SERVERS is set (see backend/cache.py).
# The data source and its version are part of every key, so an answer computed from one source
# or from an older load of the data is never served for another.
_cache = build_cache("app")


def _with_source(handler):
    """Run handler(store). If the store fails: the CSV store takes over in `auto` mode, 503 otherwise."""
    source = _store.current()
    for _ in range(2):
        try:
            return handler(source)
        except DataSourceError as error:
            fallback = _store.failed(error)
            if fallback is None or fallback is source:
                return jsonify({"message": str(error)}), 503
            source = fallback
    return jsonify({"message": "no data source available"}), 503


def _answer(source, kind, args, method, cacheable=True):
    """Answer 201 with the JSON of source.<method>(*args), through the two-level cache when `cacheable`.
    X-App-Cache says where the body came from (memory, memcached or miss), X-Data-Source which store."""
    if cacheable:
        def render():
            return app.json.response(getattr(source, method)(*args)).get_data()   # same bytes as jsonify(...)

        key = _cache.key(f"{kind}-{source.name}-{source.version()}", args)
        body, layer = _cache.get_or_compute(key, render)
        response = Response(body, status=201, mimetype="application/json")
        response.headers["X-App-Cache"] = layer
    else:
        response = app.json.response(getattr(source, method)(*args))
        response.status_code = 201
    response.headers["X-Data-Source"] = source.name
    return response


@app.route('/allmovies', methods=['GET'])
def serve_movies():
    """
    Return a paginated list of movies with optional filtering and sorting.

    Query parameters:
        start (int): Pagination start index.
        end (int): Pagination end index.
        title (str): Case-insensitive title search.
        genre (list[str]): One or more genres to match.
        lang (str): Original language code.
        score (float): Minimum vote average.
        dates (list[int]): Release year range [start, end).
        order_by (str): Sort field.
        order_desc (str): Sort direction ('asc' or 'desc').

    Returns:
        JSON response containing matching movies, total count,
        available genres, dataset minimum year, and metric maxima.
    """
    def handler(source):
        n_total = source.total()
        n_start = int(request.args.get("start", 0))
        n_end = min(int(request.args.get("end", n_total + 1)), n_total + 1)
        args = (
            n_start,
            n_end,
            str(request.args.get("title", "")),
            tuple(sorted(request.args.getlist("genre"))),  # "any of" semantics: order is irrelevant
            str(request.args.get("lang", "")),
            float(request.args.get("score", 0.)),
            tuple(request.args.getlist("dates")),
            request.args.get("order_by"),
            request.args.get("order_desc", "asc"),
        )
        return _answer(source, "allmovies", args, "query_movies", cacheable=n_end - n_start <= MAX_CACHED_PAGE_SIZE)

    return _with_source(handler)


@app.route('/statistics', methods=['GET'])
def serve_stats():
    # tests : curl http://127.0.0.1:5000/statistics
    # curl http://127.0.0.1:5000/statistics?dates=1990&dates=2020
    dates = tuple(request.args.getlist("dates"))
    return _with_source(lambda source: _answer(source, "statistics", (dates,), "statistics"))


@app.route('/')
def index():
    return app.send_static_file('index.html')


if __name__ == '__main__':
    app.run()
