---

description: "Tasks for 006-povabila (tests mandatory, independent test review)"
---

# Tasks: Povabila v skupino

**Input**: `specs/006-povabila/` – spec.md (s pojasnili 2026-11-08), plan.md (*Public Interfaces*), research.md (R-01 … R-12),
data-model.md, contracts/openapi.yaml, quickstart.md; odločitve D-54, D-55, D-56

**Tests**: obvezni (konstitucija II). Vsak FR-006-01 … FR-006-16 ima vsaj eno testno nalogo. Testi pred kodo, nato pregled
neodvisnega agenta `pregled-testov` (workflow.md §4.2).

**Organization**: Setup → Foundational → Tests → Test review → US1 … US6 → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Imena endpointov, poti, dostopnih imen in sporočil so **samo** iz plan.md (*Public Interfaces*); oblike odgovorov iz contracts/openapi.yaml.
- Testi nosijo FR-ID (`@Tag("FR-006-02")`; Vitest/Playwright v imenu testa `"FR-006-02: …"`).
- Revizijska sled se v 006 nikoli ne piše (FR-005-06, research R-10).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] FR-006-02 FR-006-08 FR-006-12 FR-006-14 Migracija backend/src/main/resources/db/migration/V6__povabila.sql dobesedno po data-model.md: tabela `invitation` (`id uuid PRIMARY KEY DEFAULT uuidv7()`, `group_id uuid NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE`, `invitee_id bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE`, `inviter_id bigint REFERENCES app_user (id) ON DELETE SET NULL`, `role varchar(6) NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER'))`, `created_at timestamptz NOT NULL DEFAULT now()`, `CONSTRAINT invitation_one_pending UNIQUE (group_id, invitee_id)`), indeksa `invitation_invitee_created (invitee_id, created_at DESC, id DESC)` in `invitation_inviter (inviter_id)`; uvodni komentar s sklicem na specs/006-povabila/data-model.md
- [X] T002 [P] FR-006-01 … FR-006-16 i18n ključi za vsa besedila, dostopna imena, sporočila napak, obvestila in naslov strani iz plan.md (*Key elements and accessible names*) v frontend/src/i18n/sl.json in en.json: `invitations.link.*` (množinske oblike i18next: sl `_one` »1 novo«, `_two` »2 novi«, `_few` »3 nova«, `_other` »5 novih«; en `_one`/`_other`), `invitations.page.*`, `invitations.item.*`, `invitations.declineDialog.*`, `invitations.invite.*` (polje, vloge, napake ob polju za `REQUIRED`, `INVALID_VALUE`, `TOO_LONG`, `CANNOT_INVITE_SELF`, `INVITEE_NOT_REGISTERED`, `ALREADY_MEMBER`, `INVITATION_ALREADY_PENDING`), `invitations.pending.*`, `invitations.withdrawDialog.*`, `invitations.errors.*`, `invitations.toast.*`, `title.invitations` (»Povabila – Kontakti« / "Invitations – Contacts"); ista drevesa ključev v obeh jezikih
- [X] T003 [P] FR-006-02 FR-006-05 FR-006-07 FR-006-13 Podpora BE testom: backend/src/test/java/si/contactmanager/invitation/support/InvitationFixtures.java – `invite(groupId, inviteeId, inviterId, role)` (vrne uuid; neposreden `INSERT`, kot `GroupFixtures`, D-27), `invite(…, createdAt)` za razvrščanje, `exists(invitationId)`, `count(groupId)`, `countFor(inviteeId)`, `deleteUser(userId)` (`DELETE FROM app_user` – učinek izbrisa računa 012: kaskada povabljenega, `SET NULL` povabitelja), `memberRole(groupId, userId)` (Optional), `auditEntryCount(groupId)`
- [X] T004 [P] FR-006-05 FR-006-06 FR-006-13 Podpora FE testom: frontend/src/test/invitationsApi.ts – `INVITATION_ID`, `received(n, overrides)`, `outgoing(n, overrides)`, `receivedReply(all)`/`outgoingReply(all)` (paginacija po `page`/`size`), `mockInvitationsApi(handlers)` z rokovalniki `count`, `listReceived`, `accept`, `decline`, `listOutgoing`, `send`, `withdraw` (zabeležijo zahtevke in telesa; odgovor ali `'network-error'`); frontend/src/test/msw.ts dobi privzeta rokovalnika najnižje prednosti `GET /api/invitations/count` → `{ "count": 0 }` in `GET /api/groups/:groupId/invitations` → prazna stran (posodobi uvodni komentar: ogrodje od 006 ob vsaki strani naloži število povabil, *Nastavitve* adminu naložijo čakajoča povabila), da testi 001–005 ostanejo zeleni
- [X] T005 [P] FR-006-07 FR-006-09 FR-006-13 Podpora E2E: e2e/tests/support/invitations.ts – `pendingInvitations(groupId)` (SQL štetje), `invitationExists(groupId, email)`, `anonymizeInviter(groupId, email)` (`UPDATE invitation SET inviter_id = NULL`, učinek 012), `memberRole(groupId, email)`; ponovna uporaba `sql`, `setRole`, `archive`, `makePermanentlyArchived` iz support/groups.ts

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [X] T006 FR-006-02 FR-006-03 FR-006-05 FR-006-06 FR-006-08 FR-006-10 FR-006-13 FR-006-14 Ogrodje BE v backend/src/main/java/si/contactmanager/: paket `invitation` z zapisi `OutgoingInvitation(id, inviteeEmail, role, invitedBy, createdAt, canWithdraw)`, `OutgoingInvitations(total, page, size, items)`, `InvitationGroup(id, title, color, archived)`, `ReceivedInvitation(id, group, role, invitedBy, createdAt)`, `ReceivedInvitations`, `AcceptedInvitation(groupId, title, role, archived)`, `InvitationCount(count)` (`invitedBy` je `group.UserRef` ali `null`); `InvitationInputParser` s `parse(String body)` → `Parsed(email, role, errors)` (v ogrodju vrne prazen rezultat brez napak); `GroupInvitationController` (`POST`/`GET /api/groups/{groupId}/invitations`, `DELETE /api/groups/{groupId}/invitations/{invitationId}`) in `InvitationController` (`GET /api/invitations`, `GET /api/invitations/count`, `POST /api/invitations/{invitationId}/accept`, `POST …/decline`) vrnejo `501`; v shared/error izjeme `CannotInviteSelfException`, `InviteeNotRegisteredException`, `AlreadyMemberException`, `InvitationAlreadyPendingException` in njihova preslikava v `ApiExceptionHandler` (`409` s kodami `CANNOT_INVITE_SELF`, `INVITEE_NOT_REGISTERED`, `ALREADY_MEMBER`, `INVITATION_ALREADY_PENDING`; komentar s sklicem na feature-map §2.10)
- [X] T007 [P] FR-006-01 FR-006-05 FR-006-06 FR-006-13 Ogrodje FE: frontend/src/features/invitations/types.ts (oblike iz contracts/openapi.yaml; `OfferedRole = 'ADMIN' | 'EDITOR' | 'VIEWER'`), api.ts (`createInvitationsApi(authFetch)` in `useInvitationsApi()` z `send`, `listOutgoing`, `withdraw`, `listReceived`, `count`, `accept`, `decline`, ki vržejo `Error('not implemented')`), invitationsContext.ts (`{ count, refresh }`, privzeto `count: 0`), prazne komponente `InvitationsProvider` (izriše otroke), `InvitationsLink`, `InvitationsPage`, `InvitationItem`, `DeclineInvitationDialog`, `InviteMemberSection`, `PendingInvitationsSection`, `WithdrawInvitationDialog` (vrnejo `null`), pot `invitations` v frontend/src/app/App.tsx (pred `*`)

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja (`501`, prazna stran, `not implemented`).

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje – unit, integracijski in varnostni (Testcontainers + Firebase Auth Emulator)

- [X] T008 [P] [US1] FR-006-03 backend/src/test/java/si/contactmanager/invitation/InvitationInputParserTest.java: `{"email":" Ana@Primer.si ","role":"EDITOR"}` → `email` obrezan (velikost črk ohranjena), `role` EDITOR; manjkajoč/prazen/samo presledki `email` → `email: REQUIRED`; »ana@« in »ana primer.si« → `email: INVALID_VALUE`; 255 znakov → `email: TOO_LONG`, 254 znakov velja; manjkajoča `role` → `role: REQUIRED`; `"SUPERUSER"` in `5` → `role: INVALID_VALUE`; `"OWNER"` in `"ADMIN"` razčlenjena kot znani vlogi brez napake (403 odloči servis, research R-07); neznano polje → `UNKNOWN_FIELD`; neveljaven JSON in prazno telo → `body: MALFORMED`
- [X] T009 [P] [US1] FR-006-02 FR-006-04 backend/src/test/java/si/contactmanager/invitation/InvitationCreateIT.java: lastnik povabi ` Ana@Primer.si ` z vlogo ADMIN → `201`, telo `OutgoingInvitation` (`inviteeEmail` »ana@primer.si« iz profila, `role` ADMIN, `invitedBy` lastnik, `canWithdraw: true`, `createdAt`); v bazi ena vrstica z `inviter_id` = lastnik; admin povabi z EDITOR in VIEWER → `201`, `canWithdraw: true`; povabljeni ni član; povabljeni vidi povabilo v `GET /api/invitations`; ponovno vabljenje bivšega člana (vrstica članstva izbrisana) → `201`
- [X] T010 [P] [US1] FR-006-02 FR-006-03 backend/src/test/java/si/contactmanager/invitation/InvitationCreateRulesIT.java: admin ponudi ADMIN ali OWNER → `403 FORBIDDEN`; lastnik ponudi OWNER → `403`; neregistriran e-naslov → `409 INVITEE_NOT_REGISTERED`; član → `409 ALREADY_MEMBER`; čakajoče povabilo (z drugo vlogo) → `409 INVITATION_ALREADY_PENDING`, obstoječe nespremenjeno (vloga, povabitelj, `created_at`); lasten e-naslov (tudi z velikimi črkami) → `409 CANNOT_INVITE_SELF`; neveljavni podatki → `400 VALIDATION_FAILED` z napakami po poljih; vrstni red: admin ponudi OWNER v arhivirani skupini → `403` (pred 409); lastnik arhivirane z neveljavnim e-naslovom → `409 GROUP_ARCHIVED` (pred 400); nečlan in neobstoječa skupina s pokvarjenim JSON telesom → `404` prazno telo (pred 400); urednik s pokvarjenim telesom → `403`; neveljaven e-naslov in manjkajoča vloga hkrati → `400` z obema napakama; lasten e-naslov (klicatelj je hkrati registriran in član) → `CANNOT_INVITE_SELF`, ne `ALREADY_MEMBER`; član s čakajočim povabilom (pripravljeno s fixtures) → `ALREADY_MEMBER`, ne `INVITATION_ALREADY_PENDING`; ADMIN trajno arhivirane → `409 GROUP_ARCHIVED`; po vsaki zavrnitvi število povabil skupine nespremenjeno
- [X] T011 [P] [US2] FR-006-05 FR-006-06 FR-006-07 FR-006-12 backend/src/test/java/si/contactmanager/invitation/ReceivedInvitationListIT.java: dve povabili → `GET /api/invitations` vrne obe, novejše prvo (`createdAt`, nato `id` padajoče), `group` (`id`, trenutni `title`, `color`), `role`, `invitedBy` (`name`, `email`), `createdAt`; tuja povabila nikoli; 30 povabil → `size=25` 25 vrstic, `page=1` 5, `total` 30; neveljavna `page`/`size` → `400`; `GET /api/invitations/count` → `{"count": 30}`, uporabnik brez povabil → `0`, brez profila → `0` in prazen seznam; povabitelj izbrisan (`deleteUser`) → `invitedBy: null`, povabilo še na seznamu; povabitelj znižan ali odstranjen iz skupine → povabilo nespremenjeno z njegovim imenom; arhivirana in trajno arhivirana skupina → `group.archived: true`; sprememba naslova in barve skupine po pošiljanju → seznam kaže trenutni vrednosti; izbrisana skupina (`DELETE /api/groups/{id}`) → povabilo ni v seznamu niti v številu; izbris računa povabljenega → povabila ne obstajajo
- [X] T012 [P] [US3] FR-006-08 FR-006-09 FR-006-12 backend/src/test/java/si/contactmanager/invitation/InvitationAcceptIT.java: sprejem povabila z EDITOR v nearhivirano skupino → `200`, `AcceptedInvitation` (`groupId`, `title`, `role` EDITOR, `archived: false`), `group_member.role` EDITOR, povabilo izbrisano, skupina v `GET /api/groups` v razdelku EDITOR, `GET /api/groups/{id}` `200`; arhivirana skupina → `200`, `archived: true`, član z vlogo EDITOR, skupina v `GET /api/groups/archived`, pisanje (npr. `POST …/contacts`) → `409 GROUP_ARCHIVED`; po `unarchive` lastnika urednik ustvari kontakt → `201`; trajno arhivirana → `200`; že član (dodan s fixtures z vlogo VIEWER) → `409 ALREADY_MEMBER`, povabilo izbrisano (potrjeno v bazi), vloga ostane VIEWER; izbrisana skupina → `404`; povabitelj medtem izbrisan ali znižan → sprejem uspe s ponujeno vlogo
- [X] T013 [P] [US4] FR-006-10 backend/src/test/java/si/contactmanager/invitation/InvitationDeclineIT.java: zavrnitev → `204`, povabilo izbrisano, uporabnik ni član; admin nato istega uporabnika znova povabi → `201`; zavrnitev povabila v arhivirano in v trajno arhivirano skupino → `204`
- [X] T014 [P] [US6] FR-006-13 backend/src/test/java/si/contactmanager/invitation/OutgoingInvitationListIT.java: skupina s tremi povabili (poslala lastnik in admin) → `GET /api/groups/{id}/invitations` kot admin in kot lastnik vrne vsa tri, novejše prvo, `inviteeEmail`, `role`, `invitedBy`, `createdAt`; `canWithdraw`: lastnik vedno `true`, admin `false` samo pri `role` ADMIN; povabila drugih skupin niso vključena; 30 povabil → paginacija 25/5, `total` 30; neveljavna `page`/`size` → `400`; povabitelj izbrisan → `invitedBy: null`; znižan ali odstranjen povabitelj → ostane z imenom; arhivirana in trajno arhivirana skupina → `200`; prazna skupina → `total` 0
- [X] T015 [P] [US6] FR-006-14 FR-006-15 FR-006-16 backend/src/test/java/si/contactmanager/invitation/InvitationWithdrawIT.java: lastnik umakne povabilo z ADMIN, EDITOR, VIEWER → `204`, povabilo izbrisano, ni več v `GET /api/invitations` in številu povabljenega; admin umakne EDITOR/VIEWER (tudi povabilo, ki ga je poslal lastnik) → `204`; admin umakne ADMIN → `403`, povabilo ostane; umik v arhivirani skupini (lastnik, admin) → `204`; trajno arhivirana: admin umakne EDITOR → `204`, ADMIN → `403`; povabilo druge skupine (pravi `invitationId`, napačen `groupId` lastne skupine) → `404`; neobstoječe, že sprejeto, zavrnjeno, umaknjeno, neveljaven uuid → `404`; po umiku isti uporabnik znova povabljen → `201`
- [X] T016 [P] [US5] [US6] FR-006-03 FR-006-08 FR-006-11 FR-006-16 backend/src/test/java/si/contactmanager/invitation/InvitationConcurrencyIT.java (ponovljeno 10-krat, sočasni zahtevki): sprejem ‖ zavrnitev istega povabila → natanko en `2xx` in en `404`, končno stanje skladno (član natanko, če je uspel sprejem); sprejem ‖ umik → en uspeh, en `404`; dva sprejema → `200` in `404`, natanko ena vrstica članstva; lastnik in admin sočasno vabita istega uporabnika → en `201`, en `409 INVITATION_ALREADY_PENDING`, ena vrstica; sprejem ‖ `archive` → sprejem uspe ne glede na vrstni red; sprejem ‖ izbris skupine z edinim članom (`DELETE /api/groups/{id}`) → ali izbris `204` in sprejem `404`, ali sprejem `200` in izbris `409 GROUP_HAS_OTHER_MEMBERS` (research R-04); pošiljanje ‖ `archive` → ali `201` pred arhiviranjem ali `409 GROUP_ARCHIVED`, nikoli povabilo, ustvarjeno v že arhivirani skupini
- [X] T017 [P] [US1] [US3] [US4] [US6] FR-006-02 FR-006-08 FR-006-10 FR-006-14 backend/src/test/java/si/contactmanager/invitation/InvitationAuditIT.java (FR-005-06, research R-10): pošiljanje, sprejem, zavrnitev, umik in `409 ALREADY_MEMBER` ne spremenijo števila vrstic `audit_entry` skupine niti `audit_head`; `GET /api/groups/{id}/audit` vrne isto vsebino pred in po
- [X] T018 [P] [US1] [US6] FR-006-02 FR-006-13 FR-006-14 backend/src/test/java/si/contactmanager/invitation/InvitationIsolationMatrixSecurityIT.java (parametriziran, workflow.md §2.5): `POST …/invitations`, `GET …/invitations`, `DELETE …/invitations/{invitationId}` × {neprijavljen (brez glave, pokvarjen, potekel žeton), nečlan (tudi neobstoječa skupina, neveljaven uuid), VIEWER, EDITOR, ADMIN, OWNER} × {nearhivirana, arhivirana}: 401 `UNAUTHENTICATED`, 404 prazno telo, 403 `FORBIDDEN` (VIEWER/EDITOR tudi v arhivirani), ADMIN/OWNER: `POST` nearhivirana `201` / arhivirana `409 GROUP_ARCHIVED`, `GET` `200` v obeh, `DELETE` (povabilo z EDITOR) `204` v obeh; nobena zavrnitev ne spremeni števila povabil ali članstev
- [X] T019 [P] [US2] [US3] [US4] [US5] FR-006-05 FR-006-06 FR-006-08 FR-006-10 FR-006-11 backend/src/test/java/si/contactmanager/invitation/ReceivedInvitationSecurityIT.java (parametriziran, endpointi uporabnika, feature-map §2.2): `GET /api/invitations`, `GET /api/invitations/count`, `POST …/accept`, `POST …/decline` brez glave, s pokvarjenim in poteklim žetonom → `401 UNAUTHENTICATED`, nič se ne spremeni; uporabnik B: sprejem in zavrnitev povabila uporabnika A → `404` prazno telo, povabilo nespremenjeno, B ni član; B-jev seznam in število ne vsebujeta povabila A; povabljeni: sprejem/zavrnitev že obdelanega, neobstoječega in neveljavnega uuid → `404`

### Vmesnik – funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel z imeni iz plan.md)

- [X] T020 [P] [US2] FR-006-06 frontend/src/features/invitations/InvitationsLink.test.tsx: `count` 3 → `link` z imenom »Povabila, 3 nova«, vidno »Povabila (3)«, vodi na `/invitations`; 0 → ime »Povabila« brez števila; 1/2/5 → »Povabila, 1 novo« / »2 novi« / »5 novih«; en: "Invitations, 3 new"; ozek zaslon (`setViewport('narrow')`, 320 px) → isti `link`; na `/invitations` ima `aria-current="page"`; po prehodu na drugo pot se `GET /api/invitations/count` pokliče znova (MSW beleži) in prikaže novo število; axe v sl in en
- [X] T021 [P] [US2] FR-006-05 FR-006-07 frontend/src/features/invitations/InvitationsPage.test.tsx: `/invitations` → `heading` level 1 »Povabila«, naslov strani »Povabila – Kontakti« (en "Invitations – Contacts"); `list` »Prejeta povabila« z dvema `listitem`, novejše prvo; v vrstici `heading` level 2 z naslovom skupine, »Povabil(a): Ana Novak«, »Vloga: Urednik«, datum v zapisu jezika (sl in en); `invitedBy: null` → »Povabil(a): izbrisan uporabnik«; `group.archived` → »Arhivirano«, »Skupina je arhivirana – po sprejemu jo boš lahko le pregledoval(a).« in oba gumba (»Sprejmi povabilo v skupino …«, »Zavrni povabilo v skupino …«); 30 povabil → `navigation` »Strani rezultatov: Povabila«, »1–25 od 30«, *Naslednja* zahteva `page=1&size=25`; prazno → `heading` level 2 »Nimaš novih povabil.« in razlaga; nalaganje `status` »Nalagam…«; napaka nalaganja → `alert` »Povabil ni bilo mogoče naložiti. Poskusi znova.« + »Poskusi znova« ponovi zahtevek; axe v sl in en
- [X] T022 [P] [US3] [US5] FR-006-06 FR-006-08 FR-006-09 FR-006-11 frontend/src/features/invitations/InvitationAccept.test.tsx: klik »Sprejmi povabilo v skupino Projekt FERI« → `POST /api/invitations/{id}/accept`; povabilo izgine; obvestilo »Pridružil(a) si se skupini Projekt FERI.« z `link` »Odpri skupino« na `/groups/<id>`; število v zgornji vrstici se zmanjša brez ponovnega nalaganja (`link` »Povabila, 1 novo« → »Povabila«); povzetek skupin se ponovno naloži (`GET /api/groups`); fokus na naslednjem povabilu oz. `heading` level 1; arhivirana skupina (`archived: true`) → enako obvestilo; `404` → `alert` »Povabilo ni več na voljo.«, seznam in število se ponovno naložita; `409 ALREADY_MEMBER` → `alert` »Že si član te skupine.«, seznam se osveži; `500` in brez povezave → `alert` brez kod, povabilo ostane; axe
- [X] T023 [P] [US4] [US5] FR-006-10 FR-006-11 frontend/src/features/invitations/InvitationDecline.test.tsx: klik »Zavrni povabilo v skupino Projekt FERI« → `dialog` »Zavrnem povabilo v skupino Projekt FERI?« z besedilom »Ne boš postal(a) član skupine. Skupina te lahko znova povabi.«, fokus na »Prekliči«; »Prekliči« in *Esc* → brez zahtevka, fokus nazaj na sprožilni gumb; »Zavrni povabilo« → `POST …/decline`, povabilo izgine, obvestilo »Povabilo je zavrnjeno.«, število se zmanjša; povabilo v arhivirano skupino → zavrnitev uspe; `404` → `alert` »Povabilo ni več na voljo.«, osvežitev; `500` → `alert` »Povabila ni bilo mogoče zavrniti. Poskusi znova.«; axe (dialog odprt) v sl in en
- [X] T024 [P] [US1] FR-006-01 FR-006-02 FR-006-03 FR-006-04 frontend/src/features/invitations/InviteMemberSection.test.tsx (prek `renderGroupsApp('/groups/<id>/settings')`): admin nearhivirane → `region` »Povabi člana«, `textbox` »E-naslov«, `radiogroup` »Vloga« z `radio` »Urednik«, »Bralec« (brez »Admin«, »Lastnik«), gumb »Pošlji povabilo«; lastnik → »Admin«, »Urednik«, »Bralec«; urednik, bralec, katera koli vloga v arhivirani skupini → brez `region` »Povabi člana«; prazen e-naslov, neveljaven in 255 znakov, brez vloge → napake ob polju (`aria-invalid`, `aria-describedby`) brez zahtevka; veljaven obrazec → `POST` s `{"email","role"}`, obvestilo »Povabilo je poslano.«, polje prazno, nobena vloga izbrana, fokus na `textbox` »E-naslov«; odgovori `409 INVITEE_NOT_REGISTERED`, `ALREADY_MEMBER`, `INVITATION_ALREADY_PENDING`, `CANNOT_INVITE_SELF` in `400` s polji → besedila ob polju iz plan.md v sl **in** en (SC-003, brez kod); `403` → `alert` »Za to dejanje nimaš več pravic.«; `409 GROUP_ARCHIVED` → `alert` »Skupina je medtem postala arhivirana, zato povabil ni več mogoče pošiljati.« in ponovno branje skupine (razdelek izgine); `500`, brez povezave → `alert`; axe v sl in en
- [X] T025 [P] [US6] FR-006-13 FR-006-14 frontend/src/features/invitations/PendingInvitations.test.tsx: admin → `region` »Čakajoča povabila« pod »Povabi člana«; `table` »Čakajoča povabila« s `columnheader` »Povabljeni«, »Vloga«, »Povabil(a)«, »Datum«, »Dejanja«; vrstice novejše prvo; `canWithdraw: true` → gumb »Umakni povabilo za ana@primer.si«, `false` → brez gumba; `invitedBy: null` → »izbrisan uporabnik«; prazno → »Ni čakajočih povabil.«; 30 povabil → `navigation` »Strani rezultatov: Čakajoča povabila«; arhivirana skupina → razdelek viden, »Povabi člana« ne; urednik/bralec → brez razdelka in brez zahtevka `GET …/invitations`; po uspešnem pošiljanju (»Pošlji povabilo«) se seznam ponovno naloži in novo povabilo je prvo; napaka nalaganja → `alert` + »Poskusi znova«; ozek zaslon (320 px) → zložena preglednica brez vodoravnega drsenja; axe v sl in en
- [X] T026 [P] [US6] FR-006-14 FR-006-15 FR-006-16 frontend/src/features/invitations/WithdrawInvitation.test.tsx: »Umakni povabilo za ana@primer.si« → `dialog` »Umaknem povabilo za ana@primer.si?« z besedilom »Uporabnik povabila ne bo več videl. Lahko ga znova povabiš.«, fokus na »Prekliči«; »Prekliči« in *Esc* → brez zahtevka, fokus nazaj na sprožilec; »Umakni povabilo« → `DELETE /api/groups/<id>/invitations/<invitationId>`, vrstica izgine, obvestilo »Povabilo je umaknjeno.«, fokus na naslovu razdelka »Čakajoča povabila«; arhivirana skupina → umik uspe; `404` → `alert` »Povabilo ni več na voljo.«, seznam se osveži; `403` → `alert` »Za to dejanje nimaš več pravic.«; `500` → `alert` »Povabila ni bilo mogoče umakniti. Poskusi znova.«; axe (dialog odprt)

### E2E (Compose, emulator; 360/768/1280 px; axe na vsaki strani)

- [X] T027 [P] [US1] … [US6] FR-006-01 … FR-006-16 e2e/tests/povabila.spec.ts (dva uporabnika `uniqueUser`, oba prijavljena): (1) lastnik v *Nastavitvah* povabi drugega uporabnika (` E-naslov ` z velikimi črkami, *Urednik*), obvestilo, vrstica v *Čakajočih povabilih*; ponovno vabljenje → napaka ob polju; axe; (2) povabljeni vidi »Povabila (1)« (ime »Povabila, 1 novo«), odpre *Povabila*, *Sprejmi povabilo* → obvestilo → *Odpri skupino* → glava skupine z vlogo *Urednik*, skupina v stranskem pasu (1280) oz. meniju preklopa (360); SC-002: največ 3 dejanja; (3) zavrnitev z dialogom (fokus na *Prekliči*), povabilo izgine; lastnik ga znova povabi; (4) lastnik povabi z vlogo *Admin*; admin (`setRole`) ne vidi *Umakni povabilo* pri tem povabilu, lastnik ga umakne prek dialoga; povabljeni ga ne vidi več; SC-007: 2 dejanji; (5) arhivirana skupina (`archive`): *Povabi člana* ni, *Čakajoča povabila* so; povabljeni vidi oznako *Arhivirano*, sprejme, skupina je v *Arhiviranih skupinah*, pasica arhivirane skupine; (6) `anonymizeInviter` → »Povabil(a): izbrisan uporabnik«; (7) SC-001: pošiljanje < 30 s od odprtja *Nastavitev*; (8) en scenarij v angleščini z axe; pri 360 px brez vodoravnega drsenja na *Povabilih* in v *Nastavitvah*

**Checkpoint**: vsi testi T008–T027 se prevedejo in padejo zaradi pravega razloga; testi 000–005 ostanejo zeleni.

---

## Phase 4: Pregled testov

- [X] T028 Pregled testov – NOV agent `pregled-testov` (`.claude/agents/pregled-testov.md`), ki dobi samo `specs/006-povabila/` in testne datoteke T008–T027: vsak FR-006-01 … FR-006-16 ima test; negativni scenariji in matrika izolacije pokriti; vmesniki iz plan.md; selektorji po vlogah; smiselne asercije; testi padejo zaradi pravega razloga. Ob ZAVRNJENO popravi teste in zaženi novega pregledovalca (največ 3 krogi, nato ustavi in vprašaj razvijalca). Ob SPREJETO zapiši vse kroge v specs/006-povabila/traceability.md (*Pregled testov*) in commitaj `test(006): …` (samo testi in minimalno ogrodje)

**Checkpoint**: nobena implementacijska naloga se ne začne pred T028 (SPREJETO). Testi se odslej spreminjajo samo za uskladitev s specifikacijo (vnos v DECISIONS.md).

---

## Phase 5: User Story 1 – Povabilo registriranega uporabnika (Priority: P1) 🎯 MVP

**Goal**: admin ali lastnik pošlje povabilo iz *Nastavitev*; vsi razlogi zavrnitve so vidni ob polju.

**Independent Test**: T008, T009, T010, T018 (POST), T017 (pošiljanje), T024 zeleni.

- [X] T029 [US1] FR-006-03 backend/src/main/java/si/contactmanager/invitation/InvitationInputParser.java: razčlenjevanje po research R-07 – `email` obrezan, »po obrezu 1–254 znakov, veljavna oblika e-naslova« (vzorec kot `ContactInputParser.EMAIL`), kode `REQUIRED`/`TOO_LONG`/`INVALID_VALUE`; `role` ∈ `VIEWER|EDITOR|ADMIN|OWNER` kot znana vloga (`OWNER` ni napaka razčlenjevanja), sicer `INVALID_VALUE`, manjka → `REQUIRED`; neznano polje `UNKNOWN_FIELD`; neveljaven JSON `body: MALFORMED`
- [X] T030 [US1] FR-006-02 FR-006-03 backend/src/main/java/si/contactmanager/invitation/InvitationRepository.java (`JdbcClient`): `lockGroup(groupId)` (`SELECT archived_at IS NOT NULL FROM contact_group WHERE id = :id FOR UPDATE`), `callerEmail(userId)`, `findUserByEmail(email)` (`lower(email) = lower(:email)`), `isMember(groupId, userId)`, `hasPending(groupId, inviteeId)`, `insert(groupId, inviteeId, inviterId, role)` → `OutgoingInvitation` (pridruži `app_user` za `inviteeEmail` in `invitedBy`)
- [X] T031 [US1] FR-006-02 FR-006-03 backend/src/main/java/si/contactmanager/invitation/InvitationService.java `send` (`@Transactional`): vrstni red iz data-model.md (*Pravila pošiljanja*) – 403, če je `role` znana in ni strogo nižja od `membership.role()` (`OWNER` vedno); `lockGroup` → `GroupArchivedException`; napake polj → `ValidationException`; `CANNOT_INVITE_SELF` → `INVITEE_NOT_REGISTERED` → `ALREADY_MEMBER` → `INVITATION_ALREADY_PENDING`; `DuplicateKeyException` ob `insert` (`invitation_one_pending`) → `InvitationAlreadyPendingException`; brez zapisa v revizijsko sled; `GroupInvitationController` `POST /api/groups/{groupId}/invitations`: telo razčleni pred `GroupAccess.require(jwt, groupId, Role.ADMIN, false)`, a napak razčlenjevanja **ne vrže** – servis prejme `Membership` in `Parsed` ter `ValidationException` (400) vrže šele po preverjanjih 401 → 404 → 403 (vloga in ponujena vloga) → 409 `GROUP_ARCHIVED` (feature-map §2.2; nečlan s pokvarjenim telesom dobi `404`, ne `400`) → `201`
- [X] T032 [US1] FR-006-01 FR-006-02 FR-006-03 FR-006-04 frontend: `api.send` v frontend/src/features/invitations/api.ts; frontend/src/features/invitations/InviteMemberSection.tsx (`section` z `aria-labelledby` = `region` »Povabi člana«, `h2`; `type="email"`, `autocomplete="off"`, `aria-required`; izbirni gumbi samo vlog, strogo nižjih od `group.role` iz `useGroup()`; preverjanje pred pošiljanjem; napake strežnika ob polju po kodi (ponovna uporaba `fieldErrors`); `alert` za napake akcije; po `409 GROUP_ARCHIVED` ponovno branje skupine; obvestilo »Povabilo je poslano.«, izpraznitev, fokus na polje; neobvezen povratni klic `onSent` za osvežitev *Čakajočih povabil*); izris v frontend/src/features/groups/SettingsPage.tsx za `GroupDetailsSection` in pred `GroupManagementSection` samo za ADMIN+ in `!group.archived` (komentar posodobi: 006 doda razdelka)

**Checkpoint**: US1 zelen; `./verify.sh quick` uspe.

---

## Phase 6: User Story 2 – Pregled prejetih povabil (Priority: P1)

**Goal**: povezava *Povabila* s številom in stran s seznamom prejetih povabil.

**Independent Test**: T011, T019 (seznam, število), T020, T021 zeleni.

- [X] T033 [US2] FR-006-05 FR-006-06 FR-006-07 FR-006-12 backend: `InvitationRepository.pageReceived(userId, page, size)` (`JOIN contact_group`, `LEFT JOIN app_user` povabitelja, `ORDER BY created_at DESC, id DESC`), `countReceived(userId)`; `InvitationService.listReceived`, `countReceived`; `InvitationController` `GET /api/invitations` (`page` ≥ 0, `size` 1–100, privzeto 25; napake → `400 VALIDATION_FAILED`) in `GET /api/invitations/count`; uporabnik brez profila (`UserDirectory.find` prazno) → prazen seznam / `0`
- [X] T034 [US2] FR-006-06 frontend: `api.count`; frontend/src/features/invitations/InvitationsProvider.tsx (naloži število ob izrisu in ob vsaki spremembi `location.pathname`, `refresh()`; napaka nalaganja → število ostane prejšnje), frontend/src/features/invitations/InvitationsLink.tsx (vidno »Povabila (3)«, dostopno ime z množinsko obliko iz `invitations.link.*`, pod 640 px `IconMail` + število, `aria-current` na `/invitations`, obroba fokusa kot v `AppShell`); vključitev v frontend/src/shared/layout/AppShell.tsx (`InvitationsProvider` ob `GroupsProvider`, povezava pred `AccountMenu`; komentar posodobi)
- [X] T035 [US2] FR-006-05 FR-006-07 frontend: `api.listReceived`; frontend/src/features/invitations/InvitationsPage.tsx (`useDocumentTitle` »Povabila – Kontakti«, `h1`, `list` »Prejeta povabila«, paginacija s `SectionPagination` z oznako »Strani rezultatov: Povabila«, prazno stanje, nalaganje z zakasnitvijo 300 ms (`useDelayed`), napaka z »Poskusi znova«) in frontend/src/features/invitations/InvitationItem.tsx (jeziček v barvi skupine `aria-hidden`, `h2` naslov, »Povabil(a): …« oz. ležeče `muted` »izbrisan uporabnik«, oznaka vloge s predpono, `<time>` v zapisu jezika, oznaka *Arhivirano* in razlaga, gumba s skritim nadaljevanjem imena – research R-09)

**Checkpoint**: US2 zelen.

---

## Phase 7: User Story 3 – Sprejem povabila (Priority: P1)

**Goal**: sprejem doda člana s ponujeno vlogo, tudi v arhivirano skupino.

**Independent Test**: T012, T016 (sprejem), T017 (sprejem), T019 (accept), T022 zeleni.

- [X] T036 [US3] FR-006-08 FR-006-09 FR-006-11 FR-006-12 backend: `InvitationRepository.findGroupOf(invitationId, inviteeId)`, `claim(invitationId, inviteeId)` (`DELETE … WHERE id = :id AND invitee_id = :user RETURNING group_id, role`), `addMember(groupId, userId, role)` (`INSERT INTO group_member … ON CONFLICT DO NOTHING`, vrne število vrstic), `acceptedView(groupId)`; `InvitationService.accept` (`@Transactional`, research R-04 – R-06): poišči povabilo klicatelja (`404`) → `lockGroup` (`404`, če skupine ni) → `claim` (`404`, če 0 vrstic) → `addMember`; 0 vrstic → izid `AlreadyMember` (transakcija se potrdi), sicer `Accepted(AcceptedInvitation)`; brez preverjanja arhiviranosti; `InvitationController` `POST /api/invitations/{invitationId}/accept`: neveljaven uuid → `404`; izid `AlreadyMember` → `AlreadyMemberException` po potrditvi
- [X] T037 [US3] FR-006-06 FR-006-08 FR-006-09 FR-006-11 frontend: `api.accept`; v `InvitationsPage`/`InvitationItem` gumb »Sprejmi povabilo« → obvestilo (Sonner) »Pridružil(a) si se skupini ‹naslov›.« z `link` »Odpri skupino« (`/groups/:groupId`), odstranitev vrstice, `useInvitations().refresh()`, `useGroups().refresh()`, fokus na naslednje povabilo ali `h1`; `404` → `alert` »Povabilo ni več na voljo.« in ponovno nalaganje seznama in števila; `409 ALREADY_MEMBER` → `alert` »Že si član te skupine.« in osvežitev; druge napake → `alert` brez kod

**Checkpoint**: US3 zelen; MVP (US1–US3) deluje od začetka do konca.

---

## Phase 8: User Story 4 – Zavrnitev povabila (Priority: P2)

**Goal**: zavrnitev po potrditvi.

**Independent Test**: T013, T016 (zavrnitev), T019 (decline), T023 zeleni.

- [X] T038 [US4] FR-006-10 FR-006-11 backend: `InvitationRepository.decline(invitationId, inviteeId)` (`DELETE … WHERE id = :id AND invitee_id = :user`); `InvitationService.decline` (0 vrstic → `NotFoundException`; brez preverjanja arhiviranosti); `InvitationController` `POST /api/invitations/{invitationId}/decline` → `204`, neveljaven uuid → `404`
- [X] T039 [US4] FR-006-10 FR-006-11 frontend: `api.decline`; frontend/src/features/invitations/DeclineInvitationDialog.tsx (isti način dialoga kot `ArchiveGroupDialog`, design.md 13.4: naslov, besedilo posledice, fokus na »Prekliči«, nevarni gumb »Zavrni povabilo«, vrnitev fokusa); po uspehu odstranitev vrstice, obvestilo »Povabilo je zavrnjeno.«, `refresh()` števila; `404` in druge napake kot v T037

**Checkpoint**: US4 zelen.

---

## Phase 9: User Story 5 – Tuja in neobstoječa povabila (Priority: P2)

**Goal**: tuja, obdelana, umaknjena povabila in povabila v izbrisane skupine vrnejo 404 brez razkritja.

**Independent Test**: T016, T019 zelena; T022 in T023 (404) zelena.

- [X] T040 [US5] FR-006-11 FR-006-12 Meja virov uporabnika v backend/src/main/java/si/contactmanager/invitation/InvitationRepository.java in InvitationController.java: vsaka poizvedba endpointov uporabnika (`findGroupOf`, `claim`, `decline`, `pageReceived`, `countReceived`) ima pogoj `invitee_id = :user` (id iz `UserDirectory.find(jwt)`, nikoli iz zahtevka); uporabnik brez profila pri `accept`/`decline` → `404`; vsak `404` ima prazno telo (`NotFoundException`); neveljaven uuid `invitationId` → `404` pred dostopom do baze. Zaključeno, ko so T016, T019 ter primeri `404` v T022 in T023 zeleni brez sprememb testov

**Checkpoint**: US5 zelen.

---

## Phase 10: User Story 6 – Pregled in umik poslanih povabil skupine (Priority: P2)

**Goal**: admin in lastnik vidita čakajoča povabila skupine in jih umakneta po pravilu »le nižjim od sebe«.

**Independent Test**: T014, T015, T016 (umik), T017 (umik), T018 (GET, DELETE), T025, T026 zeleni.

- [X] T041 [US6] FR-006-13 FR-006-14 FR-006-16 backend: `InvitationRepository.pageOutgoing(groupId, page, size)`, `countOutgoing(groupId)`, `roleOf(invitationId, groupId)`, `withdraw(invitationId, groupId)` (`DELETE … WHERE id = :id AND group_id = :group`); `InvitationService.listOutgoing` (`canWithdraw` = `OWNER` ali (`ADMIN` in `role` ≠ `ADMIN`)) in `withdraw` (research R-11: `roleOf` → `404`; ADMIN in `role` ADMIN → `403`; `withdraw` 0 vrstic → `404`); `GroupInvitationController` `GET /api/groups/{groupId}/invitations` (`GroupAccess.require(…, Role.ADMIN, false)`, parametri kot v T033) in `DELETE /api/groups/{groupId}/invitations/{invitationId}` (`require(…, Role.ADMIN, false)`, neveljaven uuid → `404`, uspeh `204`)
- [X] T042 [US6] FR-006-04 FR-006-13 FR-006-14 FR-006-15 FR-006-16 frontend: `api.listOutgoing`, `api.withdraw`; frontend/src/features/invitations/PendingInvitationsSection.tsx (`region` »Čakajoča povabila«, `h2`, `table` z zloženim prikazom pod 640 px po design.md 8.6, paginacija »Strani rezultatov: Čakajoča povabila«, prazno stanje, »izbrisan uporabnik«, tihi gumb »Umakni povabilo« s skritim »za ‹e-naslov›« samo ob `canWithdraw`, `reload()` za `InviteMemberSection.onSent`); frontend/src/features/invitations/WithdrawInvitationDialog.tsx (fokus na »Prekliči«, nevarni gumb »Umakni povabilo«, obvestilo »Povabilo je umaknjeno.«, po uspehu fokus na `h2` razdelka; `404` → `alert` in osvežitev; `403`, `500`, brez povezave → `alert`); izris v frontend/src/features/groups/SettingsPage.tsx za *Povabi člana* za ADMIN+ (tudi v arhivirani skupini)

**Checkpoint**: vsi testi T008–T027 zeleni.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T043 FR-006-01 … FR-006-16 specs/006-povabila/traceability.md (vsak FR-ID → testi → stanje); AI dnevnik; CLAUDE.md/README le, če se je spremenilo kaj splošnega
- [X] T044 `./verify.sh quick`, nato `./verify.sh full` zeleno (vključno s testi 000–005) – koraki zagnani posamično, ker korak `orodja` v tem okolju pade zaradi dovoljenj Windows (EACCES na WindowsApps), ne zaradi 006
- [ ] T045 `/speckit-converge` do »Converged«; potisni vejo `povabila` in odpri PR v `main` (sprejete predpostavke, izid pregleda testov, commit `test(006)` v opisu; prošnja drugemu razvijalcu za potrditev sprememb feature-map, design.md in [CR-02] v 003 – D-54, D-56)
- [ ] T046 Razvijalca: pregled PR in ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10, quickstart.md scenarij 12); združitev (agent pusti neodkljukano)

---

## Dependencies & Execution Order

- **Setup (T001–T005) → Foundational (T006–T007) → Tests (T008–T027) → T028** so strogo zaporedni po fazah.
- **Zgodbe po T028** v vrstnem redu prioritete: US1 (T029 → T030 → T031; T032 po T031 za ročni preizkus, testi tečejo z MSW neodvisno) → US2 (T033; T034, T035) → US3 (T036 → T037; potrebuje T030 `lockGroup` in T035 stran) → US4 (T038 → T039; potrebuje T035) → US5 (T040 po T036, T038) → US6 (T041 → T042; potrebuje T032 za `onSent`).
- Naloge, ki spreminjajo isto datoteko (`InvitationRepository`, `InvitationService`, `InvitationController`, `GroupInvitationController`, `InvitationsPage`, `SettingsPage`), tečejo zaporedno v navedenem vrstnem redu.
- **Polish** po vseh zgodbah.
- `/speckit-implement` teče dvakrat: najprej do vključno faze 3 (testi), nato – po SPREJETO agenta `pregled-testov` – preostale faze (workflow.md §4.2). Agent nadaljuje brez čakanja na razvijalca; ta pregleda v PR.

## Parallel execution

- Setup: T001–T005 so vsi `[P]` (različne datoteke). Foundational: T006 (BE) in T007 (FE) sta neodvisna.
- Testi: T008–T019 (BE) in T020–T026 (FE) so `[P]` – vsak v svoji datoteki; T027 (E2E) uporablja le pomočnike iz T005.
- Implementacija: v vsaki zgodbi lahko BE (T029–T031, T033, T036, T038, T041) in FE (T032, T034–T035, T037, T039, T042) tečeta vzporedno, ker FE testi uporabljajo MSW. Primer US2: T033 ‖ (T034 → T035).

## Implementation Strategy

1. **MVP = US1 + US2 + US3** (vse P1): pošiljanje, pregled in sprejem – uporabnik lahko konča v skupini (SC-002). T029–T037, nato `./verify.sh quick`.
2. Nato US4 (zavrnitev), US5 (meje virov), US6 (pregled in umik poslanih povabil); po vsaki zgodbi `./verify.sh quick`.
3. Na koncu `./verify.sh full`, traceability, `/speckit-converge`, PR.

## Analysis (`/speckit-analyze`, 2026-11-08)

Vseh 16 FR in 7 SC ima vsaj eno nalogo in test (tabela pokritosti v plan.md). Ugotovitve in odpravljene napake:

- **CRITICAL – sprememba potrjene FR-003-03 brez `[CR-NN]` (konstitucija I):** označena kot [CR-02] v 003 (zahteva, predpostavka, *Changes*); D-56.
- **HIGH – Governance:** spremembe feature-map in design.md iz D-54 potrdi drugi razvijalec ob pregledu PR (D-56); zapisati v opis PR (T045).
- **MEDIUM – izjeme od konstitucije III:** razlaga z izjemami iz feature-map §2.4 zapisana v D-56.
- **MEDIUM – vrstni red 400 pri pošiljanju:** T031 določa, da se napake razčlenjevanja vržejo šele po 401/404/403/409; T010 to preverja.
- **MEDIUM – *Povabi člana* v arhivirani skupini brez razlage:** odločitev v spec *Assumptions* (razlago da pasica 003).
- **LOW:** število poizvedb pri sprejemu (plan), besedilo R-02, opomba v checklists/requirements.md, natančnejša T040; izraz *zavrnitev* = `decline` v API in "Decline" v en.

## Notes

- `[P]` = različne datoteke, brez odvisnosti od nedokončanih nalog.
- Vsaka naloga navaja FR-ID-je za sledljivost.
- Testa nikoli ne spremeni, da bi ustrezal kodi; vsaka sprememba testa po pregledu → vnos v DECISIONS.md.
- Brez utišanj opozoril brez odobrenega D-NN v DECISIONS.md.
- Pred odkljukanjem naloge `./verify.sh quick`.

## Phase 12: Convergence

- [X] T047 Odstrani odvečni vmesni `options` v frontend/src/features/invitations/InviteMemberSection.tsx in uporabi `offered` neposredno (vloge, strogo nižje od vloge pošiljatelja) per T032 / FR-006-01 (unrequested)
