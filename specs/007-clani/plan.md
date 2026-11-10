# Implementation Plan: Upravljanje članov skupine

**Branch**: `clani` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-clani/spec.md`

## Summary

Zaledje dobi paket `member` s petimi endpointi, vezanimi na skupino: seznam članov, sprememba vloge (z verzijo članstva), odstranitev, zapuščanje in
prenos lastništva. Dostop in vrstni red 401 → 404 → 403 preverja obstoječi `GroupAccess` (D-27), stanje arhiviranosti pa servis (cilj in pravilo
»le nižjim od sebe« morata priti pred 409). Vsaka pisalna operacija v transakciji najprej zaklene vrstico skupine (kot 003 in 006) in vse presodi
na ponovno prebranem stanju: tako sočasno zapuščanje trajno arhivirane skupine ne more izprazniti (R-01, R-02), prenos lastništva pa zamenja vlogi v
dveh stavkih (najprej znižanje, nato povišanje), ne da bi kršil indeks `group_member_one_owner` (R-03). `group_member.version` zadošča za
optimistično zaklepanje; migracija `V7__clani.sql` doda samo opaken identifikator člana (`id`, ker `app_user.id` ne sme v API) in sled zadnje spremembe
vloge (`updated_at`, `updated_by`) za opozorilo o konfliktu (R-04, R-06). Vmesnik dobi razdelek *Člani* v *Nastavitvah* z menijem dejanj in dvema
dialogoma ter razširi *Upravljanje skupine* z *Zapusti skupino* in *Prenesi lastništvo*. Odločitve: [research.md](research.md) (D-58).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`, Flyway; vmesnik: `react-router`, `radix-ui` Dialog in dropdown meni, `sonner`,
`@tabler/icons-react`, `react-i18next`) – brez novih knjižnic

**Storage**: PostgreSQL 18; migracija `V7__clani.sql` (3 stolpci v `group_member`; [data-model.md](data-model.md))

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije, sočasnost) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: seznam: 2 poizvedbi (stran + število), paginirano ≤ 100; pisalne operacije: 1 transakcija, ≤ 5 poizvedb (zaklep skupine, klicatelj,
cilj, sprememba, po potrebi štetje); SC-004 (≤ 4 dejanja) merjen z E2E

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, barve samo iz žetonov, brez zapisov v revizijsko sled (FR-005-06), brez sprememb pogodbe 002
(`GroupDetail`) in 003

**Scale/Scope**: 12 FR (FR-007-01 … FR-007-12), 5 endpointov, 0 novih poti (razdelek v obstoječih *Nastavitvah*), 1 migracija

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-007-01 … FR-007-12 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena; negativni scenariji so v testih. Nove kode (`OWNER_CANNOT_LEAVE`, `LAST_MEMBER_CANNOT_LEAVE`, `TARGET_NOT_MEMBER`) so že v feature-map §2.10. Edina nova koda polja je `UNCHANGED` (400, enaka vloga). |
| II. Test-first | BE: unit (`MemberRulesTest`, `MemberInputParserTest`), integracijski (`MemberListIT`, `MemberRoleChangeIT`, `MemberRemoveIT`, `MemberLeaveIT`, `OwnershipTransferIT`, `MemberConcurrencyIT`, `MemberAuditIT`), varnostni (`MemberIsolationMatrixSecurityIT`, `MemberRoleMatrixSecurityIT`, `FormerMemberSecurityIT`). FE: funkcionalni z MSW in `vitest-axe`. E2E `clani.spec.ts` (360/768/1280 px, sl in en). Pregled testov opravi agent `pregled-testov` pred kodo. |
| III. Group isolation and roles | Vseh pet endpointov je v matriki izolacije (401/404/403/2xx; arhivirana: 409 ali 2xx); `MemberRoleMatrixSecurityIT` preizkusi vse kombinacije vloge klicatelja, vloge cilja in dodeljene vloge (SC-005); `FormerMemberSecurityIT` preizkusi, da odstranjen/bivši član dobi 404 pri vsakem endpointu skupine 002–007 (SC-001). Pravila preverja strežnik (`MemberRules`); vmesnik akcij ne izriše (`canManage`). |
| IV. Accessible, bilingual, responsive UI | design.md 8.6, 8.9, 8.11, 8.13, 8.14, 9.7; dialogi: fokus na *Prekliči*, Esc, vrnitev fokusa; meni dejanj z dostopnim imenom, ki vsebuje člana; sl/en; axe v FE testih in E2E; preglednica pod 640 px zložena (8.6); 320 px. |
| V. Data integrity | Zaklep vrstice skupine + ponovno branje pod zaklepom (R-01); prenos lastništva v eni transakciji z vrstnim redom stavkov (R-03); optimistična verzija z dvojno zaščito (R-06); revizijska sled nespremenjena (R-09). Seznam paginiran. |
| VI. Privacy and GDPR | Nobenih novih osebnih podatkov; `memberId` je opaken, `app_user.id` ni v API; `updated_by` se ob izbrisu računa postavi na `NULL` (»izbrisan uporabnik«). |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Odločitve: D-58. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) migracija je potrebna samo zaradi `id` in sledi zadnje spremembe
(`version` je že v V3); (2) `GroupDetail` ostane nespremenjen – vmesnik število članov bere iz seznama članov (R-08); (3) 012 mora pri izbrisu računa zakleniti
skupine (R-10, opomba za plan 012).

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/members | VIEWER | allowed (`canManage` vedno false) | 200; telo `Members` | FR-007-01, FR-007-02 |
| PUT | /api/groups/{groupId}/members/{memberId} | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER/EDITOR 403) | 200; telo `Member` | FR-007-03, FR-007-04, FR-007-10 |
| DELETE | /api/groups/{groupId}/members/{memberId} | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER/EDITOR 403) | 204 | FR-007-05, FR-007-10 |
| POST | /api/groups/{groupId}/leave | VIEWER | allowed | 204 | FR-007-06, FR-007-07, FR-007-08 |
| POST | /api/groups/{groupId}/ownership-transfer | OWNER | rejected (409 GROUP_ARCHIVED; drugi 403) | 200; telo `GroupDetail` (002) | FR-007-09, FR-007-10 |

- `GET …/members` parametri `page` (od 0), `size` (1–100, privzeto 25), `lang` (`sl`/`en`); neveljavna vrednost → `400 VALIDATION_FAILED`. Odgovor:
  `{"total","page","size","deletedOwner","items":[Member]}`; `Member` = `{"id","name","email","role","version","self","canManage","updatedBy": UserRef|null,"updatedAt"}`.
  `deletedOwner: true` samo v trajno arhivirani skupini (vrstica »izbrisan uporabnik« ni v `items` in ne v `total`).
- `PUT …/members/{memberId}` telo `{"role": "ADMIN|EDITOR|VIEWER", "version": 0}`. Vrstni red: 401 → 404 (skupina/nečlan; `memberId` neveljaven ali ni v skupini) → 403
  (klicatelj pod ADMIN; cilj ni strogo nižji; cilj je klicatelj; `role` = OWNER, ali znana vloga, ki ni strogo nižja od klicateljeve) → 409 `GROUP_ARCHIVED` →
  409 `VERSION_CONFLICT` (telo `{"code","current": Member}`) → 400 `VALIDATION_FAILED` (`role`: `REQUIRED`, `INVALID_VALUE`, `UNCHANGED`; `version`: `REQUIRED`,
  `INVALID_VALUE`; neznano polje → `UNKNOWN_FIELD`; neveljaven JSON → `body: MALFORMED`).
- `DELETE …/members/{memberId}`: 401 → 404 → 403 (klicatelj pod ADMIN; cilj ni strogo nižji; cilj je klicatelj) → 409 `GROUP_ARCHIVED`. Drugič isti cilj → 404.
- `POST …/leave` (brez telesa): 401 → 404 → 409 `OWNER_CANNOT_LEAVE` → 409 `LAST_MEMBER_CANNOT_LEAVE` (trajno arhivirana skupina, število članov 1). Brez `GROUP_ARCHIVED`.
- `POST …/ownership-transfer` telo `{"memberId": "<uuid>"}`: 401 → 404 → 403 (klicatelj ni OWNER, tudi če je lastnika sočasno prevzel drug) → 409 `GROUP_ARCHIVED` →
  400 (`memberId`: `REQUIRED`, `INVALID_VALUE`; lasten `memberId` → `INVALID_VALUE`) → 409 `TARGET_NOT_MEMBER`. Cilj je lahko član s katero koli vlogo.
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `404` prazno telo; `403 {"code":"FORBIDDEN"}`; `400 {"code":"VALIDATION_FAILED","errors":[{"field","code"}]}`;
  `409 {"code":"…"}`. Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Nastavitve skupine (+ razdelek *Člani*, razširjeno *Upravljanje skupine*) (002, 003) | /groups/:groupId/settings | VIEWER (meni dejanj: ADMIN; *Prenesi lastništvo*: OWNER) | FR-007-01 … FR-007-12 |
| Seznam skupin (002) – cilj po zapustitvi | /groups | — | FR-007-06 |
| Stran »Te strani ni« (design.md 9.10) – odstranjeni član z odprto skupino | (obstoječa) | — | FR-007-05 |

- Nove poti ni. Po zapustitvi vmesnik preusmeri na `/groups` z obvestilom; odgovor 404 na kateri koli klic skupine že obravnava `GroupLayout` (strani »Te strani ni«).

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Opomba za teste: vrstični gumb menija ima vidno ikono in dostopno ime s članom; testi iščejo po polnem imenu. Razdelke iščemo z `within(region »…«)`.

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Nastavitve | region + heading (level 2) | »Člani« / "Members" | razdelek, viden vsem članom | FR-007-01 |
| Člani | table + columnheader | »Člani« / "Members"; »Član«, »E-naslov«, »Vloga«, »Dejanja« / "Member", "Email", "Role", "Actions" | preglednica (pod 640 px zložena, design.md 8.6) | FR-007-01 |
| Člani | cell | ime člana; lastna vrstica »Ana Novak (ti)« / "Ana Novak (you)"; vloga »Lastnik« / "Owner", »Admin«, »Urednik« / "Editor", »Bralec« / "Viewer" | podatki člana | FR-007-01 |
| Člani | row | »izbrisan uporabnik« / "deleted user" z vlogo »Lastnik« / "Owner" (ležeče, `muted`, brez e-naslova in dejanj) | trajno arhivirana skupina | FR-007-01 |
| Člani | button (`aria-haspopup="menu"`) | »Dejanja za člana Ana Novak« / "Actions for member Ana Novak" | odpre meni dejanj; samo ob `canManage` | FR-007-02 |
| Člani | menuitem | »Spremeni vlogo« / "Change role"; »Odstrani iz skupine« / "Remove from group" | dejanji | FR-007-03, FR-007-05 |
| Člani | navigation | »Strani rezultatov: Člani« / "Result pages: Members" | paginacija (vidna nad 25; 25 / 50 / 100) | FR-007-01 |
| Člani | status, alert + button | »Nalagam…« / "Loading…"; »Članov ni bilo mogoče naložiti. Poskusi znova.« / "Members could not be loaded. Please try again." + »Poskusi znova« | nalaganje, napaka | FR-007-01, FR-007-11 |
| Člani | alert | »Skupina je arhivirana, članov zdaj ni mogoče spreminjati.« / "The group is archived, members cannot be changed now."; »Tega člana ne moreš več upravljati.« / "You can no longer manage this member."; »Člana ni več v skupini.« / "This member is no longer in the group."; »Za to dejanje nimaš več pravic.«; »Ni povezave. Preveri povezavo in poskusi znova.« | napaka akcije; seznam se osveži pri 403/404 | FR-007-11 |
| Dialog vloge | dialog | »Spremenim vlogo člana Ana Novak?« / "Change the role of Ana Novak?" | potrditev; fokus ob odprtju na »Prekliči« | FR-007-03 |
| Dialog vloge | radiogroup + radio | »Vloga« / "Role"; »Admin« (samo lastnik), »Urednik«, »Bralec« – trenutna vloga označena, nikoli »Lastnik« | izbira nove vloge | FR-007-03 |
| Dialog vloge | button | »Prekliči« / "Cancel", »Spremeni vlogo« / "Change role" (nevarni) | gumba | FR-007-03 |
| Dialog vloge | text (`aria-describedby`) | »Izberi drugo vlogo.« / "Choose a different role." | napaka 400 `UNCHANGED` | FR-007-03 |
| Dialog vloge | alert | »Vlogo člana je medtem spremenil(a) Pia Kos ob 14.32.« / "The member's role was changed in the meantime by Pia Kos at 14:32." + gumba »Uporabi trenutno različico« / "Use current version", »Shrani moje spremembe« / "Save my changes" | konflikt verzij | FR-007-04 |
| Dialog odstranitve | dialog | »Odstranim Ana Novak iz skupine Projekt FERI?« / "Remove Ana Novak from Projekt FERI?" | potrditev; fokus na »Prekliči« | FR-007-05 |
| Dialog odstranitve | text, button | »Ana Novak ne bo več imel(a) dostopa do kontaktov skupine.« / "Ana Novak will no longer have access to the group's contacts."; »Prekliči«, »Odstrani člana« / "Remove member" | posledica, gumba | FR-007-05 |
| Ogrodje | region »Obvestila« | »Vloga člana Ana Novak je spremenjena v Admin.« / "Ana Novak's role was changed to Admin."; »Ana Novak je odstranjen(a) iz skupine.« / "Ana Novak was removed from the group."; »Zapustil(a) si skupino Projekt FERI.« / "You left Projekt FERI."; »Lastništvo je preneseno na Ana Novak.« / "Ownership was transferred to Ana Novak." | obvestila uspeha (Sonner, 5 s) | FR-007-03, -05, -06, -09, -11 |
| Upravljanje skupine | button | »Zapusti skupino« / "Leave group" | odpre dialog; ni izrisan za lastnika ali zadnjega člana trajno arhivirane skupine | FR-007-06 |
| Upravljanje skupine | text | »Kot lastnik lahko skupino zapustiš šele, ko preneseš lastništvo na drugega člana.« / "As the owner you can leave the group only after transferring ownership to another member."; »Kot zadnji član skupine je ne moreš zapustiti, lahko jo le izbrišeš.« / "As the last member you cannot leave the group, you can only delete it." | razlaga namesto gumba | FR-007-07, FR-007-08 |
| Dialog zapustitve | dialog | »Zapustim skupino Projekt FERI?« / "Leave Projekt FERI?" | potrditev; fokus na »Prekliči« | FR-007-06 |
| Dialog zapustitve | text, button | »Do kontaktov skupine ne boš imel(a) več dostopa, dokler te znova ne povabijo.« / "You will no longer have access to the group's contacts until you are invited again."; »Prekliči«, »Zapusti skupino« | posledica, gumba | FR-007-06 |
| Upravljanje skupine | button | »Prenesi lastništvo« / "Transfer ownership" | odpre dialog; samo lastnik nearhivirane skupine z več člani | FR-007-09 |
| Upravljanje skupine | text | »Lastništvo lahko preneseš, ko ima skupina še vsaj enega člana.« / "You can transfer ownership once the group has at least one more member." | razlaga namesto gumba (edini član) | FR-007-09 |
| Dialog prenosa | dialog | »Prenesem lastništvo skupine Projekt FERI?« / "Transfer ownership of Projekt FERI?" | potrditev; fokus na »Prekliči« | FR-007-09 |
| Dialog prenosa | combobox (select) | »Novi lastnik« / "New owner" | izbira enega od ostalih članov (ime + vloga) | FR-007-09 |
| Dialog prenosa | text | »Ana Novak bo postal(a) lastnik, ti pa boš admin.« / "Ana Novak will become the owner and you will become an admin." (po izbiri) | posledica | FR-007-09 |
| Dialog prenosa | textbox | »Za potrditev vpiši naslov skupine« / "Type the group title to confirm" | potrditev z naslovom (enaka primerjava kot v 003) | FR-007-09 |
| Dialog prenosa | text (`aria-describedby`, polje `aria-invalid`) | »Vpisani naslov se ne ujema z naslovom skupine.« / "The title you typed does not match the group title."; »Izberi člana.« / "Choose a member." | napaki ob polju brez pošiljanja | FR-007-09 |
| Dialog prenosa | button, alert | »Prekliči«, »Prenesi lastništvo« (nevarni); »Izbrani uporabnik ni več član skupine.« / "The selected user is no longer a member of the group." | gumba, napaka 409 `TARGET_NOT_MEMBER` | FR-007-09, FR-007-11 |
| Upravljanje skupine | alert | »Kot lastnik skupine ne moreš zapustiti.«; »Skupina je arhivirana, članov zdaj ni mogoče spreminjati.«; »Ni povezave. …« / sl+en pari | napake zapustitve in prenosa (409 `OWNER_CANNOT_LEAVE`, `LAST_MEMBER_CANNOT_LEAVE`, `GROUP_ARCHIVED`, 403, 404) | FR-007-11 |

- Vrstni red v *Nastavitvah* (design.md 9.7): *Podatki skupine* → **Člani** → *Povabi člana* → *Čakajoča povabila* → *Upravljanje skupine*.
- Po uspešni spremembi vloge ali odstranitvi se seznam ponovno naloži; fokus preide na naslov razdelka *Člani* (element s fokusom je izginil ali se je spremenil).
  Po prenosu lastništva se *Nastavitve* osvežijo (vloga ADMIN, razdelka *Povabi člana* in *Člani* po pravilih admina). Po zapustitvi: `/groups` z naslovom `h1` v fokusu.
- Dialog vloge pošlje verzijo vrstice; *Shrani moje spremembe* ponovno pošlje izbiro nad `current.version`, *Uporabi trenutno različico* nastavi izbiro na `current.role`.

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni / sočasnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-007-01 | `MemberListIT`, `MemberIsolationMatrixSecurityIT` | `MembersSection.test` | `clani.spec` |
| FR-007-02 | `MemberListIT` (`canManage`), `MemberRulesTest` | `MembersSection.test` | `clani.spec` |
| FR-007-03 | `MemberRoleChangeIT`, `MemberRoleMatrixSecurityIT`, `MemberRulesTest`, `MemberInputParserTest`, `MemberIsolationMatrixSecurityIT` | `ChangeRoleDialog.test` | `clani.spec` |
| FR-007-04 | `MemberRoleChangeIT`, `MemberConcurrencyIT` | `ChangeRoleDialog.test` | `clani.spec` |
| FR-007-05 | `MemberRemoveIT`, `MemberRoleMatrixSecurityIT`, `FormerMemberSecurityIT`, `MemberIsolationMatrixSecurityIT` | `RemoveMemberDialog.test` | `clani.spec` |
| FR-007-06 | `MemberLeaveIT`, `FormerMemberSecurityIT`, `MemberIsolationMatrixSecurityIT` | `LeaveGroup.test` | `clani.spec` |
| FR-007-07 | `MemberLeaveIT` | `LeaveGroup.test` | `clani.spec` |
| FR-007-08 | `MemberLeaveIT`, `MemberConcurrencyIT` | `LeaveGroup.test` | – |
| FR-007-09 | `OwnershipTransferIT`, `MemberConcurrencyIT`, `MemberIsolationMatrixSecurityIT` | `TransferOwnership.test` | `clani.spec` |
| FR-007-10 | `MemberRoleChangeIT`, `MemberRemoveIT`, `OwnershipTransferIT`, `MemberLeaveIT`, `MemberIsolationMatrixSecurityIT` | `MembersSection.test`, `TransferOwnership.test` | – |
| FR-007-11 | – | `MembersSection.test`, `ChangeRoleDialog.test`, `RemoveMemberDialog.test`, `LeaveGroup.test`, `TransferOwnership.test` | `clani.spec` |
| FR-007-12 | `MemberAuditIT` | – | `clani.spec` (odstranjen urednik v sledi) |

Merljiva merila: SC-001 – `FormerMemberSecurityIT`; SC-002 – `MemberConcurrencyIT`; SC-003 – `MemberConcurrencyIT`, `OwnershipTransferIT`; SC-004 – `clani.spec`;
SC-005 – `MemberRulesTest`, `MemberRoleMatrixSecurityIT`; SC-006 – axe v vseh FE testih in E2E v sl **in** en pri 360/768/1280 px (in 320 px). Obstoječe testne
datoteke 002/003 (`SettingsPage`, `GroupManagementSection.test`) morajo ostati zelene brez sprememb; če izvedba zahteva spremembo, velja workflow §2.2 (vnos v `DECISIONS.md`).

## Project Structure

### Documentation (this feature)

```text
specs/007-clani/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/resources/db/migration/V7__clani.sql
backend/src/main/java/si/contactmanager/
├── member/
│   ├── MemberController.java          # GET/PUT/DELETE …/members, POST …/leave, POST …/ownership-transfer
│   ├── MemberService.java             # transakcije: zaklep skupine, ponovno branje, pravila (R-01 – R-03, R-06)
│   ├── MemberRepository.java          # JdbcClient: lockGroup, find*, page, count, updateRole, delete, demote/promote
│   ├── MemberRules.java               # čista funkcija: »le nižjim od sebe«, dovoljene vloge, canManage (unit test)
│   ├── MemberInputParser.java         # telesi PUT (role, version) in POST (memberId); napake po poljih
│   └── {Member, Members, MemberState}.java
└── shared/error/{OwnerCannotLeave, LastMemberCannotLeave, TargetNotMember}Exception.java + ApiExceptionHandler (3 kode)
backend/src/test/java/si/contactmanager/member/
├── {MemberListIT, MemberRoleChangeIT, MemberRemoveIT, MemberLeaveIT, OwnershipTransferIT, MemberConcurrencyIT, MemberAuditIT}.java
├── {MemberIsolationMatrixSecurityIT, MemberRoleMatrixSecurityIT, FormerMemberSecurityIT}.java
├── {MemberRulesTest, MemberInputParserTest}.java
└── support/MemberFixtures.java        # addMember(group, user, role), roleOf, versionOf, count, makePermanentlyArchived; + GroupFixtures, InvitationFixtures

frontend/src/features/members/
├── api.ts, types.ts                   # createMembersApi: list, changeRole, remove, leave, transferOwnership; useMemberCount
├── MembersSection.tsx, MemberRow.tsx, MemberActionsMenu.tsx
├── ChangeRoleDialog.tsx, MemberConflictAlert.tsx, RemoveMemberDialog.tsx
├── LeaveGroupDialog.tsx, TransferOwnershipDialog.tsx
├── memberMessages.ts                  # koda napake → sporočilo (sl/en)
└── *.test.tsx (MembersSection, ChangeRoleDialog, RemoveMemberDialog, LeaveGroup, TransferOwnership)
frontend/src/features/groups/{SettingsPage.tsx, GroupManagementSection.tsx}   # + razdelek, + Zapusti skupino / Prenesi lastništvo (R-08)
frontend/src/i18n/{sl,en}.json         # ključi members.*
frontend/src/test/membersApi.ts        # MSW rokovalniki in stanje članov

e2e/tests/clani.spec.ts, e2e/tests/support/members.ts (pomožni SQL: dodajanje članov z vlogami, trajno arhivirana skupina)
```

**Structure Decision**: obstoječa struktura iz 000–006; nov paket `member` v zaledju in `features/members` v vmesniku, ker razdelek *Člani* in dejanji
zapuščanja/prenosa sodijo v *Nastavitve* skupine, a imajo lastna pravila in testne sklope. Dostop do skupine preko javnega `GroupAccess` iz paketa `group`;
zaklep vrstice skupine ima `MemberRepository` sam (kot `InvitationRepository`, `ContactRepository`, `AuditRepository`).

## Complexity Tracking

Ni kršitev konstitucije. Edino odstopanje je migracija V7, ki je potrebna (opaken `memberId`, sled spremembe vloge) in obsega tri stolpce brez novih tabel (R-04).
