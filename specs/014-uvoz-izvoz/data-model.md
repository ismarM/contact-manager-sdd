# Data Model: Uvoz in izvoz kontaktov

Migracija `V11__uvoz_izvoz.sql` (samo naprej; obstoječi podatki se ne spreminjajo).

## Spremembe obstoječih tabel

- `audit_entry.action`: CHECK dobi vrednost `IMPORT` (`DROP CONSTRAINT audit_entry_action_check` + nov CHECK z `CREATE, UPDATE, DELETE, MERGE, ROLLBACK, IMPORT`). Vnos `IMPORT`: `contact_count = N` (1–10 000), `contact_name` samo pri N = 1, spremembe `audit_change` z `before = NULL`, `after = posnetek` za vsak kontakt. Nespremenljivost (sprožilci V5) velja nespremenjeno. Java `AuditAction.IMPORT`; frontend `AUDIT_ACTIONS` in prevodi `audit.sentence.IMPORT_*`, filter sledi.

## Nove tabele

### `app_password` (geslo za aplikacijo, FR-014-21, -25)

| Stolpec | Tip | Pravila |
|---|---|---|
| `id` | `uuid` PK, `DEFAULT uuidv7()` | opaken id v API |
| `user_id` | `bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE` | izbris računa prekliče vsa gesla |
| `name` | `text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50)` | po obrezu presledkov; ni nujno edinstveno |
| `secret_hash` | `bytea NOT NULL CHECK (octet_length(secret_hash) = 32)` | SHA-256 normaliziranega gesla; geslo se ne hrani |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `last_used_at` | `timestamptz` | `NULL` = »še ni uporabljeno«; posodobitev največ 1× na minuto |

Indeks `app_password_user (user_id, created_at)`. Največ 10 vrstic na uporabnika – preveri aplikacija ob ustvarjanju pod zaklepom vrstice `app_user` (`SELECT … FOR UPDATE`) → sicer `409 APP_PASSWORD_LIMIT`. Preklic = `DELETE` (preklicano geslo ne obstaja več).

### `dav_login_state` (zaklep prijave CardDAV, FR-014-26)

| Stolpec | Tip | Pravila |
|---|---|---|
| `user_id` | `bigint PK REFERENCES app_user(id) ON DELETE CASCADE` | samo obstoječi računi |
| `failed_count` | `integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0)` | zaporedni neuspehi v oknu |
| `window_started_at` | `timestamptz` | začetek 15-minutnega okna |
| `locked_until` | `timestamptz` | prijava zavrnjena do tega časa |

Prehodi: neuspeh (okno poteklo → `failed_count = 1`, novo okno; sicer `+1`; pri 10 → `locked_until = now() + 15 min`) · uspeh → vrstica izbrisana · med zaklepom ni štetja ne preverjanja gesla.

## Nepersistentni modeli (API)

- **ImportCandidate**: `firstName, lastName, address, email, phone, company, countryText, attributes[{key, value}], tags[]` – nizi brez obrezovanja, ki ga opravi `ContactInputParser`.
- **ImportSheet** (razčlenitev Excela): `sheetCount, headers[], suggestedMapping[{column, target, key?}], rows[{rowNumber, cells[]}]`; `target ∈ FIRST_NAME, LAST_NAME, ADDRESS, EMAIL, PHONE, COUNTRY, COMPANY, TAGS, ATTRIBUTE, SKIP`.
- **PreviewRow**: `index, errors[{field, code}], country{status FOUND|AMBIGUOUS|UNKNOWN|EMPTY, code?, candidates[]}, duplicate{reason NAME|EMAIL|PHONE, contactName, inFileRow?}?, normalized{attributes keys, tags}`.
- **Vizitka (vCard)**: preslikava v research R-03; ne hrani se.
- **Imenik CardDAV**: pogled na `contact` skupine + `group_member`; `sync-token`/`getctag` = `audit_head.last_seq`, `getetag` = `version` + `updated_at` (R-08). Brez nove tabele.

## Vpliv na obstoječe funkcionalnosti

- 005: nova vrsta vnosa `IMPORT` (prikaz, filter, rollback kot pri drugih vnosih z več kontakti).
- 012: izvoz »moji podatki« dobi `appPasswords[{name, createdAt, lastUsedAt}]`; izbris računa kaskadno izbriše `app_password` in `dav_login_state`.
