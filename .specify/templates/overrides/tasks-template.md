---

description: "Task list template for feature implementation (project override: one pass, tests inside each story)"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[NNN-feature-slug]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are **MANDATORY** (constitution, principle II) and are written **together with the code** of each story. There is no separate test phase, no test review before implementation and no test-only commit.

**Organization**: Setup → Foundational → one phase per user story (code + tests) → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- **[P]**: Can run in parallel (different files, no dependencies). Tasks marked [P] never share files.
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- **FR-IDs**: every task names the FR-IDs it covers (e.g., `FR-013-03`) – setup tasks may use `—`
- Include exact file paths in descriptions

## Path Conventions

- Backend: `backend/src/main/java/…`, tests in `backend/src/test/java/…` (`*Test` unit, `*IT` integration/security)
- Frontend: `frontend/src/…`, tests next to code as `*.test.tsx`
- E2E: `e2e/tests/*.spec.ts`

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories and FR-IDs from spec.md (incl. Negative Scenarios)
  - Public Interfaces (endpoints, routes) from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Test rules (constitution §3):
  - every group endpoint gets a parametrised isolation-matrix test (401/404/403/2xx, archived 409)
  - isolation matrix as tasks: for EVERY row of plan.md Public Interfaces (each method × path,
    incl. non-REST protocols) one test task listing its actors explicitly – unauthenticated
    (missing/invalid/expired token), non-member and missing resource (404), every role below the
    lowest allowed (403), lowest allowed and higher (2xx), archived and permanently archived group;
    writes also 409 GROUP_ARCHIVED. A row without such a task means tasks.md is incomplete.
  - security-relevant input (uploaded files, XML, credentials) gets explicit abuse-case test tasks
    on every parsing path (oversize, entity expansion/XXE, wrong type, brute force)
  - UI tests use getByRole(name)/getByLabel; names come from the translations or shared helpers
  - vitest-axe on every rendered page, @axe-core/playwright on every E2E page
  - E2E runs at 360 and 1280 px; tag a scenario @w768 only if its layout differs at that width
  - Firebase Auth Emulator, Testcontainers and MSW only – no real external services
  - keep the list short: one task per coherent change, not per file

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Feature-specific setup (migrations, i18n keys, routes)

- [ ] T001 — Create Flyway migration for [entities] in backend/src/main/resources/db/migration/V[n]__[name].sql
- [ ] T002 [P] — Add i18n keys for [feature] in frontend/src/i18n/sl.json and en.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core pieces that MUST be complete before ANY user story

- [ ] T003 FR-NNN-01 [shared piece every story needs] in backend/src/main/java/…

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story on its own]

- [ ] T004 [US1] FR-NNN-01 Implement [endpoint/service] with integration and isolation-matrix tests in backend/src/…
- [ ] T005 [US1] FR-NNN-01 Implement [page/component] with page test (RTL + MSW + vitest-axe) in frontend/src/features/[feature]/
- [ ] T006 [US1] FR-NNN-01 E2E scenario for [journey] in e2e/tests/[feature].spec.ts

**Checkpoint**: User Story 1 works end to end; `./verify.sh quick` passes

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

- [ ] TXXX — Move rules that outlive this feature into .specify/memory/feature-map.md
- [ ] TXXX — `./verify.sh quick` and the affected levels (`backend`, `e2e`) green

---

## Dependencies & Execution Order

- **Setup → Foundational** are sequential; then user stories in priority order (P1 → P2 → P3); **Polish** last.
- `/speckit-implement` runs **once** over the whole file, followed by `/speckit-converge`, one advisory
  review by the `pregled-testov` subagent and the pull request (constitution §2.3). The agent continues
  without waiting for the developers.

## Notes

- [P] tasks = different files, no dependencies
- Never weaken an assertion to make wrong code pass; say in the PR why an existing test changed
- Suppressions and disabled tests need a `utišanje: <razlog>` comment
- Run `./verify.sh quick` before marking a story done
