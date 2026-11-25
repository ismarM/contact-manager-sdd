# Data Model: Napredna revizijska sled in zgodovina kontakta

**Migracija**: `backend/src/main/resources/db/migration/V11__napredna_revizija.sql` (research R-03, R-04, R-06). Brez novih tabel in stolpcev; obstoječi podatki se ne spreminjajo. Zgodovina, različice, primerjava in seznam izbrisanih kontaktov so **izpeljani** iz `audit_entry` / `audit_change` (005).

## Spremembe sheme

| Objekt | Sprememba | Opomba |
|---|---|---|
| `audit_entry.action` (`CHECK`) | vrednosti `CREATE, UPDATE, DELETE, MERGE, ROLLBACK` + **`RESTORE`** | omejitev se zamenja (`DROP CONSTRAINT` + `ADD CONSTRAINT`); ob dotiku 014 mora zadnja migracija vsebovati unijo vrst |
| `audit_entry_target` (`CHECK`) | `action IN ('ROLLBACK','RESTORE')` ⇒ natanko eden od `target_entry_id`, `target_initial`; druge vrste: oba prazna | `RESTORE`: cilj je vnos, po katerem je nastala obnovljena različica, ali izhodiščna različica |
| `audit_entry_group_actor` | indeks `(group_id, actor_id, seq DESC)` | filter in seznam izvajalcev (R-03) |
| `audit_change_removed` | parcialni indeks `(entry_id) WHERE after IS NULL` | seznam izbrisanih (R-06) |
| `audit_entry_group_seq`, `audit_change_contact` | obstoječa (005) | zgodovina kontakta |

Sprožilca nespremenljivosti (`audit_entry_immutable`, `audit_change_immutable`) in `ON DELETE` kaskade ostanejo nespremenjeni; `DROP/ADD CONSTRAINT` ne sproži sprožilcev na vrsticah.

## Vnos `RESTORE` (v `audit_entry` / `audit_change`)

- `audit_entry`: `action = 'RESTORE'`, `actor_id` = obnovitelj, `created_at` = strežniški čas, `contact_count = 1`, `contact_name` = prikazno ime obnovljenega kontakta, `target_entry_id` = vnos, katerega `after` je bila obnovljena različica, **ali** `target_initial = true` (izhodiščna različica).
- `audit_change` (ena vrstica): `contact_id`, `display_name`, `before` = stanje pred obnovo (`NULL`, če je bil kontakt izbrisan), `after` = stanje po obnovi (`version` = max(trenutna, vse v sledi) + 1; `updatedById` = obnovitelj; `updatedAt` = čas obnove; `createdAt` iz različice).
- `contact` po obnovi: vrednosti različice, nova verzija, `updated_by` = obnovitelj, `updated_at = now()`, `reverted_entry_id = NULL`.

## Izpeljani pojmi (ni shranjeno)

- **Dogodek zgodovine kontakta**: vrstica `audit_change` kontakta + glava vnosa; `kind` = `ADDED` (`before IS NULL`) | `REMOVED` (`after IS NULL`) | `CHANGED`; `fields` = `ChangeDiff.fields(before, after)`; `hasVersion` = `after IS NOT NULL`; `mergedInto` = kontakt iste združitve z `after IS NOT NULL` (samo `MERGE` + `REMOVED`).
- **Stanje kontakta** (`status`): `ACTIVE` (vrstica v `contact`), `DELETED` (ni vrstice; zadnji vnos ni `MERGE`) ali `MERGED` (ni vrstice; zadnji vnos `MERGE`).
- **Različica**: `entryId` (`after` vrstice), `initial` (`before` prve vrstice, če `NOT NULL`), `current` (živ kontakt). Identiteta različice je par (`contactId`, ref).
- **Izbrisan kontakt (seznam)**: vrstica odstranjevanja kontakta, ki je zadnja sprememba v sledi in kontakta ni v `contact` (research R-06); `reason` = `DELETED` (`DELETE`), `ROLLBACK`, `MERGED` (`MERGE`); `restorable` = `reason != MERGED`.
- **Žeton izvajalca**: `uuid` iz `sha256(group_id || ':' || actor_id)`; `deleted` za `actor_id IS NULL`; `kind` = `MEMBER` (vrstica v `group_member`) | `FORMER` | `DELETED`.
- **Žeton obnove**: obstoječ kontakt – `contact.version`; izbrisan – `lastEntryId` (najnovejši vnos kontakta v sledi).

## Prehodi stanja

- Kontakt: `ACTIVE` → (izbris ali rollback) `DELETED` → (obnova 015 ali rollback 005) `ACTIVE`; `ACTIVE` → (združitev, kot odstranjeni) `MERGED` → (samo rollback skupine) `ACTIVE`.
- Vnos `RESTORE`: nastane v isti transakciji kot obnova → nespremenljiv → izbrisan samo s skupino.
