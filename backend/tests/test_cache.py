"""Tests of the two-level cache (backend/cache.py) and of its use by the API.

No memcached needed: FakeMemcached is a tiny server speaking memcached's text protocol, and the
real pymemcache client talks to it over a real TCP socket.
"""
import socket
import socketserver
import threading
import time

import pytest

pytest.importorskip("pymemcache")

import backend.app as backend_app                                  # noqa: E402
from backend.cache import ResponseCache, SharedCache, build_cache, parse_servers  # noqa: E402


class _Handler(socketserver.StreamRequestHandler):
    def handle(self):
        store = self.server.store
        while True:
            line = self.rfile.readline()
            if not line:
                return
            parts = line.split()
            if not parts:
                continue
            command = parts[0]
            if command in (b"get", b"gets"):
                for key in parts[1:]:
                    if key in store:
                        self.wfile.write(b"VALUE %s 0 %d\r\n%s\r\n" % (key, len(store[key]), store[key]))
                self.wfile.write(b"END\r\n")
            elif command == b"set":
                key, _flags, _expire, size = parts[1:5]
                data = self.rfile.read(int(size) + 2)[:-2]
                store[key] = data
                if parts[-1] != b"noreply":
                    self.wfile.write(b"STORED\r\n")
            elif command == b"version":
                self.wfile.write(b"VERSION fake\r\n")
            elif command == b"quit":
                return
            else:
                self.wfile.write(b"ERROR\r\n")


@pytest.fixture
def memcached():
    """A running fake memcached: yields (address as "host:port", dict of what is stored)."""
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _Handler)
    server.daemon_threads = True
    server.store = {}
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"127.0.0.1:{server.server_address[1]}", server.store
    server.shutdown()
    server.server_close()


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for(condition, timeout=2.0):
    """The client sets without waiting for a reply: give the fake server a moment to store it."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.01)
    return False


class TestConfiguration:
    def test_server_list(self):
        assert parse_servers("cache:11211, other") == [("cache", 11211), ("other", 11211)]

    @pytest.mark.parametrize("value", ["", "off", "OFF", "none", "0"])
    def test_disabled_values(self, value):
        assert build_cache("v1", env={"MEMCACHED_SERVERS": value}).shared is None

    def test_disabled_when_not_configured(self):
        assert build_cache("v1", env={}).shared is None

    def test_keys_are_valid_for_memcached_and_include_the_data_version(self):
        cache = build_cache("123-456", env={})
        key = cache.key("allmovies", (0, 20, "a very long title " * 50, (), "", 0.0, (), None, "asc"))
        assert len(key) <= 250 and " " not in key and "123-456" in key
        assert key != cache.key("allmovies", (20, 40))
        assert build_cache("999-000", env={}).key("allmovies", (0, 20)) != cache.key("allmovies", (0, 20))


class TestSharedCache:
    def test_round_trip(self, memcached):
        address, _ = memcached
        cache = SharedCache(address)
        assert cache.get("missing") is None
        cache.set("k", b'{"a": 1}')
        assert _wait_for(lambda: cache.get("k") == b'{"a": 1}')

    def test_dead_server_never_breaks_and_is_skipped_for_a_while(self):
        cache = SharedCache(f"127.0.0.1:{_free_port()}", retry_after=60)     # nothing listens there
        started = time.monotonic()
        assert cache.get("k") is None
        cache.set("k", b"v")                                                 # must not raise either
        assert time.monotonic() - started < 1.5
        assert not cache._available()                                        # one failure: not retried for 60 s


class TestTwoLevels:
    def test_computes_once_then_serves_from_memory(self):
        calls = []
        cache = ResponseCache()
        compute = lambda: calls.append(1) or b"body"
        assert cache.get_or_compute("k", compute) == (b"body", "miss")
        assert cache.get_or_compute("k", compute) == (b"body", "memory")
        assert len(calls) == 1

    def test_a_second_cache_with_the_same_memcached_does_not_recompute(self, memcached):
        """Two ResponseCache objects stand for two replicas: one computes, the other reuses."""
        address, store = memcached
        calls = []
        compute = lambda: calls.append(1) or b"body"

        replica_a = ResponseCache(SharedCache(address))
        assert replica_a.get_or_compute("k", compute) == (b"body", "miss")
        assert _wait_for(lambda: store)

        replica_b = ResponseCache(SharedCache(address))                      # empty memory of its own
        assert replica_b.get_or_compute("k", compute) == (b"body", "memcached")
        assert replica_b.get_or_compute("k", compute) == (b"body", "memory")  # now also in its own memory
        assert len(calls) == 1

    def test_memory_is_bounded(self):
        cache = ResponseCache(maxsize=2)
        for key in "abc":
            cache.get_or_compute(key, lambda: b"x")
        assert cache.get_or_compute("a", lambda: b"x")[1] == "miss"          # the oldest one was evicted

    def test_memcached_down_means_computing_not_failing(self):
        cache = ResponseCache(SharedCache(f"127.0.0.1:{_free_port()}"))
        assert cache.get_or_compute("k", lambda: b"body") == (b"body", "miss")
        assert cache.get_or_compute("k", lambda: b"body") == (b"body", "memory")


class TestApi:
    @pytest.fixture
    def client(self, monkeypatch, memcached):
        address, self_store = memcached
        self.address, self.store = address, self_store
        monkeypatch.setattr(backend_app, "_cache", ResponseCache(SharedCache(address)))
        backend_app.app.config["TESTING"] = True
        with backend_app.app.test_client() as client:
            yield client

    def _new_replica(self, monkeypatch):
        """Same memcached, empty in-process memory: what another replica or a restart looks like."""
        monkeypatch.setattr(backend_app, "_cache", ResponseCache(SharedCache(self.address)))

    @pytest.mark.parametrize("url", [
        "/allmovies?start=0&end=20&genre=Drama&order_by=popularity&order_desc=desc",
        "/statistics?dates=1990&dates=2020",
    ])
    def test_answers_come_from_memory_then_memcached_and_are_identical(self, client, monkeypatch, url):
        first = client.get(url)
        assert first.status_code == 201 and first.headers["X-App-Cache"] == "miss"
        assert client.get(url).headers["X-App-Cache"] == "memory"
        assert _wait_for(lambda: self.store)

        self._new_replica(monkeypatch)
        third = client.get(url)
        assert third.headers["X-App-Cache"] == "memcached"
        assert third.status_code == 201 and third.mimetype == "application/json"
        assert third.get_data() == first.get_data()

    def test_big_answers_are_not_cached(self, client):
        response = client.get("/allmovies?start=0&end=500")
        assert response.status_code == 201
        assert "X-App-Cache" not in response.headers

    def test_different_queries_do_not_share_an_answer(self, client):
        a = client.get("/allmovies?start=0&end=20&genre=Drama")
        b = client.get("/allmovies?start=0&end=20&genre=Comedy")
        assert a.headers["X-App-Cache"] == b.headers["X-App-Cache"] == "miss"
        assert a.get_data() != b.get_data()
