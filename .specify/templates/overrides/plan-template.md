# Implementation Plan: [FEATURE]

**Branch**: `[feature-slug]` | **Date**: [DATE] | **Spec**: `specs/[feature-slug]/spec.md`

<!--
  PROJECT RULES (override of the core plan template – .specify/memory/constitution.md §2.2):
  - A plan is written ONLY for risky changes (auth, new kind of caller, schema migration of
    existing data, external services, personal data).
  - SINGLE FILE. Do NOT generate research.md, data-model.md, quickstart.md or contracts/ –
    whatever is really needed from them goes into the sections below. Where the /speckit-plan
    command text asks for those files, this rule wins.
  - Keep it short: decisions and their reasons, not tutorials. Content in Slovenian, headings in English.
  - Accessible names are not specified here; they live in frontend/src/i18n/.
  - This file is deleted before the merge to main.
-->

## Summary

[What is being built and the chosen technical approach, in a few sentences]

## Decisions

<!-- Open questions resolved during planning. One line each: decision – reason – rejected alternative. -->

- [decision] – [why] – [alternative rejected because …]

## Data Model & Migration

- **Entities / tables**: [new or changed, key fields, constraints]
- **Migration**: [new `V<n>__name.sql`; how existing rows are handled; is it reversible]

## REST Endpoints

| Method | Path | Lowest role | In archived group | Success | Errors specific to this feature |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/… | EDITOR | rejected (409 GROUP_ARCHIVED) | 201 | [new error codes] |

## Pages and Routes

| Page | Route | Lowest role |
|---|---|---|
| [Page name] | /groups/:groupId/… | VIEWER |

## Security & Privacy

- [authentication / authorisation changes, new kinds of callers, how the isolation matrix covers them]
- [personal data touched; effect on data export and account deletion]

## Risks & Rollout

- [what can go wrong, how it is detected, order of PRs if the work is split]

## Constitution Check

<!-- Fill only if the plan deviates from .specify/memory/constitution.md; otherwise write "No deviations". -->

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| – | – | – |
