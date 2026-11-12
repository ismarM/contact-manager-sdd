# Implementation Plan: Izvoz izbranih kontaktov v Excel

**Branch**: `izvoz-excel` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-izvoz-excel/spec.md` (Clarify 2026-11-12: izbor po 009 s preverjanjem FR-009-18, izpust izbrisanih ali združenih med preverjanjem in izvozom, razvrščanje stolpcev in značk po D-63). Vnos pri `/speckit-plan`: »datum naj izbere odjemalec«.

## Summary

Akcijska vrstica izbora (009) dobi gumb *Izvozi v Excel*, ki ga vidijo vsi člani, tudi v arhivirani skupini. Klik najprej sproži obstoječe preverjanje izbora `selection-check` (FR-009-18, `useSelectionCheck`), nato pa nov endpoint `POST /api/groups/{groupId}/contacts/export` z identitetami, razvrstitvijo seznama 008 (`sort`, `dir`) in jezikom vmesnika. Zaledje v eni transakciji samo za branje (`REPEATABLE READ`) razvrsti identitete na naslednji način: tuja identiteta da `404`, izbrisana ali združena se izpusti, če ne ostane noben kontakt, odgovor je `409 EXPORT_EMPTY`. Kontakti se preberejo v vrstnem redu `ContactSearch.orderBy`, stolpci ključev in značke pa se razvrstijo s kolacijo `sort_sl` (D-63). Datoteko `.xlsx` z enim listom zapiše `fastexcel` neposredno v odgovor. Vse celice so besedilo, vodilni `= + - @ \t \r` pa dobijo predpono `'`. Števili `X-Export-Count` in `X-Export-Skipped` sta v glavah. Odjemalec shrani `Blob` z imenom `‹naslov›-kontakti-‹lokalni datum›.xlsx`, ki ga sestavi sam (vnos uporabnika). Migracije ni. Nove knjižnice: `fastexcel`, `fastexcel-reader` (test) in `exceljs` (E2E), vse zapisane v D-89. Odločitve so v [research.md](research.md), podatki v [data-model.md](data-model.md), pogodba v [contracts/openapi.yaml](contracts/openapi.yaml).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`, Jackson `tools.jackson`; vmesnik: `react-i18next`, `sonner`, `@tabler/icons-react`). **Novo (D-89):** `org.dhatim:fastexcel` (zaledje, zapis), `org.dhatim:fastexcel-reader` (zaledje, obseg `test`), `exceljs` (`e2e/`, `devDependency`). Natančne verzije se pripnejo ob dodajanju (R-02).

**Storage**: PostgreSQL 18. Nove migracije ni; bere obstoječe `contact`, `contact_attribute`, `contact_tag` (kolacija `sort_sl`, V8) ter `audit_entry`/`audit_change` (razlikovanje izbrisan/tuj).

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije, zmogljivost; datoteko prebere `fastexcel-reader`) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px; datoteko prenese in prebere `exceljs`)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: SC-002 – strežnik pripravi in pošlje izvoz 10 000 kontaktov v < 10 s (p95, brez omrežja) (`ExportPerformanceIT`: 10 000 kontaktov, 5 atributov in 3 značke na kontakt, 20 različnih ključev, 2 ogrevalna in 10 merjenih izvozov, p95 < 10 s do zadnjega bajta). SC-005 – rezultat je viden < 1 s po odgovoru (FE test brez zakasnitev, E2E).

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, samo branje (brez verzij in vnosov sledi), en list z ≤ 16 384 stolpci (R-09), telo ≤ 2 MB (obstoječi `client_max_body_size`), datoteka se ne shranjuje

**Scale/Scope**: 16 FR (FR-010-01 … FR-010-16), 1 nov endpoint, 0 migracij, 0 novih poti, približno 8 novih BE in 6 novih FE datotek

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti so vsi FR-010-01 … FR-010-16 (tabela pokritosti spodaj). *Public Interfaces* določajo endpoint, poti in dostopna imena. Negativni scenariji spec so v testih. Koda `EXPORT_EMPTY` je že v registru feature-map §2.10. Meja stolpcev (R-09) je po `/speckit-analyze` v FR-010-13 (D-90). |
| II. Test-first | BE: `CellTextTest`, `ExportLabelsTest`, `ExportRequestParserTest`, `ExportIT` (vsebina in vrstni red), `ExportSkippedIT`, `ExportReadOnlyIT`, `ExportValidationIT`, `ExportArchivedIT`, `ExportPerformanceIT`, varnostni `ExportIsolationMatrixSecurityIT`. FE: `exportFileName.test`, `ExportButton.test`. E2E: `izvoz-excel.spec.ts` (prenos in branje nazaj, 360/768/1280 px). Pred kodo teste pregleda agent `pregled-testov`. |
| III. Group isolation and roles | Endpoint je v matriki izolacije: 401 / 404 (nečlan, neobstoječa skupina) / 2xx za VIEWER, EDITOR, ADMIN in OWNER. Ker je VIEWER najnižja vloga, primera 403 ni. Arhivirana in trajno arhivirana skupina vrneta 200 (ne 409). Tuja identiteta v telesu vrne 404 (`requireKnown`, R-04). Vse poizvedbe so omejene z `group_id` iz `Membership`. |
| IV. Accessible, bilingual, responsive UI | Uporabljeni razdelki design.md: 8.8 (akcijska vrstica), 8.13 (toast, napaka na mestu akcije s *Poskusi znova*), 8.15 (brez povezave). Imena sl/en so spodaj. Gumb ima `aria-disabled` in oznako »Pripravljam izvoz…«, napake so `role="status"`/`role="alert"`. Vrstica je pri 320 px prilepljena spodaj (009), axe teče v FE in E2E. Besedila datoteke so dvojezična (`ExportLabels`). |
| V. Data integrity | Izvoz je branje: verzije se ne spremenijo, vnos sledi ne nastane (FR-010-14, `ExportReadOnlyIT`). Posnetek `REPEATABLE READ` prepreči mešano stanje. Množične operacije in paginacija ostanejo nespremenjene. |
| VI. Privacy and GDPR | Datoteka se ne shrani na strežniku in se ne predpomni (`Cache-Control: no-store`, `nosniff`). Vrednosti kontaktov se ne beležijo. Ni novih osebnih podatkov. Prenos je dovoljen samo članom (izolacija). |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh` (`ExportPerformanceIT` v `full`). Nove knjižnice so v D-89 (korak `orodja`). Utišanj ni. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombi: (1) R-09 (`TOO_MANY_COLUMNS`) je po `/speckit-analyze` del FR-010-13, robnih primerov in negativnih scenarijev (D-90). (2) Gumb v akcijski vrstici je bil v 009 predviden (»lastnik 010«), zato design.md 8.8 ostane nespremenjen.

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/contacts/export | VIEWER | allowed | 200; telo `.xlsx`, glavi `X-Export-Count`, `X-Export-Skipped` | FR-010-02 … FR-010-09, FR-010-11 … FR-010-14, FR-010-16 |
| POST | /api/groups/{groupId}/contacts/selection-check (009, nespremenjen) | VIEWER | allowed | 200; `SelectionCheckResult` | FR-010-02 (prek FR-009-18) |

- Podrobnosti so v [contracts/openapi.yaml](contracts/openapi.yaml) in [data-model.md](data-model.md).
- Vrstni red preverjanj (R-04): 401 → 404 (nečlan, neobstoječa skupina ali identiteta, ki nikoli ni bila kontakt te skupine) → 400 `VALIDATION_FAILED` (`body`, `contactIds` `REQUIRED`/`TOO_MANY`/`INVALID_VALUE`, `sort`, `dir`, `language`, neznano polje, `TOO_MANY_COLUMNS`) → 409 `EXPORT_EMPTY`. Koraka 403 in 409 `GROUP_ARCHIVED` ni.
- Ključ razvrščanja `attr:‹ključ›`, ki ga v skupini nima noben kontakt, ni napaka: vrstice se razvrstijo po priimku in imenu (spec Edge Cases, R-04).
- Endpoint nikoli ne vrne `409 SELECTION_CHANGED`. Izbrisani ali združeni kontakti se izpustijo (R-05).
- Nespremenjeni so `GET …/contacts`, `GET …/contact-ids`, `bulk-update` in `bulk-delete` (008, 009).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Kontakti skupine (seznam z izborom in akcijsko vrstico) | /groups/:groupId/contacts?‹poizvedba 008› | VIEWER | FR-010-01, FR-010-02, FR-010-07, FR-010-15 |

- Nove poti ni. Razvrstitev za izvoz je trenutna `sort`/`dir` iz naslova strani (008).

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

To je dodatek k elementom 009 (`toolbar` »Dejanja izbora«, obvestilo FR-009-18); njihova imena ostanejo enaka.

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Akcijska vrstica | button | »Izvozi v Excel« / "Export to Excel" | sproži preverjanje izbora in izvoz; vsi člani, tudi v arhivirani skupini; brez izbora vrstice (in gumba) ni | FR-010-01, FR-010-02 |
| Akcijska vrstica | button | »Pripravljam izvoz…« / "Preparing export…"; `aria-disabled="true"` | isti gumb med preverjanjem in pripravo (vidna oznaka); ponoven klik ne sproži drugega izvoza | FR-010-15 |
| Seznam | status (vizualno skrit, `sr-only`) | »Pripravljam izvoz…« / "Preparing export…"; po koncu prazen | **edino** sporočilo bralniku zaslona ob začetku (ime gumba ni živo območje, zato se ne prebere dvakrat; R-10) | FR-010-15 |
| Seznam | status (toast) | »Izvoženih kontaktov: 3.« / "Contacts exported: 3." | uspeh (8.13) | FR-010-15 |
| Seznam | status (toast) | »Izvoženih kontaktov: 2. 1 izbrani kontakt je bil medtem izbrisan in ni v datoteki.« / "Contacts exported: 2. 1 selected contact was deleted in the meantime and is not in the file." | uspeh z izpuščenimi | FR-010-11, FR-010-15 |
| Seznam | alert | »Nobeden od izbranih kontaktov ne obstaja več.« / "None of the selected contacts exists anymore." | `409 EXPORT_EMPTY` | FR-010-11 |
| Seznam | alert | »Naenkrat lahko izvoziš največ 10 000 kontaktov. Zoži iskanje s filtri.« / "You can export at most 10,000 contacts at once. Narrow the search with filters." | `400` `contactIds` `TOO_MANY` | FR-010-13 |
| Seznam | alert | »Izbrani kontakti imajo preveč različnih dodatnih atributov za en list. Izvozi manjši izbor.« / "The selected contacts have too many different custom attributes for one sheet. Export a smaller selection." | `400` `contactIds` `TOO_MANY_COLUMNS` (R-09) | FR-010-13 |
| Seznam | alert | »Izvoz ni uspel. Poskusi znova.« / "The export failed. Try again." | `5xx`, druga `400`, `404` | FR-010-15 |
| Seznam | alert | »Ni povezave. Preveri povezavo in poskusi znova.« / "You're offline. Check your connection and try again." (obstoječi ključ `groups.offline`, dobesedno po spec Edge Cases) | brez povezave (8.15); gumb ostane viden | FR-010-15 |
| Napaka izvoza | button | »Poskusi znova« / "Try again" | ponovi preverjanje in izvoz; izbor ostane | FR-010-15 |
| Obvestilo spremembe (009) | alert + button | »Izbor se je spremenil: …« · »Posodobi izbor« / "Update selection" · »Nadaljuj z obstoječim izborom« / "Continue with current selection" | FR-009-18 pred izvozom (komponenta `SelectionChangedNotice`) | FR-010-02 |

- Sklanjatve stavka o izpuščenih (sl `one`/`two`/`few`/`other`, en `one`/`other`): »1 izbrani kontakt je bil medtem izbrisan in ni v datoteki.«, »2 izbrana kontakta sta bila medtem izbrisana in ju ni v datoteki.«, »3 izbrani kontakti so bili medtem izbrisani in jih ni v datoteki.«, »5 izbranih kontaktov je bilo medtem izbrisanih in jih ni v datoteki.« / "1 selected contact was deleted in the meantime and is not in the file.", "N selected contacts were deleted in the meantime and are not in the file."
- »Izvoženih kontaktov: N.« je oblika z dvopičjem in se ne sklanja (spec, US1-16).
- Testi uporabljajo `within(toolbar »Dejanja izbora«)` za gumb.
- Besedila v datoteki (ime lista, glava) niso dostopna imena in niso v `i18n/*.json`. Določa jih `ExportLabels` na strežniku (R-08): »Kontakti«/"Contacts", »Ime«, »Priimek«, »Naslov«, »E-naslov«, »Telefon«, »Značke« / "First name", "Last name", "Address", "Email", "Phone", "Tags".
- Ime datoteke (R-03): `‹fileNameTitle(naslov)›-kontakti-‹YYYY-MM-DD›.xlsx` (sl) / `…-contacts-….xlsx` (en). Datum je lokalni datum brskalnika.

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni / unit | FE funkcionalni / unit | E2E |
|---|---|---|---|
| FR-010-01 | – | `ExportButton.test` | `izvoz-excel.spec` |
| FR-010-02 | `ExportIT`, `ExportIsolationMatrixSecurityIT` | `ExportButton.test` (preverjanje FR-009-18, *Posodobi* / *Nadaljuj*) | `izvoz-excel.spec` |
| FR-010-03 | `ExportIT` | – | `izvoz-excel.spec` |
| FR-010-04 | `ExportLabelsTest`, `ExportIT` | `ExportButton.test` (`language` v zahtevku) | `izvoz-excel.spec` |
| FR-010-05 | `ExportIT` | – | `izvoz-excel.spec` |
| FR-010-06 | `ExportIT` | – | `izvoz-excel.spec` |
| FR-010-07 | `ExportIT` | `ExportButton.test` (`sort`/`dir` iz naslova) | `izvoz-excel.spec` |
| FR-010-08 | `CellTextTest`, `ExportIT` | – | `izvoz-excel.spec` |
| FR-010-09 | `CellTextTest`, `ExportIT` | – | `izvoz-excel.spec` |
| FR-010-10 | – | `exportFileName.test`, `ExportButton.test` | `izvoz-excel.spec` |
| FR-010-11 | `ExportSkippedIT` | `ExportButton.test` | – |
| FR-010-12 | `ExportIsolationMatrixSecurityIT` | – | – |
| FR-010-13 | `ExportRequestParserTest`, `ExportValidationIT` | `ExportButton.test` | – |
| FR-010-14 | `ExportReadOnlyIT` | `ExportButton.test` (izbor ostane) | `izvoz-excel.spec` |
| FR-010-15 | – | `ExportButton.test` (oznaka, `aria-disabled`, toast, alert, *Poskusi znova*, brez povezave) | `izvoz-excel.spec` |
| FR-010-16 | `ExportArchivedIT`, `ExportIsolationMatrixSecurityIT` | `ExportButton.test` (arhivirana) | `izvoz-excel.spec` |

Merljiva merila: SC-001 – `izvoz-excel.spec` (en klik po izboru do prenosa); SC-002 – `ExportPerformanceIT`; SC-003 – `ExportIT` in `izvoz-excel.spec` (branje nazaj, primerjava po celicah); SC-004 – `CellTextTest` in `ExportIT` (nobena celica nima formule, vsi vodilni znaki); SC-005 – `ExportButton.test`; SC-006 – `ExportIsolationMatrixSecurityIT`.

## Project Structure

### Documentation (this feature)

```text
specs/010-izvoz-excel/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/pom.xml                                   # + fastexcel, fastexcel-reader (test) – D-89
backend/src/main/java/si/contactmanager/contact/
├── ExportController.java          # POST /contacts/export; 401 → 404 (requireKnown) → 400 → 409; glave odgovora
├── ExportService.java             # transakcija readOnly + REPEATABLE READ; razvrstitev identitet (R-05); sestava lista
├── ExportRequestParser.java       # telo → ExportRequest (sort/dir prek ContactQueryParser); nikoli ne vrže
├── ExportRequest.java · ExportRow.java   # nepremenljivi modeli
├── ExportRepository.java          # vrstice (ContactSearch.orderBy), atributi, značke (sort_sl), ključi stolpcev
├── ExportWriter.java              # fastexcel: en list, glava, vrstice, slog "@" in wrapText
├── CellText.java                  # čista funkcija: prazno → brez celice, zaščita pred formulami (R-07)
├── ExportLabels.java              # sl/en: ime lista in glave (R-08)
└── BulkService.java               # nespremenjen; requireKnown ponovno uporabljen
backend/src/main/java/si/contactmanager/shared/error/
├── ExportEmptyException.java      # 409 EXPORT_EMPTY
└── ApiExceptionHandler.java       # + rokovalnik
backend/src/test/java/si/contactmanager/contact/
├── CellTextTest.java · ExportLabelsTest.java · ExportRequestParserTest.java
├── ExportIT.java · ExportSkippedIT.java · ExportReadOnlyIT.java · ExportValidationIT.java
├── ExportArchivedIT.java · ExportPerformanceIT.java · ExportIsolationMatrixSecurityIT.java
└── support/XlsxReader.java        # fastexcel-reader → List<List<String>>, ime lista, preverjanje »brez formul«

frontend/src/
├── shared/api/client.ts                   # + apiFetchBlob (napake kot apiFetch)
├── shared/download.ts                     # downloadBlob, localDateStamp (premaknjeno iz account/downloadJson.ts)
├── features/account/downloadJson.ts       # uporabi shared/download.ts (vedenje nespremenjeno)
├── features/contacts/export/
│   ├── ExportButton.tsx                   # gumb, useSelectionCheck(run = exportContacts), toast, alert, Poskusi znova
│   ├── exportFileName.ts                  # fileNameTitle, exportFileName (R-03)
│   ├── api.ts                             # exportContacts(groupId, ids, sort, dir, language) → { blob, count, skipped }
│   └── ExportButton.test.tsx · exportFileName.test.ts
├── features/contacts/selection/SelectionActionBar.tsx   # + <ExportButton> (vsi člani)
├── i18n/{sl,en}.json                      # contacts.export.*
└── test/msw.ts                            # privzeti rokovalnik export

e2e/package.json                           # + exceljs (devDependency) – D-89
e2e/tests/izvoz-excel.spec.ts · e2e/tests/support/xlsx.ts (branje z exceljs)
```

**Structure Decision**: uporabi se obstoječa struktura iz 000–009. Zaledje je v paketu `contact`, ker potrebuje `ContactSearch.orderBy`, `ContactQueryParser` in paketno-zasebna `BulkService.requireKnown` ter `ContactRepository`. Vmesnik je v podmapi `features/contacts/export/` ob `selection/`, katere `useSelectionCheck` in `SelectionChangedNotice` ponovno uporabi.

## Complexity Tracking

Kršitev konstitucije ni. Namerne odločitve: (1) `POST` za samo branje, ker telo vsebuje do 10 000 identitet (enako kot `selection-check`, 009 R-01). (2) Tri nove knjižnice z vnosom D-89 (VII): zapis `.xlsx` brez knjižnice ni smiseln, E2E pa mora datoteko prebrati z neodvisno implementacijo. (3) `400 TOO_MANY_COLUMNS` (R-09) – omejitev zapisa `.xlsx`, potrjena v FR-010-13 (D-90).
