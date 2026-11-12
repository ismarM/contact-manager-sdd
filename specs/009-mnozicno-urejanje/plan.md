# Implementation Plan: Izbor in množično urejanje kontaktov

**Branch**: `mnozicno-urejanje` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-mnozicno-urejanje/spec.md` (Clarify 2026-11-12: meja 10 000, posnetek »vsi zadetki« + FR-009-18, mešano stanje »Izberi vse na strani«)

## Summary

Seznam kontaktov (004/008) dobi stolpec izbire, »Izberi vse na strani« (z mešanim stanjem) in akcijsko vrstico izbora; izbor živi v `SelectionProvider` v `GroupLayout` (ena skupina, trenutni zavihek, ≤ 10 000 kontaktov). Zaledje doda štiri endpointe: `GET …/contact-ids` (identitete zadetkov iskanja in filtrov 008 za »Izberi vse zadetke«), `POST …/contacts/selection-check` (preverjanje sprememb izbora pred končno akcijo, FR-009-18), `POST …/contacts/bulk-update` in `POST …/contacts/bulk-delete`. Množična operacija v eni transakciji zaklene skupino (`FOR SHARE`) in izbrane kontakte (`FOR UPDATE` po `id`), izračuna končna stanja s čisto funkcijo `BulkEdit`, jih validira po kontaktih, zapiše paketno in ustvari en vnos revizijske sledi (005 `AuditLog`). Identiteta, ki ni nikoli bila kontakt skupine, da `404`; izbrisana (vidna v sledi skupine) `409 SELECTION_CHANGED`. Migracije ni; `nginx.conf` dobi `client_max_body_size 2m`. Odločitve: [research.md](research.md), podatki: [data-model.md](data-model.md), pogodba: [contracts/openapi.yaml](contracts/openapi.yaml), D-72.

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`/`NamedParameterJdbcTemplate`, Flyway, Jackson `tools.jackson`; vmesnik: `react-router`, `react-i18next`, `@tabler/icons-react`, `sonner`, `shared/ui/dialog`) – **brez novih knjižnic**; parameter gonilnika `reWriteBatchedInserts=true` (R-07)

**Storage**: PostgreSQL 18; **brez nove migracije** (obstoječi `contact*`, `audit_entry`, `audit_change` z indeksom `audit_change_contact`)

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije, zmogljivost) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: SC-002 – množična operacija nad 10 000 kontakti < 15 s v 95 % (`BulkPerformanceIT`: 2 ogrevalni + 20 merjenih, p95 po najbližjem rangu, R-07); SC-001 – 300 kontaktov z enim filtrom v < 30 s od začetka do obvestila (E2E)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, atomarnost (vse ali nič), en vnos sledi na operacijo, sočasne operacije zaporedno (zaklep po `id`), telo ≤ 2 MB, izbor ni na strežniku in ni v naslovu

**Scale/Scope**: 18 FR (FR-009-01 … FR-009-18), 4 novi endpointi, 0 migracij, 0 novih poti, približno 12 novih BE in 10 novih FE datotek

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-009-01 … FR-009-18 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena; negativni scenariji spec so v testih; koda `SELECTION_CHANGED` je v registru feature-map §2.10. |
| II. Test-first | BE: `BulkEditTest`, `BulkInputParserTest`, `ContactIdsIT`, `SelectionCheckIT`, `BulkUpdateIT`, `BulkUpdateValidationIT`, `BulkRequestValidationIT`, `BulkDeleteIT`, `BulkSelectionChangedIT`, `BulkAuditIT`, `BulkConcurrencyIT`, `BulkArchivedIT`, `BulkLogIT`, `BulkPerformanceIT`, varnostni `BulkIsolationMatrixSecurityIT`. FE: `ContactSelection.test`, `SelectionActionBar.test`, `BulkEditDialog.test`, `BulkDeleteDialog.test`, `SelectionCheck.test`, `selection.test`. E2E `mnozicno-urejanje.spec.ts` pri 360/768/1280 px. Pregled testov pred kodo: agent `pregled-testov`. |
| III. Group isolation and roles | Vsi štirje endpointi v matriki izolacije (401 / 404 / 403 / 2xx; arhivirana: branje 200, pisanje 409 `GROUP_ARCHIVED`, VIEWER arhivirane 403); identitete iz telesa vedno z `group_id` iz `Membership`; tuja identiteta = 404 (R-02). Vmesnik ne izriše *Uredi izbrane* in *Izbriši* za bralca in v arhivirani skupini. |
| IV. Accessible, bilingual, responsive UI | design.md 8.6 (stolpec izbire), 8.8 (akcijska vrstica, dialog), 8.10, 8.11, 8.13; imena sl/en spodaj; `aria-live` za »Izbranih: N«, nativno `indeterminate` (`mixed`), fokus na *Prekliči*, vrnitev fokusa; 320 px (vrstica prilepljena spodaj); axe v FE in E2E. Odstopanje od 8.8 (orodna vrstica ostane, bralec vidi *Izberi vse zadetke*) – D-72. |
| V. Data integrity | Atomarne operacije (ena transakcija), zaklep v vrstnem redu `id`, verzija + 1 za vsak spremenjen kontakt (posamezno shranjevanje s staro verzijo → `409 VERSION_CONFLICT`), en vnos sledi s stanjem prej/potem; seznami ostanejo paginirani. |
| VI. Privacy and GDPR | Vrednosti in značke iz telesa se ne beležijo (R-15); izbor je samo v pomnilniku zavihka. Brez novih osebnih podatkov. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh` (`BulkPerformanceIT` v `full`). Brez novih orodij. Odločitev D-72. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) odstopanje od design.md 8.8 je posledica spec 009 (FR-009-02, FR-009-05) in je zapisano v D-72 s predlogom novega besedila 8.8 – za pregled v PR (design.md spreminjata razvijalca); (2) **010 ni usklajena** z 009 (FR-010-02 in scenarij US1-2: »vsi zadetki« se ovrednotijo ob izvozu; FR-010-01 arhivirana: samo *Izvozi* in *Počisti*) – uskladitev v `/speckit-clarify` 010, 009 je ne spreminja (R-14).

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/contact-ids?q=&f=&tag= | VIEWER | allowed | 200; telo `ContactIds` | FR-009-03, FR-009-04 |
| POST | /api/groups/{groupId}/contacts/selection-check | VIEWER | allowed | 200; telo `SelectionCheckResult` | FR-009-18 |
| POST | /api/groups/{groupId}/contacts/bulk-update | EDITOR | rejected (409 GROUP_ARCHIVED) | 200; telo `{changed}` | FR-009-06 … FR-009-12, FR-009-14 … FR-009-17 |
| POST | /api/groups/{groupId}/contacts/bulk-delete | EDITOR | rejected (409 GROUP_ARCHIVED) | 200; telo `{deleted}` | FR-009-04, FR-009-09 … FR-009-11, FR-009-13 … FR-009-15 |

- Podrobno: [contracts/openapi.yaml](contracts/openapi.yaml), [data-model.md](data-model.md).
- Vrstni red (R-02): 401 → 404 (nečlan, neobstoječa skupina, tuja identiteta) → 403 (samo pisanje) → 409 `GROUP_ARCHIVED` (samo pisanje) → 400 `VALIDATION_FAILED` (zahtevek, nato `contacts` po kontaktih) → 409 `SELECTION_CHANGED` (`missing`). VIEWER arhivirane skupine pri pisanju: 403.
- `contact-ids`: `total > 10 000` → `ids: []`, `truncated: true`. Parametri in napake kot 008.
- Nespremenjeni: `GET/POST/PUT/DELETE …/contacts[/{id}]` (004, 008), revizijska sled (005).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Kontakti skupine (seznam z izborom in akcijsko vrstico) | /groups/:groupId/contacts?‹poizvedba 008› | VIEWER | FR-009-01 … FR-009-18 |
| Kontakt – pogled (panel ≥ 1280 px ali stran); izbor se ohrani ob vrnitvi | /groups/:groupId/contacts/:contactId?‹poizvedba 008› | VIEWER | FR-009-02 |

- Nobena nova pot. Izbor **ni** v naslovu (FR-009-02); preživi menjavo strani, poizvedbe in odprtje kontakta iste skupine, ne pa osvežitve, odjave ali prehoda v drugo skupino.

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Dodatek k elementom seznama 004/008; njihova imena se ne spremenijo.

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Seznam | columnheader > checkbox | »Izberi vse na strani« / "Select all on page"; `checked` / `mixed` (delno) / `unchecked` | izbere ali odznači vse na trenutni strani; pri `mixed` izbere vse | FR-009-01 |
| Seznam (namesto akcijske vrstice, ko ni izbora) | link | »Nov kontakt« / "New contact" (004, nespremenjeno) | ob izboru ga zamenja akcijska vrstica, po *Počisti izbor* se vrne (D-72) | FR-009-02 |
| Seznam (vrstica ali kartica) | checkbox | »Izberi ‹prikazno ime›« / "Select ‹display name›" (npr. »Izberi Janez Novak«) | izbor posameznega kontakta; izbrana vrstica `accent-soft` in obkljukano polje | FR-009-01 |
| Seznam | toolbar | »Dejanja izbora« / "Selection actions" | akcijska vrstica (namesto vrstice z *Nov kontakt*; < 640 px prilepljena spodaj); izgine, ko izbora ni | FR-009-05 |
| Akcijska vrstica | status | »Izbranih: 5« / "5 selected" (sl: »Izbran: 1«, »Izbrana: 2«, »Izbrani: 3«, »Izbranih: 5«) | število izbranih (`aria-live="polite"`) | FR-009-01, FR-009-02, FR-009-05 |
| Akcijska vrstica | button | »Izberi vse zadetke (312)« / "Select all results (312)" | doda vse zadetke trenutnega iskanja in filtrov | FR-009-03 |
| Akcijska vrstica | button | »Uredi izbrane« / "Edit selected" | odpre dialog (samo EDITOR+ v nearhivirani) | FR-009-05, FR-009-06 |
| Akcijska vrstica | button | »Izvozi v Excel« / "Export to Excel" | lastnik 010; izriše se šele, ko obstaja izvoz 010 | FR-009-05 |
| Akcijska vrstica | button | »Izbriši« / "Delete" | odpre potrditev (samo EDITOR+ v nearhivirani) | FR-009-05, FR-009-13 |
| Akcijska vrstica | button | »Počisti izbor« / "Clear selection" | izprazni izbor; fokus na »Izberi vse na strani« (ali naslov seznama) | FR-009-02 |
| Seznam | alert | »Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.« / "You can select at most 10,000 contacts. Narrow the search with filters." | preseženo meja; izbor nespremenjen | FR-009-04 |
| Seznam | alert | »Zadetkov ni bilo mogoče naložiti. Poskusi znova.« / "The results could not be loaded. Try again." | `GET …/contact-ids` ni uspel; izbor nespremenjen (ključ `contacts.selection.loadFailed`) | FR-009-03, FR-009-17 |
| Dialog urejanja | dialog | »Uredi izbrane kontakte (12)« / "Edit selected contacts (12)" | naslov `h2` | FR-009-06 |
| Dialog urejanja | combobox | »Dodaj značke« / "Add tags" | vnos značk (TagInput 004) | FR-009-06, FR-009-08 |
| Dialog urejanja | combobox | »Odstrani značke« / "Remove tags" | vnos značk | FR-009-06, FR-009-08 |
| Dialog urejanja | group | »Nastavi atribut« / "Set attribute" | vrstice atributov | FR-009-07 |
| Dialog urejanja | combobox (nativni select) | »Atribut 1« / "Attribute 1" – možnosti »Naslov« / "Address", »E-naslov« / "Email", »Telefon« / "Phone", »Dodatni atribut« / "Custom attribute" (brez *Ime*, *Priimek*) | izbira polja n-te vrstice | FR-009-07 |
| Dialog urejanja | textbox | »Ključ 1« / "Key 1" | samo pri *Dodatni atribut* | FR-009-07 |
| Dialog urejanja | textbox | »Vrednost 1« / "Value 1"; opis »Prazna vrednost atribut odstrani.« / "An empty value removes the attribute." | vrednost | FR-009-07 |
| Dialog urejanja | button | »Odstrani atribut 1« / "Remove attribute 1"; »Dodaj atribut« / "Add attribute" (do 10) | vrstice | FR-009-06, FR-009-07 |
| Dialog urejanja | button | »Uporabi za 12 kontaktov« / "Apply to 12 contacts" (sklanjatve); med pošiljanjem `aria-disabled` in »Uporabljam…« / "Applying…" | pošlje preverjanje (FR-009-18) in operacijo | FR-009-06, FR-009-17 |
| Dialog urejanja | button | »Prekliči« / "Cancel" | zapre brez sprememb | FR-009-06 |
| Dialog urejanja | alert | napaka nad obrazcem: npr. »Sprememb ni bilo mogoče uporabiti. Pri 1 kontaktu bi bilo preveč značk: Mojca Kralj.« / "The changes could not be applied. 1 contact would have too many tags: Mojca Kralj." (do 10 imen, nato »… in še N« / "… and N more"); napake polj ob poljih | FR-009-09, FR-009-17 |
| Dialog urejanja | alert | napaka nad obrazcem pri preveč dodatnih atributih: »Sprememb ni bilo mogoče uporabiti. Pri 1 kontaktu bi bilo preveč dodatnih atributov: Mojca Kralj.« (sklanjatve kot pri značkah) / "… 1 contact would have too many custom attributes: Mojca Kralj." | FR-009-09, FR-009-17 |
| Dialog urejanja ali izbrisa | alert | ednina obvestila preverjanja: »Izbor se je spremenil: 1 nov zadetek.« (množinske oblike zadetkov: 1 nov zadetek, 2 nova zadetka, 3 novi zadetki, 5 novih zadetkov) / "The selection has changed: 1 new result." | FR-009-18 |
| Dialog urejanja ali izbrisa | alert | »Izbor se je spremenil: 2 nova zadetka, 1 kontakt ne ustreza več filtrom, 1 kontakt ne obstaja več.« / "The selection has changed: 2 new results, 1 contact no longer matches the filters, 1 contact no longer exists." | obvestilo preverjanja (warning) | FR-009-18, FR-009-10 |
| Obvestilo spremembe | checkbox | »Odstrani tudi kontakte, ki ne ustrezajo več filtrom« / "Also remove contacts that no longer match the filters" (privzeto obkljukano; samo pri `noLongerMatching > 0`) | izbira posodobitve | FR-009-18 |
| Obvestilo spremembe | button | »Posodobi izbor« / "Update selection"; »Nadaljuj z obstoječim izborom« / "Continue with current selection" | razrešitev | FR-009-18 |
| Obvestilo `409 SELECTION_CHANGED` | alert + button | »2 izbrana kontakta ne obstajata več.« (množinske oblike: 1 izbrani kontakt ne obstaja več, 2 izbrana kontakta ne obstajata več, 3 izbrani kontakti ne obstajajo več, 5 izbranih kontaktov ne obstaja več; ključi `missingAlert_*`) / "2 selected contacts no longer exist." + »Odstrani jih iz izbora« / "Remove them from the selection" | po odstranitvi lahko ponovi operacijo | FR-009-10 |
| Potrditev izbrisa | alertdialog | »Izbrišem 3 kontakte?« / "Delete 3 contacts?"; besedilo »Kontakti bodo odstranjeni iz skupine ‹skupina›. Izbris bo zabeležen v revizijski sledi.« | design.md 8.11; fokus na *Prekliči* | FR-009-13 |
| Potrditev izbrisa | button | »Prekliči« / "Cancel"; »Izbriši 3 kontakte« / "Delete 3 contacts" (nevaren) | Esc/Prekliči: fokus nazaj na *Izbriši* | FR-009-13 |
| Seznam | status (toast) | »Posodobljenih 10 kontaktov.« / "10 contacts updated."; »Nobenega kontakta ni bilo treba spremeniti.« / "No contacts needed changes."; »Izbrisani 3 kontakti.« / "3 contacts deleted." (vse sklanjatve) | obvestilo uspeha (8.13) | FR-009-12, FR-009-13 |

- Sklanjatve (sl `one`/`two`/`few`/`other`, en `one`/`other`, R-12): »Izbrišem 1 kontakt?«, »Izbrišem 2 kontakta?«, »Izbrišem 3 kontakte?«, »Izbrišem 5 kontaktov?«; enako za »Izbriši N …«, »Uporabi za N …«, »Posodobljen 1 kontakt.«, »Posodobljena 2 kontakta.«, »Posodobljeni 3 kontakti.«, »Posodobljenih 5 kontaktov.«, »Izbrisan 1 kontakt.«, »Izbrisana 2 kontakta.«, »Izbrisani 3 kontakti.«, »Izbrisanih 5 kontaktov.«.
- Napake brez kod (FR-009-17): `403` »Za to dejanje nimaš več pravic.«, `409 GROUP_ARCHIVED` »Skupina je arhivirana. Spreminjanje ni mogoče.« (vmesnik pokaže pasico 003 in skrije akcije pisanja), brez povezave »Strežnik ni dosegljiv. Poskusi znova.« + *Poskusi znova*.
- Testi uporabljajo `within(toolbar »Dejanja izbora«)` za gumbe akcijske vrstice in `within(dialog …)` za dialoge (*Prekliči* je na več mestih).

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni / unit | FE funkcionalni | E2E |
|---|---|---|---|
| FR-009-01 | – | `ContactSelection.test`, `selection.test` | `mnozicno-urejanje.spec` |
| FR-009-02 | – | `ContactSelection.test`, `selection.test` | `mnozicno-urejanje.spec` |
| FR-009-03 | `ContactIdsIT`, `BulkIsolationMatrixSecurityIT` | `SelectionActionBar.test` | `mnozicno-urejanje.spec` |
| FR-009-04 | `ContactIdsIT`, `BulkInputParserTest`, `BulkUpdateValidationIT` | `selection.test`, `SelectionActionBar.test` | – |
| FR-009-05 | – | `SelectionActionBar.test` | `mnozicno-urejanje.spec` |
| FR-009-06 | `BulkUpdateIT` | `BulkEditDialog.test` | `mnozicno-urejanje.spec` |
| FR-009-07 | `BulkEditTest`, `BulkUpdateIT`, `BulkInputParserTest` | `BulkEditDialog.test` | – |
| FR-009-08 | `BulkEditTest`, `BulkUpdateIT`, `BulkInputParserTest` | `BulkEditDialog.test` | – |
| FR-009-09 | `BulkUpdateValidationIT`, `BulkEditTest` | `BulkEditDialog.test` | `mnozicno-urejanje.spec` |
| FR-009-10 | `BulkSelectionChangedIT` | `SelectionCheck.test` | – |
| FR-009-11 | `BulkIsolationMatrixSecurityIT`, `BulkSelectionChangedIT` | – | – |
| FR-009-12 | `BulkUpdateIT` | `BulkEditDialog.test` | `mnozicno-urejanje.spec` |
| FR-009-13 | `BulkDeleteIT` | `BulkDeleteDialog.test` | `mnozicno-urejanje.spec` |
| FR-009-14 | `BulkAuditIT` | – | `mnozicno-urejanje.spec` |
| FR-009-15 | `BulkArchivedIT`, `BulkIsolationMatrixSecurityIT` | `SelectionActionBar.test` | – |
| FR-009-16 | `BulkConcurrencyIT` | – | – |
| FR-009-17 | – | `BulkEditDialog.test`, `BulkDeleteDialog.test` | – |
| FR-009-18 | `SelectionCheckIT`, `BulkIsolationMatrixSecurityIT` | `SelectionCheck.test` | `mnozicno-urejanje.spec` |

Merljiva merila: SC-001 – `mnozicno-urejanje.spec` (300 kontaktov, en filter, < 30 s); SC-002 – `BulkPerformanceIT` (10 000, p95 < 15 s); SC-003 – `BulkUpdateValidationIT`, `BulkSelectionChangedIT`, `BulkArchivedIT`, `BulkIsolationMatrixSecurityIT` (po vsaki zavrnitvi: nespremenjene verzije in število vnosov sledi); SC-004 – `BulkAuditIT`; SC-005 – `mnozicno-urejanje.spec` (tipkovnica, 320/360 px, axe) in axe v FE testih.

## Project Structure

### Documentation (this feature)

```text
specs/009-mnozicno-urejanje/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/java/si/contactmanager/contact/
├── BulkController.java             # contact-ids, selection-check, bulk-update, bulk-delete
├── BulkService.java                # transakcija, zaklepanje, razvrstitev identitet (R-02, R-03), sled
├── BulkInputParser.java            # telesa zahtevkov (R-05); nikoli ne vrže
├── BulkEdit.java                   # čista funkcija ContactState → ContactState (R-04)
├── BulkEditInput.java · BulkTarget.java · SelectionCheck.java   # nepremenljivi modeli
├── ContactRepository.java          # ids(group, query), lockContacts, knownToGroup (sled), deleteAll
├── ContactSnapshots.java           # replaceContent (paketni zapis, R-07)
└── ContactSearch.java              # nespremenjen; ids uporabi where
backend/src/main/java/si/contactmanager/shared/error/
├── BulkValidationError.java · BulkValidationException.java
├── SelectionChangedException.java
└── ApiExceptionHandler.java        # + rokovalnika
backend/src/main/resources/application.yaml   # reWriteBatchedInserts=true
backend/src/test/java/si/contactmanager/contact/
├── BulkEditTest.java · BulkInputParserTest.java
├── ContactIdsIT.java · SelectionCheckIT.java · BulkUpdateIT.java · BulkUpdateValidationIT.java
├── BulkDeleteIT.java · BulkSelectionChangedIT.java · BulkAuditIT.java · BulkConcurrencyIT.java
├── BulkArchivedIT.java · BulkPerformanceIT.java · BulkIsolationMatrixSecurityIT.java
└── support/BulkApiTest.java        # pomočniki (zahtevki, preverjanje »nič se ni spremenilo«)

frontend/nginx.conf                 # client_max_body_size 2m (R-08)
frontend/src/
├── features/contacts/selection/
│   ├── selection.ts                # čiste operacije izbora (meja, unija, applyCheck)
│   ├── SelectionProvider.tsx       # kontekst v GroupLayout
│   ├── SelectionActionBar.tsx      # toolbar »Dejanja izbora«
│   ├── SelectAllOnPage.tsx · SelectContact.tsx
│   ├── BulkEditDialog.tsx · BulkDeleteDialog.tsx
│   ├── SelectionChangedNotice.tsx  # obvestilo FR-009-18 / 409
│   ├── useSelectionCheck.ts        # preverjanje pred akcijo
│   ├── api.ts                      # contactIds, selectionCheck, bulkUpdate, bulkDelete
│   └── {ContactSelection, SelectionActionBar, BulkEditDialog, BulkDeleteDialog, SelectionCheck}.test.tsx · selection.test.ts
├── features/contacts/ContactList.tsx   # stolpec izbire, akcijska vrstica namesto vrstice *Nov kontakt*
├── features/groups/GroupLayout.tsx     # SelectionProvider (ključ groupId)
├── i18n/{sl,en}.json                   # contacts.selection.*, contacts.bulk.*
└── test/msw.ts                         # privzeti rokovalniki novih endpointov

e2e/tests/mnozicno-urejanje.spec.ts · e2e/tests/support/contacts.ts (množično vstavljanje že obstaja – 008)
```

**Structure Decision**: obstoječa struktura iz 000–008; zaledje v paketu `contact` (dostop do `ContactSnapshots`, `ContactSearch` in paketno-zasebnih repozitorijev), vmesnik v podmapi `features/contacts/selection/`, ker izbor uporabi tudi 010.

## Complexity Tracking

Ni kršitev konstitucije. Namerna odstopanja: design.md 8.8 (D-72, posledica FR-009-02 in FR-009-05; predlog besedila za razvijalca); POST za samo branje `selection-check` (telo do 10 000 identitet, R-01).
