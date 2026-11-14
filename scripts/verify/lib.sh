#!/usr/bin/env bash
# Izvajanje korakov verify.sh (konstitucija §4).
#
#   step <ime> <static|test> <vrsta za summarize> <cwd|-> <glob poročil JUnit|-> <ukaz…>
#   (ukaz teče v mapi cwd glede na $VERIFY_ROOT; glob poročil je relativen na $VERIFY_ROOT)
#   run_plan <raven>
#
# Statični koraki se izvedejo vsi, testni do prvega padca (in samo, če so statični uspeli).
# Več klicev step z istim imenom tvori en korak (npr. format za backend, frontend in e2e).
# Celoten izpis gre v $VERIFY_ROOT/.verify/last.log, na zaslon ena vrstica ali povzetek do 20 vrstic.

VERIFY_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_STEPS=()

step() {
  local name="$1" group="$2" kind="$3" cwd="$4" reports="$5"
  shift 5
  local command
  command="$(printf '%q ' "$@")"
  VERIFY_STEPS+=("$name"$'\t'"$group"$'\t'"$kind"$'\t'"$cwd"$'\t'"$reports"$'\t'"${command% }")
}

# Imena korakov v vrstnem redu, brez ponovitev.
list_steps() {
  local entry name seen=$'\n'
  for entry in "${VERIFY_STEPS[@]}"; do
    name="${entry%%$'\t'*}"
    [[ "$seen" == *$'\n'"$name"$'\n'* ]] && continue
    seen+="$name"$'\n'
    printf '%s\n' "$name"
  done
}

_verify_contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do [[ "$item" == "$needle" ]] && return 0; done
  return 1
}

run_plan() {
  local level="$1"
  local root="${VERIFY_ROOT:-$PWD}"
  local dir="$root/.verify"
  local started=$SECONDS
  local index=0 entry name group kind cwd reports command log status
  local failed_names=() failed_list="$dir/failed.tsv" static_failed=0 test_failed=0

  rm -rf "$dir/steps"
  mkdir -p "$dir/steps"
  : >"$dir/last.log"
  : >"$failed_list"

  for group_pass in static test; do
    if [[ $group_pass == test && ( $static_failed == 1 ) ]]; then
      break
    fi
    for entry in "${VERIFY_STEPS[@]}"; do
      IFS=$'\t' read -r name group kind cwd reports command <<<"$entry"
      [[ $group != "$group_pass" ]] && continue
      [[ $group == test && $test_failed == 1 ]] && break
      index=$((index + 1))
      log="$dir/steps/$(printf '%02d' "$index")-${name// /-}.log"

      if [[ $reports != - ]]; then
        # Stara poročila bi prikazala napake prejšnjega zagona.
        local stale
        while IFS= read -r stale; do rm -f "$stale"; done < <(compgen -G "$reports" || true)
      fi

      { printf '=== %s (%s) ===\n' "$name" "$command"; } >>"$dir/last.log"
      local errexit=0
      [[ $- == *e* ]] && errexit=1
      set +e
      if [[ $cwd == - ]]; then
        eval "$command" >"$log" 2>&1
      else
        (cd "$root/$cwd" && eval "$command") >"$log" 2>&1
      fi
      status=$?
      [[ $errexit == 1 ]] && set -e
      cat "$log" >>"$dir/last.log"
      printf '=== %s: izhod %d ===\n\n' "$name" "$status" >>"$dir/last.log"

      if [[ $status != 0 ]]; then
        local files=()
        if [[ $reports != - ]]; then
          local match
          while IFS= read -r match; do files+=("$match"); done < <(compgen -G "$reports" || true)
        fi
        local joined
        joined="$(IFS=:; printf '%s' "${files[*]}")"
        printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$kind" "$cwd" "$log" "$joined" >>"$failed_list"
        _verify_contains "$name" "${failed_names[@]}" || failed_names+=("$name")
        if [[ $group == static ]]; then static_failed=1; else test_failed=1; fi
      fi
    done
  done

  local elapsed=$((SECONDS - started))
  if [[ ${#failed_names[@]} == 0 ]]; then
    printf '✓ %s OK (%d s)\n' "$level" "$elapsed"
    return 0
  fi

  local names
  names="$(printf '%s, ' "${failed_names[@]}")"
  printf '✗ %s PADLO (%d s) – koraki: %s\n' "$level" "$elapsed" "${names%, }"
  node "$VERIFY_LIB_DIR/summarize.mjs" --root "$root" --limit 19 "$failed_list"
  return 1
}
