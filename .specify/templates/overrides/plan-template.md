# Implementation Plan: [FEATURE]

**Branch**: `[feature-slug]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[NNN-feature-slug]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

<!--
  PROJECT RULES (override of the core plan template – see .specify/memory/workflow.md §1.4):
  - The "Public Interfaces" section is MANDATORY. Tests reference these tables, so the agent
    MUST NOT invent endpoints, routes or accessible names during implementation.
  - UI decisions follow .specify/memory/design.md (Kartoteka). Reference its sections.
  - Content in Slovenian, headings in English.
-->

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

**Language/Version**: Java 21 (Spring Boot 3.x) · TypeScript (strict) + React

**Primary Dependencies**: Spring Web, Spring Security (Firebase ID token verification), Spring Data JPA, Flyway · React, react-i18next, React Router, Tailwind CSS v4, shadcn/ui (optional, per DECISIONS.md)

**Storage**: PostgreSQL

**Testing**: JUnit 5, Testcontainers (PostgreSQL), Firebase Auth Emulator · Vitest, React Testing Library, MSW, vitest-axe · Playwright + @axe-core/playwright (360/768/1280 px)

**Target Platform**: Docker Compose (nginx serves the frontend and proxies /api), evergreen browsers, installable PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: [feature-specific or "standard web app expectations"]

**Constraints**: WCAG 2.1 AA, sl/en i18n, optimistic locking for contact/member edits, paginated lists, group isolation

**Scale/Scope**: [feature-specific]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | [FR-IDs covered by this plan] |
| II. Test-first | [test levels per FR-ID] |
| III. Group isolation and roles | [every group endpoint is in the isolation matrix] |
| IV. Accessible, bilingual, responsive UI | [design.md sections used; accessible names below] |
| V. Data integrity | [optimistic locking, audit trail, pagination where relevant] |
| VI. Privacy and GDPR | [personal data touched, export/delete impact] |
| VII. One verification path | [verify.sh levels that cover this feature] |

## Public Interfaces *(mandatory)*

### REST endpoints

<!--
  Lowest role: VIEWER|EDITOR|ADMIN|OWNER for group-bound endpoints, "—" for user-bound
  endpoints (invitations, my account), "public" for unauthenticated ones.
  Archived group: "allowed" or "rejected (409 GROUP_ARCHIVED)".
  Detailed request/response shapes live in contracts/ (OpenAPI).
-->

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/contacts | EDITOR | rejected (409 GROUP_ARCHIVED) | 201 | FR-NNN-01 |

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| [Page name] | /groups/:groupId/contacts | VIEWER | FR-NNN-01 |

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| [Page name] | button | »Nov kontakt« / "New contact" | opens the form | FR-NNN-01 |

## Project Structure

### Documentation (this feature)

```text
specs/[NNN-feature-slug]/
├── spec.md              # /speckit-specify
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command) – OpenAPI
├── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
└── traceability.md      # after the test review (workflow.md §4.4)
```

### Source Code (repository root)

<!-- Replace with the concrete paths this feature touches. -->

```text
backend/
├── src/main/java/…/      # feature package(s)
├── src/main/resources/db/migration/
└── src/test/java/…/      # unit, integration (IT), security matrix

frontend/
├── src/features/[feature]/
├── src/shared/ui/
├── src/i18n/{sl,en}/
└── src/**/*.test.tsx

e2e/
└── tests/[feature].spec.ts
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., new tool] | [current need] | [why existing tools are insufficient] |
