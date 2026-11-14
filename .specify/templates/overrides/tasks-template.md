---

description: "Task list template for risky features (project override: one pass, tests inside each story)"
---

# Tasks: [FEATURE NAME]

**Input**: `specs/[feature-slug]/spec.md` and `plan.md`

**Tests**: mandatory, written **together with the code** of each story (constitution §1 II, §2.3). There is no separate test phase, no gate before implementation and no test-only commit.

**Organization**: Setup → Foundational → one phase per user story (code + tests) → Finish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: user story the task belongs to (US1, US2 …)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `backend/src/main/java/…`, tests in `backend/src/test/java/…` (`*Test` unit, `*IT` integration/security)
- Frontend: `frontend/src/…`, tests next to code as `*.test.tsx`
- E2E: `e2e/tests/*.spec.ts`

<!--
  ============================================================================
  The tasks below are SAMPLES. /speckit-tasks MUST replace them with real tasks from
  spec.md (user stories, access rules) and plan.md (data model, endpoints, security).

  Project rules (.specify/memory/constitution.md §3):
  - every group endpoint gets a parametrised isolation-matrix test (401/404/403/2xx, archived 409)
  - UI tests use getByRole(name)/getByLabel; names come from the translations or shared helpers
  - vitest-axe on every rendered page, @axe-core/playwright on every E2E page
  - E2E runs at 360 and 1280 px; tag a scenario @w768 only if its layout differs at that width
  - Firebase Auth Emulator, Testcontainers and MSW only – no real external services
  - keep the list short: one task per coherent change, not per file
  ============================================================================
-->

## Phase 1: Setup

- [ ] T001 Create Flyway migration for [entities] in backend/src/main/resources/db/migration/V[n]__[name].sql
- [ ] T002 [P] Add i18n keys for [feature] in frontend/src/i18n/sl.json and en.json

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T003 [shared piece every story needs, e.g. new authentication filter] in backend/src/main/java/…

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [what this story delivers]

- [ ] T004 [US1] Implement [endpoint/service] with integration and isolation-matrix tests in backend/src/…
- [ ] T005 [US1] Implement [page/component] with page test (RTL + MSW + vitest-axe) in frontend/src/features/[feature]/
- [ ] T006 [US1] E2E scenario for [journey] in e2e/tests/[feature].spec.ts

**Checkpoint**: story works end to end; `./verify.sh quick` passes

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Finish

- [ ] TXXX `./verify.sh quick` and the affected levels (`backend`, `e2e`) green
- [ ] TXXX One advisory review of the finished diff by the `pregled-testov` subagent; fix justified findings once
- [ ] TXXX Move rules that outlive this feature into .specify/memory/feature-map.md; delete plan.md and tasks.md
- [ ] TXXX Push branch and open PR to `main` (what changed, assumptions, changed existing tests with reasons, open review findings)

---

## Dependencies & Execution Order

- Setup → Foundational → user stories in priority order → Finish.
- `/speckit-implement` runs **once** over the whole file; the agent continues without waiting for the
  developers, who review in the PR.

## Notes

- Never weaken an assertion to make wrong code pass; say in the PR why an existing test changed
- Suppressions and disabled tests need a `utišanje: <razlog>` comment
