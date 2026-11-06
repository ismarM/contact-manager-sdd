# Implementation Plan: Arhiviranje in izbris skupine

**Branch**: `arhiviranje` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-arhiviranje/spec.md`

## Summary

Zaledje dobi štiri endpointe nad obstoječo tabelo `contact_group` (brez migracije): arhiviranje in odarhiviranje (lastnik), seznam
arhiviranih skupin in izbris skupine (edini član). `GroupAccess` dobi znanje o trajno arhivirani skupini (arhivirana brez člana `OWNER`),
`GroupDetail` pa polji `permanentlyArchived` in `canDelete`. Sočasnost rešuje zaklep vrstice skupine (kot pri urejanju v 002). Vmesnik dobi
zaslon *Arhivirane skupine* (`/groups/archived`) s povezavami na zaslonu *Skupine*, v stranskem pasu in meniju preklopa, pasico
arhivirane skupine pod glavo, razdelek *Upravljanje skupine* v *Nastavitvah* z dialogoma za arhiviranje in izbris (z vpisom naslova) ter
obravnavo `409 GROUP_ARCHIVED` v obrazcu podatkov skupine. Odločitve so v [research.md](research.md).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`; vmesnik: `react-router`, `radix-ui` Dialog, `sonner`,
`@tabler/icons-react`, `react-i18next`) – brez novih knjižnic

**Storage**: PostgreSQL 18; brez nove migracije (`archived_at` in kaskada iz `V3__skupine.sql`; [data-model.md](data-model.md))

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: arhiviranje/odarhiviranje: 1 transakcija, 3 poizvedbe; seznam arhiviranih: največ 100 vrstic, 2 poizvedbi; SC-003 (< 30 s) merjen z E2E

**Constraints**: WCAG 2.1 AA, sl/en, optimistične verzije niso potrebne (R-04), izolacija skupin, barve samo iz žetonov

**Scale/Scope**: 11 FR (FR-003-01 … FR-003-11), 4 endpointi, 1 nova pot, 0 migracij

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-003-01 … FR-003-11 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena. Negativni scenariji iz spec so v testih. |
| II. Test-first | BE: integracijski (`GroupArchiveIT`, `GroupUnarchiveIT`, `ArchivedGroupListIT`, `GroupDeleteIT`, `GroupArchiveConcurrencyIT`, `ArchivedWriteRuleIT`), varnostni (`ArchiveIsolationMatrixSecurityIT`). FE: funkcionalni z MSW in `vitest-axe` (`ArchivedGroupsPage`, `ArchivedNavigation`, `ArchivedBanner`, `GroupManagementSection`, `ArchivedEditing`). E2E `arhiviranje.spec.ts` pri 360/768/1280 px. Pregled testov opravi agent `pregled-testov` pred kodo. |
| III. Group isolation and roles | Vsi novi endpointi so v matriki izolacije (401/404/403/2xx, arhivirana 409). Preverjanje je v `GroupAccess` (D-27); izbris po FR-003-09 preveri strežnik, ne vmesnik. Seznam arhiviranih vrne samo skupine članstva. |
| IV. Accessible, bilingual, responsive UI | design.md 8.5, 8.9–8.11, 8.13, 9.2, 9.7, 9.11; dialoga: fokus na *Prekliči*, Esc, vrnitev fokusa; vsa besedila v sl/en; axe v FE testih in E2E v sl **in** en (SC-006); brez vodoravnega drsenja pri 320 px. |
| V. Data integrity | Prehodi stanja pod zaklepom vrstice; en `DELETE` s kaskado v transakciji; števila članov pod zaklepom (R-03). Vse nove tabele prihodnjih funkcionalnosti morajo imeti `ON DELETE CASCADE` (data-model.md). |
| VI. Privacy and GDPR | Brez novih osebnih podatkov. Izbris skupine trajno odstrani vse njene podatke (FR-003-11, SC-004). Lastnik trajno arhivirane skupine je prikazan kot »izbrisan uporabnik« (§2.5). |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Odločitve: D-35. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) kodi `GROUP_NOT_ARCHIVED` in
`GROUP_HAS_OTHER_MEMBERS` sta že v registru (feature-map §2.10); (2) D-35 spreminja dve datoteki 002 (`GroupDetail`, `GroupService.update`,
`groupsApi.ts` kot podpora testov) – drugi razvijalec jo potrdi ob pregledu PR.

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/archive | OWNER | rejected (409 GROUP_ARCHIVED; ni OWNER → 403) | 200; telo `GroupDetail` | FR-003-01 |
| POST | /api/groups/{groupId}/unarchive | OWNER | allowed (nearhivirana → 409 GROUP_NOT_ARCHIVED; trajno arhivirana → 403) | 200; telo `GroupDetail` | FR-003-06, FR-003-08 |
| GET | /api/groups/archived | — (prijavljen) | vrne samo arhivirane skupine članstva | 200; telo `ArchivedGroups` | FR-003-02, FR-003-07, FR-003-08 |
| DELETE | /api/groups/{groupId} | OWNER (v trajno arhivirani skupini VIEWER) | allowed | 204 | FR-003-09, FR-003-11 |
| GET | /api/groups/{groupId} (002) | VIEWER | allowed | 200; `GroupDetail` + `permanentlyArchived`, `canDelete` | FR-003-03, FR-003-05, FR-003-10 |
| PUT | /api/groups/{groupId} (002) | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER/EDITOR 403) | 200 | FR-003-03, FR-003-04 |

- `archive`/`unarchive`: brez telesa. `GET /api/groups/archived` parametri: `page` (od 0), `size` (1–100, privzeto 25), `lang` (`sl|en`,
  privzeto `en`); neveljavna vrednost → `400 VALIDATION_FAILED`. Odgovor: `{"total","page","size","items":[{"id","title","description","color","contactCount","role","permanentlyArchived"}]}`.
- `DELETE`: pravila: trajno arhivirana → vsaka vloga, sicer vloga < OWNER → `403`; več kot en član → `409 GROUP_HAS_OTHER_MEMBERS` (korak 7, §2.2).
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `404` prazno telo (nečlan, neobstoječa skupina, neveljaven uuid); `403 {"code":"FORBIDDEN"}`;
  `409 {"code":"GROUP_ARCHIVED"}`, `409 {"code":"GROUP_NOT_ARCHIVED"}`, `409 {"code":"GROUP_HAS_OTHER_MEMBERS"}`.
- Vrstni red: 401 → 404 → 403 → `GROUP_ARCHIVED` → poslovno pravilo (feature-map §2.2). Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Arhivirane skupine | /groups/archived | — (prijavljen) | FR-003-07, FR-003-08 |
| Nastavitve skupine (+ *Upravljanje skupine*) (002) | /groups/:groupId/settings | VIEWER | FR-003-01, FR-003-04, FR-003-06, FR-003-09, FR-003-10 |
| Vsi zasloni skupine: pasica arhivirane skupine (002) | /groups/:groupId/* | VIEWER | FR-003-05, FR-003-08 |
| Skupine (002), stranski pas, preklop skupine | /, vsi prijavljeni zasloni | — | FR-003-02, FR-003-07 |

- Naslov strani zaslona *Arhivirane skupine*: »Arhivirane skupine – Kontakti« / "Archived groups – Contacts".
- Statična pot `groups/archived` ima v React Router prednost pred `groups/:groupId/*`.
- Po izbrisu: preusmeritev na `/` z obvestilom »Skupina je izbrisana.«; povezava do izbrisane skupine → `NotFoundPage` (002).

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Opomba za teste: ob širini ≥ 1024 px je povezava *Arhivirane skupine* hkrati v stranskem pasu in v `main` zaslona *Skupine*; teste omejimo z
`within(navigation »Moje skupine«)` oziroma `within(main)`. Pri < 1024 px je povezava v meniju *Preklopi skupino* (`menuitem`).

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Skupine (`main`), stranski pas | link | »Arhivirane skupine« / "Archived groups" | odpre `/groups/archived` (vedno prikazana) | FR-003-02, FR-003-07 |
| Meni preklopa | menuitem | »Arhivirane skupine« / "Archived groups" | odpre `/groups/archived` | FR-003-07 |
| Arhivirane skupine | heading (level 1) | »Arhivirane skupine« / "Archived groups" | naslov zaslona | FR-003-07 |
| Arhivirane skupine | list / listitem | – | vrstica: povezava z naslovom skupine, skrajšan opis, »12 kontaktov« / "12 contacts" | FR-003-07 |
| Arhivirane skupine | link | naslov skupine | odpre `/groups/:groupId` | FR-003-07 |
| Arhivirane skupine | text | »Vloga: Urednik« / "Role: Editor" (predpona vizualno skrita), »Arhivirano« / "Archived" | oznaki vloge in stanja (design.md 8.5) | FR-003-07 |
| Arhivirane skupine | text | »lastnik: izbrisan uporabnik« / "owner: deleted user" | opomba trajno arhivirane skupine | FR-003-08 |
| Arhivirane skupine | navigation | »Strani rezultatov: Arhivirane skupine« / "Result pages: Archived groups" | paginacija (vidna, ko je skupin več kot 25), gumba »Prejšnja«/»Naslednja«, `combobox` »Velikost strani«, `status` »1–25 od 30« | FR-003-07 |
| Arhivirane skupine | heading (level 2) + link | »Nimaš arhiviranih skupin.« / "You have no archived groups."; »Na seznam skupin« / "Back to groups" | prazno stanje | FR-003-07 |
| Arhivirane skupine | status | »Nalagam…« / "Loading…" | nalaganje | FR-003-07 |
| Arhivirane skupine | alert | »Skupin ni bilo mogoče naložiti. Poskusi znova.« + gumb »Poskusi znova« | napaka nalaganja (002 besedila) | FR-003-07 |
| Skupina (vsi zasloni) | region | »Stanje skupine« / "Group status" | pasica pod glavo, samo ko je skupina arhivirana | FR-003-05 |
| Pasica | text | »Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.« / "This group is archived – you can browse, search and export." | besedilo pasice | FR-003-05 |
| Pasica | text | »Skupina je trajno arhivirana, ker lastnik nima več računa.« / "This group is permanently archived because its owner no longer has an account." | pasica trajno arhivirane skupine (brez akcije) | FR-003-05, FR-003-08 |
| Pasica | button | »Odarhiviraj skupino« / "Unarchive group" | samo lastnik nepermanentne; brez potrditve | FR-003-05, FR-003-06 |
| Nastavitve | heading (level 2) | »Upravljanje skupine« / "Group management" | razdelek; lastnik, pri trajno arhivirani skupini vsi člani | FR-003-01, FR-003-10 |
| Upravljanje | button | »Arhiviraj skupino« / "Archive group" | odpre potrditveni dialog (lastnik nearhivirane) | FR-003-01 |
| Upravljanje | button | »Odarhiviraj skupino« / "Unarchive group" | odarhivira (lastnik arhivirane nepermanentne) | FR-003-06 |
| Upravljanje | button | »Izbriši skupino« / "Delete group" | odpre dialog; samo ob `canDelete` | FR-003-10 |
| Upravljanje | text | »Člani ohranijo dostop, skupina pa postane samo za branje.« / "Members keep access; the group becomes read-only."; »Skupina bo spet delovala kot pred arhiviranjem.« / "The group will work as before it was archived."; »Izbrišeš skupino skupaj z vsemi podatki. Izbrisa ni mogoče razveljaviti.« / "You delete the group with all its data. This cannot be undone."; »Skupino lahko izbrišeš, ko si njen edini član.« / "You can delete the group once you are its only member." | en stavek razlage ob akciji ali namesto nje | FR-003-01, FR-003-06, FR-003-10 |
| Upravljanje | alert | »Skupine ni bilo mogoče arhivirati. Poskusi znova.« / "The group could not be archived. Please try again."; »… odarhivirati …« / "… unarchived …"; »Skupine ni bilo mogoče izbrisati. Poskusi znova.« / "The group could not be deleted. Please try again."; »Ni povezave. Preveri povezavo in poskusi znova.«; »Za to dejanje nimaš več pravic.« | napaka akcije (brez kod) | FR-003-01, FR-003-06, FR-003-10 |
| Dialog arhiviranja | dialog | »Arhiviram skupino Projekt FERI?« / "Archive group Projekt FERI?" | potrditev; fokus ob odprtju na »Prekliči« | FR-003-01 |
| Dialog arhiviranja | text, button | »Člani ohranijo dostop, skupina pa bo samo za branje. Odarhivirati jo lahko samo lastnik.« / "Members keep access and the group becomes read-only. Only the owner can unarchive it."; »Prekliči« / "Cancel", »Arhiviraj skupino« / "Archive group" | posledice, gumba | FR-003-01 |
| Dialog izbrisa | dialog | »Izbrišem skupino Projekt FERI?« / "Delete group Projekt FERI?" | potrditev; fokus ob odprtju na »Prekliči« | FR-003-10 |
| Dialog izbrisa | text | »Izbrisani bodo vsi kontakti, revizijska sled in čakajoča povabila skupine. Izbrisa ni mogoče razveljaviti.« / "All contacts, the audit trail and pending invitations of the group will be deleted. This cannot be undone." | posledice | FR-003-10 |
| Dialog izbrisa | textbox | »Za potrditev vpiši naslov skupine« / "Type the group title to confirm" (`aria-required`) | vpis naslova | FR-003-10 |
| Dialog izbrisa | text (`aria-describedby`, polje `aria-invalid`) | »Vpisano besedilo se ne ujema z naslovom skupine.« / "The text does not match the group title." | napaka ob polju | FR-003-10 |
| Dialog izbrisa | alert | »Skupine ni mogoče izbrisati, ker ima še druge člane.« / "The group cannot be deleted because it has other members."; »Skupine ni bilo mogoče izbrisati. Poskusi znova.«; »Ni povezave. …«; »Za to dejanje nimaš več pravic.« | napaka akcije v dialogu | FR-003-09, FR-003-10 |
| Dialog izbrisa | button | »Prekliči« / "Cancel", »Izbriši skupino« / "Delete group" | gumba | FR-003-10 |
| Nastavitve (obrazec) | alert | »Skupina je medtem postala arhivirana, zato je ni več mogoče urejati.« / "The group has been archived in the meantime and can no longer be edited." | po `409 GROUP_ARCHIVED` ob shranjevanju; zaslon se ponovno naloži v načinu samo za branje | FR-003-04 |
| Ogrodje | region »Obvestila« | »Skupina je arhivirana.« / "Group archived."; »Skupina je odarhivirana.« / "Group unarchived."; »Skupina je izbrisana.« / "Group deleted." | obvestila uspeha (Sonner, 5 s) | FR-003-01, FR-003-06, FR-003-09 |

- Pasica in *Upravljanje skupine* v arhivirani skupini: *Podatki skupine* so brez obrazca (002, `canEdit` že zahteva `!archived`).
- Gumb *Odarhiviraj skupino* je lahko hkrati v pasici in v *Upravljanju*; testi uporabijo `within(region »Stanje skupine«)` oziroma
  `within(main)` brez pasice po potrebi.

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-003-01 | `GroupArchiveIT`, `ArchiveIsolationMatrixSecurityIT` | `GroupManagementSection.test` | `arhiviranje.spec` |
| FR-003-02 | `ArchivedGroupListIT` (+ 002 `GroupListIT` ostane zelen) | `ArchivedNavigation.test`, `GroupManagementSection.test` | `arhiviranje.spec` |
| FR-003-03 | `ArchivedWriteRuleIT`, `ArchiveIsolationMatrixSecurityIT` | – | `arhiviranje.spec` |
| FR-003-04 | `ArchivedWriteRuleIT` | `ArchivedEditing.test`, `GroupManagementSection.test` | `arhiviranje.spec` |
| FR-003-05 | – | `ArchivedBanner.test` | `arhiviranje.spec` |
| FR-003-06 | `GroupUnarchiveIT`, `ArchiveIsolationMatrixSecurityIT` | `ArchivedBanner.test`, `GroupManagementSection.test` | `arhiviranje.spec` |
| FR-003-07 | `ArchivedGroupListIT` | `ArchivedGroupsPage.test`, `ArchivedNavigation.test` | `arhiviranje.spec` |
| FR-003-08 | `GroupUnarchiveIT`, `GroupDeleteIT`, `ArchivedGroupListIT` | `ArchivedBanner.test`, `ArchivedGroupsPage.test` | `arhiviranje.spec` |
| FR-003-09 | `GroupDeleteIT`, `GroupArchiveConcurrencyIT`, `ArchiveIsolationMatrixSecurityIT` | `GroupManagementSection.test` | `arhiviranje.spec` |
| FR-003-10 | `GroupDeleteIT` (`canDelete`) | `GroupManagementSection.test` | `arhiviranje.spec` |
| FR-003-11 | `GroupDeleteIT` | `GroupManagementSection.test` (povezava → »Te strani ni«) | `arhiviranje.spec` |

Merljiva merila: SC-001 – `ArchivedWriteRuleIT` + matrika; SC-002 – `ArchivedBanner.test`, `arhiviranje.spec`; SC-003 – `arhiviranje.spec`;
SC-004 – `GroupDeleteIT`; SC-005 – `GroupDeleteIT`, `GroupManagementSection.test`; SC-006 – axe v vseh FE testih in E2E v sl in en.

## Project Structure

### Documentation (this feature)

```text
specs/003-arhiviranje/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/java/si/contactmanager/
├── group/
│   ├── GroupController.java        # + archive, unarchive, archived, delete
│   ├── GroupService.java           # + archive/unarchive/delete (zaklep vrstice); update ponovno preveri arhiviranost po zaklepu
│   ├── GroupRepository.java        # + MemberState.permanentlyArchived, setArchived, memberCount, delete, archivedPage/Count; DETAIL + canDelete
│   ├── GroupAccess.java            # Membership(…, permanentlyArchived)
│   ├── GroupDetail.java            # + permanentlyArchived, canDelete
│   └── {ArchivedGroupSummary, ArchivedGroups}.java
└── shared/error/{GroupNotArchivedException, GroupHasOtherMembersException}.java + ApiExceptionHandler (2 kodi)
backend/src/test/java/si/contactmanager/group/
├── {GroupArchiveIT, GroupUnarchiveIT, ArchivedGroupListIT, GroupDeleteIT, GroupArchiveConcurrencyIT, ArchivedWriteRuleIT}.java
├── ArchiveIsolationMatrixSecurityIT.java
└── support/GroupFixtures.java      # + makePermanentlyArchived, exists

frontend/src/
├── app/App.tsx                     # + pot groups/archived
├── features/groups/
│   ├── api.ts, types.ts            # + archiveGroup, unarchiveGroup, deleteGroup, listArchived; GroupDetail polji
│   ├── ArchivedGroupsPage.tsx, ArchivedBanner.tsx, GroupManagementSection.tsx, ArchiveGroupDialog.tsx, DeleteGroupDialog.tsx
│   ├── GroupLayout.tsx (+ pasica), SettingsPage.tsx (+ razdelek), GroupDetailsSection.tsx (409 → ponovno branje)
│   ├── GroupsPage.tsx (+ povezava)
│   └── *.test.tsx (ArchivedGroupsPage, ArchivedNavigation, ArchivedBanner, GroupManagementSection, ArchivedEditing)
├── shared/layout/{Sidebar, GroupSwitcher}.tsx   # + povezava
├── shared/ui/styles.ts             # + dangerButton
├── i18n/{sl,en}.json               # ključi groups.archived.*, groups.manage.*, title.archived, toast
└── test/groupsApi.ts               # + archived/archive/unarchive/delete rokovalniki, polji GroupDetail (D-35)

e2e/tests/arhiviranje.spec.ts, e2e/tests/support/groups.ts (+ makePermanentlyArchived, groupExists)
```

**Structure Decision**: obstoječa struktura iz 000–002; nov paket ni potreben.

## Complexity Tracking

Ni kršitev konstitucije.
