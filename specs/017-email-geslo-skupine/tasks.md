---

description: "Naloge 017 – prijava z e-pošto in geslom, iskanje skupin, zapustitev skupine za lastnika"
---

# Tasks: Prijava z e-pošto in geslom, iskanje skupin, zapustitev skupine za lastnika

**Input**: `/specs/017-email-geslo-skupine/` (spec, plan, research, data-model, contracts)

**Tests**: obvezni, pišejo se skupaj s kodo vsake zgodbe (brez ločene faze).

## Format: `[ID] [P?] [Story] FR-IDs Description`

## Odobritev (konstitucija §5, §7)

Faze US1–US4 uvajajo Email/Password, kar spreminja §5. Razvijalec funkcionalnosti je 2026-11-16 sprejel razširitev in **odstranil blokado T001**; predlog §5 (v. 3.3.0) in `feature-map.md` sta v istem PR; Patrikova potrditev po §7 ni zabeležena, odstopanje je navedeno v opisu PR (brez samodejne združitve).

## Phase 1: Setup

- [x] T001 — Vrata §5: razvijalec je blokado odstranil (2026-11-16); predlog §5 v tem PR, odstopanje od §7 v opisu PR.
- [ ] T002 [P] (izvedeno delno: `groups.search.*`, `members.leave.owner.*` sl+en; `auth.*` in `account.methods.*` čakajo na T001) — i18n ključi v `frontend/src/i18n/sl.json` in `en.json` samo pod predponami `auth.register.*`, `auth.verify.*`, `auth.forgot.*`, `auth.password.*`, `account.methods.*`, `groups.search.*`, `members.leave.owner.*` (brez posega v ključe 016)
- [ ] T003 [P] — skupni testni pomočniki: `frontend/src/test/authFake.ts` (nov gateway z geslom/potrditvijo/povezovanjem), `e2e/tests/support/auth.ts` (registracija z geslom, koda OOB prek emulatorja, prijava z geslom), imena elementov iz prevodov

## Phase 2: Foundational

- [ ] T004 FR-017-02, -04 — `EmailVerifiedFilter` v `backend/src/main/java/si/contactmanager/shared/security/` za `BearerTokenAuthenticationFilter` (registracija v `SecurityConfig`): `Jwt` brez `email_verified=true` → `403 {code: EMAIL_NOT_VERIFIED}`; izjema `GET /api/health`; `/dav/**` nespremenjen. Test: `EmailVerifiedSecurityIT` (vsi HTTP načini na reprezentativnih potih skupin, `/api/me`, `/api/invitations`: nepotrjen 403, potrjen kot prej, 401 ostane 401, `PUT /api/me` ne ustvari vrstice `app_user`) + enotski test filtra
- [x] T005 FR-017-11 (izvedeno brez vrstice 403 `EMAIL_NOT_VERIFIED`, filtra še ni) — `ProfileRepository` ujame trk `lower(email)` pri drugem UID (po obstoječem ponovnem poskusu) → `409 {code: ACCOUNT_CONFLICT}` prek `ApiExceptionHandler`; profil drugega UID nespremenjen. Test: `AccountConflictIT`; vnos matrike za uporabniški vir `PUT /api/me`: 401 neprijavljen, 403 `EMAIL_NOT_VERIFIED`, 409 ob trku (dva UID, isti e-naslov, razlika samo v velikosti črk; članstva prvega nespremenjena)
- [ ] T007 FR-017-12 — gateway `reauthenticate()` (geslo ali Google popup po ponudniku, vrne svež ID žeton z novim `auth_time`) v `AuthGateway.ts`/`firebaseGateway.ts` s testom z lažnim SDK; potrebujeta ga US3 (T020) in US4 (T031)
- [ ] T006 [P] FR-017-10 — dokumentiraj v `docs/decisions/2026-11-16-email-geslo-povezovanje.md` (§2.6: sprememba avtentikacije): `accounts:signUp` z `idToken` ob vključeni EEP, ponovna prijava z geslom po povezovanju, brez izklopa EEP, brez spremembe UID

## Phase 3: User Story 1 – Registracija in potrditev e-naslova (P1) 🎯

**Goal**: registracija z geslom, zaslon *Potrdite e-naslov*, vstop po potrditvi. **Independent Test**: emulator – registracija, 403 z nepotrjenim žetonom, potrditev, vstop.

- [ ] T010 [US1] FR-017-01, -03, -13 — `AuthGateway` (`frontend/src/features/auth/AuthGateway.ts`, `firebaseGateway.ts`): `signUpWithPassword`, `sendVerificationEmail` (omejitev pogostosti, napaka `too-many-requests` prevedena), `refreshVerification` (`reload()` → `getIdToken(true)` → obvesti poslušalce), `AuthUser.emailVerified`; kode napak v `signInErrorCode.ts`; test z lažnim SDK (`firebaseGateway.test.ts`)
- [ ] T011 [US1] FR-017-01, -22 — `RegisterPage.tsx` (`/register`): e-naslov, geslo (najmanj 8 znakov: „najmanj 8 znakov“, preverba v `passwordValidation.ts`, tudi Firebase password policy), potrditev gesla, napake po poljih (`aria-describedby`, `role=alert`), nevtralno sporočilo za `email-already-in-use`; povezava na prijavo; test (RTL + MSW + vitest-axe)
- [ ] T012 [US1] FR-017-02, -03, -13 — `VerifyEmailPage.tsx` (`/verify-email`): *Ponovno pošlji*, *Potrdil sem* (obvestilo, če še ni potrjeno), *Odjava*; `RequireAuth.tsx` in `AuthProvider.tsx`: nepotrjen uporabnik → `/verify-email`, `PUT /api/me` se ne kliče pred potrditvijo; ob odgovoru `403 EMAIL_NOT_VERIFIED` isti zaslon; testi
- [ ] T013 [US1] FR-017-01 … 04 — E2E `e2e/tests/prijava-geslo.spec.ts`: registracija → API 403 → koda OOB → *Potrdil sem* → vstop brez ponovne prijave; povabilo na ta e-naslov se pokaže šele po potrditvi (axe, 360/1280 px)

**Checkpoint**: US1 deluje; `./verify.sh quick` + `backend` zelena

## Phase 4: User Story 2 – Prijava z geslom in ponastavitev (P1)

- [ ] T014 [US2] FR-017-05, -06 — gateway `signInWithPassword`; `LoginPage.tsx` razširjen (obrazec z geslom, *Nadaljuj z Googlom* nespremenjen, povezave *Registracija*, *Pozabljeno geslo*); en nevtralen niz za `invalid-credential`/`user-not-found`/`wrong-password`; `next` poti (001) ohranjena; test
- [ ] T015 [US2] FR-017-07 — gateway `sendPasswordReset`; `ForgotPasswordPage.tsx` (`/forgot-password`): vedno isto potrdilo; test, da je izpis enak ob uspehu in ob napaki `user-not-found`
- [ ] T016 [US2] FR-017-05 … 08 — E2E (`prijava-geslo.spec.ts`): prijava z geslom, napačno geslo, pozabljeno geslo (koda OOB), Google prijava obstoječega uporabnika brez izgube članstev, gesel za aplikacijo (014) in nastavitev (SC-002)

## Phase 5: User Story 3 – Povezovanje Googla in gesla (P1)

- [ ] T020 [US3] FR-017-09, -10, -11 — gateway `linkPassword(password)`: ponovna avtentikacija (T007) je pogoj; REST `POST …/v1/accounts:signUp?key=…` z `{idToken, email (e-naslov računa), password, returnSecureToken:true}` (ne `accounts:update`, ne `linkWithCredential`); preverba `localId === uid`; nato `signInWithEmailAndPassword`, preverba `auth.currentUser.uid === uid` (sicer odjava in napaka); `emailVerified` po povezovanju prebran brez predpostavke; rezerva `reload()` + `getIdToken(true)`; `linkGoogle()` z `linkWithPopup` (`credential-already-in-use` → sporočilo); testi `firebaseGateway.link.test.ts` (telo REST klica, UID pred/po, neujemanje UID → odjava, `email_verified=false` po povezovanju → zaslon potrditve)
- [ ] T021 [US3] FR-017-09, -10 — `SignInMethodsSection.tsx` v `frontend/src/features/account/` (*Prijavne metode*: seznam iz `providerData`, *Dodaj geslo* z e-naslovom samo za branje, *Dodaj Google*), vključen v `AccountPage.tsx`; test (RTL + axe)
- [ ] T022 [US3] FR-017-10, -11 — zaledni IT `LinkPasswordIdentityIT` (emulator, `FirebaseEmulatorContainer`): uporabnik prek Google prijave (UID U, članstva) → `accounts:signUp` z `idToken` → `signInWithPassword` da isti `localId` U → `PUT /api/me` vrne isti profil → eno vrstico `app_user`; dokumentiraj v komentarju testa, da emulator EEP ne posnema
- [ ] T023 [US3] FR-017-09 … 11 — E2E: Google uporabnik doda geslo, se odjavi, vstopi z geslom – iste skupine; poskus registracije z e-naslovom obstoječega računa ne ustvari drugega profila (nevtralno sporočilo)
- [ ] T024 [US3] FR-017-10 — ročni preizkus v ločenem testnem Firebase projektu z EEP po `quickstart.md` (razvijalec); rezultat v opis PR (ni avtomatizirano, §3.2)

## Phase 6: User Story 4 – Ponovna avtentikacija (P2)

- [ ] T030 [US4] FR-017-12 — `FreshAuthentication` v `shared/security/` + uporaba v `AccountDeletionController`: `now − auth_time > 300 s` ali brez claima → `403 REAUTHENTICATION_REQUIRED` pred obdelavo; koda v `ApiExceptionHandler`; testi: enota (meja 300 s, manjkajoč claim) in `AccountDeletionReauthIT` (stari žeton: nič ne izbrisano; svež: 204/202), vnos matrike za uporabniške vire (401 neprijavljen, 403 nepotrjen, 403 star `auth_time`)
- [ ] T031 [US4] FR-017-12 — `DeleteAccountDialog.tsx` (uporablja `reauthenticate()` iz T007): ponovna avtentikacija pred `POST /api/me/deletion`, nato `getIdToken(true)`; `REAUTHENTICATION_REQUIRED` → ponovni poskus s ponovno avtentikacijo; napačno geslo ne spremeni ničesar; test; dodajanje metode (T021) uporablja isti dialog
- [ ] T032 [US4] FR-017-12 — E2E: izbris računa z geslom zahteva geslo (axe)

## Phase 7: User Story 5 – Iskanje in filtriranje skupin (P2)

**Goal**: `q` in filtri na domači strani. **Independent Test**: uporabnik s 60 skupinami najde skupino s strani 3.

- [x] T040 [US5] FR-017-14, -15, -16, -18 — `GroupController`/`GroupService`/`GroupRepository`: `q` v `GET /api/groups` in `GET /api/groups/archived` (obrezan, ≤ 100 znakov sicer `400 INVALID_VALUE`; `%`, `_`, `\` ubežani; normalizacija `translate(lower(…))` v bazi in `Normalizer` v Javi, brez migracije); ponovljiv `role` pri arhiviranih (`INVALID_VALUE` za neznano); `total` = zadetki (`countByRole`, `countArchived`); testi: `GroupSearchIT` (SC-005: iskanje po 100 skupinah uporabnika pod 300 ms na strežniku, najde skupino s tretje strani, brez razlike velikosti črk in šumnikov, posebni znaki, prazen `q`, prazen rezultat 200, več vlog), vnos v `GroupIsolationMatrixSecurityIT` (401, nečlan nikoli ne vidi tuje skupine, 403 EMAIL_NOT_VERIFIED) in `ArchivedGroupListIT`
- [x] T041 [US5] FR-017-14 … 18, -22 — `GroupsPage.tsx`, `GroupSection.tsx`, `api.ts` (`q`, `role`), `ArchivedGroupsPage.tsx`: polje *Išči skupine* (`role=search`, label), vloge kot skupina potrditvenih polj, *Stanje* (*Aktivne*/*Arhivirane*), stanje v URL (`q`, `role`, `state`), vrnitev na prvo stran, prazno stanje *Počisti iskanje*, `role=status` z številom zadetkov, zakasnitev vnosa (debounce); povezava na stran *Arhivirane skupine* ostane; testi (RTL + MSW + vitest-axe, URL, paginacija)
- [x] T042 [US5] FR-017-14 … 17 — E2E `e2e/tests/skupine-iskanje.spec.ts`: 60 skupin, iskanje po delu naziva, filter vlog, arhivirane, prazno stanje, osvežitev ohrani stanje (axe, 360/1280 px; @w768 le če se postavitev razlikuje)

## Phase 8: User Story 6 – Zapusti skupino za lastnika (P3)

- [x] T050 [US6] FR-017-19, -20, -21 — `GroupManagementSection.tsx`: gumb *Zapusti skupino* tudi za lastnika; `LeaveGroupDialog.tsx`: za lastnika pojasnilo + *Prenesi lastništvo* (odpre obstoječi `TransferOwnershipDialog`; kjer prenos ni mogoč, samo pojasnilo), za lastnika-edinega člana povezava do obstoječega *Izbriši skupino* (brez brisanja), brez potrditvenega gumba; ne-lastniki nespremenjeno; ažuriraj `LeaveGroup.test.tsx` (spremenjen obstoječi test z razlogom v PR); axe
- [x] T051 [US6] FR-017-19 — zaledje nespremenjeno (matrika in `MemberLeaveIT` že pokrivata vse vrstice, brez dopolnitev); dopolni `MemberIsolationMatrixSecurityIT`/`MemberLeaveIT` (neposreden klic OWNER → 409 `OWNER_CANNOT_LEAVE`, nečlan 404, neprijavljen 401, arhivirana skupina in ne-lastnik 2xx) in E2E v `e2e/tests/` obstoječem scenariju članov: lastnik odpre dialog, vidi pojasnilo, prenese lastništvo

## Phase 9: Polish

- [ ] T060 — `.specify/memory/feature-map.md`: vrstica 017, kodi `EMAIL_NOT_VERIFIED`, `REAUTHENTICATION_REQUIRED`, `ACCOUNT_CONFLICT` v §2.10, popravek §2.4 (arhivirane skupine dosegljive tudi z domače strani prek filtra) – **samo po T001** (§7: potrdita oba razvijalca)
- [ ] T061 — `./verify.sh quick`, `./verify.sh backend`, `./verify.sh e2e` zeleni; ročni preizkus dostopnosti (design.md §10) in T024 v opisu PR

---

## Dependencies & Execution Order

- T001 → US1–US4 (T010 … T032) in T060. Phase 2 (T004 filter, T005) pred US1–US4; T004 je neškodljiv za Google uporabnike in ga ni treba blokirati, a se vseeno izvede šele po T001, ker spremlja Email/Password.
- **Neblokirano takoj**: T002, T003, T005, T006, US5 (T040–T042), US6 (T050–T051).
- US1 → US2 → US3 → US4; `reauthenticate()` je v T007 (Phase 2), zato US3 ne čaka na US4.
- `sl.json`/`en.json` so skupni s 016: samo dodajanje novih ključev.

## Implementation Strategy

1. Neblokirani del (US5, US6, T005): ena sklenjena rezina; `quick` + `backend`.
2. Po T001: Phase 2 filter, US1 → US2 → US3 → US4; `e2e` po vsaki zgodbi.
3. Brez avtomatske združitve PR; opis PR: predpostavke, spremenjeni obstoječi testi (`LeaveGroup.test.tsx`), ročni preizkus EEP.
