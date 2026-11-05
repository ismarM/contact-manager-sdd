# Implementation Plan: Skupine kontaktov

**Branch**: `skupine` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-skupine/spec.md` (s *Clarifications* 2026-11-05)

## Summary

Zaledje dobi tabeli `contact_group` in `group_member` (migracija `V3__skupine.sql`), skupni sloj `GroupAccess`, ki za
vsak zahtevek nad skupino izvede preverjanja iz feature-map §2.2 (401 → 404 → 403 → 409 arhivirana), in štiri endpointe:
ustvarjanje skupine (ustvarjalec postane `OWNER`), seznam mojih nearhiviranih skupin po vlogah (paginiran po razdelkih,
abecedno po pravilih jezika vmesnika prek ICU kolacij v PostgreSQL), branje skupine in urejanje podatkov skupine z
optimističnim zaklepanjem (`409 VERSION_CONFLICT` s trenutnim stanjem v telesu; nespremenjeno shranjevanje ne spremeni
verzije). Vmesnik dobi zaslon *Skupine* na `/`, stranski pas (≥ 1024 px) in meni za preklop skupine (< 1024 px),
okvir skupine (`/groups/:groupId`: glava z jezičkom, naslovom, vlogo, oznako *Arhivirano*, navigacija razdelkov), razdelek
*Nastavitve → Podatki skupine* (samo branje ali obrazec z razrešitvijo konflikta), dialog *Nova skupina* in obvestila
o uspehu. Odločitve so v [research.md](research.md).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**:
- BE: obstoječe (Web MVC, Security + OAuth2 Resource Server, JDBC `JdbcClient`, Flyway, PostgreSQL) – brez novih knjižnic
- FE: obstoječe (`react-router`, `radix-ui`, `@tabler/icons-react`, `react-i18next`) + `sonner` 2.0.8 (shadcn *Sonner*, D-15; vnos v `DECISIONS.md`). Shadcn *Dialog* temelji na že nameščenem `radix-ui`.

**Storage**: PostgreSQL 18; migracija `V3__skupine.sql` (tabeli `contact_group`, `group_member`, ICU kolaciji; [data-model.md](data-model.md))

**Testing**: JUnit 5 + Testcontainers (PostgreSQL) + Firebase Auth Emulator (integracijski, matrika izolacije) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx streže vmesnik in posreduje `/api/`), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: zaslon *Skupine* pri 100 skupinah < 2 s (SC-002), merjeno v E2E od navigacije na `/` do vidnih vrstic prvega razdelka (uporabniška izkušnja, ne samo API); največ 5 poizvedb po indeksu `group_member (user_id, role)`, največ 100 skupin na razdelek

**Constraints**: WCAG 2.1 AA, sl/en, optimistično zaklepanje podatkov skupine, paginirani seznami, izolacija skupin, barve samo iz žetonov (`--k-group-*`)

**Scale/Scope**: 13 FR (FR-002-01 … FR-002-13), 4 endpointi, 3 poti, 2 tabeli, 1 migracija

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-002-01 … FR-002-13 (tabela pokritosti spodaj). *Public Interfaces* določajo endpointe, poti in dostopna imena, na katere se sklicujejo testi. Vsi negativni scenariji iz spec so v testih. |
| II. Test-first | BE: unit (`GroupInputParserTest`, `GroupColorTest`), integracijski (`GroupCreateIT`, `GroupListIT`, `GroupReadIT`, `GroupUpdateIT`, `GroupConcurrencyIT`), varnostni (`GroupIsolationMatrixIT`). FE: unit (`groupValidation` – pravila podatkov, `conflictMessage` – izvajalec in čas v opozorilu o konfliktu, `ApiError.body`), funkcionalni z MSW in `vitest-axe` (zaslon, stranski pas, meni, dialog, glava, nastavitve, konflikt). E2E `skupine.spec.ts` pri 360/768/1280 px, vključno z merjenjem SC-002 v brskalniku. Pregled testov opravi agent `pregled-testov` pred kodo. |
| III. Group isolation and roles | Vsak endpoint skupine je v matriki izolacije (401/404/403/2xx, arhivirana 409): `GET /api/groups/{id}` (VIEWER), `PUT /api/groups/{id}` (ADMIN). `POST /api/groups` in `GET /api/groups` sta vezana na uporabnika (—): 401, seznam vsebuje samo lastne nearhivirane skupine. Preverjanje je v skupnem `GroupAccess`, ne v kontrolerjih (D-27). Vmesnik skrije obrazec nižjim vlogam (udobje); zaščita je na zaledju. |
| IV. Accessible, bilingual, responsive UI | design.md 4.2, 7.1, 7.2, 8.5, 8.9, 8.10, 8.12–8.16, 9.2, 9.7, 9.10; vsa besedila in dostopna imena v sl/en (spodaj); axe v FE testih in E2E na vseh straneh in stanjih 002 v slovenščini **in** angleščini (SC-006); 320 px brez vodoravnega drsenja; prilagoditve shadcn po 13.4 (točke 1–8). |
| V. Data integrity | Optimistično zaklepanje podatkov skupine (`version`, `UPDATE … WHERE version = :v` v transakciji z zaklepom vrstice); ustvarjanje skupine in članstva `OWNER` je ena transakcija; delni unikatni indeks zagotavlja največ enega lastnika; vsi seznami paginirani (največ 100). Revizijska sled ne beleži sprememb skupine (spec, Assumptions). |
| VI. Privacy and GDPR | Osebni podatki: ime in e-naslov izvajalca zadnje spremembe, prikazana članom iste skupine (že del članstva v 007). `updated_by` ima `ON DELETE SET NULL` → »izbrisan uporabnik« (feature-map §2.5, 012). Identifikatorji uporabnikov niso v API-ju; skupine imajo neodgonetljiv `uuid`. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Odločitve so v `DECISIONS.md`: D-25 (`FORBIDDEN`), D-26 (imena paginacije), D-27 (skupni temelji skupin), D-28 (`sonner`, `uuidv7()`, ICU kolaciji). |

**Rezultat (pred raziskavo):** PASS.

**Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) koda `FORBIDDEN` je v registru kod (feature-map §2.2, §2.10; D-25);
(2) D-25, D-26 in D-27 spreminjajo skupne dokumente ali vplivajo na druge funkcionalnosti – potrdi jih drugi razvijalec ob
pregledu PR 002; (3) `contactCount` je do 004 vedno 0 (spec, Assumptions).

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups | — (prijavljen) | – (ustvari novo skupino) | 201; telo `GroupDetail` | FR-002-01, FR-002-02, FR-002-03 |
| GET | /api/groups | — (prijavljen) | arhivirane skupine niso v odgovoru | 200; telo `GroupSections` | FR-002-04, FR-002-05, FR-002-06 |
| GET | /api/groups/{groupId} | VIEWER | allowed (200, `archived: true`) | 200; telo `GroupDetail` | FR-002-07, FR-002-08, FR-002-10 |
| PUT | /api/groups/{groupId} | ADMIN | rejected (409 GROUP_ARCHIVED; VIEWER/EDITOR 403) | 200; telo `GroupDetail` | FR-002-02, FR-002-11, FR-002-12 |

- `POST` telo: `{"title": string, "description": string|null, "color": "tinta"|…|"rja"|null}`. `title` obvezen; manjkajoč ali `null`
  `description` = brez opisa; manjkajoča ali `null` `color` = `tinta` (FR-002-03). Neznana polja → `400`.
- `PUT` telo: `{"title", "description", "color", "version"}` – vsa polja obvezna (`description` lahko `null`).
- `GET /api/groups` poizvedbene spremenljivke: `role` (neobvezno, `OWNER|ADMIN|EDITOR|VIEWER`: vrne samo ta razdelek),
  `page` (od 0, privzeto 0; velja za `role`; brez `role` mora biti 0), `size` (1–100, privzeto 25), `lang` (`sl|en`, privzeto `en`;
  določa abecedni red). Neveljavna vrednost → `400 VALIDATION_FAILED` z napako po poljih.
- `GroupSections`: `{"sections": [{"role","total","page","size","items":[GroupSummary]}]}`; razdelki so v vrstnem redu
  `OWNER, ADMIN, EDITOR, VIEWER`, razdelek brez skupin (`total` 0) ni vključen. `GroupSummary`:
  `{"id","title","description"|null,"color","contactCount"}`.
- `GroupDetail`: `{"id","title","description"|null,"color","role","archived","version","updatedAt","updatedBy":{"name"|null,"email"}|null}`;
  `updatedBy: null` = izbrisan uporabnik.
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `404` s praznim telesom (nečlan in neobstoječa skupina enako; tudi neveljaven
  zapis `groupId` → `404`, samo na poteh `/api/groups/{groupId}`: `groupId` je niz, ki ga razčleni `GroupAccess`, brez splošne
  preslikave napak tipov za druge endpointe); `403 {"code":"FORBIDDEN"}` (D-25; samo član s prenizko vlogo); `409 {"code":"GROUP_ARCHIVED"}`;
  `409 {"code":"VERSION_CONFLICT","current":GroupDetail}`; `400 {"code":"VALIDATION_FAILED","errors":[{"field","code"}]}` s `field` ∈
  `title|description|color|version|role|page|size|lang|body` in `code` ∈ `REQUIRED|TOO_LONG|INVALID_VALUE|UNKNOWN_FIELD|MALFORMED`.
- Vrstni red preverjanj pri `PUT`: 401 → 404 → 403 → `GROUP_ARCHIVED` → `VERSION_CONFLICT` → 400 (feature-map §2.2).
- Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Skupine (nadomesti začasno začetno stran iz 001) | / | — (prijavljen) | FR-002-01, FR-002-04, FR-002-05, FR-002-09, FR-002-13 |
| Skupina (preusmeri na prvi razdelek navigacije; do 004 *Nastavitve*) | /groups/:groupId | VIEWER | FR-002-03, FR-002-07, FR-002-08 |
| Nastavitve skupine (*Podatki skupine*) | /groups/:groupId/settings | VIEWER (obrazec: ADMIN) | FR-002-07, FR-002-09, FR-002-10, FR-002-11, FR-002-12, FR-002-13 |
| Te strani ni (001) | /groups/:groupId in vsak podrazdelek za nečlana, neobstoječo skupino ali neznan razdelek | – | FR-002-08 |

- Stranski pas (≥ 1024 px) je del ogrodja na vseh prijavljenih poteh (tudi `/account`); pri < 1024 px ga nadomesti gumb
  *Preklopi skupino* v zgornji vrstici. Prikaz določa `matchMedia('(min-width: 1024px)')`, tako da je v DOM vedno samo eden
  od obeh (jsdom testi `matchMedia` nadomestijo).
- Naslovi strani: »Skupine – Kontakti« / "Groups – Contacts"; »Nastavitve – ‹naslov skupine› – Kontakti« /
  "Settings – ‹group title› – Contacts"; ob nalaganju in za nedostopno skupino »Te strani ni – Kontakti« / "Page not found – Contacts".
- Po uspešnem ustvarjanju vmesnik odpre `/groups/:newId` (→ `settings`) in fokus premakne na naslov skupine (`h1`).
- Zaslon *Skupine* drži paginacijo razdelkov v lokalnem stanju (ni v URL; stanje v URL je 008).

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Opomba za teste: ob širini ≥ 1024 px sta *Nova skupina* in povezave skupin hkrati v stranskem pasu in v `main`; teste omejimo z
`within(navigation »Moje skupine«)` oziroma `within(main)`. Pri < 1024 px stranskega pasu ni v DOM.

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Skupine | heading (level 1) | »Skupine« / "Groups" | naslov zaslona | FR-002-04 |
| Skupine | button | »Nova skupina« / "New group" | odpre dialog; v praznem stanju je to edina taka kontrola v `main` | FR-002-01, FR-002-05 |
| Skupine | heading (level 2) | »Lastnik (2)« / "Owner (2)", »Admin (1)« / "Admin (1)", »Urednik (n)« / "Editor (n)", »Bralec (n)« / "Viewer (n)" | razdelek po vlogi s številom | FR-002-04 |
| Skupine | list / listitem | – | skupine razdelka; vrstica vsebuje povezavo, opis (ena skrajšana vrstica) in »12 kontaktov« / "12 contacts" | FR-002-04 |
| Skupine | link | naslov skupine | odpre `/groups/:groupId` (jeziček je `aria-hidden`) | FR-002-04 |
| Skupine | navigation | »Strani rezultatov: Lastnik« / "Result pages: Owner" (enako za druge vloge) | paginacija razdelka (design.md 8.9, D-26); vidna, ko ima razdelek več kot 25 skupin | FR-002-04 |
| Skupine | button | »Prejšnja« / "Previous", »Naslednja« / "Next" | menjava strani razdelka (onemogočena na robu) | FR-002-04 |
| Skupine | combobox | »Velikost strani« / "Page size" (nativni `select`: 25, 50, 100) | velikost strani razdelka | FR-002-04 |
| Skupine | status | »1–25 od 30« / "1–25 of 30" | obseg v razdelku | FR-002-04 |
| Skupine | heading (level 2) + text | »Nimaš še nobene skupine.« / "You don't have any groups yet." | prazno stanje (design.md 8.15) | FR-002-05 |
| Skupine | status | »Nalagam…« / "Loading…" (`aria-busy` na seznamu) | nalaganje | FR-002-04 |
| Skupine | alert | »Skupin ni bilo mogoče naložiti. Poskusi znova.« / "Groups could not be loaded. Please try again." + gumb »Poskusi znova« / "Try again" | napaka nalaganja | FR-002-13 |
| Ogrodje (≥ 1024 px) | navigation | »Moje skupine« / "My groups" | stranski pas | FR-002-06 |
| Stranski pas | heading (level 2) | »Lastnik« / "Owner", »Admin«, »Urednik« / "Editor", »Bralec« / "Viewer" | razdelek (brez praznih, brez števila) | FR-002-06 |
| Stranski pas | link | naslov skupine; trenutna ima `aria-current="page"` | odpre skupino | FR-002-06 |
| Stranski pas | link | »Vse skupine« / "All groups" | vodi na `/`, kadar ima razdelek več kot 10 skupin | FR-002-06 |
| Stranski pas | button | »Nova skupina« / "New group" | odpre dialog | FR-002-01 |
| Zgornja vrstica (< 1024 px) | button | »Preklopi skupino« / "Switch group" | odpre meni (`aria-haspopup="menu"`) | FR-002-06 |
| Meni preklopa | menu | »Preklopi skupino« / "Switch group" | meni z razdelki | FR-002-06 |
| Meni preklopa | group | »Lastnik« / "Owner", … | razdelek po vlogi | FR-002-06 |
| Meni preklopa | menuitem | naslov skupine (`aria-current="page"` za trenutno); »Vse skupine« / "All groups" | odpre skupino / zaslon *Skupine* | FR-002-06 |
| Dialog | dialog | »Nova skupina« / "New group" | modalni dialog z naslovom `h2` | FR-002-01 |
| Dialog in obrazec | textbox | »Naslov« / "Title" (`aria-required="true"`) | naslov skupine | FR-002-01, FR-002-02, FR-002-11 |
| Dialog in obrazec | textbox | »Opis« / "Description" (`textarea`) | opis skupine | FR-002-01, FR-002-11 |
| Dialog in obrazec | radiogroup | »Barva« / "Color" (`fieldset` z `legend`) | izbira barve | FR-002-01, FR-002-11 |
| Dialog in obrazec | radio | »Tinta« / "Ink", »Mah« / "Moss", »Opeka« / "Brick", »Oker« / "Ochre", »Sliva« / "Plum", »Morje« / "Sea", »Grafit« / "Graphite", »Rja« / "Rust" | barva (vzorec je `aria-hidden`; privzeta *Tinta*) | FR-002-01, FR-002-03, FR-002-11 |
| Dialog | button | »Prekliči« / "Cancel" | zapre dialog brez ustvarjanja | FR-002-01 |
| Dialog | button | »Ustvari skupino« / "Create group" | ustvari skupino | FR-002-01 |
| Dialog in obrazec | text (povezano z `aria-describedby`, polje `aria-invalid`) | »Vpiši naslov.« / "Enter a title."; »Naslov je lahko dolg največ 100 znakov.« / "The title can be at most 100 characters."; »Opis je lahko dolg največ 1000 znakov.« / "The description can be at most 1,000 characters."; »Izberi eno od ponujenih barv.« / "Choose one of the offered colors." | napaka ob polju | FR-002-02 |
| Dialog | alert | »Skupine ni bilo mogoče ustvariti. Poskusi znova.« / "The group could not be created. Please try again."; »Ni povezave. Preveri povezavo in poskusi znova.« / "You're offline. Check your connection and try again." | napaka akcije nad obrazcem (brez kod) | FR-002-13 |
| Skupina | region | naslov skupine | glava skupine (`section` z `h1` kot imenom) | FR-002-07 |
| Skupina | heading (level 1) | naslov skupine | naslov (jeziček `aria-hidden`) | FR-002-07 |
| Skupina | text | »Vloga: Lastnik« / "Role: Owner", »Vloga: Admin«, »Vloga: Urednik« / "Role: Editor", »Vloga: Bralec« / "Role: Viewer" | oznaka vloge v glavi (design.md 8.5): vidno samo ime vloge, predpona »Vloga: « / "Role: " je vizualno skrita (`sr-only`); testi preverijo besedilo regije (`toHaveTextContent`) | FR-002-07 |
| Skupina | text | »Arhivirano« / "Archived" | oznaka arhivirane skupine (ikona `aria-hidden`) | FR-002-07 |
| Skupina | navigation | »Razdelki skupine« / "Group sections" | navigacija med razdelki | FR-002-07 |
| Skupina | link | »Nastavitve« / "Settings" (`aria-current="page"`) | razdelek *Nastavitve* | FR-002-07 |
| Skupina | heading (level 1) + link | »Te strani ni« / "Page not found", »Na seznam skupin« / "Back to groups" | nečlan / neobstoječa skupina (komponenta `NotFoundPage` iz 001) | FR-002-08 |
| Nastavitve | heading (level 2) | »Podatki skupine« / "Group details" | razdelek | FR-002-10 |
| Nastavitve (branje) | term / definition | »Naslov« / "Title", »Opis« / "Description" (prazen: »Brez opisa« / "No description"), »Barva« / "Color" z imenom barve (»Mah« / "Moss") | podatki brez obrazca | FR-002-10 |
| Nastavitve (obrazec) | form | »Podatki skupine« / "Group details" | obrazec za lastnika in admina nearhivirane skupine | FR-002-11 |
| Nastavitve (obrazec) | button | »Shrani spremembe« / "Save changes" | shrani | FR-002-11, FR-002-12 |
| Nastavitve (obrazec) | alert | »Skupino je medtem spremenil(a) ‹ime› ob ‹čas›.« / "The group was changed in the meantime by ‹name› at ‹time›." (izvajalec brez računa: »izbrisan uporabnik« / "deleted user"; ime `null` → e-naslov; ‹čas› = ura in minuta v zapisu jezika, pred njo datum, če sprememba ni bila danes; oblikuje `conflictMessage.ts`) | konflikt verzij (design.md 8.14) | FR-002-12 |
| Nastavitve (konflikt) | button | »Prikaži razlike« / "Show differences" (`aria-expanded`) | razkrije tabelo razlik | FR-002-12 |
| Nastavitve (konflikt) | button | »Uporabi trenutno različico« / "Use current version" | zavrže vnose, naloži trenutno stanje | FR-002-12 |
| Nastavitve (konflikt) | button | »Shrani moje spremembe« / "Save my changes" | ponovno pošlje vnose s trenutno verzijo | FR-002-12 |
| Nastavitve (konflikt) | table | »Razlike med tvojimi in trenutnimi vrednostmi« / "Differences between your values and the current ones"; stolpci »Polje« / "Field", »Tvoja vrednost« / "Your value", »Trenutna vrednost« / "Current value" | samo polja, ki se razlikujejo | FR-002-12 |
| Nastavitve (obrazec) | alert | »Sprememb ni bilo mogoče shraniti. Poskusi znova.« / "Your changes could not be saved. Please try again."; »Skupina je medtem postala arhivirana, zato je ni več mogoče urejati.« / "The group has been archived in the meantime and can no longer be edited."; »Za to dejanje nimaš več pravic.« / "You no longer have permission to do this."; »Ni povezave. Preveri povezavo in poskusi znova.« / "You're offline. Check your connection and try again." | napaka akcije (brez kod) | FR-002-13 |
| Ogrodje | region | »Obvestila« / "Notifications" (Sonner `customAriaLabel`; `aria-live="polite"`, `aria-relevant="additions text"`) | regija obvestil; vsebuje besedilo »Skupina je ustvarjena.« / "Group created." ali »Podatki skupine so shranjeni.« / "Group details saved." (Sonner, 5 s; posamezno obvestilo nima lastne vloge – research R-11) | FR-002-03, FR-002-11 |
| Ogrodje | button | »Zapri obvestilo« / "Close notification" (Sonner `toastOptions.closeButtonAriaLabel`) | zapre obvestilo | FR-002-03, FR-002-11 |

- Uspeh `PUT` takoj osveži glavo, stranski pas, meni preklopa in naslov strani; naslov strani »Nastavitve – ‹naslov› – Kontakti«.
- Ob `404` na kateremkoli zahtevku skupine (izguba članstva, izbris) vmesnik namesto vsebine izriše `NotFoundPage`.
- Barvni jeziček je 4 px širok navpičen trak v žetonu `bg-group-<ime>` (tinta, mah, opeka, oker, sliva, morje, grafit, rja); nikoli edini nosilec pomena.

### Pokritost zahtev po ravneh testov

| FR-ID | BE unit | BE integracijski / varnostni | FE funkcionalni | E2E |
|---|---|---|---|---|
| FR-002-01 | – | `GroupCreateIT` | `NewGroupDialog.test` | `skupine.spec` |
| FR-002-02 | `GroupInputParserTest` | `GroupCreateIT`, `GroupUpdateIT` | `groupValidation.test`, `NewGroupDialog.test`, `GroupDetailsSection.test` | `skupine.spec` |
| FR-002-03 | `GroupColorTest` | `GroupCreateIT` | `NewGroupDialog.test` | `skupine.spec` |
| FR-002-04 | – | `GroupListIT` | `GroupsPage.test`, `GroupSection.test` | `skupine.spec` |
| FR-002-05 | – | `GroupListIT` | `GroupsPage.test` | `skupine.spec` |
| FR-002-06 | – | `GroupListIT` | `Sidebar.test`, `GroupSwitcher.test` | `skupine.spec` (360/1280 px) |
| FR-002-07 | – | `GroupReadIT`, `GroupIsolationMatrixIT` | `GroupLayout.test` | `skupine.spec` |
| FR-002-08 | – | `GroupReadIT`, `GroupIsolationMatrixIT` | `GroupLayout.test` | `skupine.spec` |
| FR-002-09 | – | – | `GroupsPage.test`, `GroupLayout.test` | `skupine.spec` |
| FR-002-10 | – | `GroupReadIT` | `GroupDetailsSection.test` | `skupine.spec` |
| FR-002-11 | – | `GroupUpdateIT`, `GroupIsolationMatrixIT` | `GroupDetailsSection.test` | `skupine.spec` |
| FR-002-12 | – | `GroupUpdateIT`, `GroupConcurrencyIT` | `client.test`, `conflictMessage.test`, `GroupDetailsSection.test` | `skupine.spec` |
| FR-002-13 | – | – | `client.test`, `NewGroupDialog.test`, `GroupDetailsSection.test`, `GroupsPage.test` | `skupine.spec` (zaledje ni dosegljivo) |

Merljiva merila: SC-002 – `skupine.spec` (100 skupin, < 2 s v brskalniku) in `GroupListIT` (največ 100 na razdelek); SC-003 –
`GroupReadIT`, `GroupIsolationMatrixIT`; SC-004 – `GroupConcurrencyIT`; SC-005 – ročni preizkus (quickstart #11); SC-006 – axe v vseh FE
funkcionalnih testih in E2E v sl in en.

## Project Structure

### Documentation (this feature)

```text
specs/002-skupine/
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
├── src/main/java/si/contactmanager/
│   ├── group/
│   │   ├── GroupController.java            # 4 endpointi (plan.md – REST endpoints)
│   │   ├── GroupService.java               # transakcije: ustvarjanje, urejanje (zaklep vrstice, verzija)
│   │   ├── GroupRepository.java            # JdbcClient; seznam po vlogah, branje, vstavljanje, posodobitev
│   │   ├── GroupAccess.java                # §2.2: članstvo (404), vloga (403), arhiviranost (409) – za vse funkcionalnosti
│   │   ├── GroupInputParser.java           # telo POST/PUT → GroupInput, polja in kode napak
│   │   ├── {Role, GroupColor, GroupInput, GroupDetail, GroupSummary, GroupSections}.java
│   │   └── UserRef.java                    # {name, email} izvajalca
│   ├── account/UserDirectory.java          # javno: id uporabnika iz žetona (find / ensure)
│   └── shared/error/
│       ├── {NotFoundException, ForbiddenException, GroupArchivedException, VersionConflictException}.java
│       └── ApiExceptionHandler.java        # + 404, 403, 409 GROUP_ARCHIVED, 409 VERSION_CONFLICT
├── src/main/resources/db/migration/V3__skupine.sql
└── src/test/java/si/contactmanager/group/
    ├── {GroupInputParserTest, GroupColorTest}.java        # unit
    ├── {GroupCreateIT, GroupListIT, GroupReadIT, GroupUpdateIT, GroupConcurrencyIT}.java  # GroupListIT preveri tudi ICU red (D-28)
    ├── GroupIsolationMatrixIT.java                         # varnostni: matrika 401/404/403/2xx/409
    └── support/GroupFixtures.java                          # ustvarjanje skupin, članov, arhiviranja prek JDBC (003 še ne obstaja; D-27)

frontend/
├── package.json                                    # + sonner
└── src/
    ├── app/App.tsx, app/routes                     # poti / , /groups/:groupId, …/settings; StartPage odstranjen
    ├── features/groups/
    │   ├── api.ts, types.ts, colors.ts, groupValidation.ts
    │   ├── GroupsProvider.tsx, groupsContext.ts    # povzetek za stranski pas in meni (size 10) + osveževanje
    │   ├── GroupsPage.tsx, GroupSection.tsx, SectionPagination.tsx
    │   ├── NewGroupDialog.tsx, GroupFormFields.tsx, ColorPicker.tsx
    │   ├── GroupLayout.tsx, GroupHeader.tsx
    │   ├── SettingsPage.tsx, GroupDetailsSection.tsx, ConflictAlert.tsx, conflictMessage.ts
    │   └── *.test.ts(x)
    ├── shared/layout/{Sidebar, GroupSwitcher}.tsx  # AppShell dobi stranski pas in preklop (+ testi)
    ├── shared/lib/useMediaQuery.ts
    ├── shared/api/client.ts                        # ApiError nosi telo odgovora (errors, current)
    ├── shared/ui/{dialog, sonner}.tsx              # shadcn, prilagojena po design.md 13.4
    ├── i18n/{sl,en}.json                           # ključi groups.*, roles.*, colors.*
    └── test/                                       # MSW obdelovalniki za /api/groups, matchMedia

e2e/
└── tests/skupine.spec.ts                           # + tests/support/groups.ts: skupine prek vmesnika, vloge in arhiviranje
                                                    #   s SQL v bazi Compose (`docker compose exec -T db psql`, D-27)
```

**Structure Decision**: obstoječa struktura iz 000 in 001. Zaledje dobi paket `si.contactmanager.group`; `GroupAccess` je javen,
ker ga bodo uporabljale funkcionalnosti 003–011. Vmesnik dobi `features/groups`; ogrodje (`shared/layout`) dobi stranski pas
in preklop skupine.

## Complexity Tracking

Ni kršitev konstitucije.
