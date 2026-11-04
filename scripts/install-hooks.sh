#!/usr/bin/env bash
# Namesti kavlje Git iz .githooks/ (FR-000-19): en ukaz po kloniranju.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
echo '✓ kavlji nameščeni (core.hooksPath = .githooks; pre-commit z gitleaks)'
