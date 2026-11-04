# Sledljivost – 000 ogrodje

Ustvarjeno ob pregledu testov (T034, 2026-11-04). Stanje »rdeč« pomeni, da test pred implementacijo pade iz pravega razloga; »varovalo« pomeni, da test že pred implementacijo uspe (regresijsko varovalo).

| FR-ID | Scenarij | Testi (datoteka › ime testa) | Stanje |
|---|---|---|---|
| FR-000-01 | Compose zažene štiri storitve, frontend doseže backend | repo-config.test.mjs › FR-000-01: compose.yaml …, razvojni override …; ogrodje.spec.ts › FR-000-01: zahtevek z začetne strani doseže backend | rdeč |
| FR-000-02 | Zdravje UP/DOWN, Compose čaka na zdravje | HealthAndMigrationIT › healthIsPublicAndReportsUpWithoutInternalDetails; DatabaseDownIT › healthReportsDownWithoutDetailsWhenDatabaseIsUnreachable; repo-config.test.mjs › FR-000-02: Compose čaka na preverjanje zdravja zaledja | rdeč |
| FR-000-03 | Flyway V1 ob zagonu, brez ponovitve, pokvarjena migracija ustavi zagon | HealthAndMigrationIT › migrationV1IsAppliedOnStartup (rdeč), restartDoesNotReapplyMigrations (varovalo); BrokenMigrationIT › brokenMigrationStopsStartup (varovalo) | rdeč |
| FR-000-04 | Emulator Auth, konfiguracija brez skrivnosti | FirebaseEmulatorIT › emulatorIssuesTokenForDemoProject (varovalo); repo-config.test.mjs › FR-000-04: .env.example … | rdeč |
| FR-000-05 | `verify.sh quick` koraki 1–9 | verify-cli.test.mjs › FR-000-05: quick izvede korake 1–9; eslint-rules.test.ts › FR-000-05/12/18 pravila | rdeč |
| FR-000-06 | `verify.sh full` koraki 1–13, ločen projekt Compose, Docker | verify-cli.test.mjs › FR-000-06: full …, full brez Dockerja …; repo-config.test.mjs › FR-000-06: verify full objavi … | rdeč |
| FR-000-07 | Argumenti, kode izhoda, pravilo ustavljanja | verify-cli.test.mjs › FR-000-07: (argumenti, podmapa, brez Jave, statični/testni koraki) | rdeč |
| FR-000-08 | Izpis ≤ 20 vrstic, ena vrstica ob uspehu | summarize.test.mjs › FR-000-08: (vse oblike, omejitev); verify-cli.test.mjs › FR-000-08: uspeh … | rdeč |
| FR-000-09 | `.verify/last.log` | verify-cli.test.mjs › FR-000-09: last.log … (rdeč), .verify/ je izključena iz Gita (varovalo) | rdeč |
| FR-000-10 | Privzeta zavrnitev `/api/**` z 401, odjemalec API | DefaultDenySecurityIT › everyApiPathExceptHealthIsDeniedWith401, healthStaysPublic; FirebaseEmulatorIT › apiRejectsEmulatorTokenWith401InScaffold; client.test.ts › FR-000-10: … | rdeč |
| FR-000-11 | CI požene `verify.sh full`, priloži dnevnik | ci-workflow.test.mjs › FR-000-11: …; ročno T049 (zaščita veje) | rdeč |
| FR-000-12 | Začetna stran: axe, isti izvor, 320 px, žetoni | StartPage.test.tsx › FR-000-12: … (varovalo); ogrodje.spec.ts › FR-000-12: …; eslint-rules.test.ts › FR-000-12: … | rdeč |
| FR-000-13 | Svetla/temna shema, `data-theme`, zmanjšano gibanje, vsiljene barve | ogrodje.spec.ts › FR-000-13: shema sledi sistemu …, ob prefers-reduced-motion …, v načinu vsiljenih barv … | rdeč |
| FR-000-14 | sl/en, zaznava jezika, popolnost prevodov | language.test.ts › FR-000-14: …; StartPage.test.tsx › FR-000-14: …; ogrodje.spec.ts › FR-000-14: …; i18n-keys.test.mjs › FR-000-14: … | rdeč |
| FR-000-15 | PWA: manifest, service worker, brez povezave | ogrodje.spec.ts › FR-000-15: aplikacija je namestljiva, brez povezave … | rdeč |
| FR-000-16 | DECISIONS: shadcn/ui po vzorcih, orodja | decisions.test.mjs › FR-000-16: odločitev o shadcn/ui … (rdeč); veljavna vrsta, paketi npm, odvisnosti Maven (varovalo) | rdeč |
| FR-000-17 | Ročni samopreizkus 10 namernih napak | ročno T060 | ni izveden |
| FR-000-18 | Utišanja, `.only`, izklopljeni testi | suppressions.test.mjs › FR-000-18: …; eslint-rules.test.ts › FR-000-18: … | rdeč |
| FR-000-19 | gitleaks pre-commit | test-full/pre-commit.test.mjs › FR-000-19: … | rdeč |
| FR-000-20 | Dnevniki z ID zahtevka, brez žetonov in PII | RequestIdFilterTest (7); DefaultDenySecurityIT › logsCarryRequestIdAndNeverTokensOrQueryStrings | rdeč |

## Ugotovitve pregleda (T034)

- Dodani testi za vrzeli iz analize: zmanjšano gibanje in vsiljene barve (H1), privzete sence Tailwind niso na voljo, Compose čaka na zdravje zaledja (FR-000-02).
- Test zmanjšanega gibanja v E2E bere izračunane sloge prek `page.evaluate` (ne gre za izbiro elementa za interakcijo; enako kot branje `lang`).
- Popravljeno pred pregledom: drugi primerek aplikacije v `HealthAndMigrationIT`/`BrokenMigrationIT` je bral napačno bazo; izjeme namesto asercij v testu dnevnikov.
- Varovala (uspejo pred implementacijo) ostanejo: preprečujejo regresije v ogrodju in jih ne štejemo za dokaz implementacije.
