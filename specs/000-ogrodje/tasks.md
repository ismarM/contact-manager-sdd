---

description: "Naloge za funkcionalnost 000 – ogrodje projekta"
---

# Tasks: Ogrodje projekta

**Input**: `specs/000-ogrodje/` – [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: obvezni (konstitucija II). Vsak FR-ID ima vsaj eno testno nalogo v fazi 3. Testi pred implementacijo, nato pregled razvijalcev.

**Organization**: Setup → Foundational → Tests → Test review → implementacija po zgodbah (US1 … US8) → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- **[P]**: lahko teče vzporedno (druge datoteke, brez odvisnosti od nedokončanih nalog)
- **[Story]**: US1 … US8 iz spec.md
- **FR-IDs**: zahteve, ki jih naloga pokriva (`—` za čisto pripravo)

## Path Conventions

- Backend: `backend/src/main/java/si/contactmanager/…`, testi v `backend/src/test/java/si/contactmanager/…` (`*Test` unit, `*IT` integracijski, `*SecurityIT` varnostni)
- Frontend: `frontend/src/…`, testi ob kodi (`*.test.ts` unit, `*.test.tsx` funkcionalni)
- E2E: `e2e/tests/*.spec.ts`
- Orodja za preverjanje: `scripts/verify/…`, samotestni primeri v `scripts/verify/test/` (korak `orodja`) in `scripts/verify/test-full/` (korak `varnostni BE`)

**Pravila za vse naloge:** različice po research R-01 (Spring Boot 4.1.x, TypeScript 6.0.x, ESLint 9.39.x, Vite 8, Tailwind 4.3, Vitest 5, MSW 3, Playwright 1.64); različice npm so v `package.json` pripete točno (brez `^`). Pred US2 (ko `verify.sh` še ne obstaja) se orodja poganjajo neposredno (`./mvnw`, `npm run …`); od US2 naprej se vsaka naloga zaključi z `./verify.sh quick`. Novo orodje ali knjižnica = vnos v `DECISIONS.md` **v isti nalogi, ki ga uvede** (konstitucija VII): vsaka naloga Setup/Foundational, ki doda paket, artefakt ali sliko, doda tudi vnos vrste `odločitev` (paketi z različicami in razlog iz research.md). T056 samo preveri popolnost.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: prazni projekti, ki se prevedejo in v katerih lahko tečejo testi

- [X] T001 — Dopolni `.gitignore` (`node_modules/`, `backend/target/`, `frontend/dist/`, `frontend/dev-dist/`, `e2e/test-results/`, `e2e/playwright-report/`, `.env`, `.verify/` ostane)
- [X] T002 [P] — Ustvari backend projekt: `backend/mvnw`, `backend/mvnw.cmd`, `backend/.mvn/wrapper/maven-wrapper.properties` (Maven 3.9.x), `backend/pom.xml` (parent `spring-boot-starter-parent` 4.1.x; `java.version`/`maven.compiler.release` 21; odvisnosti `spring-boot-starter-webmvc`, `-security`, `-actuator`, `-data-jpa`, `-flyway`, `flyway-database-postgresql`, `postgresql` (modularni starterji Spring Boot 4); testne `spring-boot-starter-webmvc-test`, `-security-test`, `-actuator-test`, `-flyway-test`, `spring-boot-testcontainers`, `org.testcontainers:testcontainers-postgresql` in `testcontainers-junit-jupiter` 2.x (brez `firebase-admin` – žeton emulatorja se pridobi prek REST, Admin SDK doda 001); `maven-compiler-plugin` z `-Xlint:all,-processing` in `<failOnWarning>true</failOnWarning>`; Surefire `**/*Test.java`; Failsafe z izvedbama `integration` (`**/*IT.java` brez `**/*SecurityIT.java`) in `security` (`**/*SecurityIT.java`), obe z `reportsDirectory` po izvedbi; Spotless s `palantir-java-format`) in `backend/src/main/java/si/contactmanager/ContactManagerApplication.java`
- [X] T003 [P] — Ustvari `backend/src/main/resources/application.yaml`: `spring.datasource.url=${DB_URL:jdbc:postgresql://localhost:5432/contacts}`, `username=${DB_USER:contacts}`, `password=${DB_PASSWORD:contacts}`; `spring.jpa.open-in-view=false`; `spring.flyway.enabled=true`; `server.port=8080`
- [X] T004 [P] — Ustvari frontend projekt: `frontend/package.json` (skripti `dev`, `build`, `preview`, `lint`, `typecheck`, `format:check`, `test:unit`, `test:ui`; odvisnosti po plan.md *Primary Dependencies* in R-11/R-12 z različicami iz research R-01, vključno z `eslint@9.39.x`, `typescript@6.0.x`, `vitest-axe`, `msw`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`), `frontend/vite.config.ts` (`@vitejs/plugin-react`, `@tailwindcss/vite`; `server.proxy['/api']` → `http://localhost:8080`), `frontend/tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `noEmit`), `frontend/index.html` (`<html lang="en">`, `<div id="root">`), `frontend/src/main.tsx`, `frontend/src/app/App.tsx` (izriše `StartPage`), `frontend/.prettierrc.json` (`plugins: ["prettier-plugin-tailwindcss"]`, `tailwindStylesheet: "./src/styles/app.css"`), `frontend/.prettierignore`; izvedi `npm install`, da nastane `package-lock.json`
- [X] T005 [P] — Ustvari E2E projekt: `e2e/package.json` (`@playwright/test` 1.64.x, `@axe-core/playwright` 4.x, `typescript` 6.0.x, `prettier`, `eslint` 9.39.x, `typescript-eslint`), `e2e/tsconfig.json` (strict), `e2e/playwright.config.ts` (samo Chromium; projekti `w360` {width 360, height 780}, `w768` {768, 1024}, `w1280` {1280, 800}; `use.baseURL = process.env.BASE_URL ?? 'http://localhost:8080'`; reporterja `line` in `junit` → `e2e/test-results/junit.xml`; `serviceWorkers: 'allow'`), `e2e/eslint.config.js` (typescript-eslint recommended, `reportUnusedDisableDirectives: error`), `e2e/.prettierrc.json`; `npm install`
- [X] T006 [P] — Ustvari `firebase/Dockerfile` (`node:22-alpine`, `npm i -g firebase-tools@15.34.x` pripeto, `EXPOSE 9099`, `CMD firebase emulators:start --only auth --project demo-contact-manager`) in `firebase/firebase.json` (`emulators.auth { host: "0.0.0.0", port: 9099 }`, `emulators.ui.enabled: false`)
- [X] T007 — Ustvari osnovni `frontend/eslint.config.js` (flat): `typescript-eslint` `recommendedTypeChecked` z izključenima praviloma `@typescript-eslint/no-explicit-any` in `@typescript-eslint/ban-ts-comment` (`off` – vklopi ju T058), `eslint-plugin-react-hooks` `recommended`, `linterOptions.reportUnusedDisableDirectives: "error"`, `ignores` za `dist/`, `dev-dist/`, `test-results/`; skript `lint` = `eslint . --max-warnings 0`. Pravila projekta (jsx-a11y, Tailwind, `style`) doda T050, da test T023 pred implementacijo pade

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: testna infrastruktura in minimalne prazne komponente, da se testi prevedejo in padejo zaradi manjkajočega vedenja

- [X] T008 — Ustvari minimalen `frontend/src/styles/app.css` (samo `@import "tailwindcss";`) in ga uvozi v `frontend/src/main.tsx`; izklop privzete palete in žetone doda T050 (sicer bi test T023 uspel pred implementacijo)
- [X] T009 [P] FR-000-04, FR-000-10 — Ustvari testni pripomoček `backend/src/test/java/si/contactmanager/support/PostgresContainer.java` (en vsebnik `postgres:18-alpine` za vse teste, `@DynamicPropertySource` za `spring.datasource.*`, čakanje 120 s) in `backend/src/test/java/si/contactmanager/support/FirebaseEmulatorContainer.java` (`ImageFromDockerfile` iz `../firebase`, izpostavi 9099, `Wait.forHttp("/").forPort(9099)`, 120 s; metoda `signUp(email, password)` → ID žeton prek `POST /identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`)
- [X] T010 [P] FR-000-20 — Ustvari prazen `backend/src/main/java/si/contactmanager/shared/web/RequestIdFilter.java` (`OncePerRequestFilter`, ki samo pokliče `chain.doFilter`), da se unit test prevede
- [X] T011 [P] FR-000-10, FR-000-12 — Ustvari FE testno infrastrukturo: `frontend/vitest.config.ts` (okolje `jsdom`, `test.projects`: `unit` = `src/**/*.test.ts`, `ui` = `src/**/*.test.tsx`; `setupFiles: ["src/test/setup.ts"]`; reporterja `default` in `junit` → `frontend/test-results/<projekt>.xml`), `frontend/src/test/msw.ts` (`setupServer()` brez privzetih rokovalnikov), `frontend/src/test/setup.ts` (`@testing-library/jest-dom/vitest`, MSW `listen({ onUnhandledFrame: 'error' })` (MSW 3)/`resetHandlers`/`close`, `cleanup`)
- [X] T012 [P] FR-000-10, FR-000-12, FR-000-14 — Ustvari prazne FE module s končnimi imeni in podpisi: `frontend/src/app/StartPage.tsx` (vrne `<main />`), `frontend/src/i18n/index.ts` (`i18n.init({ resources: {}, lng: 'en' })`, izvozi `i18n`), `frontend/src/i18n/language.ts` (`export function detectLanguage(browserLanguage: string): 'sl' | 'en'` vrne `'en'`), `frontend/src/i18n/sl.json` in `en.json` (`{}`), `frontend/src/shared/api/client.ts` (`export class ApiError extends Error { status: number; code: string }`, `export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>`, ki vrže `new Error('not implemented')`)
- [X] T013 [P] FR-000-08, FR-000-14, FR-000-18 — Ustvari prazne module orodij s končnimi izvozi: `scripts/verify/summarize.mjs` (`export function summarize(stepResults) { return [] }`), `scripts/verify/suppressions.mjs` (`export function findSuppressions(files, decisionsMd) { return [] }` + CLI, ki vrne 0), `scripts/verify/i18n-keys.mjs` (`export function compareKeys(sl, en) { return [] }` + CLI, ki vrne 0), `scripts/verify/lib.sh` (prazna funkcija `run_plan`), `verify.sh` (`#!/usr/bin/env bash`, izvršljiv, vrne 0)

**Checkpoint**: `./mvnw -f backend test-compile`, `npm --prefix frontend run typecheck` in `npm --prefix e2e exec tsc -- --noEmit` uspejo

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Backend

- [X] T014 [P] [US1] FR-000-20 Unit test `backend/src/test/java/si/contactmanager/shared/web/RequestIdFilterTest.java` (`@Tag("FR-000-20")`): brez glave → nov UUID v glavi odgovora `X-Request-Id` in v MDC `requestId` med `chain.doFilter`; veljavna vhodna glava (`^[A-Za-z0-9-]{1,64}$`) se ohrani; neveljavna (`abc def`, 65 znakov, `<script>`) se zamenja z novim UUID; MDC je po zahtevku počiščen
- [X] T015 [P] [US1] FR-000-02, FR-000-03 Integracijski test `backend/src/test/java/si/contactmanager/HealthAndMigrationIT.java` (`@Tag("FR-000-02")`, `@Tag("FR-000-03")`, `@SpringBootTest(webEnvironment = RANDOM_PORT)`, `PostgresContainer`): `GET /api/health` → `200`, telo natanko `{"status":"UP"}` (brez `components`, `details`, različic); `flyway_schema_history` ima vrstico `version = '1'`, `success = true`; drugi zagon konteksta nad isto bazo ne doda nove vrstice
- [X] T016 [P] [US1] FR-000-02 Integracijski test `backend/src/test/java/si/contactmanager/DatabaseDownIT.java` (`@Tag("FR-000-02")`, lasten vsebnik PG, ki ga test ustavi): po ustavitvi baze `GET /api/health` → `503`, telo `{"status":"DOWN"}` brez podrobnosti
- [X] T017 [P] [US1] FR-000-03 Integracijski test `backend/src/test/java/si/contactmanager/BrokenMigrationIT.java` (`@Tag("FR-000-03")`) in `backend/src/test/resources/db/broken/V1__broken.sql` (neveljaven SQL): zagon `SpringApplication` s `spring.flyway.locations=classpath:db/broken` vrže izjemo (kontekst se ne zažene), shema ne vsebuje delnih sprememb
- [X] T018 [P] [US1] FR-000-04, FR-000-10 Integracijski test `backend/src/test/java/si/contactmanager/FirebaseEmulatorIT.java` (`@Tag("FR-000-04")`, `@Tag("FR-000-10")`, `FirebaseEmulatorContainer`): `signUp` vrne ID žeton, katerega `aud` je `demo-contact-manager`; `GET /api/anything` z `Authorization: Bearer <žeton>` → `401` `{"code":"UNAUTHENTICATED"}` (v 000 brez preverjanja žetonov)
- [X] T019 [P] [US3] FR-000-10, FR-000-20 Varnostni test `backend/src/test/java/si/contactmanager/DefaultDenySecurityIT.java` (`@Tag("FR-000-10")`, `@Tag("FR-000-20")`, `@ParameterizedTest` čez metode GET/POST/PUT/PATCH/DELETE × poti `/api/anything`, `/api/groups/1`, `/api/groups/1/contacts`): brez žetona in z neveljavnim žetonom → `401`, telo `{"code":"UNAUTHENTICATED"}`, glava `X-Request-Id`; `GET /api/health` brez žetona → `200`; z `OutputCaptureExtension`: zahtevek z `Authorization: Bearer secret-token-<uuid>` in `?email=ime@primer.si` → v izpisu ni niza žetona, ni `ime@primer.si`, vsaka vrstica s potjo zahtevka vsebuje vrednost `X-Request-Id` iz odgovora

### Frontend

- [X] T020 [P] [US3] FR-000-10 Unit test `frontend/src/shared/api/client.test.ts` (ime testov `FR-000-10: …`, MSW): `apiFetch('/health')` kliče `/api/health` in vrne JSON; odgovor `401 {"code":"UNAUTHENTICATED"}` → `ApiError` s `status 401`, `code 'UNAUTHENTICATED'`; odgovor brez JSON telesa → `ApiError` s kodo `UNKNOWN`
- [X] T021 [P] [US5] FR-000-14 Unit test `frontend/src/i18n/language.test.ts` (`FR-000-14: …`): `detectLanguage('sl-SI')` → `'sl'`, `'sl'` → `'sl'`, `'SL'` → `'sl'`, `'de'` → `'en'`, `'en-US'` → `'en'`, `''` → `'en'`
- [X] T022 [P] [US5] FR-000-12, FR-000-14 Funkcionalni test `frontend/src/app/StartPage.test.tsx` (`FR-000-12: …`, `FR-000-14: …`): ob jeziku `sl` je `getByRole('heading', { level: 1, name: 'Kontakti' })` in `document.documentElement.lang === 'sl'`; po `i18n.changeLanguage('en')` (brez ponovnega izrisa strani) `getByRole('heading', { level: 1, name: 'Contacts' })` in `lang === 'en'` ter `document.title === 'Contacts'`; `(await axe(container)).violations` je prazen (`axe` iz `vitest-axe`); MSW z `onUnhandledRequest: 'error'` – stran ne pošlje nobenega zahtevka
- [X] T023 [P] [US7] FR-000-05, FR-000-12, FR-000-18 Unit test `frontend/src/test/eslint-rules.test.ts` (`FR-000-12: …`, `FR-000-05: …`, `FR-000-18: …`; uporabi razred `ESLint` z `frontend/eslint.config.js` in `lintText` z navideznim imenom `src/x.tsx`): `className="bg-zinc-500"` → `better-tailwindcss/no-unknown-classes`; `bg-[#ff0000]` in `text-[rgb(0,0,0)]` → `no-restricted-classes`; `dark:bg-card` → `no-restricted-classes`; `style={{ color: 'red' }}` → `no-restricted-syntax`; `<img src="a.png" />` → `jsx-a11y/alt-text`; `// @ts-nocheck` → `@typescript-eslint/ban-ts-comment`; `let a: any` → `@typescript-eslint/no-explicit-any`; `forced-colors:outline-[Highlight]` in `bg-card` → brez napak

### E2E

- [X] T024 [P] [US5] FR-000-01, FR-000-12, FR-000-13, FR-000-14, FR-000-15 E2E `e2e/tests/ogrodje.spec.ts` (vsak test teče v vseh treh projektih; `test.describe` za `colorScheme: 'light'` in `'dark'`):
  - `FR-000-01: zahtevek z začetne strani doseže backend` – `page.request.get('/api/health')` → `200`, `{"status":"UP"}`
  - `FR-000-12: začetna stran brez kršitev axe` – `AxeBuilder().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` brez kršitev; naslov `getByRole('heading', { level: 1 })` viden
  - `FR-000-12: vsi viri z istega izvora` – vsi `page.on('request')` URL-ji imajo izvor `baseURL`; vsaj ena `.woff2` je naložena
  - `FR-000-12: brez vodoravnega drsenja pri 320 px` – `setViewportSize({ width: 320, height: 640 })`, `scrollWidth <= clientWidth`
  - `FR-000-13: shema sledi sistemu in data-theme jo preglasi` – izračunan `background-color` elementa `body` je `rgb(246, 245, 241)` (svetla) oziroma `rgb(22, 21, 19)` (temna); po `localStorage.setItem('theme','light')` in osvežitvi ima `<html>` `data-theme="light"` in svetlo ozadje tudi ob temni shemi
  - `FR-000-14: jezik po brskalniku` – kontekst `locale: 'sl-SI'` → naslov »Kontakti«, `<html lang="sl">`; `locale: 'de-DE'` → "Contacts", `lang="en"`
  - `FR-000-15: aplikacija je namestljiva` – `page.request.get('/manifest.webmanifest')` vrne manifest z `name` »Kontakti«, `display: standalone`, `background_color: #F6F5F1`, `theme_color: #1F4E8C`, ikonami 192, 512 in `purpose: maskable`; `navigator.serviceWorker.ready` se razreši
  - `FR-000-15: brez povezave se naloži ogrodje, API ne` – po `serviceWorker.ready` in osvežitvi `context.setOffline(true)`, osvežitev → naslov viden; `fetch('/api/health')` v strani zavrne obljubo

### Orodja za preverjanje (node:test)

- [X] T025 [P] [US7] FR-000-18 Samotestni primeri `scripts/verify/test/suppressions.test.mjs` s fixtures v `scripts/verify/test/fixtures/suppressions/` (`DECISIONS.md` z `D-01` vrste `odločitev` in `D-02` vrste `utišanje`): vsaka oznaka iz data-model.md *Sklic na utišanje v kodi* brez sklica → zadetek `datoteka:vrstica` in vrsta; s sklicem `DECISIONS D-02` v isti ali predhodni vrstici → brez zadetka; sklic `D-01` (druga vrsta) in `D-99` (ne obstaja) → `neveljaven sklic`; `it.only` s sklicem `D-02` → zadetek; `const company = 'any'`, `// any`, `type Company = string` → brez zadetka; `@Disabled` in `@SuppressWarnings("unchecked")` v Javi brez sklica → zadetek, v komentarju `// @Disabled` → brez zadetka
- [X] T026 [P] [US5] FR-000-14 Samotestni primeri `scripts/verify/test/i18n-keys.test.mjs`: enaki gnezdeni ključi → brez napak; `a.b` samo v `sl` → `a.b  manjka v: en`; ključ samo v `en` → `manjka v: sl`; izhodna koda CLI ≠ 0 ob manjkajočem ključu
- [X] T027 [P] [US2] FR-000-08 Samotestni primeri `scripts/verify/test/summarize.test.mjs` s fixtures izpisov v `scripts/verify/test/fixtures/summarize/` (ESLint `unix`, `tsc --pretty false`, Maven `[ERROR]`/`[WARNING] …java:[l,c]`, Spotless, Prettier `[warn]`, JUnit XML Surefire/Vitest/Playwright z imenom projekta): vrstice v obliki `korak  datoteka:vrstica  pravilo  sporočilo` oziroma `korak  ime testa  razlog`; `summarize(rezultati, { root, limit: 19 })` (prvo vrstico izpiše `lib.sh`); 30 napak → 18 vrstic napak + `… in še 12 (celoten izpis: .verify/last.log)`; Maven `[WARNING]` se šteje kot napaka; neprepoznan izpis → zadnje vrstice izpisa koraka
- [X] T028 [P] [US2] FR-000-05, FR-000-06, FR-000-07, FR-000-08, FR-000-09 Samotestni primeri `scripts/verify/test/verify-cli.test.mjs`: `verify.sh` brez argumenta, z `foo` in z dvema argumentoma → koda `2`, izpis vsebuje `Uporaba: ./verify.sh quick|full`; zagon iz `frontend/` z `../verify.sh foo` → enako; s `PATH` brez `java` → koda `3` in `java`; `full` s `PATH` brez `docker` → koda `3` in `potrebuje Docker`; pravilo ustavljanja prek `scripts/verify/test/fixtures/fake-plan.sh` (sourca `lib.sh`, definira statične korake `s1` ok, `s2` pade, `s3` pade in testne `t1`, `t2`): izpis navede `s2` in `s3`, `t1` se ne izvede; drug načrt (statični ok, `t1` pade) → `t2` se ne izvede; uspeh → natanko ena vrstica `✓ <raven> OK (<n> s)`; `.verify/last.log` po dveh zagonih vsebuje samo drugega; `git check-ignore .verify/last.log` uspe; seznam korakov, ki ga `verify.sh` izpiše z `VERIFY_LIST_STEPS=1`, je za `quick` natanko koraki 1–9 in za `full` 1–13 iz contracts/verify-cli.md
- [X] T029 [P] [US1] FR-000-01, FR-000-04, FR-000-06 Samotestni primeri `scripts/verify/test/repo-config.test.mjs` (statično branje datotek): `compose.yaml` ima storitve `db`, `auth`, `backend`, `frontend` in nobene `ports`; `compose.override.yaml` objavlja samo `127.0.0.1:8080:80` in `127.0.0.1:9099:9099`; `compose.verify.yaml` objavlja frontend na `127.0.0.1::80`; `.env.example` obstaja in vrednosti vsebujejo samo razvojne privzetke iz `compose.yaml`; `.gitattributes` določa `eol=lf` za `*.sh`
- [X] T030 [P] [US4] FR-000-11 Samotestni primeri `scripts/verify/test/ci-workflow.test.mjs` (statično branje `.github/workflows/ci.yml`): sprožilca `push` in `pull_request`; korak `./verify.sh full`; korak `actions/upload-artifact` z `if: failure()` in potjo `.verify/last.log`; posel z imenom `verify`
- [X] T031 [P] [US6] FR-000-16 Samotestni primeri `scripts/verify/test/decisions.test.mjs`: `DECISIONS.md` vsebuje vnos vrste `odločitev`, ki za vsak vzorec iz tabele `design.md` 13.4 (*Alert Dialog/Dialog*, *Dropdown Menu*, *Command/Combobox*, *Sonner*, *Checkbox/Radio Group*, *Button/Input/Textarea/Label/Table/Separator*, *Select*, *Card/Sidebar/Tooltip/Carousel/Chart*) navede natanko eno izbiro `nativni` ali `shadcn`; vsak paket iz `dependencies`/`devDependencies` v `frontend/package.json` in `e2e/package.json` ter vsak `artifactId` odvisnosti v `backend/pom.xml` je omenjen v vsaj enem vnosu vrste `odločitev`; vrstice tabele imajo veljavno vrsto (data-model.md)
- [X] T032 [P] [US8] FR-000-19 Test kavlja `scripts/verify/test-full/pre-commit.test.mjs`: v začasnem repozitoriju git kopira `.githooks/` in `.gitleaks.toml`, požene `scripts/install-hooks.sh`, doda staged datoteko z lažnim zasebnim ključem PEM → `git commit` vrne ≠ 0, izpis vsebuje ime datoteke, vrstico in pravilo, ne vsebuje vrednosti ključa; datoteka brez skrivnosti → commit uspe; `git config core.hooksPath` je `.githooks`
- [X] T033 — Poženi vse teste faze 3 (`./mvnw -f backend verify`, `npm --prefix frontend run test:unit`, `npm --prefix frontend run test:ui`, `node --test 'scripts/verify/test/*.test.mjs' 'scripts/verify/test-full/*.test.mjs'`, E2E proti `npm --prefix frontend run build && npm --prefix frontend run preview -- --port 4173` z `BASE_URL=http://localhost:4173`) in v poročilu za razvijalca za vsak test navedi razlog padca; vsi morajo pasti zaradi manjkajočega vedenja (ne zaradi prevajanja ali napake v testu)

---

## Phase 4: Test review (human gate)

- [X] T034 — Pregled testov – razvijalca: vsak FR-000-01 … FR-000-20 ima test (T014–T032) ali ročni preizkus (FR-000-11 zaščita veje, FR-000-17); negativni scenariji iz spec.md so pokriti; selektorji samo `getByRole`/`getByLabel` z imeni iz plan.md; asercije smiselne. Nato commit `test(000): …` in `specs/000-ogrodje/traceability.md`.

**Checkpoint**: nobena implementacijska naloga se ne začne pred T034. Od tu naprej se testi spreminjajo samo zaradi specifikacije (vnos v `DECISIONS.md`).

---

## Phase 5: User Story 1 – Zagon celotnega sistema z enim ukazom (Priority: P1) 🎯 MVP

**Goal**: `docker compose up` zažene PostgreSQL, emulator, backend in frontend; zdravje, migracije, ID zahtevka in logi.

**Independent Test**: T014, T015, T016, T017, T018, T029 zeleni; quickstart.md razdelek 2 deluje.

- [X] T035 [P] [US1] FR-000-03 Ustvari `backend/src/main/resources/db/migration/V1__ogrodje.sql` (»brez tabel, samo `COMMENT ON SCHEMA public IS 'Contact Manager'`«, data-model.md) in v `application.yaml` dodaj `spring.flyway.fail-on-missing-locations: true`
- [X] T036 [P] [US1] FR-000-02 V `backend/src/main/resources/application.yaml` nastavi Actuator: `management.endpoints.web.base-path: /api`, `management.endpoints.web.exposure.include: health`, `management.endpoint.health.show-details: never`, `show-components: never`, `probes.enabled: false` (D-11), `management.info.env.enabled: false` (research R-03)
- [X] T037 [US1] FR-000-20 Implementiraj `backend/src/main/java/si/contactmanager/shared/web/RequestIdFilter.java` (`@Order(Ordered.HIGHEST_PRECEDENCE)`, vzorec `^[A-Za-z0-9-]{1,64}$`, sicer `UUID.randomUUID()`; MDC `requestId`; glava odgovora `X-Request-Id`; po zahtevku ena vrstica `INFO` `{metoda} {pot brez poizvedbe} {status} {ms}ms`; `finally` počisti MDC) in v `application.yaml` `logging.pattern.console` z `[%X{requestId:-}]` (research R-07)
- [X] T038 [P] [US1] FR-000-01 Ustvari `backend/Dockerfile` (stopnja gradnje `eclipse-temurin:21-jdk-alpine` z `./mvnw -q -DskipTests package`; izvajanje `eclipse-temurin:21-jre-alpine`, nekorenski uporabnik, `EXPOSE 8080`, `HEALTHCHECK` z `wget -qO- http://localhost:8080/api/health`) in `backend/.dockerignore` (`target/`)
- [X] T039 [P] [US1] FR-000-01, FR-000-20 Ustvari `frontend/Dockerfile` (stopnja `node:22-alpine` z `npm ci && npm run build`; `nginx:1.30-alpine`) in `frontend/nginx.conf`: `location /api/ { proxy_pass http://backend:8080; proxy_set_header X-Request-Id $request_id; }`, SPA `try_files $uri /index.html`, `Cache-Control: no-cache` za `/index.html`, `/sw.js`, `/manifest.webmanifest`, `public, max-age=31536000, immutable` za `/assets/`, `log_format` z `$request_id` in `$uri` (brez `$args`); `frontend/.dockerignore`
- [X] T040 [US1] FR-000-01, FR-000-04, FR-000-06 Ustvari `compose.yaml` (storitve `db` `postgres:18-alpine` z `POSTGRES_DB/USER/PASSWORD: ${…:-contacts}`, volumen `db-data`, healthcheck `pg_isready`; `auth` iz `./firebase` s healthcheckom HTTP 9099; `backend` iz `./backend` z `DB_URL=jdbc:postgresql://db:5432/contacts`, `FIREBASE_AUTH_EMULATOR_HOST=auth:9099`, `FIREBASE_PROJECT_ID=demo-contact-manager`, `depends_on` db in auth `condition: service_healthy`; `frontend` iz `./frontend`, `depends_on` backend `service_healthy`; **brez `ports`**), `compose.override.yaml` (`frontend` `127.0.0.1:8080:80`, `auth` `127.0.0.1:9099:9099`) in `compose.verify.yaml` (`frontend` `127.0.0.1::80`) (research R-08)
- [X] T041 [P] [US1] FR-000-04 Ustvari `.gitattributes` (`* text=auto eol=lf`; `*.sh`, `mvnw`, `.githooks/*` `eol=lf`; `*.cmd` `eol=crlf`; `*.png`, `*.woff2`, `*.jar` `binary`) in `.env.example` z vsemi spremenljivkami iz `compose.yaml` in njihovimi razvojnimi privzetki ter komentarjem, da `.env` ni obvezen in da v repozitorij ne gredo pravi ključi

**Checkpoint**: `docker compose up --build` na čisti kopiji → quickstart.md razdelek 2 deluje; testi US1 zeleni

---

## Phase 6: User Story 2 – En ukaz za preverjanje z zgoščenim izpisom (Priority: P1)

**Goal**: `./verify.sh quick|full` po contracts/verify-cli.md.

**Independent Test**: T027, T028 zelena; `./verify.sh quick` izpiše eno vrstico, ob namerni napaki ≤ 20 vrstic.

- [X] T042 [P] [US2] FR-000-08 Implementiraj `scripts/verify/summarize.mjs` (razčlenjevalniki po vrsti koraka iz research R-09; omejitev 20 vrstic skupaj z zadnjo vrstico `… in še N (celoten izpis: .verify/last.log)`; CLI bere rezultate korakov iz `.verify/steps/*.log` in izpiše povzetek)
- [X] T043 [US2] FR-000-07, FR-000-08, FR-000-09 Implementiraj `scripts/verify/lib.sh`: `step <ime> <static|test> <vrsta za summarize> <cwd|-> <glob poročil JUnit|-> <ukaz…>` doda korak v načrt; mapa `.verify/` je v `$VERIFY_ROOT` (verify.sh ga nastavi na koren); `run_plan <raven>` izvede vse statične korake, nato testne do prvega padca; vsak korak piše v `.verify/steps/<n>-<ime>.log` in z glavo `=== <ime> (<ukaz>) ===` v `.verify/last.log` (izpraznjen ob začetku); merjenje trajanja; ob uspehu `✓ <raven> OK (<s> s)`, ob neuspehu `✗ <raven> PADLO (<s> s) – koraki: …` in izpis `summarize.mjs`; izhodna koda 0/1
- [X] T044 [US2] FR-000-05, FR-000-06, FR-000-07 Implementiraj `verify.sh`: koren iz `readlink -f "$0"`; argument `quick|full` (sicer `Uporaba: ./verify.sh quick|full`, koda 2); preverjanje orodij (Java ≥ 21, Node ≥ 22.12, npm; za `full` `docker info` → `✗ full – potrebuje Docker (docker info ni uspel)`; koda 3); `npm ci` v `frontend/` in `e2e/`, ko manjka `node_modules` ali se `package-lock.json` razlikuje od `.verify/<projekt>.lock.sha`; koraki 1–9 iz contracts/verify-cli.md z ukazi (`./mvnw -q -f backend spotless:check`, `npm --prefix frontend run format:check`, `npm --prefix e2e exec prettier -- --check .`, `npm --prefix frontend run lint -- --format unix`, `npm --prefix e2e exec eslint -- . --max-warnings 0 --format unix`, `npm --prefix frontend run typecheck`, `npm --prefix e2e exec tsc -- --noEmit`, `./mvnw -q -f backend test-compile`, `node scripts/verify/suppressions.mjs`, `node scripts/verify/i18n-keys.mjs`, `node --test 'scripts/verify/test/*.test.mjs'`, `./mvnw -f backend surefire:test`, `npm --prefix frontend run test:unit`, `npm --prefix frontend run test:ui`); `VERIFY_LIST_STEPS=1` izpiše imena korakov ravni in konča
- [X] T045 [US2] FR-000-06 V `verify.sh` dodaj korake 10–13 za `full`: `./mvnw -f backend failsafe:integration-test@integration failsafe:verify@integration`; `./mvnw -f backend failsafe:integration-test@security failsafe:verify@security` in `node --test 'scripts/verify/test-full/*.test.mjs'`; `sistem` = `docker compose -p contact-manager-verify -f compose.yaml -f compose.verify.yaml up --build --wait --wait-timeout 300` (ob preseku izpiše storitev, ki ni zdrava), nato `BASE_URL=http://$(docker compose … port frontend 80)`; `E2E` = `npm --prefix e2e exec playwright test`; `trap` na `EXIT INT TERM` izvede `docker compose -p contact-manager-verify … down -v --remove-orphans`

**Checkpoint**: `./verify.sh quick` zelen ob zeleni kodi; quickstart.md razdelek 3

---

## Phase 7: User Story 3 – Delujoča veriga na vsaki ravni testov (Priority: P1)

**Goal**: privzeta zavrnitev `/api/**` in FE odjemalec API; vse ravni testov tečejo prek `verify.sh`.

**Independent Test**: T019, T020 zelena; `./verify.sh full` izvede in poroča vse ravni.

- [X] T046 [P] [US3] FR-000-10 Ustvari `backend/src/main/java/si/contactmanager/shared/error/ErrorResponse.java` (`record ErrorResponse(String code)`) in `backend/src/main/java/si/contactmanager/shared/security/SecurityConfig.java` (brezstanjska seja, CSRF izklopljen, `httpBasic`/`formLogin` izklopljena; `GET /api/health` `permitAll`; vse ostalo `authenticated()`; `authenticationEntryPoint` in `accessDeniedHandler` vrneta `401` z JSON `{"code":"UNAUTHENTICATED"}` in `Content-Type: application/json`) po contracts/openapi.yaml
- [X] T047 [P] [US3] FR-000-10 Implementiraj `frontend/src/shared/api/client.ts`: `apiFetch` doda predpono `/api`, `Accept: application/json`; ob 2xx vrne razčlenjen JSON; sicer vrže `ApiError(status, code)`, kjer je `code` iz telesa `{"code"}` ali `UNKNOWN`

**Checkpoint**: `./verify.sh full` zelen za ravni BE in FE

---

## Phase 8: User Story 4 – CI kot vrata za združitev (Priority: P2)

**Goal**: GitHub Actions požene `./verify.sh full`; združitev v `main` samo ob zelenem statusu.

**Independent Test**: T030 zelen; quickstart.md razdelek 5.

- [X] T048 [US4] FR-000-11 Ustvari `.github/workflows/ci.yml`: `on: [push, pull_request]`, posel `verify` na `ubuntu-latest`, `actions/checkout`, `actions/setup-java` (`temurin`, `21`, `cache: maven`), `actions/setup-node` (`22`, `cache: npm`, `cache-dependency-path` za `frontend/` in `e2e/`), `npm --prefix e2e exec playwright install -- --with-deps chromium`, `./verify.sh full`, `actions/upload-artifact` z `if: failure()`, imenom `verify-log` in potjo `.verify/last.log`
- [X] T049 [US4] FR-000-11 Ročno (razvijalca): push veje in odprt pull request z namerno padajočim testom → rdeč status in priloga `verify-log`; po popravku zelen; v GitHubu *Branch protection* za `main` z obveznim statusom `verify`; izid zapiši v `specs/000-ogrodje/traceability.md`

---

## Phase 9: User Story 5 – Ogrodje vmesnika s Kartoteko, dvojezičnostjo in PWA (Priority: P2)

**Goal**: začetna stran z žetoni, pisavama, shemama, i18n in PWA.

**Independent Test**: T021, T022, T023, T024, T026 zeleni.

- [X] T050 [US5] FR-000-05, FR-000-12, FR-000-13 V `frontend/eslint.config.js` dodaj `eslint-plugin-jsx-a11y` `flatConfigs.recommended`, `eslint-plugin-better-tailwindcss` z `settings.entryPoint: "src/styles/app.css"` in pravili `no-unknown-classes: error`, `no-restricted-classes: error` (vzorci: `^(.*:)?[a-z-]+-\[(#|rgb|rgba|hsl|hsla|oklch|oklab|color)\b.*\]$` – arbitrarne barve; `^dark:` – različica `dark:`) ter `no-restricted-syntax: error` za `JSXAttribute[name.name='style']`; nato dopolni `frontend/src/styles/app.css` točno po `design.md` 13.2: vsi žetoni `--k-*` iz 4.1 in barve skupin iz 4.2 z `light-dark()`, `:root { color-scheme: light dark }`, `:root[data-theme="light"|"dark"]`, aliasi shadcn, `@custom-variant dark`, `@theme` (`--color-*: initial`, `--color-black`, `--color-white`, `--shadow-*: initial`, `--shadow-float`, `--font-sans`, `--font-mono`, `--text-xs`), `@theme inline` (vse barve iz tabele 13.2, zaobljenosti ≤ 6 px); razmiki `--k-space-1…7` in pisave `--k-font-sm…xxl` iz 5–6; uvoz `@fontsource-variable/atkinson-hyperlegible-next` (latin, latin-ext) in `@fontsource/atkinson-hyperlegible-mono` (400; latin, latin-ext); `body` z `bg-background text-foreground font-sans`; `@media (prefers-reduced-motion: reduce)` brez prehodov
- [X] T051 [P] [US5] FR-000-13 V `frontend/index.html` dodaj v `<head>` pred slogi vrinjen skript: prebere `localStorage.getItem('theme')` v `try/catch`, ob `light`/`dark` nastavi `document.documentElement.dataset.theme`; brez JS stran sledi sistemu (design.md 4.3)
- [X] T052 [P] [US5] FR-000-14 Implementiraj `frontend/src/i18n/language.ts` (`detectLanguage`: začne z `sl` ne glede na velikost črk → `'sl'`, sicer `'en'`), `frontend/src/i18n/sl.json` (`{"app":{"name":"Kontakti"},"start":{"ready":"Ogrodje aplikacije je pripravljeno."}}`), `frontend/src/i18n/en.json` (`{"app":{"name":"Contacts"},"start":{"ready":"The application scaffold is ready."}}`), `frontend/src/i18n/index.ts` (statični viri, `lng: detectLanguage(navigator.language)`, `fallbackLng: 'en'`, `supportedLngs: ['sl','en']`; ob `languageChanged` nastavi `document.documentElement.lang` in `document.title = t('app.name')`) in `frontend/src/i18n/i18next.d.ts` (`CustomTypeOptions.resources` iz `sl.json`)
- [X] T053 [P] [US5] FR-000-14 Implementiraj `scripts/verify/i18n-keys.mjs` (sploščitev ključev, izpis `<ključ>  manjka v: <jezik>`, CLI bere `sl.json` in `en.json` iz `--dir` (privzeto `frontend/src/i18n`), koda 1 ob razliki)
- [X] T054 [US5] FR-000-12 Implementiraj `frontend/src/app/StartPage.tsx`: `<main>` z `<h1>` (besedni znak po design.md 13.5: `t('app.name')` v `font-bold`, jeziček `aria-hidden="true"` v `bg-primary`) in odstavkom `t('start.ready')`; samo pripomočki iz žetonov; postavitev brez vodoravnega drsenja od 320 px, `max-w-[70ch]` za besedilo (depends on T050, T052)
- [X] T055 [US5] FR-000-15 Dodaj PWA: `frontend/public/icon.svg` (kvadrat `#1F4E8C`, bela stilizirana kartica z jezičkom, brez prelivov in senc), `frontend/pwa-assets.config.ts` (`@vite-pwa/assets-generator`, prednastavitev `minimal2023Preset`) in skript `generate-pwa-assets`; v `frontend/vite.config.ts` `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Kontakti', short_name: 'Kontakti', display: 'standalone', background_color: '#F6F5F1', theme_color: '#1F4E8C', icons: [192, 512, maskable] }, workbox: { globPatterns: ['**/*.{html,js,css,woff2,png,svg,webmanifest}'], navigateFallbackDenylist: [/^\/api\//] } })` brez `runtimeCaching`; registracija v `frontend/src/main.tsx` (`virtual:pwa-register`)

**Checkpoint**: testi US5 zeleni pri 360, 768 in 1280 px v obeh shemah

---

## Phase 10: User Story 6 – Odločitve in ročni samopreizkus (Priority: P2)

**Goal**: `DECISIONS.md` popiše vsa orodja in shadcn/ui; samopreizkus dokaže, da vrata ustavijo napake.

**Independent Test**: T031 zelen; vnos samopreizkusa navaja 10 primerov z izidom.

- [X] T056 [US6] FR-000-16 Preveri in dopolni vnose vrste `odločitev` v `DECISIONS.md` po research R-15 (vnose dodajajo naloge, ki orodja uvedejo; tu dopolni manjkajoče, vključno z izbiro TypeScript 6.0 in ESLint 9 zaradi združljivosti, R-01)
- [X] T057 [US6] FR-000-16 Razvijalca potrdita ali spremenita predlog research R-14 in dodata vnos `odločitev` z izbiro `nativni` ali `shadcn` za vsak vzorec iz `design.md` 13.4; če je kateri vzorec `shadcn`: v `frontend/` izvedi `npx shadcn@4 init` (slog `new-york`, osnovna barva `stone`, `cssVariables: true`), v `frontend/components.json` nastavi alias `ui` → `src/shared/ui`, ustvari `frontend/src/shared/lib/cn.ts` (`clsx` + `tailwind-merge`), izbriši blok `.dark` in privzete vrednosti, ki jih doda init, iz `frontend/src/styles/app.css` (aliasi ostanejo po T050)

---

## Phase 11: User Story 7 – Prepoved utišanja opozoril brez odobritve (Priority: P3)

**Goal**: korak `utišanja` po contracts/verify-cli.md.

**Independent Test**: T025 zelen; `// eslint-disable-next-line` brez sklica → `quick` pade.

- [X] T058 [US7] FR-000-18 V `frontend/eslint.config.js` in `e2e/eslint.config.js` nastavi `@typescript-eslint/no-explicit-any: error` in `@typescript-eslint/ban-ts-comment: error` (vključno z `ts-nocheck`); implementiraj `scripts/verify/suppressions.mjs` (`findSuppressions(files, decisionsMd)` in CLI z `--root`, privzeto koren repozitorija): seznam datotek iz `git ls-files backend/src frontend/src e2e scripts '*.config.*'`; TS/TSX prek `ts.createSourceFile` (paket `typescript` iz `frontend/node_modules` z `createRequire`): `AnyKeyword`, komentarji `eslint-disable*`, `@ts-ignore`, `@ts-expect-error`, klici `it|test|describe` `.only` (vedno napaka) in `.skip`/`.fixme`, identifikatorji `xit|xdescribe|xtest`; Java: `@SuppressWarnings` in `@Disabled\w*` zunaj komentarjev; sklic `DECISIONS D-\d+` v isti ali predhodni vrstici, preverjen proti vrsticam `| D-NN | … | utišanje |` v `DECISIONS.md`; izpis `datoteka:vrstica  <vrsta>  manjka sklic DECISIONS D-NN` / `neveljaven sklic D-NN` / `.only ni dovoljen`; koda 1 ob zadetku

---

## Phase 12: User Story 8 – Skrivnosti ne pridejo v Git (Priority: P3)

**Goal**: pre-commit kavelj z gitleaks.

**Independent Test**: T032 zelen; quickstart.md razdelek 1.

- [X] T059 [US8] FR-000-19 Ustvari `.githooks/pre-commit` (izvršljiv; če je `gitleaks` na `PATH`, `gitleaks git --pre-commit --staged --redact --verbose`, sicer `docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/gitleaks/gitleaks:v8.30.1 git --pre-commit --staged --redact --verbose`; če ni ne enega ne drugega, izpiše navodilo in vrne ≠ 0), `scripts/install-hooks.sh` (`git config core.hooksPath .githooks`, izpiše potrditev) in `.gitleaks.toml` (`[extend] useDefault = true`, brez izjem; komentar, da izjema zahteva vnos v `DECISIONS.md`)

---

## Phase 13: Polish & Cross-Cutting Concerns

- [X] T060 FR-000-17 Ročni samopreizkus (razvijalca) po quickstart.md razdelek 4: vseh 10 namernih napak, za vsako izhod ≠ 0 in ≤ 20 vrstic z imenom napake (gitleaks prepreči commit); izid vseh primerov zapiši kot vnos `odločitev` v `DECISIONS.md` (depends on US2, US7, US8)
- [X] T061 — Preveri, da ima vsako orodje in knjižnica, uvedena v nalogah T001–T059, vnos v `DECISIONS.md` (T031 zelen)
- [X] T062 [P] — Posodobi `README.md`: predpogoji, `scripts/install-hooks.sh`, `docker compose up` (naslov `http://localhost:8080`), `./verify.sh quick|full`, ročna zaščita veje `main`, povezave na dokumente
- [X] T063 — Izmeri SC-001 (prvi in ponovni zagon) in SC-003 (`quick`) na razvijalskem računalniku; rezultat zapiši v `specs/000-ogrodje/traceability.md`
- [X] T064 — Ročni preizkus začetne strani s tipkovnico in bralnikom zaslona (design.md §10; NVDA ali VoiceOver) v obeh jezikih in shemah
- [X] T065 — Posodobi `specs/000-ogrodje/traceability.md` (vsak FR-000-01 … FR-000-20 → testi → stanje) in poženi `./verify.sh full` – zelen lokalno in v CI

---

## Dependencies & Execution Order

- **Setup (T001–T007) → Foundational (T008–T013) → Tests (T014–T033) → Test review (T034)** so strogo zaporedni.
- Po T034:
  - **US1** (T035–T041) nima odvisnosti od drugih zgodb.
  - **US2** (T042–T045): T045 potrebuje US1 (Compose) za korak `sistem`; T042–T044 lahko tečejo vzporedno z US1.
  - **US3** (T046–T047): neodvisna; `./verify.sh full` kot dokaz potrebuje US1 in US2.
  - **US4** (T048–T049): potrebuje US2 (`verify.sh full`).
  - **US5** (T050–T055): neodvisna od US1–US4; E2E (T024) kot dokaz potrebuje US1 in US2.
  - **US6** (T056–T057): T056 po vseh nalogah, ki uvajajo orodja (lahko se dopolnjuje sproti).
  - **US7** (T058) in **US8** (T059): neodvisni.
- **Polish**: T060 po US2, US7 in US8; T065 zadnja.
- `/speckit-implement` se požene dvakrat: najprej do vključno faze 3 (testi), po pregledu (T034) za preostale faze (workflow.md §4.2).

### Parallel Opportunities

- Setup: T002, T003, T004, T005, T006 hkrati (T007 po T004).
- Foundational: T009–T013 hkrati (po T008).
- Tests: T014–T032 so vsi `[P]` (vsak v svoji datoteki).
- Po pregledu: US1 (T035, T036, T038, T039, T041), US2 (T042), US3 (T046, T047), US5 (T051–T053), US7 (T058; T050 in T058 urejata `frontend/eslint.config.js`, zato zaporedno) in US8 (T059) hkrati.

```text
# Primer: hkratna implementacija po pregledu testov
T035 V1__ogrodje.sql            T042 summarize.mjs          T046 SecurityConfig.java
T047 client.ts                  T051 index.html             T052 i18n
T058 suppressions.mjs           T059 .githooks/pre-commit
```

## Implementation Strategy

1. **MVP = US1 + US2 + US3 (vse P1):** sistem teče, `verify.sh` deluje, vse ravni testov so zelene. Takrat se lahko začne 001-prijava v testni fazi.
2. **P2:** US5 (vmesnik), US4 (CI), US6 (odločitve).
3. **P3:** US7, US8; nato samopreizkus (T060) in zaključek (T061–T065).
4. Vsak checkpoint: `./verify.sh quick` (od US2 naprej); pred združitvijo v `main`: `./verify.sh full` in zelen CI.

## Notes

- Testa nikoli ne spremeni, da bi ustrezal kodi; vsaka sprememba testa po T034 → vnos v `DECISIONS.md`.
- Brez utišanja opozoril brez odobrenega `D-NN` v `DECISIONS.md`.
- Endpointi, poti in dostopna imena samo iz *Public Interfaces* v plan.md.

## Phase 14: Convergence

- [X] T066 Serializiraj telo 401 v `backend/src/main/java/si/contactmanager/shared/security/SecurityConfig.java` iz zapisa `ErrorResponse` (namesto vgrajenega niza) per plan: contracts/openapi.yaml ErrorResponse (partial)
