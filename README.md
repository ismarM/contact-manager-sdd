# Contact Manager SDD

Multi-tenant contact management application. The first version was built with Spec-Driven Development;
ongoing work follows a lighter process (see *Working on a change*).

## Tech Stack
- Backend: Spring Boot (Java 21)
- Frontend: React + TypeScript, Tailwind CSS v4, i18n (sl/en), responsive, PWA, WCAG 2.1 AA; served by nginx
- Database: PostgreSQL
- Authentication: Firebase (identity only, Google provider)
- Authorization: Custom, per-group roles (VIEWER < EDITOR < ADMIN < OWNER) stored in PostgreSQL
- Excel: export to `.xlsx`
- Specs: GitHub Spec Kit 1.2.6 (specify, clarify, plan, tasks, implement), used only where a change needs it
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
- [Decisions](docs/decisions/) – architecture decisions, one file each
- [AI log](ai-log/) – one entry per AI session and token usage
- [Original documentation](original_documentation/) – historical, not maintained

Code and tests are the source of truth for behaviour. The first version's specifications (`specs/000–012`) and decision log (`DECISIONS.md`) live in Git history: `git show 2365b23:DECISIONS.md`.

## Working on a change
- The size of the change decides the process (rules §2.1): a small change needs no documents, a normal feature a short `specs/<name>/spec.md`, a risky one also `plan.md` and `tasks.md` (`/speckit-plan` → `/speckit-tasks` → `/speckit-implement`, one pass).
- `scripts/feature.sh <name>` creates the branch; code and tests are written together; one advisory review of the finished diff, then a PR that the developers merge.
- `/rollout <feature>; <feature>; …` in Claude Code does this autonomously for one or more features: a supervisor consults you once, drives one worker per feature in its own git worktree and merges each PR when CI is green (rules §2.8).
