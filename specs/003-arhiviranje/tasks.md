---

description: "Tasks for 003-arhiviranje (tests mandatory, independent test review)"
---

# Tasks: Arhiviranje in izbris skupine

**Input**: `specs/003-arhiviranje/` – spec.md, plan.md (*Public Interfaces*), research.md (R-01 … R-09), data-model.md,
contracts/openapi.yaml, quickstart.md; odločitev D-35

**Tests**: obvezni (konstitucija II). Vsak FR-003-01 … FR-003-11 ima vsaj eno testno nalogo. Testi pred kodo, nato pregled
neodvisnega agenta `pregled-testov` (workflow.md §4.2).

**Organization**: Setup → Foundational → Tests → Test review → US1 … US6 → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Imena endpointov, poti, dostopnih imen in sporočil so **samo** iz plan.md (*Public Interfaces*).
- Testi nosijo FR-ID (`@Tag("FR-003-04")`; Vitest/Playwright v imenu testa `"FR-003-04: …"`).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] FR-003-01 … FR-003-11 i18n ključi za vsa besedila, dostopna imena, naslov strani in obvestila iz plan.md (*Key elements and accessible names*) v frontend/src/i18n/sl.json in en.json (`groups.archivedList.*`, `groups.banner.*`, `groups.manage.*`, `groups.archiveDialog.*`, `groups.deleteDialog.*`, `groups.toast.*`, `title.archived`); ista drevesa ključev v obeh jezikih
- [X] T002 [P] FR-003-04 FR-003-06 FR-003-08 FR-003-09 Podpora BE testom: backend/src/test/java/si/contactmanager/group/support/GroupFixtures.java – `makePermanentlyArchived(groupId)` (arhivira in izbriše vrstico `OWNER`), `exists(groupId)`, `archivedAt(groupId)`
- [X] T003 [P] FR-003-04 FR-003-07 Podpora FE testom: frontend/src/test/groupsApi.ts – `groupDetail` dobi `permanentlyArchived: false`, `canDelete: false`; `archivedSummary(n, overrides)`; `mockGroupsApi` dobi rokovalnike `listArchived`, `archive`, `unarchive`, `remove` (zabeležijo zahtevke; privzeto `GET /api/groups/archived` → prazen seznam) (D-35)
- [X] T004 [P] FR-003-01 FR-003-09 FR-003-11 Podpora E2E: e2e/tests/support/groups.ts – `makePermanentlyArchived(groupId)` (SQL), `groupExists(groupId)`, `memberCount`

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [X] T005 FR-003-01 FR-003-06 FR-003-09 Ogrodje BE v backend/src/main/java/si/contactmanager/: `GroupDetail` + `permanentlyArchived`, `canDelete` (v ogrodju `false`); zapisa `ArchivedGroupSummary`, `ArchivedGroups`; izjemi `GroupNotArchivedException`, `GroupHasOtherMembersException` in njuna preslikava v `ApiExceptionHandler` (`409 GROUP_NOT_ARCHIVED`, `409 GROUP_HAS_OTHER_MEMBERS`); `GroupController` dobi `POST …/archive`, `POST …/unarchive`, `GET /archived`, `DELETE /{groupId}`, ki vrnejo `501`
- [X] T006 [P] FR-003-05 FR-003-07 Ogrodje FE: types.ts (`GroupDetail` polji, `ArchivedGroupSummary`, `ArchivedGroups`), api.ts (`archiveGroup`, `unarchiveGroup`, `deleteGroup`, `listArchived` vržejo `Error('not implemented')`), prazne komponente `ArchivedGroupsPage`, `ArchivedBanner`, `GroupManagementSection`, `ArchiveGroupDialog`, `DeleteGroupDialog` (vrnejo `null`), pot `groups/archived` v App.tsx, `dangerButton` v shared/ui/styles.ts

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja (`501`, prazna stran, `not implemented`).

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje – integracijski in varnostni

- [X] T007 [P] [US1] FR-003-01 FR-003-02 backend/src/test/java/si/contactmanager/group/GroupArchiveIT.java: lastnik `POST …/archive` → `200`, `archived: true`, `version`, `updatedBy`, `updatedAt` nespremenjeni; skupina izgine z `GET /api/groups`; član (urednik) jo še bere (`200`, `archived: true`); ponovno arhiviranje → `409 GROUP_ARCHIVED`; admin → `403`; v bazi `archived_at` nastavljen
- [X] T008 [P] [US3] FR-003-06 FR-003-08 backend/src/test/java/si/contactmanager/group/GroupUnarchiveIT.java: lastnik arhivirane → `200`, `archived: false`, skupina spet v `GET /api/groups` v razdelku `OWNER`; nearhivirana → `409 GROUP_NOT_ARCHIVED`; admin arhivirane → `403`, ostane arhivirana; trajno arhivirana: vsak član (ADMIN/EDITOR/VIEWER) → `403`, ostane arhivirana
- [X] T009 [P] [US4] [US5] FR-003-02 FR-003-07 FR-003-08 backend/src/test/java/si/contactmanager/group/ArchivedGroupListIT.java: samo arhivirane skupine članstva (tuje, nearhivirane niso), en seznam z `role`, `permanentlyArchived`, `contactCount: 0`; ICU red `sl` (č, š, ž) in `en`; paginacija 30 skupin → `size=25` prva stran, `page=1` 5, `total` 30; trajno arhivirana ima `permanentlyArchived: true`; neveljavni `page`/`size`/`lang` → `400 VALIDATION_FAILED`; uporabnik brez profila → prazen seznam
- [X] T010 [P] [US6] FR-003-08 FR-003-09 FR-003-10 FR-003-11 backend/src/test/java/si/contactmanager/group/GroupDeleteIT.java: edini član lastnik → `204`; vrstici `contact_group` in `group_member` izbrisani; `GET` nečlan in nekdanji član → `404`; arhivirana skupina edinega člana → `204`; lastnik z drugim članom → `409 GROUP_HAS_OTHER_MEMBERS`, nič izbrisano; trajno arhivirana z edinim bralcem → `204`; trajno arhivirana z dvema članoma → `409`; admin nearhivirane → `403`; `canDelete` v `GroupDetail`: lastnik edini → `true`, lastnik z drugim → `false`, admin → `false`, trajno arhivirana edini bralec → `true`, `permanentlyArchived` pravilen
- [X] T011 [P] [US1] [US3] FR-003-01 FR-003-03 FR-003-04 FR-003-06 backend/src/test/java/si/contactmanager/group/GroupArchiveConcurrencyIT.java: dva sočasna `archive` → natanko en `200` in en `409 GROUP_ARCHIVED`; dva sočasna `unarchive` → en `200`, en `409 GROUP_NOT_ARCHIVED`; sočasna `PUT` (urejanje) in `archive` → ali `PUT` uspe pred arhiviranjem ali vrne `409 GROUP_ARCHIVED`, nikoli sprememba arhivirane skupine; ponovljeno 10-krat
- [X] T012 [P] [US2] FR-003-03 FR-003-04 backend/src/test/java/si/contactmanager/group/ArchivedWriteRuleIT.java: v arhivirani skupini admin/lastnik `PUT` → `409 GROUP_ARCHIVED`, vrstica skupine nespremenjena; VIEWER/EDITOR `PUT` → `403`; vsi člani `GET` → `200`; trajno arhivirana: `PUT` članov → `403` (ni lastnika; admin → `409`), `GET` → `200`; po odarhiviranju `PUT` spet uspe
- [X] T013 [P] [US1] [US3] [US4] [US6] FR-003-01 FR-003-06 FR-003-07 FR-003-09 backend/src/test/java/si/contactmanager/group/ArchiveIsolationMatrixSecurityIT.java (parametriziran, workflow.md §2.5): `POST …/archive`, `POST …/unarchive`, `DELETE` × {neprijavljen (brez glave, pokvarjen, potekel žeton), nečlan, VIEWER, EDITOR, ADMIN, OWNER} × {nearhivirana, arhivirana}: 401 `UNAUTHENTICATED`, 404 prazno telo, 403 `FORBIDDEN`, OWNER: archive nearhivirana `200` / arhivirana `409 GROUP_ARCHIVED`, unarchive arhivirana `200` / nearhivirana `409 GROUP_NOT_ARCHIVED`, delete edini član `204` / z drugim članom `409 GROUP_HAS_OTHER_MEMBERS`; `GET /api/groups/archived` neprijavljen → `401`; nobena zavrnitev ne spremeni stanja

### Vmesnik – funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel z imeni iz plan.md)

- [X] T014 [P] [US4] [US5] FR-003-07 FR-003-08 frontend/src/features/groups/ArchivedGroupsPage.test.tsx: `/groups/archived` → `heading` level 1 »Arhivirane skupine«, naslov strani »Arhivirane skupine – Kontakti« (en "Archived groups – Contacts"); vrstica: `link` na `/groups/<id>`, opis, »0 kontaktov«, oznaka vloge »Vloga: Urednik«, oznaka »Arhivirano«; trajno arhivirana ima »lastnik: izbrisan uporabnik«, druga ne; 30 skupin → `navigation` »Strani rezultatov: Arhivirane skupine«, »1–25 od 30«, *Naslednja* zahteva `page=1&size=25`; prazno stanje `heading` level 2 »Nimaš arhiviranih skupin.« + `link` »Na seznam skupin« na `/`; napaka nalaganja `alert` + *Poskusi znova*; axe v sl in en
- [X] T015 [P] [US4] FR-003-02 FR-003-07 frontend/src/features/groups/ArchivedNavigation.test.tsx: `link` »Arhivirane skupine« v `main` zaslona *Skupine* (tudi v praznem stanju) in v `navigation` »Moje skupine« (`setViewport('wide')`) vodi na `/groups/archived`; `menuitem` »Arhivirane skupine« v meniju »Preklopi skupino« (`narrow`); axe
- [X] T016 [P] [US2] [US3] [US5] FR-003-05 FR-003-06 FR-003-08 frontend/src/features/groups/ArchivedBanner.test.tsx: nearhivirana skupina → brez `region` »Stanje skupine«; arhivirana (urednik) → `region` z besedilom »Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.«, brez gumba »Odarhiviraj skupino«; oznaka »Arhivirano« v glavi; lastnik → gumb v pasici → `POST …/unarchive`, obvestilo »Skupina je odarhivirana.«, pasica izgine, skupina spet nearhivirana; trajno arhivirana → besedilo »Skupina je trajno arhivirana, ker lastnik nima več računa.« in brez gumba za vse vloge; `409 GROUP_NOT_ARCHIVED` ob odarhiviranju → ponovno branje skupine; axe v sl in en
- [X] T017 [P] [US1] [US3] [US6] FR-003-01 FR-003-04 FR-003-06 FR-003-09 FR-003-10 FR-003-11 frontend/src/features/groups/GroupManagementSection.test.tsx: lastnik nearhivirane: `heading` level 2 »Upravljanje skupine«, gumb »Arhiviraj skupino« z razlago; klik → `dialog` »Arhiviram skupino Projekt FERI?« z besedilom posledic, fokus na »Prekliči«; Prekliči in *Esc* → brez zahtevka, fokus nazaj na sprožilec; potrditev → `POST …/archive`, obvestilo »Skupina je arhivirana.«, pasica, brez obrazca podatkov; napaka akcije (`500`, brez povezave, `403`) → `alert` brez kod; `409 GROUP_ARCHIVED` → osvežitev stanja. Arhivirana lastnika: gumb »Odarhiviraj skupino«, brez »Arhiviraj skupino«. `canDelete: false` lastnik → brez »Izbriši skupino«, razlaga »Skupino lahko izbrišeš, ko si njen edini član.«. `canDelete: true` → »Izbriši skupino« → `dialog` »Izbrišem skupino Projekt FERI?«, fokus na »Prekliči«, `textbox` »Za potrditev vpiši naslov skupine«; neujemanje (tudi razlika v velikosti črk) → napaka ob polju (`aria-invalid`), brez `DELETE`; natančen naslov (obrezan presledki) → `DELETE`, preusmeritev na `/` (`heading` »Skupine«), obvestilo »Skupina je izbrisana.«; `409 GROUP_HAS_OTHER_MEMBERS` → `alert` v dialogu, dialog ostane; ob izbrisu v arhivirani skupini isto. Urednik/admin nearhivirane → brez razdelka. Trajno arhivirana: razdelek viden vsem članom; edini bralec z `canDelete` vidi »Izbriši skupino«; sicer razlaga; brez »Odarhiviraj skupino«. Po izbrisu odpiranje `/groups/<id>` (MSW `404`) → »Te strani ni«. axe v sl in en (dialoga odprta)
- [X] T018 [P] [US2] FR-003-04 frontend/src/features/groups/ArchivedEditing.test.tsx: admin ima odprt obrazec *Podatki skupine*, `PUT` vrne `409 GROUP_ARCHIVED` → `alert` »Skupina je medtem postala arhivirana, zato je ni več mogoče urejati.«, ponovno branje (`GET`) in zaslon v načinu samo za branje (brez `form`, `term`/`definition` s podatki), pasica vidna; lastnik arhivirane skupine ne vidi obrazca ob prvem nalaganju

### E2E (Compose, emulator; 360/768/1280 px; axe na vsaki strani)

- [X] T019 [P] [US1] … [US6] FR-003-01 … FR-003-11 e2e/tests/arhiviranje.spec.ts: (1) lastnik arhivira skupino prek dialoga (fokus na Prekliči, obvestilo, pasica, oznaka, brez obrazca; axe); skupina izgine s seznama in jo najde na *Arhivirane skupine*; (2) urednik (SQL) vidi pasico brez odarhiviranja in brez akcij; (3) lastnik odarhivira (pasica), skupina v razdelku *Lastnik*, urejanje deluje; (4) trajno arhivirana (SQL): pasica, opomba »lastnik: izbrisan uporabnik« na seznamu, brez odarhiviranja, izbris edinega člana; (5) izbris: napačen naslov → napaka, natančen → preusmeritev, obvestilo, `groupExists` false, povezava → »Te strani ni«; z drugim članom brez gumba in z razlago; (6) SC-003: arhiviranje < 30 s od odprtja *Nastavitev*; (7) en scenarij v angleščini z axe

**Checkpoint**: vsi testi T007–T019 se prevedejo in padejo zaradi pravega razloga; testi 000–002 ostanejo zeleni.

---

## Phase 4: Pregled testov

- [X] T020 Pregled testov – agent `pregled-testov` (workflow.md §4.2): SPREJETO pred nadaljevanjem; izid vseh krogov v traceability.md (*Pregled testov*); commit `test(003): …`

---

## Phase 5: Implementacija

### US1 + US2 – arhiviranje in samo za branje (P1)

- [ ] T021 [US1] FR-003-01 FR-003-03 backend `GroupRepository` (`MemberState.permanentlyArchived`, `setArchived`, `lockState`, DETAIL s `permanentlyArchived`, `canDelete`), `GroupAccess.Membership.permanentlyArchived`, `GroupService.archive` (zaklep vrstice, ponovni pregled → `GroupArchivedException`) in `GroupController` `POST …/archive`; `GroupService.update` po zaklepu ponovno preveri arhiviranost
- [ ] T022 [US1] [US2] FR-003-01 FR-003-04 FR-003-05 frontend: `api.archiveGroup`, `ArchiveGroupDialog`, `ArchivedBanner` v `GroupLayout` (pod glavo), `GroupManagementSection` v `SettingsPage`, 409 `GROUP_ARCHIVED` v `GroupDetailsSection` (ponovno branje + sporočilo v nadrejeni komponenti)

### US3 – odarhiviranje (P2)

- [ ] T023 [US3] FR-003-06 FR-003-08 backend `GroupService.unarchive` (`GroupNotArchivedException`), `POST …/unarchive`
- [ ] T024 [US3] FR-003-06 frontend `api.unarchiveGroup`, gumb v pasici in v `GroupManagementSection` (brez potrditve, obvestilo, osvežitev povzetka)

### US4 + US5 – seznam arhiviranih in trajno arhivirana (P2/P3)

- [ ] T025 [US4] [US5] FR-003-02 FR-003-07 FR-003-08 backend `GroupRepository.archivedPage/archivedCount`, `GET /api/groups/archived` (ista razčlenitev parametrov kot `list`)
- [ ] T026 [US4] [US5] FR-003-07 FR-003-08 frontend `api.listArchived`, `ArchivedGroupsPage`, povezave v `GroupsPage`, `Sidebar`, `GroupSwitcher`

### US6 – izbris skupine (P2)

- [ ] T027 [US6] FR-003-09 FR-003-11 backend `GroupService.delete` (zaklep, vloga po stanju, število članov, `GroupHasOtherMembersException`), `DELETE /api/groups/{groupId}`
- [ ] T028 [US6] FR-003-09 FR-003-10 FR-003-11 frontend `api.deleteGroup`, `DeleteGroupDialog` (vpis naslova), preusmeritev, obvestilo

---

## Phase 6: Polish

- [ ] T029 `./verify.sh quick`, nato `./verify.sh full` zeleno; `traceability.md` (sledljivost FR-ID → testi, implementacija); README/CLAUDE.md po potrebi; AI dnevnik
- [ ] T030 `/speckit-converge` do »Converged«; PR v `main`

## Dependencies

Setup → Foundational → Tests → T020 → Implementacija (T021 → T022; T023 → T024; T025 → T026; T027 → T028) → Polish. Backend in vmesnik posamezne zgodbe sta neodvisna po T021/T023/T025/T027.

## Parallel execution

- Setup T001–T004 so vsi `[P]` (različne datoteke). Foundational: T005 (BE) in T006 (FE) sta neodvisna.
- Testi T007–T013 (BE) in T014–T018 (FE) so `[P]`; E2E T019 po FE testih (isti pomočniki).
- Implementacija: BE in FE posamezne zgodbe tečeta vzporedno po T021/T023/T025/T027; naloge, ki spreminjajo isto datoteko
  (`GroupService`, `GroupRepository`, `GroupController`, `GroupManagementSection`), tečejo zaporedno.

## Implementation strategy

1. MVP = US1 + US2 (arhiviranje, pasica, samo za branje): T021–T022.
2. Nato US3 (odarhiviranje), US4/US5 (seznam, trajno arhivirana), US6 (izbris); po vsaki zgodbi `./verify.sh quick`.
3. Na koncu `./verify.sh full`, `/speckit-converge`, PR.

## Analysis (`/speckit-analyze`, 2026-11-06, samo branje)

Vseh 11 FR in 6 SC ima vsaj eno nalogo in test (tabela pokritosti v plan.md). Ugotovitve in odločitve:

- **MEDIUM – nedoločen prikaz *Upravljanja skupine* za člane brez lastništva:** spec ne določa, kdo vidi razdelek. Odločitev v planu
  (research R-08): lastnik vedno; pri trajno arhivirani skupini vsi člani; drugi člani nearhivirane skupine ga ne vidijo
  (*Zapusti skupino* doda 007). Test T017 to preverja.
- **LOW – `Status: Draft` v spec.md:** ostane do sprejema PR.
- **LOW – kaskada za tabele 004–006:** zapisana kot obveza v data-model.md; preveri jo vsaka od teh funkcionalnosti.
Konstitucijskih navzkrižij ni.
