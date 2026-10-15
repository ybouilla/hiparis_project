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

# gthread honours HTTP keep-alive (sync does not). The default idle timeout is 2s, which
# races with clients that reuse a connection after a 1-2s pause: the server closes it just
# as the client sends, and the client sees "Connection reset by peer". Keep idle
# connections open longer than any realistic client pause (idle ones don't hold a thread).
keepalive = 75
