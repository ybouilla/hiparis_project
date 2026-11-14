# app.py

from math import floor
import functools
import sys
import tempfile
from flask import Flask, Response, jsonify, request, redirect
from werkzeug.utils import secure_filename
from flask_cors import CORS
import os
import pandas as pd
from backend.cache import build_cache
from backend.load_csv import MOVIE_FILE, load_csv




BUILD_DIR = os.path.join('..', 'frontend', 'build')
app = Flask(__name__, static_folder=BUILD_DIR, static_url_path='/')
CORS(app)

app.config.from_prefixed_env()
app.static_folder = app.config.get('FRONTEND_PATH', BUILD_DIR)


SORTED_VALUES_AVAIL = {
	"popularity":"Popularity",
	"release_date": "Release_Date",
	"vote_count":  "Vote_Count",
	"vote_average": "Vote_Average"
}

@functools.cache
def _dataset_info():
	"""Constants of the (read-only) dataset: computed once per worker, not on every request."""
	df = load_csv()
	all_genres = sorted(
						df["Genre"]
						.dropna()
						.str.split(",")
						.explode()
						.str.strip()
						.unique()
					)
	return all_genres, df["Release_Date"].min().year


# Pages of at most this many movies are cached; bigger answers (e.g. the whole
# dataset) are not, to keep the memory used by the cache bounded.
MAX_CACHED_PAGE_SIZE = 100


def _data_version():
	"""Identifies the content of movies.csv; part of every cache key."""
	try:
		stat = os.stat(MOVIE_FILE)
		return f"{stat.st_size}-{int(stat.st_mtime)}"
	except OSError:
		return "unknown"


# In-process LRU, plus memcached when MEMCACHED_SERVERS is set (see backend/cache.py).
_cache = build_cache(_data_version())


def _cached_response(kind, args, compute):
	"""Answer 201 with the JSON of `compute()` (a dict), going through the two-level cache.
	The X-App-Cache header says where the body came from: memory, memcached or miss."""
	def render():
		return app.json.response(compute()).get_data()   # same bytes as jsonify(...)

	body, layer = _cache.get_or_compute(_cache.key(kind, args), render)
	response = Response(body, status=201, mimetype="application/json")
	response.headers["X-App-Cache"] = layer
	return response


def _query_movies(n_start, n_end, title, genre, language, min_rate, dates, order_by, order_desc):
	"""Filter, sort and paginate the movies. Arguments are hashable so results can be cached."""
	df = load_csv()
	all_genres, min_date = _dataset_info()
	dates = list(dates)

	if title:
		mask = df["Title"].str.contains(title, case=False, na=False)
		df = df[mask]
	if len(genre) > 0 and genre != "[]":
		
		print("genre still accessed", len(genre), genre, type(genre))
		mask = df["Genre"].str.contains("|".join(genre), case=False, na=False)
		df = df[mask]
	if language:
		df = df[df["Original_Language"] == language]

	if floor(min_rate):
		print("debug", min_rate)
		df = df[df["Vote_Average"] >= min_rate]
	
	if len(dates) == 2:
		if dates[0] == dates[1]:
			dates[1] = 1 + int(dates[1])
		df = df[(df["Release_Date"].dt.year >= int(dates[0])) & (df["Release_Date"].dt.year < int(dates[1]))]
	
	total_movies = len(df)
	# from here; size of df is not changing

	if order_by is not None:
		if order_by not in SORTED_VALUES_AVAIL.keys():
				print("unknown key ", order_by)
		else:
			df = df.sort_values(SORTED_VALUES_AVAIL[order_by], ascending=order_desc=="asc")
	df = df.iloc[n_start:n_end]
	movies = df.to_dict(orient="records")
	# compute max (for chart only)
	popularity_max = df["Popularity"].max()
	popularity_max = 1 if pd.isna(popularity_max) else popularity_max

	vote_count_max = df["Vote_Count"].max()
	vote_count_max = 1 if pd.isna(vote_count_max) else vote_count_max

	vote_avg_max = df["Vote_Average"].max()
	vote_avg_max = 1 if pd.isna(vote_avg_max) else vote_avg_max
	max_val = {
			   "Popularity": int(popularity_max),
			  "Vote_Count": int(vote_count_max),
			  "Vote_Average": float(vote_avg_max)
			  }
	resp = {
		'message': 'ok',
		'movies': movies,
		'total_movies': total_movies,
		'all_genres': list(all_genres),
		'min_date': min_date,
		'max_val': max_val,
	}

	return resp


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
	n_total = len(load_csv())
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
	if n_end - n_start <= MAX_CACHED_PAGE_SIZE:
		return _cached_response("allmovies", args, lambda: _query_movies(*args))
	return jsonify(_query_movies(*args)), 201      # big answers are not cached

def _compute_stats(dates):
	"""Statistics for a release-year range (`dates` is a tuple, so results are cacheable)."""
	df = load_csv()

	dates = list(dates)
	

	if len(dates) == 2:
		if dates[0] == dates[1]:
			dates[1] = 1 + int(dates[1])
		df = df[(df["Release_Date"].dt.year >= int(dates[0])) & (df["Release_Date"].dt.year < int(dates[1]))]
	
	# min
	mins = [df["Popularity"].min(), df["Vote_Count"].min(), df["Vote_Average"].min()]
	# maxs
	maxs = [df["Popularity"].max(), df["Vote_Count"].max(), df["Vote_Average"].max()]

	# quartiles

	q_pop = df["Popularity"].quantile([0.25,0.5,0.75]).to_list() 

	q_vote_count = df["Vote_Count"].quantile([0.25,0.5,0.75]).to_list()
	q_vote_avg = df["Vote_Average"].quantile([0.25,0.5,0.75]).to_list()


	# count by country
	_all_countries = set(df["Original_Language"])
	
	countries_stats = {}
	for _country in _all_countries:
		countries_stats[_country] = len(df[df["Original_Language"] == _country])
	# count by genre
	_all_genre = set(df["Genre"])
	# _all_genre = {x.split(",") for x in _all_genre}
	genre_stats  = (
    df["Genre"]
    .str.split(",")
    .explode()
    .str.strip()      
    .value_counts()
	.to_dict()
)

	resp = {
		'message': 'ok',
		'stats_pop': {
			'min': int(mins[0]),
			 'q1': q_pop[0],
			'q2': q_pop[1],
			'q3': q_pop[2],
			'max': int(maxs[0])
		},
		'stats_vote_count': {
			'min': int(mins[1]),
			'q1': q_vote_count[0],
			'q2': q_vote_count[1],
			'q3': q_vote_count[2],
			'max': int(maxs[1])
		},
		'stats_vote_avg': {
			'min': int(mins[2]),
			'q1': q_vote_avg[0],
			'q2': q_vote_avg[1],
			'q3': q_vote_avg[2],
			'max': int(maxs[2])
		},
		'stats_countries': countries_stats,
		'stats_genre': genre_stats
	}
	return resp


@app.route('/statistics', methods=['GET'])
def serve_stats():
	# tests : curl http://127.0.0.1:5000/statistics
	# curl http://127.0.0.1:5000/statistics?dates=1990&dates=2020
	dates = tuple(request.args.getlist("dates"))
	return _cached_response("statistics", dates, lambda: _compute_stats(dates))

@app.route('/')
def index():
    return app.send_static_file('index.html')

if __name__ == '__main__':
	app.run()
