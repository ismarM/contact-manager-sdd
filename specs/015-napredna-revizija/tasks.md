---

description: "Tasks for 015-napredna-revizija (one pass, tests inside each story)"
---

# Tasks: Napredna revizijska sled in zgodovina kontakta

**Input**: `specs/015-napredna-revizija/` – spec.md (Clarifications 2026-11-15), plan.md (*Public Interfaces*), research.md (R-01 … R-10), data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: obvezni, pisani skupaj s kodo vsake zgodbe (konstitucija II); brez ločene faze testov.

**Organization**: Setup → Foundational → US1 … US6 (koda + testi) → Polish. Backend in frontend naloge iste zgodbe so označene [P], kjer ne delijo datotek (frontend se opira na `contracts/openapi.yaml` in MSW, zato ne čaka na zaledje).

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Endpointi in poti samo iz plan.md; oblike iz contracts/openapi.yaml; pravila iz data-model.md.
- Vrstni red preverjanj (feature-map §2.2): 401 → 404 → 403 → 409 GROUP_ARCHIVED → 400 → 409 VERSION_CONFLICT → 409 poslovno pravilo.
- Migracija samo naprej: `V11__napredna_revizija.sql` (pravilo usklajevanja z 014 v plan.md); `V1`–`V10` se ne dotikamo. Obstoječi testi 005 se ne oslabijo; spremenjeni gredo v opis PR.
- Patrikovega dela (014) se ne dotikamo; v `contact` samo `ContactSnapshots.restore` in nova datoteka `DuplicateLookup`.
- UI testi samo `getByRole`/`getByLabel`, imena iz prevodov ali skupnih pomočnikov, axe brez kršitev (CLAUDE.md, konstitucija §3.3); barve samo iz žetonov design.md.
- Brez `git push` brez navodila in brez združitve v `main`.

## Phase 1: Setup

- [ ] T001 — Migracija `backend/src/main/resources/db/migration/V11__napredna_revizija.sql` (razširitev `audit_entry.action` in `audit_entry_target`, indeksa `audit_entry_group_actor`, `audit_change_removed` po data-model.md); `AuditAction.RESTORE`; test `RestoreMigrationIT`: obstoječi vnosi nespremenjeni, `RESTORE` z `target_entry_id` ali `target_initial` dovoljen, brez cilja ali z obema zavrnjen, urejanje vnosa še vedno zavrnjeno (sprožilec)
- [ ] T002 [P] — i18n sl/en (`frontend/src/i18n/sl.json`, `en.json`): zgodovina, stavki dogodkov (vključno `RESTORE` in privzeti za neznano vrsto), primerjava, dialog obnove, seznam izbrisanih, razlaga pri združenem, filter izvajalca (»nekdanji član«, »izbrisan uporabnik«), napake in prazna stanja
- [ ] T003 [P] — FE tipi in API odjemalec `frontend/src/features/history/types.ts`, `api.ts` po `contracts/openapi.yaml`; MSW pomočnik `frontend/src/test/historyApi.ts`

## Phase 2: Foundational

- [ ] T004 FR-015-12 FR-015-13 — `ContactSnapshots.restore(group, ContactState goal, boolean exists, long version, long actor)` (en kontakt: INSERT ali UPDATE, `updated_by` = izvajalec, `updated_at = now()`, `reverted_entry_id = NULL`, zamenjava atributov in značk prek obstoječega `insertChildren`); `AuditLog.recordRestore(...)` + `AuditRepository.insert` (cilj za `RESTORE`); unit/IT `ContactSnapshotsRestoreIT` (ne spremeni drugih kontaktov; sort ključi; obstoječ in izbrisan)
- [ ] T005 FR-015-05 FR-015-06 FR-015-07 — `ContactHistoryRepository` (stran dogodkov kontakta po `seq DESC` z `group_id`; stanje `ACTIVE/DELETED/MERGED`; `mergedInto`; `hasInitial`; različica po `(entryId|initial|current)`; zadnji vnos kontakta) in DTO-ji `HistoryPage`, `HistoryEvent`, `VersionView`; unit `ContactStatusTest` (izpeljava stanja iz zadnje vrstice)
- [ ] T006 [P] FR-015-18 — FE: stavek dogodka v `AuditEntryItem.tsx` (obstoječa logika) izloči v skupen `frontend/src/features/audit/auditSentence.ts`, ki ga uporabita sled in časnica: stavki po vrsti, vključno `RESTORE`, privzeti stavek za neznano vrsto; test z `IMPORT`

## Phase 3: User Story 1 – Zgodovina kontakta (P1) 🎯 MVP

**Independent Test**: kontakt z ustvarjanjem, urejanjem, množičnim urejanjem, rollbackom, izbrisom in združitvijo; časovnica pravilna za obstoječ, izbrisan in združen kontakt.

- [ ] T007 [US1] FR-015-05 FR-015-06 FR-015-07 FR-015-21 — `ContactHistoryService/Controller` `GET …/contacts/{contactId}/history` (VIEWER, page/size 25/50/100 → 400; kontakt v tej skupini ali v sledi, sicer 404; obstoječ kontakt brez sledi → 200 prazno; `ChangeDiff` na dogodek; ob 1.000-kontaktnem vnosu samo vrstica tega kontakta); IT `ContactHistoryIT` (obstoječ, množično urejanje s 500 kontakti, rollback, izbrisan, združen + ohranjeni, brez sprememb, stari posnetek brez `company`/`country`, neznana vrsta dejanja v bazi → `action` besedilo) in `HistoryPerformanceIT` del SC-003 (100.000 vnosov, p95 < 2 s)
- [ ] T008 [P] [US1] FR-015-05 FR-015-06 FR-015-07 FR-015-19 FR-015-20 — FE `ContactHistoryPage.tsx`, `HistoryTimeline.tsx` (`ol`, `<time>`, vrsta z ikono in besedilom, razkrij polja z `ChangeTable`, povezava na celoten vnos, »združen v ‹ime›«, oznaka izbrisan), pot `contacts/:contactId/history` v `GroupLayout`, razdelek *Zgodovina* z povezavama v `ContactView.tsx`; testi `ContactHistoryPage.test.tsx` (paginacija, prazno stanje, izbrisan, združen, napaka + *Poskusi znova*, vitest-axe)

## Phase 4: User Story 2 – Filter po izvajalcu (P1)

**Independent Test**: sled z vnosi člana, nekdanjega člana, izbrisanega uporabnika in lastnika; filtri posamezno in v kombinaciji; izolacija.

- [ ] T009 [US2] FR-015-01 FR-015-02 FR-015-03 FR-015-04 FR-015-21 — `AuditRepository`/`AuditController`: parameter `actor` (žeton ali `deleted`; neznan → prazen seznam; druga oblika → 400 `INVALID_VALUE`), `actorFilter` v `AuditPage`; `GET /audit/actors` (člani, nekdanji člani, izbrisan; žeton po R-03); `latestEntryId` ostane nefiltriran; IT `AuditActorFilterIT` (člani, nekdanji po odstranitvi/izstopu, izbrisan račun, kombinacija z `action` in `contact`, žeton druge skupine → prazno, interni id ni v odgovoru, rollback iz filtriranega pogleda še preverja najnovejši vnos) in `AuditActorsIT`
- [ ] T010 [P] [US2] FR-015-01 FR-015-02 FR-015-03 FR-015-04 — FE `features/audit/AuditFilters.tsx` (izbira izvajalca `ActorSelect`, odstranljiva oznaka, ločitev članov/nekdanjih/izbrisanega), `auditRouting.ts`, `api.ts`, `types.ts`, `AuditPage.tsx` (`?actor=`, počisti filtre); testi `AuditFilters.test.tsx` razširjen, `AuditPage.test.tsx` (kombinacija, URL, prazno stanje), vitest-axe

## Phase 5: User Story 3 – Ogled in primerjava različic (P2)

- [ ] T011 [US3] FR-015-08 FR-015-09 FR-015-21 — `GET …/versions/{ref}` (entryId | initial | current; različica druge skupine ali kontakta → 404; `initial` brez `before` → 404; `current` za izbrisan → 404) in `GET …/compare?from=&to=` (isti ref → 400 `INVALID_VALUE`; manjkajoč → `REQUIRED`; `ChangeDiff`); IT `ContactVersionsIT` (osnovna polja, atributi, značke, `company`/`country` pred 013, `initial`, `current`, tuji ref)
- [ ] T012 [P] [US3] FR-015-08 FR-015-09 FR-015-19 FR-015-20 — FE `VersionPage.tsx` (stanje samo za branje), `ComparePage.tsx` (dodano/odstranjeno/spremenjeno z besedilom in ikono, nespremenjena polja skrita z gumbom, značke posamično, pod 640 px kartice), poti `history/:ref` in `compare`; izbira dveh različic iz časovnice (*Primerjaj s trenutno*, *Primerjaj z …*); testi `VersionPage.test.tsx`, `ComparePage.test.tsx` (vitest-axe, enobarvni prikaz = besedilo)

## Phase 6: User Story 4 – Obnova enega kontakta (P2)

**Independent Test**: obnova obstoječega in izbrisanega kontakta; drugi kontakti in stari vnosi nespremenjeni; zavrnitve.

- [ ] T013 [US4] FR-015-10 FR-015-11 FR-015-14 FR-015-15 — `DuplicateLookup` (nova javna enota v `contact`: enak e-naslov ali ime po `DuplicateKeys`, do 5), `GET …/restore-preview?from=` (`changes`, `restorable`, `reason`, `currentVersion`/`lastEntryId`, `duplicates` za izbrisan kontakt); IT `RestorePreviewIT` (obstoječ, izbrisan, združen = `restorable:false`/`MERGED`, enak = `NO_CHANGES`, podvajanje po e-naslovu in imenu, brez razkritja kontaktov druge skupine)
- [ ] T014 [US4] FR-015-10 FR-015-12 FR-015-13 FR-015-14 FR-015-15 FR-015-16 FR-015-17 FR-015-21 — `RestoreService` + `POST …/restore` (vrstni red §2.2; telo `from` + `version` | `lastEntryId`; zaklep skupine; sočasnost; `RESTORE_NOT_ALLOWED` za združen; `RESTORE_NO_CHANGES`; nova verzija max+1; izvajalec in čas obnove; en vnos `RESTORE` z `before`/`after`), izjemi `RestoreNoChangesException`/`RestoreNotAllowedException` + preslikava kod; kode v `feature-map.md` §2.10; IT `RestoreIT` (obstoječ in izbrisan kontakt, vsi drugi kontakti in vsi stari vnosi nespremenjeni, nov vnos s pravim izvajalcem/časom/ciljem, `initial`, urejanje z verzijo izpred obnove → 409, brez oznake *Povrnjeno*), `RestoreRulesIT` (VIEWER 403, arhivirana 409, 404 druge skupine/različice, 400 REQUIRED/INVALID_VALUE, združen 409, enak 409), `RestoreConcurrencyIT` (dve obnovi, obnova + urejanje, obnova + izbris, obnova + rollback skupine: natanko ena uspe, drugi 409, en vnos), `RestoreRollbackInteropIT` (rollback skupine pred in po obnovi, `statesAfter`/`maxVersions` upoštevata `RESTORE`)
- [ ] T015 [P] [US4] FR-015-10 FR-015-11 FR-015-13 FR-015-14 FR-015-15 FR-015-19 — FE `RestoreDialog.tsx` (8.11: fokus na *Prekliči*, naslov »Obnovim kontakt ‹ime› na stanje ‹čas›?«, predogled sprememb s `ChangeTable`, opozorilo o podvajanju s povezavo, `RESTORE_NO_CHANGES`/`MERGED` kot razlaga, konflikt → »Kontakt se je medtem spremenil.« + osvežitev, napaka s *Poskusi znova*, uspeh toast »Kontakt je obnovljen na stanje ‹čas›.«), gumb *Obnovi to različico* samo EDITOR+ v nearhivirani skupini (časovnica, ogled, primerjava); testi `RestoreDialog.test.tsx` (vloge, fokus, konflikt, podvajanje, vitest-axe)

## Phase 7: User Story 6 – Seznam izbrisanih kontaktov (P2)

- [ ] T016 [US6] FR-015-22 FR-015-23 FR-015-24 FR-015-21 — `DeletedContactRepository/Controller` `GET …/deleted-contacts?q=&state=&page=&size=` (VIEWER, arhivirana dovoljeno; izpeljava po R-06; `reason`, `restorable`, `mergedInto` z `exists`; iskanje po imenu/e-naslovu/podjetju z `COLLATE search_fold`; `state` in `size` → 400); IT `DeletedContactsIT` (posamični in množični izbris, odstranitev z rollbackom, združitev, ponovno izbrisan po obnovi = enkrat, obnovljen ne na seznamu, iskanje brez šumnikov, filter, paginacija, kontakti druge skupine ne pronicajo) in `DeletedContactsPerformanceIT` (SC-007: 10.000 izbrisanih, prva stran p95 < 2 s)
- [ ] T017 [P] [US6] FR-015-22 FR-015-23 FR-015-24 FR-015-14 FR-015-19 FR-015-20 — FE `DeletedContactsPage.tsx` (iskanje, filter *Vsi / Obnovljivi / Združeni*, vrstica: ime, e-naslov, podjetje, »Odstranil(a) ‹izvajalec› ‹čas›«, oznaka, *Zgodovina*, *Obnovi* z `RestoreDialog`; združen: razlaga, povezavi *Zgodovina* in *Odpri ohranjeni kontakt* (brez *Obnovi*), prazna stanja, URL stanje), pot `deleted-contacts` v `GroupLayout`, povezava *Izbrisani kontakti* v seznamu kontaktov (minimalna sprememba v `features/contacts`); testi `DeletedContactsPage.test.tsx` (vitest-axe, vloge, razlaga pri združenem, paginacija)

## Phase 8: User Story 5 – Matrika izolacije, E2E in dostopnost (P3)

- [ ] T018 [US5] FR-015-21 FR-015-10 FR-015-16 — `AuditHistoryIsolationMatrixSecurityIT` (8 endpointov (7 novih + `GET /audit?actor`) × akter [brez žetona, pokvarjen, potekel, nečlan, VIEWER, EDITOR, ADMIN, OWNER] × stanje [nearhivirana, arhivirana] ter kontakt/vnos druge skupine): 401, 404 brez telesa, 403 za obnovo pri VIEWER, 2xx, arhivirana 409 pri obnovi; PUT/PATCH/DELETE na nove poti 405; negativni scenariji iz spec.md
- [ ] T019 [US5] FR-015-01 … -24 — E2E `e2e/tests/napredna-revizija.spec.ts` + `e2e/tests/support/history.ts` (samo `getByRole`/`getByLabel`): filter po izvajalcu, zgodovina, primerjava, obnova urednika (predogled → potrditev), bralec brez gumba, izbrisan kontakt → seznam → obnova, združen brez *Obnovi*; axe pri 360, 768 in 1280 px; sl in en
- [ ] T020 [P] FR-015-18 FR-015-17 — regresija 005: obstoječi testi `features/audit/*` in `audit/*IT` brez oslabitve (sprememba samo kjer `AuditAction`/`AuditPage` dobita nova polja; zapis razloga v opis PR); FE test neznane vrste dejanja (`IMPORT`) v sledi in zgodovini

## Phase 9: Polish

- [ ] T021 — `./verify.sh quick`, `backend`, `e2e` zeleni; `feature-map.md` §2.10 (`RESTORE_NO_CHANGES`, `RESTORE_NOT_ALLOWED`) in vrstica 015 v §1 pregledani; `git fetch` in preveri, da 014 ni zasedla `V11` ali spremenila `CHECK` (pravilo v plan.md); ai-log `ai-log/ismar.md` dopolnjen
