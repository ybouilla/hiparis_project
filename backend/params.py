"""Reading and checking the query parameters of the API.

Anything a client can send is checked here, before a data store sees it: a bad value gets a
400 answer that says what is wrong, instead of a crash (500) or an expensive query.
Parameters the API does not know are ignored.
"""
import math
import re

# The biggest page one request can get (the statistics page of the front end asks for 500).
MAX_PAGE_SIZE = 500
MAX_START = 1_000_000
MAX_TITLE_LENGTH = 200
MAX_GENRES = 30
MAX_GENRE_LENGTH = 50
SORT_FIELDS = ("popularity", "release_date", "vote_count", "vote_average")


class BadRequest(ValueError):
    """A query parameter is not acceptable; the message is sent to the client."""


def _integer(args, name, default, low, high):
    text = args.get(name)
    if text is None or text == "":
        return default
    if not re.fullmatch(r"[0-9]{1,9}", text) or not low <= int(text) <= high:
        raise BadRequest(f"'{name}' must be a whole number from {low} to {high}")
    return int(text)


def _text(value, name, max_length):
    if len(value) > max_length:
        raise BadRequest(f"'{name}' is longer than {max_length} characters")
    if any(ord(c) < 32 or ord(c) == 127 for c in value):      # PostgreSQL refuses a NUL byte, for one
        raise BadRequest(f"'{name}' contains control characters")
    return value


def _score(args):
    text = args.get("score")
    if text is None or text == "":
        return 0.0
    try:
        score = float(text)
    except ValueError:
        score = math.nan
    if not 0 <= score <= 10:                                   # false for nan and inf too
        raise BadRequest("'score' must be a number from 0 to 10")
    return score


def parse_dates(args):
    """The release-year range: () or two years, ("1990", "2000")."""
    dates = args.getlist("dates")
    if not dates:
        return ()
    if len(dates) != 2 or not all(re.fullmatch(r"[0-9]{4}", d) for d in dates) or int(dates[0]) > int(dates[1]):
        raise BadRequest("'dates' must be given twice, as two years in order: dates=1990&dates=2000")
    return tuple(dates)


def parse_movie_query(args):
    """The arguments of store.query_movies(), in its order."""
    start = _integer(args, "start", 0, 0, MAX_START)
    end = _integer(args, "end", start + MAX_PAGE_SIZE, 0, MAX_START + MAX_PAGE_SIZE)
    if not 0 <= end - start <= MAX_PAGE_SIZE:
        raise BadRequest(f"'end' must be from 'start' to 'start' + {MAX_PAGE_SIZE}")

    genres = args.getlist("genre")
    if len(genres) > MAX_GENRES:
        raise BadRequest(f"at most {MAX_GENRES} genres")
    language = args.get("lang", "")
    if not re.fullmatch(r"[A-Za-z-]{0,10}", language):
        raise BadRequest("'lang' must be a language code such as 'en'")

    order_by = args.get("order_by") or None                    # empty: the front end's "no sorting"
    if order_by is not None and order_by not in SORT_FIELDS:
        raise BadRequest(f"'order_by' must be one of: {', '.join(SORT_FIELDS)}")
    order_desc = args.get("order_desc") or "asc"
    if order_desc not in ("asc", "desc"):
        raise BadRequest("'order_desc' must be 'asc' or 'desc'")

    return (
        start,
        end,
        _text(args.get("title", ""), "title", MAX_TITLE_LENGTH),
        tuple(sorted(_text(g, "genre", MAX_GENRE_LENGTH) for g in genres)),  # "any of": order is irrelevant
        language,
        _score(args),
        parse_dates(args),
        order_by,
        order_desc,
    )
