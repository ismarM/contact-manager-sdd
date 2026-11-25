# Data Model: Skupine kontaktov (002)

## Tabela `contact_group` (migracija `V3__skupine.sql`)

| Stolpec | Tip | Pravila | Vir |
|---|---|---|---|
| `id` | `uuid` | primarni ključ, `DEFAULT uuidv7()`; edini identifikator skupine v API-ju | FR-002-08 |
| `title` | `text` | `not null`; obrezan; 1–100 znakov (preverja aplikacija; `CHECK (char_length(title) BETWEEN 1 AND 100)`) | FR-002-02 |
| `description` | `text` | `null` = brez opisa; do 1000 kodnih točk (`CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000)`) | FR-002-02, -11 |
| `color` | `varchar(6)` | `not null default 'tinta'`; `CHECK (color IN ('tinta','mah','opeka','oker','sliva','morje','grafit','rja'))` | FR-002-02, -03 |
| `version` | `bigint` | `not null default 0`; poveča se samo ob dejanski spremembi podatkov | FR-002-12 |
| `archived_at` | `timestamptz` | `null` = nearhivirana; **piše ga samo 003** (002 le bere) | spec, Assumptions; D-27 |
| `created_at` | `timestamptz` | `not null default now()` | – |
| `updated_at` | `timestamptz` | `not null default now()`; čas zadnje spremembe podatkov (ob ustvarjanju = `created_at`) | FR-002-12 |
| `updated_by` | `bigint` | `references app_user(id) ON DELETE SET NULL`; ob ustvarjanju ustvarjalec; `null` = izbrisan uporabnik | FR-002-12, feature-map §2.5 |

Opomba: `char_length` v PostgreSQL šteje znake (kodne točke), kar se ujema s štetjem v aplikaciji (research R-07).

## Tabela `group_member` (migracija `V3__skupine.sql`)

| Stolpec | Tip | Pravila | Vir |
|---|---|---|---|
| `group_id` | `uuid` | `references contact_group(id) ON DELETE CASCADE` | – |
| `user_id` | `bigint` | `references app_user(id) ON DELETE CASCADE` (izbris računa obravnava 012 pred brisanjem uporabnika) | – |
| `role` | `varchar(6)` | `not null`; `CHECK (role IN ('VIEWER','EDITOR','ADMIN','OWNER'))` | feature-map §2.1 |
| `version` | `bigint` | `not null default 0`; verzija članstva za optimistično zaklepanje (uporabi jo 007) | feature-map §2.3; D-27 |
| `created_at` | `timestamptz` | `not null default now()` | – |

- Primarni ključ `(group_id, user_id)`.
- Delni unikatni indeks `group_member_one_owner ON group_member (group_id) WHERE role = 'OWNER'` – največ en lastnik (trajno arhivirana
  skupina brez lastnika je dovoljena: 012 odstrani vrstico `OWNER`).
- Indeks `group_member_user_role ON group_member (user_id, role)` – seznam po vlogah (SC-002).

## Kolaciji (migracija `V3__skupine.sql`)

```sql
CREATE COLLATION title_sl (provider = icu, locale = 'sl');
CREATE COLLATION title_en (provider = icu, locale = 'en');
```

## Pravila in prehodi

- **Ustvarjanje** (`POST /api/groups`): ena transakcija – `INSERT contact_group (title, description, color, updated_by)` in
  `INSERT group_member (group_id, user_id, role) VALUES (…, 'OWNER')`. Ustvarjalec je edini član (FR-002-03).
- **Urejanje** (`PUT /api/groups/{id}`): glej research R-06. Prehodi `version`: `v → v + 1` samo če se naslov, opis ali barva dejansko
  spremenijo; nespremenjeno shranjevanje ne spremeni `version`, `updated_by` in `updated_at`.
- **Seznam:** samo skupine, kjer ima uporabnik vrstico v `group_member` in je `archived_at IS NULL`; razdelek = `role`.
- **Izbris uporabnika (012):** `updated_by` postane `null` → API vrne `updatedBy: null` → vmesnik »izbrisan uporabnik«.
- Skupina se v 002 ne briše in ne arhivira (003).

## Odgovori (contracts/openapi.yaml)

```json
{
  "id": "0193c4a2-7a1f-7c3e-9b1a-3d2f4e5a6b7c",
  "title": "Projekt FERI",
  "description": "Kontakti projekta",
  "color": "mah",
  "role": "ADMIN",
  "archived": false,
  "version": 3,
  "updatedAt": "2026-11-05T12:32:10Z",
  "updatedBy": { "name": "Ana Novak", "email": "ana@primer.si" }
}
```

- `role` je vloga **klicatelja** v tej skupini; `archived` = `archived_at IS NOT NULL`.
- `updatedBy.name` je lahko `null` (račun brez imena) → vmesnik prikaže e-naslov.
- Identifikatorji uporabnikov (`app_user.id`, `firebase_uid`) niso del odgovorov.
- `GroupSummary.contactCount` je do 004 vedno `0` (konstanta v poizvedbi; 004 jo nadomesti s štetjem).

## Stanje v vmesniku

Ni novega trajnega stanja v brskalniku. Povzetek skupin za stranski pas in meni je samo v pomnilniku (`GroupsProvider`) in se ob
odjavi ali izgubi seje izbriše; strani razdelkov na zaslonu *Skupine* so lokalno stanje komponente.
