# Implementation Plan: Ogrodje projekta

**Branch**: `ogrodje` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/000-ogrodje/spec.md`

## Summary

Ogrodje vzpostavi tri projekte (`backend/` Spring Boot 4.1 na Javi 21, `frontend/` React 19 + Vite 8 + Tailwind CSS v4,
`e2e/` Playwright), sistem v Docker Compose (PostgreSQL, Firebase Auth Emulator, backend, frontend za nginx) in ena
vrata kakovosti `./verify.sh quick|full` z zgoščenim izpisom. Backend v 000 nima poslovnih endpointov: ponuja samo
javno preverjanje zdravja (`/api/health`, Actuator, pripravljenost = dosegljiva baza), vse ostale poti `/api/**` zavrne
z `401 UNAUTHENTICATED`, vsak zahtevek dobi ID (`X-Request-Id`), logi so besedilni in brez žetonov ali osebnih podatkov.
Frontend izriše začasno začetno stran z besednim znakom *Kontakti* samo z žetoni Kartoteke (privzeta paleta Tailwinda
izklopljena, prepovedi preverja ESLint), z lokalno gostovanima pisavama, svetlo/temno shemo, i18n sl/en in PWA
(predpomni samo ogrodje). `verify.sh` najprej izvede vse statične korake, nato teste do prvega padca (spec,
Clarifications); `full` teče v ločenem projektu Compose. CI (GitHub Actions) požene `./verify.sh full`, pre-commit kavelj
z gitleaks prepreči commit skrivnosti. Podrobnosti odločitev so v [research.md](research.md).

## Technical Context

**Language/Version**: Java 21 (`--release 21`; prevajanje deluje tudi z JDK 25) · Spring Boot 4.1.x · TypeScript 6.0 (strict) · React 19 · Node.js ≥ 22.12

**Primary Dependencies**:
- BE: Spring Web MVC, Spring Security, Spring Boot Actuator, Spring Data JPA, Flyway, PostgreSQL JDBC, brez Firebase Admin SDK v 000 (testi dobijo žeton emulatorja prek REST; Admin SDK in preverjanje žetonov doda 001)
- FE: Vite 8, `@vitejs/plugin-react`, Tailwind CSS 4.3 (`@tailwindcss/vite`), i18next + react-i18next, `vite-plugin-pwa` 2 (+ `@vite-pwa/assets-generator`), Fontsource (Atkinson Hyperlegible Next/Mono), `@tabler/icons-react`, `clsx` + `tailwind-merge` (`cn()`); shadcn/ui po odločitvi FR-000-16
- Gradnja: Maven Wrapper (Maven 3.9+), npm (`package-lock.json`)

**Storage**: PostgreSQL 18 (Flyway migracije v `backend/src/main/resources/db/migration/`; v 000 brez poslovnih tabel)

**Testing**: JUnit 5 + Spring Boot Test, Testcontainers 2 (PostgreSQL in Firebase Auth Emulator iz `firebase/Dockerfile`) · Vitest 5 (jsdom), React Testing Library, MSW 3, `vitest-axe` · Playwright 1.64 + `@axe-core/playwright` (Chromium, 360/768/1280 px, svetla in temna shema)

**Target Platform**: Docker Compose (Linux vsebniki), evergreen brskalniki, namestljiva PWA; razvoj na Linux/macOS in Windows (Git Bash)

**Project Type**: web application (backend + frontend + e2e) z orodji za preverjanje

**Performance Goals**: SC-001 (sistem pripravljen ≤ 10 min prvič, ≤ 2 min ponovno), SC-003 (`quick` ≤ 3 min)

**Constraints**: brez pravih ključev (Firebase demo projekt `demo-contact-manager`); izpis `verify.sh` ≤ 20 vrstic ob neuspehu, 1 ob uspehu; nič opozoril (ESLint `--max-warnings 0`, `javac -Xlint:all -Werror`); brez virov s tujih izvorov; WCAG 2.1 AA; odziven od 320 px

**Scale/Scope**: 20 FR (FR-000-01 … FR-000-20), 1 javna stran, 1 javni endpoint + privzeta zavrnitev, 9 korakov `quick`, +4 koraki `full`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-000-01 … FR-000-20. *Public Interfaces* spodaj določajo edini endpoint (`GET /api/health`), privzeto zavrnitev `/api/**`, edino stran (`/`) in dostopna imena. Ogrodje ne dostopa do podatkov skupin, zato negativni scenariji opisujejo stanja, ob katerih vrata padejo (spec). |
| II. Test-first | Po en primer na vsaki ravni (FR-000-10): unit BE (`RequestIdFilterTest`, FR-000-20), integracijski BE (`HealthAndMigrationIT`, FR-000-02/03; `FirebaseEmulatorIT`, FR-000-04), varnostni BE (`DefaultDenySecurityIT`, FR-000-10/20), unit FE (`client.test.ts`, MSW), funkcionalni FE (`StartPage.test.tsx`, RTL + MSW + `vitest-axe`, FR-000-12/14), E2E (`ogrodje.spec.ts`, axe pri 3 širinah, FR-000-01/12/13/15). Preverjanja orodij (`verify.sh`, utišanja, prevodi) imajo samotestne primere v `scripts/verify/test/` (research R-10). Testi nosijo FR-ID. Vse preko emulatorja, Testcontainers in MSW. |
| III. Group isolation and roles | Ni endpointov skupin, zato ni vnosov v matriki izolacije. Postavi se temelj matrike: privzeta zavrnitev vsake poti `/api/**` z `401 UNAUTHENTICATED` (vrstica 1 iz `feature-map.md` §2.2), varnostni test je parametriziran po metodah in poteh. |
| IV. Accessible, bilingual, responsive UI | Žetoni iz `design.md` 4.1, 4.2, 5, 6 kot `--k-*` in aliasi 13.2 v `frontend/src/styles/app.css`; privzeta paleta in sence izklopljeni (`--color-*: initial`, `--shadow-*: initial`). i18n sl/en z razvrščanjem po `navigator.language`; `<html lang>` sledi jeziku. `data-theme` po 4.3; `prefers-reduced-motion` in `forced-colors` po 6 in 4.3. PWA po 12. axe v FE testu in E2E (WCAG 2.1 A/AA), 320 px brez vodoravnega drsenja. |
| V. Data integrity | Ni podatkov ali seznamov. Flyway postavi pravilo: migracije se samodejno uveljavijo, neuspešna migracija ustavi zagon (FR-000-03). |
| VI. Privacy and GDPR | Ni osebnih podatkov. Logi brez žetonov, glave `Authorization`, osebnih podatkov in niza poizvedbe (FR-000-20). Pisavi in ikone na istem izvoru, brez CDN (FR-000-12). gitleaks v pre-commit (FR-000-19). Tema in jezik v 000 nista shranjena (shranjevanje je 001). |
| VII. One verification path | `./verify.sh quick` in `full` po [contracts/verify-cli.md](contracts/verify-cli.md); CI požene `full`; preverjanje utišanj (z izklopljenimi testi in `.only`) in prevodov kot koraka `quick`. Vsako novo orodje dobi vnos v `DECISIONS.md` (seznam v research R-15). |

**Rezultat (pred raziskavo):** PASS – brez kršitev.

**Ponovno preverjanje po fazi 1:** PASS. Edino odstopanje od besedila predlog: predloga plana v *Technical Context* navaja »Spring Boot 3.x« – izbran je 4.1, ker je odprtokodna podpora 3.5 potekla (research R-01); konstitucija predpisuje samo »Spring Boot (Java 21)«, zato to ni kršitev. Odstopanj, ki bi zahtevala *Complexity Tracking*, ni.

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/health | javno | – (ni vezano na skupino) | 200 `{"status":"UP"}`; 503 `{"status":"DOWN"}`, ko baza ni dosegljiva | FR-000-02 |
| * (vse metode) | /api/** (vse ostale poti) | — (privzeta zavrnitev) | – | ni uspeha: vedno 401 `{"code":"UNAUTHENTICATED"}` brez veljavnega žetona; v 000 tudi z žetonom (preverjanje žetonov doda 001) | FR-000-10 |

- Vsak odgovor zaledja (tudi 401 in 503) vsebuje glavo `X-Request-Id` (FR-000-20).
- Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Začasna začetna stran | / | javno | FR-000-12, FR-000-13, FR-000-14, FR-000-15 |

- nginx vrne `index.html` za vsako pot, ki ni datoteka in ne začne z `/api/` (SPA); stran *Te strani ni* je 001.
- Naslov dokumenta: »Kontakti« / "Contacts".

### Key elements and accessible names

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Začasna začetna stran | main | – (edini `<main>`; ni cilj testov, ker nima imena) | glavna vsebina | FR-000-12 |
| Začasna začetna stran | heading (level 1) | »Kontakti« / "Contacts" | besedni znak (design.md 13.5); jeziček je `aria-hidden` | FR-000-12, FR-000-14 |
- Pod naslovom je odstavek »Ogrodje aplikacije je pripravljeno.« / "The application scaffold is ready." (brez vloge z imenom, zato ga testi ne iščejo; prevod in preklop jezika testi preverijo prek imena naslova in `<html lang>`).
- i18n ključi: `app.name`, `start.ready` (v `frontend/src/i18n/sl.json` in `en.json`).

### Command-line interfaces

| Command | Purpose | FR-ID |
|---|---|---|
| `docker compose up` | zagon celotnega sistema; frontend na `http://localhost:8080` | FR-000-01, FR-000-04 |
| `./verify.sh quick` / `./verify.sh full` | vrata kakovosti ([contracts/verify-cli.md](contracts/verify-cli.md)) | FR-000-05 … FR-000-09, FR-000-18 |
| `scripts/install-hooks.sh` | namesti pre-commit kavelj (gitleaks) | FR-000-19 |

## Project Structure

### Documentation (this feature)

```text
specs/000-ogrodje/
├── spec.md
├── plan.md              # ta datoteka
├── research.md          # faza 0
├── data-model.md        # faza 1
├── quickstart.md        # faza 1
├── contracts/
│   ├── openapi.yaml     # /api/health, privzeta zavrnitev, oblika napake, X-Request-Id
│   └── verify-cli.md    # verify.sh: argumenti, koraki, izhodne kode, izpis, utišanja
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
compose.yaml                     # db, auth, backend, frontend – brez objavljenih vrat
compose.override.yaml            # razvoj: frontend 127.0.0.1:8080, emulator 127.0.0.1:9099 (samodejno z `docker compose up`)
compose.verify.yaml              # verify full: frontend na naključnih vratih 127.0.0.1
.env.example                     # primer konfiguracije brez skrivnosti
.gitattributes                   # LF za skripte in izvorno kodo
.gitleaks.toml                   # nastavitve gitleaks (izjeme samo z vnosom v DECISIONS.md)
verify.sh                        # vstopna točka vrat kakovosti
scripts/
├── feature.sh                   # obstaja
├── install-hooks.sh             # git config core.hooksPath .githooks
└── verify/
    ├── lib.sh                   # koraki, beleženje v .verify/last.log, časovne omejitve, čiščenje
    ├── summarize.mjs            # zgoščen izpis (ESLint, tsc, javac, Spotless/Prettier, JUnit XML)
    ├── suppressions.mjs         # FR-000-18 (TS AST + Java) in sklici na DECISIONS.md
    ├── i18n-keys.mjs            # FR-000-14 popolnost prevodov
    ├── test/                    # samotestni primeri orodij (node:test + fixtures), korak `orodja`
    └── test-full/               # test kavlja gitleaks (potrebuje gitleaks ali Docker), korak `varnostni BE`
.githooks/pre-commit             # gitleaks git --pre-commit --staged --redact (lokalni binarni ali Docker)
.github/workflows/ci.yml         # ./verify.sh full; ob neuspehu priloga .verify/last.log

firebase/
├── Dockerfile                   # node:22-alpine + firebase-tools (pripeta različica)
└── firebase.json                # samo Auth Emulator, host 0.0.0.0, vrata 9099

backend/
├── mvnw, .mvn/wrapper/, pom.xml # Spring Boot 4.1, Spotless (palantir-java-format), surefire/failsafe, -Werror
├── Dockerfile                   # gradnja z Mavenom → eclipse-temurin:21-jre-alpine
├── src/main/java/si/contactmanager/
│   ├── ContactManagerApplication.java
│   └── shared/
│       ├── web/RequestIdFilter.java        # X-Request-Id, MDC, ena vrstica dostopnega loga
│       ├── security/SecurityConfig.java    # /api/health javno, vse ostalo 401
│       └── error/ErrorResponse.java        # {"code": "..."}
├── src/main/resources/
│   ├── application.yaml
│   └── db/migration/V1__ogrodje.sql
└── src/test/java/si/contactmanager/
    ├── shared/web/RequestIdFilterTest.java         # unit BE
    ├── HealthAndMigrationIT.java                   # integracijski BE (Testcontainers PG)
    ├── FirebaseEmulatorIT.java                     # integracijski BE (emulator izda žeton)
    ├── DefaultDenySecurityIT.java                  # varnostni BE
    └── support/{PostgresContainer, FirebaseEmulatorContainer}.java

frontend/
├── package.json, package-lock.json, vite.config.ts, vitest.config.ts, tsconfig*.json
├── eslint.config.js, .prettierrc.json, components.json (če shadcn/ui)
├── Dockerfile, nginx.conf       # gradnja → nginx:1.30-alpine; /api → backend:8080
├── index.html                   # vrinjen skript za data-theme, <html lang>
├── public/icon.svg              # vir ikon PWA
└── src/
    ├── main.tsx, app/App.tsx, app/StartPage.tsx, app/StartPage.test.tsx
    ├── i18n/{index.ts, sl.json, en.json, language.ts, language.test.ts}
    ├── shared/api/{client.ts, client.test.ts}
    ├── shared/ui/ (shadcn/ui, če se uporabi), shared/lib/cn.ts
    ├── styles/app.css           # žetoni, tema, pisave (design.md 13.2)
    └── test/{setup.ts, msw.ts}

e2e/
├── package.json, playwright.config.ts   # projekti 360/768/1280, Chromium, BASE_URL iz verify.sh
└── tests/ogrodje.spec.ts
```

**Structure Decision**: spletna aplikacija z ločenimi projekti `backend/`, `frontend/` in `e2e/` (konstitucija, workflow.md §4.1). Skupna orodja za preverjanje so v `scripts/verify/` in so napisana v bashu in Node.js (brez dodatnega jezika); Node.js je že obvezen za frontend. Paketi Java so pod `si.contactmanager`, skupna koda v `shared/`, funkcionalnosti 001+ dobijo svoje pakete (`si.contactmanager.<funkcionalnost>`) in mape `frontend/src/features/<funkcionalnost>/`.

## Complexity Tracking

Ni kršitev konstitucije.
