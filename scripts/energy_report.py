#!/usr/bin/env python3
"""Energy per request, from the measurements of the Eco CI GitHub action.

    python scripts/energy_report.py --data /tmp/eco-ci/lap-data.json \
        --idle "idle 30 s" --phase "load, nginx cache bypassed=1432" --phase "load, caches on=3010"

Eco CI (github.com/green-coding-solutions/eco-ci-energy-estimation) estimates the energy of the CI
machine from its CPU use. Started with `json-output: true`, each `get-measurement` step adds one
entry (label, energy in joules, duration in seconds, ...) to /tmp/eco-ci/lap-data.json. The job
summary cannot be used for this: every step of a job has its own summary file.

    --idle  "label"            a phase without load: gives the power of the idle stack, in watts
    --phase "label=requests"   a load phase and the number of requests it served (from Locust)

For each load phase it prints the energy, the energy per request, and the same without the idle
share (what the requests themselves cost). The durations are the ones Eco CI measured.

What the numbers are and are not: an ESTIMATE of the CPU energy of a shared virtual machine, from a
model (not a power meter), and the load generator runs on that same machine. Good to compare two runs
of the same job and to spot a regression; not an absolute figure for a server.
"""
import argparse
import json
import sys


def read_measurements(path):
    """{label: (energy in joules, duration in seconds)}"""
    try:
        with open(path, encoding="utf-8") as data:
            steps = json.load(data)["steps"]
        return {s["label"]: (float(s["energy_joules"]), float(s["time"])) for s in steps}
    except FileNotFoundError:
        sys.exit(f"{path} not found: was Eco CI's start-measurement step given 'json-output: true'?")
    except (ValueError, KeyError, TypeError) as error:
        sys.exit(f"{path} does not have the expected Eco CI format ({type(error).__name__}: {error})")


def parse_phase(item):
    """"load=1000" -> ("load", 1000)"""
    label, _, requests = item.rpartition("=")
    if not label or not requests.strip().isdigit():
        sys.exit(f"--phase: expected 'label=number of requests', got {item!r}")
    return label, int(requests)


def report(measured, idle, phases):
    wanted = ([idle] if idle else []) + [label for label, _ in phases]
    missing = [label for label in wanted if label not in measured]
    if missing:
        sys.exit(f"missing measurement(s): {missing}. Measured: {list(measured) or 'nothing'}. "
                 "Did the get-measurement steps use these exact labels?")

    lines = ["### Energy per request (CPU of the CI machine, modelled by Eco CI)", "",
             "| Phase | Requests | Duration (s) | Energy (J) | Per request (mJ) | Per request without the idle stack (mJ) |",
             "|---|---|---|---|---|---|"]
    idle_watts = None
    if idle:
        energy, seconds = measured[idle]
        idle_watts = energy / seconds if seconds > 0 else None
        lines.append(f"| {idle} | 0 | {seconds:.0f} | {energy:.1f} | n/a | n/a |")
    for label, requests in phases:
        energy, seconds = measured[label]
        per_request = own = "n/a"
        if requests:
            per_request = f"{1000 * energy / requests:.2f}"
            if idle_watts is not None:
                own = f"{1000 * max(energy - idle_watts * seconds, 0) / requests:.2f}"
        lines.append(f"| {label} | {requests} | {seconds:.0f} | {energy:.1f} | {per_request} | {own} |")
    if idle_watts is not None:
        lines += ["", f"The stack alone, doing nothing, draws about {idle_watts:.2f} W: that share is removed in the last "
                      "column, so it shows what the load itself costs."]
    lines += ["", "_An estimate from a model of the CPU of a shared virtual machine, not a power meter, and the load "
                  "generator (Locust) runs on the same machine: use it to compare runs and to spot a regression, not as "
                  "an absolute figure._"]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Energy per request from Eco CI measurements.")
    parser.add_argument("--data", default="/tmp/eco-ci/lap-data.json", help="Eco CI's JSON file of measurements")
    parser.add_argument("--idle", help="label of the phase without load")
    parser.add_argument("--phase", action="append", default=[], help='"label=requests": a load phase')
    parser.add_argument("--output", default="energy-summary.md")
    args = parser.parse_args()

    text = report(read_measurements(args.data), args.idle, [parse_phase(p) for p in args.phase])
    print(text)
    with open(args.output, "w", encoding="utf-8") as out:
        out.write(text)


if __name__ == "__main__":
    main()
