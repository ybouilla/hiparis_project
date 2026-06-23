# app.py

from math import floor
import sys
import tempfile
from flask import Flask, jsonify, request, redirect
from werkzeug.utils import secure_filename
from flask_cors import CORS
import os
import pandas as pd
from backend.load_csv import load_csv




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
	df = load_csv()
	min_date = df["Release_Date"].min().year
	n_start = int(request.args.get("start", 0))
	n_end = min(int(request.args.get("end",len(df)+1)), len(df)+1)
	title = str(request.args.get("title", ""))
	genre = request.args.getlist("genre", )
	language = str(request.args.get("lang", ""))
	min_rate = float(request.args.get("score", 0.))
	dates = request.args.getlist("dates", )
	order_by = request.args.get("order_by")
	order_desc = request.args.get("order_desc", "asc") # boolean

	
	all_genres = sorted(
						df["Genre"]
						.dropna()
						.str.split(",")
						.explode()
						.str.strip()
						.unique()
					)
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

	return jsonify(resp), 201
	resp = {
		'message': 'bad file format'
	}
	return jsonify(resp), 422



@app.route('/')
def index():
    return app.send_static_file('index.html')

if __name__ == '__main__':
	app.run()
