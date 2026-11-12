---

description: "Tasks for 010-izvoz-excel (tests mandatory, independent test review)"
---

# Tasks: Izvoz izbranih kontaktov v Excel

**Input**: `specs/010-izvoz-excel/`: spec.md (Clarify 2026-11-12), plan.md (*Public Interfaces*), research.md (R-01 … R-11), data-model.md, contracts/openapi.yaml, quickstart.md; odločitvi D-89, D-90 (izidi `/speckit-analyze`)

**Tests**: obvezni (konstitucija II). Vsak FR-010-01 … FR-010-16 in vsako merilo SC-001 … SC-006 ima vsaj eno testno nalogo. Testi se napišejo pred kodo, nato jih pregleda neodvisni agent `pregled-testov` (workflow.md §4.2). Testi gredo v ločen commit `test(010)`.

**Organization**: Setup → Foundational → Tests → Test review → Implementation core → US1 … US4 → Polish.

**Uporabniške zgodbe**:
- US1: izvoz izbranih kontaktov v datoteko (FR-010-01, 03 … 08, 10, 14, 15)
- US2: izvoz vseh zadetkov (FR-010-02, 13)
- US3: varen izvoz in spremembe med izborom (FR-010-09, 11, 12)
- US4: izvoz v arhivirani skupini (FR-010-16)

## Format: `[ID] [P?] [Story] FR-IDs Description (odvisnosti)`

- Imena endpointov, poti in dostopnih imen so **samo** iz plan.md (*Public Interfaces*). Oblike zahtevkov in odgovorov so iz contracts/openapi.yaml, pravila polj pa iz data-model.md.
- Testi nosijo FR-ID (`@Tag("FR-010-05")`; v Vitest/Playwright v imenu testa `"FR-010-05: …"`). Testi so napisani iz spec/plan/contracts, **ne** iz izvedbe.
- Vrstni red preverjanj (R-04): 401 → 404 (nečlan, neobstoječa skupina, identiteta, ki nikoli ni bila kontakt te skupine) → 400 `VALIDATION_FAILED` → 409 `EXPORT_EMPTY`. Endpoint nima 403 in 409 `GROUP_ARCHIVED` ter nikoli ne vrne `SELECTION_CHANGED`.
- Datoteka se v testih **vedno prebere nazaj**: v zaledju z `fastexcel-reader` (`XlsxReader`), v E2E z `exceljs`. Preveri se besedilo vsake celice, tip celice (besedilo) in odsotnost formul.
- »Izvoz je branje« se v testih vedno preveri takole: verzije vseh kontaktov skupine so enake, število vnosov revizijske sledi skupine je enako.
- Migracije **ni**; `V1`–`V8` se ne spreminjajo. Obstoječi sprejeti testi 000–009 se ne spreminjajo, razen T008 (DECISIONS `sprememba-testa`).
- Nove knjižnice so samo tiste iz D-89 (`fastexcel`, `fastexcel-reader`, `exceljs`). Ime datoteke in datum sestavi odjemalec (R-03).
- Brez `git push --force`, brez merge.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [P] — Odvisnosti zaledja (D-89, R-02): backend/pom.xml – `org.dhatim:fastexcel` (obseg `compile`) in `org.dhatim:fastexcel-reader` (obseg `test`). Verzija je v skupni lastnosti `fastexcel.version` in je zadnja stabilna, objavljena vsaj 2 tedna pred dodajanjem. V vnos D-89 v DECISIONS.md vpiši točno verzijo. Korak `orodja` v `./verify.sh quick` mora biti zelen (scripts/verify/test/decisions.test.mjs).
- [x] T002 [P] — Odvisnost E2E (D-89): e2e/package.json – `exceljs` kot `devDependency` z **točno** verzijo (brez `^`), nato `npm install` v `e2e/`, ki posodobi `package-lock.json`. Točno verzijo vpiši v D-89.
- [x] T003 [P] FR-010-01 FR-010-11 FR-010-13 FR-010-15 i18n ključi pod `contacts.export.*` v frontend/src/i18n/sl.json in en.json za **vsa** besedila iz plan.md (*Key elements and accessible names*):
  - `button` »Izvozi v Excel« / "Export to Excel"
  - »Pripravljam izvoz…« / "Preparing export…"
  - »Izvoženih kontaktov: {{count}}.« / "Contacts exported: {{count}}."
  - stavek o izpuščenih z i18next množinami (sl `one`/`two`/`few`/`other`: »1 izbrani kontakt je bil medtem izbrisan in ni v datoteki.«, »2 izbrana kontakta sta bila medtem izbrisana in ju ni v datoteki.«, »3 izbrani kontakti so bili medtem izbrisani in jih ni v datoteki.«, »5 izbranih kontaktov je bilo medtem izbrisanih in jih ni v datoteki.«; en `one`/`other`)
  - »Nobeden od izbranih kontaktov ne obstaja več.«
  - »Naenkrat lahko izvoziš največ 10 000 kontaktov. Zoži iskanje s filtri.«
  - »Izbrani kontakti imajo preveč različnih dodatnih atributov za en list. Izvozi manjši izbor.«
  - »Izvoz ni uspel. Poskusi znova.«
  - »Poskusi znova«
  - angleška besedila dobesedno po plan.md

  Brez povezave se uporabi obstoječi `groups.offline`. Test `i18n-keys` mora biti zelen.
- [x] T004 [P] FR-010-02 … FR-010-16 Podpora testom zaledja:
  - backend/src/test/java/si/contactmanager/contact/support/XlsxReader.java (`fastexcel-reader`): `read(byte[])` → `Workbook` z `sheetNames()`, `rows()` kot `List<List<String>>` (prazna celica = `""`, brez končnih praznih vrstic in stolpcev), `cellTypes()` in `hasFormula()` (vsaj ena celica s formulo).
  - backend/src/test/java/si/contactmanager/contact/support/ExportApiTest.java (razširi `BulkApiTest`): `export(token, group, json)` → status, glave in telo kot `byte[]`; `exportBody(ids, sort, dir, language)`; `readOnlySnapshot(group)` (verzije vseh kontaktov in število vnosov sledi).
- [x] T005 [P] FR-010-01 … FR-010-16 Podpora testom vmesnika: frontend/src/test/contactsApi.ts – `mockContactsApi` dobi rokovalnik `POST …/contacts/export` (`exportReply({count, skipped})` vrne `Blob` z glavama `X-Export-Count` in `X-Export-Skipped`, `exportError(status, body)`) z beleženjem teles zahtevkov (`exportRequests`). Uporabi se obstoječi ponaredek prenosa iz frontend/src/test/myDataApi.ts (`URL.createObjectURL` + `<a download>`), ki se po potrebi premakne v frontend/src/test/download.ts in obdrži ista imena izvozov.
- [x] T006 [P] FR-010-02 … FR-010-16 Podpora E2E: e2e/tests/support/xlsx.ts (`exceljs`) – `readXlsx(path)` → `{ sheetNames, rows: string[][], cellTypes, hasFormula }`; e2e/tests/support/contacts.ts – `createContactWithAttributes(groupId, name, attributes, tags)` (SQL, če še ne obstaja), `deleteContactInDb` se ne uporablja (brisanje prek API 004, da nastane vnos sledi).

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [x] T007 FR-010-02 … FR-010-16 Ogrodje zaledja (odvisnost: T001, T004):
  - backend/src/main/java/si/contactmanager/contact/ExportController.java – `POST /api/groups/{groupId}/contacts/export` z `access.require(jwt, groupId, Role.VIEWER, false)` (401/404 delujeta), nato `501`.
  - Prazni razredi `ExportService`, `ExportRequestParser`, `ExportRequest`, `ExportRow`, `ExportRepository`, `ExportWriter`, ki vržejo `UnsupportedOperationException`.
  - `CellText.of(String)` in `ExportLabels.sheetName/headers(language)`, ki vržeta `UnsupportedOperationException`.
  - backend/src/main/java/si/contactmanager/shared/error/ExportEmptyException.java (prazen).
- [x] T008 FR-010-01 Ogrodje vmesnika (odvisnost: T003, T005):
  - frontend/src/features/contacts/export/ExportButton.tsx izriše `null`.
  - exportFileName.ts: `fileNameTitle`, `exportFileName` vržeta `Error('not implemented')`.
  - api.ts: `exportContacts` vrže `Error('not implemented')`.
  - frontend/src/shared/download.ts: `downloadBlob`, `localDateStamp` (premik iz features/account/downloadJson.ts, `downloadJson` ga uporabi, vedenje 012 nespremenjeno).
  - frontend/src/shared/api/client.ts: `apiFetchBlob` vrže `Error('not implemented')`.
  - V SelectionActionBar.tsx vstavi `<ExportButton …/>` med *Izbriši* in *Počisti izbor*.
- [x] T009 FR-010-01 Sprememba sprejetega testa 009 (odvisnost: T008; konstitucija II): v frontend/src/features/contacts/selection/SelectionActionBar.test.tsx asercije »**ni** `button` »Izvozi v Excel«« (vrstice 52–79, FR-009-05: »gumb *Izvozi v Excel* doda 010«) postanejo »`button` »Izvozi v Excel« je prisoten« za urednika, bralca in arhivirano skupino; komentar v vrstici 26 se posodobi. Vnos D-91 (`sprememba-testa`) v DECISIONS.md z utemeljitvijo: FR-009-05 in FR-010-01 določata, da gumb doda 010; besedilo 009 je to pričakovalo.
- [ ] T010 — Združljivost 000–009 z ogrodjem (odvisnost: T007 … T009): `./verify.sh quick` je zelen brez drugih sprememb obstoječih testov; FE testi 012 (`MyDataSection`, prenos JSON) so po premiku `localDateStamp` zeleni; `git diff main -- backend/src/main/resources/db/migration` je prazen.

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja (`501`, `UnsupportedOperationException`, `not implemented`, ni gumba). Testi 000–009 so zeleni.

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje – unit (brez baze)

- [x] T011 [P] [US1] [US3] FR-010-08 FR-010-09 SC-004 backend/src/test/java/si/contactmanager/contact/CellTextTest.java (odvisnost: T007; parametriziran, dobesedne vrednosti):
  - `null` in `""` → brez celice.
  - `=HYPERLINK("http://x","klik")` → `'=HYPERLINK("http://x","klik")`; `+386 41 123 456` → `'+386 41 123 456`; `-Glavni trg 1` → `'-Glavni trg 1`; `@SUM(A1)` → `'@SUM(A1)`; `"\tx"` → `"'\tx"`; `"\rx"` → `"'\rx"`.
  - Nespremenjeno ostane: ` =1` (presledek na začetku), `041 123 456`, `007`, `Glavni trg 1\nMaribor` (prelom ostane), `Ana`, `a=b`.
- [x] T012 [P] [US1] FR-010-03 FR-010-04 backend/src/test/java/si/contactmanager/contact/ExportLabelsTest.java (odvisnost: T007):
  - `sl` → list »Kontakti«, glave `Ime`, `Priimek`, `Naslov`, `E-naslov`, `Telefon` in zadnja `Značke`.
  - `en` → "Contacts", `First name`, `Last name`, `Address`, `Email`, `Phone` in `Tags`.
- [x] T013 [P] [US1] [US2] FR-010-07 FR-010-13 backend/src/test/java/si/contactmanager/contact/ExportRequestParserTest.java (odvisnost: T007; tabela po data-model.md *ExportRequest*):
  - `contactIds` manjka ali je prazen → `contactIds` `REQUIRED`.
  - 10 001 različnih → `TOO_MANY`; 10 000 → veljavno; 10 001 z enim podvojenim → veljavno (»1–10 000 po zlitju podvojenih«).
  - Ne-UUID → `contactIds[i]` `INVALID_VALUE`.
  - `sort` manjka → `lastName`/`asc`; `sort` `email` + `dir` `desc` → veljavno; `sort` `attr:kompetenca` → polje ATTRIBUTE; `sort` `nekaj` → `sort` `INVALID_VALUE` (kot 008); `dir` `gor` → `dir` `INVALID_VALUE`.
  - `language` manjka → `REQUIRED`; `de` → `INVALID_VALUE`.
  - Neznano polje `foo` → `foo` `UNKNOWN_FIELD`.
  - Telo ni JSON objekt → `body` `MALFORMED`.
  - Razčlenjevalnik nikoli ne vrže.

### Zaledje – integracijski, varnostni (Testcontainers `postgres:18-alpine` + Firebase Auth Emulator)

- [x] T014 [P] [US1] FR-010-02 FR-010-03 FR-010-04 FR-010-05 FR-010-06 FR-010-07 FR-010-08 SC-003 backend/src/test/java/si/contactmanager/contact/ExportIT.java (odvisnost: T004; vsaka asercija primerja celotno tabelo `rows()` z dobesedno pričakovano):
  - **Izbor in oblika:** skupina s 5 znanimi kontakti, izvoz 3 identitet, `language` `sl` → `200` in `Content-Type` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Glave: `X-Export-Count` 3, `X-Export-Skipped` 0, `Cache-Control` `no-store`. Datoteka ima natanko list `["Kontakti"]`, vrstica 1 je glava `Ime, Priimek, Naslov, E-naslov, Telefon, Značke`, vrstice 2–4 so ti trije kontakti, drugih vrstic ni, drugih dveh kontaktov ni.
  - **Angleščina:** `en` → list `Contacts` in glava `First name … Tags`.
  - **Dodatni atributi** (US1-7/8, robni primeri):
    - A ima `kompetenca=web dev`, `Oddelek=IT`, B ima `podjetje=FERI`, C (ni izbran) ima `hobi` → stolpci `…, Telefon, kompetenca, Oddelek, podjetje, Značke`. Pri B sta `kompetenca` in `Oddelek` prazni, stolpca `hobi` ni.
    - Ključi `cena`, `čas`, `datum`, `Šola` → vrstni red `cena, čas, datum, Šola` v `sl` **in** v `en` (D-63).
    - `Kompetenca` v prvi vrstici datoteke in `kompetenca` v drugi → en stolpec z glavo `Kompetenca`.
    - Ključ `Značke` → ločen stolpec, stolpec značk je zadnji.
  - **Značke** (US1-9): `konferenca2025`, `Alumni`, `ne_obveščaj` → `Alumni, konferenca2025, ne_obveščaj`; kontakt brez značk ima prazno celico.
  - **Vrstni red** (US1-10/11): `sort` `email`, `dir` `desc` → vrstni red enak `GET …/contacts?sort=email&dir=desc` (008) za iste kontakte; brez `sort` → priimek, nato ime, naraščajoče po slovenski abecedi (»Cene«, »Čeh«, »Zupan«, »Žagar«).
  - **Besedilo** (US1-12): telefon `041 123 456`, ime `007`, dvovrstičen naslov s `\n` → vse celice tipa besedilo, vrednosti dobesedno enake, prazna polja so prazne celice, `hasFormula()` false.
  - **Robni primer:** kontakt, spremenjen po izboru → izvozi se trenutno stanje.
  - **Robni primer (D-90):** `sort` `attr:neobstaja` (ključa nima noben kontakt skupine) → `200`, vrstice po priimku, nato imenu (enako kot brez `sort`), brez napake.
- [x] T015 [US3] FR-010-09 SC-004 v backend/src/test/java/si/contactmanager/contact/ExportIT.java (odvisnost: T014; isti razred, ločena metoda), dobesedno po US3-1/2:
  - Kontakt z imenom `=HYPERLINK("http://x","klik")`, telefonom `+386 41 123 456`, naslovom `-Glavni trg 1` in atributom `opomba=@SUM(A1)` → celice `'=HYPERLINK("http://x","klik")`, `'+386 41 123 456`, `'-Glavni trg 1`, `'@SUM(A1)`, vse besedilo, `hasFormula()` false.
  - Ključ `=ključ` → glava `'=ključ`.
- [x] T016 [P] [US3] FR-010-11 backend/src/test/java/si/contactmanager/contact/ExportSkippedIT.java (odvisnost: T004):
  - 3 identitete, ena izbrisana prek API 004 (vnos v sledi) → `200`, `X-Export-Count` 2, `X-Export-Skipped` 1, datoteka ima 2 vrstici.
  - Kontakt, ki ga je odstranil rollback 005 (vrnitev na stanje pred njegovim nastankom; vnos v sledi) → enako izpuščen. Združevanje (011) še ni izvedeno, zato ga ta test ne pokriva; ko ga 011 doda, ga 011 doda v ta test (D-90).
  - Vse 3 izbrisane → `409 {code: EXPORT_EMPTY}`, brez datoteke.
  - Odgovor nikoli ni `409 SELECTION_CHANGED`.
- [x] T017 [P] [US1] FR-010-14 backend/src/test/java/si/contactmanager/contact/ExportReadOnlyIT.java (odvisnost: T004): po uspešnem izvozu, `400`, `404` in `409 EXPORT_EMPTY` sta `readOnlySnapshot(group)` (verzije vseh kontaktov, število vnosov sledi) enaka kot pred izvozom.
- [x] T018 [P] [US2] FR-010-13 backend/src/test/java/si/contactmanager/contact/ExportValidationIT.java (odvisnost: T004):
  - `contactIds` `[]` → `400 {code: VALIDATION_FAILED, errors: [{field: contactIds, code: REQUIRED}]}`.
  - 10 001 identitet → `TOO_MANY` (baza se ne obišče, 009 R-15).
  - Neveljaven `language` → `400`.
  - FR-010-13 (R-09): 330 kontaktov s po 50 različnimi ključi (16 500 ključev > 16 378) → `400` `contactIds` `TOO_MANY_COLUMNS`, brez `500`; meja: 16 378 različnih ključev → `200` in datoteka s 16 384 stolpci.
  - V vseh primerih je telo JSON, ne datoteka.
- [x] T019 [P] [US4] FR-010-16 backend/src/test/java/si/contactmanager/contact/ExportArchivedIT.java (odvisnost: T004): arhivirana in trajno arhivirana skupina × VIEWER, EDITOR, ADMIN, OWNER → `200` in datoteka z enako vsebino kot v nearhivirani skupini (ne `409 GROUP_ARCHIVED`).
- [x] T020 [P] [US1] [US2] [US3] [US4] FR-010-02 FR-010-12 FR-010-16 SC-006 backend/src/test/java/si/contactmanager/contact/ExportIsolationMatrixSecurityIT.java (odvisnost: T004; parametriziran, workflow.md §2.5):
  - Brez žetona, z neveljavnim in s poteklim žetonom → `401 UNAUTHENTICATED`.
  - Nečlan obstoječe skupine in neobstoječa skupina → `404` z enakim praznim telesom.
  - VIEWER, EDITOR, ADMIN, OWNER → `200`; arhivirana → `200`.
  - Član skupine A z identiteto kontakta skupine B ali izmišljenim UUID (sam ali skupaj z veljavnimi) → `404`, prazno telo, brez datoteke, odgovor enak za oba primera.
  - Vsebina nobene datoteke ne vsebuje kontakta druge skupine.
  - Vrstica v matriki izolacije v traceability.md.
- [x] T021 [P] [US2] SC-002 FR-010-13 backend/src/test/java/si/contactmanager/contact/ExportPerformanceIT.java (odvisnost: T004; R-11, korak `full`, vzorec `BulkPerformanceIT`):
  - 10 000 kontaktov, vsak s 5 dodatnimi atributi (20 različnih ključev) in 3 značkami.
  - 2 ogrevalna in 10 merjenih izvozov vseh 10 000 → p95 po najbližjem rangu < 10 000 ms do zadnjega bajta.
  - Prebrana datoteka ima 10 001 vrstico.
  - Rezultat (p50/p95/največ) se izpiše za traceability.md.

### Vmesnik – unit in funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel z imeni iz plan.md)

- [x] T022 [P] [US1] FR-010-10 frontend/src/features/contacts/export/exportFileName.test.ts (odvisnost: T008; dobesedno):
  - `exportFileName('Projekt FERI', 'sl', new Date(2026, 10, 2))` → `Projekt-FERI-kontakti-2026-11-02.xlsx`; v `en` → `Projekt-FERI-contacts-2026-11-02.xlsx`.
  - `Šola: 2./3. letnik?` → `Sola-2.-3.-letnik-kontakti-2026-11-02.xlsx`.
  - `???` → `skupina-kontakti-…` / `group-contacts-…`.
  - `..Čaj..` → `Caj`.
  - Lokalni datum ob 23.30 lokalnega časa je datum tega dne (ne UTC).
- [x] T023 [P] [US1] [US2] [US3] [US4] FR-010-01 FR-010-02 FR-010-04 FR-010-07 FR-010-10 FR-010-11 FR-010-13 FR-010-14 FR-010-15 FR-010-16 SC-005 frontend/src/features/contacts/export/ExportButton.test.tsx (odvisnost: T005; `renderContactsApp('/groups/<id>/contacts?sort=email&dir=desc')`):
  - **Vidnost:** brez izbora ni `button` »Izvozi v Excel«. Po `checkbox` »Izberi Ana Kos« je v `toolbar` »Dejanja izbora« gumb »Izvozi v Excel« za VIEWER, EDITOR, ADMIN in OWNER. V arhivirani skupini (US4-1) so v vrstici natanko `status` »Izbrani: N«, »Izberi vse zadetke (N)«, »Izvozi v Excel« in »Počisti izbor«, ni pa »Uredi izbrane« in »Izbriši«.
  - **Potek:** klik pošlje najprej `selection-check`, nato `export` s telesom `{contactIds, sort: 'email', dir: 'desc', language: 'sl'}`.
  - **Med čakanjem:** gumb z imenom »Pripravljam izvoz…« in `aria-disabled="true"`; natanko en `status` z besedilom »Pripravljam izvoz…« (R-10, plan.md). Drugi klik ne pošlje drugega zahtevka.
  - **SC-005:** obvestilo o uspehu oziroma `alert` je v DOM-u takoj po razrešitvi odgovora MSW (brez lažnih časovnikov in brez čakanja dlje od 1000 ms – `findByRole` s `timeout: 1000`).
  - **Uspeh:** prenos z imenom `Projekt-FERI-kontakti-‹localDateStamp›.xlsx` (ponaredek prenosa), toast `status` »Izvoženih kontaktov: 3.« in izbor nespremenjen (»Izbrani: 3«).
  - **Izpuščeni:** `X-Export-Skipped` 1 → »Izvoženih kontaktov: 2. 1 izbrani kontakt je bil medtem izbrisan in ni v datoteki.«; množine 2, 3 in 5 po plan.md.
  - **Spremenjen izbor:** `selection-check` z `changed` → obvestilo FR-009-18, izvoz ni poslan. *Nadaljuj z obstoječim izborom* → izvoz brez manjkajočih. *Posodobi izbor* → izvoz ni poslan, izbor posodobljen.
  - **Napake:**
    - `409 EXPORT_EMPTY` → `alert` »Nobeden od izbranih kontaktov ne obstaja več.«
    - `400` `TOO_MANY` → `alert` z mejo.
    - `400` `TOO_MANY_COLUMNS` → `alert` R-09.
    - `500` → `alert` »Izvoz ni uspel. Poskusi znova.«; prekinjena povezava → `alert` »Ni povezave. Preveri povezavo in poskusi znova.« (`groups.offline`); oba z `button` »Poskusi znova«, ki ponovi preverjanje in izvoz. Prenosa ni, izbor ostane.
  - **Jezik:** v angleškem vmesniku `language: 'en'`, ime `…-contacts-….xlsx` in "Contacts exported: 3.".
  - **Dostopnost:** `axe` brez kršitev v stanjih mirovanje, priprava, napaka in obvestilo.

### E2E (Playwright + @axe-core/playwright; 360, 768, 1280 px)

- [x] T024 [P] [US1] [US2] [US3] [US4] FR-010-01 … FR-010-16 SC-001 SC-003 e2e/tests/izvoz-excel.spec.ts (odvisnost: T006; workflow.md §2.9 – datoteka se **prenese in prebere nazaj**):
  - **Osnovni izvoz:** bralec izbere »Ana Kos« (stran 1) in »Bor Zupan« (stran 2) → *Izvozi v Excel* → `page.waitForEvent('download')`. `suggestedFilename()` je `Projekt-FERI-kontakti-‹danes›.xlsx`. `readXlsx` vrne list `Kontakti`, glavo in natanko 2 vrstici z dobesednimi celicami. Toast »Izvoženih kontaktov: 2.«, izbor ostane.
  - **Atributi, značke in zaščita:** A, B in kontakt `=HYPERLINK…` → stolpci `kompetenca, Oddelek, podjetje`, značke `Alumni, konferenca2025, ne_obveščaj`, celica `'=HYPERLINK("http://x","klik")`, `hasFormula` false.
  - **Angleški vmesnik:** list `Contacts` in ime `…-contacts-….xlsx`.
  - **Razvrstitev:** po e-naslovu padajoče → vrstni red vrstic enak kot na seznamu.
  - **Vsi zadetki:** filter `Značka: konferenca2025` in »Izberi vse zadetke (12)« → 12 vrstic. Drug uporabnik doda značko trinajstemu → obvestilo »Izbor se je spremenil: 1 nov zadetek.«; *Posodobi izbor* + izvoz → 13 vrstic.
  - **Arhivirana skupina:** izvoz uspe.
  - **Revizijska sled:** število vnosov se po izvozih ne spremeni.
  - **Dostopnost in odzivnost:** axe na vsaki strani; pri 360 px gumb v spodnji akcijski vrstici, potek samo s tipkovnico.

---

## Phase 4: Test review (independent agent gate)

- [x] T025 — Pregled testov z **novim** podagentom `pregled-testov` (`.claude/agents/pregled-testov.md`), ki dobi samo `specs/010-izvoz-excel/` in testne datoteke T009, T011 … T024. Preveri:
  - vsak FR-010-01 … FR-010-16 in SC-001 … SC-006 ima test;
  - negativni scenariji in matrika izolacije so pokriti;
  - imena so iz plan.md;
  - selektorji temeljijo na vlogah;
  - datoteka se bere nazaj z dobesednimi pričakovanji;
  - testi padejo zaradi pravega razloga;
  - sprememba testa 009 (T009, D-91) je utemeljena s spec.

  Ob ZAVRNJENO popravi teste in zaženi novega pregledovalca (največ 3 krogi, nato se ustavi in vprašaj razvijalca). Ob SPREJETO zapiši vse kroge v specs/010-izvoz-excel/traceability.md (razdelek *Pregled testov*) in commitaj `test(010): …` (samo testi, testna podpora, ogrodje, i18n in odvisnosti).

**Checkpoint**: nobena implementacijska naloga se ne začne pred označeno T025 (SPREJETO). Od tu naprej se testi spreminjajo samo za uskladitev s spec (DECISIONS.md).

---

## Phase 5: Implementation core (skupno vsem zgodbam)

- [x] T026 [P] FR-010-08 FR-010-09 Izvedi backend/src/main/java/si/contactmanager/contact/CellText.java po research R-07: `null`/`""` → `Optional.empty()`. Prvi znak `=`, `+`, `-`, `@`, `\t`, `\r` → predpona `'`. Sicer je vrednost nespremenjena.
- [x] T027 [P] FR-010-03 FR-010-04 Izvedi backend/src/main/java/si/contactmanager/contact/ExportLabels.java po R-08 (zaprta preslikava `sl`/`en`, besedila dobesedno iz plan.md).
- [x] T028 [P] FR-010-07 FR-010-13 Izvedi backend/src/main/java/si/contactmanager/contact/ExportRequestParser.java in ExportRequest.java po data-model.md (*ExportRequest*):
  - »`contactIds` 1–10 000 po zlitju podvojenih«;
  - `sort`/`dir` razčleni z obstoječo logiko `ContactQueryParser` (`parseSort`/`parseDirection` – po potrebi postaneta paketno vidni, brez spremembe vedenja 008);
  - »`language` `sl` | `en` (obvezno)«; neznana polja `UNKNOWN_FIELD`; nikoli ne vrže.

  Vrne tudi `identities(body)` za korak 404 (vzorec `BulkInputParser.identities`, pri več kot 10 000 `null`).
- [x] T029 FR-010-05 FR-010-06 FR-010-07 FR-010-11 Izvedi backend/src/main/java/si/contactmanager/contact/ExportRepository.java po R-06:
  - `rows(group, ids, query)` – `… WHERE c.group_id = :group AND c.id = ANY(:ids) ORDER BY ‹ContactSearch.orderBy›`;
  - `attributes(ids)` – po kosih 5000;
  - `tags(ids)` – `ORDER BY contact_id, tag_norm COLLATE sort_sl, tag_norm`;
  - `keyOrder(ids)` – različni `key_norm`, `ORDER BY key_norm COLLATE sort_sl, key_norm`.
- [x] T030 FR-010-03 FR-010-05 FR-010-08 Izvedi backend/src/main/java/si/contactmanager/contact/ExportWriter.java (`fastexcel`, odvisnost: T026, T027):
  - en list z imenom iz `ExportLabels`;
  - vrstica 1 je glava (`CellText` tudi za ključe), sledijo vrstice v podanem vrstnem redu;
  - vse vrednosti prek `value(String)` (nikoli `formula`), slog stolpcev `format("@")`, `wrapText` za naslov;
  - pisanje neposredno v `OutputStream`.
- [x] T031 FR-010-11 Rokovalnik v backend/src/main/java/si/contactmanager/shared/error/ApiExceptionHandler.java: `ExportEmptyException` → `409 {code: EXPORT_EMPTY}`. Kodo dodaj v enum ali seznam kod, če obstaja (feature-map §2.10 jo že ima).

**Checkpoint**: T011, T012 in T013 so zeleni; `./verify.sh quick` je zelen.

---

## Phase 6: User Story 1 – Izvoz izbranih kontaktov v datoteko Excel (Priority: P1) 🎯 MVP

**Goal**: član izbere kontakte, klikne *Izvozi v Excel* in prenese pravilno `.xlsx` z imenom po FR-010-10.

**Independent Test**: T014, T017, T022 in del T023 (vidnost, potek, uspeh, jezik) ter E2E osnovni izvoz so zeleni.

- [x] T032 [US1] FR-010-02 … FR-010-08 FR-010-14 Izvedi backend/src/main/java/si/contactmanager/contact/ExportService.java (odvisnost: T028 … T031):
  - `@Transactional(readOnly = true, isolation = REPEATABLE_READ)`;
  - vrstice, atributi in značke iz `ExportRepository`;
  - glava ključa je `key` iz prve vrstice datoteke s tem `key_norm`;
  - `ExportRow` za vsak kontakt, nato `ExportWriter`.

  Brez zaklepov, brez pisanja.
- [x] T033 [US1] FR-010-02 FR-010-16 Izvedi backend/src/main/java/si/contactmanager/contact/ExportController.java po R-04:
  - `access.require(jwt, groupId, Role.VIEWER, false)`;
  - `BulkService.requireKnown` nad veljavnimi identitetami (404);
  - razčlenitev (400); `ContactService.requireKnownKeys` se **ne** kliče (ključ razvrščanja brez kontaktov ni napaka, D-90);
  - `ExportService`.

  Odgovor je `StreamingResponseBody` z glavami `Content-Type`, `X-Export-Count`, `X-Export-Skipped`, `Content-Disposition: attachment; filename="contacts.xlsx"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Štetje in `EXPORT_EMPTY` se izračunata **pred** začetkom toka, da je napaka še lahko JSON.
- [x] T034 [P] [US1] FR-010-10 Izvedi frontend/src/features/contacts/export/exportFileName.ts po data-model.md (*Ime datoteke*): NFD, odstranitev `\p{M}`, `[^A-Za-z0-9._]+` → `-`, obrez vodilnih in končnih `-` in `.`, prazno → `skupina`/`group`; datum iz `localDateStamp`.
- [x] T035 [US1] FR-010-15 Izvedi `apiFetchBlob` v frontend/src/shared/api/client.ts (napake enako kot `apiFetch` – `ApiError` s `status`, `code`, `body`; ob uspehu `{ blob, headers }`) in `exportContacts` v frontend/src/features/contacts/export/api.ts → `{ blob, count, skipped }`.
- [x] T036 [US1] FR-010-01 FR-010-04 FR-010-07 FR-010-14 FR-010-15 Izvedi frontend/src/features/contacts/export/ExportButton.tsx (odvisnost: T034, T035):
  - `useSelectionCheck({ run: ids => exportContacts(group.id, ids, query.sort, query.dir, i18n.language), onSuccess })`;
  - `sort`/`dir` iz trenutne poizvedbe 008 (`useContactQuery`);
  - med `busy` oznaka in `aria-disabled` ter `status`;
  - uspeh: `downloadBlob` + toast (`sonner`);
  - izbor ostane;
  - obvestilo FR-009-18 s `SelectionChangedNotice`;
  - napaka: `alert` nad seznamom (design.md 8.13, žetoni `danger-soft`/`danger`) s *Poskusi znova*.

  Gumb je viden vsem vlogam.

**Checkpoint**: zgodba 1 je samostojno uporabna; `./verify.sh quick` je zelen.

---

## Phase 7: User Story 2 – Izvoz vseh zadetkov iskanja (Priority: P2)

**Goal**: izbor »Izberi vse zadetke« se izvozi kot posnetek, z uskladitvijo FR-009-18 in mejo 10 000.

**Independent Test**: T018, T021, del T023 (spremenjen izbor, meja) in E2E »vsi zadetki« so zeleni.

- [x] T037 [US2] FR-010-02 FR-010-13 frontend/src/features/contacts/export/ExportButton.tsx (odvisnost: T036): preslikava `400` `contactIds` `TOO_MANY` → besedilo meje in `TOO_MANY_COLUMNS` → besedilo R-09; *Posodobi izbor* izvoza ne sproži, *Nadaljuj z obstoječim izborom* ga sproži brez manjkajočih (obstoječi `useSelectionCheck`).
- [x] T038 [US2] FR-010-13 SC-002 backend/src/main/java/si/contactmanager/contact/ExportService.java (odvisnost: T032): preverjanje `6 + število ključev ≤ 16 384` pred začetkom toka → `400` `contactIds` `TOO_MANY_COLUMNS` (R-09). Po potrebi optimizacija za `ExportPerformanceIT` (kosi, `= ANY` polja, brez N+1).

---

## Phase 8: User Story 3 – Varen izvoz in razrešitev sprememb med izborom (Priority: P2)

**Goal**: datoteka nima formul; izbrisani in združeni kontakti se izpustijo; tuja identiteta da `404`.

**Independent Test**: T015, T016, T020 (tuja identiteta) in del T023 (izpuščeni, `EXPORT_EMPTY`) so zeleni.

- [x] T039 [US3] FR-010-11 FR-010-12 backend/src/main/java/si/contactmanager/contact/ExportService.java (odvisnost: T032): `skipped = število različnih identitet − število prebranih vrstic`; `0` vrstic → `ExportEmptyException`; tuje identitete so izločene že v koraku 404 (T033).
- [x] T040 [US3] FR-010-11 frontend/src/features/contacts/export/ExportButton.tsx (odvisnost: T036): toast z dodanim stavkom o izpuščenih (i18next množine); `409 EXPORT_EMPTY` → `alert`.

---

## Phase 9: User Story 4 – Izvoz v arhivirani skupini (Priority: P3)

**Goal**: vse vloge arhivirane in trajno arhivirane skupine izvozijo enako kot v nearhivirani.

**Independent Test**: T019, T020 (arhivirana), del T023 (arhivirana) in E2E arhivirana so zeleni.

- [x] T041 [US4] FR-010-01 FR-010-16 Preveri, da ExportController.java nima preverjanja `membership.archived()` in da je `ExportButton` v SelectionActionBar.tsx izrisan neodvisno od `canEditContacts`. Popravi samo, če T019 ali T023 padeta.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T042 FR-010-01 … FR-010-16 `/speckit-converge` do »Converged«; manjkajoče doda kot naloge in jih izvede.
- [x] T043 SC-001 … SC-006 Posodobi specs/010-izvoz-excel/traceability.md: vsak FR-ID → testi → stanje; matrika izolacije za `POST …/contacts/export`; *Meritve*: SC-002 (`ExportPerformanceIT` p50/p95/največ in okolje).
- [x] T044 — `./verify.sh full` zelen (vključno z vsemi testi 000–009).
- [x] T045 — Ročni pregled skrivnosti cele veje (`gitleaks` nad `git diff main...`), izid v opisu PR.
- [x] T046 — Push veje `izvoz-excel` in PR v `main`. Opis PR navede:
  - predpostavke: R-03 (ime datoteke in datum na odjemalcu), R-05 (izpust namesto `SELECTION_CHANGED`), R-09 (`TOO_MANY_COLUMNS`, potrjeno v FR-010-13);
  - D-89 (knjižnice) in D-91 (sprememba testa 009);
  - izid pregleda testov in commit `test(010)`.
- [ ] T047 — Razvijalca: pregled PR, ročni preizkus tipkovnice in bralnika zaslona (design.md §10), odpiranje datoteke v Excelu in LibreOffice; merge (agent pusti neoznačeno).

---

## Dependencies & Execution Order

- **Setup (T001–T006) → Foundational (T007–T010) → Tests (T011–T024) → Test review (T025)** si sledijo strogo zaporedno. Znotraj faz so naloge [P] vzporedne.
- **Implementation core (T026–T031)** sledi po T025; T026, T027 in T028 so vzporedne, T029 in T030 sledita T026 in T027.
- **Zgodbe**: US1 (T032–T036) → US2 (T037–T038) → US3 (T039–T040) → US4 (T041). US2 in US3 razširita `ExportService` in `ExportButton` iz US1 (iste datoteke), zato ne tečeta vzporedno.
- **Polish (T042–T047)** sledi po vseh zgodbah.
- `/speckit-implement` se zažene dvakrat: najprej do vključno faze 3 (testi), nato po SPREJETO pregledovalca za preostale faze (workflow.md §4.2). Agent nadaljuje brez čakanja na razvijalca; ta pregledata PR.

## Parallel Example

```text
# Faza 3 – po T010 hkrati:
T011 CellTextTest · T012 ExportLabelsTest · T013 ExportRequestParserTest
T016 ExportSkippedIT · T017 ExportReadOnlyIT · T018 ExportValidationIT · T019 ExportArchivedIT
T020 ExportIsolationMatrixSecurityIT · T021 ExportPerformanceIT
T022 exportFileName.test · T023 ExportButton.test · T024 izvoz-excel.spec
(T014 → T015 zaporedno, ista datoteka ExportIT.java)

# Faza 5 – po T025 hkrati:
T026 CellText · T027 ExportLabels · T028 ExportRequestParser

# US1 – hkrati z zaledjem (T032, T033):
T034 exportFileName.ts
```

## Implementation Strategy

1. **MVP = US1**: izvoz izrecno izbranih kontaktov z vsemi pravili datoteke (T026–T036). Po T036 je funkcionalnost uporabna in E2E osnovni izvoz je zelen.
2. **US2** doda besedila meje in R-09 ter optimizacijo (SC-002).
3. **US3** doda štetje izpuščenih in `EXPORT_EMPTY`. Zaščita pred formulami je že v jedru (T026).
4. **US4** je samo preverjanje (pravilo izhaja iz jedra).
5. Po vsaki nalogi `./verify.sh quick`; pred PR `./verify.sh full`.

## Notes

- [P] = različne datoteke, brez odvisnosti od nedokončanih nalog.
- Vsaka naloga navaja FR-ID-je zaradi sledljivosti.
- Testa nikoli ne spremeni, da bi ustrezal kodi; vsaka sprememba testa po pregledu dobi vnos v DECISIONS.md.
- Brez utišanj brez odobrenega D-NN; barve samo iz žetonov design.md.
- Pred označitvijo naloge kot opravljene požene `./verify.sh quick`.
