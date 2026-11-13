"""Two-level cache for the API answers.

Level 1: a small LRU in the memory of each gunicorn worker. Fastest, but private to the worker.
Level 2: memcached (optional). Shared by every worker of every replica, so an answer computed by
         one of them can be served by all the others, and it survives a restart of the app.

What is cached is the final response body (bytes), so a hit also skips the JSON serialisation.

Memcached is never required. It is used only when MEMCACHED_SERVERS is set (e.g. "memcached:11211",
comma-separated for several servers); "off" or an empty value disables it. If the server cannot be
reached, the answer is simply computed, and memcached is not tried again for a few seconds, so a
dead server costs at most one short timeout, not one per request.
"""
import argparse
import hashlib
import logging
import os
import sys
import threading
import time
from collections import OrderedDict
from typing import Callable, Optional, Tuple

log = logging.getLogger(__name__)

# Bump when the shape of a cached answer changes: answers cached by an older version of the app
# (memcached may outlive a deployment) are then never read.
CACHE_FORMAT = 1

DISABLED = {"", "off", "none", "false", "0"}
DEFAULT_PORT = 11211


class LRU:
    """Thread-safe least-recently-used dictionary."""

    def __init__(self, maxsize: int = 256):
        self._maxsize = maxsize
        self._data: "OrderedDict[str, bytes]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[bytes]:
        with self._lock:
            value = self._data.get(key)
            if value is not None:
                self._data.move_to_end(key)
            return value

    def set(self, key: str, value: bytes) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)


def parse_servers(value: str):
    """"a:11211, b" -> [("a", 11211), ("b", 11211)]"""
    servers = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        host, _, port = item.rpartition(":")
        if not host:                      # no ":port" part
            host, port = item, str(DEFAULT_PORT)
        servers.append((host, int(port)))
    return servers


class SharedCache:
    """memcached, wrapped so that it never raises and is skipped for a while after a failure."""

    def __init__(self, servers: str, ttl: int = 3600, timeout: float = 0.25, retry_after: float = 10.0):
        from pymemcache.client.base import PooledClient       # imported here: only needed when enabled
        from pymemcache.client.hash import HashClient

        addresses = parse_servers(servers)
        if not addresses:
            raise ValueError("no memcached server given")
        options = dict(connect_timeout=timeout, timeout=timeout, no_delay=True)
        if len(addresses) == 1:
            # a pool, because gunicorn's threads would otherwise share one connection
            self._client = PooledClient(addresses[0], max_pool_size=8, **options)
        else:
            self._client = HashClient(addresses, use_pooling=True, max_pool_size=8, **options)
        self._ttl = ttl
        self._retry_after = retry_after
        self._down_until = 0.0

    def _available(self) -> bool:
        return time.monotonic() >= self._down_until

    def _failed(self, operation: str, error: Exception) -> None:
        self._down_until = time.monotonic() + self._retry_after
        log.warning("memcached %s failed (%s): not used for the next %.0f s", operation, error, self._retry_after)

    def get(self, key: str) -> Optional[bytes]:
        if not self._available():
            return None
        try:
            return self._client.get(key)
        except Exception as error:                            # network error, timeout, protocol error...
            self._failed("get", error)
            return None

    def set(self, key: str, value: bytes) -> None:
        if not self._available():
            return
        try:
            self._client.set(key, value, expire=self._ttl)    # fire and forget: no wait for the reply
        except Exception as error:
            self._failed("set", error)


class ResponseCache:
    """LRU in front of (optional) memcached."""

    def __init__(self, shared: Optional[SharedCache] = None, maxsize: int = 256, namespace: str = ""):
        self.local = LRU(maxsize)
        self.shared = shared
        self._namespace = namespace

    def key(self, kind: str, args) -> str:
        """A memcached key: at most 250 bytes, no spaces, so the arguments are hashed."""
        digest = hashlib.sha1(repr(args).encode("utf-8")).hexdigest()
        return f"{self._namespace}{kind}-{digest}"

    def get_or_compute(self, key: str, compute: Callable[[], bytes]) -> Tuple[bytes, str]:
        """Returns (body, where it came from): "memory", "memcached" or "miss"."""
        body = self.local.get(key)
        if body is not None:
            return body, "memory"
        if self.shared is not None:
            body = self.shared.get(key)
            if body is not None:
                self.local.set(key, body)
                return body, "memcached"
        body = compute()
        self.local.set(key, body)
        if self.shared is not None:
            self.shared.set(key, body)
        return body, "miss"


def build_cache(data_version: str, env=os.environ) -> ResponseCache:
    """The cache of the app, configured from MEMCACHED_SERVERS and MEMCACHED_TTL (seconds)."""
    servers = env.get("MEMCACHED_SERVERS", "").strip()
    shared = None
    if servers.lower() not in DISABLED:
        try:
            shared = SharedCache(servers, ttl=int(env.get("MEMCACHED_TTL", "3600")))
            log.info("answers are also cached in memcached (%s)", servers)
        except ImportError:
            log.warning("MEMCACHED_SERVERS is set but pymemcache is not installed: memcached is not used")
    # the data version is part of every key: a new movies.csv never gets answers computed from the old one
    return ResponseCache(shared, namespace=f"movies-v{CACHE_FORMAT}-{data_version}-")


# ------------------------------------------------------------------------------------------------
# Command line: python -m backend.cache ping|stats|flush
# Used by scripts/localcache.sh, and handy to look at what memcached holds.
# ------------------------------------------------------------------------------------------------

def _text(value):
    return value.decode("utf-8", "replace") if isinstance(value, bytes) else value


def _describe(stats: dict) -> str:
    """One readable block from memcached's `stats` answer."""
    s = {_text(k): _text(v) for k, v in stats.items()}
    hits, misses = int(s.get("get_hits", 0)), int(s.get("get_misses", 0))
    rate = f"{100 * hits / (hits + misses):.0f} %" if hits + misses else "no request yet"
    used, limit = int(s.get("bytes", 0)), int(s.get("limit_maxbytes", 0))
    return "\n".join([
        f"  version      {s.get('version', '?')}",
        f"  uptime       {s.get('uptime', '?')} s",
        f"  items        {s.get('curr_items', '?')}",
        f"  memory       {used / 1e6:.1f} MB used of {limit / 1e6:.0f} MB",
        f"  gets         {hits} hits, {misses} misses (hit rate: {rate})",
        f"  evictions    {s.get('evictions', '?')}",
    ])


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m backend.cache",
        description="Look at the memcached used by the API (servers: --servers, else $MEMCACHED_SERVERS, else 127.0.0.1:11211).")
    parser.add_argument("command", choices=["ping", "stats", "flush"],
                        help="ping: is it answering?  stats: items, memory, hit rate.  flush: forget every cached answer")
    parser.add_argument("--servers", default=None)
    args = parser.parse_args(argv)

    servers = args.servers or os.environ.get("MEMCACHED_SERVERS") or f"127.0.0.1:{DEFAULT_PORT}"
    if servers.strip().lower() in DISABLED:
        print("memcached is turned off (MEMCACHED_SERVERS=off)")
        return 2
    try:
        from pymemcache.client.base import Client
    except ImportError:
        print("pymemcache is not installed: pip install -r requirements.txt")
        return 2

    exit_code = 0
    for host, port in parse_servers(servers):
        # replies are awaited here (default_noreply=False) so that flush can say it worked
        client = Client((host, port), connect_timeout=1.0, timeout=1.0, default_noreply=False)
        try:
            version = _text(client.version())
            if args.command == "ping":
                print(f"{host}:{port}  memcached {version}")
            elif args.command == "stats":
                print(f"{host}:{port}\n{_describe(client.stats())}")
            else:
                client.flush_all()
                print(f"{host}:{port}  flushed")
        except Exception as error:
            print(f"{host}:{port}  not reachable ({error})")
            exit_code = 1
        finally:
            client.close()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
