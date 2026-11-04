# Research: Ogrodje projekta (000)

**Datum:** 2026-11-04 · **Vhod:** [spec.md](spec.md), konstitucija, `workflow.md` §3, `design.md` 4–6, 12, 13

Različice so preverjene v registrih npm in Maven Central na dan plana; točne različice zaklene `package-lock.json`
oziroma `pom.xml` ob implementaciji. Vsako orodje in knjižnica dobi vnos v `DECISIONS.md` (R-15).

---

## R-01 Različice jedra

- **Decision:** Java 21 (`maven.compiler.release=21`), Spring Boot **4.1.x** (zadnja izdaja 4.1.2), PostgreSQL **18**, Flyway (iz BOM Spring Boot), Testcontainers **2.x**; React **19.3**, Vite **8**, Tailwind CSS **4.3**, **TypeScript 6.0**, **ESLint 9.39**, Vitest **5**, MSW **3**, Playwright **1.64**.
- **Rationale:** Spring Boot 3.5 nima več odprtokodne podpore; 4.1 je zadnja izdaja GA (4.2 je RC). Gostitelj ima JDK 25, `--release 21` zagotovi skladnost z Javo 21 (konstitucija). **TypeScript 7** ni izbran, ker `typescript-eslint` 8.72 podpira `typescript <6.1`; **ESLint 10** ni izbran, ker `eslint-plugin-jsx-a11y` 6.10 podpira ESLint do 9.
- **Alternatives:** Spring Boot 3.5 (brez podpore); TS 7 (zlomi lint); ESLint 10 (zlomi `jsx-a11y`, ki je obvezen).

## R-02 Gradnja zaledja

- **Decision:** Maven Wrapper (`mvnw`), Surefire za unit teste (`*Test`), Failsafe za integracijske (`*IT`) in varnostne (`*SecurityIT`) teste. Spotless s `palantir-java-format`. `maven-compiler-plugin`: `-Xlint:all,-processing` in `failOnWarning=true`.
- **Rationale:** Surefire in Failsafe ločita ravni brez dodatne konfiguracije, `verify.sh` ju kliče kot ločene korake. Wrapper odpravi potrebo po nameščenem Mavenu (na gostitelju ga ni). `-processing` izključi opozorila procesorjev anotacij, ki jih koda ne more odpraviti.
- **Alternatives:** Gradle (Kotlin DSL) – enako zmogljiv, a ločevanje ravni in `-Werror` zahtevata več lastne konfiguracije; Google Java Format – manj berljivi prelomi pri verigah Spring.

## R-03 Preverjanje zdravja (FR-000-02)

- **Decision:** Spring Boot Actuator, izpostavljen samo `health` na `/api/health` (`management.endpoints.web.base-path=/api`, `exposure.include=health`, `show-details=never`, `show-components=never`). Pripravljenost = indikator `db` (privzeto vključen); DOWN → `503`. Brez razkritja različic in komponent.
- **Rationale:** standardna, preizkušena rešitev; isti URL deluje neposredno in prek nginx (`/api` se posreduje). Uporabita ga healthcheck v Compose in `verify.sh`.
- **Alternatives:** lasten kontroler (podvaja Actuator); ločena vrata za upravljanje (nginx jih ne bi posredoval, kar otežuje E2E).

## R-04 Varnost v 000 (FR-000-10)

- **Decision:** Spring Security, brezstanjski; `GET /api/health` `permitAll`, vse ostalo `denyAll` za neprijavljene z vstopno točko, ki vrne `401` in telo `{"code":"UNAUTHENTICATED"}` (`feature-map.md` §2.2, 2.10). Brez seje, brez CSRF (API brez piškotkov), brez obrazca za prijavo. Preverjanje žetonov Firebase se v 000 **ne** uvede (001).
- **Rationale:** spec (Assumptions) dodeli preverjanje žetonov 001; 000 mora zagotoviti privzeto zavrnitev. Zato v 000 tudi zahtevek z žetonom dobi `401`.
- **Alternatives:** OAuth2 Resource Server z JWKS Googla – ne deluje z nepodpisanimi žetoni emulatorja; odloči 001.

## R-05 Firebase Auth Emulator (FR-000-04)

- **Decision:** lastna slika `firebase/Dockerfile` (`node:22-alpine` + pripeta različica `firebase-tools`), zagon `firebase emulators:start --only auth --project demo-contact-manager`, vrata 9099, healthcheck HTTP. Ista slika se v integracijskih testih zgradi s Testcontainers (`ImageFromDockerfile`). Backend dobi `FIREBASE_AUTH_EMULATOR_HOST=auth:9099`, `FIREBASE_PROJECT_ID=demo-contact-manager`.
- **Rationale:** uradne slike ni; projekt s predpono `demo-` ne potrebuje pravega projekta ali ključev. Auth Emulator ne potrebuje Jave.
- **Primer integracijskega testa (FR-000-04, FR-000-10):** `FirebaseEmulatorIT` v emulatorju ustvari uporabnika prek REST (`accounts:signUp` s ključem `fake-api-key`) in dobi ID žeton; preveri, da je žeton izdan za `demo-contact-manager`, in da `GET /api/anything` z njim v 000 vrne `401`. Dokaže, da veriga za 001 deluje.
- **Alternatives:** javne skupnostne slike (nepreverjen izvor, različice ne nadziramo).

## R-06 Migracije (FR-000-03)

- **Decision:** Flyway; `V1__ogrodje.sql` brez poslovnih tabel (samo `COMMENT ON SCHEMA public …`), ki dokaže, da veriga deluje. `spring.flyway.fail-on-missing-locations=true`; neuspešna migracija ustavi zagon (privzeto vedenje Spring Boot), healthcheck tako nikoli ne poroča »pripravljeno«.
- **Testi:** `HealthAndMigrationIT` preveri `flyway_schema_history` (V1 uspešna), ponovni zagon konteksta ne izvede V1 znova, `/api/health` = UP; ustavljen vsebnik PG → `503 DOWN`. Negativni primer (migracija z napako) z ločeno testno lokacijo `db/broken/` → kontekst se ne zažene.
- **Alternatives:** Liquibase (bolj zgovoren, prednosti pri večbaznem okolju tu ne štejejo).

## R-07 ID zahtevka in logi (FR-000-20)

- **Decision:** `RequestIdFilter` (najvišja prednost, pred Spring Security): sprejme `X-Request-Id`, če ustreza `^[A-Za-z0-9-]{1,64}$` (nginx pošlje `$request_id`), sicer ustvari UUID; zapiše ga v MDC `requestId` in glavo odgovora; po zahtevku izpiše eno vrstico `metoda pot status trajanje` – **pot brez niza poizvedbe**. Vzorec loga `logging.pattern.console` vključuje `[%X{requestId:-}]`. Brez filtrov, ki logirajo glave ali telesa. nginx `log_format` uporablja `$uri` (brez poizvedbe) in `$request_id`.
- **Rationale:** besedilni logi na stdout (Clarifications); niz poizvedbe lahko vsebuje e-naslov, zato se ne logira.
- **Testi:** unit `RequestIdFilterTest` (ustvari, sprejme veljavnega, zavrne neveljavnega); `DefaultDenySecurityIT` z `OutputCaptureExtension` pošlje `Authorization: Bearer <naključni-niz>` in `?email=ime@primer.si`, preveri odsotnost obeh v logu, prisotnost ID-ja v vseh vrsticah zahtevka in v glavi odgovora.
- **Alternatives:** JSON logi (zavrnjeno v Clarifications); Micrometer Tracing (prevelik za potrebo).

## R-08 Docker Compose in ločitev `full` (FR-000-01, FR-000-06)

- **Decision:** `compose.yaml` brez objavljenih vrat; `compose.override.yaml` (samodejno naložen z `docker compose up`) objavi `127.0.0.1:8080→frontend:80` in `127.0.0.1:9099→auth:9099`. `verify.sh full` uporabi `docker compose -p contact-manager-verify -f compose.yaml -f compose.verify.yaml up --build --wait --wait-timeout 300`, kjer `compose.verify.yaml` objavi frontend na naključnih vratih (`127.0.0.1::80`); vrata prebere `docker compose port`. `trap … EXIT` izvede `down -v --remove-orphans`.
- Storitve: `db` (`postgres:18-alpine`, `pg_isready`), `auth` (R-05), `backend` (večstopenjska gradnja, `eclipse-temurin:21-jre-alpine`, healthcheck `wget /api/health`, `depends_on` db+auth `service_healthy`), `frontend` (gradnja Vite → `nginx:1.30-alpine`, `depends_on` backend `service_healthy`). Gesla imajo privzete razvojne vrednosti v `compose.yaml` (`${POSTGRES_PASSWORD:-contacts}`), `.env.example` jih dokumentira.
- **Rationale:** ločen projekt ima svoja imena vsebnikov, omrežje in volumne, zato se ne dotakne razvojne baze in ne trči z razvojnimi vrati (Clarifications). Baza ni objavljena navzven (manj trkov vrat; dostop z `docker compose exec db psql`).
- **Alternatives:** isti projekt (zavrnjeno v Clarifications); prosta vrata prek pomožnega skripta (krhko, tekma za vrata).

## R-09 `verify.sh` (FR-000-05 … FR-000-09)

- **Decision:** bash (`set -euo pipefail`), sam najde koren (`dirname "$(readlink -f "$0")"`), preveri orodja (Java ≥ 21, Node ≥ 22.12, npm; za `full` še `docker info`), po potrebi `npm ci` (ko manjka `node_modules` ali se je spremenil `package-lock.json`; ni korak preverjanja). Koraki, vrstni red in pravilo ustavljanja so v [contracts/verify-cli.md](contracts/verify-cli.md). Vsak korak piše v `.verify/last.log` (datoteka se ob začetku izprazni). Zgoščen izpis sestavi `scripts/verify/summarize.mjs` po vrsti koraka: ESLint `--format unix`, `tsc --pretty false`, Maven `[ERROR]/[WARNING] file:[l,c]`, seznam datotek Spotless/Prettier, poročila JUnit XML (Surefire, Failsafe, Vitest `junit`, Playwright `junit`); nadomestno zadnjih vrstic izpisa koraka. Skupaj ≤ 20 vrstic; zadnja »… in še N«.
- Časovne omejitve: `docker compose up --wait-timeout 300`; Testcontainers čakanje 120 s; ob preseku korak pade z imenom storitve.
- **Rationale:** bash zahteva `workflow.md` (`--script sh`); Node za razčlenjevanje, ker je že obvezen.
- **Alternatives:** Make/Just (dodatno orodje, slabši izpis); vse v Node (bash je zahtevan za CI in Git Bash).

## R-10 Preverjanje utišanj in prevodov (FR-000-14, FR-000-18)

- **Utišanja – Decision:** `scripts/verify/suppressions.mjs` pregleda datoteke pod Gitom v `backend/src`, `frontend/src`, `e2e/` in konfiguracijah:
  - TS/TSX: **AST TypeScript** (paket `typescript` iz `frontend/node_modules`) najde `AnyKeyword`, klice `*.only` (napaka vedno) in `*.skip`, `*.fixme`, `xit`, `xdescribe`, `xtest` nad `it/test/describe`; komentarji `eslint-disable*`, `@ts-ignore`, `@ts-expect-error` se iščejo v komentarjih AST. Beseda `any` v nizu, komentarju ali imenu (`company`) ni zadetek.
  - Java: vrstice z `@SuppressWarnings` in `@Disabled*` zunaj komentarjev.
  - Sklic: komentar `DECISIONS D-NN` v isti ali predhodni vrstici; `D-NN` mora obstajati v tabeli `DECISIONS.md` in imeti vrsto `utišanje` (data-model.md).
  - ESLint dodatno: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/ban-ts-comment` (tudi `@ts-nocheck`) in `reportUnusedDisableDirectives: error`.
- **Prevodi – Decision:** `scripts/verify/i18n-keys.mjs` splošči ključe `sl.json` in `en.json` in izpiše `ključ  manjka v: en`. Tip `CustomTypeOptions` (react-i18next) iz `sl.json` povzroči napako `tsc`, če koda uporabi neobstoječ ključ.
- **Samotestni primeri:** `scripts/verify/test/` (Node `node:test`, vgrajen) s fixtures za vsako vrsto utišanja, neveljaven sklic, `.only` s sklicem, `company`/niz `any` (ni zadetek), manjkajoč ključ prevoda, zgoščen izpis (> 20 napak), vedenje `verify.sh` (argumenti, izhodne kode, pravilo ustavljanja, `.verify/last.log`) in statične lastnosti konfiguracije (Compose, CI, `.gitattributes`, `DECISIONS.md`). Tečejo v testnem koraku *orodja* (`quick`). Test kavlja gitleaks potrebuje gitleaks ali Docker, zato je v `scripts/verify/test-full/` in teče v koraku *varnostni BE* (`full`).
- **Alternatives:** samo regex (lažni zadetki na `any`); samo ESLint (ne pokriva Jave in zahteve po sklicu na vrsto `utišanje`).

## R-11 Frontend: žetoni, tema, jezik, PWA (FR-000-12 … FR-000-15)

- **Žetoni:** `frontend/src/styles/app.css` točno po `design.md` 13.2 (`--k-*` z `light-dark()`, aliasi shadcn, `@theme { --color-*: initial; --shadow-*: initial; … }`, `@custom-variant dark`). Lint: `eslint-plugin-better-tailwindcss` – `no-unknown-classes` (npr. `bg-zinc-500` → napaka), `no-restricted-classes` (arbitrarne barve `*-[#…]`, `rgb(`, `hsl(`, `oklch(` in različica `dark:`); `no-restricted-syntax` za atribut JSX `style`. Sistemske barve v `forced-colors:*-[Highlight]` so dovoljene.
- **Pisave:** `@fontsource-variable/atkinson-hyperlegible-next` (400–700) in `@fontsource/atkinson-hyperlegible-mono` (400), podnabora latin in latin-ext, uvožena v `app.css` → Vite jih zapakira na isti izvor; `font-display: swap`.
- **Tema:** vrinjen skript v `<head>` `index.html` (pred CSS) prebere `localStorage` ključ `theme` (`light|dark`), nastavi `data-theme`; v 000 se nič ne zapisuje (001). Brez JS stran sledi sistemu. `prefers-reduced-motion` (`motion-safe:`) in `forced-colors` po 13.3.
- **Jezik:** i18next brez detektorja: `navigator.language` začne z `sl` → `sl`, sicer `en`; `i18n.on('languageChanged')` nastavi `document.documentElement.lang` in `document.title`. Viri so uvoženi statično (brez nalaganja z omrežja).
- **PWA:** `vite-plugin-pwa` (`generateSW`, `registerType: 'autoUpdate'` – nova različica nadomesti staro ob naslednjem obisku), manifest po design.md 12, `workbox.globPatterns` za html/js/css/woff2/png/svg/webmanifest, `navigateFallbackDenylist: [/^\/api\//]`, **brez** `runtimeCaching`. Ikone 192, 512 in maskable iz `public/icon.svg` z `@vite-pwa/assets-generator`. nginx: `Cache-Control: no-cache` za `index.html`, `sw.js`, `manifest.webmanifest`; dolgo predpomnjenje za datoteke z zgoščeno vrednostjo.
- **CSP:** ni v obsegu 000 (vrinjen skript bi zahteval zgoščeno vrednost v nginx). FR-000-12 preverja E2E z beleženjem vseh zahtevkov (vsi na istem izvoru).
- **Alternatives:** `i18next-browser-languagedetector` (nepotrebna odvisnost, shranjevanje je 001); ročno pisan service worker (večje tveganje napake pri izključitvi API).

## R-12 Testna veriga (FR-000-10)

- **FE:** Vitest s projekti `unit` (`src/**/*.test.ts`, korak *unit FE*) in `ui` (`src/**/*.test.tsx`, korak *funkcionalni FE*), okolje jsdom, MSW `setupServer` z `onUnhandledRequest: 'error'`, `vitest-axe` (pravilo `color-contrast` v jsdom ne deluje – pokrije ga E2E). Primera: `client.test.ts` (MSW vrne `401 {"code":"UNAUTHENTICATED"}` → `ApiError` s kodo), `StartPage.test.tsx` (naslov po vlogi, preklop jezika in `<html lang>`, brez zahtevkov na API, axe brez kršitev).
- **Tveganje:** `vitest-axe` 0.1.0 (zadnja sprememba 2025) – če se z Vitest 5 ne izkaže, se uporabi `axe-core` z lastnim ujemalnikom `toHaveNoViolations` (vnos v `DECISIONS.md`).
- **E2E:** Playwright, samo Chromium (namestljivost PWA, service worker), projekti `w360`, `w768`, `w1280`; vsak test teče v svetli in temni shemi (`colorScheme`). `ogrodje.spec.ts`: naslov po vlogi, axe WCAG 2.1 A/AA, brez vodoravnega drsenja pri 320 px, vsi zahtevki na istem izvoru, `fetch('/api/health')` prek nginx = 200, manifest in aktiven service worker, brez povezave se stran naloži, `fetch('/api/health')` brez povezave ne uspe.
- **Alternatives:** Vitest Browser Mode (počasnejši, ni potreben v 000); več brskalnikov v E2E (podaljša `full`, ni zahtevano).

## R-13 CI, kavlji, skrivnosti (FR-000-11, FR-000-19)

- **CI:** `.github/workflows/ci.yml`, `on: [push, pull_request]`, `ubuntu-latest`, `actions/setup-java` (Temurin 21, predpomnilnik Maven), `actions/setup-node` (22, predpomnilnik npm), `npx playwright install --with-deps chromium`, `./verify.sh full`, ob neuspehu `actions/upload-artifact` z `.verify/last.log`. Zaščito veje `main` (obvezen status `verify`) nastavita razvijalca ročno (quickstart).
- **Kavelj:** `.githooks/pre-commit` požene `gitleaks git --pre-commit --staged --redact --verbose`; če binarnega `gitleaks` ni, uporabi pripeto sliko `ghcr.io/gitleaks/gitleaks:v8.30.1` prek Dockerja. Namestitev: `scripts/install-hooks.sh` (`git config core.hooksPath .githooks`). `--redact` skrije vrednost.
- **Rationale:** brez dodatnega upravitelja kavljev (pre-commit/Husky); deluje tudi v Git Bash.
- **Alternatives:** okvir `pre-commit` (zahteva Python); Husky (vezan na npm v korenu).

## R-14 shadcn/ui (FR-000-16) – predlog za odločitev razvijalcev

| Vzorec (design.md 13.4) | Predlog | Razlog |
|---|---|---|
| *Alert Dialog*, *Dialog* | shadcn | ujetje fokusa, vrnitev fokusa, `aria-modal` |
| *Dropdown Menu* | shadcn | tipkovnica (puščice, Esc), postavitev ob robu |
| *Command* / *Combobox* | shadcn | zahteven vzorec ARIA combobox |
| *Sonner* | shadcn | zlaganje, premor ob fokusu in miški |
| *Checkbox*, *Radio Group* | nativni element | nativni so dostopni in delujejo v vsiljenih barvah |
| *Button*, *Input*, *Textarea*, *Label*, *Table*, *Separator* | nativni element | design 13.4 dovoljuje samo izhodišče razredov |
| *Select* | nativni (določeno v design.md) | – |
| *Card*, *Sidebar*, *Tooltip*, *Carousel*, *Chart* | ne (določeno v design.md) | – |

Ob izbiri shadcn se v 000 izvede samo `shadcn init` po 13.4 (`components.json`, alias `ui` → `src/shared/ui`, `cn()`); posamezne komponente doda funkcionalnost, ki jih prva potrebuje (npr. 001 *Dropdown Menu*), s prilagoditvami 1–8.

## R-15 Vnosi v `DECISIONS.md`, ki jih uvede 000

Ena odločitev na skupino orodij: jedro BE (R-01, R-02), Actuator/Security (R-03, R-04), emulator (R-05), Flyway (R-06), logi (R-07), Compose (R-08), `verify.sh` in pomožni skripti (R-09, R-10), FE knjižnice (R-11: Vite, Tailwind, i18next, vite-plugin-pwa, assets-generator, Fontsource, Tabler, clsx, tailwind-merge, better-tailwindcss), testna orodja (R-12), CI in gitleaks (R-13), shadcn/ui po vzorcih (R-14), izid ročnega samopreizkusa (FR-000-17).
