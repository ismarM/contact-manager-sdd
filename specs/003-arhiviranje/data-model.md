# Data Model: Arhiviranje in izbris skupine (003)

Migracije ni (research R-09): 003 uporablja tabeli iz `V3__skupine.sql` (002).

## Uporabljeni stolpci

| Tabela.stolpec | Uporaba v 003 |
|---|---|
| `contact_group.archived_at` | `NULL` = nearhivirana; `archive` ga nastavi na `now()`, `unarchive` na `NULL` (edini pisalec; D-27). `version`, `updated_at`, `updated_by` se ne spremenijo (R-04) |
| `group_member.role` | `OWNER` odloča o pravici arhiviranja in odarhiviranja; odsotnost vrstice `OWNER` v arhivirani skupini = trajno arhivirana (R-01) |
| `group_member.group_id` | `ON DELETE CASCADE` – izbris skupine odstrani članstva (FR-003-11) |

## Stanja skupine (izpeljana)

| Stanje | Pogoj | Dovoljeni prehodi |
|---|---|---|
| nearhivirana | `archived_at IS NULL` | `archive` (OWNER) → arhivirana; `delete` (edini član, OWNER) → izbrisana |
| arhivirana | `archived_at IS NOT NULL` in obstaja vrstica `OWNER` | `unarchive` (OWNER) → nearhivirana; `delete` (edini član, OWNER) → izbrisana; izbris računa lastnika (012) → trajno arhivirana |
| trajno arhivirana | `archived_at IS NOT NULL` in ni vrstice `OWNER` | samo `delete` (edini preostali član, katera koli vloga) → izbrisana |

## Pravila

- **Arhiviranje:** `UPDATE contact_group SET archived_at = now() WHERE id = :id AND archived_at IS NULL` pod zaklepom vrstice; 0 vrstic →
  `GROUP_ARCHIVED` (409).
- **Odarhiviranje:** `UPDATE … SET archived_at = NULL WHERE id = :id AND archived_at IS NOT NULL`; 0 vrstic → `GROUP_NOT_ARCHIVED` (409).
- **Izbris:** pod zaklepom vrstice `SELECT count(*) FROM group_member WHERE group_id = :id`; več kot 1 → `GROUP_HAS_OTHER_MEMBERS` (409);
  sicer `DELETE FROM contact_group WHERE id = :id` (kaskada).
- **Obveza prihodnjih funkcionalnosti:** vsaka tabela s podatki skupine (kontakti 004, revizijska sled 005, povabila 006) ima
  `group_id uuid NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE`.

## Odgovori (contracts/openapi.yaml)

`GroupDetail` (002) dobi polji:

```json
{ "archived": true, "permanentlyArchived": false, "canDelete": true }
```

- `permanentlyArchived`: `archived` in skupina nima lastnika; `canDelete`: klicatelj sme izbrisati skupino po FR-003-09 (edini član in
  (vloga `OWNER` ali `permanentlyArchived`)).

`ArchivedGroups` (`GET /api/groups/archived`):

```json
{
  "total": 30, "page": 0, "size": 25,
  "items": [
    { "id": "0193…", "title": "Konferenca 2025", "description": null, "color": "morje", "contactCount": 0,
      "role": "EDITOR", "permanentlyArchived": false }
  ]
}
```

- `contactCount` je do 004 vedno `0` (kot v 002).

## Stanje v vmesniku

Brez novega trajnega stanja. Seznam arhiviranih skupin je lokalno stanje strani (`ArchivedGroupsPage`); sporočilo »skupina je medtem
postala arhivirana« je lokalno stanje razdelka *Podatki skupine*.
