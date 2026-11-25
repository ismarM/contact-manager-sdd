# Contact Manager SDD

Multi-tenant contact management application developed using Spec-Driven Development (SDD)
with GitHub Spec Kit and Claude Code.

## Tech Stack
- Backend: Spring Boot (Java 21)
- Frontend: React + TypeScript, Tailwind CSS v4, i18n (sl/en), responsive, PWA, WCAG 2.1 AA; served by nginx
- Database: PostgreSQL
- Authentication: Firebase (identity only, Google provider)
- Authorization: Custom, per-group roles (VIEWER < EDITOR < ADMIN < OWNER) stored in PostgreSQL
- Excel: export to `.xlsx`
- SDD: GitHub Spec Kit 1.2.6
- AI Agent: Claude Code

## Prerequisites
- Docker with Compose v2 (your user must be able to run `docker info`)
- JDK 21 (`JAVA_HOME` pointing to it, or `javac` 21+ on `PATH`)
- Node.js 22.12+ and npm
- Optional: [gitleaks](https://github.com/gitleaks/gitleaks) on `PATH` (otherwise the pre-commit hook uses its Docker image)

## First steps
```bash
scripts/install-hooks.sh      # once after cloning: pre-commit hook with gitleaks (no secrets in Git)
docker compose up --build     # whole system on http://localhost:8080 (health: /api/health)
```
No `.env` is needed; `.env.example` lists the variables and their development defaults.
The Firebase Auth Emulator UI is disabled; the emulator listens on `127.0.0.1:9099`.

Showcase mode (separate project, in-memory data that is lost on every restart):
```bash
# Start the demo stack on http://localhost:8080
docker compose -f compose.yaml -f compose.override.yaml -f compose.demo.yaml up --build -d --wait
# Seed demo data; sign in as ana@demo.si (also bor@, cvetka@, david@demo.si)
docker compose -f compose.yaml -f compose.override.yaml -f compose.demo.yaml run --rm seed
# Stop the demo stack (plain `docker compose down` only stops the dev project)
docker compose -p contact-manager-demo down
```

## Real Firebase (Google sign-in in local development)
The emulator stays the default for tests and CI. To sign in with a real Google account against your own Firebase project:
```bash
# 1. Once: create the (git-ignored) config and fill in the values
cp .env.firebase.example .env.firebase
#    FIREBASE_API_KEY               – Console → Project settings → General → Your apps → Web app → apiKey
#    FIREBASE_SERVICE_ACCOUNT_FILE  – absolute path to a service-account JSON key OUTSIDE the repo
#                                     (Console → Project settings → Service accounts → Generate new private key;
#                                      the account needs the role "Firebase Authentication Admin"; keep it `chmod 600`)
#    FIREBASE_CONTAINER_UID / _GID  – owner of that file (`id -u`, `id -g`, default 1000:1000); the backend container runs
#                                     as this user, so the key never needs to be readable by anyone else
# 2. Start (separate Compose project and database: contact-manager-firebase), http://localhost:8080
docker compose --env-file .env --env-file .env.firebase -f compose.yaml -f compose.override.yaml -f compose.firebase.yaml up --build -d --wait
# 3. Stop (-v also drops the data)
docker compose -p contact-manager-firebase down -v
```
The key is mounted read-only. The `appId` is not needed (only Auth is used). The service account is used by feature 012 (account deletion, `accounts:delete`);
without it sign-in works, but deleting an account answers `202` and the identity is retried later. The API key is a public
web identifier, but it still stays in `.env.firebase`, never in Git.

## Quality gate
```bash
./verify.sh quick     # format, lint, types, suppressions, translations, tool self-tests, unit and FE tests
./verify.sh backend   # backend integration and security tests (needs Docker)
./verify.sh e2e       # whole system in Compose + E2E with axe (needs Docker)
./verify.sh full      # all of the above in one run
```
On success it prints one line; on failure at most 20 lines naming each error. The full output of the last run is in `.verify/last.log`.
Run `quick` plus whatever your change touches; CI (`.github/workflows/ci.yml`) runs `quick`, `backend` and `e2e` as three parallel jobs on every push and pull request.
Protect `main` manually in GitHub: *Settings → Branches → Branch protection* with the required status checks `quick`, `backend` and `e2e`.

## Documentation
- [Project rules](.specify/memory/constitution.md) – principles, workflow, test rules and verification (the only rules document)
- [Product map](.specify/memory/feature-map.md) – features and shared rules (roles, order of checks, error codes, data dictionary)
- [Design system »Kartoteka«](.specify/memory/design.md) – UI look and behaviour
- [Specifications](specs/) – one Spec Kit folder per feature (`spec.md`, `plan.md`, `tasks.md`, …)
- [Decisions](docs/decisions/) – architecture decisions, one file each (the first version's log: `git show 2365b23:DECISIONS.md`)
- [AI log](ai-log/) – one entry per AI session and token usage (`node scripts/token-report.mjs`)
- [Original documentation](original_documentation/) – historical, not maintained

## Working on a change
- **Small change** (fix, UI tweak, small addition): branch → code and tests → `./verify.sh quick` → PR.
- **Feature:** the Spec Kit cycle in Claude Code – `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge` → PR. Implement runs in one pass (code and tests together); before the PR the `pregled-testov` subagent reviews the finished diff once. `scripts/feature.sh <name>` switches to the feature's branch.
- **`/rollout <feature>; <feature>; …`** runs that cycle autonomously for one or more features: a supervisor consults you once at the clarify step, drives one worker per feature in its own git worktree, has conflicts resolved after every merge and merges each PR when CI is green (rules §2.8).
