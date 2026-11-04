# Implementation Plan: Prijava, ogrodje aplikacije in Moj račun

**Branch**: `prijava` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-prijava/spec.md`

## Summary

Zaledje dobi preverjanje ID žetonov Firebase (Spring Security OAuth2 Resource Server; produkcijski način s podpisom
po JWK Googla, način emulatorja za nepodpisane žetone) in profil uporabnika v tabeli `app_user` z izbiro jezika in
teme. `PUT /api/me` ob vsaki prijavi ustvari ali posodobi profil iz žetona in vrne veljavno izbiro (profil ima
prednost, prazna polja prevzamejo izbiro naprave); `PUT /api/me/preferences` shrani spremembo. Vmesnik dobi Firebase
JS SDK (prijava z Googlom v pojavnem oknu, emulator na istem izvoru prek nginx), `react-router` z zaščitenimi potmi
in varno ciljno potjo, ogrodje (zgornja vrstica, *Preskoči na vsebino*, meni računa s shadcn *Dropdown Menu*),
strani *Prijava*, *Moj račun* (Profil, Videz) in *Te strani ni*, ter obravnavo poteka seje in odjave v drugem
zavihku. Podrobnosti odločitev so v [research.md](research.md).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22 (zahteva `react-router` 8)

**Primary Dependencies**:
- BE: obstoječe (Web MVC, Security, Actuator, Data JPA/JDBC, Flyway, PostgreSQL) + `spring-boot-starter-security-oauth2-resource-server` (Nimbus JOSE + JWT)
- FE: obstoječe + `firebase` 13.2.0 (`firebase/auth`), `react-router` 8.5.1, `radix-ui` 1.8.1 (shadcn *Dropdown Menu*)

**Storage**: PostgreSQL 18; migracija `V2__uporabnik.sql` (tabela `app_user`, [data-model.md](data-model.md)); v brskalniku `localStorage` (`language`, `theme`)

**Testing**: JUnit 5 + Testcontainers (PostgreSQL, Firebase Auth Emulator) · Vitest + RTL + MSW + `vitest-axe` (prijava prek testne izvedbe `AuthGateway`, research R-09) · Playwright + axe (prava prijava prek okna emulatorja, 360/768/1280 px)

**Target Platform**: Docker Compose (nginx streže vmesnik in posreduje `/api/` zaledju ter poti emulatorja Auth), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: standardna pričakovanja spletne aplikacije; ena sinhronizacija profila na prijavo/nalaganje

**Constraints**: WCAG 2.1 AA, sl/en, brez bliska napačne teme ob nalaganju, brez prikaza zaščitene vsebine neprijavljenemu, brez pravih ključev (projekt `demo-contact-manager`)

**Scale/Scope**: 19 FR (FR-001-01 … FR-001-19), 2 endpointa, 4 poti, 1 tabela

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-001-01 … FR-001-19; *Public Interfaces* spodaj določajo endpointe, poti in dostopna imena, na katere se sklicujejo testi. Negativni scenariji iz spec so v varnostnih testih (401 za vse endpointe in vse vrste neveljavnih žetonov). |
| II. Test-first | BE: unit (`FirebaseJwtDecoderTest` – podpis, izdajatelj, občinstvo, čas), integracijski (`ProfileIT`, `PreferencesIT` – emulator + Testcontainers), varnostni (`AuthenticationSecurityIT` – vsak endpoint × vsaka vrsta neveljavnega žetona). FE: unit (`safeNextPath`, shranjevanje izbire, odjemalec API), funkcionalni (strani in ogrodje z MSW in `vitest-axe`). E2E (`prijava.spec.ts`) pri treh širinah. Pregled testov opravi agent `pregled-testov` pred kodo. Sprememba testa 000 `FirebaseEmulatorIT` z vnosom v DECISIONS (research R-09). |
| III. Group isolation and roles | Endpointi niso vezani na skupino (najnižja vloga »—«), zato ni vnosov v matriki izolacije skupin. Za vire, vezane na uporabnika, velja §2.2: `401` brez prijave; tujega vira ni mogoče nasloviti (ni identifikatorja v poti), zato `404` za tuj vir ne nastopi. Uporabnik je vedno `sub` iz žetona. |
| IV. Accessible, bilingual, responsive UI | design.md 7.1 (zgornja vrstica), 8.12 (fokus, *Preskoči na vsebino*), 8.13 (sporočila), 8.15 (brez povezave), 8.16 (meni), 9.1, 9.9, 9.10; vsa besedila in dostopna imena v sl/en; `<html lang>` in edinstveni naslovi; axe v FE testih in E2E; 320 px brez vodoravnega drsenja. |
| V. Data integrity | Ni urejanja kontaktov ali seznamov. Profil: en stavek `INSERT … ON CONFLICT` zagotovi en profil ob sočasnih prijavah. |
| VI. Privacy and GDPR | Hranijo se ime, e-naslov, datum registracije in izbira jezika/teme (konstitucija VI 1.1.0, D-19); identifikatorji niso v API-ju. Logi brez žetonov (obstoječi `RequestIdFilter`). Izvoz in izbris sta 012. |
| VII. One verification path | Vsi novi testi tečejo v obstoječih korakih `verify.sh` (`unit BE`, `integracijski BE`, `varnostni BE`, `unit FE`, `funkcionalni FE`, `E2E`); nove knjižnice dobijo vnos v `DECISIONS.md`. |

**Rezultat (pred raziskavo):** PASS.

**Ponovno preverjanje po fazi 1:** PASS. Edina izjema od pravila »barve samo iz žetonov« je logotip G na gumbu
»Prijava z Googlom« (barve blagovne znamke Google, ki jih zahteva design.md 9.1; research R-07) – ni kršitev
konstitucije (ta določa žetone za vmesnik, design.md pa sam predpisuje ta gumb).

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| PUT | /api/me | — (prijavljen) | – (ni vezano na skupino) | 201 ob prvi prijavi, sicer 200; telo `Profile` | FR-001-02, FR-001-03, FR-001-07, FR-001-08, FR-001-19 |
| PUT | /api/me/preferences | — (prijavljen) | – | 200; telo `Profile` | FR-001-15, FR-001-17, FR-001-19 |

- Telo `PUT /api/me` (neobvezno) in `PUT /api/me/preferences` (obvezno): `{"language": "sl"|"en"|null, "theme": "light"|"dark"|null}`.
- `Profile`: `{"name": string|null, "email": string, "language": "sl"|"en"|null, "theme": "light"|"dark"|null}`.
- Napake: `401 {"code":"UNAUTHENTICATED"}` (brez žetona, neveljaven, ponarejen, potekel, drug projekt, brez `email`);
  `400 {"code":"VALIDATION_FAILED","errors":[{"field","code"}]}` (neznana vrednost, manjkajoče polje, neveljaven JSON).
- Z veljavnim žetonom neobstoječa pot `/api/**` vrne `404` s praznim telesom (research R-10); `GET /api/health` ostane javen.
- Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Prijava | /login (neobvezno `?next=<pot znotraj aplikacije>` in `?reason=session-expired`) | javno; prijavljen → `next` ali `/` | FR-001-01, FR-001-04, FR-001-05, FR-001-06, FR-001-10, FR-001-15, FR-001-16, FR-001-18 |
| Začetna stran (do 002 začasna vsebina) | / | — (prijavljen) | FR-001-02, FR-001-11 |
| Moj račun | /account | — (prijavljen) | FR-001-09, FR-001-14, FR-001-15, FR-001-17, FR-001-18, FR-001-19 |
| Te strani ni | vsaka druga pot (`*`) | — (prijavljen; neprijavljen → prijava) | FR-001-13, FR-001-18 |

- Neprijavljen na katerikoli poti razen `/login` → `/login?next=<pot s poizvedbo>` (zamenjava v zgodovini). `next`
  velja samo, če se začne z enim `/` in ni `//` ali `/\`; sicer `/`.
- Izguba seje (žetona ni mogoče osvežiti, `401` z zaledja, odjava v drugem zavihku) →
  `/login?reason=session-expired&next=<trenutna pot>`. Lokalna *Odjava* → `/login` brez parametrov.
- Naslovi strani: »Prijava – Kontakti« / "Sign in – Contacts"; »Moj račun – Kontakti« / "My account – Contacts";
  »Te strani ni – Kontakti« / "Page not found – Contacts"; začetna stran »Kontakti« / "Contacts".
- nginx in strežnik Vite posredujeta `/identitytoolkit.googleapis.com/`, `/securetoken.googleapis.com/` in `/emulator/`
  emulatorju Auth (research R-04); service worker teh poti in `/api/` ne prestreže.

### Key elements and accessible names

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Prijava | heading (level 1) | »Kontakti« / "Contacts" | besedni znak v kartici (design.md 9.1) | FR-001-01 |
| Prijava | button | »Prijava z Googlom« / "Sign in with Google" | odpre Googlovo okno za prijavo; edina kontrola prijave (ni `textbox`) | FR-001-01, FR-001-02 |
| Prijava | alert | besedilo napake: »Prijava je bila prekinjena. Poskusi znova.« / "Sign-in was cancelled. Please try again."; »Brskalnik je blokiral okno za prijavo. Dovoli pojavna okna za to stran in poskusi znova.« / "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."; »Ni povezave. Preveri povezavo in poskusi znova.« / "You're offline. Check your connection and try again."; »Prijava ni uspela. Poskusi znova.« / "Sign-in failed. Please try again." | napaka prijave v kartici | FR-001-04 |
| Prijava | alert | »Seja je potekla. Prijavi se znova.« / "Your session has expired. Please sign in again." | obvestilo ob `reason=session-expired` | FR-001-10 |
| Prijava | group | »Jezik« / "Language" | preklop jezika pod kartico | FR-001-15 |
| Prijava | button (`aria-pressed`) | »Slovenščina« / »English« (v obeh jezikih enako) | izbira jezika; izbrani ima `aria-pressed="true"` | FR-001-15 |
| Ogrodje | link | »Preskoči na vsebino« / "Skip to content" | prvi element fokusa; premakne fokus na `main` | FR-001-11 |
| Ogrodje | banner | – | zgornja vrstica (`header`) | FR-001-11 |
| Ogrodje | link | »Kontakti« / "Contacts" | besedni znak v zgornji vrstici, vodi na `/` | FR-001-11 |
| Ogrodje | button | »Meni računa« / "Account menu" | odpre meni računa; vidna je samo ikona osebe (`aria-hidden`), brez besedila (CR-01, WCAG 2.5.3); na vrhu menija ime ali e-naslov | FR-001-11, FR-001-12 |
| Ogrodje | menu | »Meni računa« / "Account menu" | odprt meni (design.md 8.16) | FR-001-12 |
| Ogrodje | menuitem | »Moj račun« / "My account" | povezava na `/account` | FR-001-12 |
| Ogrodje | group (v meniju) | »Jezik« / "Language" | izbira jezika v meniju | FR-001-12 |
| Ogrodje | menuitemradio | »Slovenščina« / »English« | izbira jezika (izbrani `aria-checked="true"`) | FR-001-12, FR-001-15 |
| Ogrodje | menuitem | »Odjava« / "Sign out" | odjava | FR-001-09, FR-001-12 |
| Ogrodje | main | – | glavna vsebina (`<main id="main" tabindex="-1">`) | FR-001-11 |
| Ogrodje | alert | »Izbire ni bilo mogoče shraniti v račun.« / "Your choice could not be saved to your account." | neuspelo shranjevanje izbire v profil (pod zgornjo vrstico) | FR-001-19 |
| Ogrodje | button | »Zapri sporočilo« / "Dismiss message" | zapre zgornje sporočilo | FR-001-19 |
| Začetna stran | heading (level 1) | »Kontakti« / "Contacts" | začasna vsebina do 002 | FR-001-02 |
| Moj račun | heading (level 1) | »Moj račun« / "My account" | naslov strani | FR-001-14 |
| Moj račun | heading (level 2) | »Profil« / "Profile" | razdelek Profil | FR-001-14 |
| Moj račun | term / definition | »Ime« / "Name", »E-naslov« / "Email" | ime in e-naslov samo za branje (`dl`, brez polj) | FR-001-14 |
| Moj račun | heading (level 2) | »Videz« / "Appearance" | razdelek Videz | FR-001-15, FR-001-17 |
| Moj račun | group | »Jezik« / "Language" | `fieldset` z `legend` | FR-001-15 |
| Moj račun | radio | »Slovenščina« / »English« | izbira jezika | FR-001-15, FR-001-19 |
| Moj račun | group | »Tema« / "Theme" | `fieldset` z `legend` | FR-001-17 |
| Moj račun | radio | »Sistemska« / "System", »Svetla« / "Light", »Temna« / "Dark" | izbira teme | FR-001-17, FR-001-19 |
| Moj račun | button | »Odjava« / "Sign out" | odjava | FR-001-09 |
| Te strani ni | heading (level 1) | »Te strani ni« / "Page not found" | naslov (design.md 9.10) | FR-001-13 |
| Te strani ni | link | »Na seznam skupin« / "Back to groups" | vodi na `/` | FR-001-13 |

- Stavek na *Te strani ni*: »Povezava je napačna ali pa stran ni več na voljo.« / "The link is wrong or the page is no longer available.";
  pod naslovom kartice za prijavo: »Kontakti tvojih projektov in podjetij, na enem mestu.« / "Contacts for your projects and companies, in one place."
- Komponenta `NotFoundPage` je izvožena za druge funkcionalnosti (FR-001-13, scenarij 6).

## Project Structure

### Documentation (this feature)

```text
specs/001-prijava/
├── spec.md
├── plan.md              # ta datoteka
├── research.md          # faza 0
├── data-model.md        # faza 1
├── quickstart.md        # faza 1
├── contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/
├── pom.xml                                         # + spring-boot-starter-security-oauth2-resource-server
├── src/main/java/si/contactmanager/
│   ├── shared/security/
│   │   ├── SecurityConfig.java                     # resource server, 401 iz obstoječe vstopne točke
│   │   ├── FirebaseJwtDecoder.java                 # produkcijski način in način emulatorja (research R-01)
│   │   └── FirebaseProperties.java                 # projekt, emulator (FIREBASE_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST)
│   ├── shared/error/{ErrorResponse, ValidationError, ApiExceptionHandler}.java
│   └── account/
│       ├── MeController.java                       # PUT /api/me, PUT /api/me/preferences
│       ├── ProfileRepository.java                  # JdbcClient, INSERT … ON CONFLICT
│       └── {Profile, Preferences, Language, Theme}.java
├── src/main/resources/db/migration/V2__uporabnik.sql
└── src/test/java/si/contactmanager/
    ├── shared/security/FirebaseJwtDecoderTest.java # unit: podpis, iss, aud, exp, sub
    ├── account/{ProfileIT, PreferencesIT}.java      # integracijski (emulator + Testcontainers)
    ├── account/AuthenticationSecurityIT.java       # varnostni: vsak endpoint × vsak neveljaven žeton
    ├── FirebaseEmulatorIT.java                     # uskladitev z FR-001-07 (DECISIONS)
    └── support/{FirebaseEmulatorContainer, Http, Tokens}.java

frontend/
├── package.json                                    # + firebase, react-router, radix-ui
├── index.html                                      # vrinjen skript za temo (obstaja)
├── nginx.conf, vite.config.ts                      # posredovanje emulatorja; denylist SW
└── src/
    ├── main.tsx, app/App.tsx, app/routes.tsx        # BrowserRouter, poti
    ├── app/StartPage.tsx                           # začasna začetna stran (obstaja)
    ├── features/auth/
    │   ├── AuthGateway.ts, firebaseGateway.ts      # vmesnik in izvedba s SDK (research R-09)
    │   ├── AuthProvider.tsx, RequireAuth.tsx        # stanje seje, zaščita, potek seje
    │   ├── LoginPage.tsx, safeNextPath.ts
    │   └── *.test.ts(x)
    ├── features/account/
    │   ├── AccountPage.tsx, preferences.ts         # izbira jezika in teme (lokalno + profil)
    │   └── *.test.ts(x)
    ├── shared/layout/{AppShell, AccountMenu, SkipLink}.tsx (+ testi)
    ├── shared/pages/NotFoundPage.tsx (+ test)
    ├── shared/ui/dropdown-menu.tsx                 # shadcn, prilagojen (design.md 13.4)
    ├── shared/api/client.ts                        # žeton, izguba seje ob 401 / brez uporabnika
    ├── i18n/{sl,en}.json, i18n/index.ts            # shranjen jezik ima prednost
    └── test/{authFake.ts, renderApp.tsx}           # testna izvedba AuthGateway, izris z usmerjevalnikom

e2e/
├── tests/prijava.spec.ts
└── tests/support/auth.ts                           # prijava prek okna emulatorja

compose.yaml                                        # frontend: build args za Firebase (demo), backend: FIREBASE_*
```

**Structure Decision**: obstoječa struktura iz 000. Koda funkcionalnosti je v paketu `si.contactmanager.account`
in mapah `frontend/src/features/{auth,account}`; skupni deli, ki jih bodo uporabljale druge funkcionalnosti (ogrodje,
*Te strani ni*, meni, odjemalec API), so v `frontend/src/shared/`.

## Complexity Tracking

Ni kršitev konstitucije.
