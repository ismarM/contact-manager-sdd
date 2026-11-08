# Implementation Plan: Revizijska sled skupine

**Branch**: `revizijska-sled` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-revizijska-sled/spec.md`

## Summary

Zaledje dobi paket `audit`: vsaka uspešna operacija nad kontakti v isti transakciji pokliče `AuditLog.record` (pogodba beleženja za 004,
009 in 011), ki zapiše en vnos s celotnim stanjem prej in potem za vsak prizadeti kontakt (`audit_entry`, `audit_change` z JSONB,
migracija `V5__revizijska_sled.sql`). Vnosi so popolnoma urejeni z zaporedno številko iz glave sledi `audit_head`, ki hrani tudi
najnovejši vnos celotne sledi (`latestEntryId`, optimistično zaklepanje rollbacka ne glede na filtre). Rollback na vnos T ali na
*Začetno stanje* pod zaklepom skupine izračuna stanje takoj po T iz stanja *prej* prve poznejše spremembe vsakega kontakta, uveljavi
samo razlike (obnovljeni kontakti z istim `id`, novo verzijo, izvajalcem in časom iz T ter oznako *Povrnjeno*) in jih zapiše kot nov
vnos `ROLLBACK`. Vmesnik dobi razdelek *Revizijska sled* (kronološki `ol`, filtri v naslovu poti, paginirane *Podrobnosti* s
preglednico *Polje · Prej · Potem* na zahtevo, potrditveni dialog rollbacka, točko *Začetno stanje*), stran posameznega vnosa ter v
pogledu kontakta povezavo na sled in oznako *Povrnjeno*. Odločitve so v [research.md](research.md), podatki v
[data-model.md](data-model.md), pogodba v [contracts/openapi.yaml](contracts/openapi.yaml).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient` in `NamedParameterJdbcTemplate.batchUpdate`, Flyway, Jackson `tools.jackson` za JSONB; vmesnik: `react-router`, `radix-ui` Dialog, `sonner`, `@tabler/icons-react`, `react-i18next`) – brez novih knjižnic (R-12)

**Storage**: PostgreSQL 18; nova migracija `V5__revizijska_sled.sql` (`audit_entry`, `audit_change`, `audit_head`, stolpec `contact.reverted_entry_id`, sprožilca nespremenljivosti)

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije, atomarnost s sprožilcem v testni bazi) · enotski `ChangeDiffTest` · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: SC-003 – rollback, ki spremeni 1.000 od 10.000 kontaktov, < 10 s (en `DISTINCT ON` po indeksu + paketni stavki, R-04); SC-005 – prva stran sledi s 100.000 vnosi < 2 s p95 (indeks `(group_id, seq DESC)` + štetje, R-08)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, atomarnost (vnos in operacija skupaj, rollback vse ali nič), nespremenljivi vnosi, barve samo iz žetonov, brez novih odvisnosti

**Scale/Scope**: 20 FR (FR-005-01 … FR-005-20), 5 novih endpointov + dopolnitev 2 odgovorov 004, 1 migracija, 2 novi poti, približno 15 novih FE datotek, spremembe v 004 (`ContactService`, `ContactRepository`, pogled in seznam kontaktov)

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-005-01 … FR-005-20 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena; negativni scenariji iz spec so v testih (matrika, pravila rollbacka). Clarifications 2026-11-08 so upoštevana v R-02, R-04, R-08, R-10. |
| II. Test-first | BE: `AuditRecordingIT`, `AuditAtomicityIT`, `AuditImmutabilityIT`, `AuditReadIT`, `AuditRollbackIT`, `AuditRollbackConcurrencyIT`, `AuditRollbackRulesIT`, enotski `ChangeDiffTest`, varnostni `AuditIsolationMatrixSecurityIT`. FE: funkcionalni z MSW in `vitest-axe`. E2E `revizijska-sled.spec.ts` pri 360/768/1280 px. Pregled testov opravi agent `pregled-testov` pred kodo. |
| III. Group isolation and roles | Vsi novi endpointi so v matriki izolacije (401/404/403/2xx; rollback v arhivirani skupini 409 `GROUP_ARCHIVED` za ADMIN/OWNER, 403 za nižje; vnos druge skupine 404). Preverjanje v `GroupAccess`, vsaka poizvedba vnosa ima `group_id`; filter po tujem kontaktu vrne prazen seznam (R-09). Vmesnik ne izriše gumba rollbacka brez pravice (FR-005-17). |
| IV. Accessible, bilingual, responsive UI | design.md 7.2, 8.5, 8.7, 8.9, 8.11, 8.13, 8.15, 9.6, 9.11; `ol` z `<time>`, `details/summary`, preglednica s `caption` in `rowheader`, dialog s fokusom na *Prekliči*, obvestilo uspeha in trajna napaka nad sledjo; sl in en; axe v FE in E2E. |
| V. Data integrity | Ta funkcionalnost uvaja revizijsko sled iz načela V: vnos atomarno z operacijo (`MANDATORY` transakcija, R-05), nespremenljivost (R-07), popolna urejenost (R-02); rollback je atomaren in optimistično zaklenjen na najnovejši vnos (FR-005-14); obnovljeni kontakti dobijo novo verzijo (FR-005-13); seznam in podrobnosti so paginirani. |
| VI. Privacy and GDPR | Stanja kontaktov so podatki skupine in se izbrišejo z njo. Izvajalec je samo sklic `actor_id`/`updatedById` (`ON DELETE SET NULL` → »izbrisan uporabnik«); ime in e-naslov izvajalca se ne kopirata v vnose (012). V dnevnikih ni vsebine kontaktov. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh` (quick: unit, FE; full: IT, varnostni, E2E). Odločitev: D-46. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) 004 dobi beleženje, polji `reverted` in povezavo na sled (R-11) – obstoječi testi 004 in 002 se ne spremenijo (polji sta v tipih vmesnika neobvezni; nobena preizkušena asercija ne šteje povezav v glavi skupine); (2) najnovejši vnos je vedno vnos celotne sledi (Clarifications 2026-11-08); (3) stran posameznega vnosa (`/audit/:entryId`) je cilj povezav iz FR-005-12 in FR-005-19, ki ju spec zahteva brez določene poti.

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/audit?page=&size=&action=&contact= | VIEWER | allowed | 200; telo `AuditPage` (z `latestEntryId` celotne sledi) | FR-005-07, FR-005-09, FR-005-10, FR-005-14 |
| GET | /api/groups/{groupId}/audit/{entryId} | VIEWER | allowed | 200; telo `AuditEntry` | FR-005-12, FR-005-19 |
| GET | /api/groups/{groupId}/audit/{entryId}/changes?page=&size= | VIEWER | allowed | 200; telo `ChangePage` | FR-005-02, FR-005-08 |
| POST | /api/groups/{groupId}/audit/{entryId}/rollback | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER, EDITOR 403) | 201; telo `AuditEntry` (nov vnos `ROLLBACK`) | FR-005-11 … FR-005-15, FR-005-17, FR-005-19 |
| POST | /api/groups/{groupId}/audit/initial-state/rollback | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER, EDITOR 403) | 201; telo `AuditEntry` (`targetInitial: true`) | FR-005-20, FR-005-11 … FR-005-15, FR-005-17 |
| PUT, PATCH, DELETE | /api/groups/{groupId}/audit/{entryId} | — (operacija ne obstaja) | – | 405 s praznim telesom in glavo `Allow` za vse vloge in nečlana (neprijavljen 401); vnos nespremenjen | FR-005-05 |
| POST, PUT, DELETE | /api/groups/{groupId}/contacts[/{contactId}] (004) | EDITOR | rejected (004) | kot 004 + en vnos v sledi v isti transakciji; zavrnjena ali prazna sprememba brez vnosa | FR-005-01, FR-005-04 |
| GET | /api/groups/{groupId}/contacts, …/contacts/{contactId} (004) | VIEWER | allowed | kot 004 + `ContactSummary.reverted` (boolean), `ContactDetail.reverted` (`RevertInfo` ali `null`) | FR-005-19 |

- `size` ∈ {25, 50, 100} (privzeto 25), `page` ≥ 0 (privzeto 0); druga vrednost, neštevilo ali prazna vrednost → `400 VALIDATION_FAILED` s poljem `size` oziroma `page` (kot 004, D-43). `action` je ponovljiv (`CREATE`, `UPDATE`, `DELETE`, `MERGE`, `ROLLBACK`; neznana vrednost → `400`, polje `action`); `contact` je uuid (neveljaven → `400`, polje `contact`; kontakt druge skupine ali brez vnosov → `200` s praznim `items`). Stran onkraj zadnje: `200` s praznim `items` in pravilnim `total`.
- Rollback telo: `{"latestEntryId": "<uuid>"}` – najnovejši vnos celotne sledi iz `AuditPage.latestEntryId` (Clarifications 2026-11-08); manjka ali ni uuid → `400` s poljem `latestEntryId`.
- Napake: `405` prazno telo (`ApiExceptionHandler`, velja za vse poti API; R-07); `401 {"code":"UNAUTHENTICATED"}`; `404` prazno telo (nečlan, neobstoječa skupina, neobstoječ vnos, vnos druge skupine, neveljaven uuid); `403 {"code":"FORBIDDEN"}`; `409 {"code":"GROUP_ARCHIVED"}`; `409 {"code":"VERSION_CONFLICT","current":{"latestEntryId":…}}`; `409 {"code":"ROLLBACK_NO_CHANGES"}` (feature-map §2.10); `400 {"code":"VALIDATION_FAILED","errors":[{field,code}]}`.
- Vrstni red za rollback (R-09, D-41): 401 → 404 (skupina ali ciljni vnos v tej skupini) → 403 → `GROUP_ARCHIVED` → `VALIDATION_FAILED` → `VERSION_CONFLICT` → `ROLLBACK_NO_CHANGES`. V vseh primerih zavrnitve se nič ne spremeni in ne nastane vnos. Rollback na *Začetno stanje* v prazni sledi → `409 ROLLBACK_NO_CHANGES`. Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).
- Pogodba beleženja (FR-005-04, za 009 in 011) je javni Java vmesnik `AuditLog.record(groupId, actorId, AuditAction, List<ContactChange>)` z `@Transactional(propagation = MANDATORY)` (R-06); ni REST endpoint.

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Revizijska sled skupine (`?page=` 1-osno, `?size=`, ponovljen `?action=`, `?contact=`) | /groups/:groupId/audit | VIEWER | FR-005-07 … FR-005-18, FR-005-20 |
| Vnos revizijske sledi (en vnos s *Podrobnostmi*, brez gumba za rollback) | /groups/:groupId/audit/:entryId | VIEWER | FR-005-08, FR-005-12, FR-005-19 |
| Kontakt – pogled (004; dopolnitev: povezava na sled, oznaka *Povrnjeno*) | /groups/:groupId/contacts/:contactId | VIEWER | FR-005-09, FR-005-19 |
| Kontakti skupine (004; dopolnitev: oznaka *Povrnjeno* v vrstici) | /groups/:groupId/contacts | VIEWER | FR-005-19 |

- Vrednosti `action` v poti so enake kot v API (`?action=DELETE&action=MERGE`); neveljavne vrednosti v poti vmesnik prezre (kot `readPaging` v 004), `?contact=` z neveljavnim uuid prikaže prazno stanje filtrov. Ob spremembi filtrov se stran ponastavi na 1.
- Povezava »Spremembe tega kontakta v revizijski sledi« odpre `/groups/:groupId/audit?contact=:contactId` (SC-004: en korak iz pogleda kontakta).
- Naslovi strani (`<title>`, design.md 9): »Revizijska sled – ‹skupina› – Kontakti«, »Vnos revizijske sledi – ‹skupina› – Kontakti« (en: "Audit trail – ‹group› – Contacts", "Audit trail entry – …").
- Neobstoječ ali tuj vnos (`404`) na `/audit/:entryId` prikaže »Te strani ni« (`NotFoundPage`); nečlan na `/audit` prav tako (002).
- Čas vnosa po design.md §11 (»12. 10. 2026, 14.32« / "12 Oct 2026, 14:32"; R-10, D-47), v časovnem pasu brskalnika: **sl** = `Intl.DateTimeFormat('sl', { day: 'numeric', month: 'numeric', year: 'numeric' })` + `", "` + `Intl.DateTimeFormat('sl', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })` z `:` zamenjanim s `.` (»5. 3. 2026, 8.05«); **en** = `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })` ("5 Mar 2026, 08:05"). Oznaka ‹čas› v spodnjih besedilih je ta zapis. Vsaj en test preveri dobesedna niza »12. 10. 2026, 14.32« in "12 Oct 2026, 14:32" (časovni pas testa `Europe/Ljubljana`); drugi testi smejo uporabiti pomočnik `formatAuditTime`. Zapis velja za 005; časi v opozorilu o konfliktu 004 ostanejo nespremenjeni.

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Opomba za teste: glava skupine je `region` z imenom skupine, naslov skupine `h1`, zato je naslov sledi `h2`. Gumbi in povezave, ki se ponovijo pri vsakem vnosu (»Podrobnosti«, »Povrni skupino na to točko«), se iščejo `within(listitem)`; `listitem` vnosa se najde po besedilu stavka (`getAllByRole('listitem')` + `toHaveTextContent`).

#### Razdelek in seznam vnosov

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Glava skupine | link | »Revizijska sled« / "Audit trail" | v `nav` »Razdelki skupine« med *Kontakti* in *Nastavitve*; odpre `/groups/:id/audit` (`aria-current="page"` na sledi in na strani vnosa) | FR-005-07 |
| Sled | heading (level 2) | »Revizijska sled« / "Audit trail" | naslov; fokus po menjavi strani in po uspešnem rollbacku | FR-005-07 |
| Sled | list (`ol`) | »Vnosi revizijske sledi« / "Audit trail entries" | kronološki seznam, najnovejši zgoraj | FR-005-07 |
| Sled | listitem | besedilo: ‹čas› (`<time datetime>`), izvajalec, stavek dejanja | en vnos | FR-005-07 |
| Vnos | text | izvajalec: ime (ali e-naslov, če imena ni) oziroma »izbrisan uporabnik« / "deleted user" | izvajalec | FR-005-02, FR-005-07 |
| Vnos | text | stavki (sl): »dodal(a) kontakt ‹ime›«, »dodal(a) ‹N› kontaktov«; »uredil(a) kontakt ‹ime›«, »uredil(a) ‹N› kontaktov«; »izbrisal(a) kontakt ‹ime›«, »izbrisal(a) ‹N› kontaktov«; »združil(a) ‹N› kontakta«; »povrnil(a) skupino na stanje ‹čas T›«; »povrnil(a) skupino na začetno stanje« – števnik po pravilih množine sl (1 kontakt, 2 kontakta, 3–4 kontakte, 5+ kontaktov) | dejanje kot stavek | FR-005-03, FR-005-07, FR-005-12, FR-005-20 |
| Vnos | text | stavki (en): "added contact ‹name›", "added ‹N› contacts"; "edited contact ‹name›", "edited ‹N› contacts"; "deleted contact ‹name›", "deleted ‹N› contacts"; "merged ‹N› contacts"; "restored the group to the state of ‹time T›"; "restored the group to the initial state" | dejanje kot stavek | FR-005-07 |
| Vnos *rollback* | link | ‹čas T› (npr. »12. 10. 2026, 14.32«) | v stavku; odpre `/groups/:id/audit/:targetEntryId` | FR-005-12 |
| Vnos | group (`details`) + `summary` | »Podrobnosti« / "Details" | razkrije prizadete kontakte; ob prvem odprtju naloži prvo stran sprememb | FR-005-08 |
| Vnos | button | »Povrni skupino na to točko« / "Restore the group to this point" | odpre potrditveni dialog; samo ADMIN, OWNER v nearhivirani skupini; ni izrisan pri vnosu z `id = latestEntryId` | FR-005-15, FR-005-16, FR-005-17 |
| Sled | listitem | »Začetno stanje« / "Initial state" + »Stanje kontaktov pred prvim vnosom v revizijski sledi.« / "The contacts as they were before the first audit trail entry." | zadnji element `ol` na zadnji strani nefiltrirane sledi z vsaj enim vnosom; ne šteje se v paginacijo; z gumbom »Povrni skupino na to točko« (ADMIN+, nearhivirana) | FR-005-20 |
| Sled | navigation | »Strani rezultatov« / "Result pages" | paginacija (design.md 8.9): `status` »1–25 od 40« / "1–25 of 40", »Prejšnja« / "Previous", »Naslednja« / "Next", `combobox` »Velikost strani« / "Page size" (25, 50, 100); vidna, ko je vnosov več kot 0 | FR-005-07 |
| Sled | heading (level 3) | »V revizijski sledi še ni vnosov.« / "There are no entries in the audit trail yet." | prazno stanje brez filtrov | FR-005-10 |
| Sled | heading (level 3) + button | »Ni vnosov, ki ustrezajo filtrom.« / "No entries match the filters." + »Počisti filtre« / "Clear filters" | prazno stanje s filtri | FR-005-10 |
| Sled | status | »Nalagam…« / "Loading…" | nalaganje (po 300 ms, `aria-busy`) | FR-005-07 |
| Sled | alert + button | »Revizijske sledi ni bilo mogoče naložiti. Poskusi znova.« / "The audit trail could not be loaded. Please try again." + »Poskusi znova« / "Try again" | napaka nalaganja | FR-005-18 |

- Terminologija: vrsta dejanja je v spec in filtru *odstranjevanje* / "deleted", stavek vnosa pa »izbrisal(a)« – namerno, enako kot gumb *Izbriši kontakt* in obvestilo »Kontakt ‹ime› je izbrisan.« v 004 (glagol, ki ga uporabnik pozna iz dejanja).

#### Filtri

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Sled | button (`aria-expanded`) | »Filtri« / "Filters"; z uporabljenimi filtri vrste »Filtri (N)« / "Filters (N)" | odpre razkrivni panel (design.md 8.7) | FR-005-09 |
| Panel filtrov | group (`fieldset`) | »Vrsta dejanja« / "Action type" | potrditvena polja | FR-005-09 |
| Panel filtrov | checkbox | »dodajanje« / "added", »urejanje« / "edited", »odstranjevanje« / "deleted", »združevanje« / "merged", »rollback« / "rollback" | izbira ene ali več vrst | FR-005-09 |
| Panel filtrov | button | »Uporabi filtre« / "Apply filters", »Počisti filtre« / "Clear filters" | zapiše filtre v pot (stran 1) oziroma jih odstrani | FR-005-09 |
| Sled | button | »Odstrani filter Vrsta: odstranjevanje« / "Remove filter Action: deleted" (ena oznaka na vrsto; vidno besedilo »Vrsta: odstranjevanje ✕«) | odstrani en filter vrste | FR-005-09 |
| Sled | button | »Odstrani filter Kontakt: Janez Novak« / "Remove filter Contact: Janez Novak"; brez imena »… Kontakt: neznan kontakt« / "… Contact: unknown contact" | odstrani filter po kontaktu (`contactFilter.displayName`) | FR-005-09 |

#### Podrobnosti vnosa

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Podrobnosti | list | »Prizadeti kontakti« / "Affected contacts" | stran prizadetih kontaktov v vrstnem redu vnosa | FR-005-08 |
| Podrobnosti | group (`details`) + `summary` | prikazno ime ob času vnosa (npr. »Janez Novak«) | razkrije preglednico enega kontakta; privzeto zaprt (Clarifications 2026-11-08) | FR-005-08 |
| Podrobnosti | table (caption) | »Spremembe kontakta Janez Novak« / "Changes to contact Janez Novak" | preglednica sprememb | FR-005-02, FR-005-08 |
| Podrobnosti | columnheader | »Polje« / "Field", »Prej« / "Before", »Potem« / "After" | glave stolpcev | FR-005-08 |
| Podrobnosti | rowheader | »Ime« / "First name", »Priimek« / "Last name", »Naslov« / "Address", »E-naslov« / "Email", »Telefon« / "Phone", ključ dodatnega atributa (npr. »kompetenca«), »Značke« / "Tags" | samo spremenjena polja v tem vrstnem redu (R-03) | FR-005-02, FR-005-08 |
| Podrobnosti | cell | vrednost; značke ločene z vejico; prazna vrednost »—« z vizualno skritim »prazno« / "empty" | *Prej* prazen pri dodajanju, *Potem* pri odstranjevanju | FR-005-08 |
| Podrobnosti | navigation | »Strani rezultatov: Prizadeti kontakti« / "Result pages: Affected contacts" | paginacija sprememb (D-26) z enakimi elementi kot zgoraj; vidna, ko je prizadetih kontaktov več kot 25 | FR-005-08 |
| Podrobnosti | status | »Nalagam…« / "Loading…" | nalaganje sprememb | FR-005-08 |
| Podrobnosti | alert + button | »Podrobnosti ni bilo mogoče naložiti. Poskusi znova.« / "The details could not be loaded. Please try again." + »Poskusi znova« | napaka nalaganja sprememb | FR-005-18 |

#### Rollback

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Dialog | dialog | »Povrnem skupino na stanje ‹čas›?« / "Restore the group to the state of ‹time›?"; pri *Začetnem stanju* »Povrnem skupino na začetno stanje?« / "Restore the group to the initial state?" | potrditev (design.md 8.11); fokus ob odprtju na »Prekliči« | FR-005-16, FR-005-20 |
| Dialog | text | »Kontakti skupine bodo vrnjeni v stanje, kot je bilo ‹čas›. Spremembe po tej točki ostanejo zabeležene v revizijski sledi, rollback pa bo zapisan kot nov vnos.« / "The group's contacts will be returned to their state as of ‹time›. Changes after this point stay recorded in the audit trail, and the rollback will be recorded as a new entry."; pri *Začetnem stanju* »Kontakti skupine bodo vrnjeni v stanje pred prvim vnosom v revizijski sledi. …« (isti drugi stavek) | posledica (design.md 9.6) | FR-005-16, FR-005-20 |
| Dialog | button | »Prekliči« / "Cancel", »Povrni skupino« / "Restore group" | *Prekliči* in *Esc* zapreta brez zahteve; fokus nazaj na gumb vnosa | FR-005-16 |
| Ogrodje | region »Obvestila« | »Skupina je povrnjena na stanje ‹čas›.« / "The group was restored to the state of ‹time›."; »Skupina je povrnjena na začetno stanje.« / "The group was restored to the initial state." | obvestilo uspeha; seznam se naloži na stran 1 (nov vnos na vrhu) | FR-005-16, FR-005-20 |
| Sled | alert + button | »Skupine ni bilo mogoče povrniti. Poskusi znova.« / "The group could not be restored. Please try again." + »Poskusi znova« / "Try again"; brez povezave »Ni povezave. Preveri povezavo in poskusi znova.« / "No connection. Check your connection and try again." | trajna napaka nad sledjo (dialog se zapre); *Poskusi znova* ponovi isto zahtevo | FR-005-18 |
| Sled | alert | »Revizijska sled se je medtem spremenila.« / "The audit trail has changed in the meantime." | `409 VERSION_CONFLICT`; seznam se osveži | FR-005-14 |
| Sled | alert | »Skupina je že v tem stanju – rollback ne bi ničesar spremenil.« / "The group is already in this state – the rollback would change nothing." | `409 ROLLBACK_NO_CHANGES`; seznam se osveži | FR-005-15 |
| Sled | alert | »Skupina je arhivirana – rollbacka ni mogoče izvesti.« / "The group is archived – it cannot be restored."; »Za to dejanje nimaš več pravic.« / "You no longer have permission for this action." | `409 GROUP_ARCHIVED`, `403`; seznam se osveži | FR-005-17, FR-005-18 |

#### Stran vnosa

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Vnos | heading (level 2) | »Vnos revizijske sledi« / "Audit trail entry" | naslov strani | FR-005-12 |
| Vnos | text, group »Podrobnosti« | čas, izvajalec, stavek in *Podrobnosti* kot v seznamu | prikaz enega vnosa (brez gumba za rollback) | FR-005-08, FR-005-12 |
| Vnos | link | »Nazaj na revizijsko sled« / "Back to the audit trail" | odpre `/groups/:id/audit` | FR-005-12 |
| Vnos | status, alert + button | »Nalagam…«; »Vnosa ni bilo mogoče naložiti. Poskusi znova.« / "The entry could not be loaded. Please try again." + »Poskusi znova« | nalaganje, napaka | FR-005-18 |

#### Kontakti (dopolnitev 004)

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Pogled kontakta | link | »Spremembe tega kontakta v revizijski sledi« / "Changes to this contact in the audit trail" | odpre `/groups/:id/audit?contact=:contactId`; vsem članom | FR-005-09 |
| Pogled kontakta | group (`details`) + `summary` | »Povrnjeno« / "Restored" | oznaka *Povrnjeno* (design.md 8.5); samo, ko `reverted ≠ null`; privzeto zaprta | FR-005-19 |
| Oznaka *Povrnjeno* | text + link | »Povrnjeno na stanje ‹čas T›« / "Restored to the state of ‹time T›" z linkom ‹čas T› (→ `/audit/:targetEntryId`); pri *Začetnem stanju* »Povrnjeno na začetno stanje« / "Restored to the initial state" brez linka | ciljni vnos | FR-005-19 |
| Oznaka *Povrnjeno* | link | »Odpri vnos povrnitve« / "Open the restore entry" | odpre `/audit/:rollbackEntryId` | FR-005-19 |
| Oznaka *Povrnjeno* | text | »Povrnil(a): ‹ime›« / "Restored by: ‹name›" (ali »izbrisan uporabnik«) in ‹čas rollbacka› | izvajalec rollbacka | FR-005-19 |
| Seznam kontaktov | text | »Povrnjeno« / "Restored" v celici imena (za povezavo, ne v njej) | oznaka v vrstici/kartici, ko `reverted = true` | FR-005-19 |

- Pogled kontakta po rollbacku kaže kot zadnjo spremembo izvajalca in čas iz točke T (polja 004 `updatedBy`, `updatedAt`); konfliktno opozorilo 004 uporablja iste vrednosti (FR-005-19).
- Bralnik zaslona: oznaka *Povrnjeno* v seznamu ni samo barva (besedilo, design.md 8.5).

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / enotski / varnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-005-01 | `AuditRecordingIT` | – | `revizijska-sled.spec` |
| FR-005-02 | `AuditRecordingIT`, `ChangeDiffTest` | `AuditDetails.test` | `revizijska-sled.spec` |
| FR-005-03 | `AuditRecordingIT` (en vnos za več kontaktov prek `AuditLog`) | `AuditPage.test` (stavki) | – |
| FR-005-04 | `AuditAtomicityIT`, `AuditRecordingIT` (pogodba `AuditLog`) | – | – |
| FR-005-05 | `AuditImmutabilityIT`, `AuditIsolationMatrixSecurityIT` | – | – |
| FR-005-06 | `AuditRecordingIT` | – | – |
| FR-005-07 | `AuditReadIT`, `AuditIsolationMatrixSecurityIT` | `AuditPage.test` | `revizijska-sled.spec` |
| FR-005-08 | `AuditReadIT`, `ChangeDiffTest`, `AuditIsolationMatrixSecurityIT` | `AuditDetails.test` | `revizijska-sled.spec` |
| FR-005-09 | `AuditReadIT` | `AuditFilters.test`, `ContactReverted.test` (povezava) | `revizijska-sled.spec` |
| FR-005-10 | `AuditReadIT` | `AuditPage.test` | – |
| FR-005-11 | `AuditRollbackIT`, `AuditAtomicityIT`, `AuditIsolationMatrixSecurityIT` | `AuditRollback.test` | `revizijska-sled.spec` |
| FR-005-12 | `AuditRollbackIT` | `AuditRollback.test`, `AuditEntryPage.test` | `revizijska-sled.spec` |
| FR-005-13 | `AuditRollbackIT`, `AuditRollbackConcurrencyIT` | – | – |
| FR-005-14 | `AuditRollbackConcurrencyIT` | `AuditRollback.test` | `revizijska-sled.spec` |
| FR-005-15 | `AuditRollbackRulesIT` | `AuditRollback.test` | – |
| FR-005-16 | – | `AuditRollback.test` | `revizijska-sled.spec` |
| FR-005-17 | `AuditRollbackRulesIT`, `AuditIsolationMatrixSecurityIT` | `AuditPermissions.test` | `revizijska-sled.spec` |
| FR-005-18 | – | `AuditPage.test`, `AuditRollback.test`, `AuditDetails.test` | – |
| FR-005-19 | `AuditRollbackIT` | `ContactReverted.test`, `AuditEntryPage.test` | `revizijska-sled.spec` |
| FR-005-20 | `AuditRollbackIT`, `AuditRollbackRulesIT` | `AuditInitialState.test` | `revizijska-sled.spec` |

Merljiva merila: SC-001 – `AuditRecordingIT` (vse operacije 004 in vse vrste zavrnitev); SC-002 – `AuditRollbackIT` (rollback na vsako točko naključnega zaporedja operacij s fiksnim semenom, primerjava s stanjem, zabeleženim takoj po točki); SC-003 – `AuditRollbackIT` (10.000 kontaktov, 1.000 sprememb, meja 10 s); SC-004 – `ContactReverted.test`, `revizijska-sled.spec`; SC-005 – `AuditReadIT` (100.000 vnosov, meja 2 s); SC-006 – `AuditIsolationMatrixSecurityIT`, axe v vseh FE testih in E2E pri 360, 768 in 1280 px.

## Project Structure

### Documentation (this feature)

```text
specs/005-revizijska-sled/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/resources/db/migration/V5__revizijska_sled.sql
backend/src/main/java/si/contactmanager/
├── audit/
│   ├── AuditLog.java               # javni: record(groupId, actorId, action, changes) – MANDATORY transakcija, glava sledi (R-02, R-06)
│   ├── AuditAction.java · ContactChange.java      # javna (pogodba za 004, 009, 011)
│   ├── AuditController.java        # 5 endpointov; GroupAccess.require(…); razčlenitev page/size/action/contact/latestEntryId
│   ├── AuditService.java           # branje strani, vnosa, sprememb (R-08)
│   ├── RollbackService.java        # zaklepi, preverjanje latestEntryId, ciljno stanje, razlike, uveljavitev, vnos ROLLBACK (R-04, R-05)
│   ├── AuditRepository.java        # audit_entry, audit_change, audit_head; poizvedbe z group_id
│   ├── ChangeDiff.java             # spremenjena polja iz before/after (R-03)
│   └── {AuditEntry, AuditPage, ChangePage, ContactChangeView, ChangeField, RollbackRequest}.java
├── contact/
│   ├── ContactState.java · ContactSnapshots.java  # javna: celotno stanje, branje in uveljavitev stanj (R-06)
│   ├── ContactService.java         # + AuditLog.record po create/update/delete; reverted_entry_id = NULL ob urejanju
│   ├── ContactRepository.java      # + snapshot, restore/apply (batch), reverted
│   └── {ContactDetail, ContactSummary}.java       # + reverted (RevertInfo / boolean)
└── shared/error/{RollbackNoChangesException, ApiExceptionHandler}.java   # 409 ROLLBACK_NO_CHANGES
backend/src/test/java/si/contactmanager/audit/
├── {AuditRecordingIT, AuditAtomicityIT, AuditImmutabilityIT, AuditReadIT, AuditRollbackIT, AuditRollbackConcurrencyIT, AuditRollbackRulesIT}.java
├── ChangeDiffTest.java · AuditIsolationMatrixSecurityIT.java
└── support/AuditFixtures.java

frontend/src/
├── features/audit/
│   ├── api.ts, types.ts, auditRouting.ts (filtri in stran v poti), sentence.ts (stavki, množina), formatTime.ts
│   ├── AuditPage.tsx, AuditEntryItem.tsx, InitialStateItem.tsx, AuditFilters.tsx, AuditDetails.tsx, ChangeTable.tsx
│   ├── RollbackDialog.tsx, AuditEntryPage.tsx, messages.ts (preslikava napak)
│   └── *.test.tsx                  # AuditPage, AuditDetails, AuditFilters, AuditRollback, AuditPermissions, AuditInitialState, AuditEntryPage
├── features/contacts/{ContactView, ContactList, RevertedBadge}.tsx, types.ts (+ reverted?), ContactReverted.test.tsx
├── features/groups/{GroupLayout, GroupHeader}.tsx   # razdelek audit
├── i18n/{sl,en}.json               # audit.*, title.audit*
└── test/auditApi.ts                # MSW rokovalniki

e2e/tests/revizijska-sled.spec.ts · e2e/tests/support/audit.ts
```

**Structure Decision**: obstoječa struktura iz 000–004; nov paket `audit` (BE) in `features/audit` (FE). Paket `contact` izpostavi
`ContactState` in `ContactSnapshots`, da rollback (paket `audit`) bere in uveljavlja stanja kontaktov brez dostopa do notranjih
razredov 004; 009 in 011 uporabita isti vmesnik.

## Complexity Tracking

Ni kršitev konstitucije. Namerna odstopanja in dodatki:

| Odstopanje | Zakaj | Zavrnjena preprostejša možnost |
|---|---|---|
| Ločena tabela glave sledi `audit_head` namesto števca na skupini (R-02) | pisanje kontaktov ima na skupini samo `FOR SHARE`; števec na `contact_group` bi povzročil zastoje | `created_at` ali `SEQUENCE` – ne ustrezata vrstnemu redu potrditev |
| Stran posameznega vnosa `/audit/:entryId` | spec zahteva povezavi na vnos (FR-005-12, FR-005-19), ne določa pa poti | sidro v seznamu – vnos je lahko na drugi strani ali skrit s filtrom |
| Na strani posameznega vnosa **ni** gumba »Povrni skupino na to točko«, čeprav design.md 9.6 pravi »pri vsakem vnosu« | rollback zahteva `latestEntryId` celotne sledi (FR-005-14, Clarifications 2026-11-08), ki ga vrne samo seznam; stran vnosa je cilj povezave za branje, rollback pa ostane v seznamu, kjer admin vidi kontekst in najnovejši vnos. Gumb je pri vsakem vnosu v seznamu (razen najnovejšega, FR-005-15) | `latestEntryId` tudi v `GET …/audit/{entryId}` – podvojeno stanje in dva vira za isti preverjen podatek |
