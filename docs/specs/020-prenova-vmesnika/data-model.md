# Data Model: Prenova vmesnika

Brez sprememb hranjenih podatkov in brez migracije. Spremenjena je samo oblika odgovora `GET /api/groups`.

| Pojem | Oblika | Opomba |
|---|---|---|
| `GroupPage` (nov odgovor `GET /api/groups`) | `{ total: long, page: int, size: int, items: GroupItem[] }` | nadomešča `GroupSections {sections[]}` |
| `GroupItem` | `{ id, title, description, color, contactCount, photoRevision, role }` | `GroupSummary` iz 002/018 + `role` (`OWNER|ADMIN|EDITOR|VIEWER`) |
| Števci navigacije | `GroupPage.total` (`size=1`), `ArchivedGroups.total` (`size=1`), `InvitationCount.count` | izpeljani, samo v pomnilniku |
| Žetoni oblikovanja | `--k-*` v `frontend/src/styles/app.css` | edini vir videza |
| `reverted` na kontaktu | ostane v odgovoru in bazi | FE ga na kartici ne prikaže (FR-020-20) |
