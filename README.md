# Contact Manager SDD

Multi-tenant contact management application developed
using Spec-Driven Development (SDD).

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

## Quality gate
```bash
./verify.sh quick   # format, lint, types, suppressions, translations, tool self-tests, unit and FE tests (~30 s)
./verify.sh full    # + integration, security, whole system in Compose, E2E (~2.5 min, needs Docker)
```
On success it prints one line; on failure at most 20 lines naming each error. The full output of the last run is in `.verify/last.log`.
CI (`.github/workflows/ci.yml`) runs `./verify.sh full` on every push and pull request.
Protect `main` manually in GitHub: *Settings → Branches → Branch protection* with the required status check `verify`.

## Documentation
- [Constitution](.specify/memory/constitution.md) – project principles
- [Workflow](.specify/memory/workflow.md) – how features are specified, tested and finished
- [Feature map](.specify/memory/feature-map.md) – features 000–012 and shared rules
- [Design system »Kartoteka«](.specify/memory/design.md) – UI look and behaviour
- [Specifications](specs/) – one `spec.md` per feature (source of truth for requirements)
- [Decisions](DECISIONS.md) – decision log
- [Original documentation](original_documentation/) – historical, not maintained

## Working on a feature
```bash
scripts/feature.sh kontakti   # branch "kontakti" + Spec Kit pointer to specs/004-kontakti
```
Then in Claude Code: `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge`.
