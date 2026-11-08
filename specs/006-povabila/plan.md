# Implementation Plan: Povabila v skupino

**Branch**: `povabila` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-povabila/spec.md`

## Summary

Nova tabela `invitation` (migracija `V6__povabila.sql`) z enim čakajočim povabilom na par (skupina, povabljeni); obdelano ali umaknjeno
povabilo se izbriše. Zaledje dobi paket `invitation` s tremi endpointi, vezanimi na skupino (pošiljanje, seznam čakajočih povabil skupine,
umik), in štirimi, vezanimi na uporabnika (seznam prejetih, število, sprejem, zavrnitev). Dostop do skupine preveri `GroupAccess` (D-27);
pošiljanje in sprejem se serializirata z zaklepom vrstice skupine (kot arhiviranje in izbris v 003), da se pravila arhiviranja, članstva in
izbrisa skupine ne morejo razminiti. Sprejem in umik sta dovoljena tudi v arhivirani skupini (D-54). Vmesnik dobi povezavo *Povabila* s
številom v zgornji vrstici, stran *Povabila* (`/invitations`) z dialogom zavrnitve in razdelka *Povabi člana* ter *Čakajoča povabila* v
*Nastavitvah* skupine z dialogom umika. Odločitve so v [research.md](research.md) (D-55).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`, Flyway; vmesnik: `react-router`, `radix-ui` Dialog,
`sonner`, `@tabler/icons-react`, `react-i18next`) – brez novih knjižnic

**Storage**: PostgreSQL 18; nova migracija `V6__povabila.sql` (tabela `invitation`; [data-model.md](data-model.md))

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: pošiljanje: 1 transakcija, največ 6 poizvedb; sprejem: 1 transakcija, največ 5 poizvedb (iskanje, zaklep skupine, prevzem povabila, članstvo, odgovor); seznami največ 100 vrstic,
2 poizvedbi; število povabil 1 poizvedba po indeksu (kliče se ob vsakem prehodu med stranmi); SC-001 (< 30 s) in SC-002 (3 dejanja) merjena z E2E

**Constraints**: WCAG 2.1 AA, sl/en, optimistične verzije niso potrebne (spec *Assumptions*), izolacija skupin, barve samo iz žetonov,
brez vnosov v revizijsko sled (FR-005-06)

**Scale/Scope**: 16 FR (FR-006-01 … FR-006-16), 7 endpointov, 1 nova pot, 1 migracija

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-006-01 … FR-006-16 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena. Negativni scenariji iz spec so v testih. Nove kode napak niso potrebne (vse so že v feature-map §2.10). |
| II. Test-first | BE: unit (`InvitationInputParserTest`), integracijski (`InvitationCreateIT`, `InvitationCreateRulesIT`, `OutgoingInvitationListIT`, `InvitationWithdrawIT`, `ReceivedInvitationListIT`, `InvitationAcceptIT`, `InvitationDeclineIT`, `InvitationConcurrencyIT`, `InvitationAuditIT`), varnostni (`InvitationIsolationMatrixSecurityIT`, `ReceivedInvitationSecurityIT`). FE: funkcionalni z MSW in `vitest-axe` (`InvitationsLink`, `InvitationsPage`, `InvitationAccept`, `InvitationDecline`, `InviteMemberSection`, `PendingInvitations`, `WithdrawInvitation`). E2E `povabila.spec.ts` pri 360/768/1280 px. Pregled testov opravi agent `pregled-testov` pred kodo. |
| III. Group isolation and roles | Trije endpointi skupine so v matriki izolacije (401/404/403/2xx, arhivirana: pošiljanje 409, seznam in umik 2xx). Endpointi uporabnika: 401, tuj vir 404 (feature-map §2.2). Pravilo »le nižjim od sebe« za ponujeno vlogo in umik preveri strežnik; vmesnik akcij ne izriše (`canWithdraw`, izbirni gumbi). |
| IV. Accessible, bilingual, responsive UI | design.md 7.1, 8.4, 8.5, 8.6, 8.9–8.13, 8.15, 9.7, 9.8; dialoga: fokus na *Prekliči*, Esc, vrnitev fokusa; dostopna imena vrstičnih gumbov vsebujejo skupino oz. e-naslov; vsa besedila v sl/en (množinske oblike za število); axe v FE testih in E2E v sl **in** en (SC-006); preglednica pod 640 px zložena (8.6). |
| V. Data integrity | Sprejem (dodajanje člana + izbris povabila) je ena transakcija pod zaklepom vrstice skupine (R-04); en čakajoči par zagotovi unikatni ključ (R-02); sočasni odzivi: drugi dobi 404 (R-05). Revizijska sled se ne spremeni (R-10). Seznami paginirani. |
| VI. Privacy and GDPR | Nova osebna podatka nista shranjena: povabilo hrani samo reference (`invitee_id`, `inviter_id`). Izbris računa povabljenega izbriše njegova povabila (`ON DELETE CASCADE`), izbris povabitelja ga nadomesti z »izbrisan uporabnik« (`ON DELETE SET NULL`). Izvoz (012) bere prejeta in poslana povabila iz iste tabele (data-model.md). |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Odločitve: D-55. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) sprememba feature-map §2.4 (sprejem, zavrnitev in
umik v arhivirani skupini) je zabeležena v D-54; (2) 006 doda zgornji vrstici (001) povezavo in ponudnika števila povabil v `AppShell` –
sprememba datoteke 001, opisana v R-08.

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/invitations | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER/EDITOR 403) | 201; telo `OutgoingInvitation` | FR-006-02, FR-006-03 |
| GET | /api/groups/{groupId}/invitations | ADMIN | allowed | 200; telo `OutgoingInvitations` | FR-006-13 |
| DELETE | /api/groups/{groupId}/invitations/{invitationId} | ADMIN (povabilo z vlogo ADMIN: OWNER) | allowed | 204 | FR-006-14, FR-006-16 |
| GET | /api/invitations | — (prijavljen) | vrne tudi povabila v arhivirane skupine (`group.archived`) | 200; telo `ReceivedInvitations` | FR-006-05, FR-006-07, FR-006-12 |
| GET | /api/invitations/count | — (prijavljen) | šteje tudi povabila v arhivirane skupine | 200; telo `{"count": 3}` | FR-006-06, FR-006-12 |
| POST | /api/invitations/{invitationId}/accept | — (povabljeni) | allowed | 200; telo `AcceptedInvitation` | FR-006-08, FR-006-09, FR-006-11, FR-006-12 |
| POST | /api/invitations/{invitationId}/decline | — (povabljeni) | allowed | 204 | FR-006-10, FR-006-11 |

- `POST …/invitations` telo: `{"email": "ana@primer.si", "role": "EDITOR"}`. Vrstni red: 401 → 404 (nečlan) → 403 (vloga pod ADMIN; ali
  `role` je znana vloga, ki ni strogo nižja od klicateljeve, vključno z `OWNER`) → 409 `GROUP_ARCHIVED` → 400 `VALIDATION_FAILED`
  (`email`: `REQUIRED`, `INVALID_VALUE`, `TOO_LONG`; `role`: `REQUIRED`, `INVALID_VALUE`; neznano polje → `UNKNOWN_FIELD`; neveljaven
  JSON → `body: MALFORMED`; kode kot v 002/004) → 409
  `CANNOT_INVITE_SELF` → `INVITEE_NOT_REGISTERED` → `ALREADY_MEMBER` → `INVITATION_ALREADY_PENDING`.
- `GET …/invitations` (skupina in uporabnik) parametra `page` (od 0), `size` (1–100, privzeto 25); neveljavna vrednost → `400 VALIDATION_FAILED`.
  Odgovor: `{"total","page","size","items":[…]}`, urejeno po `createdAt` padajoče, nato po `id` padajoče.
- `OutgoingInvitation`: `{"id","inviteeEmail","role","invitedBy": UserRef|null,"createdAt","canWithdraw"}`; `canWithdraw` = klicatelj je
  OWNER ali (ADMIN in `role` ≠ `ADMIN`). `ReceivedInvitation`: `{"id","group":{"id","title","color","archived"},"role","invitedBy": UserRef|null,"createdAt"}`.
  `invitedBy: null` = izbrisan uporabnik (§2.5). `AcceptedInvitation`: `{"groupId","title","role","archived"}`.
- `DELETE …/invitations/{invitationId}`: 401 → 404 (nečlan) → 403 (vloga pod ADMIN) → 404 (povabilo ne obstaja v tej skupini; neveljaven
  uuid) → 403 (ADMIN in povabilo z vlogo ADMIN).
- `accept`: 401 → 404 (ni povabilo klicatelja, ne obstaja, neveljaven uuid; izbrisana skupina) → 409 `ALREADY_MEMBER` (povabilo je
  izbrisano, članstvo nespremenjeno). `decline`: 401 → 404. Brez telesa zahteve.
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `404` prazno telo; `403 {"code":"FORBIDDEN"}`; `400 {"code":"VALIDATION_FAILED","errors":[{"field","code"}]}`;
  `409 {"code":"…"}`. Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Povabila | /invitations | — (prijavljen) | FR-006-05, FR-006-07 … FR-006-12 |
| Nastavitve skupine (+ *Povabi člana*, *Čakajoča povabila*) (002) | /groups/:groupId/settings | VIEWER (razdelka: ADMIN) | FR-006-01 … FR-006-04, FR-006-13 … FR-006-16 |
| Ogrodje – zgornja vrstica (001) | vsi prijavljeni zasloni | — | FR-006-06 |

- Naslov strani: »Povabila – Kontakti« / "Invitations – Contacts".
- Povezava »Odpri skupino« vodi na `/groups/:groupId` (po sprejemu v arhivirano skupino prav tako; skupina je v *Arhiviranih skupinah*).
- Število povabil se osveži ob nalaganju ogrodja, ob vsaki spremembi poti in po sprejemu, zavrnitvi ali odgovoru 404 na strani *Povabila* (R-08).

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Opomba za teste: vrstični gumbi imajo vidno kratko besedilo in dostopno ime s predmetom (vizualno skrit del, ime se začne z vidnim
besedilom – WCAG 2.5.3); testi iščejo po polnem imenu. Razdelke iščemo z `within(region »…«)`.

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Zgornja vrstica | link | »Povabila« / "Invitations" (0 povabil); »Povabila, 1 novo« / »2 novi« / »3 nova« / »5 novih« – "Invitations, 1 new" / "Invitations, 3 new" | odpre `/invitations`; vidno »Povabila (3)«, pod 640 px ikona `IconMail` in število; `aria-current="page"` na `/invitations` | FR-006-06 |
| Povabila | heading (level 1) | »Povabila« / "Invitations" | naslov zaslona | FR-006-05 |
| Povabila | list | »Prejeta povabila« / "Received invitations" | seznam; vsak `listitem` je eno povabilo | FR-006-05 |
| Povabila (vrstica) | heading (level 2) | naslov skupine (barvni jeziček `aria-hidden`) | skupina povabila | FR-006-05 |
| Povabila (vrstica) | text | »Povabil(a): Ana Novak« / "Invited by: Ana Novak"; »Povabil(a): izbrisan uporabnik« / "Invited by: deleted user" (ležeče, `muted`); »Vloga: Urednik« / "Role: Editor" (predpona vizualno skrita); datum v `<time>` v zapisu jezika | podatki povabila (design.md 8.5, 9.8) | FR-006-05, FR-006-07 |
| Povabila (vrstica) | text | »Arhivirano« / "Archived"; »Skupina je arhivirana – po sprejemu jo boš lahko le pregledoval(a).« / "This group is archived – after accepting you will only be able to view it." | povabilo v arhivirano skupino | FR-006-07 |
| Povabila (vrstica) | button | »Sprejmi povabilo v skupino Projekt FERI« / "Accept invitation to Projekt FERI" (vidno »Sprejmi povabilo« / "Accept invitation") | primarna akcija | FR-006-08, FR-006-09 |
| Povabila (vrstica) | button | »Zavrni povabilo v skupino Projekt FERI« / "Decline invitation to Projekt FERI" (vidno »Zavrni« / "Decline") | odpre dialog zavrnitve | FR-006-10 |
| Povabila | heading (level 2) + text | »Nimaš novih povabil.« / "You have no new invitations."; »Ko te kdo povabi v skupino, bo povabilo tukaj.« / "When someone invites you to a group, the invitation will appear here." | prazno stanje | FR-006-05 |
| Povabila | navigation | »Strani rezultatov: Povabila« / "Result pages: Invitations" | paginacija (vidna nad 25), kot 003: »Prejšnja«/»Naslednja«, `combobox` »Velikost strani«, `status` »1–25 od 30« | FR-006-05 |
| Povabila | status | »Nalagam…« / "Loading…" | nalaganje | FR-006-05 |
| Povabila | alert + button | »Povabil ni bilo mogoče naložiti. Poskusi znova.« / "Invitations could not be loaded. Please try again."; »Poskusi znova« / "Try again" | napaka nalaganja | FR-006-05 |
| Povabila | alert | »Povabilo ni več na voljo.« / "This invitation is no longer available." (404; seznam in število se osvežita); »Že si član te skupine.« / "You are already a member of this group." (409 `ALREADY_MEMBER`); »Povabila ni bilo mogoče sprejeti. Poskusi znova.« / "The invitation could not be accepted. Please try again."; »Povabila ni bilo mogoče zavrniti. Poskusi znova.« / "The invitation could not be declined. Please try again."; »Ni povezave. Preveri povezavo in poskusi znova.« | napaka akcije nad seznamom (design.md 8.13) | FR-006-08, FR-006-10, FR-006-11 |
| Dialog zavrnitve | dialog | »Zavrnem povabilo v skupino Projekt FERI?« / "Decline the invitation to Projekt FERI?" | potrditev; fokus ob odprtju na »Prekliči« | FR-006-10 |
| Dialog zavrnitve | text, button | »Ne boš postal(a) član skupine. Skupina te lahko znova povabi.« / "You will not join the group. The group can invite you again."; »Prekliči« / "Cancel", »Zavrni povabilo« / "Decline invitation" | posledica, gumba | FR-006-10 |
| Nastavitve | region + heading (level 2) | »Povabi člana« / "Invite a member" | razdelek (ADMIN+, nearhivirana skupina) | FR-006-01 |
| Povabi člana | textbox | »E-naslov« / "Email" (`type="email"`, `autocomplete="off"`, `aria-required`) | e-naslov povabljenega | FR-006-01, FR-006-02 |
| Povabi člana | radiogroup + radio | »Vloga« / "Role"; »Admin« (samo OWNER), »Urednik«, »Bralec« / "Admin", "Editor", "Viewer"; brez privzete izbire | ponujena vloga | FR-006-01 |
| Povabi člana | button | »Pošlji povabilo« / "Send invitation" | pošlje obrazec | FR-006-02 |
| Povabi člana | text (`aria-describedby`, polje `aria-invalid`) | *E-naslov*: »Vpiši e-naslov.« / "Enter an email address."; »Vpiši veljaven e-naslov.« / "Enter a valid email address."; »E-naslov je predolg (največ 254 znakov).« / "The email address is too long (at most 254 characters)."; »Uporabnik s tem e-naslovom ni registriran.« / "No registered user has this email address."; »Ta uporabnik je že član skupine.« / "This user is already a member of the group."; »Ta uporabnik že ima povabilo v to skupino.« / "This user already has an invitation to this group."; »Sebe ne moreš povabiti.« / "You cannot invite yourself." · *Vloga*: »Izberi vlogo.« / "Choose a role." | napake ob polju (FE preveri prazno/obliko/dolžino pred pošiljanjem, strežnik isto) | FR-006-03 |
| Povabi člana | alert | »Povabila ni bilo mogoče poslati. Poskusi znova.« / "The invitation could not be sent. Please try again."; »Za to dejanje nimaš več pravic.« / "You no longer have permission for this action."; »Skupina je medtem postala arhivirana, zato povabil ni več mogoče pošiljati.« / "The group has been archived in the meantime, so invitations can no longer be sent." (skupina se ponovno naloži); »Ni povezave. …« | napaka akcije | FR-006-02, FR-006-04 |
| Nastavitve | region + heading (level 2) | »Čakajoča povabila« / "Pending invitations" | razdelek (ADMIN+, tudi v arhivirani skupini) | FR-006-13 |
| Čakajoča povabila | table + columnheader | »Čakajoča povabila« / "Pending invitations"; »Povabljeni«, »Vloga«, »Povabil(a)«, »Datum«, »Dejanja« / "Invitee", "Role", "Invited by", "Date", "Actions" | seznam (pod 640 px zložen, design.md 8.6) | FR-006-13 |
| Čakajoča povabila | button | »Umakni povabilo za ana@primer.si« / "Withdraw invitation for ana@primer.si" (vidno »Umakni povabilo« / "Withdraw invitation"; tihi gumb) | odpre dialog umika; samo ob `canWithdraw` | FR-006-14 |
| Čakajoča povabila | text | »Ni čakajočih povabil.« / "No pending invitations."; »izbrisan uporabnik« / "deleted user" v stolpcu *Povabil(a)* | prazno stanje, izbrisan povabitelj | FR-006-13 |
| Čakajoča povabila | navigation | »Strani rezultatov: Čakajoča povabila« / "Result pages: Pending invitations" | paginacija (vidna nad 25) | FR-006-13 |
| Čakajoča povabila | status, alert | »Nalagam…«; »Povabil ni bilo mogoče naložiti. Poskusi znova.« + »Poskusi znova« | nalaganje, napaka nalaganja | FR-006-13 |
| Čakajoča povabila | alert | »Povabilo ni več na voljo.« (404; seznam se osveži); »Povabila ni bilo mogoče umakniti. Poskusi znova.« / "The invitation could not be withdrawn. Please try again."; »Za to dejanje nimaš več pravic.«; »Ni povezave. …« | napaka umika | FR-006-14, FR-006-16 |
| Dialog umika | dialog | »Umaknem povabilo za ana@primer.si?« / "Withdraw the invitation for ana@primer.si?" | potrditev; fokus ob odprtju na »Prekliči« | FR-006-15 |
| Dialog umika | text, button | »Uporabnik povabila ne bo več videl. Lahko ga znova povabiš.« / "The user will no longer see the invitation. You can invite them again."; »Prekliči« / "Cancel", »Umakni povabilo« / "Withdraw invitation" | posledica, gumba | FR-006-15 |
| Ogrodje | region »Obvestila« | »Povabilo je poslano.« / "Invitation sent."; »Pridružil(a) si se skupini Projekt FERI.« / "You joined Projekt FERI." + link »Odpri skupino« / "Open group"; »Povabilo je zavrnjeno.« / "Invitation declined."; »Povabilo je umaknjeno.« / "Invitation withdrawn." | obvestila uspeha (Sonner, 5 s) | FR-006-04, FR-006-08, FR-006-10, FR-006-15 |

- Vrstni red v *Nastavitvah* (design.md 9.7): *Podatki skupine* → (*Člani*, 007) → *Povabi člana* → *Čakajoča povabila* → *Upravljanje skupine*.
- Po uspešnem pošiljanju fokus ostane na polju *E-naslov* (FR-006-04), seznam *Čakajoča povabila* se ponovno naloži (prva stran).
- Po sprejemu ali zavrnitvi fokus preide na naslednje povabilo na seznamu, sicer na naslov `h1` (izgine element s fokusom); po umiku na
  naslov razdelka *Čakajoča povabila*.

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-006-01 | – (vloga iz `GroupDetail`, 002) | `InviteMemberSection.test` | `povabila.spec` |
| FR-006-02 | `InvitationCreateIT`, `InvitationCreateRulesIT`, `InvitationIsolationMatrixSecurityIT` | `InviteMemberSection.test` | `povabila.spec` |
| FR-006-03 | `InvitationCreateRulesIT`, `InvitationInputParserTest`, `InvitationConcurrencyIT` | `InviteMemberSection.test` | `povabila.spec` |
| FR-006-04 | – | `InviteMemberSection.test` | `povabila.spec` |
| FR-006-05 | `ReceivedInvitationListIT`, `ReceivedInvitationSecurityIT` | `InvitationsPage.test` | `povabila.spec` |
| FR-006-06 | `ReceivedInvitationListIT` (count) | `InvitationsLink.test` | `povabila.spec` |
| FR-006-07 | `ReceivedInvitationListIT` | `InvitationsPage.test` | – |
| FR-006-08 | `InvitationAcceptIT` | `InvitationAccept.test` | `povabila.spec` |
| FR-006-09 | `InvitationAcceptIT` | `InvitationAccept.test` | `povabila.spec` |
| FR-006-10 | `InvitationDeclineIT` | `InvitationDecline.test` | `povabila.spec` |
| FR-006-11 | `ReceivedInvitationSecurityIT`, `InvitationConcurrencyIT` | `InvitationAccept.test`, `InvitationDecline.test` | – |
| FR-006-12 | `ReceivedInvitationListIT`, `InvitationAcceptIT` | – | – |
| FR-006-13 | `OutgoingInvitationListIT`, `InvitationIsolationMatrixSecurityIT` | `PendingInvitations.test` | `povabila.spec` |
| FR-006-14 | `InvitationWithdrawIT`, `InvitationIsolationMatrixSecurityIT` | `PendingInvitations.test`, `WithdrawInvitation.test` | `povabila.spec` |
| FR-006-15 | `InvitationWithdrawIT` | `WithdrawInvitation.test` | `povabila.spec` |
| FR-006-16 | `InvitationWithdrawIT`, `InvitationConcurrencyIT` | `WithdrawInvitation.test` | – |

Merljiva merila: SC-001, SC-002, SC-007 – `povabila.spec`; SC-003 – `InviteMemberSection.test` (vseh pet razlogov v sl in en);
SC-004 – `ReceivedInvitationSecurityIT`, `InvitationIsolationMatrixSecurityIT`, `InvitationConcurrencyIT`; SC-005 – `InvitationsLink.test`,
`povabila.spec`; SC-006 – axe v vseh FE testih in E2E v sl in en pri 360/768/1280 px. Revizijska sled ostane nespremenjena –
`InvitationAuditIT` (FR-005-06).

## Project Structure

### Documentation (this feature)

```text
specs/006-povabila/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/resources/db/migration/V6__povabila.sql
backend/src/main/java/si/contactmanager/
├── invitation/
│   ├── GroupInvitationController.java    # POST/GET /api/groups/{groupId}/invitations, DELETE …/{invitationId}
│   ├── InvitationController.java         # GET /api/invitations, /count, POST …/accept, …/decline
│   ├── InvitationService.java            # pravila, vrstni red preverjanj, transakcije (zaklep skupine, R-04)
│   ├── InvitationRepository.java         # JdbcClient; lockGroup, insert, page*, count*, claim/delete, addMember
│   ├── InvitationInputParser.java        # telo POST (email, role), napake po poljih
│   └── {OutgoingInvitation, OutgoingInvitations, ReceivedInvitation, ReceivedInvitations, InvitationGroup, AcceptedInvitation, InvitationCount}.java
└── shared/error/{CannotInviteSelf, InviteeNotRegistered, AlreadyMember, InvitationAlreadyPending}Exception.java + ApiExceptionHandler (4 kode)
backend/src/test/java/si/contactmanager/invitation/
├── {InvitationCreateIT, InvitationCreateRulesIT, OutgoingInvitationListIT, InvitationWithdrawIT, ReceivedInvitationListIT}.java
├── {InvitationAcceptIT, InvitationDeclineIT, InvitationConcurrencyIT, InvitationAuditIT}.java
├── {InvitationIsolationMatrixSecurityIT, ReceivedInvitationSecurityIT}.java
├── InvitationInputParserTest.java
└── support/InvitationFixtures.java       # invite(group, invitee, inviter, role), exists, count; + GroupFixtures (002/003)

frontend/src/
├── app/App.tsx                           # + pot invitations
├── features/invitations/
│   ├── api.ts, types.ts                  # createInvitationsApi: send, listOutgoing, withdraw, listReceived, count, accept, decline
│   ├── InvitationsProvider.tsx, invitationsContext.ts   # število za zgornjo vrstico, refresh() (R-08)
│   ├── InvitationsLink.tsx               # povezava v zgornji vrstici
│   ├── InvitationsPage.tsx, InvitationItem.tsx, DeclineInvitationDialog.tsx
│   ├── InviteMemberSection.tsx, PendingInvitationsSection.tsx, WithdrawInvitationDialog.tsx
│   └── *.test.tsx (InvitationsLink, InvitationsPage, InvitationAccept, InvitationDecline, InviteMemberSection, PendingInvitations, WithdrawInvitation)
├── features/groups/SettingsPage.tsx      # + razdelka (vrstni red zgoraj)
├── features/groups/SectionPagination.tsx # ponovna uporaba (ime navigacije kot parameter, če ga še ni)
├── shared/layout/AppShell.tsx            # + InvitationsProvider, InvitationsLink (001)
├── i18n/{sl,en}.json                     # ključi invitations.*, title.invitations, toast
└── test/invitationsApi.ts                # MSW rokovalniki in stanje povabil

e2e/tests/povabila.spec.ts, e2e/tests/support/invitations.ts (pomožni SQL za pripravo stanj, npr. izbrisan povabitelj)
```

**Structure Decision**: obstoječa struktura iz 000–005; nov paket `invitation` v zaledju in `features/invitations` v vmesniku, ker se
povabila uporabljajo na dveh mestih (stran *Povabila* in *Nastavitve* skupine) in v ogrodju. Skupinski del uporablja javni `GroupAccess`
iz paketa `group`; zaklep vrstice skupine ima `InvitationRepository` sam (kot `ContactRepository` in `AuditRepository`).

## Complexity Tracking

Ni kršitev konstitucije.
