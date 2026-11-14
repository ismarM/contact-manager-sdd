#!/usr/bin/env bash
# Switch to a feature: branch "<slug>" + .specify/feature.json -> specs/<slug> (no numbers).
# The directory is created only when the change needs a spec (constitution §2.1).
# Usage: scripts/feature.sh <slug>   e.g. scripts/feature.sh uvoz-excel
#        scripts/feature.sh          shows the current feature and branch
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
pointer=".specify/feature.json"

if [[ $# -eq 0 ]]; then
  echo "branch:  $(git branch --show-current)"
  if [[ -f "$pointer" ]]; then echo "feature: $(sed -n 's/.*"feature_directory": *"\([^"]*\)".*/\1/p' "$pointer")"; else echo "feature: (none)"; fi
  exit 0
fi

slug="$1"
if [[ ! "$slug" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be lowercase words separated by '-', starting with a letter (e.g. uvoz-excel)" >&2
  exit 1
fi
dir="specs/$slug"

if git show-ref --verify --quiet "refs/heads/$slug"; then
  git switch "$slug"
else
  git switch -c "$slug"
fi

printf '{\n  "feature_directory": "%s"\n}\n' "$dir" > "$pointer"
if [[ -d "$dir" ]]; then
  echo "branch $slug -> $dir"
else
  echo "branch $slug -> $dir (not created yet; for /speckit-specify pass SPECIFY_FEATURE_DIRECTORY=$dir)"
fi
