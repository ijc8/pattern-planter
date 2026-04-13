#!/usr/bin/env bash
# Downloads only the Strudel samples that Pattern Planter actually uses.
# Total is ~100 MB vs ~11 GB for the full dough-samples repo.
set -euo pipefail
cd "$(dirname "$0")/.."

SAMPLES_DIR="samples"
DIRT_BASE="https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master"
VCSL_BASE="https://raw.githubusercontent.com/sgossner/VCSL/master"
PIANO_BASE="https://raw.githubusercontent.com/felixroos/dough-samples/main/piano"
DOUGH_BASE="https://raw.githubusercontent.com/felixroos/dough-samples/main"

if [ -d "$SAMPLES_DIR" ]; then
    echo "samples/ directory already exists — remove it first to re-download."
    exit 0
fi

echo "Downloading sample registries..."
mkdir -p "$SAMPLES_DIR"
curl -sSfL "$DOUGH_BASE/Dirt-Samples.json" -o "$SAMPLES_DIR/Dirt-Samples.json"
curl -sSfL "$DOUGH_BASE/piano.json" -o "$SAMPLES_DIR/piano.json"
curl -sSfL "$DOUGH_BASE/vcsl.json" -o "$SAMPLES_DIR/vcsl.json"
curl -sSfL "$DOUGH_BASE/tidal-drum-machines.json" -o "$SAMPLES_DIR/tidal-drum-machines.json"
curl -sSfL "$DOUGH_BASE/EmuSP12.json" -o "$SAMPLES_DIR/EmuSP12.json"

# --- Dirt-Samples (crow, insect, wind, east) ---
echo "Downloading Dirt-Samples..."
for sample_dir in crow insect wind east; do
    # Parse file list from the JSON
    files=$(python3 -c "
import json, sys
d = json.load(open('$SAMPLES_DIR/Dirt-Samples.json'))
for f in d.get('$sample_dir', []): print(f)
")
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        dir="$SAMPLES_DIR/Dirt-Samples/$(dirname "$f")"
        mkdir -p "$dir"
        echo "  $f"
        curl -sSfL "$DIRT_BASE/$f" -o "$SAMPLES_DIR/Dirt-Samples/$f"
    done <<< "$files"
done

# --- VCSL (folkharp, didgeridoo, guiro, sleighbells, psaltery_pluck, ocarina_small_stacc) ---
echo "Downloading VCSL samples..."
for sample_name in folkharp didgeridoo guiro sleighbells psaltery_pluck ocarina_small_stacc; do
    files=$(python3 -c "
import json, sys
from urllib.parse import unquote
d = json.load(open('$SAMPLES_DIR/vcsl.json'))
val = d.get('$sample_name', {})
files = val.values() if isinstance(val, dict) else val
for f in files: print(unquote(f))
")
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        dir="$SAMPLES_DIR/VCSL/$(dirname "$f")"
        mkdir -p "$dir"
        # URL-encode spaces and special chars for the download URL
        url_path=$(python3 -c "from urllib.parse import quote; print(quote('$f', safe='/'))")
        echo "  $(basename "$f")"
        curl -sSfL "$VCSL_BASE/$url_path" -o "$SAMPLES_DIR/VCSL/$f"
    done <<< "$files"
done

# --- Piano ---
echo "Downloading piano samples..."
mkdir -p "$SAMPLES_DIR/piano"
files=$(python3 -c "
import json
d = json.load(open('$SAMPLES_DIR/piano.json'))
for f in d.get('piano', {}).values(): print(f)
")
while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "  $f"
    curl -sSfL "$PIANO_BASE/$f" -o "$SAMPLES_DIR/piano/$f"
done <<< "$files"

echo ""
echo "Done! $(du -sh "$SAMPLES_DIR" | cut -f1) downloaded to $SAMPLES_DIR/"
