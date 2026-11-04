---

description: "Tasks for 001-prijava (tests mandatory, independent test review)"
---

# Tasks: Prijava, ogrodje aplikacije in Moj račun

**Input**: `specs/001-prijava/` – spec.md, plan.md (*Public Interfaces*), research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: obvezni (konstitucija II). Vsak FR-001-01 … FR-001-19 ima vsaj eno testno nalogo. Testi pred kodo, nato pregled
neodvisnega agenta `pregled-testov` (workflow.md §4.2).

**Organization**: Setup → Foundational → Tests → Test review → US1 … US5 → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 — Dodaj odvisnost `org.springframework.boot:spring-boot-starter-security-oauth2-resource-server` (različica iz BOM 4.1.2) v backend/pom.xml; vnos `odločitev` v DECISIONS.md za vse nove knjižnice 001 (research R-11)
- [X] T002 [P] — Dodaj točno pripete `firebase` 13.2.0, `react-router` 8.5.1, `radix-ui` 1.8.1 v frontend/package.json in package-lock.json (`npm install --save-exact`); `engines.node` → `>=22.22`
- [X] T003 [P] FR-001-02 Migracija backend/src/main/resources/db/migration/V2__uporabnik.sql: tabela `app_user` po data-model.md – `id bigint generated always as identity primary key`, `firebase_uid varchar(128) not null unique`, `name text` (null dovoljen), `email varchar(254) not null`, `unique index on lower(email)`, `language varchar(2) null check (language in ('sl','en'))`, `theme varchar(5) null check (theme in ('light','dark'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- [X] T004 [P] FR-001-01 Emulator na istem izvoru (research R-04): v frontend/nginx.conf lokacije `/identitytoolkit.googleapis.com/`, `/securetoken.googleapis.com/`, `/emulator/` → `http://auth:9099`; enake poti v `server.proxy` v frontend/vite.config.ts (→ `http://localhost:9099`) in v `workbox.navigateFallbackDenylist`; v frontend/Dockerfile `ARG`/`ENV` `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_EMULATOR` s privzetki za `demo-contact-manager` in emulator; `build.args` v compose.yaml
- [X] T005 [P] FR-001-18 i18n ključi za vsa besedila in dostopna imena iz plan.md (*Key elements*, naslovi strani, sporočila) v frontend/src/i18n/sl.json in frontend/src/i18n/en.json (ista drevesa ključev)
- [X] T006 [P] FR-001-07 Podpora BE testom: v backend/src/test/java/si/contactmanager/support/FirebaseEmulatorContainer.java metodi `signInWithGoogle(email, name)` (`accounts:signInWithIdp`, `providerId=google.com`, nepodpisan `id_token` z `sub`, `email`, `name`, `email_verified`) in `updateUser(idToken, displayName, email)` (`accounts:update`, vrne nov ID žeton); support/Http.java – pošiljanje JSON telesa; support/Tokens.java – sestavljanje ponarejenih žetonov (nepodpisan z danimi zahtevki, `alg: RS256` z naključnim podpisom, pokvarjen niz)
- [X] T007 [P] FR-001-06 Podpora FE testom: frontend/src/test/authFake.ts (izvedba `AuthGateway` v pomnilniku: `signInWithGoogle` uspe ali vrže dano kodo, `signOut`, `emitSignedOut()` za odjavo v drugem zavihku, `getIdToken`) in frontend/src/test/renderApp.tsx (izris `App` na dani poti z `authFake` in MSW)
- [X] T008 [P] FR-001-01 Podpora E2E: e2e/tests/support/auth.ts – `signIn(page, { email, name })` prek pojavnega okna emulatorja (gumbi in polja okna po vlogah in oznakah; okno je del emulatorja, ne aplikacije, zato njegova imena niso v plan.md), `uniqueUser()` z naključnim e-naslovom

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [X] T009 FR-001-07 backend/src/main/java/si/contactmanager/shared/security/FirebaseJwtDecoder.java – javni tovarni metodi `production(String projectId, JWKSource<SecurityContext> keys, Clock clock)` in `emulator(String projectId, Clock clock)`, ki vrneta `JwtDecoder`, katerega `decode` vrže `BadJwtException("not implemented")`; FirebaseProperties.java (`projectId`, `emulator`)
- [X] T010 [P] FR-001-02 FR-001-19 Ogrodje v backend/src/main/java/si/contactmanager/account/: `Profile` (`name`, `email`, `language`, `theme`), `Preferences` (`language`, `theme`), `MeController` s `PUT /api/me` in `PUT /api/me/preferences`, ki vrneta `501`
- [X] T011 [P] FR-001-06 Ogrodje FE: frontend/src/features/auth/AuthGateway.ts (vmesnik in tipi), prazne komponente `LoginPage`, `AuthProvider` (samo izriše otroke), `RequireAuth` (samo izriše otroke), frontend/src/features/account/AccountPage.tsx, frontend/src/shared/layout/AppShell.tsx, frontend/src/shared/pages/NotFoundPage.tsx; `safeNextPath.ts`, `features/account/preferences.ts`, `shared/api/authFetch.ts` z izvoženimi funkcijami, ki vržejo `Error('not implemented')`; `App` sprejme `gateway` in izriše poti iz plan.md (`/login`, `/`, `/account`, `*`)

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja.

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje

- [X] T012 [P] [US2] FR-001-07 Unit backend/src/test/java/si/contactmanager/shared/security/FirebaseJwtDecoderTest.java: produkcijski način z lokalnim ključem RSA – veljaven žeton sprejet (`sub`, `email`, `name`), napačen podpis, drug izdajatelj, drugo občinstvo, potekel `exp`, `iat` v prihodnosti, prazen `sub` zavrnjeni; način emulatorja – nepodpisan veljaven sprejet, podpisan (`RS256`) in nepodpisan z napačnim `aud`/`iss`/`exp` zavrnjeni
- [X] T013 [P] [US2] FR-001-07 FR-001-08 FR-001-19 Varnostni backend/src/test/java/si/contactmanager/account/AuthenticationSecurityIT.java: parametrizirano `PUT /api/me` in `PUT /api/me/preferences` × {brez glave, `Bearer` pokvarjen niz, `alg: RS256` z naključnim podpisom, drug projekt (`aud`/`iss`), potekel, brez `email`} → `401 {"code":"UNAUTHENTICATED"}`, v `app_user` ni nove vrstice in obstoječi profil se ne spremeni; veljaven žeton emulatorja → `2xx`; `GET /api/health` brez žetona `200`
- [X] T014 [P] [US1] FR-001-02 FR-001-03 FR-001-08 Integracijski backend/src/test/java/si/contactmanager/account/ProfileIT.java: prva `PUT /api/me` → `201`, telo natanko `{name, email, language: null, theme: null}` (brez `id`/UID), v bazi ena vrstica; druga → `200` in še vedno ena vrstica; po `updateUser` (novo ime in e-naslov) in novem žetonu `PUT /api/me` → `200` z novima vrednostma, brez nove vrstice; dve sočasni `PUT /api/me` novega uporabnika → obe `2xx`, ena vrstica; račun brez imena → `name: null`; telo z neznanim poljem (npr. `email`) → `400 VALIDATION_FAILED` z `errors[{field:"email",code:"UNKNOWN_FIELD"}]` in e-naslov ostane iz žetona
- [X] T015 [P] [US5] FR-001-15 FR-001-17 FR-001-19 Integracijski backend/src/test/java/si/contactmanager/account/PreferencesIT.java: `PUT /api/me/preferences {"language":"en","theme":"dark"}` → `200` z vrednostma; `{"language":null,"theme":null}` izbriše; `{"language":"de",…}` → `400` z `errors[{field:"language",code:"INVALID_VALUE"}]`, `{"theme":"blue"}` → `field:"theme"`; manjkajoče polje → `code:"REQUIRED"`; neveljaven JSON → `400` z `errors[{field:"body",code:"MALFORMED"}]`; ob vsaki `400` se profil ne spremeni; `PUT /api/me` z izbiro naprave v profil brez izbire jo shrani; v profil z izbiro je ne shrani (profil ima prednost, odgovor vrne izbiro profila); pravilo velja po polju; nov žeton istega uporabnika (druga naprava) dobi shranjeno izbiro; `PUT /api/me/preferences` pred prvo sinhronizacijo ustvari profil
- [X] T016 [US2] FR-001-07 Uskladi backend/src/test/java/si/contactmanager/FirebaseEmulatorIT.java s FR-001-07: test `apiRejectsEmulatorTokenWith401InScaffold` (začasno vedenje 000) zamenjaj s testom, da je veljaven žeton emulatorja sprejet (`PUT /api/me` → `2xx`) in da neobstoječa pot z veljavnim žetonom vrne `404` (research R-10); vnos `sprememba-testa` v DECISIONS.md

### Vmesnik – unit

- [X] T017 [P] [US2] FR-001-06 frontend/src/features/auth/safeNextPath.test.ts: `/a/b?c=1` ostane; `null`, prazno, `//zlonamerno.si`, `/\\zlonamerno.si`, `https://zlonamerno.si`, `javascript:…`, `a/b` → `/`; `/login…` → `/`
- [X] T018 [P] [US5] FR-001-15 FR-001-16 FR-001-17 frontend/src/features/account/preferences.test.ts: branje/pisanje `language` in `theme` v `localStorage`; neznana vrednost se prezre; `localStorage`, ki vrže, ne podre funkcij; začetni jezik: shranjen ima prednost, sicer `sl`/`sl-SI` → `sl`, `de-DE` → `en`; `applyTheme('dark'|'light')` nastavi `data-theme`, `applyTheme(null)` ga odstrani in izbriše ključ
- [X] T019 [P] [US3] FR-001-07 FR-001-10 frontend/src/shared/api/authFetch.test.ts (MSW): zahtevek nosi `Authorization: Bearer <žeton iz gateway>`; brez prijavljenega uporabnika se zahtevek **ne pošlje** in sproži izguba seje; `getIdToken` vrže (žetona ni mogoče podaljšati) → zahtevek se ne pošlje, izguba seje; `401` sproži izgubo seje; drugi neuspehi vržejo `ApiError` s kodo

### Vmesnik – funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel)

- [X] T020 [P] [US1] FR-001-01 FR-001-02 FR-001-04 FR-001-05 FR-001-15 FR-001-18 frontend/src/features/auth/LoginPage.test.tsx in frontend/src/features/auth/signInErrorCode.test.ts (preslikava kod Firebase `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/popup-blocked`, `auth/network-request-failed`, brez povezave → vzrok sporočila): kartica z naslovom »Kontakti« in gumbom »Prijava z Googlom«, brez `textbox`; klik → `PUT /api/me` in preusmeritev na `/`; vsaka napaka (prekinjeno, blokirano okno, brez povezave, `PUT /api/me` vrne `500`) → ustrezen `alert` iz plan.md, uporabnik ostane na prijavi (ob napaki zaledja odjavljen v gateway), ponoven poskus uspe; prijavljen na `/login` → `/`; gumba »Slovenščina«/»English« zamenjata jezik, `<html lang>`, naslov in shranita izbiro (jezik brskalnika brez shranjene izbire – FR-001-16 – preverita T018 in E2E 000 `de-DE`); naslov »Prijava – Kontakti« / "Sign in – Contacts"; axe brez kršitev
- [X] T021 [P] [US2] [US3] FR-001-06 FR-001-09 FR-001-10 frontend/src/app/routes.test.tsx: neprijavljen na `/account?x=1` → `/login?next=…`, vsebina *Mojega računa* ni nikoli v DOM (tudi med nalaganjem stanja); po prijavi vrnitev na `/account?x=1`; `next=//zlonamerno.si` → `/`; neprijavljen na `/ne-obstaja` → prijava, po prijavi »Te strani ni«; po *Odjava* v meniju je stran za prijavo brez sporočila, profil ni več prikazan, *Nazaj* (zgodovina) ne prikaže zaščitene vsebine, nadaljnji zahtevki niso poslani; `401` na `PUT /api/me/preferences` → `/login` z `alert` »Seja je potekla. Prijavi se znova.« in po prijavi vrnitev na `/account`; odjava v drugem zavihku (`emitSignedOut`) → isto sporočilo in vrnitev; dejanje z zahtevkom po izgubi uporabnika v gateway ne pošlje zahtevka (MSW ga ne prejme)
- [X] T022 [P] [US4] FR-001-09 FR-001-11 FR-001-12 FR-001-19 frontend/src/shared/layout/AppShell.test.tsx: prvi *Tab* fokusira »Preskoči na vsebino«, aktivacija premakne fokus na `main`; `banner` s povezavo »Kontakti« na `/`; gumb »Meni računa« z začetnicami (ime brez imena → prva črka e-naslova); meni vsebuje `menuitem` »Moj račun«, skupino »Jezik« z `menuitemradio` in `menuitem` »Odjava«; puščice premikajo fokus, *Esc* zapre in vrne fokus na gumb; izbira *English* v meniju zamenja jezik in pošlje `PUT /api/me/preferences`; neuspeh (`500`) → `alert` »Izbire ni bilo mogoče shraniti v račun.«, jezik ostane, »Zapri sporočilo« ga zapre; axe brez kršitev (zaprt in odprt meni)
- [X] T023 [P] [US5] FR-001-09 FR-001-14 FR-001-15 FR-001-17 FR-001-18 FR-001-19 frontend/src/features/account/AccountPage.test.tsx: naslov »Moj račun«, razdelek »Profil« z imenom in e-naslovom brez `textbox` (brez imena → e-naslov); razdelek »Videz«: skupina »Jezik« – *English* takoj zamenja besedila, dostopna imena, `<html lang="en">`, naslov "My account – Contacts", zapiše `localStorage` in pošlje `PUT /api/me/preferences` z obema vrednostma; skupina »Tema« – *Temna*/*Svetla* nastavi `data-theme` in ključ, *Sistemska* (privzeta) ga odstrani in pošlje `theme: null`; neuspeh shranjevanja → `alert`, izbira ostane; gumb »Odjava« odjavi; axe brez kršitev v svetli in temni temi
- [X] T024 [P] [US5] FR-001-03 FR-001-19 frontend/src/features/auth/AuthProvider.test.tsx: ob prijavljenem uporabniku (prijava ali nalaganje) se pošlje `PUT /api/me` z izrecno izbiro naprave (`localStorage`, sicer `null`); vrnjena izbira profila se uveljavi in zapiše (profil `en`/`dark` preglasi napravo `sl`/`light`); vrnjeni `null` izbriše ključ in vrne privzeto
- [X] T025 [P] [US4] FR-001-13 FR-001-18 frontend/src/shared/pages/NotFoundPage.test.tsx: naslov »Te strani ni«, stavek, povezava »Na seznam skupin« na `/`, naslov dokumenta »Te strani ni – Kontakti« in v angleščini "Page not found – Contacts"; komponenta je izvožena za druge funkcionalnosti; axe brez kršitev

### E2E (Compose, emulator; 360/768/1280 px; axe na vsaki strani)

- [X] T026 [P] [US1] [US2] [US3] [US4] [US5] FR-001-01 … FR-001-19 e2e/tests/prijava.spec.ts: (1) nov uporabnik `/` → prijava (axe), *Prijava z Googlom* prek emulatorja → začetna stran, *Moj račun* prikaže ime in e-naslov; (2) neprijavljen `/account?x=1` → po prijavi `/account?x=1`; (3) *Odjava* → prijava, *Nazaj* ne prikaže zaščitene vsebine; (4) dva zavihka, odjava v enem → drugi na prijavi s sporočilom o poteku seje, po prijavi nazaj na isto pot; (5) tipkovnica: prvi *Tab* = »Preskoči na vsebino«, meni računa z *Enter*/puščicami/*Esc*; (6) `/ne-obstaja` → »Te strani ni« (axe); (7) *Moj račun*: *English* + *Temna* → takoj, po osvežitvi, po odjavi na prijavi; nov kontekst brskalnika (druga naprava) z istim računom → takoj po prijavi angleščina in temna shema; (8) naslovi strani v sl/en; (9) 320 px brez vodoravnega drsenja na prijavi in *Mojem računu*, tudi z zelo dolgim imenom in e-naslovom; (10) axe brez kršitev na *Prijavi*, *Mojem računu* in *Te strani ni* v svetli in temni shemi ter v sl in en (SC-006)

---

## Phase 4: Test review (independent agent gate)

- [X] T027 — Pregled testov z NOVIM podagentom `pregled-testov` (`.claude/agents/pregled-testov.md`), ki dobi samo `specs/001-prijava/` in seznam testnih datotek T012–T026. Ob ZAVRNJENO popravi teste in zaženi novega pregledovalca (največ trije krogi, nato vprašaj razvijalca). Ob SPREJETO zapiši vse kroge v specs/001-prijava/traceability.md (*Pregled testov*) in naredi commit `test(001): …` (samo testi, podpora testom in minimalno ogrodje).

**Checkpoint**: nobena naloga od T028 naprej se ne začne pred SPREJETO.

---

## Phase 5: User Story 1 - Prva prijava z Googlom ustvari račun (P1) 🎯 MVP

**Goal**: prijava z Googlom ustvari ali posodobi profil. **Independent Test**: T014, T020, E2E (1).

- [ ] T028 [US1] FR-001-07 Implementiraj FirebaseJwtDecoder (research R-01): produkcija – `NimbusJwtDecoder` z `JWKSource` in validatorji `iss = https://securetoken.google.com/<projekt>`, `aud ∋ <projekt>`, `exp`/`iat` (60 s zamika), neprazen `sub`, prisoten `email`; emulator – `PlainJWT` samo `alg: none`, isti validatorji; v backend/src/main/java/si/contactmanager/shared/security/FirebaseJwtDecoder.java
- [ ] T029 [US1] FR-001-07 SecurityConfig: `oauth2ResourceServer().jwt()` z dekoderjem iz FirebaseProperties (`FIREBASE_PROJECT_ID`, emulator ob nastavljenem `FIREBASE_AUTH_EMULATOR_HOST`, JWK URI Googla), obstoječa vstopna točka 401 tudi za `BearerTokenAuthenticationEntryPoint`; `/error` dovoljen, da neobstoječa pot z žetonom vrne `404`; v backend/src/main/java/si/contactmanager/shared/security/SecurityConfig.java in application.yaml
- [ ] T030 [US1] FR-001-02 FR-001-03 FR-001-19 ProfileRepository (`JdbcClient`, `INSERT … ON CONFLICT (firebase_uid) DO UPDATE SET name, email, language = COALESCE(app_user.language, :language), theme = COALESCE(app_user.theme, :theme), updated_at = now() RETURNING …, (xmax = 0) AS inserted`) v backend/src/main/java/si/contactmanager/account/ProfileRepository.java
- [ ] T031 [US1] FR-001-02 FR-001-08 `PUT /api/me` v MeController: uporabnik iz `Jwt` (`sub`, `email`, `name`), neobvezno telo `Preferences`, `201`/`200` s `Profile`; ApiExceptionHandler in ValidationError (`400 VALIDATION_FAILED`, `errors[{field, code}]`; neznano polje, neveljaven JSON, neznana vrednost) v backend/src/main/java/si/contactmanager/shared/error/
- [ ] T032 [US1] FR-001-01 FR-001-02 FR-001-04 firebaseGateway.ts in signInErrorCode.ts (SDK, `GoogleAuthProvider`, `signInWithPopup`, `connectAuthEmulator(auth, location.origin, { disableWarnings: true })` v načinu emulatorja, preslikava kod napak) in main.tsx (gateway v `App`) v frontend/src/features/auth/
- [ ] T033 [US1] FR-001-01 FR-001-02 FR-001-04 FR-001-05 LoginPage (design.md 9.1: kartica, besedni znak, stavek, gumb z logotipom G, `alert` v kartici, preklop jezika pod kartico) in AuthProvider (stanje, sinhronizacija `PUT /api/me`, ob napaki odjava) v frontend/src/features/auth/

## Phase 6: User Story 2 - Zaščitene poti in zaledje (P1)

**Goal**: neprijavljen ne vidi zaščitenih strani; zaledje zavrne neveljavne žetone. **Independent Test**: T012, T013, T016, T017, T021.

- [ ] T034 [US2] FR-001-06 safeNextPath in RequireAuth (nič se ne izriše, dokler stanje ni znano; `Navigate replace` na `/login?next=`) v frontend/src/features/auth/
- [ ] T035 [US2] FR-001-05 FR-001-06 Poti v frontend/src/app/App.tsx (`BrowserRouter`, `/login` javno, ostalo pod `RequireAuth` in `AppShell`); prijavljen na `/login` → `next` ali `/`

## Phase 7: User Story 3 - Odjava in potek seje (P1)

**Independent Test**: T019, T021, E2E (3), (4).

- [ ] T036 [US3] FR-001-07 FR-001-10 authFetch (žeton iz gateway; brez uporabnika ne pošlje in sproži izgubo seje; `401` → izguba seje) v frontend/src/shared/api/authFetch.ts
- [ ] T037 [US3] FR-001-09 FR-001-10 Lokalna odjava (zastavica, izbris profila, `/login` z `replace`) in izguba seje (gateway `null` brez lokalne odjave, napaka žetona, `401`) → `/login?reason=session-expired&next=` v AuthProvider; obvestilo o poteku seje v LoginPage

## Phase 8: User Story 4 - Ogrodje aplikacije in »Te strani ni« (P2)

**Independent Test**: T022, T025, E2E (5), (6).

- [ ] T038 [P] [US4] FR-001-12 shadcn *Dropdown Menu* v frontend/src/shared/ui/dropdown-menu.tsx (radix-ui), prilagojen po design.md 13.4 (fokus 13.3, `text-base`, `h-11`, senca `float`, brez lucide)
- [ ] T039 [US4] FR-001-11 FR-001-12 AppShell (`header` 56 px z besednim znakom, `main#main tabIndex=-1`, sporočilo o neuspelem shranjevanju), SkipLink in AccountMenu (začetnice, *Moj račun*, jezik, *Odjava*) v frontend/src/shared/layout/; StartPage brez lastnega `main` v frontend/src/app/StartPage.tsx
- [ ] T040 [P] [US4] FR-001-13 FR-001-18 NotFoundPage (design.md 9.10) in naslovi strani (`useDocumentTitle`) v frontend/src/shared/pages/

## Phase 9: User Story 5 - Moj račun: Profil in Videz (P2)

**Independent Test**: T015, T018, T023, T024, E2E (7).

- [ ] T041 [US5] FR-001-15 FR-001-17 FR-001-19 `PUT /api/me/preferences` v MeController (obe polji obvezni, `null` dovoljen, zapis z ustvarjanjem profila po potrebi) v backend/src/main/java/si/contactmanager/account/
- [ ] T042 [US5] FR-001-15 FR-001-16 FR-001-17 preferences.ts (`localStorage` v `try/catch`, neznane vrednosti prezrte, `applyTheme`, `applyLanguage`) in i18n začetni jezik (shranjen > brskalnik) v frontend/src/features/account/preferences.ts in frontend/src/i18n/index.ts
- [ ] T043 [US5] FR-001-14 FR-001-15 FR-001-17 FR-001-19 AccountPage (Profil `dl`, Videz z `fieldset`/`legend` in nativnimi `radio`, *Odjava*), skupna akcija spremembe izbire (lokalno → `PUT /api/me/preferences` → ob neuspehu sporočilo v ogrodju) v frontend/src/features/account/
- [ ] T044 [US5] FR-001-19 Uveljavitev izbire iz profila ob sinhronizaciji (`PUT /api/me` s telesom izbire naprave) v frontend/src/features/auth/AuthProvider.tsx

---

## Phase N: Polish & Cross-Cutting Concerns

- [ ] T045 — `/speckit-converge` do »Converged«; `./verify.sh quick` zelen
- [ ] T046 — Posodobi specs/001-prijava/traceability.md (vsak FR-ID → testi → stanje)
- [ ] T047 — `./verify.sh full` zelen
- [ ] T048 — Potisni vejo `prijava` in odpri PR v `main` (predpostavke, izid pregleda testov, commit `test(001)` v opisu)
- [ ] T049 — Razvijalca: pregled PR in ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10, quickstart #10); združitev (agent pusti neoznačeno)

---

## Dependencies & Execution Order

- Setup (T001–T008) → Foundational (T009–T011) → Tests (T012–T026) → Test review (T027) strogo zaporedno.
- Po T027: US1 (T028–T033) → US2 (T034–T035) → US3 (T036–T037) → US4 (T038–T040) → US5 (T041–T044) → Polish.
- T029 potrebuje T028; T031 potrebuje T030; T033 potrebuje T032; T037 potrebuje T036; T039 potrebuje T038; T043 potrebuje T041, T042.
- `/speckit-implement` teče dvakrat: najprej do vključno faze 3, po SPREJETO še ostale faze.

## Parallel Opportunities

- Setup: T002–T008 (različne datoteke).
- Tests: T012–T015 (BE), T017–T020, T022–T025 (FE) in T026 (E2E) so v ločenih datotekah.
- Implementacija: T038 in T040 vzporedno s T039 se ne začneta, dokler ni T035.

## Implementation Strategy

- **MVP**: US1 + US2 + US3 (vse P1) – prijava, zaščita in odjava; nato US4 in US5 (P2).
- Vsaka zgodba po zaključku: njeni testi zeleni, `./verify.sh quick` zelen.

## Notes

- Testi se po pregledu spreminjajo samo zaradi specifikacije (DECISIONS.md).
- Brez utišanj brez D-NN; barve samo iz žetonov (izjema: logotip G, research R-07).
