#!/usr/bin/env bash
# Vrata kakovosti (konstitucija §4): ./verify.sh quick|backend|e2e|full
#   quick   – format, lint, tipi, utišanja, prevodi, testi orodij, unit BE/FE, funkcionalni FE
#   backend – prevajanje, integracijski in varnostni testi zaledja (Docker)
#   e2e     – sistem v Docker Compose in E2E (Docker)
#   full    – vse našteto v enem zagonu
# Izhod: 0 uspeh, 1 padec, 2 napačna uporaba, 3 manjkajoče orodje. Celoten izpis: .verify/last.log.
set -uo pipefail

ROOT="$(dirname "$(readlink -f "$0")")"
USAGE='Uporaba: ./verify.sh quick|backend|e2e|full'

if [[ $# != 1 || ! $1 =~ ^(quick|backend|e2e|full)$ ]]; then
  echo "$USAGE" >&2
  exit 2
fi
LEVEL="$1"

# includes <raven…>: ali trenutni zagon vsebuje korake katere od naštetih ravni (full vsebuje vse).
includes() {
  [[ $LEVEL == full ]] && return 0
  local level
  for level in "$@"; do [[ $LEVEL == "$level" ]] && return 0; done
  return 1
}

cd "$ROOT" || exit 3
export VERIFY_ROOT="$ROOT"
# shellcheck source=scripts/verify/lib.sh
source "$ROOT/scripts/verify/lib.sh"

COMPOSE=(docker compose -p contact-manager-verify -f compose.yaml -f compose.verify.yaml)

# --- Načrt korakov -------------------------------------------------------------------------------
# Statični koraki se izvedejo vsi, testni se ustavijo pri prvem padcu.
if includes quick; then
  step 'format' static spotless backend - ./mvnw -q -B spotless:check
  step 'format' static prettier frontend - npm run -s format:check
  step 'format' static prettier e2e - npm run -s format:check
  step 'lint' static eslint frontend - npm run -s lint
  step 'lint' static eslint e2e - npm run -s lint
  step 'tipi' static tsc frontend - npm run -s typecheck -- --pretty false
  step 'tipi' static tsc e2e - npx tsc --noEmit --pretty false
  step 'tipi' static maven backend - ./mvnw -q -B test-compile
  step 'utišanja' static generic - - node scripts/verify/suppressions.mjs
  step 'prevodi' static generic - - node scripts/verify/i18n-keys.mjs
  step 'orodja' test junit - .verify/reports/orodja.xml \
    node --test --test-reporter=junit --test-reporter-destination=.verify/reports/orodja.xml \
    --test-reporter=dot --test-reporter-destination=stdout 'scripts/verify/test/*.test.mjs'
  step 'unit BE' test junit backend 'backend/target/surefire-reports/TEST-*.xml' ./mvnw -q -B surefire:test
  step 'unit FE' test junit frontend frontend/test-results/junit.xml npm run -s test:unit
  step 'funkcionalni FE' test junit frontend frontend/test-results/junit.xml npm run -s test:ui
fi
if [[ $LEVEL == backend ]]; then
  # V ravni full razrede prevede korak »tipi«.
  step 'prevajanje' static maven backend - ./mvnw -q -B test-compile
fi
if includes backend; then
  step 'integracijski BE' test junit backend 'backend/target/failsafe-reports/integration/TEST-*.xml' \
    ./mvnw -q -B failsafe:integration-test@integration failsafe:verify@integration
  step 'varnostni BE' test junit backend 'backend/target/failsafe-reports/security/TEST-*.xml' \
    ./mvnw -q -B failsafe:integration-test@security failsafe:verify@security
  step 'varnostni BE' test junit - .verify/reports/test-full.xml \
    node --test --test-reporter=junit --test-reporter-destination=.verify/reports/test-full.xml \
    --test-reporter=dot --test-reporter-destination=stdout 'scripts/verify/test-full/*.test.mjs'
fi
if includes e2e; then
  step 'sistem' test generic - - system_up
  step 'E2E' test junit e2e e2e/test-results/junit.xml run_e2e
fi

if [[ ${VERIFY_LIST_STEPS:-} == 1 ]]; then
  list_steps
  exit 0
fi

# --- Orodja -----------------------------------------------------------------------------------
missing() {
  echo "✗ $LEVEL – manjka orodje: $1" >&2
  exit 3
}

find_javac() {
  if [[ -n ${JAVA_HOME:-} && -x $JAVA_HOME/bin/javac ]]; then
    echo "$JAVA_HOME/bin/javac"
  else
    command -v javac
  fi
}

# Raven e2e zgradi zaledje v Dockerju in Jave na gostitelju ne potrebuje.
if includes quick backend; then
  JAVAC="$(find_javac)" || missing 'Java 21+ (javac; nastavi JAVA_HOME na JDK 21)'
  JAVA_MAJOR="$("$JAVAC" -version 2>&1 | sed -nE 's/^javac ([0-9]+).*/\1/p')"
  [[ -n $JAVA_MAJOR && $JAVA_MAJOR -ge 21 ]] || missing "Java 21+ (najden javac $JAVA_MAJOR; nastavi JAVA_HOME na JDK 21)"
  JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$JAVAC")")")"
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
fi

command -v node >/dev/null || missing 'Node.js 22.12+'
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' ||
  missing "Node.js 22.12+ (najden $(node --version))"
command -v npm >/dev/null || missing 'npm'

if includes backend e2e; then
  if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
    echo "✗ $LEVEL – potrebuje Docker (docker info ni uspel)" >&2
    exit 3
  fi
fi

# --- Odvisnosti npm: npm ci, ko manjka node_modules ali se je spremenil package-lock.json ------
mkdir -p .verify/reports
NPM_PROJECTS=()
includes quick && NPM_PROJECTS+=(frontend)
includes quick e2e && NPM_PROJECTS+=(e2e)
for project in "${NPM_PROJECTS[@]}"; do
  sha="$(sha256sum "$project/package-lock.json" | cut -d' ' -f1)"
  stamp=".verify/$project.lock.sha"
  if [[ ! -d $project/node_modules || ! -f $stamp || $(cat "$stamp") != "$sha" ]]; then
    if ! npm --prefix "$project" ci --no-audit --no-fund >".verify/npm-ci-$project.log" 2>&1; then
      echo "✗ $LEVEL PADLO – npm ci v $project (glej .verify/npm-ci-$project.log)"
      exit 1
    fi
    echo "$sha" >"$stamp"
  fi
done

# --- Sistem in E2E (full) ----------------------------------------------------------------------
system_up() {
  if ! "${COMPOSE[@]}" up --build --wait --wait-timeout 300; then
    echo 'Storitve, ki niso zdrave:'
    "${COMPOSE[@]}" ps --all --format '{{.Service}} {{.State}} {{.Health}}' | grep -v ' running healthy$' || true
    return 1
  fi
}

run_e2e() {
  local address
  address="$("${COMPOSE[@]}" port frontend 80)" || return 1
  # E2E pripravi vloge in arhiviranje s SQL v bazi istega projekta Compose; korak teče v e2e/.
  BASE_URL="http://$address" \
    E2E_COMPOSE_ARGS='-p contact-manager-verify -f ../compose.yaml -f ../compose.verify.yaml' \
    npx playwright test
}

if includes e2e; then
  trap '"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1' EXIT
  trap 'exit 130' INT TERM
fi

run_plan "$LEVEL"
