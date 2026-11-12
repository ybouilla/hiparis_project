#!/bin/sh
# A private PostgreSQL for local development: no Docker, no root, no system service.
#
#   scripts/localdb.sh start     # first run: creates the cluster and the database, then starts it
#   scripts/localdb.sh status
#   scripts/localdb.sh psql      # open a SQL shell (extra arguments are passed to psql)
#   scripts/localdb.sh url       # print the connection URL
#   scripts/localdb.sh stop
#   scripts/localdb.sh reset     # stop and DELETE all the local data (asks first)
#
# It only needs the PostgreSQL *server* programs installed on the machine (initdb, pg_ctl, psql):
#   Debian / Ubuntu / WSL:  sudo apt install postgresql      (its own system service is not used)
#   macOS:                  brew install postgresql@17
# The data lives in ./.localdb (git-ignored). The server listens on 127.0.0.1 only.
#
# Settings (same variables as the pipeline, docker compose and dbt):
#   POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB   default: movies / movies / movies
#   POSTGRES_PORT                                      default: 5432
#   LOCALDB_DIR                                        default: <repo>/.localdb
#   PG_BIN                                             directory of the PostgreSQL programs, if not found
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR="${LOCALDB_DIR:-$ROOT/.localdb}"
DATA="$DIR/data"
LOG="$DIR/postgres.log"

DB_USER="${POSTGRES_USER:-movies}"
DB_PASSWORD="${POSTGRES_PASSWORD:-movies}"
DB_NAME="${POSTGRES_DB:-movies}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_HOST=127.0.0.1

die() { echo "localdb: $*" >&2; exit 1; }

# ---- find the PostgreSQL programs ------------------------------------------------------------
find_pg_bin() {
    if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN"; return 0; fi
    if command -v pg_config >/dev/null 2>&1; then
        dir=$(pg_config --bindir 2>/dev/null || true)
        if [ -n "$dir" ] && [ -x "$dir/initdb" ]; then echo "$dir"; return 0; fi
    fi
    if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return 0; fi
    # Debian / Ubuntu keep them out of the PATH; Homebrew and the EDB installer too
    for dir in $(ls -d /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin \
                       /usr/local/opt/postgresql@*/bin /Library/PostgreSQL/*/bin 2>/dev/null | sort -r); do
        if [ -x "$dir/initdb" ]; then echo "$dir"; return 0; fi
    done
    return 1
}

BIN=$(find_pg_bin) || die "PostgreSQL server programs not found (initdb, pg_ctl). Install PostgreSQL
  (Debian/Ubuntu/WSL: sudo apt install postgresql; macOS: brew install postgresql@17)
  or set PG_BIN to the directory that contains initdb."

pg_url() { echo "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"; }
is_running() { "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; }
run_psql() { PGPASSWORD="$DB_PASSWORD" "$BIN/psql" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$@"; }

# ---- commands ---------------------------------------------------------------------------------
init_cluster() {
    if [ -f "$DATA/PG_VERSION" ]; then return 0; fi
    echo "creating a new PostgreSQL cluster in $DATA"
    mkdir -p "$DIR"
    pwfile=$(mktemp)
    chmod 600 "$pwfile"
    printf '%s' "$DB_PASSWORD" > "$pwfile"
    # --no-locale: the "C" locale, so sorting does not depend on the machine's language settings.
    # The role $DB_USER is the cluster's superuser (fine for a local development database).
    "$BIN/initdb" -D "$DATA" -U "$DB_USER" --pwfile="$pwfile" --auth=scram-sha-256 \
        -E UTF8 --no-locale >/dev/null || { rm -f "$pwfile"; die "initdb failed"; }
    rm -f "$pwfile"
}

cmd_start() {
    init_cluster
    if is_running; then
        echo "already running"
    else
        # TCP on 127.0.0.1 only, no unix socket (its path length is limited and we do not need it)
        "$BIN/pg_ctl" -D "$DATA" -l "$LOG" -w -t 60 \
            -o "-p $DB_PORT -c listen_addresses=$DB_HOST -c unix_socket_directories= -c max_connections=30" \
            start >/dev/null || {
            echo "localdb: PostgreSQL did not start. Last lines of $LOG:" >&2
            tail -n 15 "$LOG" >&2 || true
            die "if port $DB_PORT is already used (a system PostgreSQL?), set POSTGRES_PORT=5433 and retry"
        }
    fi
    exists=$(printf "SELECT 1 FROM pg_database WHERE datname = :'db'" | run_psql -d postgres -v db="$DB_NAME" -At)
    if [ "$exists" != "1" ]; then
        PGPASSWORD="$DB_PASSWORD" "$BIN/createdb" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
        echo "created database $DB_NAME"
    fi
    echo "ready: $(pg_url)"
}

cmd_stop() {
    if is_running; then "$BIN/pg_ctl" -D "$DATA" -m fast -w stop >/dev/null && echo "stopped"; else echo "not running"; fi
}

cmd_status() {
    if is_running; then echo "running: $(pg_url)"; else echo "not running (data: $DATA)"; exit 3; fi
}

cmd_reset() {
    # only ever delete a real PostgreSQL cluster created by this script (never an arbitrary folder)
    case "$DATA" in */data) ;; *) die "refusing to delete $DATA" ;; esac
    [ -f "$DATA/PG_VERSION" ] || die "no PostgreSQL cluster in $DATA: nothing to reset"
    printf 'Delete ALL the local database data in %s? [y/N] ' "$DIR"
    read -r answer
    case "$answer" in y|Y|yes) ;; *) echo "cancelled"; exit 1 ;; esac
    if is_running; then "$BIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null; fi
    rm -rf -- "$DATA" "$LOG"
    echo "local database deleted"
}

case "${1:-}" in
    start)  cmd_start ;;
    stop)   cmd_stop ;;
    status) cmd_status ;;
    psql)   shift; is_running || die "not running: start it with  scripts/localdb.sh start"; run_psql -d "$DB_NAME" "$@" ;;
    url)    pg_url ;;
    reset)  cmd_reset ;;
    *)      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
