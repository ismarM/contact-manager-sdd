# Data Model: Kontakti skupine

**Migracija**: `backend/src/main/resources/db/migration/V4__kontakti.sql` (R-01, R-02, R-03). Vse tri tabele so v `ON DELETE CASCADE` verigi iz `contact_group` (izbris skupine, 003 FR-003-11).

## contact

| Stolpec | Tip | Pravila |
|---|---|---|
| `id` | `uuid` PK, `DEFAULT uuidv7()` | časovno urejen, nikoli ni v URL drugih skupin (FR-004-14) |
| `group_id` | `uuid NOT NULL` → `contact_group(id) ON DELETE CASCADE` | kontakt pripada natanko eni skupini |
| `first_name`, `last_name` | `text` | `NULL` = prazno; do 100 znakov; vsaj eno neprazno (`CHECK`) |
| `address` | `text` | `NULL` ali 1–300 znakov, večvrstično |
| `email` | `text` | `NULL` ali 1–254 znakov |
| `phone` | `text` | `NULL` ali 1–30 znakov |
| `sort_last`, `sort_first` | `text COLLATE "C"` (od V8, 008: `COLLATE sort_sl`, D-63) | `toLowerCase(Locale.ROOT)` priimka in imena; `NULL`, ko je prazno (R-03) |
| `version` | `bigint NOT NULL DEFAULT 0` | optimistično zaklepanje; povečanje samo ob dejanski spremembi (FR-004-10) |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | tretji ključ razvrščanja |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | čas zadnje spremembe |
| `updated_by` | `bigint` → `app_user(id) ON DELETE SET NULL` | `NULL` = izbrisan uporabnik (feature-map §2.5) |

Indeks: `contact_group_sort (group_id, sort_last, sort_first, created_at, id)`.

## contact_attribute

| Stolpec | Tip | Pravila |
|---|---|---|
| `contact_id` | `uuid NOT NULL` → `contact(id) ON DELETE CASCADE` | |
| `position` | `integer NOT NULL` | vrstni red vnosa (0, 1, …) |
| `key` | `text NOT NULL` | 1–50 znakov, izvorna oblika |
| `key_norm` | `text NOT NULL` | normalizirana oblika (R-02) |
| `value` | `text NOT NULL` | 1–500 znakov |

`PRIMARY KEY (contact_id, position)`, `UNIQUE (contact_id, key_norm)`. Največ 50 vrstic na kontakt omeji strežnik (FR-004-02).

## contact_tag

| Stolpec | Tip | Pravila |
|---|---|---|
| `contact_id` | `uuid NOT NULL` → `contact(id) ON DELETE CASCADE` | |
| `position` | `integer NOT NULL` | vrstni red vnosa |
| `tag` | `text NOT NULL` | 1–50 znakov brez presledkov, izvorna oblika |
| `tag_norm` | `text NOT NULL` | normalizirana oblika |

`PRIMARY KEY (contact_id, position)`, `UNIQUE (contact_id, tag_norm)`; indeks `contact_tag_norm (tag_norm, contact_id)` za predloge in prihodnje filtre (008). Največ 30 vrstic na kontakt.

## Izpeljani pojmi

- **Prikazno ime**: `first_name + ' ' + last_name`, brez manjkajočega dela (strežnik ga vrne kot `displayName`).
- **Značke skupine**: `SELECT tag FROM contact_tag t JOIN contact c ON c.id = t.contact_id WHERE c.group_id = :group` – vir predlogov (FR-004-04).
- **Stran seznama**: `ORDER BY sort_last NULLS LAST, sort_first NULLS LAST, created_at, id LIMIT :size OFFSET :page*:size`.

## Prehodi stanja

`ustvarjen (version 0)` → `posodobljen (version n+1)` samo ob dejanski spremembi → `izbrisan` (brez mehkega izbrisa; obnovitev je v 005). Kontakt ne zamenja skupine.
