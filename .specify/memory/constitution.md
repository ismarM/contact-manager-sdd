<!--
Sync Impact Report
- Version change: template → 1.0.0 (first ratification)
- Principles: I. Specifikacija je pogodba; II. Najprej testi (NON-NEGOTIABLE);
  III. Izolacija skupin in vloge; IV. Dostopen, dvojezičen, odziven vmesnik;
  V. Celovitost podatkov; VI. Zasebnost in GDPR; VII. Ena pot preverjanja
- Added sections: Tehnološki sklad in omejitve; Potek razvoja in vrata kakovosti; Governance
- Removed sections: none
- Templates: spec/plan/tasks overrides in .specify/templates/overrides/ already reflect
  principles I–III and VII (FR-IDs, negative scenarios, Public Interfaces, mandatory tests)
- Deferred TODOs: none
- Remove this comment before committing the amended constitution.
-->

# Contact Manager Constitution

Contact Manager je večnajemniški sistem za vodenje kontaktov v skupinah, razvit po metodi
Spec-Driven Development (GitHub Spec Kit, Claude Code). Ta dokument določa pravila, po katerih
`/speckit-plan`, `/speckit-analyze` in `/speckit-converge` presojajo delo. Podrobnosti postopkov
so v [`workflow.md`](workflow.md), razdelitev zahtev in skupna pravila v
[`feature-map.md`](feature-map.md), videz vmesnika v [`design.md`](design.md).

## Core Principles

### I. Specifikacija je pogodba

- Vir resnice za zahteve so `specs/NNN-ime/spec.md`; `feature-map.md` določa, kateri
  funkcionalnosti pripada katera zahteva, in skupna pravila (vloge, vrstni red preverjanj,
  arhivirane skupine, slovar podatkov), ki jih mora upoštevati vsaka specifikacija.
- Vsaka funkcionalna zahteva ima ID `FR-NNN-XX` in vsaj en scenarij *Given/When/Then*, ki
  navaja ta ID. ID se nikoli ne uporabi znova.
- Vsaka zahteva nad podatki skupine ima negativne scenarije: neprijavljen, nečlan, nezadostna
  vloga ter, kjer je smiselno, arhivirana skupina, pravilo »le nižjim od sebe« in sočasna sprememba.
- `plan.md` MORA vsebovati razdelek *Public Interfaces* (endpointi z najnižjo vlogo in vedenjem
  v arhivirani skupini, strani in poti, ključni elementi z dostopnimi imeni sl/en). Agent med
  implementacijo ne sme izmisliti endpointa, poti ali dostopnega imena, ki ga ni v planu.
- Naloge v `tasks.md` navajajo FR-ID-je, ki jih pokrivajo.
- Specifikacije so žive: sprememba potrjene zahteve se označi z `[CR-NN]`, odstranjena z
  `REMOVED [CR-NN]`, in se zabeleži v `DECISIONS.md`.

*Razlog:* testi, plan in koda se sklicujejo na iste ID-je in imena, zato je vsako odstopanje vidno.

### II. Najprej testi (NON-NEGOTIABLE)

- Testi so **obvezni** za vsako funkcionalnost in vsak FR-ID.
- Testi se napišejo pred implementacijo in morajo pasti **zaradi pravega razloga** (manjka
  vedenje, ne napaka pri prevajanju ali v testu). Pred implementacijo jih pregledata razvijalca.
- Test se po pregledu sme spremeniti samo zato, da se uskladi s specifikacijo, nikoli zato, da bi
  ustrezal kodi; vsaka taka sprememba dobi vnos v `DECISIONS.md`. Obvodi v produkcijski kodi, ki
  služijo le prestajanju testa, so prepovedani.
- Testi nosijo FR-ID (JUnit `@Tag("FR-004-03")`; Vitest/Playwright v imenu testa).
- Brez pravih zunanjih storitev: Firebase Auth Emulator, PostgreSQL prek Testcontainers, MSW v FE.
- Vsak endpoint nad podatki skupine ima parametriziran test matrike izolacije (III).
- UI testi iščejo elemente samo z `getByRole` (z imenom) in `getByLabel`; na vsaki strani teče axe
  (WCAG 2.1 A in AA) brez kršitev; E2E teče pri 360, 768 in 1280 px; izvoz v Excel se v E2E
  prenese in prebere nazaj.

*Razlog:* agent piše kodo hitro; le testi, ki jih pregleda človek, zagotovijo, da dela pravo stvar.

### III. Izolacija skupin in vloge

- Zaledje je dostopno samo prek zavarovanega REST vmesnika. Firebase Authentication (ponudnik
  Google) zagotavlja **samo identiteto**; avtorizacija je lastna, po vlogah v skupini
  `VIEWER < EDITOR < ADMIN < OWNER`, in se vedno preverja na zaledju.
- Kontakti, revizijska sled in člani so strogo izolirani med skupinami.
- Matrika izolacije: neprijavljen `401`; nečlan `404` (obstoj skupine ali vira se ne razkrije);
  član z vlogo pod najnižjo dovoljeno `403`; najnižja dovoljena vloga in višje `2xx`.
- Pisanje v arhivirani skupini se zavrne z `409 GROUP_ARCHIVED`; vrstni red preverjanj je
  določen v `feature-map.md` §2.2.
- Vmesnik ne izriše akcij, ki jih vloga ali stanje skupine ne dovoljujeta – to je udobje, ne zaščita.

*Razlog:* večnajemniški sistem je vreden toliko, kolikor zanesljivo loči podatke najemnikov.

### IV. Dostopen, dvojezičen, odziven vmesnik

- WCAG 2.1 AA je pogoj za zaključek vsake funkcionalnosti (tipkovnica, bralnik zaslona, kontrast,
  način vsiljenih barv, povečava do 400 %).
- Vsa besedila, tudi dostopna imena in sporočila napak, so v slovenščini in angleščini prek i18n.
- Vmesnik je odziven od 320 px naprej in deluje kot nameščena PWA (predpomni se samo ogrodje,
  ne podatki API).
- Videz in vedenje sledita `design.md` (»Kartoteka«); barve, pisave, zaobljenosti in sence so
  samo žetoni iz tega dokumenta.
- Vsak uspeh in neuspeh je uporabniku viden; nevarne operacije zahtevajo potrditev.
- Neobstoječa pot ali nedostopen vir prikaže stran »Te strani ni«.

### V. Celovitost podatkov

- Urejanje kontaktov, članstev in podatkov skupine uporablja optimistično zaklepanje: zastarela
  sprememba se zavrne (`409 VERSION_CONFLICT`) in nič se ne prepiše tiho.
- Množične operacije so atomarne – uspejo v celoti ali se nič ne spremeni.
- Vsaka sprememba kontaktov skupine (dodajanje, urejanje, izbris, združevanje, rollback, množične
  spremembe) se zabeleži v revizijski sledi skupine z izvajalcem, časom ter stanjem prej in potem.
- Vsi seznami so paginirani.

### VI. Zasebnost in GDPR

- Uporabnik lahko izvozi svoje podatke (JSON) in izbriše račun; posledice izbrisa so določene v
  specifikaciji 012 in povsod prikazane kot »izbrisan uporabnik«.
- Hranijo se samo osebni podatki, ki jih aplikacija potrebuje (ime in e-naslov iz Google računa);
  jezik in tema sta nastavitvi naprave, shranjeni le v brskalniku.
- Skrivnosti niso v Gitu (gitleaks v pre-commit); pisave in drugi viri se gostijo lokalno, brez
  klicev na tuje CDN-je.

### VII. Ena pot preverjanja

- Vsa preverjanja tečejo prek `./verify.sh quick` (format, lint, tipi, utišanja, unit in FE testi)
  in `./verify.sh full` (+ integracijski, varnostni, E2E). Izpis je zgoščen (uspeh ena vrstica,
  neuspeh največ 20 vrstic); celoten izpis je v `.verify/last.log`.
- CI ob vsakem pushu in pull requestu požene `./verify.sh full`; združitev v `main` samo ob zelenem CI.
- Utišanje opozoril (`@SuppressWarnings`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `any`)
  je dovoljeno samo z odobrenim vnosom `D-NN` v `DECISIONS.md` in sklicem v komentarju.
- Novo orodje ali knjižnica se uvede samo z vnosom v `DECISIONS.md`.

## Tehnološki sklad in omejitve

- **Frontend:** React, TypeScript (strict), i18n (sl/en), Vite, Tailwind CSS v4 (žetoni iz
  `design.md`, privzeta paleta in sence izključene), shadcn/ui neobvezno (po `design.md` 13.4),
  Tabler Icons, pisavi Atkinson Hyperlegible Next/Mono, PWA; streže ga nginx.
- **Backend:** Spring Boot (Java 21), REST, preverjanje Firebase ID žetonov.
- **Podatkovna baza:** PostgreSQL z migracijami.
- **Avtentikacija:** Firebase Authentication, samo ponudnik Google; registracija ob prvi prijavi.
- **Izvajanje:** Docker Compose (PostgreSQL, Firebase Auth Emulator za razvoj in teste, backend,
  frontend za nginx).
- **Orodja:** Spotless, JUnit 5, Testcontainers · Prettier (+ `prettier-plugin-tailwindcss`),
  ESLint (`jsx-a11y`), Vitest, React Testing Library, MSW, `vitest-axe` · Playwright,
  `@axe-core/playwright` · gitleaks · GitHub Actions.

## Potek razvoja in vrata kakovosti

- Vsaka funkcionalnost gre skozi cikel iz `workflow.md` §0.2: specify → clarify → plan →
  (checklist) → tasks → analyze → implement (samo testi) → **pregled testov** → implement (koda)
  → converge → `./verify.sh full` in `traceability.md`.
- Funkcionalnost ima mapo `specs/NNN-ime/` in vejo `ime` **brez številke**; trenutno
  funkcionalnost nastavi `scripts/feature.sh ime`.
- Funkcionalnost 000 (ogrodje) je pogoj za vse ostale; odvisnosti med funkcionalnostmi so v
  `feature-map.md`.
- `DECISIONS.md` je edini dnevnik odločitev, sprememb testov, utišanj in sprememb specifikacij.
- Funkcionalnost je zaključena, ko ima vsak FR-ID zelen test v `traceability.md`, vsak endpoint
  skupine vnos v matriki izolacije, `./verify.sh full` je zelen in ročni preizkus dostopnosti
  (`design.md` §10) je opravljen.

## Governance

- Prednost pri navzkrižju: **konstitucija → `workflow.md` → `spec.md` → `plan.md` → `tasks.md`**;
  `feature-map.md` in `design.md` veljata kot del specifikacije za vse funkcionalnosti.
- Konstitucijo, `workflow.md`, `feature-map.md`, `design.md` in predloge v
  `.specify/templates/overrides/` spreminjata samo oba razvijalca skupaj, z vnosom v `DECISIONS.md`.
- Različice po semantičnem številčenju: MAJOR – odstranitev ali sprememba pomena načela;
  MINOR – novo načelo ali bistveno razširjeno pravilo; PATCH – pojasnila in popravki besedila.
- `/speckit-analyze` in pregled vsake funkcionalnosti preverita skladnost s to konstitucijo;
  odstopanje se odpravi ali utemelji v razdelku *Complexity Tracking* v `plan.md`.
- Prvotni dokumenti v `original_documentation/` so zgodovinski in se ne spreminjajo.

**Version**: 1.0.0 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-02
