#!/usr/bin/env bash
# Short summary of a failed CI run: failed jobs and the failing steps/tests that verify.sh printed.
# Usage: scripts/ci-failures.sh <run-id | PR number with --pr>
#        scripts/ci-failures.sh --pr 21     (latest pull_request run of that PR)
# Prints at most ~40 lines; never the full log. Exit 0 when the run has no failed jobs.
set -euo pipefail

if [[ "${1:-}" == "--pr" ]]; then
  branch="$(gh pr view "${2:?PR number}" --json headRefName --jq .headRefName)"
  run="$(gh run list --branch "$branch" --event pull_request --limit 1 --json databaseId --jq '.[0].databaseId')"
else
  run="${1:?run id or --pr <number>}"
fi

status="$(gh run view "$run" --json status,conclusion,headSha --jq '"\(.status) \(.conclusion) \(.headSha[0:7])"')"
echo "run $run: $status"
gh run view "$run" --json jobs --jq '.jobs[] | "  \(.name): \(.conclusion // .status)"'

if [[ "$status" != completed* ]]; then
  echo "(run not finished – failed logs are available only after completion)"
  exit 0
fi

# verify.sh prints "✗ <level> PADLO (...) – koraki: ..." followed by one line per failing test.
gh run view "$run" --log-failed 2>/dev/null \
  | sed -E 's/^[^\t]*\t[^\t]*\t[^ ]+Z //' \
  | grep -E -A12 '✗ .* PADLO' \
  | grep -v -E '^##\[|Deprecation|trace-deprecation|^--$' \
  | cut -c1-240 \
  | head -n 40 || true
