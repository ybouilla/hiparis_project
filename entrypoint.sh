#!/bin/sh
set -e


case "$MODE" in
  test)
    echo "Running tests..."
    exec pytest -v backend/tests

    sleep 5

    cd frontend
    exec npm test

    sleep 5

    exec npx playwright test
    ;;
      
  serve)
    echo "Running server..."
    gunicorn --bind 0.0.0.0:5000 backend.wsgi:app

    echo "Done."
        ;;
    *)
        echo "Unknown MODE: $MODE"
        exit 1
        ;;
    esac
