---

description: "Tasks for 009-mnozicno-urejanje (tests mandatory, independent test review)"
---

# Tasks: Izbor in množično urejanje kontaktov

**Input**: `specs/009-mnozicno-urejanje/` – spec.md (Clarify 2026-11-12), plan.md (*Public Interfaces*), research.md (R-01 … R-15), data-model.md, contracts/openapi.yaml, quickstart.md; odločitvi D-72, D-73

**Tests**: obvezni (konstitucija II). Vsak FR-009-01 … FR-009-18 in vsako merilo SC-001 … SC-005 ima vsaj eno testno nalogo. Testi pred kodo, nato pregled neodvisnega agenta `pregled-testov` (workflow.md §4.2), testi v ločenem commitu `test(009)`.

**Organization**: Setup → Foundational → Tests → Test review → Implementation core → US1 … US5 → Polish → Converge.

**Uporabniške zgodbe**: US1 izbor čez strani in »vsi zadetki« (FR-009-01 … 05) · US2 množično urejanje značk in atributov (FR-009-06, 07, 08, 12, 17) · US3 atomarnost in spremenjen izbor (FR-009-09, 10, 11, 16, 18) · US4 množični izbris (FR-009-13) · US5 revizijska sled in arhivirana skupina (FR-009-14, 15).

## Format: `[ID] [P?] [Story] FR-IDs Description (odvisnosti)`

- Imena endpointov, poti in dostopnih imen so **samo** iz plan.md (*Public Interfaces*); oblike zahtevkov in odgovorov iz contracts/openapi.yaml; pravila polj iz data-model.md.
- Testi nosijo FR-ID (`@Tag("FR-009-03")`; Vitest/Playwright v imenu testa `"FR-009-03: …"`). Testi so napisani iz spec/plan/contracts, **ne** iz izvedbe.
- Vrstni red preverjanj (R-02): 401 → 404 (nečlan, neobstoječa skupina, identiteta, ki nikoli ni bila kontakt te skupine) → 403 → 409 `GROUP_ARCHIVED` → 400 `VALIDATION_FAILED` (zahtevek, nato `contacts`) → 409 `SELECTION_CHANGED`.
- »Nič se ne spremeni« se v testih vedno preveri z: enake verzije vseh izbranih kontaktov, enake vrednosti, enako število vnosov revizijske sledi skupine.
- **Brez migracije**; `V1`–`V8` se ne spreminjajo. Obstoječi sprejeti testi 000–008 se ne spreminjajo; vsaka nujna sprememba: workflow §2.2 + vnos v `DECISIONS.md` (`sprememba-testa`).
- `design.md` se ne spreminja (D-72 je za razvijalca); izvoz (*Izvozi v Excel*) je v lasti 010 in se v 009 ne izriše (FR-009-05).
- Števila v besedilih imajo slovnične oblike (FR-009-05, FR-009-12, FR-009-13; plan.md); uskladitve po `/speckit-analyze`: D-73.
- Brez `git push --force`, brez merge.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] FR-009-01 … FR-009-18 i18n ključi v frontend/src/i18n/sl.json in en.json pod `contacts.selection.*` in `contacts.bulk.*` za **vsa** besedila in dostopna imena iz plan.md (*Key elements and accessible names*), z i18next množinami (sl `one`/`two`/`few`/`other`, en `one`/`other`): »Izbran: 1«/»Izbrana: 2«/»Izbrani: 3«/»Izbranih: 5« (en »1 selected«/»5 selected«), »Izberi vse zadetke ({{count}})«, »Uredi izbrane kontakte ({{count}})«, »Uporabi za N kontaktov«, »Izbrišem N kontaktov?«, »Izbriši N kontaktov«, »Posodobljenih N kontaktov.«, »Izbrisanih N kontaktov.«, »N izbrana kontakta ne obstajata več.«, deli obvestila »Izbor se je spremenil: …« (novi zadetki, ne ustreza več filtrom, ne obstaja več), meja »Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.«, napake po kodah polj (`REQUIRED`, `TOO_LONG`, `TOO_MANY`, `INVALID_VALUE`, `DUPLICATE`, `RESERVED_KEY`, `EMPTY_OPERATION`) in po kontaktih (preveč značk, preveč dodatnih atributov, »… in še N«), napake 403/409/omrežje iz plan.md. Test `frontend/src/i18n/language.test.ts` (obstoječi) ostane zelen (enaki ključi v sl in en).
- [X] T002 [P] FR-009-03 … FR-009-18 Podpora BE testom: backend/src/test/java/si/contactmanager/contact/support/BulkApiTest.java (razširi `ContactApiTest`): pomočniki `contactIds(token, group, params)`, `selectionCheck(token, group, json)`, `bulkUpdate(token, group, json)`, `bulkDelete(token, group, json)`; `snapshot(group)` (verzije, vrednosti, značke, atributi vseh kontaktov skupine + število vnosov `audit_entry` skupine) in `assertUnchanged(before, after)`; v ContactFixtures.java dodaj `insertManyWithTagsAndAttributes(group, userId, count, tags, attributes)` (paketno, za 10 000) in `deleteAsAudited(group, userId, contactId)` (izbris z vnosom sledi `DELETE`, kot bi ga naredil 004). Obstoječi pomočniki ostanejo nespremenjeni.
- [X] T003 [P] FR-009-01 … FR-009-18 Podpora FE testom: frontend/src/test/contactsApi.ts – `mockContactsApi` dobi rokovalnike `GET …/contact-ids` (`contactIdsReply(ids, total?)`), `POST …/contacts/selection-check` (`selectionCheckReply({missing, queries})`), `POST …/contacts/bulk-update` (`bulkUpdateReply(changed)`), `POST …/contacts/bulk-delete` (`bulkDeleteReply(deleted)`) z beleženjem telesa zahtevka (`recordedBodies(path)`), napake `bulkValidationReply(errors, contacts)`, `selectionChangedReply(missing)`, `archivedReply()`, `forbiddenReply()`, `'network-error'`; frontend/src/test/msw.ts privzeti rokovalniki (kot D-40).
- [X] T004 [P] FR-009-01 … FR-009-18 Podpora E2E: e2e/tests/support/contacts.ts – `createTaggedContacts(groupId, count, tag)` (SQL, paketno), `createContactWithTags(groupId, name, tags[])` (npr. »Mojca Kralj« s 30 značkami), `tagsOf(contactId)`, `attributesOf(contactId)`, `addTagInDb(contactId, tag)`; e2e/tests/support/audit.ts – `auditEntryCount(groupId)`, `lastAuditEntry(groupId)` (vrsta, število kontaktov).

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [X] T005 FR-009-03 … FR-009-18 Ogrodje BE (odvisnost: T002): backend/src/main/java/si/contactmanager/contact/BulkController.java – štirje endpointi iz plan.md (`GET /api/groups/{groupId}/contact-ids`, `POST …/contacts/selection-check`, `…/contacts/bulk-update`, `…/contacts/bulk-delete`) z obstoječim `access.require(jwt, groupId, Role.VIEWER, false)` (401/404 delujeta) in nato `501`; nepremenljivi zapisi `BulkEditInput` (`contactIds`, `addTags`, `removeTags`, `attributes` z `AttributeSet(field, key, value)`, `field` ∈ {ADDRESS, EMAIL, PHONE, CUSTOM}), `BulkTarget`, `SelectionCheck` (zahtevek in `Result(changed, missing, queries[newMatches, noLongerMatching])`) po data-model.md; `BulkEdit.apply(ContactState, BulkEditInput)` in `BulkInputParser.parseUpdate/parseDelete/parseCheck` vržeta `UnsupportedOperationException`; backend/src/main/java/si/contactmanager/shared/error/ `BulkValidationError` (`code`, `errors`, `contacts[{contactId, displayName, errors}]`), `BulkValidationException`, `SelectionChangedException(missing)` – brez rokovalnikov (implementacija T033).
- [X] T006 [P] FR-009-01 … FR-009-18 Ogrodje FE v frontend/src/features/contacts/selection/ (odvisnost: T003): `selection.ts` (tip `Selection` po data-model.md – `groupId`, `ids`, `queries[{params, added, deselected}]`; funkcije `toggle`, `setPage`, `addMatches`, `applyCheck`, `removeMissing`, `clear`, `pageState` vržejo `Error('not implemented')`), `SelectionProvider.tsx` in `useSelection()` (prazen izbor, operacije ne naredijo nič), prazne komponente `SelectionActionBar.tsx`, `SelectAllOnPage.tsx`, `SelectContact.tsx`, `BulkEditDialog.tsx`, `BulkDeleteDialog.tsx`, `SelectionChangedNotice.tsx`, `useSelectionCheck.ts`, `api.ts` (`contactIds`, `selectionCheck`, `bulkUpdate`, `bulkDelete` vržejo `Error('not implemented')`), tipi v `types.ts`.
- [X] T007 FR-009-01 … FR-009-18 Preverjanje združljivosti 000–008 z ogrodjem (odvisnost: T005, T006): `./verify.sh quick` zelen brez sprememb obstoječih testov; integracijski testi paketov `contact`, `audit`, `group`, `member` zeleni; `git diff main -- backend/src/main/resources/db/migration` prazen.

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja (`501`, `UnsupportedOperationException`, `not implemented`); testi 000–008 so zeleni.

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje – unit (brez baze)

- [X] T008 [P] [US2] [US3] FR-009-07 FR-009-08 FR-009-09 backend/src/test/java/si/contactmanager/contact/BulkEditTest.java (odvisnost: T005; **pričakovana stanja so dobesedno zapisana v testu**): značke – dodajanje `vip` kontaktu z `VIP` ne spremeni nič (ostane `VIP`, `changed=false`); nova značka gre na konec v zapisu iz zahtevka; odstranitev manjkajoče značke ni sprememba; vrstni red »odstrani → dodaj → atributi«: kontakt z značkami `[a, c]`, zahtevek odstrani `a` in doda `b` → `[c, b]`; kontakt s 30 značkami, zahtevek odstrani eno in doda eno → veljavno (30, ker se odstranitev uporabi prej); atributi – obstoječ ključ `Podjetje` + zahtevek `podjetje=FERI` → vrednost `FERI`, zapis ključa `podjetje`, isti položaj; nov ključ na konec; prazna vrednost odstrani in strne položaje; `address`/`email`/`phone` neprazna vrednost nastavi, prazna izprazni (`null`); `changed` je `false`, ko je vsebina enaka (metapodatki se ne primerjajo); končno stanje z 31 značkami ali 51 atributi da napako po kontaktu (`tags`/`attributes` `TOO_MANY`), 30 oziroma 50 ne.
- [X] T009 [P] [US2] [US3] FR-009-04 FR-009-06 FR-009-07 FR-009-08 FR-009-09 backend/src/test/java/si/contactmanager/contact/BulkInputParserTest.java (odvisnost: T005; tabela dobesednih primerov po research R-05): `contactIds` manjka/prazen → `REQUIRED`; 10 001 različnih → `TOO_MANY`; 10 000 → veljavno; podvojene se zlijejo (10 001 z enim podvojenim = 10 000 → veljavno); ne-UUID → `contactIds[i]` `INVALID_VALUE`; `addTags`/`removeTags` > 30 → `TOO_MANY`; značka s presledkom → `INVALID_VALUE`, 51 znakov → `TOO_LONG`, prazna → `REQUIRED`; ista značka (ne glede na velikost črk) v `addTags` in `removeTags` → `removeTags[i]` `DUPLICATE`; `attributes` > 10 → `TOO_MANY`; `field` `firstName`, `lastName`, `foo` → `attributes[i].field` `INVALID_VALUE`; `custom` brez ključa → `attributes[i].key` `REQUIRED`, ključ 51 znakov → `TOO_LONG`, ključ »E-naslov«/»email«/»Telefon« → `RESERVED_KEY`; `key` pri `address`/`email`/`phone` → `attributes[i].key` `INVALID_VALUE` (D-75); isti ključ ali polje dvakrat → `DUPLICATE`; `email` = `ni-veljaven` → `attributes[i].value` `INVALID_VALUE`; telefon s črkami → `INVALID_VALUE`; naslov 301 znak → `TOO_LONG`; dodatna vrednost 501 → `TOO_LONG`; vrednost samo presledki = prazna (veljavno: odstrani); brez vseh treh operacij → `body` `EMPTY_OPERATION`; neznano polje → `UNKNOWN_FIELD`; ne-JSON → `body` `MALFORMED`; `parseCheck`: 21 poizvedb → `queries` `TOO_MANY`, vsota `queries[].contactIds` 10 001 ali vsota `queries[].excludedIds` 10 001 → `queries` `TOO_MANY`, 10 000 → veljavno, `queries[0].f[0]` z napako 008 → polje s predpono `queries[0].`; parser nikoli ne vrže.

### Zaledje – integracijski, varnostni (Testcontainers `postgres:18-alpine` + Firebase Auth Emulator)

- [X] T010 [P] [US1] FR-009-03 FR-009-04 backend/src/test/java/si/contactmanager/contact/ContactIdsIT.java (odvisnost: T002): skupina s 312 kontakti z značko `konferenca2025` in 20 brez → `GET …/contact-ids?tag=konferenca2025` vrne `total` 312, `truncated` false in **točno** teh 312 identitet (množica, brez podvojenih); `q` in `f` z istim pomenom kot 008 (en primer vsakega); skupina z 10 001 zadetkom → `total` 10001, `truncated` true, `ids` prazen; 10 000 → vse identitete; neveljaven `f=x.neobstaja:a` → `400` `f[0]` `UNKNOWN_FIELD`; kontakti druge skupine nikoli v `ids`; arhivirana skupina, vse vloge → `200`, enak odgovor.
- [X] T011 [P] [US3] FR-009-18 backend/src/test/java/si/contactmanager/contact/SelectionCheckIT.java (odvisnost: T002): izbor 12 zadetkov poizvedbe `tag=konferenca2025`; nato drug urednik doda značko dvema neizbranima, enemu izbranemu jo odstrani, tretjega izbriše (prek API 004 – vnos v sledi) → odgovor `changed` true, `missing` = [izbrisani], `queries[0].newMatches` = [2 nova], `noLongerMatching` = [neustrezni]; ročno odznačen kontakt v `excludedIds` se ne javi med `newMatches`; sprememba telefona izbranega kontakta pri poizvedbi `q=Novak` → `changed` false; ročno izbran kontakt (ni v nobeni poizvedbi), ki ne ustreza filtrom, se ne javi; neveljavna poizvedba `queries[0].f[0]` → `400`; endpoint ne spremeni ničesar (`assertUnchanged`); arhivirana skupina, VIEWER → `200`.
- [X] T012 [P] [US2] FR-009-06 FR-009-07 FR-009-08 FR-009-12 FR-009-16 backend/src/test/java/si/contactmanager/contact/BulkUpdateIT.java (odvisnost: T002): 12 kontaktov, 2 že imata `konferenca2025` in nimata `staro` → `addTags [konferenca2025]`, `removeTags [staro]` → `200 {changed: 10}`; vseh 12 ima `konferenca2025`, nobeden `staro`; 10 spremenjenim se verzija poveča za 1, `updated_by` = izvajalec, `updated_at` nov, oznaka *Povrnjeno* (`reverted_entry_id`) odstranjena; 2 nespremenjenima ostane verzija; `custom podjetje=FERI` prepiše obstoječi `Podjetje` (ključ v zapisu iz zahtevka); prazna vrednost odstrani atribut samo tam, kjer obstaja; `phone = "01 234 56 78"` nastavi vsem; `email` prazno izprazni; operacija brez dejanske spremembe → `{changed: 0}`; podvojena identiteta v `contactIds` se šteje enkrat; shranjevanje posameznega kontakta (PUT 004) s staro verzijo po množični operaciji → `409 VERSION_CONFLICT`.
- [X] T013 [P] [US3] FR-009-04 FR-009-09 FR-009-17 backend/src/test/java/si/contactmanager/contact/BulkUpdateValidationIT.java (odvisnost: T002): 5 kontaktov, »Mojca Kralj« s 30 značkami → `addTags [nova]` → `400` z `contacts` = [{»Mojca Kralj«, `tags` `TOO_MANY`}] in nič se ne spremeni (`assertUnchanged`, tudi pri ostalih 4); 12 kontaktov s preveč značkami → vseh 12 v `contacts`, razvrščenih po slovenski abecedi; 50 atributov + nov ključ → `attributes` `TOO_MANY`; `email = ni-veljaven` → `400` `attributes[0].value` `INVALID_VALUE`, `contacts` odsoten, nič se ne spremeni; `field: firstName` → `INVALID_VALUE`; prazen izbor in 10 001 identitet → `400`; vsaka zavrnitev: brez novega vnosa sledi (SC-003).
- [X] T014 [P] [US4] FR-009-13 backend/src/test/java/si/contactmanager/contact/BulkDeleteIT.java (odvisnost: T002): izbriše 3 izbrane kontakte (z atributi in značkami – otroci izbrisani), ostali kontakti skupine nespremenjeni → `200 {deleted: 3}`; podvojena identiteta se šteje enkrat; prazen izbor → `400`; izbrisani kontakt je mogoče obnoviti z rollbackom 005 na vnos tik pred izbrisom (isti id in podatki).
- [X] T015 [P] [US3] FR-009-10 FR-009-11 backend/src/test/java/si/contactmanager/contact/BulkSelectionChangedIT.java (odvisnost: T002): 8 izbranih, 2 medtem izbrisana prek API 004 → `bulk-update` in `bulk-delete` vrneta `409 {code: SELECTION_CHANGED, missing: [2]}`, nič se ne spremeni; ponovitev za 6 → `200`; identiteta kontakta skupine B v zahtevku skupine A → `404`, v nobeni skupini se nič ne spremeni; izmišljen UUID → `404`; kontakt, odstranjen z rollbackom 005 → `409 SELECTION_CHANGED`; vrstni red: zahtevek s kršitvijo slovarja **in** izbrisanim kontaktom → `400` (korak 6 pred 7).
- [X] T016 [P] [US5] FR-009-14 backend/src/test/java/si/contactmanager/contact/BulkAuditIT.java (odvisnost: T002; SC-004): množično urejanje, ki spremeni 10 od 12 → natanko **en** nov vnos `UPDATE` z `contact_count` 10, za vsakega od 10 `before`/`after`, nespremenjena 2 nista v vnosu; izvajalec in čas; `GET` sledi 005 vrne vnos »uredil(a) 10 kontaktov«; operacija brez sprememb → brez vnosa; množični izbris 3 → en vnos `DELETE` s `before` vseh 3 in brez `after`; rollback 005 na vnos tik pred množičnim urejanjem povrne vseh 10.
- [X] T017 [P] [US3] FR-009-16 backend/src/test/java/si/contactmanager/contact/BulkConcurrencyIT.java (odvisnost: T002): dve hkratni množični operaciji (dodaj `a`, dodaj `b`) nad prekrivajočima izboroma 500 kontaktov iz dveh niti → obe `200`, vsi prekrivajoči kontakti imajo `a` in `b`, verzija +2, dva vnosa sledi, brez zastoja (deadlock) v 20 ponovitvah; množična operacija in sočasno arhiviranje skupine → bodisi operacija uspe pred arhiviranjem bodisi `409 GROUP_ARCHIVED` in nič se ne spremeni; množično urejanje in sočasen PUT 004 istega kontakta s pravilno verzijo → eden od njiju je zaporedno drugi (PUT po urejanju dobi `409 VERSION_CONFLICT` ali urejanje vidi stanje po PUT).
- [X] T018 [P] [US5] FR-009-15 backend/src/test/java/si/contactmanager/contact/BulkArchivedIT.java (odvisnost: T002): arhivirana in trajno arhivirana skupina: EDITOR, ADMIN, OWNER → `bulk-update` in `bulk-delete` `409 {code: GROUP_ARCHIVED}`, nič se ne spremeni; VIEWER → `403`; `contact-ids` in `selection-check` → `200` za vse vloge.
- [X] T019 [P] [US2] SC-002 FR-009-04 backend/src/test/java/si/contactmanager/contact/BulkPerformanceIT.java (odvisnost: T002; R-07): skupina z 10 000 kontakti (vsak 3 značke, 3 atributi, `insertManyWithTagsAndAttributes`), 2 ogrevalni + 20 merjenih operacij `bulk-update` nad vsemi 10 000 (izmenično dodaj in odstrani značko `meritev`) → p95 po najbližjem rangu < 15 000 ms; nato 5 merjenih **zavrnitev** nad istimi 10 000 (en kontakt ima 30 značk, zahtevek doda novo → `400` z enim kontaktom v `contacts`, nič spremenjeno) → vsaka < 15 000 ms (SC-002: »uspeh ali zavrnitev«); na koncu en `bulk-delete` 10 000 < 15 000 ms; izpiše p50/p95/največ (za `traceability.md`, *Meritve*).
- [X] T020 [P] [US1] [US3] [US5] FR-009-03 FR-009-11 FR-009-15 FR-009-18 backend/src/test/java/si/contactmanager/contact/BulkIsolationMatrixSecurityIT.java (odvisnost: T002; parametriziran, workflow.md §2.5): vsi štirje endpointi × {brez žetona, neveljaven, potekel → `401 UNAUTHENTICATED`; nečlan obstoječe skupine in neobstoječa skupina → `404` prazno telo; VIEWER → `bulk-update`/`bulk-delete` `403 FORBIDDEN`, branje `200`; EDITOR, ADMIN, OWNER → `200`; arhivirana: pisanje `409 GROUP_ARCHIVED` (EDITOR+), `403` (VIEWER), branje `200`}; član A z identiteto kontakta B v telesu → `404` za vse vloge (tudi VIEWER – korak 2 pred 3) na `selection-check`, `bulk-update`, `bulk-delete`; po vsakem neuspehu nič spremenjeno v A in B.
- [X] T021 [P] [US2] FR-009-06 backend/src/test/java/si/contactmanager/contact/BulkLogIT.java (odvisnost: T002; R-15, konstitucija VI): z zajemom dnevnika aplikacije med `bulk-update` (uspeh in `400`) z značko `zelo-posebna-znacka-123` in vrednostjo `zelo-posebna-vrednost-456` izpis ne vsebuje nobenega od nizov.

### Vmesnik – funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel z imeni iz plan.md)

- [X] T022 [P] [US1] [US3] FR-009-01 FR-009-02 FR-009-04 FR-009-18 frontend/src/features/contacts/selection/selection.test.ts (odvisnost: T006; dobesedni primeri): `toggle` doda/odstrani; odznačitev kontakta iz `added` poizvedbe ga doda v njen `deselected`; `setPage` izbere vse na strani in odznači; `pageState` → `checked` / `mixed` / `unchecked`; `addMatches` z unijo (800 izbranih + 1500 zadetkov, 300 že izbranih → 2000); unija 10 001 → `limit`, stanje nespremenjeno; ročni `toggle` 10 001. kontakta → `limit`; `applyCheck` (odstrani `missing`, doda `newMatches`, odstrani `noLongerMatching` samo ob zastavici; preseganje 10 000 → `limit`, nespremenjeno); `removeMissing`; `clear`; **omejitve poizvedb (R-10, D-73)**: drugi »vse zadetke« z enakimi `params` se zlije (ena poizvedba); nova poizvedba prevzame skupne kontakte (identiteta v `added`/`deselected` največ ene poizvedbe); 21. poizvedba pozabi najstarejšo, njeni kontakti ostanejo v `ids`; 10 001. odznačen kontakt pozabi najstarejšo poizvedbo; za vsako zaporedje operacij je vsota `added` ≤ 10 000 in vsota `deselected` ≤ 10 000 (lastnost preverjena na naključnih zaporedjih z določenim semenom).
- [X] T023 [P] [US1] FR-009-01 FR-009-02 frontend/src/features/contacts/selection/ContactSelection.test.tsx (odvisnost: T003; `renderContactsApp('/groups/<id>/contacts')`): `checkbox` »Izberi Janez Novak« → obkljukan, `toolbar` »Dejanja izbora« s `status` »Izbran: 1«; `checkbox` »Izberi vse na strani« (25 kontaktov) → 25 izbranih, ponovno → 0; 10 od 25 → glava `mixed` (`toBePartiallyChecked`), klik → 25; izbor 3 na strani 1, stran 2 + 2, sprememba iskanja, filtra (oznaka) in razvrstitve → »Izbranih: 5«, ob vrnitvi na stran 1 so trije še obkljukani; odprtje kontakta in *Nazaj na seznam* ohrani izbor; prehod v drugo skupino ga izprazni; ponoven izris aplikacije (nov `renderContactsApp` na isti poti, kot osvežitev strani) → izbor prazen in naslov poti brez izbora; z izborom ni povezave »Nov kontakt« (namesto nje `toolbar`); *Počisti izbor* → ni `toolbar`, povezava »Nov kontakt« (urednik) je spet vidna, fokus na »Izberi vse na strani«; axe brez kršitev pri obkljukanih poljih; pri 320 px (viewport) polje izbire v glavi kartice (postavitev v jsdom ni preverljiva, ker nima CSS: pokrito v E2E T028, korak 5).
- [X] T024 [P] [US1] [US5] FR-009-03 FR-009-04 FR-009-05 FR-009-15 frontend/src/features/contacts/selection/SelectionActionBar.test.tsx (odvisnost: T003): urednik, nearhivirana → v `toolbar` »Dejanja izbora« gumbi »Izberi vse zadetke (312)«, »Uredi izbrane«, »Izbriši«, »Počisti izbor« in **ni** »Izvozi v Excel« (010); bralec in vse vloge arhivirane skupine → samo »Izberi vse zadetke (N)«, »Počisti izbor« in `status`; *Izberi vse zadetke* pošlje `GET …/contact-ids` z istimi `q`/`f`/`tag` kot seznam in poveča »Izbranih: N«; odgovor `truncated` ali unija > 10 000 → `alert` »Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.«, število nespremenjeno; `status` je `aria-live="polite"`; axe.
- [X] T025 [P] [US2] [US3] FR-009-06 FR-009-07 FR-009-08 FR-009-09 FR-009-12 FR-009-17 frontend/src/features/contacts/selection/BulkEditDialog.test.tsx (odvisnost: T003): »Uredi izbrane« odpre `dialog` »Uredi izbrane kontakte (12)«; `combobox` »Dodaj značke« in »Odstrani značke«; `group` »Nastavi atribut« z »Atribut 1« (možnosti Naslov, E-naslov, Telefon, Dodatni atribut – **brez** Ime, Priimek), »Ključ 1« samo pri Dodatni atribut, »Vrednost 1«, »Dodaj atribut« do 10, »Odstrani atribut 1«; »Uporabi za 12 kontaktov« pošlje `selection-check` in nato `bulk-update` s telesom po contracts (`addTags`, `removeTags`, `attributes[{field: custom, key, value}]`); med pošiljanjem drug klik ne pošlje drugega zahtevka; uspeh `{changed: 10}` → dialog zaprt, toast »Posodobljenih 10 kontaktov.«, seznam ponovno naložen, izbor ostane 12; `{changed: 0}` → »Nobenega kontakta ni bilo treba spremeniti.«; sklanjatve 1/2/3/5; `400` z `contacts` (12 imen) → `alert` nad obrazcem s prvimi 10 imeni in »… in še 2« ter razlogom, dialog odprt, vnosi ohranjeni; `400` `attributes[0].value` `INVALID_VALUE` → napaka ob polju »Vrednost 1«; `403`, `409 GROUP_ARCHIVED`, omrežna napaka → `alert` brez tehničnih kod, dialog odprt; po zaprtju dialoga ob `403` (vloga znižana na bralca – MSW nato vrne skupino z vlogo VIEWER) in ob `409 GROUP_ARCHIVED` (skupina arhivirana) v `toolbar` »Dejanja izbora« **ni** več »Uredi izbrane« in »Izbriši«, izbor in »Izbranih: N« ostaneta, ob arhivirani je vidna pasica arhivirane skupine (003); 31. značka v »Dodaj značke« ali »Odstrani značke« se ne doda in prikaže se napaka polja (največ 30), »Dodaj atribut« po 10 vrsticah ni več na voljo; *Prekliči* in *Esc* zapreta brez zahtevka; axe.
- [X] T026 [P] [US4] FR-009-13 FR-009-17 frontend/src/features/contacts/selection/BulkDeleteDialog.test.tsx (odvisnost: T003): »Izbriši« odpre `alertdialog` »Izbrišem 3 kontakte?« z besedilom posledice iz plan.md, fokus na »Prekliči«; *Prekliči* in *Esc* → brez zahtevka, izbor ostane, fokus na »Izbriši«; »Izbriši 3 kontakte« → `selection-check`, nato `bulk-delete` z `contactIds` → toast »Izbrisani 3 kontakti.« (sklanjatve 1/2/5), izbor prazen, seznam ponovno naložen; napaka → `alert` v dialogu; axe.
- [X] T027 [P] [US3] FR-009-10 FR-009-18 frontend/src/features/contacts/selection/SelectionCheck.test.tsx (odvisnost: T003): izbor z »Izberi vse zadetke« in en ročno odznačen → telo `selection-check` vsebuje `queries[0]` z `tag`, `contactIds` in `excludedIds`; pri dveh poizvedbah s skupnim kontaktom je ta samo v novejši; po 21 različnih »vse zadetke« telo vsebuje 20 poizvedb; odgovor s spremembami → akcija se ne pošlje, `alert` »Izbor se je spremenil: 2 nova zadetka, 1 kontakt ne ustreza več filtrom, 1 kontakt ne obstaja več.«, `checkbox` »Odstrani tudi kontakte, ki ne ustrezajo več filtrom« (privzeto obkljukan); »Posodobi izbor« → izbor 12 (−1 −1 +2), dialog odprt z vnosi, gumb »Uporabi za 12 kontaktov«; brez kljukice → 13; »Nadaljuj z obstoječim izborom« → `bulk-update` z 11 identitetami; `changed: false` → akcija takoj; `409 SELECTION_CHANGED` → `alert` »2 izbrana kontakta ne obstajata več.« z »Odstrani jih iz izbora« → izbor zmanjšan, ponovna akcija mogoča; posodobitev nad 10 000 → sporočilo o meji, »Nadaljuj z obstoječim izborom« ostane.

### E2E (Compose, emulator; 360/768/1280 px; axe na vsaki strani)

- [X] T028 [US1] [US2] [US3] FR-009-01 FR-009-02 FR-009-03 FR-009-05 FR-009-06 FR-009-09 FR-009-12 FR-009-18 SC-001 SC-005 e2e/tests/mnozicno-urejanje.spec.ts (odvisnost: T004; sl in en vmesnik): (1) urednik izbere kontakte na dveh straneh, spremeni filter → »Izbranih: 5«; (2) 300 kontaktov z značko `konferenca2025`: filter, »Izberi vse zadetke (300)«, »Uredi izbrane«, dodaj `nova`, »Uporabi za 300 kontaktov« → »Posodobljenih 300 kontaktov.« v < 30 s od prvega klika (SC-001), v bazi 300 z `nova`; (3) »Mojca Kralj« s 30 značkami v izboru → napaka z imenom, nič spremenjeno; (4) drugi urednik (ločen kontekst) izbriše enega izbranih in doda značko neizbranemu → obvestilo »Izbor se je spremenil …«, *Posodobi izbor*; (5) samo tipkovnica od izbora do obvestila; 320 px: akcijska vrstica vidna na dnu, brez vodoravnega drsenja; axe na vsakem koraku.
- [X] T029 [US4] [US5] FR-009-13 FR-009-14 FR-009-15 e2e/tests/mnozicno-urejanje.spec.ts (nadaljevanje, isti dokument, zato ni `[P]`; odvisnost: T028): (6) izbris 3 → potrditev s fokusom na *Prekliči*, *Esc*, ponovno, »Izbriši 3 kontakte« → »Izbrisani 3 kontakti.«, izbor prazen; revizijska sled pokaže en vnos »izbrisal(a) 3 kontakte« in en »uredil(a) 300 kontaktov«; (7) bralec: akcijska vrstica brez »Uredi izbrane« in »Izbriši«; (8) lastnik arhivira skupino → urednik vidi izbor in akcijsko vrstico brez akcij pisanja; axe.

**Checkpoint**: vsi testi T008–T029 se prevedejo in padejo zaradi pravega razloga (izjema: primeri 401/404 v T020, ki so zeleni že ob ogrodju); testi 000–008 ostanejo zeleni.

---

## Phase 4: Test review (independent agent gate)

- [X] T030 — Pregled testov: **nov** podagent `pregled-testov` (`.claude/agents/pregled-testov.md`) dobi samo `specs/009-mnozicno-urejanje/` in seznam testnih datotek T008–T029 (brez razlag): vsak FR-009-01 … FR-009-18 in SC-001 … SC-005 ima test; negativni scenariji in matrika izolacije za vse štiri endpointe; endpointi, poti in dostopna imena iz plan.md; selektorji po vlogah; asercije smiselne; testi padejo zaradi pravega razloga. Ob ZAVRNJENO popravi teste in zaženi nov primerek (največ 3 krogi, nato ustavi in vprašaj razvijalca). Ob SPREJETO zapiši vse kroge v `specs/009-mnozicno-urejanje/traceability.md` (razdelek *Pregled testov*) in naredi commit `test(009): …` (samo testi in minimalno ogrodje T001–T007).

**Checkpoint**: nobena implementacijska naloga se ne začne pred označeno T030. Od tu se testi spreminjajo samo zaradi specifikacije (vnos v DECISIONS.md).

---

## Phase 5: Implementation core (skupno vsem zgodbam)

- [X] T031 [P] FR-009-04 FR-009-06 FR-009-07 FR-009-08 FR-009-09 Izvedi backend/src/main/java/si/contactmanager/contact/BulkInputParser.java po research R-05 in data-model.md (»`contactIds` 1–10 000 po zlitju podvojenih«, »`addTags`/`removeTags` 0–30; značka 1–50 znakov, brez presledkov«, »`attributes` 0–10; vsako polje / ključ največ enkrat«, »`field`: `address` | `email` | `phone` | `custom`«, »`key` samo pri `custom`: 1–50 znakov, ne ime predefiniranega polja (sl/en, kot 004); pri `address`/`email`/`phone` poslan `key` → `INVALID_VALUE` (D-75)«, »neprazna po §2.6: naslov ≤ 300, e-naslov oblika in ≤ 254, telefon ≤ 30 in dovoljeni znaki, dodatna vrednost ≤ 500«); ponovno uporabi konstante, `normalize` in rezervirane ključe iz `ContactInputParser` (vidnost paketna, brez podvajanja vzorcev). Zeleni: T009.
- [X] T032 [P] FR-009-07 FR-009-08 FR-009-09 Izvedi backend/src/main/java/si/contactmanager/contact/BulkEdit.java po data-model.md (*BulkEdit*): odstrani → dodaj → atributi; `changed` po vsebini; napake končnega stanja »`after.tags.size() ≤ 30` (`tags` `TOO_MANY`), `after.attributes.size() ≤ 50` (`attributes` `TOO_MANY`)«. Zeleni: T008.
- [X] T033 [P] FR-009-09 FR-009-10 FR-009-17 Rokovalnika v backend/src/main/java/si/contactmanager/shared/error/ApiExceptionHandler.java: `BulkValidationException` → `400` `BulkValidationError` (`contacts` izpuščen, ko je prazen); `SelectionChangedException` → `409 {code: SELECTION_CHANGED, missing}`.
- [X] T034 FR-009-03 FR-009-10 FR-009-11 FR-009-16 backend/src/main/java/si/contactmanager/contact/ContactRepository.java (odvisnost: T005): `ids(group, query)` (`SELECT c.id FROM contact c WHERE ‹ContactSearch.where›`, brez razvrščanja); `lockExisting(group, ids)` (`SELECT id … WHERE group_id = :group AND id IN (:chunk) ORDER BY id FOR UPDATE`, kosi po 5000, vrne obstoječe); `knownToGroup(group, ids)` (identitete iz `audit_change` vnosov te skupine, kosi po 5000); `deleteAll(group, ids)` (kosi po 5000, vedno `group_id`).
- [X] T035 FR-009-06 FR-009-16 backend/src/main/java/si/contactmanager/contact/ContactSnapshots.java (odvisnost: T034): `replaceContent(group, actor, List<Change>)` po research R-07 – paketni `UPDATE contact` (vrednosti, `sort_last`/`sort_first` z malimi črkami, `version = version + 1`, `updated_by`, `updated_at = now()`, `reverted_entry_id = NULL`), otroci (značke oziroma atributi) zamenjani samo pri kontaktih, kjer so se spremenili; obstoječi `load`/`apply` nespremenjena.
- [X] T036 [P] FR-009-04 SC-002 Konfiguracija: backend/src/main/resources/application.yaml – privzeti `DB_URL` dobi `?reWriteBatchedInserts=true` (in `docker-compose.yml`, če nastavlja `DB_URL`); frontend/nginx.conf – v `location /api/` `client_max_body_size 2m;` (R-08).

**Checkpoint**: T008, T009 zeleni; `./verify.sh quick` zelen.

---

## Phase 6: User Story 1 - Izbor kontaktov čez strani in »vsi zadetki« (Priority: P1) 🎯 MVP

**Goal**: vsak član izbira posamezne kontakte, vse na strani (z mešanim stanjem) in vse zadetke; izbor preživi strani in filtre; akcijska vrstica po vlogi.

**Independent Test**: T010, T022, T023, T024 in koraki (1) T028, (7)–(8) T029 zeleni.

- [X] T037 [US1] FR-009-03 FR-009-04 `GET /api/groups/{groupId}/contact-ids` v backend/src/main/java/si/contactmanager/contact/BulkController.java in BulkService.java (odvisnost: T034): `ContactQueryParser` + `requireKnownKeys` kot 008 (iste napake), `count`; `total > 10 000` → `ids: []`, `truncated: true`; VIEWER, tudi arhivirana. Zeleni: T010, del T020.
- [X] T038 [P] [US1] FR-009-01 FR-009-02 FR-009-04 FR-009-18 Izvedi frontend/src/features/contacts/selection/selection.ts po data-model.md (*Selection*, meja 10 000, vse ali nič; invariante poizvedb: identiteta v eni poizvedbi, zlitje enakih `params`, največ 20 poizvedb in 10 000 `deselected`, pozabljanje najstarejše – R-10, D-73). Zeleni: T022.
- [X] T039 [US1] FR-009-02 frontend/src/features/contacts/selection/SelectionProvider.tsx in frontend/src/features/groups/GroupLayout.tsx (odvisnost: T038): kontekst nad potmi skupine, ponastavi ob novem `groupId` in odjavi; ne v naslovu, ne v `localStorage`.
- [X] T040 [US1] FR-009-01 frontend/src/features/contacts/selection/SelectAllOnPage.tsx, SelectContact.tsx in frontend/src/features/contacts/ContactList.tsx (odvisnost: T039): prvi stolpec izbire (`<th scope="col">` z nativnim `checkbox` »Izberi vse na strani«, `indeterminate` pri `mixed`), v vrstici `checkbox` »Izberi ‹prikazno ime›«; izbrana vrstica `bg-selected` (žeton `--k-accent-soft` iz design.md, kot `aria-current` vrstica; stanje tudi s kljukico); pod 640 px polje v glavi kartice (design.md 8.6).
- [X] T041 [US1] [US5] FR-009-03 FR-009-04 FR-009-05 FR-009-15 frontend/src/features/contacts/selection/SelectionActionBar.tsx, api.ts in ContactList.tsx (odvisnost: T040): `toolbar` »Dejanja izbora« namesto vrstice *Nov kontakt*, ko je izbor neprazen (D-72); `status` »Izbranih: N« (`aria-live="polite"`); »Izberi vse zadetke (N)« (`N` = `total` seznama) → `contactIds` z `toApiParams` trenutne poizvedbe → `addMatches`; meja → `alert`; »Uredi izbrane« in »Izbriši« samo `canEditContacts(group)`; »Počisti izbor« → fokus na »Izberi vse na strani«; < 640 px `sticky bottom-0`. Zeleni: T023, T024.

**Checkpoint**: US1 zelena; `./verify.sh quick` zelen.

---

## Phase 7: User Story 2 - Množično urejanje značk in atributov (Priority: P1)

**Goal**: urednik v enem dialogu doda/odstrani značke in nastavi/odstrani atribute za vse izbrane.

**Independent Test**: T012, T019, T021, T025 in korak (2) T028 zeleni.

- [X] T042 [US2] FR-009-06 FR-009-07 FR-009-08 FR-009-12 FR-009-16 `POST …/contacts/bulk-update` v backend/src/main/java/si/contactmanager/contact/BulkService.java in BulkController.java (odvisnost: T031–T035): transakcija po research R-03 (`lockGroupArchived` → `lockExisting` → `snapshots.load` → `BulkEdit.apply` → `replaceContent` za spremenjene → `AuditLog.record(UPDATE)`, če jih je ≥ 1) → `{changed}`. Osnovni vrstni red preverjanj po R-02 (popolna razvrstitev identitet v T044). Zeleni: T012, T019, T021.
- [X] T043 [US2] FR-009-06 FR-009-07 FR-009-08 FR-009-12 FR-009-17 frontend/src/features/contacts/selection/BulkEditDialog.tsx (odvisnost: T041): obrazec po plan.md (`TagInput` 004 za značke, vrstice atributov z nativnim `select`, do 10), telo po contracts; pošiljanje z zaščito pred drugim klikom in »Uporabljam…«; uspeh → zapri, toast z množinami, osveži seznam (`reloads`), izbor ostane; napake (`400` polja in `contacts` do 10 imen + »… in še N«, `403`, `409 GROUP_ARCHIVED`, omrežje) v `alert` nad obrazcem, dialog odprt z vnosi (design.md 8.13). Zeleni: T025 (brez delov FR-009-18).

**Checkpoint**: US2 zelena.

---

## Phase 8: User Story 3 - Atomarnost in spremenjen izbor (Priority: P1)

**Goal**: kršitev pri kateremkoli kontaktu ali manjkajoč kontakt → nič se ne spremeni, uporabnik izve zakaj; pred akcijo preverjanje sprememb izbora.

**Independent Test**: T011, T013, T015, T017, T027, del T020 in korak (3)–(4) T028 zeleni.

- [X] T044 [US3] FR-009-09 FR-009-10 FR-009-11 BulkService.java (odvisnost: T042): razvrstitev identitet po data-model.md (*BulkTarget*: obstoječ / manjkajoč – v `audit_change` vnosa te skupine / tuj → `404` pred `403`); napake po kontaktih zbrane za **vse** prizadete, razvrščene po slovenski abecedi (`Collator` sl, enako `sort_sl`) → `BulkValidationException`; nato `SelectionChangedException(missing)`; neveljavno telo → 403/409 pred `400` (R-02). Zeleni: T013, T015, T017, del T020.
- [X] T045 [US3] FR-009-18 `POST …/contacts/selection-check` v BulkService.java in BulkController.java (odvisnost: T044): razčlenitev `queries[i]` z `ContactQueryParser` (polja napak s predpono `queries[i].`), vsoti `contactIds`/`excludedIds` poizvedb ≤ 10 000 (`queries` `TOO_MANY`, `BulkInputParser.parseCheck`), tuja identiteta → `404`, `missing`, za vsako poizvedbo `ids(group, query)` → `newMatches` (ni v `contactIds`, ni v `excludedIds`) in `noLongerMatching`; brez pisanja. Zeleni: T011.
- [X] T046 [US3] FR-009-10 FR-009-18 frontend/src/features/contacts/selection/useSelectionCheck.ts, SelectionChangedNotice.tsx, BulkEditDialog.tsx (odvisnost: T043, T045): pred `bulk-update` (in `bulk-delete`, T048) pokliči `selection-check`; ob `changed` prikaži obvestilo (`alert`, warning) s števili po vrstah, kljukico in gumboma po plan.md; *Posodobi izbor* → `applyCheck` (meja 10 000) in posodobljen gumb, dialog odprt; *Nadaljuj* → `removeMissing` in pošlji; `409 SELECTION_CHANGED` → »N izbrana kontakta ne obstajata več.« + »Odstrani jih iz izbora«. Zeleni: T027, T025.

**Checkpoint**: US3 zelena.

---

## Phase 9: User Story 4 - Množični izbris (Priority: P2)

**Goal**: urednik izbriše vse izbrane po potrditvi.

**Independent Test**: T014 in T026 ter korak (6) T029 zeleni.

- [X] T047 [US4] FR-009-13 `POST …/contacts/bulk-delete` v BulkService.java in BulkController.java (odvisnost: T044): isti vrstni red preverjanj, `snapshots.load` → `deleteAll` → `AuditLog.record(DELETE, before)` → `{deleted}`. Zeleni: T014.
- [X] T048 [US4] FR-009-13 FR-009-17 frontend/src/features/contacts/selection/BulkDeleteDialog.tsx (odvisnost: T046, T047): vzorec `DeleteContactDialog` (design.md 8.11), fokus na *Prekliči*, vrnitev fokusa na »Izbriši«, preverjanje FR-009-18 pred izbrisom, uspeh → toast, `clear()`, osveži seznam; napake v dialogu. Zeleni: T026.

**Checkpoint**: US4 zelena.

---

## Phase 10: User Story 5 - Revizijska sled in arhivirana skupina (Priority: P2)

**Goal**: en vnos sledi na operacijo; v arhivirani skupini ni pisanja.

**Independent Test**: T016, T018, del T020, T024 (arhivirana) in koraki (6)–(8) T029 zeleni.

- [X] T049 [US5] FR-009-14 BulkService.java (odvisnost: T042, T047): `ContactChange` v vrstnem redu slovenske abecede imena, `display_name` iz `after` (urejanje) oziroma `before` (izbris); brez vnosa ob `changed = 0`. Zeleni: T016.
- [X] T050 [US5] FR-009-15 BulkService.java in frontend/src/features/contacts/selection/BulkEditDialog.tsx, BulkDeleteDialog.tsx (odvisnost: T044, T048): `GROUP_ARCHIVED` po `403` (VIEWER arhivirane → `403`); v vmesniku `409 GROUP_ARCHIVED` osveži skupino (pasica 003), skrije akcije pisanja, izbor ostane; `403` osveži vlogo in skrije akcije pisanja. Zeleni: T018, T024.

**Checkpoint**: vse zgodbe zelene; `./verify.sh quick` zelen.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T051 FR-009-01 … FR-009-18 `/speckit-converge` do »Converged«; manjkajoče doda kot naloge in jih izvede.
- [X] T052 SC-001 … SC-005 Posodobi specs/009-mnozicno-urejanje/traceability.md: vsak FR-ID → testi → stanje; *Meritve*: SC-001 (E2E čas), SC-002 (`BulkPerformanceIT` p50/p95/največ in okolje, R-07).
- [X] T053 — `./verify.sh full` zelen (vključno z vsemi testi 000–008).
- [X] T054 — Ročni pregled skrivnosti cele veje (`gitleaks` nad `git diff main...`), izid v opisu PR.
- [X] T055 — Push veje `mnozicno-urejanje` in PR v `main`: predpostavke (D-72, R-02 razlikovanje 404/409, R-08 nginx, odprta uskladitev 010), izid pregleda testov, commit `test(009)`.
- [ ] T056 — Razvijalca: pregled PR, odločitev o D-72 (besedilo design.md 8.8), ročni preizkus tipkovnice in bralnika zaslona (design.md §10); merge (agent pusti neoznačeno).

---

## Dependencies & Execution Order

- **Setup (T001–T004) → Foundational (T005–T007) → Tests (T008–T029) → Test review (T030)** strogo zaporedno (znotraj faz `[P]` vzporedno).
- **Implementation core (T031–T036)** po T030; T034 → T035.
- **Zgodbe**: US1 (T037–T041) → US2 (T042–T043) → US3 (T044–T046) → US4 (T047–T048) → US5 (T049–T050). US2 potrebuje akcijsko vrstico iz US1; US3, US4 in US5 razširijo `BulkService` iz US2 (ista datoteka, zato ne vzporedno). Zaledje (T037, T042, T044, T045, T047, T049) in vmesnik (T038–T041, T043, T046, T048) iste zgodbe lahko tečeta vzporedno.
- **Polish (T051–T056)** po vseh zgodbah.
- `/speckit-implement` se požene dvakrat: najprej do vključno Phase 3, nato po SPREJETO (T030) za ostalo (workflow.md §4.2).

## Parallel Example

```text
# Phase 3 – vsi testi v različnih datotekah:
T008 BulkEditTest · T009 BulkInputParserTest · T010 ContactIdsIT · T011 SelectionCheckIT · T012 BulkUpdateIT
T013 BulkUpdateValidationIT · T014 BulkDeleteIT · T015 BulkSelectionChangedIT · T016 BulkAuditIT · T017 BulkConcurrencyIT
T018 BulkArchivedIT · T019 BulkPerformanceIT · T020 BulkIsolationMatrixSecurityIT · T021 BulkLogIT
T022 selection.test · T023 ContactSelection.test · T024 SelectionActionBar.test · T025 BulkEditDialog.test
T026 BulkDeleteDialog.test · T027 SelectionCheck.test

# Phase 5: T031 BulkInputParser · T032 BulkEdit · T033 ApiExceptionHandler · T036 konfiguracija
# US1: T037 (BE contact-ids) vzporedno s T038 (selection.ts)
```

## Implementation Strategy

- **MVP**: Phase 1–6 (US1) – izbor in »Izberi vse zadetke« zadoščata za izvoz 010.
- Nato US2 + US3 skupaj (urejanje brez atomarnosti in preverjanja ni sprejemljivo za PR), US4, US5.
- Vsaka faza konča z `./verify.sh quick`; PR samo po zeleni `./verify.sh full`.

## Notes

- [P] = različne datoteke, brez odvisnosti; vsaka naloga navaja FR-ID-je.
- Test se nikoli ne spremeni, da bi ustrezal kodi; vsaka sprememba testa po T030 → vnos v DECISIONS.md.
- Brez utišanj opozoril brez D-NN; barve samo iz žetonov design.md (`accent-soft`, `warning`, `danger`).

## Phase 12: Convergence

- [X] T057 Akcijska vrstica izbora pod 640 px `fixed inset-x-0 bottom-0` (ne `sticky`), seznam dobi spodnji odmik, da vrstica ne pokrije vrstic; v e2e/tests/mnozicno-urejanje.spec.ts pri 360 px trditev, da je `toolbar` »Dejanja izbora« ob dnu vidnega polja tudi po drsenju, per plan: Key elements (*Dejanja izbora*), design 8.8, SC-005 (partial) – frontend/src/features/contacts/selection/SelectionActionBar.tsx, ContactList.tsx, e2e
- [X] T058 Pripni `ref={editButton}` na gumb »Uredi izbrane« za vrnitev fokusa po zaprtju dialoga per design 8.10 (partial) – SelectionActionBar.tsx
- [X] T059 Odstopanje celice »Izberi vse na strani« (`td` namesto `th scope="col"`, 004/008 testi imen glav) zapiši kot odločitev v DECISIONS.md (D-78) per plan: Key elements / R-14 (contradicts)
- [X] T060 Odstrani neuporabljen ključ `contacts.bulk.limitTags` (sl, en) in neuporabljen prop `listLabel` v TagInput.tsx; seznama »Dodane značke« v dialogu naj imata različni imeni, če to ne zlomi sprejetih testov, per plan (unrequested)
- [X] T061 `useSelectionCheck`: ob »Nadaljuj z obstoječim izborom«, ko po `removeMissing` ni več izbranih, ne pošlji zahtevka z `contactIds: []` per FR-009-10 (partial) – frontend/src/features/contacts/selection/useSelectionCheck.ts
- [X] T062 Dopolni research R-04 in data-model.md (*BulkEdit*): obstoječ ključ z enako vrednostjo ohrani zapis ključa in se ne šteje kot sprememba (FR-009-12); zapri z vnosom D-78 per R-04 (partial)
