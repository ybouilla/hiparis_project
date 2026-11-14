#!/bin/sh
# A private memcached for running the app WITHOUT Docker: no root, no system service.
#
#   scripts/localcache.sh start      # start it (nothing to do if one already answers)
#   scripts/localcache.sh status
#   scripts/localcache.sh stats      # items, memory, hit rate
#   scripts/localcache.sh flush      # forget every cached answer
#   scripts/localcache.sh stop
#   scripts/localcache.sh env        # prints the export line:  eval "$(scripts/localcache.sh env)"
#   scripts/localcache.sh run CMD... # start it, then run CMD with MEMCACHED_SERVERS set, e.g.
#                                    #   scripts/localcache.sh run gunicorn --bind 0.0.0.0:5000 backend.wsgi:app
#                                    #   scripts/localcache.sh run flask --app backend/app.py run
#
# It only needs the memcached program installed:
#   Debian / Ubuntu / WSL:  sudo apt install memcached      macOS:  brew install memcached
# (On Debian / Ubuntu the package also starts a system memcached on 127.0.0.1:11211: this script then
#  simply uses it, and never stops it. Use MEMCACHED_PORT=11311 for a separate private one.)
# It listens on 127.0.0.1 only. The app uses it when MEMCACHED_SERVERS is set (see backend/cache.py).
#
# Settings:  MEMCACHED_PORT (11211)   MEMCACHED_MEMORY in MB (64)   MEMCACHED_BIN   PYTHON   LOCALCACHE_DIR
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR="${LOCALCACHE_DIR:-$ROOT/.localcache}"
PIDFILE="$DIR/memcached.pid"
LOG="$DIR/memcached.log"
HOST=127.0.0.1
PORT="${MEMCACHED_PORT:-11211}"
MEMORY="${MEMCACHED_MEMORY:-64}"
SERVERS="$HOST:$PORT"

die() { echo "localcache: $*" >&2; exit 1; }

# ---- find the programs ------------------------------------------------------------------------
find_memcached() {
    if [ -n "${MEMCACHED_BIN:-}" ]; then echo "$MEMCACHED_BIN"; return 0; fi
    if command -v memcached >/dev/null 2>&1; then command -v memcached; return 0; fi
    for path in /usr/bin/memcached /usr/local/bin/memcached /opt/homebrew/bin/memcached; do
        if [ -x "$path" ]; then echo "$path"; return 0; fi
    done
    return 1
}

find_python() {
    if [ -n "${PYTHON:-}" ]; then echo "$PYTHON"; return 0; fi
    for candidate in "$ROOT/.venv/bin/python" python3 python; do
        if command -v "$candidate" >/dev/null 2>&1; then command -v "$candidate"; return 0; fi
    done
    return 1
}

# python -m backend.cache ... : the project's own client, so no extra tool (nc, telnet) is needed
cache_cli() {
    py=$(find_python) || die "python not found"
    (cd "$ROOT" && MEMCACHED_SERVERS="$SERVERS" PYTHONPATH="$ROOT" "$py" -m backend.cache "$@")
}

answers() { cache_cli ping >/dev/null 2>&1; }

# the process started by this script, if it still runs (the check on the command line protects
# against a stale pid file whose number now belongs to another program)
our_pid() {
    [ -f "$PIDFILE" ] || return 1
    pid=$(cat "$PIDFILE")
    kill -0 "$pid" 2>/dev/null || return 1
    ps -p "$pid" -o args= 2>/dev/null | grep -q memcached || return 1
    echo "$pid"
}

# ---- commands ---------------------------------------------------------------------------------
cmd_start() {
    if pid=$(our_pid); then
        echo "already running (pid $pid) on $SERVERS"
        return 0
    fi
    if answers; then
        echo "a memcached already answers on $SERVERS (not started by this script): using it"
        return 0
    fi
    bin=$(find_memcached) || die "memcached is not installed.
  Debian / Ubuntu / WSL: sudo apt install memcached     macOS: brew install memcached
  (or set MEMCACHED_BIN to the program)"
    mkdir -p "$DIR"
    # memcached refuses to run as root unless told which user to use
    user_option=""
    if [ "$(id -u)" = "0" ]; then user_option="-u nobody"; fi
    # shellcheck disable=SC2086  (the options are meant to be split)
    nohup "$bin" -l "$HOST" -p "$PORT" -m "$MEMORY" -c 512 -t 2 -U 0 $user_option >"$LOG" 2>&1 &
    pid=$!
    echo "$pid" > "$PIDFILE"
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        if answers; then
            if kill -0 "$pid" 2>/dev/null; then
                echo "started on $SERVERS (${MEMORY} MB). To let the app use it:  export MEMCACHED_SERVERS=$SERVERS"
            else
                # our process exited (the port was taken) but something answers there: use that one
                rm -f "$PIDFILE"
                echo "a memcached already answers on $SERVERS (not started by this script): using it"
            fi
            return 0
        fi
        kill -0 "$pid" 2>/dev/null || break      # it died and nothing answers: no need to wait
        sleep 1
    done
    echo "localcache: memcached did not start. Last lines of $LOG:" >&2
    tail -n 10 "$LOG" >&2 || true
    rm -f "$PIDFILE"
    die "if port $PORT is already used by another program, set MEMCACHED_PORT=11311 and retry"
}

cmd_stop() {
    if pid=$(our_pid); then
        kill "$pid"
        for _ in 1 2 3 4 5; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 1
        done
        rm -f "$PIDFILE"
        echo "stopped"
    elif answers; then
        echo "a memcached answers on $SERVERS but was not started by this script: not touching it"
    else
        echo "not running"
    fi
}

cmd_status() {
    if pid=$(our_pid); then
        echo "running (pid $pid) on $SERVERS"
    elif answers; then
        echo "a memcached answers on $SERVERS (not started by this script)"
    else
        echo "not running"
        exit 3
    fi
}

case "${1:-}" in
    start)  cmd_start ;;
    stop)   cmd_stop ;;
    status) cmd_status ;;
    stats)  cache_cli stats ;;
    flush)  cache_cli flush ;;
    env)    echo "export MEMCACHED_SERVERS=$SERVERS" ;;
    run)
        shift
        [ "$#" -gt 0 ] || die "usage: scripts/localcache.sh run COMMAND [ARGS...]"
        cmd_start
        MEMCACHED_SERVERS="$SERVERS"
        export MEMCACHED_SERVERS
        exec "$@"
        ;;
    *)      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
