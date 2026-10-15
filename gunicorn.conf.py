# Picked up automatically by `gunicorn` when run from the repo root (or from / in the image).
#
# The default "sync" worker serves one connection at a time. Browsers open idle
# speculative connections, which then block the only worker until gunicorn kills it
# ("WORKER TIMEOUT ... Error handling request (no URI read)") and the page never loads.
# Threads let a worker keep serving while one connection sits idle.
#
# Number of workers still comes from WEB_CONCURRENCY (default 1).
worker_class = "gthread"
threads = 4
