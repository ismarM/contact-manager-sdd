# Implementation Plan: Iskanje, filtri in razvrščanje kontaktov

**Branch**: `iskanje` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-iskanje/spec.md` (Clarify 2026-11-10, D-63)

## Summary

Seznam kontaktov iz 004 dobi iskanje, filtre in razvrščanje. Zaledje razširi `GET /api/groups/{groupId}/contacts` s parametri `q`, `f`, `tag`, `sort`, `dir` (poleg `page`, `size`) in doda `GET /api/groups/{groupId}/contact-filters` (dodatni ključi in značke skupine). Poizvedba se sestavi iz zaprtih fragmentov SQL z imenovanimi parametri; iskanje in pogoji uporabljajo `strpos` z nedeterministično ICU kolacijo `search_fold` (brez razlike velikosti črk in strešic), razvrščanje nedeterministično ICU kolacijo `sort_sl` (slovenska abeceda, D-63). Nova migracija `V8__iskanje.sql` ustvari kolaciji, spremeni kolacijo stolpcev `sort_last`/`sort_first` (privzeto razvrščanje 004 preide na slovensko abecedo brez spremembe zapisovanja) in doda indeks na dodatne ključe. Vmesnik ohrani celotno stanje (iskanje, pogoji, značke, razvrstitev, stran, velikost) v naslovu, doda orodno vrstico (iskanje z zakasnitvijo 300 ms, *Filtri (N)*, *Razvrsti*), razkrivni panel filtrov, odstranljive oznake, razvrščanje v glavah stolpcev in obravnavo praznega stanja, neveljavnih parametrov ter napak. Odločitve: [research.md](research.md), podatki: [data-model.md](data-model.md), pogodba: [contracts/openapi.yaml](contracts/openapi.yaml), D-64.

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`, Flyway, Jackson `tools.jackson`; vmesnik: `react-router`, `react-i18next`, `@tabler/icons-react`) – **brez novih knjižnic** (iskanje ne potrebuje razširitve `unaccent`, R-03)

**Storage**: PostgreSQL 18 (slika `postgres:18-alpine`, ICU); nova migracija `V8__iskanje.sql`

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: SC-001 – 95 % iskanj (iskalni niz + 2 pogoja + 2 znački) v skupini z 10.000 kontakti < 1 s; merjeno s 5 ogrevalnimi in 50 merjenimi zahtevi, p95 (R-15); v bazi ≈ 20 ms

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, samo branje (brez zaklepanja, brez revizijske sledi), enak vrstni red za vse uporabnike (D-63), brez SQL injection (R-13)

**Scale/Scope**: 17 FR (FR-008-01 … FR-008-17), 1 spremenjen + 1 nov endpoint, 1 migracija, 0 novih poti, približno 10 novih FE datotek

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-008-01 … FR-008-17 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, parametre, poti in dostopna imena. Negativni scenariji iz spec so v testih. Skupna pravila (feature-map §2.6) usklajena z D-63. |
| II. Test-first | BE: `ContactQueryParserTest`, `ContactSearchIT`, `ContactFilterIT`, `ContactSortIT`, `ContactSearchPagingIT`, `ContactSearchValidationIT`, `ContactFilterOptionsIT`, `ContactSearchArchivedIT`, `ContactSortCollationIT`, `ContactSortMigrationIT`, varnostni `ContactSearchIsolationMatrixSecurityIT`. FE: funkcionalni z MSW in `vitest-axe`. E2E `iskanje.spec.ts` pri 360/768/1280 px. Pregled testov pred kodo opravi agent `pregled-testov`; sprememba sprejetih testov 004 samo kot `sprememba-testa` (R-14). |
| III. Group isolation and roles | Oba endpointa v matriki izolacije (401 / 404 / 200; arhivirana 200; ključ druge skupine = enak 400); vsaka poizvedba ima `group_id` iz `Membership`. Vloge: VIEWER za vse (brez 403, brez `GROUP_ARCHIVED`). |
| IV. Accessible, bilingual, responsive UI | design.md 8.6, 8.7, 8.9, 8.13, 8.15, 9.3; imena sl/en spodaj; status za število zadetkov, `aria-sort`, `aria-expanded`, fokus po odstranitvi oznake; axe v FE in E2E; sl in en; 320 px naprej. |
| V. Data integrity | Samo branje; deterministično in popolnoma določeno razvrščanje (stabilna paginacija); migracija ne spremeni vrednosti. |
| VI. Privacy and GDPR | Iskalni nizi in vrednosti so osebni podatki: ne beležijo se (R-12); odgovori samo za skupino iz poti. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Odločitve: D-63, D-64. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (0) panel filtrov odstopa od design.md 8.7 (»potrditvena polja vseh značk«): dodano iskalno polje »Poišči značko« in omejitev prikaza (D-67, za pregled v PR; design.md 8.7 je usklajen); (1) odstopanje od 002/003/007 (ICU `title_*` po jeziku vmesnika) je namerno in velja samo za kontakte (D-63); (2) zamenjava privzetega vrstnega reda 004 zahteva `sprememba-testa` pri `ContactReadIT` (R-14); (3) kavelj gitleaks v worktreeju je lažno uspel (R-16) – popravljen v D-66 in pokrit s testi.

## Skladnost z D-63 in obstoječimi funkcionalnostmi

| Zahteva D-63 | Kako jo plan izpolni |
|---|---|
| slovenska abeceda (Č za C, Š za S, Ž za Z) | kolacija `sort_sl` (`sl-u-ks-level2`) – R-01, preverjeno na `postgres:18-alpine` |
| ne glede na velikost črk in jezik vmesnika | moč *secondary*; kolacija je lastnost stolpca/izraza, ne zahteve (`lang` ni parameter) |
| skladnost 004 ↔ 008 | privzeto razvrščanje 004 in `lastName` v 008 uporabljata iste stolpce, isto kolacijo in isti `ORDER BY` |
| determinizem, stabilna paginacija | ključi: izbrano polje → priimek → ime → `created_at` → `id` (uuidv7) |
| prazno na koncu | `NULLS LAST` v obeh smereh |
| V4 se ne spreminja | `V8__iskanje.sql` (`ALTER COLUMN … TYPE … COLLATE`) |
| 010 FR-010-07, 011 FR-011-07 | uporabita isti `ORDER BY` prek §2.6 (R-14) |

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/contacts?q=&f=&tag=&sort=&dir=&page=&size= | VIEWER | allowed | 200; telo `ContactPage` (004) | FR-008-01 … FR-008-05, FR-008-07, FR-008-08, FR-008-14, FR-008-15, FR-008-16 |
| GET | /api/groups/{groupId}/contact-filters | VIEWER | allowed | 200; telo `ContactFilterOptions` | FR-008-06, FR-008-15, FR-008-16 |

- Parametri (podrobno: R-07, [contracts/openapi.yaml](contracts/openapi.yaml)): `q` ≤ 200 znakov; `f` ponovljiv ≤ 10, oblika `‹polje›:‹vrednost›` (polje: `firstName`, `lastName`, `address`, `email`, `phone`, `x.‹ključ›`); `tag` ponovljiv ≤ 30; `sort` (privzeto `lastName`); `dir` `asc`|`desc`; `page` ≥ 0 (API 0-osno); `size` ∈ {25, 50, 100}.
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `404` prazno telo (nečlan, neobstoječa skupina); `400 {"code":"VALIDATION_FAILED","errors":[{field,code}]}` s polji `q`, `f`, `f[i]`, `tag`, `tag[i]`, `sort`, `dir`, `page`, `size`. **Ni** `403` (najnižja vloga je VIEWER) in **ni** `409` (samo branje).
- Vrstni red: 401 → 404 → 400. Ključ, ki ne obstaja v tej skupini (tudi če obstaja v drugi), da enako napako `UNKNOWN_FIELD`.
- Stran onkraj zadnje: `200`, prazen `items`, pravilen `total`. Brez parametrov odgovor ostane enak 004 (po D-63 razvrščen po slovenski abecedi).
- `GET /api/groups` (002), `/api/groups/archived` (003): nespremenjeno.

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Kontakti skupine (seznam z iskanjem, filtri, razvrščanjem) | /groups/:groupId/contacts?q=&f=&tag=&sort=&dir=&page=&size= (`page` 1-osna) | VIEWER | FR-008-01 … FR-008-13, FR-008-17 |
| Kontakt – pogled (panel ≥ 1280 px, sicer stran) | /groups/:groupId/contacts/:contactId?‹enaka poizvedba seznama› | VIEWER | FR-008-09 |

- Nobena nova pot. Poizvedba seznama se prenaša v poteh kontakta in obrazca (`/contacts/new`, `/contacts/:id/edit` ob vrnitvi), zato *Nazaj* in povezave »Nazaj na seznam kontaktov«, »Zapri podrobnosti« vrnejo na isto stanje (razširitev 004 R-11; FR-008-09).
- Primer: `/groups/G/contacts?q=novak&f=x.kompetenca:web&tag=vip&sort=email&dir=desc&size=50&page=2`. Privzete vrednosti se ne zapišejo; vrstni red parametrov je kanoničen (R-07).
- Naslov strani (`<title>`): nespremenjen (»Kontakti – ‹skupina› – Kontakti«).

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Dodatek k elementom seznama iz 004 (plan 004 – *Seznam kontaktov*). Imena 004 se ne spremenijo.

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Seznam | search (landmark) | »Iskanje in filtri« / "Search and filters" | območje, ki vsebuje iskalno polje, število zadetkov, *Filtri*, panel, oznake, *Razvrsti* in smer; testi uporabijo `within(…)` (R-10) | FR-008-01, FR-008-10, FR-008-11, FR-008-07 |
| Seznam | searchbox | »Iskanje po kontaktih« / "Search contacts" | prosto iskanje; rezultati 300 ms po zadnji tipki | FR-008-01, FR-008-02 |
| Seznam (v območju »Iskanje in filtri«) | status | »Najdenih 18 kontaktov« / "18 contacts found" (sl: »Najden 1 kontakt«, »Najdena 2 kontakta«, »Najdeni 3 kontakti«, »Najdenih 5 kontaktov«; en: "1 contact found") | število zadetkov po vsaki osvežitvi (`aria-live`) | FR-008-10 |
| Seznam | button | »Filtri« / "Filters"; z uporabljenimi filtri »Filtri (2)« / "Filters (2)" (`aria-expanded`, `aria-controls`) | odpre/zapre panel | FR-008-11 |
| Panel | group | »Filtri kontaktov« / "Contact filters" | razkrivni panel (ne modalen) | FR-008-03, FR-008-04 |
| Panel | combobox (nativni select) | »Atribut 1« / "Attribute 1" (n-ti pogoj) | polje: Ime / First name, Priimek / Last name, Naslov / Address, E-naslov / Email, Telefon / Phone in dodatni ključi skupine; ključ iz naslova, ki ga ni med možnostmi, je dodatna izbira | FR-008-03, FR-008-06 |
| Panel | textbox | »Vrednost 1« / "Value 1" | vrednost pogoja | FR-008-03 |
| Panel | button | »Odstrani pogoj 1« / "Remove condition 1" | odstrani vrstico osnutka | FR-008-03 |
| Panel | button | »Dodaj pogoj« / "Add condition" | nova vrstica; pri 10 pogojih napaka »Dodaš lahko največ 10 pogojev.« / "You can add at most 10 conditions." | FR-008-03, FR-008-14 |
| Panel | group > checkbox | »Značke« / "Tags" > ime značke (npr. »vip«) | izbrane značke vedno na vrhu (tudi če jih ni več med možnostmi skupine), neizbranih zadetkov največ 100 hkrati | FR-008-04, FR-008-06 |
| Panel | searchbox | »Poišči značko« / "Find tag" | zoži seznam značk (brez razlike velikosti črk in strešic); izbrane ostanejo vidne (D-67) | FR-008-04, FR-008-06 |
| Panel | status | »Značke: prikazanih 12 od 1000« / "Tags: showing 12 of 1000" (+ »Vpiši iskanje za ožji izbor.« / "Type to narrow the list.") | število prikazanih značk, bere ga bralnik zaslona | FR-008-06 |
| Panel | text | »V tej skupini ni značk.« / "This group has no tags." | brez značk | FR-008-06 |
| Panel | alert + button | »Filtrov ni bilo mogoče naložiti. Poskusi znova.« / "Filters could not be loaded. Please try again." + »Poskusi znova« / "Try again" | napaka `contact-filters` | FR-008-17 |
| Panel | button | »Uporabi filtre« / "Apply filters", »Počisti filtre« / "Clear filters" | uveljavi osnutek v naslov; počisti vse | FR-008-05, FR-008-12 |
| Seznam | list | »Uporabljeni filtri« / "Applied filters" | oznake filtrov | FR-008-11 |
| Seznam | button (v oznaki) | »Odstrani filter kompetenca vsebuje web« / "Remove filter kompetenca contains web"; »Odstrani filter Značka: vip« / "Remove filter Tag: vip" | odstrani filter, osveži seznam | FR-008-11 |
| Seznam | button | »Počisti filtre« / "Clear filters" | ob oznakah, ko je kaj uporabljeno (iskanje ali filter) | FR-008-12 |
| Seznam | combobox (nativni select) | »Razvrsti« / "Sort by" | Priimek / Last name, Ime / First name, Naslov, E-naslov, Telefon in dodatni ključi | FR-008-07 |
| Seznam | button | »Smer razvrščanja: naraščajoče« / "Sort direction: ascending" (padajoče / descending) | obrne smer | FR-008-07 |
| Seznam | columnheader > button | »Ime in priimek« / "Name" (`lastName`), »E-naslov« / "Email", »Telefon« / "Phone"; `aria-sort` | razvrščanje v glavi; ponoven klik obrne smer; »Značke« ni razvrstljiva | FR-008-07 |
| Seznam | heading (level 3) + button | »Ni kontaktov, ki ustrezajo filtrom.« / "No contacts match the filters." + »Počisti filtre« | prazno stanje, kadar je nastavljen `q`, filter ali značka | FR-008-13 |
| Seznam | alert + button | »Filtri niso veljavni.« / "The filters are not valid." + »Počisti filtre« | `400 VALIDATION_FAILED` | FR-008-14 |
| Seznam | alert + button | »Kontaktov ni bilo mogoče naložiti. Poskusi znova.« / "Contacts could not be loaded. Please try again." + »Poskusi znova« | napaka med osvežitvijo; prejšnja vsebina ostane (`aria-busy` med nalaganjem) | FR-008-17 |
| Seznam | status | »Nalagam…« / "Loading…" | nalaganje po zakasnitvi (004) | FR-008-17 |

- Opis oznake pogoja: »‹polje› vsebuje ‹vrednost›« / "‹field› contains ‹value›"; imena predefiniranih polj kot v 004. Število v *Filtri (N)* = pogoji + značke (iskalni niz ni filter).
- Paginacija (`nav` »Strani rezultatov« …) je nespremenjena iz 004.
- Gumb *Počisti filtre* je lahko hkrati na več mestih (panel, oznake, prazno stanje, napaka); testi uporabijo `within(group »Filtri kontaktov«)`, `within(search »Iskanje in filtri«)` oziroma `within(main)`. Na strani so trije `status`: nalaganje, število zadetkov (v območju »Iskanje in filtri«) in paginacija (v `nav`); testi vedno uporabijo `within(…)`.
- Po odstranitvi zadnje oznake filtra fokus preide na gumb *Filtri* v območju »Iskanje in filtri« (FR-008-11).

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni / unit | FE funkcionalni | E2E |
|---|---|---|---|
| FR-008-01 | `ContactSearchIT`, `ContactQueryParserTest` | `ContactSearch.test` | `iskanje.spec` |
| FR-008-02 | `ContactSearchIT`, `ContactQueryParserTest` | – | `iskanje.spec` |
| FR-008-03 | `ContactFilterIT`, `ContactQueryParserTest` | `ContactFilters.test` | `iskanje.spec` |
| FR-008-04 | `ContactFilterIT` | `ContactFilters.test` | `iskanje.spec` |
| FR-008-05 | `ContactFilterIT` | `ContactFilters.test` | `iskanje.spec` |
| FR-008-06 | `ContactFilterOptionsIT`, `ContactSearchIsolationMatrixSecurityIT` | `ContactFilters.test` | `iskanje.spec` |
| FR-008-07 | `ContactSortIT`, `ContactSortCollationIT`, `ContactSortMigrationIT` | `ContactSort.test` | `iskanje.spec` |
| FR-008-08 | `ContactSearchPagingIT` | `ContactListUrl.test` | `iskanje.spec` |
| FR-008-09 | – | `ContactListUrl.test`, `contactQuery.test` | `iskanje.spec` |
| FR-008-10 | – | `ContactSearch.test` | `iskanje.spec` |
| FR-008-11 | – | `ContactFilters.test` | `iskanje.spec` |
| FR-008-12 | – | `ContactFilters.test` | `iskanje.spec` |
| FR-008-13 | – | `ContactSearch.test`, `ContactFilters.test` | `iskanje.spec` |
| FR-008-14 | `ContactSearchValidationIT`, `ContactQueryParserTest` | `ContactSearchErrors.test` | `iskanje.spec` |
| FR-008-15 | `ContactSearchArchivedIT`, `ContactSearchIsolationMatrixSecurityIT` | `ContactSearchErrors.test` (arhivirana) | `iskanje.spec` |
| FR-008-16 | `ContactSearchIsolationMatrixSecurityIT`, `ContactSearchIT`, `ContactFilterOptionsIT` | – | – |
| FR-008-17 | – | `ContactSearchErrors.test`, `ContactSearch.test` (zastarel odgovor) | `iskanje.spec` |

Merljiva merila: SC-001 – `ContactSearchPagingIT` (10.000 kontaktov, meja 1 s); SC-002 – `iskanje.spec` (500 kontaktov, iskanje v < 15 s); SC-003 – `ContactListUrl.test`, `contactQuery.test`, `ContactSortIT` (isti vrstni red pri `Accept-Language: sl` in `en`) in `iskanje.spec` (povezava v dveh jezikih); SC-004 – `ContactSearchIsolationMatrixSecurityIT`; SC-005 – `iskanje.spec` (tipkovnica, 320/360 px, axe) in axe v FE testih.

Posebej pokrito (zahteve uporabnika): **slovensko razvrščanje** (`ContactSortIT`: Cene < Čeh < Dana < Šuligoj < Zupan < Žagar, obe smeri; `ContactSortCollationIT` na sliki Compose); **šumniki pri iskanju** (`zupanc`/`ZUPANČ`/`čeh`); **kombinacije** (iskanje + pogoj + značke, več pogojev nad istim ključem); **manjkajoče vrednosti** (obe smeri, atribut brez vrednosti); **stabilnost paginacije** (enak priimek in ime, vsi kontakti vseh strani natanko enkrat, obe smeri); **neveljavni parametri** (vsa polja iz R-06, vrinjeni SQL, `%`/`_`/`\`); **deljene povezave** (naslov ↔ stanje, kanoničnost, dva jezika); **arhivirane skupine** (vsa branja 200); **regresija 004** (celoten obstoječi nabor ostane zelen razen odobrenih sprememb v R-14).

## Project Structure

### Documentation (this feature)

```text
specs/008-iskanje/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/resources/db/migration/V8__iskanje.sql
backend/src/main/java/si/contactmanager/contact/
├── ContactController.java          # list: dodani parametri; nov GET /contact-filters
├── ContactService.java             # list(membership, query), filterOptions(membership)
├── ContactQuery.java               # nepremenljiv model poizvedbe (Condition, SortField, Direction)
├── ContactQueryParser.java         # Map<String,List<String>> → ContactQuery | napake (R-06, R-07)
├── ContactSearch.java              # gradnik WHERE/ORDER BY z imenovanimi parametri (R-04, R-05, R-13)
├── ContactRepository.java          # page/count prek ContactSearch; unknownKeys, filterOptions
└── ContactFilterOptions.java
backend/src/test/java/si/contactmanager/contact/
├── ContactQueryParserTest.java · ContactSearchIT.java · ContactFilterIT.java · ContactSortIT.java
├── ContactSearchPagingIT.java · ContactSearchValidationIT.java · ContactFilterOptionsIT.java
├── ContactSearchArchivedIT.java · ContactSortCollationIT.java · ContactSortMigrationIT.java
├── ContactSearchIsolationMatrixSecurityIT.java
└── support/ContactFixtures.java    # pomočniki za atribute, značke, množično vstavljanje

frontend/src/
├── features/contacts/
│   ├── contactQuery.ts             # parse/serialize/count/describe, pretvorba v API (nadomesti readPaging/listSearch)
│   ├── useContactQuery.ts          # naslov ↔ ContactQuery (push/replace pravila, ponastavitev strani)
│   ├── useDebouncedValue.ts        # 300 ms
│   ├── ContactToolbar.tsx          # iskanje, Filtri (N), Razvrsti, smer
│   ├── FilterPanel.tsx             # osnutek pogojev, značke, Uporabi/Počisti
│   ├── FilterChips.tsx             # uporabljeni filtri
│   ├── ContactList.tsx             # razširitev: stanje podatkov (prejšnja vsebina), prazno stanje, napake, glave z razvrščanjem
│   ├── contactRouting.ts           # poizvedba seznama se prenaša v poteh kontakta
│   ├── api.ts                      # listContacts(query), contactFilters(groupId)
│   └── {ContactSearch, ContactFilters, ContactSort, ContactListUrl, ContactSearchErrors}.test.tsx · contactQuery.test.ts
├── i18n/{sl,en}.json               # contacts.search.*, contacts.filters.*, contacts.sort.*
└── test/msw.ts                     # privzet rokovalnik GET …/contact-filters (kot D-40)

e2e/tests/iskanje.spec.ts · e2e/tests/support/contacts.ts (pomočniki za množično vstavljanje)
```

**Structure Decision**: obstoječa struktura iz 000–007; paket `contact` (BE) in `features/contacts` (FE) se razširita, novih paketov ni.

## Complexity Tracking

Ni kršitev konstitucije. Namerna odstopanja: slovenska abeceda za kontakte neodvisno od jezika vmesnika (D-63), drugače kot 002/003/007 (`title_*` po `lang`); nedeterministični kolaciji (R-01, R-03) zahtevata PostgreSQL ≥ 18 za podniz (slika je 18).
