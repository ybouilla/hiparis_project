#!/usr/bin/env python3
"""Judge a Locust run made through a Cloudflare quick tunnel.

    locust ... --csv=tunnel --exit-code-on-error 0
    python scripts/check_tunnel_failures.py tunnel --max-percent 5

Status 530 is an error page of Cloudflare itself: its network could not reach the tunnel at that
moment. The app never sends it, and a free quick tunnel has no uptime guarantee, so a small share of
them is accepted (with a warning). The check fails if there is any other failure, any exception in the
load test, no request at all, or more 530s than the limit.
"""
import argparse
import csv
import re
import sys

TUNNEL_ERROR = re.compile(r"Unexpected status: 530\b")


def rows(path):
    with open(path, newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def main():
    parser = argparse.ArgumentParser(description="Accept a few Cloudflare 530s, nothing else.")
    parser.add_argument("prefix", help="the value given to locust --csv")
    parser.add_argument("--max-percent", type=float, default=5.0, help="largest accepted share of 530 answers")
    args = parser.parse_args()

    total = sum(int(r["Request Count"]) for r in rows(f"{args.prefix}_stats.csv") if r["Name"] == "Aggregated")
    if total == 0:
        sys.exit("no request was made: nothing was tested")

    tunnel, other = 0, []
    for failure in rows(f"{args.prefix}_failures.csv"):
        if TUNNEL_ERROR.search(failure["Error"]):
            tunnel += int(failure["Occurrences"])
        else:
            other.append(f"{failure['Occurrences']} x {failure['Method']} {failure['Name']}: {failure['Error']}")
    # an exception in the test code is not listed among the failures
    other += [f"{e['Count']} x exception: {e['Message']}" for e in rows(f"{args.prefix}_exceptions.csv")]

    percent = 100 * tunnel / total
    print(f"{total} requests, {tunnel} Cloudflare 530 ({percent:.2f} %, limit {args.max_percent} %), "
          f"{len(other)} other kind(s) of failure")
    if other:
        sys.exit("failures that do not come from the tunnel:\n  " + "\n  ".join(other))
    if percent > args.max_percent:
        sys.exit("too many 530 answers: the tunnel was not usable (see the cloudflared log)")
    if tunnel:
        # shown as an annotation on the GitHub run
        print(f"::warning::{tunnel} of {total} requests got Cloudflare error 530 (tunnel unreachable for a moment)")


if __name__ == "__main__":
    main()
