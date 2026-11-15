---

description: "Tasks for 013-pametni-atributi (one pass, tests inside each story)"
---

# Tasks: Pametni atributi in značke

**Input**: `specs/013-pametni-atributi/` – spec.md (Clarifications 2026-11-15), plan.md (*Public Interfaces*), research.md (R-01 … R-09), data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: obvezni, pisani skupaj s kodo vsake zgodbe (konstitucija II); brez ločene faze testov.

**Organization**: Setup → Foundational → US1 … US6 (koda + testi) → Polish. Backend in frontend naloge iste zgodbe so označene [P], kjer ne delijo datotek (frontend se opira na pogodbo `contracts/openapi.yaml`, zato MSW ne čaka na zaledje).

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Endpointi in poti samo iz plan.md; oblike iz contracts/openapi.yaml; pravila polj iz data-model.md.
- Vrstni red preverjanj (feature-map §2.2) se ne spremeni; `RESERVED_KEY` za nova imena se javi skupaj z drugimi 400 (R-06).
- Migracija samo naprej: `V10__pametni_atributi.sql`; `V1`–`V9` se ne dotikamo. Obstoječi testi se ne oslabijo; spremembe zaradi premika `/tags` in novih polj gredo v opis PR (R-09).
- Brez `git push`, brez združitve.

## Phase 1: Setup

- [ ] T001 — Migracija `backend/src/main/resources/db/migration/V10__pametni_atributi.sql` (stolpca `company`, `country` po data-model.md); test: Flyway se izvede na bazi z obstoječimi vrsticami, ki ostanejo nespremenjene (FR-013-02) v `backend/src/test/java/si/contactmanager/contact/ContactNewFieldsMigrationIT.java`
- [ ] T002 [P] — i18n sl/en (`frontend/src/i18n/sl.json`, `en.json`): oznake *Podjetje*, *Država*, napotki RESERVED_KEY, prenos v polje, predlogi (število, »ni predlogov«), polja diff v sledi, množično urejanje, filter (izvoz uporablja jezik zahtevka v zaledju)

## Phase 2: Foundational

- [ ] T003 FR-013-13 FR-013-19 FR-013-03 — `CountryNames` (javna enota v `…/contact/CountryNames.java`): seznam 249 kod iz JDK, imena sl/en, `display(code, lang)`, `matching(text)`, `resolve(text)` (FOUND / AMBIGUOUS / UNKNOWN, aliasi, brez samodejne popravke); unit `CountryNamesTest` (30 besedil po SC-006: veljavna, dvoumna, neprepoznana; diakritike; alpha-3; vsaka koda ima ime v sl in en)
- [ ] T004 FR-013-01 FR-013-02 FR-013-07 FR-013-13 — polji `company`, `country` v `ContactInput`, `ContactDetail`, `ContactState`, `CompareContact`, `ExportRow`; `ContactInputParser` (polji v CREATE/UPDATE_FIELDS, `company` TOO_LONG > 200, `country` samo uradna koda → INVALID_VALUE); `ContactRepository`/`ContactSnapshots` (branje in pisanje obeh stolpcev, množični `unnest`, `replaceMerged`); `ContactService.sameValues`; `ChangeDiff`/`ChangeField`/`RollbackService.sameContent`; `ContactInputParserTest`, `ContactCreateIT`/`ContactEditIT` razširjena (polji, mejne dolžine, neveljavna država, stari posnetek brez polj se bere kot prazen, verzija se ne spremeni brez spremembe)
- [ ] T005 FR-013-08 FR-013-10 — `AttributeKeys` (rezervirana imena: stara + `država/country/podjetje/company`; kanonizacija ključev in značk) in poizvedbi kanonične oblike v `ContactRepository` (R-05); unit `AttributeKeysTest` (pogostejša različica, izenačenje po najstarejšem kontaktu, nespremenjen zapis ostane, neznan ključ kot vpisan)

## Phase 3: User Story 1 – Država in podjetje (P1) 🎯 MVP

**Goal**: polji končno do konca: obrazec, pogled, iskanje, filter, izvoz, množično, dvojniki, sled, rollback.

**Independent Test**: kontakt s podjetjem in državo → najden, izvožen, množično spremenjen, v sledi, rollback.

- [ ] T006 [US1] FR-013-03 — iskanje in filter: `ContactQuery.Kind` (`COMPANY`, `COUNTRY`), `ContactQueryParser` (polji `company`, `country`; razvrščanje po njiju zavrnjeno `UNKNOWN_FIELD`), `ContactSearch` (hitro iskanje tudi po obeh; država prek `CountryNames.matching`); IT `ContactSearchNewFieldsIT` (acme, avstrija, austria, at; filter; sl/en neodvisno od jezika) v `backend/src/test/java/…/contact/`
- [ ] T007 [US1] FR-013-05 — množično urejanje: `BulkEditInput.Field`, `BulkEdit`, `BulkInputParser` (company/country: dolžina, koda); IT `BulkEditNewFieldsIT` (nastavi, počisti, en vnos v sledi, neveljavna koda → 400, atomarnost)
- [ ] T008 [US1] FR-013-04 — izvoz: `ExportRepository`, `ExportService`, `ExportWriter`, `ExportLabels` (stolpca *Država* z imenom v jeziku izvoza in *Podjetje* za *Telefon*, pred atributi; glavi sl/en); popravek obstoječih izvoznih testov (indeksi stolpcev) + `ExportNewFieldsIT`
- [ ] T009 [US1] FR-013-06 FR-013-07 — dvojniki in sled: `DuplicateService.compareContact`/`merged`, `MergeInputParser` (result vsebuje polji); IT `MergeNewFieldsIT` (primerjava, združitev, sled MERGE, rollback povrne polji) in `RollbackNewFieldsIT` (stari vnosi brez polj, rollback počisti polji, `sameContent`)
- [ ] T010 [US1] FR-013-19 FR-013-20 — `CountryController` `POST /api/countries/resolve` (do 50 vrednosti, 400 pri neveljavnem telesu, 401 brez žetona); IT `CountryResolveIT`
- [ ] T011 [P] [US1] FR-013-01 FR-013-13 — frontend: `frontend/src/features/contacts/countries.ts` (249 kod, `countryName(code, lang)`, iskanje po imenu in kodi), `CountryField.tsx` (ARIA 1.2 izbirni seznam brez prostega besedila), `ContactForm.tsx` (polji *Podjetje* po priimku, *Država* po naslovu), `ContactView.tsx`, `types.ts`, `validation.ts`, `api.ts`, `frontend/src/test/contactsApi.ts` (MSW); testi `CountryField.test.tsx`, razširjena `ContactForm.test.tsx`, `ContactView.test.tsx` (vitest-axe)
- [ ] T012 [P] [US1] FR-013-03 FR-013-05 FR-013-06 FR-013-07 — frontend: `FilterPanel.tsx`/`contactQuery.ts` (polji; država prek `CountryField`), `BulkEditDialog.tsx` (nastavi/počisti), `features/duplicates/` (`mergeModel.ts`, `types.ts`, `CompareField.tsx`: vrstici), `features/audit/ChangeTable.tsx` in `types.ts` (država z imenom); testi `ContactFilters`, `BulkEditDialog`, `mergeModel`, `AuditDetails` razširjeni
- [ ] T013 [US1] FR-013-01 FR-013-03 FR-013-04 — E2E `e2e/tests/pametni-atributi.spec.ts`: ustvari kontakt s podjetjem in državo, iskanje po imenu in kodi, izvoz vsebuje stolpca, sled pokaže polje; axe pri 360 in 1280 px

**Checkpoint**: US1 deluje; `./verify.sh quick` zelen

## Phase 4: User Story 2 – Predlogi ključev (P1)

**Goal**: ključi iz skupine, kanonična oblika na strežniku in v vmesniku.

- [ ] T014 [US2] FR-013-09 FR-013-16 — `SuggestionController`/`SuggestionService`/poizvedbe `GET …/suggestions` za `type=key|value|company|tag|country` (R-04: do 10, fold ujemanje, predpona pred ujemanjem, štetje, rezervirana imena izločena, `q` ≤ 100); odstrani `GET …/tags`, `TagSuggestions`, preseli `ContactTagSuggestionsIT` (frontend `TagInput` se preseli v T019; T014, T016 in T019 morajo biti končani pred `./verify.sh quick`, ker se `GET …/tags` odstrani); IT `SuggestionsIT` (vsi tipi, vrstni red, kanonična oblika, `value` brez `key` → 400, `country` s `q` → 400) in matrika `SuggestionsIsolationMatrixSecurityIT` (401, 404, 403 VIEWER, 200 EDITOR/ADMIN/OWNER, 200 arhivirana, podatki skupine B se ne pojavijo)
- [ ] T015 [US2] FR-013-10 FR-013-15 — kanonizacija v pisanju: `ContactService.create/update`, `BulkService`, `DuplicateService.merge` uporabijo `AttributeKeys` (nespremenjen zapis ostane; rollback ne kanonizira); IT `CanonicalKeysIT` (ustvari, uredi, množično, združi, API; `kompetenca` → `Kompetenca`, `VIP` → `vip`; obstoječe različice se ne spremenijo; DUPLICATE v kontaktu ostane)
- [ ] T016 [P] [US2] FR-013-09 FR-013-10 FR-013-15 FR-013-17 FR-013-18 — frontend: `SuggestInput.tsx` (kombinirano polje, zamik 150 ms, preklic, tiha napaka, ARIA 1.2, ≥ 44 px), `useSuggestions` v `api.ts`, ključ v `ContactForm.tsx` in `BulkEditDialog.tsx` (izloči že uporabljene ključe), kanonični zapis ob zapustitvi polja; testi `SuggestInput.test.tsx` (tipkovnica, prazni fokus, napaka brez opozorila, zastarel odgovor), `ContactForm` (ključ), vitest-axe

## Phase 5: User Story 3 – Predlogi vrednosti, podjetja in držav (P1)

- [ ] T017 [P] [US3] FR-013-11 FR-013-12 FR-013-17 — frontend: vrednost atributa (`type=value`, samo ob znanem ključu), podjetje (`type=company`), seznam držav z najpogostejšimi na vrhu (`type=country` + `CountryField`); testi v `ContactForm.test.tsx` in `CountryField.test.tsx` (brez predlogov seznam še deluje)
- [ ] T018 [US3] FR-013-11 FR-013-12 — E2E: predlogi ključa, vrednosti, podjetja in držav v obrazcu (dva kontakta); tipkovnica; angleški vmesnik

## Phase 6: User Story 4 – Boljši predlogi značk (P2)

- [ ] T019 [P] [US4] FR-013-14 FR-013-10 FR-013-15 — frontend: `TagInput.tsx` preide na skupni hook (`type=tag`, predlogi ob fokusu, število, kanonični zapis ob dodajanju); testi `ContactTags.test.tsx` (obstoječi preneseni na novi endpoint, dodan fokus brez vpisa in kanonika), množično urejanje značk (`BulkEditDialog.test.tsx`)
- [ ] T020 [US4] FR-013-14 — E2E: značke po pogostosti ob fokusu, `VIP` → `vip`

## Phase 7: User Story 5 – Rezervirana imena in prenos starih atributov (P2)

- [ ] T021 [US5] FR-013-08 — preverba novih rezerviranih imen (R-06): `AttributeKeys.reservedErrors` v `ContactService.create/update` in `DuplicateService.merge` (storitev pozna stanje kontakta), v `BulkInputParser` samo za neprazno vrednost; obstoječi atribut ostane (urejanje, množični izbris, združitev, rollback); IT `ReservedKeysIT` (nov ključ → 400 RESERVED_KEY; kontakt s starim `Država` se uredi in shrani; brisanje v množičnem je dovoljeno, množična nastavitev z rezerviranim imenom → 400; združitev; vrstni red napak)
- [ ] T022 [P] [US5] FR-013-08 FR-013-20 — frontend: v `AttributeFields` opomba in *Premakni v polje …* za obstoječe atribute z rezerviranim imenom; podjetje (prazno polje: neposredno; konflikt: pogovorno okno z odločitvijo), država (`resolve`, predizpolnitev ali izbira iz kandidatov/seznama; brez izbire prenos ni mogoč); sporočilo RESERVED_KEY ob ključu; testi `AttributeTransfer.test.tsx` (vsi trije izidi, konflikt, brez samodejnih sprememb do shranjevanja, axe)
- [ ] T023 [US5] FR-013-08 FR-013-20 — E2E: kontakt z atributom `Država` = »Slovenija« se uredi, prenos v polje (`SI`), dvoumno »Korea« zahteva izbiro; v sledi ena sprememba

## Phase 8: User Story 6 – Zanesljivost (P1)

- [ ] T024 [US6] FR-013-16 FR-013-17 SC-003 — `SuggestionsPerformanceIT` (skupina z 10.000 kontakti: mediana 20 klicev < 300 ms za vse tipe); izvoz *moji podatki* (012) ne vsebuje kontaktov skupin, zato ni sprememb
- [ ] T025 [P] [US6] FR-013-18 SC-005 — a11y: vitest-axe na vseh razširjenih obrazcih/pogovornih oknih; E2E axe pri 360, 768 (če se postavitev razlikuje) in 1280 px za obrazec, filter in množično urejanje

## Phase 9: Polish

- [ ] T026 — dokumenti: `.specify/memory/feature-map.md` (§1 vrstica 013, §2.6 podjetje/država/kanonični zapis/rezervirana imena), `.specify/memory/design.md` (8.3–8.4: ključ/vrednost/podjetje/država kot kombinirana polja); `ai-log/ismar.md`
- [ ] T027 — `./verify.sh quick`, `backend`, `e2e` zeleni; `git diff origin/main -- backend/src/main/resources/db/migration` vsebuje samo `V10`; v opisu PR: spremenjeni obstoječi testi (`/tags`, glave izvoza, ChangeDiff, MSW) z razlogom

## Pokritost

| FR | Naloge |
|---|---|
| FR-013-01, -02 | T001, T004, T011, T013 |
| FR-013-03 | T003, T006, T012, T013 |
| FR-013-04 | T008, T013 |
| FR-013-05 | T007, T012 |
| FR-013-06, -07 | T004, T009, T012 |
| FR-013-08 | T005, T021, T022, T023 |
| FR-013-09, -16 | T014, T016, T018 |
| FR-013-10, -15 | T005, T015, T016, T019 |
| FR-013-11, -12 | T014, T017, T018 |
| FR-013-13 | T003, T004, T011 |
| FR-013-14 | T014, T019, T020 |
| FR-013-17 | T016, T017, T024 |
| FR-013-18 | T016, T025 |
| FR-013-19, -20 | T003, T010, T022, T023 |
| SC-001 … SC-006 | T018 (SC-001), T015 (SC-002), T024 (SC-003), T012/T004 + celoten `verify` (SC-004), T014/T025 (SC-005), T003/T006 (SC-006) |
