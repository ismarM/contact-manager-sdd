# Implementation Plan: Iskanje in združevanje podvojenih kontaktov

**Branch**: `dvojniki` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-dvojniki/spec.md` (Clarify 2026-11-12, D-89: največ 10 kontaktov v primerjavi in združitvi, FR-011-21)

## Summary

V skupini (zavihek *Dvojniki*, samo EDITOR+ v nearhivirani skupini) urednik izbere eno kategorijo (ime in priimek, e-naslov, telefon) in dobi paginiran seznam skupin podvojenih kontaktov. Zaledje skupine izračuna ob vsakem iskanju v pomnilniku: prebere vse kontakte skupine (`id`, ime, priimek, e-naslov, telefon, `created_at`), jim s čisto funkcijo `DuplicateKeys` določi normaliziran ključ izbrane kategorije (pravila **samo** iz FR-011-03 … 06), zbere skupine z ≥ 2 kontakta in jih razvrsti po razlogu. *Primerjaj in združi* odpre stran primerjave z največ 10 kontakti (prvih 10 po `created_at`, `id`), ki jo naloži `GET …/duplicates/compare` s trenutnimi podatki in verzijami; tabela razlik je zaporedje `fieldset`-ov (po polje), predogled se izračuna v vmesniku (`mergeModel.ts`). Združitev `POST …/duplicates/merge` v **eni transakciji** zaklene skupino (`FOR SHARE`) in vključene kontakte (`FOR UPDATE` po `id`), preveri verzije (409 `VERSION_CONFLICT`, tudi za izbrisane), preveri rezultat po slovarju podatkov (`ContactInputParser`), posodobi najstarejši kontakt (verzija + 1), izbriše ostale in zapiše **en** vnos `MERGE` v revizijsko sled (005 `AuditLog`: ohranjeni `before/after`, ostali `before/∅`). Ohranjeni kontakt ni izbirna: po spec (FR-011-11, Assumptions) je vedno najstarejši (po `created_at`, `id`), uporabnik lahko druge samo izloči. Razveljavitev je **rollback skupine iz 005** (ADMIN+), ki vrne stanje **celotne skupine** v izbrani točki, zato prekrije tudi poznejše spremembe (ostanejo v sledi in so obnovljive): vnos `MERGE` vsebuje celotna stanja prej, zato `RollbackService` brez sprememb obnovi izbrisane kontakte z istimi `id`; 011 doda samo teste te verige in povezavo na revizijsko sled. **Migracije ni.** Odločitve: [research.md](research.md), podatki: [data-model.md](data-model.md), pogodba: [contracts/openapi.yaml](contracts/openapi.yaml), D-90 … D-92.

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`/`NamedParameterJdbcTemplate`, Flyway, Jackson `tools.jackson`; vmesnik: `react-router`, `react-i18next`, `@tabler/icons-react`, `sonner`, `shared/ui/dialog`, `features/groups/SectionPagination`) – **brez novih knjižnic**

**Storage**: PostgreSQL 18; **brez nove migracije** (obstoječi `contact*`, `audit_*`; `audit_entry.action` že dovoljuje `MERGE`)

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije, sočasnost, zmogljivost) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: SC-002 – prva stran rezultatov v skupini s 5000 kontakti < 3 s (`DuplicatePerformanceIT`, p95 po ogrevanju); SC-001 – iskanje → združitev dveh kontaktov s privzetimi izbirami v ≤ 4 klikih (E2E)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, atomarnost (vse ali nič), natanko en vnos `MERGE`, največ 10 kontaktov v primerjavi/združitvi, sočasne operacije zaporedno (zaklep po `id`), rezultati iskanja so posnetek (niso shranjeni), brez osebnih podatkov v dnevniku

**Scale/Scope**: 21 FR (FR-011-01 … FR-011-21), 3 novi endpointi, 0 migracij, 2 novi strani vmesnika, približno 14 novih BE in 16 novih FE datotek

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-011-01 … FR-011-21 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena; negativni scenariji spec so v testih; brez nove kode napake (register feature-map §2.10 nespremenjen); pravil ujemanja ni več, kot jih določa spec (research R-03). |
| II. Test-first | BE: `DuplicateKeysTest`, `DuplicateGroupsTest`, `MergeInputParserTest`, `DuplicateSearchIT`, `DuplicateCompareIT`, `MergeIT`, `MergeAtomicityIT`, `MergeValidationIT`, `MergeVersionConflictIT`, `MergeConcurrencyIT`, `MergeAuditIT`, `MergeRollbackIT`, `DuplicateArchivedIT`, `DuplicateLogIT`, `DuplicatePerformanceIT`, varnostni `DuplicateIsolationMatrixSecurityIT`. FE: `mergeModel.test.ts`, `DuplicatesPage.test`, `DuplicateResults.test`, `ComparePage.test`, `MergeFlow.test`, `CompareA11y.test`. E2E `dvojniki.spec.ts` pri 360/768/1280 px. Pregled testov pred kodo: agent `pregled-testov`. |
| III. Group isolation and roles | Vsi trije endpointi v matriki izolacije (401 / 404 / 403 / 409 `GROUP_ARCHIVED` / 2xx); identitete iz zahtevka vedno z `group_id` iz `Membership`; kontakt druge skupine in izmišljena identiteta = 404 (R-05); EDITOR+ v nearhivirani, VIEWER 403 tudi v arhivirani. Vmesnik zavihka ne izriše bralcu in v arhivirani skupini (FR-011-01). |
| IV. Accessible, bilingual, responsive UI | design.md 7.1 (zavihek), 8.9 (paginacija), 8.10/8.11 (dialog), 8.13 (obvestila, napake), 8.14 (konflikt verzij), 8.15 (prazna stanja), 9.5 (dvojniki); imena sl/en spodaj; `fieldset`/`legend`, izbirni gumbi in potrditvena polja z dostopnimi imeni, fokus na *Prekliči*, vrnitev fokusa, `role="alert"`/`status`; 320 px brez vodoravnega drsenja strani; axe v FE in E2E. |
| V. Data integrity | Atomarna združitev (ena transakcija), zaklep skupine + kontaktov po `id`, verzija vsakega vključenega kontakta preverjena (`409 VERSION_CONFLICT`, nič se ne spremeni), natanko en vnos `MERGE` z vsemi stanji prej (obnovljivo z rollbackom 005), seznami paginirani. |
| VI. Privacy and GDPR | Vrednosti kontaktov se ne beležijo v dnevnik (`DuplicateLogIT`); skupine in primerjave se ne shranjujejo; brez novih osebnih podatkov; vnosi sledi ostanejo po pravilih 005/012. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh` (`DuplicatePerformanceIT` v `full`). Brez novih orodij. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) iskanje bere vse kontakte skupine v pomnilnik (R-02) – O(n) na zahtevek, utemeljeno z merilom SC-002 (5000) in z odsotnostjo migracije; specifikacija ne določa zgornje meje skupine; (2) štiri odločitve čakajo na potrditev razvijalca (R-16: O-1 … O-4), nobena ne blokira Tasks; (3) rollback je pogodba 005 (R-10) – 011 ga ne spreminja, zato O-1 (ciljna razveljavitev) ni v obsegu.

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/duplicates?category=&page=&size= | EDITOR | rejected (409 GROUP_ARCHIVED) | 200; telo `DuplicatePage` | FR-011-02 … FR-011-07, FR-011-19 |
| GET | /api/groups/{groupId}/duplicates/compare?ids= | EDITOR | rejected (409 GROUP_ARCHIVED) | 200; telo `Comparison` | FR-011-08, FR-011-19, FR-011-20, FR-011-21 |
| POST | /api/groups/{groupId}/duplicates/merge | EDITOR | rejected (409 GROUP_ARCHIVED) | 200; telo `MergeResult` | FR-011-13, FR-011-15 … FR-011-17, FR-011-19 … FR-011-21 |

- Podrobno: [contracts/openapi.yaml](contracts/openapi.yaml), [data-model.md](data-model.md).
- Vrstni red (R-07): 401 → 404 (nečlan, neobstoječa skupina, tuja identiteta) → 403 → 409 `GROUP_ARCHIVED` → 400 (zgradba: > 10, < 2, podvojen, neveljavni UUID/verzija, neznana kategorija) → 409 `VERSION_CONFLICT` (samo `merge`) → 400 (`result.*`, samo `merge`). VIEWER arhivirane skupine: 403.
- `compare`: izbrisan (znan iz sledi) kontakt je izpuščen (brez napake); manj kot 2 kontakta v odgovoru ni napaka endpointa.
- Rollback združitve: obstoječi `POST /api/groups/{groupId}/audit/{entryId}/rollback` in `…/audit/initial-state/rollback` (005, ADMIN+) – **nespremenjena**.
- Nespremenjeni: kontakti (004, 008, 009), revizijska sled (005).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Dvojniki (obrazec in rezultati); `?category=name\|email\|phone&page=&size=` (`page` 1-osno) | /groups/:groupId/duplicates | EDITOR (bralec in arhivirana skupina: razlaga brez obrazca) | FR-011-01 … FR-011-07, FR-011-19 |
| Primerjava in združitev; `?category=&page=&size=&ids=‹uuid,…›&total=‹N›` | /groups/:groupId/duplicates/compare | EDITOR (bralec in arhivirana skupina: razlaga kot zgoraj) | FR-011-08 … FR-011-18, FR-011-21 |

- Obe poti sta razdelka v `GroupLayout` (`duplicates`, `duplicates/compare`); druge podpoti → »Te strani ni«. Skupina, ki je ni ali v kateri uporabnik ni član → »Te strani ni« (obstoječe vedenje).
- `category`, `page`, `size` v naslovu omogočajo osvežitev in *Nazaj* (FR-011-02) ter vrnitev na iste rezultate po združitvi (FR-011-18). `ids` (≤ 10) so trenutno vključeni kontakti; `total` je velikost skupine ob iskanju (samo prikaz »od N«). Prazen ali neveljaven `ids` (< 2) → preusmeritev na rezultate.

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Glava skupine | link | »Dvojniki« / "Duplicates" | zavihek (samo EDITOR+, nearhivirana) | FR-011-01 |
| Dvojniki | heading (2) | »Dvojniki« / "Duplicates" | naslov strani; fokus ob menjavi strani rezultatov | FR-011-01 |
| Dvojniki (bralec, arhivirana) | note | besedilo: »Dvojnike lahko išče in združuje urednik ali višja vloga.« / "Duplicates can be searched and merged by an editor or higher role." ali »Skupina je arhivirana – iskanje dvojnikov ni na voljo.« / "The group is archived – searching for duplicates is not available." | razlaga brez obrazca | FR-011-01 |
| Dvojniki (bralec, arhivirana) | link | »Na kontakte skupine« / "Go to group contacts" | vrne na `/groups/:groupId/contacts` | FR-011-01 |
| Dvojniki | radiogroup | »Kategorija« / "Category" | izbira kategorije | FR-011-02 |
| Dvojniki | radio | »Ime in priimek« / "Name and surname" (privzeto izbran); »E-naslov« / "Email"; »Telefon« / "Phone" | kategorija iskanja | FR-011-02 |
| Dvojniki | button | »Poišči dvojnike« / "Find duplicates" | sproži iskanje (zapiše kategorijo v naslov) | FR-011-02 |
| Dvojniki | status | »Skupin dvojnikov: 12« / "12 groups of duplicates" (`aria-live="polite"`) | število rezultatov | FR-011-07 |
| Dvojniki | list | »Skupine dvojnikov« / "Duplicate groups" | rezultati (kartice) | FR-011-07 |
| Kartica | listitem | »Enako ime in priimek: Janez Novak« / "Same name and surname: Janez Novak"; »Enak e-naslov: janez@primer.si« / "Same email: janez@primer.si"; »Enak telefon: +386 41 123 456« / "Same phone: +386 41 123 456" | kartica skupine; ime = razlog (vrednost prvega kontakta) | FR-011-03 … FR-011-05, FR-011-07 |
| Kartica | list | »Kontakti v skupini« / "Contacts in the group" – elementi: prikazna imena | celotna skupina (prvih 10 + `details`) | FR-011-07, FR-011-21 |
| Kartica (> 10 kontaktov) | button | »Še 4 kontakti« / "4 more contacts" (sl: 1 kontakt, 2 kontakta, 3–4 kontakti, 5+ kontaktov) | razkrije kontakte zunaj prvih 10 (`details` summary) | FR-011-21 |
| Kartica | button | »Primerjaj in združi« / "Compare and merge" | odpre primerjavo prvih 10 | FR-011-07, FR-011-08 |
| Dvojniki | status | »Ni dvojnikov po kategoriji E-naslov.« / "No duplicates in category Email." | prazno stanje | FR-011-07 |
| Dvojniki | status | »Te skupine dvojnikov ni več.« / "This group of duplicates no longer exists." | po konfliktu, ko ostane < 2 kontakta | FR-011-16 |
| Dvojniki | alert | »Dvojnikov ni bilo mogoče naložiti. Poskusi znova.« / "Duplicates could not be loaded. Try again." + button »Poskusi znova« / "Try again" | napaka nalaganja | FR-011-18 |
| Dvojniki | navigation | »Strani rezultatov« / "Result pages" (obstoječa `SectionPagination`; gumba »Prejšnja« / »Naslednja«, izbira velikosti 25/50/100) | paginacija | FR-011-07 |
| Primerjava | heading (2) | »Primerjava dvojnikov« / "Compare duplicates" | naslov strani | FR-011-08 |
| Primerjava | link | »Nazaj na rezultate« / "Back to results" | vrne na rezultate iste kategorije in strani | FR-011-18 |
| Primerjava | status | »Prikazanih je prvih 10 od 14 kontaktov. Ostali ostanejo nespremenjeni in jih lahko združiš v naslednjem koraku.« / "Showing the first 10 of 14 contacts. The others stay unchanged and you can merge them in the next step." | samo ko je `total` > število kontaktov | FR-011-21 |
| Primerjava | group | ime kontakta, npr. »Janez Novak« (naslov stolpca) | glava stolpca; vsebuje oznako »Ostane« / "Kept" (prvi) in gumb | FR-011-08, FR-011-11 |
| Glava stolpca | button | »Izloči iz združevanja« / "Exclude from merge" (pri > 2 kontaktih) | izloči kontakt; stolpec izgine | FR-011-11 |
| Primerjava | note | »Združiti je treba vsaj 2 kontakta.« / "At least 2 contacts are needed to merge." (pri 2 kontaktih namesto gumba) | razlaga | FR-011-11 |
| Primerjava | group | »Ime« / "First name"; »Priimek« / "Last name"; »Naslov« / "Address"; »E-naslov« / "Email"; »Telefon« / "Phone"; ključ dodatnega atributa (npr. »Kompetenca« / "Kompetenca"); (`fieldset` z `legend`) | vrstica polja | FR-011-08, FR-011-09 |
| Vrstica polja | radio | vrednost (npr. `041 111 222`) ali »(prazno)« / "(empty)"; privzeto izbrana prva neprazna | izbira vrednosti združenega kontakta | FR-011-09 |
| Primerjava | group | »Značke« / "Tags" | vrstica značk | FR-011-10 |
| Vrstica značk | checkbox | značka, npr. `vip`, `konferenca2025`, `alumni` (privzeto vse obkljukane) | značke združenega kontakta | FR-011-10 |
| Primerjava | button | »Enaka polja (2)« / "Identical fields (2)" (`details` summary) | razkrije strnjene vrstice z enakimi vrednostmi | FR-011-09 |
| Primerjava | region | »Predogled združenega kontakta« / "Merged contact preview" | ime, priimek, naslov, e-naslov, telefon, dodatni atributi, značke; sproti posodobljen | FR-011-12 |
| Primerjava | alert | »Vsaj ime ali priimek mora biti izpolnjen.« / "At least a first or last name is required." (ob vrstici »Ime«) | odjemalska in strežniška napaka | FR-011-13 |
| Primerjava | alert | »Kontakt ima lahko največ 30 značk – odkljukaj vsaj 2.« / "A contact can have at most 30 tags – uncheck at least 2." (ob vrstici »Značke«; N izračunan) | napaka | FR-011-13 |
| Primerjava | alert | »Kontakt ima lahko največ 50 dodatnih atributov – izberi »(prazno)« pri vsaj 3.« / "A contact can have at most 50 custom attributes – choose "(empty)" for at least 3." (predpostavka, R-13) | napaka | FR-011-13 |
| Primerjava | button | »Združi kontakte« / "Merge contacts" | validira in odpre potrditev | FR-011-13, FR-011-14 |
| Primerjava | alertdialog | »Združim 3 kontakte?« / "Merge 3 contacts?"; besedilo »Nastal bo en kontakt ‹Janez Novak›, ostala 2 bosta izbrisana. Združevanje bo zabeleženo v revizijski sledi.« / "One contact ‹Janez Novak› will remain and the other 2 will be deleted. The merge will be recorded in the audit trail." | design.md 8.11; fokus na *Prekliči* | FR-011-14 |
| Potrditev | button | »Prekliči« / "Cancel"; »Združi 3 kontakte« / "Merge 3 contacts" (nevaren; med pošiljanjem `aria-disabled`, »Združujem…« / "Merging…") | zapre / izvede | FR-011-14, FR-011-15 |
| Primerjava | alert | »Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.« / "The contacts changed in the meantime. The comparison has been refreshed – review your choices and merge again." | 409 `VERSION_CONFLICT` | FR-011-16 |
| Primerjava | alert | »Kontaktov ni bilo mogoče združiti. Poskusi znova.« / "The contacts could not be merged. Try again." + button »Poskusi znova« / "Try again" | napaka strežnika / brez povezave; izbire ostanejo | FR-011-18 |
| Dvojniki (po združitvi) | status (toast) | »Združenih kontaktov: 3. Ostal je kontakt Janez Novak.« / "Merged contacts: 3. Contact Janez Novak was kept." | uspeh | FR-011-18 |
| Toast | link | »Odpri revizijsko sled« / "Open the audit trail" | `/groups/:groupId/audit` (O-2) | FR-011-17 |

- Sklanjanje (sl `one`/`two`/`few`/`other`, en `one`/`other`; R-13): »Združim 2 kontakta?«, »Združim 3 kontakte?«, »Združim 5 kontaktov?«; »ostala 2 bosta izbrisana«, »ostali 3 bodo izbrisani«, »ostalih 5 bo izbrisanih«; »Še 1 kontakt«, »Še 2 kontakta«, »Še 4 kontakti«, »Še 5 kontaktov«.
- Napake brez kod: `403` »Za to dejanje nimaš več pravic.«, `409 GROUP_ARCHIVED` »Skupina je arhivirana. Spreminjanje ni mogoče.« (kot 004/009), brez povezave »Strežnik ni dosegljiv. Poskusi znova.« + *Poskusi znova*.
- Testi uporabljajo `within(listitem …)` za kartice, `within(group »Janez Novak«)` za glavo stolpca in `within(dialog)` za potrditev (*Prekliči* je na več mestih).

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni / unit | FE funkcionalni | E2E |
|---|---|---|---|
| FR-011-01 | – | `DuplicatesPage.test` | `dvojniki.spec` |
| FR-011-02 | `DuplicateSearchIT` (vključno z neveljavnimi parametri) | `DuplicatesPage.test`, `DuplicateResults.test` | `dvojniki.spec` |
| FR-011-03 | `DuplicateKeysTest`, `DuplicateSearchIT` | – | – |
| FR-011-04 | `DuplicateKeysTest`, `DuplicateSearchIT` | – | `dvojniki.spec` |
| FR-011-05 | `DuplicateKeysTest`, `DuplicateSearchIT` | – | – |
| FR-011-06 | `DuplicateKeysTest`, `DuplicateSearchIT` | – | – |
| FR-011-07 | `DuplicateGroupsTest`, `DuplicateSearchIT`, `DuplicatePerformanceIT` | `DuplicateResults.test` | `dvojniki.spec` |
| FR-011-08 | `DuplicateCompareIT` | `ComparePage.test` | `dvojniki.spec` |
| FR-011-09 | – | `mergeModel.test.ts`, `ComparePage.test` | – |
| FR-011-10 | – | `mergeModel.test.ts`, `ComparePage.test` | – |
| FR-011-11 | `MergeIT` (ohranjeni = najstarejši preostali) | `mergeModel.test.ts`, `ComparePage.test` | `dvojniki.spec` |
| FR-011-12 | – | `ComparePage.test` | `dvojniki.spec` |
| FR-011-13 | `MergeValidationIT`, `MergeInputParserTest` | `MergeFlow.test`, `mergeModel.test.ts` | – |
| FR-011-14 | – | `MergeFlow.test` | `dvojniki.spec` |
| FR-011-15 | `MergeIT`, `MergeAtomicityIT` | `MergeFlow.test` | `dvojniki.spec` |
| FR-011-16 | `MergeVersionConflictIT`, `MergeConcurrencyIT` | `MergeFlow.test` | `dvojniki.spec` |
| FR-011-17 | `MergeAuditIT`, `MergeRollbackIT` | `MergeFlow.test` (povezava na sled) | `dvojniki.spec` (rollback admina) |
| FR-011-18 | – | `MergeFlow.test` | `dvojniki.spec` |
| FR-011-19 | `DuplicateIsolationMatrixSecurityIT`, `DuplicateArchivedIT` | `DuplicatesPage.test` | `dvojniki.spec` |
| FR-011-20 | `DuplicateIsolationMatrixSecurityIT`, `DuplicateCompareIT` | – | – |
| FR-011-21 | `DuplicateCompareIT`, `MergeValidationIT`, `DuplicateIsolationMatrixSecurityIT` | `DuplicateResults.test`, `ComparePage.test`, `CompareA11y.test` | `dvojniki.spec` (3 viewporti) |

Merljiva merila: SC-001 – `dvojniki.spec` (4 kliki); SC-002 – `DuplicatePerformanceIT`; SC-003 – `MergeIT`, `MergeAuditIT` (natanko en kontakt in en vnos); SC-004 – `MergeVersionConflictIT`, `MergeConcurrencyIT`; SC-005 – `MergeRollbackIT`; SC-006 – `DuplicateIsolationMatrixSecurityIT`.

## Project Structure

### Documentation (this feature)

```text
specs/011-dvojniki/
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
├── DuplicateController.java        # GET duplicates, GET duplicates/compare, POST duplicates/merge
├── DuplicateService.java           # iskanje, primerjava, združitev (@Transactional), zaklepanje (R-08)
├── DuplicateKeys.java              # čista funkcija: normalizacija po kategoriji (R-03)
├── DuplicateGroups.java            # čista funkcija: grupiranje, razvrščanje, stran (R-04)
├── MergeInputParser.java           # telo merge in parametri compare (R-06, R-07); nikoli ne vrže
├── MergeInput.java · DuplicatePage.java · Comparison.java · MergeResult.java   # nepremenljivi modeli
├── ContactRepository.java          # + duplicateCandidates(group)
└── ContactSnapshots.java           # + replaceMerged(group, actor, keeperId, after)
backend/src/test/java/si/contactmanager/contact/
├── DuplicateKeysTest.java · DuplicateGroupsTest.java · MergeInputParserTest.java
├── DuplicateSearchIT.java · DuplicateCompareIT.java · MergeIT.java · MergeAtomicityIT.java
├── MergeValidationIT.java · MergeVersionConflictIT.java · MergeConcurrencyIT.java · MergeAuditIT.java
├── MergeRollbackIT.java · DuplicateArchivedIT.java · DuplicateLogIT.java · DuplicatePerformanceIT.java
├── DuplicateIsolationMatrixSecurityIT.java
└── support/DuplicateApiTest.java   # pomočniki (zahtevki, preverjanje »nič se ni spremenilo«)

frontend/src/
├── features/duplicates/
│   ├── api.ts · types.ts · duplicateRouting.ts      # klici, tipi, naslov (category, page, size, ids, total)
│   ├── DuplicatesPage.tsx · DuplicateSearchForm.tsx · DuplicateResults.tsx · DuplicateCard.tsx
│   ├── ComparePage.tsx · CompareColumns.tsx · CompareField.tsx · CompareTags.tsx · MergePreview.tsx
│   ├── MergeDialog.tsx · mergeModel.ts              # mergeModel: čista funkcija (R-12)
│   └── {DuplicatesPage, DuplicateResults, ComparePage, MergeFlow, CompareA11y}.test.tsx · mergeModel.test.ts
├── features/groups/GroupLayout.tsx    # razdelek `duplicates` (+ `duplicates/compare`)
├── features/groups/GroupHeader.tsx    # zavihek »Dvojniki« (EDITOR+, nearhivirana)
├── i18n/{sl,en}.json                  # duplicates.* (sklenjen blok)
└── test/{duplicatesApi.ts, msw.ts}    # privzeti rokovalniki novih endpointov
e2e/tests/dvojniki.spec.ts · e2e/tests/support/duplicates.ts
```

**Structure Decision**: obstoječa struktura iz 000–009; zaledje v paketu `contact` (dostop do paketno-zasebnih `ContactRepository` in uporaba `ContactSnapshots`, enako kot 009), vmesnik v novi mapi `features/duplicates/`. Revizijska sled, rollback (`audit`), skupine in seznam kontaktov se ne spreminjajo razen navedenih dodatkov.

## Complexity Tracking

Ni kršitev konstitucije. Namerna odstopanja in tveganja:

- **Izračun dvojnikov v pomnilniku (O(n) na iskanje)**: utemeljeno v research R-02; ni migracije; SC-002 preverja `DuplicatePerformanceIT`.
- **Tabela razlik brez elementa `<table>`**: zaporedje `fieldset` z mrežo CSS (R-12), ker `fieldset`/`legend` iz spec in design.md 9.5 ne more biti vrstica tabele; ena komponenta za vse širine.
- **Rollback**: 011 ne uvaja lastne razveljavitve (R-10); posledica je, da razveljavitev združitve prekrije tudi poznejše spremembe skupine (po zasnovi 005, s potrditvijo in preverjanjem najnovejšega vnosa) – O-1 čaka na potrditev.
- **Vzporedna 010**: skupne datoteke in D-NN so analizirani v research R-15; pred PR ponovno preveriti.
