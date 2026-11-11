# Sledljivost: Iskanje, filtri in razvrščanje kontaktov (008)

Stanje po fazi *Testi* (T001–T030), pred pregledom `pregled-testov` (T031) in pred poslovno implementacijo (T033 naprej).
Vsak test nosi FR-ID (`@Tag("FR-008-NN")` v JUnit; FR-ID v imenu testa v Vitest in Playwright).

## Pokritost zahtev

| FR-ID / SC | BE unit / integracijski / varnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-008-01 | `ContactQueryParserTest`, `ContactSearchIT` | `ContactSearch.test` | `iskanje.spec` |
| FR-008-02 | `ContactQueryParserTest`, `ContactSearchIT`, `ContactSortCollationIT` | `ContactSearch.test` (nespremenjen niz) | `iskanje.spec` |
| FR-008-03 | `ContactQueryParserTest`, `ContactFilterIT`, `ContactSearchIT` | `ContactFilters.test`, `contactQuery.test` | `iskanje.spec` |
| FR-008-04 | `ContactQueryParserTest`, `ContactFilterIT` | `ContactFilters.test`, `contactQuery.test` | `iskanje.spec` (tudi 1000 značk) |
| FR-008-05 | `ContactFilterIT` | `ContactFilters.test` | `iskanje.spec` |
| FR-008-06 | `ContactFilterOptionsIT`, `ContactSearchIsolationMatrixSecurityIT` | `ContactFilters.test` (tudi 1000 značk, iskanje značk) | `iskanje.spec` |
| FR-008-07 | `ContactSortIT`, `ContactSortCollationIT`, `ContactSortMigrationIT`, `ContactReadIT` (D-65), `ContactQueryParserTest` | `ContactSort.test` | `iskanje.spec` |
| FR-008-08 | `ContactSearchPagingIT`, `ContactQueryParserTest` | `ContactListUrl.test`, `contactQuery.test` | `iskanje.spec` |
| FR-008-09 | – (`ContactQueryArchitectureTest` varuje samo zasnovo za ponovno uporabo, brez FR oznake) | `ContactListUrl.test`, `contactQuery.test` | `iskanje.spec` |
| FR-008-10 | – | `ContactSearch.test` (množinske oblike sl in en) | `iskanje.spec` |
| FR-008-11 | – | `ContactFilters.test`, `contactQuery.test` | `iskanje.spec` |
| FR-008-12 | – | `ContactFilters.test` | `iskanje.spec` |
| FR-008-13 | – | `ContactSearch.test`, `ContactFilters.test` | `iskanje.spec` |
| FR-008-14 | `ContactQueryParserTest`, `ContactSearchSqlTest`, `ContactSearchValidationIT`, `ContactSearchLogIT` | `ContactSearchErrors.test` | `iskanje.spec` |
| FR-008-15 | `ContactSearchArchivedIT`, `ContactSearchIsolationMatrixSecurityIT` | `ContactSearchErrors.test` | `iskanje.spec` |
| FR-008-16 | `ContactSearchIT`, `ContactFilterOptionsIT`, `ContactSearchSqlTest`, `ContactSearchIsolationMatrixSecurityIT`, `ContactSearchLogIT` | – | `iskanje.spec` |
| FR-008-17 | – | `ContactSearch.test`, `ContactSearchErrors.test` | `iskanje.spec` |
| SC-001 | `ContactSearchPagingIT` (5 ogrevalnih + 50 merjenih, p95 < 1000 ms) | – | – |
| SC-002 | – | – | `iskanje.spec` (500 kontaktov, tipkovnica, < 15 s) |
| SC-003 | `ContactSortIT` (Accept-Language), `ContactSortCollationIT` | `ContactListUrl.test`, `contactQuery.test` | `iskanje.spec` (sl in en) |
| SC-004 | `ContactSearchIsolationMatrixSecurityIT`, `ContactFilterOptionsIT` | – | `iskanje.spec` |
| SC-005 | – | axe v vseh FE testih (sl in en) | `iskanje.spec` (320/360/768/1280 px, tipkovnica, axe) |

## Test-first: izid pred implementacijo (2026-11-11)

Okolje je delovalo (Testcontainers `postgres:18-alpine` in Firebase Auth Emulator; Docker Compose z gradnjo trenutnega stanja, Playwright Chromium). Padci so preverjeni po sporočilih napak.

| Raven | Novi testi | Padejo | Uspejo že zdaj |
|---|---|---|---|
| BE unit | 65 | 62 (`UnsupportedOperationException: 008-iskanje: še ni izvedeno` – ogrodje) | 3 (`ContactQueryArchitectureTest`, zavestna izjema) |
| BE integracijski + varnostni | 168 | 109 (manjka iskanje, filtri, razvrščanje, V8, `501` za `contact-filters`) | 59 (glej spodaj) |
| FE funkcionalni + unit | 101 | 94 (`not implemented`, manjka območje »Iskanje in filtri«, filtri, razvrščanje) | 7 (glej spodaj) |
| E2E | 39 (13 × 3 širine) | 39 | 0 |
| Obstoječi testi 000–007 | BE unit 245, BE integracijski in varnostni 1.416, FE 663, E2E 276 | 2 (`ContactReadIT`, odobrena sprememba D-65) | vsi ostali |

### Testi, ki uspejo že pred implementacijo (obrazložitev)

- **Obstoječe vedenje 004, ki ga 008 samo potrjuje (regresijska varovala):** `ContactSearchPagingIT` (10 – paginacija, stabilnost, stran onkraj zadnje, enaki ključi), `ContactSearchValidationIT` (7 – neveljaven `size`/`page`, neznani parametri, meje), `ContactSearchIT` (2 – prazen niz in brez parametrov), `ContactSortIT` (4 – privzet vrstni red za primere, kjer se C in slovenski red ujemata, enaki kontakti po času in id, ločila), `ContactListUrl.test` (5 – `page`/`size` v naslovu, obseg, stran onkraj zadnje), `ContactSearch.test` (1 – prazna skupina), `ContactSearchErrors.test` (1 – začetna napaka).
- **Matrika izolacije (`ContactSearchIsolationMatrixSecurityIT`, 35):** 401 in 404 za oba endpointa (varnostna pravila `GroupAccess` veljajo že za ogrodje `contact-filters`), neveljavni parametri članov (`size=7` že zdaj `400`). Zeleni so zaradi obstoječih varnostnih pravil, ne zaradi 008.
- **`ContactSortCollationIT` (1):** `databaseIsPostgreSql18OrNewer` – preverja okolje (PostgreSQL 18).
- **`ContactQueryArchitectureTest` (3):** zavestno zelen ob ogrodju (kot `MemberArchitectureTest`, D-59).

Šibki testi, ki bi uspeli brez funkcionalnosti (en kontakt v skupini, primerjava dveh enakih odgovorov), so bili okrepljeni z dodatnim kontaktom, ki ne ustreza, in z začetnim pogojem (`ContactFilterIT`, `ContactSearchIT`, `ContactSearchValidationIT`, `ContactSearchArchivedIT`, `ContactSearchIsolationMatrixSecurityIT`, `ContactSort.test`, `ContactSearch.test`, `ContactSearchErrors.test`).

## Pregled testov (workflow.md §4.2)

Neodvisni agent `pregled-testov`; najpozneje 3 krogi. Izid po krogih:

| Krog | Izid | Ugotovitve |
|---|---|---|
| 1 | ZAVRNJENO | 6 blokirajočih: (1) `ContactSortIT` – pričakovani vrstni red v testu velikosti črk je bil prepisan iz stare kolacije (Čeh za Novak); (2) `ContactSortIT` – napačni pričakovani vrstni red za `sort=phone`; (3) `ContactSearchSqlTest` – znak `_` je v vsakem veljavnem besedilu SQL; (4) `iskanje.spec` – napačen pričakovan rezultat po odstranitvi oznake; (5) `iskanje.spec` – napačen vrstni red za `?tag=vip`; (6) dvoumni iskalniki »Počisti filtre«, `getByText`, vezava na `value` v `<option>`. Priporočila: okrepitev nestabilnega zajema vrstnega reda, preimenovanje testa o ozkem zaslonu, status »Nalagam…«, FR oznake arhitekturnega testa, `as never`, primerjava lastnika in bralca, commit v meritvi SC-001, uskladitev tipov v `data-model.md`. |
| 2 | **SPREJETO** | brez blokirajočih ugotovitev; vsi dobesedni vrstni redi neodvisno preverjeni po slovenski abecedi. Priporočila (izvedena): zapis `​` namesto nevidnega znaka, FR oznaka `FR-008-02` na metodah `ContactSortCollationIT`, popravek vrstice FR-008-09 v tej tabeli, usklajen čas nalaganja `contact-filters` (R-08: enkrat ob prikazu seznama), vnos D-65 pred D-66, prazen `sort=` v R-06, odstranjen nepotreben `sleep(0)`. |

Vse ugotovitve kroga 1 in priporočila kroga 2 so odpravljeni brez spremembe pričakovanih vrednosti, ki jih je potrdil krog 2 (priporočila so kozmetična: oznake, zapis znaka, dokumentacija).

## Stanje po implementaciji (2026-11-11)

| Raven | Izid |
|---|---|
| BE unit | 306 uspešnih, 0 neuspešnih |
| BE integracijski (iskanje, filtri, razvrščanje, V8) | zeleni, ko se poganjajo posamično in v podskupinah (`Contact*IT`, `Audit*IT`, `Member*IT` …) |
| FE funkcionalni + unit | 764/764 zelenih (63 datotek); lint, tipi, format, utišanja, prevodi brez napak |
| E2E | zadnji celoten tek (315 testov, vključno z `iskanje.spec.ts`) zelen pred zadnjo spremembo FE; po njej ni ponovljen |
| `./verify.sh full` | **PADEL** v koraku *integracijski BE*: samo `ContactSearchPagingIT › searchWithTwoConditionsAndTwoTagsIsFastAtTenThousandContacts` (SC-001); naslednji koraki niso tekli. **Ni zelen.** |

## Meritve

SC-001 (`ContactSearchPagingIT`, iskanje + 2 pogoja + 2 znački, 10.000 kontaktov, 5 ogrevalnih + 50 meritev, p95 po najbližjem rangu, prag < 1000 ms). Okolje: PostgreSQL 18.6 (`postgres:18-alpine`), JDK 21, AMD Ryzen 7 8845HS (16 niti), commit `d5728e4`.

| Pogoj | p50 | p95 | največ | Izid |
|---|---|---|---|---|
| Test sam ali v podskupinah (več tekov) | 33–54 ms | 35–59 ms | do 60 ms | **prag dosežen** |
| Celoten nabor integracijskih testov (približno 4 od 9 tekov) | 41–58 ms | 1269–1442 ms | do 1784 ms | **prag presežen** (nestabilno) |

Analiza (dnevnik Postgres `log_min_duration_statement=300`, en tek): počasne so posamezne izvedbe pripravljenega stavka `S_11`, tj. preverjanja obstoja ključa `SELECT EXISTS (SELECT 1 FROM contact_attribute a JOIN contact c ON c.id = a.contact_id WHERE a.key_norm = $1 AND c.group_id = $2)` (`ContactRepository.existingKeys`, T049), približno 1,25 s; ostali zahtevki trajajo ~40 ms. Zastoji se ponavljajo na ~15 zahtevkov. Sum: pri polni bazi (veliko kontaktov z istim ključem v drugih skupinah) se izbira načrta za ta stavek občasno preklopi (pgjdbc preide po 5 izvedbah na strežniški pripravljeni stavek). Poskus z drugačnim zapisom (`OFFSET 0`) težave v enem nizu tekov ni odpravil in je bil zavržen. Vzrok ni dokončno potrjen (brez `EXPLAIN` v polnem okolju), popravek ni narejen. **Obravnava v `/speckit-converge`.**

Prevzem: SC-001 je v izolaciji dosežen, v polnem testnem okolju občasno nestabilen; verifikacija ni zelena.
