# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[feature-slug]` (directory `specs/[feature-slug]/`, no number)

**Created**: [DATE]

**Input**: User description: "$ARGUMENTS"

<!--
  PROJECT RULES (override of the core spec template – .specify/memory/constitution.md §2.2):
  - Keep it SHORT: 1–2 pages. Describe what and why, not how.
  - Content in Slovenian; headings stay in English so Spec Kit commands find them.
  - Requirements are numbered FR-1, FR-2 … within this file only. Tests do not have to carry them.
  - Do NOT create checklists/ or any other file next to spec.md.
  - Do not repeat shared rules (roles, order of checks, error codes, data dictionary) –
    reference .specify/memory/feature-map.md §2 and state only what is specific to this feature.
  - UI look and behaviour follow .specify/memory/design.md; reference a section only when the
    behaviour itself is a requirement.
  - This file is a working document: after the merge it is not maintained; code and tests are the truth.
-->

## User Scenarios & Testing *(mandatory)*

### User Story 1 - [Brief Title] (Priority: P1)

[Plain-language journey: who, what, why]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories only if they can be delivered independently]

### Edge Cases

- [boundary condition or error scenario and the expected behaviour]

## Requirements *(mandatory)*

### Functional Requirements

<!-- Mark what you cannot decide with [NEEDS CLARIFICATION: question] instead of guessing. -->

- **FR-1**: System MUST [capability]
- **FR-2**: Users MUST be able to [interaction]

### Access rules *(mandatory when the feature touches group data)*

<!--
  The isolation matrix applies as always (401 unauthenticated, 404 non-member, 403 below the
  lowest role, 2xx from the lowest role up). State only what is specific to this feature.
-->

| Action / endpoint | Lowest role | In archived group | Notes |
|---|---|---|---|
| [action] | [VIEWER/EDITOR/ADMIN/OWNER or — for user-bound] | [allowed / 409 GROUP_ARCHIVED] | [e.g. "only lower than yourself", new error code] |

### Key Entities *(include if the feature involves data)*

- **[Entity]**: [what it represents, key attributes, relationships]

## Assumptions

- [scope boundary, dependency on an existing feature, default chosen]
