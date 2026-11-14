#!/bin/sh
set -e

case "$MODE" in
  test)
    # The backend tests only: this image has no Node.js, so the frontend tests (Jest, Playwright)
    # run in their own CI jobs. `exec` makes pytest's exit code the container's, so
    # `docker run -e MODE=test ...` fails when a test fails. No cache dir: the code is read-only here.
    echo "Running tests..."
    exec python -m pytest -v -p no:cacheprovider backend/tests
    ;;

  serve)
    echo "Running server..."
    exec gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
    ;;

  *)
    echo "Unknown MODE: $MODE"
    exit 1
    ;;
esac
