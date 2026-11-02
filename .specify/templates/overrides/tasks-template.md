---

description: "Task list template for feature implementation (project override: tests mandatory)"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[NNN-feature-slug]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are **MANDATORY** for every feature in this project (constitution, principle II). Every FR-ID in spec.md gets at least one test task. Test tasks come BEFORE implementation and are followed by a human test review.

**Organization**: Setup → Foundational → Tests → Test review → implementation per user story → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- **[P]**: Can run in parallel (different files, no dependencies). Tasks marked [P] never share files.
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- **FR-IDs**: every task names the FR-IDs it covers (e.g., `FR-004-03`) – setup tasks may use `—`
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
  - Public Interfaces (endpoints, routes, accessible names) from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Test rules (constitution II, workflow.md §2):
  - tests carry the FR-ID: JUnit @Tag("FR-004-03"); Vitest/Playwright test name "FR-004-03: …"
  - every group endpoint gets a parametrised isolation-matrix test (401/404/403/2xx)
  - UI tests use only getByRole(name)/getByLabel with names from plan.md
  - vitest-axe on every rendered page, @axe-core/playwright on every E2E page
  - E2E runs at 360, 768 and 1280 px
  - Firebase Auth Emulator, Testcontainers and MSW only – no real external services
  - tests must fail for the RIGHT reason before implementation (missing behaviour,
    not a compile error); test tasks may create minimal scaffolding (DTOs, 501 controllers,
    empty page components) so the tests compile

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Feature-specific setup (migrations, i18n namespaces, routes)

- [ ] T001 — Create Flyway migration for [entities] in backend/src/main/resources/db/migration/V[n]__[name].sql
- [ ] T002 [P] — Add i18n namespace [feature] in frontend/src/i18n/{sl,en}/[feature].json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY test or user story

- [ ] T003 FR-NNN-01 Create DTOs and controllers returning 501 in backend/src/main/java/…/[Feature]Controller.java
- [ ] T004 [P] FR-NNN-01 Create empty page components and routes in frontend/src/features/[feature]/

**Checkpoint**: Tests can now be written and compiled

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

- [ ] T005 [P] [US1] FR-NNN-01 Integration test (Testcontainers + Firebase Auth Emulator) in backend/src/test/java/…/[Feature]ApiIT.java
- [ ] T006 [P] [US1] FR-NNN-01 Isolation matrix test (401/404/403/2xx, archived 409) in backend/src/test/java/…/[Feature]SecurityIT.java
- [ ] T007 [P] [US1] FR-NNN-01 Unit test for [domain rule] in backend/src/test/java/…/[Rule]Test.java
- [ ] T008 [P] [US1] FR-NNN-01 Page test (RTL + MSW + vitest-axe) in frontend/src/features/[feature]/[Page].test.tsx
- [ ] T009 [P] [US1] FR-NNN-01 E2E scenario (axe, 3 viewports) in e2e/tests/[feature].spec.ts

---

## Phase 4: Test review (human gate)

- [ ] T010 — Test review by both developers: every FR-ID has a test; negative scenarios and isolation matrix covered; role-based selectors; meaningful assertions. Then commit `test(NNN): …` and create `traceability.md`.

**Checkpoint**: No implementation task starts before T010 is checked. From here on tests change only to match the spec (logged in DECISIONS.md).

---

## Phase 5: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [Which tests from Phase 3 turn green]

- [ ] T011 [P] [US1] FR-NNN-01 Create [Entity] entity and repository in backend/src/main/java/…/
- [ ] T012 [US1] FR-NNN-01 Implement [Service] in backend/src/main/java/…/ (depends on T011)
- [ ] T013 [US1] FR-NNN-01 Implement [endpoint] in backend/src/main/java/…/[Feature]Controller.java
- [ ] T014 [US1] FR-NNN-01 Implement [page] in frontend/src/features/[feature]/

**Checkpoint**: User Story 1 tests are green; `./verify.sh quick` passes

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

- [ ] TXXX — Update specs/[NNN-feature-slug]/traceability.md (every FR-ID → tests → state)
- [ ] TXXX — Manual keyboard + screen reader check (design.md §10)
- [ ] TXXX — `./verify.sh full` green

---

## Dependencies & Execution Order

- **Setup → Foundational → Tests → Test review** are strictly sequential.
- **User stories** start only after the test review; then in priority order (P1 → P2 → P3).
- **Polish** after all stories.
- `/speckit-implement` is run twice: first only up to and including Phase 3 (tests), then – after the
  human review – for the remaining phases (workflow.md §4.2).

## Notes

- [P] tasks = different files, no dependencies
- Every task names its FR-IDs for traceability
- Never change a test to match the code; any test change after review → DECISIONS.md entry
- No warning suppressions without an approved D-NN in DECISIONS.md
- Run `./verify.sh quick` before marking a task done
