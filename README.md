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
