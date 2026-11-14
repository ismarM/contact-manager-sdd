#!/usr/bin/env bash
# Switch to a feature: branch "<slug>" (no number) + .specify/feature.json -> specs/NNN-<slug>.
# A new feature has no directory yet: the branch is created and /speckit-specify assigns the number.
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
if [[ ! "$slug" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be lowercase words separated by '-', without a number (e.g. kontakti)" >&2
  exit 1
fi

shopt -s nullglob
matches=(specs/[0-9][0-9][0-9]-"$slug")
if [[ ${#matches[@]} -gt 1 ]]; then
  echo "error: more than one directory specs/NNN-$slug: ${matches[*]}" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$slug"; then
  git switch "$slug"
else
  git switch -c "$slug"
fi

if [[ ${#matches[@]} -eq 1 ]]; then
  printf '{\n  "feature_directory": "%s"\n}\n' "${matches[0]}" > "$pointer"
  echo "branch $slug -> ${matches[0]}"
else
  rm -f "$pointer"
  echo "branch $slug -> new feature; run /speckit-specify (it creates specs/NNN-$slug and the pointer)"
fi
