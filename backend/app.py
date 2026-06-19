# app.py

import sys
import tempfile
from flask import Flask, jsonify, request, redirect
from werkzeug.utils import secure_filename
from flask_cors import CORS
import os




UPLOAD_FOLDER = './movies.csv'

BUILD_DIR = os.path.join('..', 'frontend', 'build')
app = Flask(__name__, static_folder=BUILD_DIR, static_url_path='/')
CORS(app)

app.config.from_prefixed_env()
app.static_folder = app.config.get('FRONTEND_PATH', BUILD_DIR)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER




@app.route('/movies', methods=['GET'])
def serve_movies():

	movies = [
  {
    "Release_Date": "2021-12-15",
    "Title": "Spider-Man: No Way Home",
    "Overview": "Peter Parker is unmasked and no longer able to separate his normal life from the high-stakes of being a super-hero. When he asks for help from Doctor Strange the stakes become even more dangerous, forcing him to discover what it truly means to be Spider-Man.",
    "Popularity": 5083.954,
    "Vote_Count": 8940,
    "Vote_Average": 8.3,
    "Original_Language": "en",
    "Genre": "Action, Adventure, Science Fiction",
    "Poster_Url": "https://image.tmdb.org/t/p/original/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg"
  },
  {
    "Release_Date": "2022-03-01",
    "Title": "The Batman",
    "Overview": "In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family while facing a serial killer known as the Riddler.",
    "Popularity": 3827.658,
    "Vote_Count": 1151,
    "Vote_Average": 8.1,
    "Original_Language": "en",
    "Genre": "Crime, Mystery, Thriller",
    "Poster_Url": "https://image.tmdb.org/t/p/original/74xTEgt7R36Fpooo50r9T25onhq.jpg"
  },
  {
    "Release_Date": "2022-02-25",
    "Title": "No Exit",
    "Overview": "Stranded at a rest stop in the mountains during a blizzard, a recovering addict discovers a kidnapped child hidden in a car belonging to one of the people inside the building which sets her on a terrifying struggle to identify who among them is the kidnapper.",
    "Popularity": 2618.087,
    "Vote_Count": 122,
    "Vote_Average": 6.3,
    "Original_Language": "en",
    "Genre": "Thriller",
    "Poster_Url": "https://image.tmdb.org/t/p/original/vDHsLnOWKlPGmWs0kGfuhNF4w5l.jpg"
  }
]
	resp = {
		'message': 'ok',
		'movies': movies
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
