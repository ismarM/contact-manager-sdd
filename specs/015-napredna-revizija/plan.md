# Implementation Plan: Napredna revizijska sled in zgodovina kontakta

**Branch**: `napredna-revizija` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-napredna-revizija/spec.md`

## Summary

Zgodovina kontakta, ogled in primerjava različic, seznam izbrisanih kontaktov in filter sledi po izvajalcu so **izpeljani iz obstoječih tabel 005** (`audit_entry`, `audit_change`): `audit_change.contact_id` nima tujega ključa, `before`/`after` hranita celotno stanje, zato nova tabela ni potrebna. Edini novi podatki so vrsta dejanja `RESTORE` (razširitev `CHECK` na `audit_entry`, sklic na obnovljeni vnos prek obstoječega `target_entry_id` / `target_initial`) in trije indeksi (migracija `V11__napredna_revizija.sql`). Obnova enega kontakta teče pod istim zaklepom skupine kot ostala pisanja in rollback, zapiše en vnos `RESTORE` in spremeni samo ta kontakt. Backend: nov paket-lokalni del v `audit` (kontrolerji, storitve, repozitorij poizvedb) + ena dodana metoda v `ContactSnapshots` in nova enota `DuplicateLookup` v `contact`. Frontend: nova mapa `features/history/` (časovnica, ogled/primerjava, obnova, izbrisani kontakti) in majhne dopolnitve `features/audit` (filter po izvajalcu) ter dve povezavi v `features/contacts`.

## Technical Context

**Language/Version**: Java 21 (Spring Boot 3.x, JdbcClient) · TypeScript (strict) + React

**Primary Dependencies**: brez novih

**Storage**: PostgreSQL; ena migracija `V11__napredna_revizija.sql` (razširitev dveh `CHECK` in trije indeksi; brez novih tabel in stolpcev)

**Testing**: JUnit 5, Testcontainers · Vitest, RTL, MSW, vitest-axe · Playwright + axe

**Target Platform**: Docker Compose, evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: prva stran zgodovine kontakta < 2 s (p95) pri 100.000 vnosih (SC-003); prva stran *Izbrisani kontakti* < 2 s (p95) pri 10.000 izbrisanih (SC-007)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, optimistično zaklepanje, nespremenljivi vnosi 005, brez sprememb Patrikovih datotek (014)

**Scale/Scope**: do 100.000 vnosov in 10.000 izbrisanih kontaktov na skupino

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-015-01 … 24; vsaka naloga navede FR-ID |
| II. Tests are mandatory | enota: razvrstitev stanja kontakta, žeton izvajalca; IT: filter, zgodovina, različice, primerjava, obnova (pravila, sočasnost, nespremenljivost), seznam izbrisanih, zmogljivost; FE: komponente z MSW; E2E: celoten tok |
| III. Group isolation and roles | vseh 9 novih endpointov v matriki izolacije (401/404/403/2xx, arhivirana 409); vsaka poizvedba z `group_id`; kontakt/vnos druge skupine = 404 |
| IV. Accessible, bilingual, responsive UI | design.md 8.9, 8.10, 8.11, 8.13–8.15, 9.4, 9.6, 10; sl/en; vrsta spremembe z besedilom |
| V. Data integrity | obnova atomarna pod zaklepom skupine, ena transakcija z vnosom; vnosi nespremenljivi; verzija = max(trenutna, vse v sledi) + 1 |
| VI. Privacy and GDPR | žeton izvajalca ne razkrije internega id; izbrisani uporabniki ostanejo anonimni; nekdanji člani prikazani kot že v 005 |
| VII. One verification path | `./verify.sh quick` po rezinah; `backend` in `e2e` zaradi API, migracije in UI |

## Public Interfaces *(mandatory)*

### REST endpoints

Pot `deleted-contacts` je namenoma ločena od `contacts/{contactId}`, da ne pride do dvoumnega ujemanja poti. Vsi so pod `/api/groups/{groupId}`; neveljaven `contactId`/`ref` je `404`. Vrstni red (§2.2): 401 → 404 → 403 → 409 GROUP_ARCHIVED → 400 → 409 VERSION_CONFLICT → 409 poslovno pravilo.

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /audit?actor=&action=&contact=&page=&size= | VIEWER | allowed | 200 (`AuditPage` + `actorFilter`) | FR-015-01, -02, -04 |
| GET | /audit/actors | VIEWER | allowed | 200 | FR-015-03 |
| GET | /contacts/{contactId}/history?page=&size= | VIEWER | allowed | 200 | FR-015-05, -06, -07, -18 |
| GET | /contacts/{contactId}/versions/{ref} | VIEWER | allowed | 200 | FR-015-08 |
| GET | /contacts/{contactId}/compare?from=&to= | VIEWER | allowed | 200 | FR-015-09 |
| GET | /contacts/{contactId}/restore-preview?from= | VIEWER | allowed | 200 | FR-015-11, -14 |
| POST | /contacts/{contactId}/restore | EDITOR | rejected (409 GROUP_ARCHIVED) | 201 (`AuditEntry` vnosa `RESTORE`) | FR-015-10 … -15 |
| GET | /deleted-contacts?q=&state=&page=&size= | VIEWER | allowed | 200 | FR-015-22, -23, -24 |

`{ref}`, `from`, `to`: `entryId` (stanje takoj po vnosu), `initial` (stanje pred prvim zabeleženim vnosom) ali `current` (samo `to`/`versions`, samo za obstoječ kontakt). `actor`: žeton iz `/audit/actors` ali `deleted`. `state`: `all` (privzeto) | `restorable` | `merged`. Velikosti strani 25, 50, 100.

`POST …/restore` telo: `{ "from": "<entryId>|initial", "version": <n> }` za obstoječ kontakt, `{ "from": …, "lastEntryId": "<uuid>" }` za izbrisan kontakt (najnovejši vnos zgodovine kontakta, kot ga je videl uporabnik). Manjkajoče polje → `400 REQUIRED`.

Nove kode (feature-map §2.10): `RESTORE_NO_CHANGES` (409), `RESTORE_NOT_ALLOWED` (409, kontakt je bil z združevanjem odstranjen). Obstoječi endpointi 005 (`GET /audit`, `/audit/{entryId}`, `/changes`, rollback) ostanejo nespremenjeni; `GET /audit` dobi samo neobvezni `actor` in polje `actorFilter` v odgovoru; `AuditEntry.action` dobi vrednost `RESTORE`.

### Pages and routes

| Path | Zaslon | Dostop |
|---|---|---|
| `/groups/:groupId/contacts/:contactId/history` | zgodovina kontakta (obstoječ in izbrisan); `?page`, `?size` | VIEWER+ |
| `/groups/:groupId/contacts/:contactId/history/:ref` | ogled različice (`ref` = entryId ali `initial`) | VIEWER+ |
| `/groups/:groupId/contacts/:contactId/compare?from=&to=` | primerjava dveh različic | VIEWER+ |
| `/groups/:groupId/deleted-contacts?q=&state=&page=&size=` | seznam izbrisanih kontaktov | VIEWER+ |
| `/groups/:groupId/audit?actor=…` | obstoječa sled z novim filtrom | VIEWER+ |

Obnova je dialog (8.11) na zgodovini, ogledu različice in seznamu izbrisanih, ne stran. V pogledu kontakta (004) nadomesti povezavo »Spremembe tega kontakta v revizijski sledi« razdelek s povezavama *Zgodovina kontakta* in obstoječo na sled; v seznamu kontaktov je povezava *Izbrisani kontakti*.

## Project Structure

### Documentation (this feature)

```text
specs/015-napredna-revizija/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/openapi.yaml
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/main/resources/db/migration/V11__napredna_revizija.sql
├── src/main/java/si/contactmanager/audit/
│   ├── AuditAction (+RESTORE) · AuditController (+actor) · AuditRepository (+actor filter, žeton, seznam izvajalcev)
│   ├── ContactHistoryController   # history, versions, compare, restore-preview, restore
│   ├── ContactHistoryService · ContactHistoryRepository   # izpeljava iz audit_change; DTO: HistoryPage, VersionView, Comparison*, RestorePreview
│   ├── RestoreService             # zaklep skupine, preverbe, ContactSnapshots.restore, AuditLog.recordRestore
│   ├── DeletedContactController · DeletedContactRepository # izpeljan seznam
│   └── (ponovno uporabljeno) ChangeDiff, ContactChangeView, AuditRepository.maxVersions/lockGroupArchived, ContactSnapshots.load
├── src/main/java/si/contactmanager/contact/
│   ├── ContactSnapshots (+restore: ena vrstica, brez oznake rollbacka)
│   └── DuplicateLookup            # nova javna enota: kontakti z enakim e-naslovom ali imenom (DuplicateKeys)
├── src/main/java/si/contactmanager/shared/error/Restore{NoChanges,NotAllowed}Exception + preslikava kod
└── src/test/java/si/contactmanager/audit/…   # unit, IT, matrika izolacije, sočasnost, zmogljivost

frontend/
├── src/features/history/     # ContactHistoryPage, HistoryTimeline, VersionPage, ComparePage, RestoreDialog, DeletedContactsPage, api, types, routing
├── src/features/audit/       # AuditFilters (+ActorSelect), auditRouting/api/types (+actor, RESTORE), AuditEntryItem (stavek RESTORE, neznana vrsta)
├── src/features/contacts/    # ContactView (razdelek Zgodovina), povezava Izbrisani kontakti v seznamu
├── src/features/groups/GroupLayout  # nove poti
├── src/i18n/{sl,en}.json
└── src/**/*.test.tsx

e2e/tests/napredna-revizija.spec.ts (+ support/history.ts)
```

**Structure Decision**: večina novega je v `audit` (zaledje) in v novi mapi `features/history` (vmesnik), da se ne prekriva s Patrikovim delom v `contact` / `features/contacts`. Dotiki 014-območja so samo dodatni: ena metoda v `ContactSnapshots`, nova datoteka `DuplicateLookup`, dve povezavi v vmesniku.

### Ponovna uporaba iz 005

| Kar obstaja | Uporaba v 015 |
|---|---|
| `audit_change.before/after`, `contact_id` brez FK | edini vir zgodovine, različic in izbrisanih kontaktov |
| `ChangeDiff.fields`, `ContactChangeView.Kind` | spremenjena polja v časovnici, primerjavi, predogledu |
| `RollbackService` vzorec: `lockGroupArchived` → ostali pisalci; `AuditRepository.maxVersions`, `existingUsers` | `RestoreService` (isti vrstni red zaklepov, brez zastoja) |
| `ContactSnapshots.load`, `Target`, `insertChildren` | trenutno stanje; vpis kontakta (nova metoda `restore`) |
| `AuditRepository.ENTRY_SELECT`, `entry()` | `AuditEntry` za vnos `RESTORE` (cilj = `target_entry_id`) |
| `AuditFilters`, `ChangeTable`, `RollbackDialog`, `formatTime` | filter po izvajalcu; tabela polj v primerjavi in predogledu; vzorec dialoga obnove; zapis časa |

### Razdelitev dela (vzporedni implement)

1. **Skupno (najprej, majhno)**: `contracts/openapi.yaml`, tipi FE (`features/history/types.ts`) – po pogodbi lahko BE in FE tečeta vzporedno.
2. **BE** (en tok): migracija → filter po izvajalcu → zgodovina/različice/primerjava → seznam izbrisanih → obnova + sočasnost → matrika izolacije, zmogljivost.
3. **FE** (podagent, MSW po pogodbi): filter po izvajalcu → zgodovina in ogled/primerjava → seznam izbrisanih → dialog obnove → prevodi, dostopnost.
4. **E2E** po obeh, nato `converge`.

### Usklajevanje s funkcionalnostjo 014 (Patrik)

- **Migracije**: 014 do zdaj ni na `origin` ali v lokalnih worktreejih; `V11` je prosta v `main` (V1–V10). 015 uporabi `V11__napredna_revizija.sql`. **Pravilo ob združitvi**: dve datoteki z isto številko verzije Flyway zavrne; kdor združi drugi, svojo datoteko preštevilči (`V12__…`), preden jo združi; imen datotek (`napredna_revizija`) ne spreminjamo in ne združujemo v eno. Ponovno preveri `git fetch` tik pred PR in pred združitvijo.
- **`CHECK` na `audit_entry.action`**: 015 ga razširi z `RESTORE`; če 014 doda svojo vrsto (npr. `IMPORT`), mora druga migracija v `CHECK` vključiti **unijo** vseh vrst (zadnja migracija prepiše omejitev), isto za `audit_entry_target`.
- **Vmesnik**: FE obravnava neznano vrsto dejanja kot splošen stavek (FR-015-18); BE novi DTO-ji prenašajo vrsto kot besedilo. Obstoječi `AuditAction` in `AuditRepository.entry()` ostaneta enumska; 014 mora ob novi vrsti razširiti enum (ni naloga 015).
- **Datoteke**: 015 ne ureja `features/contacts/export`, uvoza ali čemurkoli 014; v `contact` samo doda metodo v `ContactSnapshots` in novo datoteko.

## Complexity Tracking

Ni kršitev. Nova vrsta dejanja in migracija sta zapisani kot arhitekturna odločitev (`docs/decisions/2026-11-15-vrsta-dejanja-obnova.md`, §2.6: pomembna odločitev o shemi).
