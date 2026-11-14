#!/usr/bin/env python3
"""Where do the bytes of the JavaScript bundles come from?

    python scripts/bundle_report.py                 # reads frontend/build/static/js
    python scripts/bundle_report.py --top 25
    python scripts/bundle_report.py --json          # machine-readable

Build first (cd frontend && npm run build): the build writes a source map next to each bundle,
and this script uses it to attribute every byte of the minified file to the package (or to the
app's own code) it was compiled from. It is what `source-map-explorer` does, with no dependency.

Sizes are minified bytes; "gzip" is the size of the whole file gzipped (what nginx sends).
"""
import argparse
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

BASE64 = {c: i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")}


def decode_vlq(segment: str):
    """One source-map segment ("AAgBC") -> list of ints."""
    values, shift, value = [], 0, 0
    for char in segment:
        digit = BASE64[char]
        value += (digit & 31) << shift
        if digit & 32:                       # continuation bit
            shift += 5
        else:
            values.append(-(value >> 1) if value & 1 else value >> 1)
            shift = value = 0
    return values


def package_of(source: str) -> str:
    """'webpack://x/./node_modules/@mui/material/Button/Button.js' -> '@mui/material'."""
    if "node_modules/" in source:
        rest = source.rsplit("node_modules/", 1)[1].split("/")
        return "/".join(rest[:2]) if rest[0].startswith("@") else rest[0]
    if source.startswith("webpack/") or "/webpack/" in source:
        return "(webpack runtime)"
    return "(app code: src/)"


def attribute_bytes(js_path: Path, map_path: Path):
    """-> {package: bytes}, total bytes of the file."""
    source_map = json.loads(map_path.read_text(encoding="utf-8"))
    sources = source_map["sources"]
    lines = js_path.read_text(encoding="utf-8").split("\n")
    sizes = defaultdict(int)

    source_index = 0
    for line_number, line_mappings in enumerate(source_map["mappings"].split(";")):
        line_length = len(lines[line_number]) if line_number < len(lines) else 0
        column, segments = 0, []
        for segment in filter(None, line_mappings.split(",")):
            fields = decode_vlq(segment)
            column += fields[0]
            if len(fields) >= 4:
                source_index += fields[1]
                segments.append((column, source_index))
            else:
                segments.append((column, None))
            # fields[2], fields[3] (line / column in the source) are not needed to count bytes
        for i, (start, src) in enumerate(segments):
            end = segments[i + 1][0] if i + 1 < len(segments) else line_length
            name = package_of(sources[src]) if src is not None else "(unmapped)"
            sizes[name] += max(0, end - start)
        if segments and segments[0][0] > 0:
            sizes["(unmapped)"] += segments[0][0]
        if not segments:
            sizes["(unmapped)"] += line_length
    return sizes, len(js_path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Attribute the bytes of the JS bundles to packages.")
    parser.add_argument("--dir", default=str(Path(__file__).resolve().parent.parent / "frontend" / "build" / "static" / "js"))
    parser.add_argument("--top", type=int, default=15, help="packages shown per bundle (default 15)")
    parser.add_argument("--json", action="store_true", help="print JSON instead of tables")
    args = parser.parse_args()

    bundles = sorted(Path(args.dir).glob("*.js"))
    if not bundles:
        print(f"no .js file in {args.dir}: run `npm run build` in frontend/ first", file=sys.stderr)
        return 1

    report = []
    for js in bundles:
        source_map = Path(str(js) + ".map")
        if not source_map.exists():
            print(f"{js.name}: no source map (build with GENERATE_SOURCEMAP not set to false), skipped", file=sys.stderr)
            continue
        sizes, total = attribute_bytes(js, source_map)
        report.append({
            "file": js.name,
            "bytes": js.stat().st_size,
            "gzip_bytes": len(gzip.compress(js.read_bytes(), compresslevel=6)),
            "packages": dict(sorted(sizes.items(), key=lambda item: -item[1])),
        })

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    for bundle in report:
        print(f"\n{bundle['file']}: {bundle['bytes'] / 1024:,.0f} KB minified, {bundle['gzip_bytes'] / 1024:,.0f} KB gzipped")
        total = sum(bundle["packages"].values()) or 1
        for name, size in list(bundle["packages"].items())[: args.top]:
            print(f"  {size / 1024:9,.1f} KB  {100 * size / total:5.1f} %  {name}")
        hidden = len(bundle["packages"]) - args.top
        if hidden > 0:
            rest = sum(list(bundle["packages"].values())[args.top:])
            print(f"  {rest / 1024:9,.1f} KB  {100 * rest / total:5.1f} %  ({hidden} smaller packages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
