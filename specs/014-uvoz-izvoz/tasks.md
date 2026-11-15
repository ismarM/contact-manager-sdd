---

description: "Tasks for 014-uvoz-izvoz (one pass, tests inside each story)"
---

# Tasks: Uvoz in izvoz kontaktov (Excel, vCard, koda QR, CardDAV)

**Input**: `specs/014-uvoz-izvoz/` – spec.md (Clarifications 2026-11-15), plan.md (*Public Interfaces*), research.md (R-01 … R-10), data-model.md, contracts/openapi.yaml, contracts/carddav.md, quickstart.md

**Tests**: obvezni, pisani skupaj s kodo vsake zgodbe (konstitucija II); brez ločene faze testov.

**Organization**: Setup → Foundational → US1 … US5 (koda + testi) → Polish. Frontend se opira na pogodbo `contracts/openapi.yaml` (MSW), zato lahko teče vzporedno z zaledjem iste zgodbe.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Endpointi in poti samo iz plan.md; oblike iz contracts/; pravila polj iz data-model.md in feature-map §2.6.
- Vrstni red preverjanj feature-map §2.2; nova koda `APP_PASSWORD_LIMIT` (409). Migracija samo naprej: `V11__uvoz_izvoz.sql`.
- UI testi samo `getByRole`/`getByLabel`, imena iz prevodov ali `frontend/src/test/` oz. `e2e/tests/support/`; axe na vsaki strani.
- Brez `git push`, brez združitve.

## Phase 1: Setup

- [x] T001 — Odvisnosti: `backend/pom.xml` (`fastexcel-reader` scope compile; `ez-vcard` 0.12.1 z izključenima `jackson-core`, `jsoup`); `frontend/package.json` + lockfile (`qrcode` 1.5.4, `barcode-detector` 3.2.3, dev `@types/qrcode` 1.5.6), točne različice; zapisa odločitev `docs/decisions/2026-11-15-uvoz-izvoz-knjiznice.md` (R-01, R-02, R-06, R-07 z razlogi; ez-vcard zadnja izdaja 2023) in `docs/decisions/2026-11-15-gesla-za-aplikacijo-carddav.md` (R-08, R-09: nov tip klicatelja, druga varnostna veriga)
- [x] T002 — Migracija `backend/src/main/resources/db/migration/V11__uvoz_izvoz.sql` po data-model.md (`IMPORT` v CHECK `audit_entry.action`, `app_password`, `dav_login_state`); `AuditAction.IMPORT`; test `backend/src/test/java/si/contactmanager/audit/ImportActionMigrationIT.java` (vnos `IMPORT` se zapiše, nespremenljivost velja, obstoječi vnosi nespremenjeni, kaskada iz `app_user` izbriše obe novi tabeli)
- [x] T003 [P] — Infrastruktura (R-10): `frontend/nginx.conf` (`/dav/`, `= /.well-known/carddav`, `client_max_body_size 25m` za `/api/groups/*/imports`), `frontend/vite.config.ts` (denylist `/dav/`, `/.well-known/`; `wasm` v `globPatterns`), `backend/src/main/resources/application.yml` (multipart 10 MB / 11 MB); `MaxUploadSizeExceededException` → `400 VALIDATION_FAILED` (`file: FILE_TOO_LARGE`) v `ApiExceptionHandler`
- [x] T004 [P] — i18n sl/en (`frontend/src/i18n/sl.json`, `en.json`): uvoz (meni, koraki, cilji preslikave, povzetki z množinskimi oblikami, napake datoteke, dvojniki, države, *Poskusi znova*), izvoz vCard, koda QR (okno, opozorilo, ni vključeno, alternativa), skeniranje (navodilo, kamera ni na voljo, ni kode, več kod), gesla za aplikacijo in navodilo CardDAV, `audit.sentence.IMPORT_*` in filter *Uvoz*, `APP_PASSWORD_LIMIT`; imena atributov iz vizitk (`E-naslov 2`, `Rojstni dan` …) v zaledju (`VcardMapping`, sl/en)

## Phase 2: Foundational

- [x] T005 FR-014-11 FR-014-12 FR-014-13 — Preslikava kontakt ↔ vCard na zaledju (R-03): `backend/src/main/java/si/contactmanager/contact/vcard/VcardMapping.java`, `VcardWriter.java` (3.0, UTF-8, `X-CM-KEY`/`X-CM-VALUE` po skupinah, `ADR;X-CM-CC`, ime države v jeziku), `VcardReader.java` (2.1/3.0/4.0, prednostni/prvi, `FN` → zadnja beseda priimek, `CATEGORIES` s presledki → `-`, `BDAY/URL/NOTE` v atribute po jeziku, `PHOTO` izpuščen, več naslovov/e-naslovov/telefonov → `… 2`); unit `VcardMappingTest` (skupne vizitke `backend/src/test/resources/vcard/`: `cases`, `written-backend.vcf`, branje `written-frontend.vcf`; krožna pot z vsemi polji, 50 atributi, 30 značkami, šumniki, večvrstičnim naslovom, `=`/`+`; vzorci 2.1 `QUOTED-PRINTABLE`+`CHARSET`, 3.0, 4.0; vizitka iz telefona po zgodbi 2/5; samo `FN`)
- [x] T006 [P] FR-014-15 FR-014-18 — Preslikava vCard na frontendu (R-03, R-06, R-07): `frontend/src/features/contacts/qr/vcardWrite.ts` (3.0, ista preslikava kot T005), `vcardRead.ts` (2.1–4.0, zlaganje, `QUOTED-PRINTABLE`, `CHARSET`, ubežni znaki → kandidat), `mecard.ts`; unit testi berejo skupne vizitke iz `backend/src/test/resources/vcard/` (R-03: `cases/*.vcf` + `*.json`, `contact-full.json`, `written-frontend.vcf`, branje `written-backend.vcf`)
- [x] T007 FR-014-05 — Vrsta vnosa `IMPORT` v sledi: `frontend/src/features/audit/types.ts` (`AUDIT_ACTIONS`), prikaz stavka in filter v `AuditPage`/`AuditEntryItem` prek prevodov; test v `frontend/src/features/audit/AuditFilters.test.tsx` (filter *Uvoz*) in `AuditPage.test.tsx` (stavek »uvozil(a) N kontaktov«); `AuditController` sprejme `action=IMPORT` (IT v obstoječem razredu sledi)

## Phase 3: User Story 1 – Uvoz kontaktov iz Excela (P1) 🎯 MVP

**Goal**: `.xlsx` → preslikava → predogled (napake, države, dvojniki) → atomaren uvoz z enim vnosom sledi.

**Independent Test**: izvoz 010 iz skupine A uvozi v prazno skupino B; kontakti enaki, en vnos *Uvoz*, rollback ga povrne.

- [x] T008 [US1] FR-014-02 FR-014-06 FR-014-08 — Razčlenitev Excela: `backend/src/main/java/si/contactmanager/contact/imports/XlsxGuard.java` (vnosi ≤ 500, razširjeno ≤ 100 MB s štetjem, razmerje), `XlsxSheetReader.java` (prvi list, glava v vrstici 1, prazne vrstice/stolpci brez glave izpuščeni, ≤ 10 000 vrstic, ≤ 16 384 stolpcev, shranjena vrednost formule, števila brez eksponenta, datum ISO, odstranitev `'` po FR-014-06), `HeaderMapping.java` (glave 010 sl/en iz `ExportLabels`, brez razlike velikosti črk, rezervirana imena → predlog polja, sicer `ATTRIBUTE`); unit `XlsxGuardTest` (zip-bomba, preveč vnosov, ni zip), `XlsxSheetReaderTest` (datoteke ustvarjene s `fastexcel`: formula, `'=HYPERLINK`, število, datum, več listov, brez glave, 10 001 vrstic), `HeaderMappingTest`
- [x] T009 [US1] FR-014-03 FR-014-04 FR-014-07 FR-014-09 — Predogled: `ImportPreviewService.java` (`ContactInputParser` po vrstici → napake po poljih; `CanonicalForms`; `CountryNames.resolve` po različnih vrednostih; `DuplicateKeys` proti skupini in med vrsticami, razlog in ime obstoječega kontakta); unit/IT `ImportPreviewIT` (120 vrstic z napakama v 7 in 15, države iz scenarija 5, dvojnik po e-naslovu, dvojnik znotraj datoteke, kanonični `Kompetenca`, rezerviran ključ)
- [x] T010 [US1] FR-014-05 FR-014-07 FR-014-08 — Potrditev: `ImportService.java` (ponovna celotna preverba vseh brez zaupanja predogledu – 004/013, država samo koda, rezervirana imena, meje, 1–10 000, zaklep skupine in preverba arhiva v transakciji, paketni vstavki, en `audit_entry` `IMPORT` z `audit_change` *po*, odgovor `created`, `auditEntryId`), `ImportController.java` (`parse`, `preview`, `imports`), `ImportInputParser.java`; IT `ImportIT` (118 ustvarjenih, en vnos sledi, rollback 005 izbriše uvožene, neveljavna vrstica → 400 in nič ne nastane, skupina arhivirana med predogledom in potrditvijo → 409 in nič, 10 001 → 400, 10 MB → 400, ni xlsx → 400; zmogljivost potrditve 10 000 < 30 s in predogleda 10 000 < 10 s, SC-002) in `ImportIsolationIT` (parametrizirana matrika za vse tri endpointe: 401 brez/neveljaven/potekel žeton, 404 nečlan in neobstoječa skupina, 403 VIEWER, 2xx EDITOR/ADMIN/OWNER, 409 arhivirana in trajno arhivirana)
- [x] T011 [P] [US1] FR-014-01 FR-014-02 FR-014-03 FR-014-04 FR-014-05 FR-014-09 — Stran uvoza: `frontend/src/features/import/` (`ImportPage.tsx` s koraki in `role="status"`, `FileStep.tsx`, `MappingStep.tsx` – izbira cilja, napaka ob podvojenem predefiniranem cilju in podvojenem ključu, `mapping.ts` – vrstice → kandidati, delitev značk pri vejicah, `PreviewTable.tsx` – 25 na stran, napake ob polju, *Preskoči*/*Ustvari*, `CountryResolver.tsx` – enkrat na vrednost, *Pusti prazno*, onemogočena potrditev, `api.ts`); pot `contacts/import?source=` v `frontend/src/features/contacts/ContactsPage.tsx` (pred `:contactId`; VIEWER ali arhivirana → »Te strani ni«), meni *Uvozi* v `ContactToolbar.tsx` (samo EDITOR+, nearhivirana); testi `ImportPage.test.tsx` (MSW: scenariji 1–7, 10, 11; napaka strežnika in brez povezave (»Ni povezave.«) → *Poskusi znova* in predogled ostane; obvestilo »uvozi se samo prvi list«; datoteka nad 10 MB zavrnjena že v brskalniku; »Uvoženih kontaktov: N. Preskočenih dvojnikov: M.«; axe), `mapping.test.ts`, `ContactPermissions.test.tsx` (akcije ni za VIEWER in arhivirano); pomočnik imen v `frontend/src/test/`
- [x] T012 [US1] FR-014-02 FR-014-05 FR-014-09 — E2E `e2e/tests/uvoz-izvoz.spec.ts`: izvoz 010 → uvoz v drugo skupino (krožna pot, vrednosti `=`/`+`), ponoven uvoz → vse *Preskoči*, sled *Uvoz*; pomočniki v `e2e/tests/support/importExport.ts` (ustvarjanje `.xlsx` prek obstoječega `support/xlsx.ts`)

**Checkpoint**: US1 deluje od datoteke do sledi; `./verify.sh quick` zelen.

## Phase 4: User Story 2 – Izvoz in uvoz vizitk vCard (P1)

**Goal**: `.vcf` izvoz izbora in enega kontakta; uvoz `.vcf` prek istega predogleda.

**Independent Test**: 3 kontakti → `.vcf` → uvoz v prazno skupino → enaki.

- [x] T013 [US2] FR-014-10 FR-014-11 — Izvoz: `backend/src/main/java/si/contactmanager/contact/vcard/VcardExportController.java` (`POST …/contacts/export/vcard` z `ExportRequestParser` + `ExportService.prepare`, `GET …/contacts/{contactId}/vcard`); IT `VcardExportIT` (vrstni red seznama, izpuščeni, `EXPORT_EMPTY`, meja, `404` tuj id, glave, UTF-8) in `VcardExportIsolationIT` (401, 404 nečlan/tuj kontakt, 200 VIEWER…OWNER tudi v arhivirani)
- [x] T014 [US2] FR-014-08 FR-014-12 FR-014-13 — Uvoz `.vcf`: `format=VCF` v `ImportController`/`ImportService` (`VcardReader`, jezik imen atributov, `NOT_VCF`, > 10 000 vizitk → 400, `omitted`); IT `VcardImportIT` (40 vizitk 2.1/3.0/4.0 z dvema napakama → 38 pripravljenih; krožna pot izvoz → uvoz enako v vseh poljih, atributih in značkah – FR-014-12, SC-003)
- [x] T015 [P] [US2] FR-014-10 FR-014-13 — Frontend: *Izvozi v vCard (.vcf)* v `frontend/src/features/contacts/selection/SelectionActionBar.tsx`, *Prenesi vizitko (.vcf)* v `ContactView.tsx`, `export/api.ts` in `export/exportFileName.ts` (`.vcf`, pravilo FR-010-10), izbira *Iz vizitk (.vcf)* v uvozu (brez koraka preslikave, predogled kaže imena in atribute iz vizitke ter obvestilo o izpuščeni fotografiji); testi `ExportButton.test.tsx`/`SelectionActionBar.test.tsx`, `ContactView.test.tsx`, `exportFileName.test.ts`, `ImportPage.test.tsx` (vcf)
- [x] T016 [US2] FR-014-10 FR-014-12 — E2E v `e2e/tests/uvoz-izvoz.spec.ts`: izbor 3 kontaktov → prenos `.vcf` → uvoz v drugo skupino → primerjava; prenos vizitke enega kontakta (ime datoteke)

## Phase 5: User Story 3 – Deljenje kontakta s kodo QR (P2)

**Goal**: okno s kodo QR celotne vizitke, prenos PNG, izpuščanje polj po prednosti.

**Independent Test**: koda kontakta se prebere kot vizitka (polyfill v testu, telefon ročno – quickstart).

- [x] T017 [US3] FR-014-14 FR-014-15 FR-014-16 — `frontend/src/features/contacts/qr/qrFit.ts` (različica ≤ 25, popravljanje `M`, izpuščanje atributi → značke → naslov, seznam vključenih/izpuščenih), `QrShareDialog.tsx` (design.md 8.10, opozorilo o vidnosti, `role="img"` z alternativo, *Prenesi sliko* `‹ime-priimek›-qr.png`, *Prenesi vizitko (.vcf)* pri izpuščenih, *Zapri*), gumb *Deli s kodo QR* v `ContactView.tsx` (VIEWER, tudi arhivirana, deluje brez povezave); testi `qrFit.test.ts` (30 značk + dolg naslov → »Ni vključeno: značke.«; obvezna polja vedno), `QrShareDialog.test.tsx` (vsebina kode se prebere nazaj z `vcardRead`, tipkovnica, axe)

## Phase 6: User Story 4 – Dodajanje kontakta s skeniranjem kode QR (P2)

**Goal**: kamera ali slika → predizpolnjen obrazec novega kontakta; slika ne zapusti naprave.

**Independent Test**: PNG iz US3 naložen v *Dodaj s kodo QR* v drugi skupini → predizpolnjen obrazec → shrani.

- [x] T018 [US4] FR-014-17 FR-014-19 FR-014-20 — `frontend/src/features/contacts/qr/scanner.ts` (izvorni `BarcodeDetector` ali leno naložen ponyfill z lokalnim `zxing_reader.wasm` prek `setZXingModuleOverrides`/`?url`; kamera ob dotiku, `playsinline muted`, zanka `detect`, `stop()` vseh sledi ob kodi, zaprtju, odhodu), `QrScanDialog.tsx` (navodilo, kamera ni na voljo → *Izberi sliko*, PNG/JPEG ≤ 10 MB, »Na sliki ni kode QR s kontaktom.«, »več kod«), gumb *Dodaj s kodo QR* v `ContactToolbar.tsx` (EDITOR+, nearhivirana); testi `scanner.test.ts` in `QrScanDialog.test.tsx` (lažni `BarcodeDetector` in `getUserMedia`: zavrnjen dostop, slika brez kode, URL namesto kontakta, ustavitev sledi ob zaprtju in razmontiranju, ni klicev `fetch` s sliko; axe)
- [x] T019 [US4] FR-014-18 — Predizpolnitev: `frontend/src/features/contacts/ContactFormPage.tsx`/`ContactForm.tsx` sprejmeta začetne vrednosti iz stanja usmerjevalnika (kandidat iz `vcardRead`/`mecard`), neveljavne vrednosti z napako ob polju, država prek `countries.ts` (natančno → izbrana, sicer predlog); shranjevanje po 004 (`POST …/contacts`, sled CREATE); test `ContactForm.test.tsx` (predizpolnjeno, neveljaven telefon, neprepoznana država, VIEWER ne vidi akcije)
- [x] T020 [US3] [US4] FR-014-15 FR-014-18 — E2E v `e2e/tests/uvoz-izvoz.spec.ts`: *Deli s kodo QR* → *Prenesi sliko* → v drugi skupini *Dodaj s kodo QR* → *Izberi sliko* (prenesen PNG) → predizpolnjen obrazec → shrani; kamera v E2E zavrnjena (brez dovoljenja) → prikaže se izbira slike

## Phase 7: User Story 5 – Sinhronizacija prek CardDAV (P3)

**Goal**: gesla za aplikacijo v *Mojem računu*; strežnik CardDAV samo za branje za vse skupine uporabnika.

**Independent Test**: geslo → PROPFIND/REPORT vidi natanko skupine uporabnika; sprememba v aplikaciji v `sync-collection`; preklic → 401.

- [x] T021 [US5] FR-014-21 FR-014-25 — `backend/src/main/java/si/contactmanager/apppassword/` (`AppPasswordGenerator` 28 znakov base32/140 bit, `AppPasswordRepository`, `AppPasswordService` – meja 10 pod zaklepom `app_user` → `409 APP_PASSWORD_LIMIT`, SHA-256, preklic = izbris, `AppPasswordController` za `/api/me/app-passwords`), `AppPasswordLimitException` + preslikava v `ApiExceptionHandler`; `ExportAssembler`/`MyData` (`appPasswords`); IT `AppPasswordIT` (geslo samo v odgovoru POST, seznam brez gesla in hash, ime 0/51 znakov → 400, 11. → 409, tuj id → 404, 401 brez žetona, izvoz »moji podatki« vsebuje imena in čase, izbris računa izbriše gesla); unit `AppPasswordGeneratorTest` (dolžina, abeceda, normalizacija)
- [x] T022 [US5] FR-014-22 FR-014-26 — Prijava: `backend/src/main/java/si/contactmanager/shared/security/DavSecurityConfig.java` (`@Order(1)`, `securityMatcher`, stateless, CSRF off, Basic z `AppPasswordAuthenticationProvider`, `WWW-Authenticate`, `/.well-known/carddav` brez prijave, `WebSecurityCustomizer` s `StrictHttpFirewall` za metode WebDAV), `apppassword/DavLoginLock.java` (`dav_login_state`, 10/15 min, uspeh ponastavi), posodobitev `last_used_at` največ 1×/min; IT `DavAuthIT` (brez gesla, napačno, preklicano, geslo izbrisanega računa → 401; Firebase JWT na `/dav` → 401; Basic na `/api` → 401; 10 neuspehov → 11. s pravim geslom 401, po 15 min (nastavljiva ura) 207; spletna prijava med zaklepom deluje)
- [x] T023 [US5] FR-014-22 FR-014-23 FR-014-24 FR-014-27 — `backend/src/main/java/si/contactmanager/carddav/` (`DavController` za vse metode, `DavXml` – varen DOM brez DTD/XXE, telo ≤ 1 MB, pisalnik 207, `DavResources` – principal, dom, imeniki po članstvu tudi arhivirani, vizitke prek `VcardWriter` v jeziku uporabnika, `SyncTokens` – jezik + `audit_head.last_seq`, `getctag` z verzijo skupine, spremembe iz `audit_change`, izbrisani kot 404, neveljaven žeton → 403); IT `CardDavIT` (OPTIONS, PROPFIND 0/1 po verigi principal → dom → imenik, `Depth: infinity` → 403, `addressbook-multiget`, `addressbook-query`, `sync-collection` po dodajanju/urejanju/izbrisu/rollbacku vrne samo spremembe, GET z `ETag` in `304`, sprememba naslova skupine spremeni `getctag`, sprememba jezika uporabnika spremeni ETag in razveljavi žeton, branje ne ustvari vnosa sledi) in `CardDavIsolationIT` (401 brez gesla; 404 tuja in neobstoječa skupina/kontakt in skupina po odstranitvi iz članstva; 403 za PUT/DELETE/PROPPATCH/MKCOL/MOVE/COPY/LOCK/POST pri vseh vlogah in nič se ne spremeni; 207 VIEWER…OWNER tudi arhivirana)
- [x] T024 [P] [US5] FR-014-21 FR-014-25 FR-014-27 — `frontend/src/features/account/` (`AppPasswordsSection.tsx` – seznam z imenom, nastankom, »še ni uporabljeno«; `CreateAppPasswordDialog.tsx` – geslo enkrat, naslov strežnika `origin/dav/`, uporabniško ime, *Kopiraj*; `RevokeAppPasswordDialog.tsx` – potrditev feature-map §2.8; `CardDavHelp.tsx` – naslov strežnika, uporabniško ime, opomba, da je potreben HTTPS; `api.ts`, `types.ts`), vključitev v `AccountPage.tsx`; testi `AppPasswordsSection.test.tsx` (ustvarjanje, geslo izgine po zaprtju, `APP_PASSWORD_LIMIT` sporočilo, preklic s potrditvijo, napaka strežnika vidna, axe)
- [x] T025 [US5] FR-014-21 FR-014-25 — E2E v `e2e/tests/uvoz-izvoz.spec.ts`: ustvari geslo → `PROPFIND` z `request` (Playwright) na `/dav/addressbooks/` vrne 207 z imeni skupin → preklic v vmesniku → 401; pomočnik v `e2e/tests/support/importExport.ts`

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T026 — `.specify/memory/feature-map.md` (v fazi PR): §2.4 dovoljeno v arhivirani skupini (izvoz vCard, koda QR, branje CardDAV), §2.7 vrsta vnosa *Uvoz*, §2.10 `APP_PASSWORD_LIMIT`, §1 vrstica funkcionalnosti 014; nov tip klicatelja (CardDAV, gesla za aplikacijo) v §2.2 kot opomba o vrstnem redu 401 → 404 → 403
- [ ] T027 — `./verify.sh quick` zelen; `./verify.sh backend` zaradi migracije, IT in CardDAV; `e2e` v CI

## Dependencies & Execution Order

- Setup (T001–T004) → Foundational (T005–T007) → US1 (T008–T012) → US2 (T013–T016; uporabi T005 in uvoz iz US1) → US3 (T017; uporabi T006) → US4 (T018–T020; uporabi T006) → US5 (T021–T025; uporabi T005) → Polish.
- [P]: T003 ∥ T004; T006 ∥ T005; frontend T011, T015, T024 ∥ zaledje iste zgodbe (pogodba v contracts/).
- `/speckit-implement` teče **enkrat** čez celo datoteko, nato `/speckit-converge`, en svetovalni pregled `pregled-testov` in PR (konstitucija §2.3).

## Implementation Strategy

- MVP: US1 (uvoz Excel) – samostojna vrednost. Nato US2 (vCard, temelj US3–US5), US3+US4 (QR), na koncu US5 (tvegan, nov tip klicatelja). En PR za vso 014 (odločitev razvijalca).

## Notes

- Asercije se ne oslabijo; spremenjeni obstoječi testi (npr. seznam `AUDIT_ACTIONS`, izvozni testi) z razlogom v opisu PR.
- Utišanja samo s `utišanje: <razlog>`; barve kode QR samo iz žetonov.
- `./verify.sh quick` pred zaključkom vsake zgodbe.
