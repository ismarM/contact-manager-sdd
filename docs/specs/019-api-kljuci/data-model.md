# Data Model: API ključi (019)

Migracija **`V14__api_kljuci.sql`** (dodeljena; v fazi PR preveri glede na `main` in po potrebi preštevilči). Samo
naprej; obstoječi podatki se ne spremenijo (nov stolpec sledi je `NULL`).

## Tabela `api_key` (FR-019-01 … 05, -21)

| Stolpec | Tip | Pravilo |
|---|---|---|
| `id` | uuid PK, `uuidv7()` | = `jti` v žetonu |
| `user_id` | bigint NOT NULL → `app_user(id)` ON DELETE CASCADE | izbris računa izbriše ključe in statistiko |
| `name` | text NOT NULL | 1–50 znakov (CHECK) |
| `hint` | text NOT NULL | zadnjih 6 znakov ključa (CHECK dolžina 6); prikaz `cmk_…xxxxxx` |
| `all_groups` | boolean NOT NULL | »vse moje skupine, tudi prihodnje« |
| `all_groups_permission` | text NULL | `READ`/`WRITE`; NOT NULL natanko tedaj, ko `all_groups` (CHECK) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `expires_at` | timestamptz NULL | `NULL` = brez roka; enak `exp` v žetonu |
| `last_used_at` | timestamptz NULL | posodobi `ApiUsageFilter` |
| `revoked_at` | timestamptz NULL | preklic; ne briše vrstice |

Indeks `api_key_user (user_id, created_at)`. Stanje (izpeljano): `REVOKED` če `revoked_at`, sicer `EXPIRED` če
`expires_at <= now()`, sicer `ACTIVE` (`expiringSoon` če `expires_at - now() <= 7 dni`). Aktivnih ≤ 10 na uporabnika
(preverja aplikacija pod zaklepom `app_user`, kot `app_password`). Vrstica se ne spreminja razen `last_used_at` in
`revoked_at`.

## Tabela `api_key_group` (prikazni obseg; FR-019-01, -02)

| Stolpec | Tip | Pravilo |
|---|---|---|
| `key_id` | uuid → `api_key(id)` ON DELETE CASCADE | PK (`key_id`, `group_id`) |
| `group_id` | uuid → `contact_group(id)` ON DELETE CASCADE | izbrisana skupina izgine s seznama |
| `permission` | text NOT NULL | `READ`/`WRITE` |

Indeks `api_key_group_group (group_id)`. Vrstice obstajajo samo, kadar `all_groups = false` (1–50 skupin). Avtorizacija
uporablja trditev `scp` v podpisanem žetonu, ta tabela je samo za seznam in izvoz. Ključ brez vrstic in brez
`all_groups` je na seznamu »brez veljavnih skupin«.

## Tabela `api_key_usage` (FR-019-20, -21)

| Stolpec | Tip | Pravilo |
|---|---|---|
| `key_id` | uuid → `api_key(id)` ON DELETE CASCADE | PK (`key_id`, `hour`) |
| `hour` | timestamptz NOT NULL | začetek ure (UTC) |
| `read_ok`, `write_ok`, `errors`, `rate_limited` | integer NOT NULL DEFAULT 0, CHECK ≥ 0 | števci po izidu |

Hramba 90 dni (`ApiKeyPurgeJob`). Dnevni povzetki in »24 ur« se izračunajo ob branju (research R-06).

## `audit_entry` – nov stolpec (FR-019-12)

- `api_key_name text NULL` (CHECK 1–50 znakov): ime ključa ob spremembi prek API; `NULL` za spletno aplikacijo.
- `CREATE OR REPLACE FUNCTION audit_entry_immutable()`: dovoljena je samo posodobitev `actor_id → NULL` (izbris računa,
  kot doslej); ob njej sprožilec nastavi `NEW.api_key_name := NULL`. Vse drugo ostane prepovedano.

## Žeton (ni v bazi)

`cmk_` + JWT HS256: `iss`, `aud`, `sub` (= `api_key.user_id`), `jti` (= `api_key.id`), `iat`, `exp?`, `scp`
(`{"all":"READ|WRITE"}` ali `{"groups":{"<uuid>":"READ|WRITE"}}`). Glej `docs/architecture-decisions.md#2026-11-16-api-kljuc-jwt`.

## Izvoz *Moji podatki* (012, FR-019-05, -21)

`MyData.apiKeys[]`: `name`, `allGroups`, `allGroupsPermission`, `groups[] {title, permission}`, `createdAt`,
`expiresAt`, `lastUsedAt`, `revokedAt`, `usage[] {day, readOk, writeOk, errors, rateLimited}` (dnevni povzetki).
Brez žetona in brez `hint`.

## Konfiguracija

`api-keys.signing-secret` (`API_KEY_SIGNING_SECRET`, base64, ≥ 32 bajtov, obvezno), `api-keys.rate-limit` (120),
`api-keys.stats-zone` (`Europe/Ljubljana`), `api-keys.purge-interval` (1 h). V testih se skrivnost generira.
