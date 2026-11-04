#!/usr/bin/env bash
# Navidezen načrt korakov za verify-cli.test.mjs: preveri pravilo ustavljanja v lib.sh brez pravih orodij.
# Okolje: LIB (pot do lib.sh), PLAN (static-fail | test-fail | ok), MARKERS (mapa za oznake), MARK, VERIFY_ROOT.
set -euo pipefail
# shellcheck source=/dev/null
source "$LIB"

case "$PLAN" in
  static-fail)
    step s1 static generic - - sh -c 'echo ok-s1'
    step s2 static generic - - sh -c 'echo napaka-s2; exit 1'
    step s3 static generic - - sh -c 'echo napaka-s3; exit 1'
    step t1 test generic - - touch "$MARKERS/t1"
    ;;
  test-fail)
    step s1 static generic - - true
    step t1 test generic - - sh -c 'echo napaka-t1; exit 1'
    step t2 test generic - - touch "$MARKERS/t2"
    ;;
  ok)
    step s1 static generic - - sh -c 'echo "$MARK"'
    step t1 test generic - - true
    ;;
esac

run_plan quick
