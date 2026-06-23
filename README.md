# Project: Challenge – Visualisation d’une base de données de films

## Goal: Sujet
Vous disposez d’un fichier contenant une base de données de films (movies.csv). Votre mission est de produire une plateforme permettant de visualiser au mieux l’intégralité de cette base de données.  


## setup
The following project needs the following setup to be launched:

    * uv or any other virtual environment
    * npm or pnpm
    * nodejs


* Using `uv`package manager
(*Nota: here we are using `uv`as package manager; other packages manager should be working but havenot been tested*)
```shell
uv venv
source .venv/bin/activate
```
* Using `npm`package manager
```shell
cd frontend
npm install
```

## Deploy
run in your terminal (from the root folder):

```shell
gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
```
And then try to reach it from a webbrowser: http://localhost:5000
If it doesnot work, try to open it from a incognito internet browsing window


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

To use the full project in development mode, enter the command for backend and frontend in 2 seperate terminals.
## Possible improvements:

- using sql database and grafana (more production oriented)
- for frontend (using react.js )

frontend: 
- search also content in text.
- better display component in react