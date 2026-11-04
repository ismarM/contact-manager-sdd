#!/usr/bin/env bash
# Switch to a feature: branch "<slug>" (no number) + .specify/feature.json -> specs/NNN-<slug>.
# Usage: scripts/feature.sh <slug>   e.g. scripts/feature.sh kontakti
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
if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be lowercase words separated by '-', without a number (e.g. kontakti)" >&2
  exit 1
fi

shopt -s nullglob
matches=(specs/[0-9][0-9][0-9]-"$slug")
if [[ ${#matches[@]} -ne 1 ]]; then
  echo "error: expected exactly one directory specs/NNN-$slug, found ${#matches[@]}" >&2
  echo "       known features: $(ls specs | sed 's/^[0-9]*-//' | tr '\n' ' ')" >&2
  exit 1
fi
dir="${matches[0]}"

if git show-ref --verify --quiet "refs/heads/$slug"; then
  git switch "$slug"
else
  git switch -c "$slug"
fi

printf '{\n  "feature_directory": "%s"\n}\n' "$dir" > "$pointer"
echo "branch $slug -> $dir"
