#!/usr/bin/env python3
"""A readable report (markdown) from a Lighthouse CI run.

    python scripts/lighthouse_summary.py                      # reads ./.lighthouseci, writes lighthouse-summary.md
    python scripts/lighthouse_summary.py --dir .lighthouseci --output report.md

For each URL it takes the representative (median) run chosen by Lighthouse CI and shows the scores,
the main timings, what is downloaded, the failed budget checks, the accessibility / best-practice
audits that fail and the biggest savings. In GitHub Actions the report is also added to the job
summary (GITHUB_STEP_SUMMARY). It is the text posted as a comment on the pull request.
"""
import argparse
import json
import os
import sys
from pathlib import Path

CATEGORIES = [("performance", "Performance"), ("accessibility", "Accessibility"),
              ("best-practices", "Best practices"), ("seo", "SEO")]
METRICS = [("first-contentful-paint", "First contentful paint"),
           ("largest-contentful-paint", "Largest contentful paint"),
           ("total-blocking-time", "Total blocking time"),
           ("cumulative-layout-shift", "Cumulative layout shift"),
           ("speed-index", "Speed index")]
RESOURCE_TYPES = ["script", "stylesheet", "image", "document", "font", "other"]


def badge(score):
    """0.96 -> '🟢 96'. Lighthouse's own thresholds: 90 and above is good, below 50 is poor."""
    if score is None:
        return "n/a"
    points = round(score * 100)
    return ("🟢 " if points >= 90 else "🟠 " if points >= 50 else "🔴 ") + str(points)


def kb(num_bytes):
    return f"{num_bytes / 1024:,.0f} KB"


def representative_runs(directory: Path):
    """[(url, lighthouse result)] for the median run of each URL."""
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    runs = []
    for entry in manifest:
        if entry.get("isRepresentativeRun"):
            # the path inside the manifest is the one of the machine that ran Lighthouse
            result = json.loads((directory / Path(entry["jsonPath"]).name).read_text(encoding="utf-8"))
            runs.append((entry["url"], result))
    return runs


def failing_audits(lhr, category):
    audits = lhr["audits"]
    failing = []
    for ref in lhr["categories"][category]["auditRefs"]:
        audit = audits[ref["id"]]
        if ref.get("weight", 0) > 0 and audit.get("score") is not None and audit["score"] < 1:
            failing.append((audit["title"], len(audit.get("details", {}).get("items", []))))
    return failing


def savings(lhr, limit=5):
    """The audits that would save the most time or bytes."""
    found = []
    for audit in lhr["audits"].values():
        details = audit.get("details") or {}
        ms, size = details.get("overallSavingsMs", 0) or 0, details.get("overallSavingsBytes", 0) or 0
        if ms > 0 or size > 0:
            found.append((ms, size, audit["title"]))
    return sorted(found, key=lambda f: (-f[0], -f[1]))[:limit]


def render(url, lhr, assertions, runs):
    audits = lhr["audits"]
    lines = [f"## Lighthouse: {url}", "",
             f"{lhr['configSettings']['formFactor']} preset, median of {runs} runs, Lighthouse {lhr['lighthouseVersion']}.", ""]

    lines += ["| Category | Score |", "|---|---|"]
    lines += [f"| {title} | {badge(lhr['categories'][key]['score'])} |" for key, title in CATEGORIES if key in lhr["categories"]]

    lines += ["", "| Timing | Value |", "|---|---|"]
    lines += [f"| {title} | {audits[key]['displayValue']} |" for key, title in METRICS if key in audits]

    items = {i["resourceType"]: i for i in audits["resource-summary"]["details"]["items"]}
    lines += ["", "| Downloaded | Requests | Size |", "|---|---|---|"]
    for kind in RESOURCE_TYPES + ["total"]:
        if kind in items and items[kind]["requestCount"] > 0:
            lines.append(f"| {kind} | {items[kind]['requestCount']} | {kb(items[kind]['transferSize'])} |")
    third = items.get("third-party")
    if third and third["requestCount"]:
        lines.append(f"| of which from other sites (posters) | {third['requestCount']} | {kb(third['transferSize'])} |")

    mine = [a for a in assertions if a["url"] == url]
    lines += ["", "### Budget checks"]
    if mine:
        lines += ["", "| Level | Check | Found | Expected |", "|---|---|---|---|"]
        for a in mine:
            name = a["auditId"] + (f".{a['auditProperty']}" if a.get("auditProperty") else "")
            lines.append(f"| {'❌ error' if a['level'] == 'error' else '⚠️ warning'} | `{name}` | {a['actual']} | {a['operator']} {a['expected']} |")
    else:
        lines += ["", "All the checks of `frontend/lighthouserc.json` pass."]

    for key, title in (("accessibility", "Accessibility"), ("best-practices", "Best practices")):
        failing = failing_audits(lhr, key)
        if failing:
            lines += ["", f"### {title}: what fails", ""]
            lines += [f"- {name} ({count} element{'s' if count != 1 else ''})" for name, count in failing]

    biggest = savings(lhr)
    if biggest:
        lines += ["", "### Biggest possible savings", ""]
        for ms, size, title in biggest:
            lines.append(f"- {title}: " + ", ".join(p for p in (f"{ms:,.0f} ms" if ms else "", kb(size) if size else "") if p))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Markdown report from a Lighthouse CI run.")
    parser.add_argument("--dir", default=".lighthouseci", help="folder written by `lhci autorun` (default .lighthouseci)")
    parser.add_argument("--output", default="lighthouse-summary.md")
    args = parser.parse_args()

    directory = Path(args.dir)
    if not (directory / "manifest.json").exists():
        print(f"no Lighthouse result in {directory}: did `lhci autorun` run?", file=sys.stderr)
        return 1

    assertion_file = directory / "assertion-results.json"
    assertions = json.loads(assertion_file.read_text(encoding="utf-8")) if assertion_file.exists() else []
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    runs_per_url = {}
    for entry in manifest:
        runs_per_url[entry["url"]] = runs_per_url.get(entry["url"], 0) + 1

    report = "\n".join(render(url, lhr, assertions, runs_per_url[url]) for url, lhr in representative_runs(directory))
    Path(args.output).write_text(report, encoding="utf-8")
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write(report + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
