# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[feature-slug]` (no number; the directory is `specs/[NNN-feature-slug]/`)

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

<!--
  PROJECT RULES (override of the core spec template – see .specify/memory/workflow.md §1):
  - Content is written in Slovenian; headings stay in English so Spec Kit commands find them.
  - Every functional requirement has the ID FR-NNN-XX, where NNN is this feature's directory
    number and XX a running number (FR-004-07). IDs are never reused; a removed requirement
    stays in the list marked "REMOVED [CR-NN]".
  - Every requirement has at least one Given/When/Then scenario that names its FR-ID.
  - Every requirement that touches group data has negative scenarios (section below).
  - HTTP status codes in negative scenarios are part of the security contract
    (constitution, principle III) and are NOT considered implementation details.
  - Look/behaviour of the UI follows .specify/memory/design.md; do not repeat it here,
    only reference the section when the behaviour itself is a requirement.
-->

## User Scenarios & Testing *(mandatory)*

<!--
  User stories are PRIORITIZED (P1, P2, ...) and each is INDEPENDENTLY TESTABLE.
  Each acceptance scenario starts with the FR-ID(s) it verifies.
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [How this can be tested independently]

**Acceptance Scenarios**:

1. **[FR-NNN-01]** **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **[FR-NNN-02]** **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [How this can be tested independently]

**Acceptance Scenarios**:

1. **[FR-NNN-03]** **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Negative Scenarios *(mandatory when the feature touches group data)*

<!--
  Required actors for every requirement that touches group data
  (role hierarchy VIEWER < EDITOR < ADMIN < OWNER):
  - unauthenticated (no token, invalid token, expired token)         → 401
  - authenticated, not a member of the group                         → 404 (existence is not revealed)
  - member with every role below the lowest allowed role             → 403
  Where relevant also:
  - archived group (every member effectively has VIEWER rights)      → 409 GROUP_ARCHIVED for writes
  - "only lower than yourself" rules for member management           → 403
  - concurrent change (optimistic locking)                           → 409 VERSION_CONFLICT
  User-bound resources (invitations, own data, own account): 401 unauthenticated,
  404 for someone else's resource.
-->

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-NNN-01 | unauthenticated (no/invalid/expired token) | [action] | 401, nothing changes |
| FR-NNN-01 | authenticated non-member | [action] | 404, existence is not revealed |
| FR-NNN-01 | member with role [below lowest allowed] | [action] | 403, nothing changes |
| FR-NNN-01 | member of an archived group | [write action] | 409 GROUP_ARCHIVED, nothing changes |

### Edge Cases

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

### Functional Requirements

<!--
  Each line: **FR-NNN-XX**: System MUST ... (lowest allowed role in parentheses where it applies).
  Mark unclear requirements with [NEEDS CLARIFICATION: ...] (max 3).
-->

- **FR-NNN-01**: System MUST [specific capability] *(lowest role: [VIEWER|EDITOR|ADMIN|OWNER|—])*
- **FR-NNN-02**: System MUST [specific capability]
- **FR-NNN-03**: Users MUST be able to [key interaction]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: [Measurable, technology-agnostic metric]
- **SC-002**: [Measurable, technology-agnostic metric]

## Assumptions

- [Assumption about scope boundaries]
- [Dependency on another feature, e.g., "Requires 002-skupine (groups and roles)"]

## Changes *(living spec – change requests)*

<!--
  When an already approved requirement changes (workflow.md §4.5):
  - mark the new/changed requirement with [CR-NN] (project-wide numbering),
  - mark a removed requirement "REMOVED [CR-NN]" instead of deleting it,
  - add a row here and a "sprememba-specifikacije" entry in DECISIONS.md.
-->

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | No changes yet | – |
