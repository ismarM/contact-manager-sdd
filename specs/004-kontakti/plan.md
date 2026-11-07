# Implementation Plan: Kontakti skupine

**Branch**: `kontakti` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-kontakti/spec.md`

## Summary

Zaledje dobi paket `contact` z endpointi za seznam (paginiran, razvrščen po priimku in imenu po kodnih točkah Unicode, D-38), pogled,
ustvarjanje, urejanje in izbris kontakta ter za predloge značk skupine; podatki so v treh novih tabelah (migracija `V4__kontakti.sql`),
sočasnost rešujeta zaklep vrstice kontakta in verzija (zastarela verzija z enakimi vrednostmi uspe, sicer `409 VERSION_CONFLICT`).
Pravice in izolacijo skupin preverja obstoječi `GroupAccess`; kontakt druge skupine je vedno `404`. Vmesnik dobi zavihek *Kontakti*
(privzeti razdelek skupine), seznam s preglednico/karticami in paginacijo, pogled kontakta (panel ≥ 1280 px, sicer ločena stran), obrazec
za nov kontakt in urejanje (dodatni atributi, kombinirano polje za značke, dialog »Zavržem spremembe?«, razrešitev konflikta) ter
potrditveni dialog za izbris. Odločitve so v [research.md](research.md), podatki v [data-model.md](data-model.md), pogodba v
[contracts/openapi.yaml](contracts/openapi.yaml).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`, Flyway, Jackson `tools.jackson`; vmesnik: `react-router`, `radix-ui` Dialog in DropdownMenu, `sonner`, `@tabler/icons-react`, `react-i18next`) – brez novih knjižnic (R-13)

**Storage**: PostgreSQL 18; nova migracija `V4__kontakti.sql` (`contact`, `contact_attribute`, `contact_tag`)

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: SC-002 – stran seznama (≤ 100 kontaktov) v skupini z 10.000 kontakti < 2 s (p95): `count` + ena poizvedba strani po indeksu + ena za značke strani (R-03, R-04)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, optimistično zaklepanje, barve samo iz žetonov, brez novih odvisnosti

**Scale/Scope**: 17 FR (FR-004-01 … FR-004-17), 6 endpointov, 1 migracija, 4 nove poti, približno 15 novih FE datotek

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-004-01 … FR-004-17 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena. Negativni scenariji iz spec so v testih. |
| II. Test-first | BE: `ContactCreateIT`, `ContactReadIT`, `ContactUpdateIT`, `ContactDeleteIT`, `ContactConcurrencyIT`, `ContactTagSuggestionsIT`, `ContactArchivedRuleIT`, `ContactInputParserTest`, varnostni `ContactIsolationMatrixSecurityIT`. FE: funkcionalni z MSW in `vitest-axe`. E2E `kontakti.spec.ts` pri 360/768/1280 px. Pregled testov opravi agent `pregled-testov` pred kodo. |
| III. Group isolation and roles | Vsi novi endpointi so v matriki izolacije (401/404/403/2xx, arhivirana 409, kontakt druge skupine 404). Preverjanje je v `GroupAccess`, vsaka poizvedba kontakta ima `group_id`. Predlogi značk se berejo samo iz skupine iz poti. |
| IV. Accessible, bilingual, responsive UI | design.md 7.2, 8.2–8.4, 8.6, 8.9, 8.11, 8.13–8.16, 9.3, 9.4; obrazec s povzetkom napak, preglednica z `caption`, kartice pod 640 px vsebnika, dialoga s fokusom na varni izbiri; sl in en; axe v FE in E2E. |
| V. Data integrity | Verzija in zaklep vrstice (R-05); `UNIQUE` na normaliziranem ključu in znački; `CHECK` na dolžine; `ON DELETE CASCADE`; paginacija z deterministično razvrstitvijo (R-03, R-04). |
| VI. Privacy and GDPR | Osebni podatki tretjih oseb so shranjeni samo v skupini in se izbrišejo z njo; `updated_by` `ON DELETE SET NULL` → »izbrisan uporabnik« (012). V dnevnikih ni vsebine kontaktov. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Odločitev: D-39. |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) razvrščanje po kodnih točkah (D-38) je odstopanje od 002/003 (ICU), ki ostaneta nespremenjena; (2) 002/003 dobita prava števila kontaktov (R-12), poti default razdelka *Kontakti* pa spremeni dva testa 002 in tri E2E (D-39); (3) `App` preide na podatkovni usmerjevalnik (R-09).

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/contacts?page=&size= | VIEWER | allowed | 200; telo `ContactPage` | FR-004-06, FR-004-07, FR-004-14 |
| GET | /api/groups/{groupId}/contacts/{contactId} | VIEWER | allowed | 200; telo `ContactDetail` | FR-004-08, FR-004-09, FR-004-14 |
| POST | /api/groups/{groupId}/contacts | EDITOR | rejected (409 GROUP_ARCHIVED; VIEWER 403) | 201; telo `ContactDetail` | FR-004-01, FR-004-02, FR-004-15 |
| PUT | /api/groups/{groupId}/contacts/{contactId} | EDITOR | rejected (409 GROUP_ARCHIVED; VIEWER 403) | 200; telo `ContactDetail` | FR-004-10, FR-004-11, FR-004-13, FR-004-14, FR-004-15 |
| DELETE | /api/groups/{groupId}/contacts/{contactId}?version= | EDITOR | rejected (409 GROUP_ARCHIVED; VIEWER 403) | 204 | FR-004-12, FR-004-13, FR-004-14, FR-004-15 |
| GET | /api/groups/{groupId}/tags?q= | EDITOR | allowed (bralec 403) | 200; telo `TagSuggestions` | FR-004-04 |
| GET | /api/groups (002), /api/groups/archived (003) | — | – | `contactCount` je pravo število kontaktov | FR-002-04, FR-003-07 |

- `size` ∈ {25, 50, 100} (privzeto 25), `page` ≥ 0 (privzeto 0); druga vrednost ali neštevilo → `400 VALIDATION_FAILED` s poljem `size` oziroma `page`; tudi prazna vrednost (`size=`, `page=`) je neštevilo in ne privzeta vrednost (D-43). Stran onkraj zadnje: `200` s praznim `items` in pravilnim `total`.
- `PUT` telo: `ContactInput` + `version`; `DELETE`: `version` v poizvedbi (manjka ali ni število → `400` s poljem `version`, šele po `404`, `403` in `409 GROUP_ARCHIVED`).
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `404` prazno telo (nečlan, neobstoječa skupina ali kontakt, kontakt druge skupine, neveljaven uuid); `403 {"code":"FORBIDDEN"}`; `409 {"code":"GROUP_ARCHIVED"}`; `409 {"code":"VERSION_CONFLICT","current":ContactDetail}`; `400 {"code":"VALIDATION_FAILED","errors":[{field,code}]}`.
- Vrstni red: 401 → 404 (skupina ali kontakt v tej skupini, korak 2 §2.2) → 403 → `GROUP_ARCHIVED` → `VERSION_CONFLICT` → `VALIDATION_FAILED`; zato `PUT`/`DELETE` neobstoječega ali tujega kontakta vrneta `404` tudi bralcu in v arhivirani skupini. Zastarela verzija z vrednostmi, enakimi trenutnim: `200` brez povečanja verzije (Clarifications 2026-11-06). Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Kontakti skupine (seznam; `?page=` 1-osno, `?size=`) | /groups/:groupId/contacts | VIEWER | FR-004-06, FR-004-07 |
| Kontakt – pogled (ločena stran < 1280 px; od 1280 px panel ob seznamu) | /groups/:groupId/contacts/:contactId | VIEWER | FR-004-08, FR-004-09, FR-004-14 |
| Nov kontakt | /groups/:groupId/contacts/new | EDITOR (nižja vloga: razlaga) | FR-004-01 do FR-004-05, FR-004-16, FR-004-17 |
| Uredi kontakt | /groups/:groupId/contacts/:contactId/edit | EDITOR (nižja vloga: razlaga) | FR-004-10, FR-004-11, FR-004-13, FR-004-17 |
| Privzeti razdelek skupine (002) | /groups/:groupId → preusmeritev na /groups/:groupId/contacts | VIEWER | FR-004-06 |

- Poizvedba `page`/`size` se prenaša v poti kontakta (`/contacts/:contactId?page=2&size=50`), zato se vrnitev s strani podrobnosti vrne na isto stran seznama (FR-004-09).
- Naslovi strani (`<title>`, design.md 9): »Kontakti – ‹skupina› – Kontakti«, »‹Ime in priimek› – ‹skupina› – Kontakti«, »Nov kontakt – …«, »Uredi kontakt – …« (en: "Contacts", "New contact", "Edit contact").
- Strežnik vrne `404` za kontakt, do katerega uporabnik nima dostopa, in za izbrisanega – vmesnik ju ne razlikuje (R-08): pod 1280 px stran »Te strani ni« (`NotFoundPage`), od 1280 px seznam ostane in panel pokaže »Tega kontakta ni več – medtem ga je nekdo izbrisal.«

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

Opomba za teste: glava skupine ima `nav` »Razdelki skupine« z novo povezavo *Kontakti* pred *Nastavitve*. Naslov skupine je `h1`, zato so naslovi kontaktov `h2`/`h3`.

#### Seznam kontaktov

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Glava skupine | link | »Kontakti« / "Contacts" | odpre `/groups/:id/contacts` (`aria-current="page"` na seznamu in pogledih kontakta) | FR-004-06 |
| Seznam | heading (level 2) | »Kontakti« / "Contacts" | naslov seznama; fokus po menjavi strani | FR-004-06 |
| Seznam | link | »Nov kontakt« / "New contact" | odpre `/contacts/new`; samo EDITOR+ v nearhivirani skupini | FR-004-07, FR-004-17 |
| Seznam | region (tabindex 0) | »Kontakti skupine Projekt FERI« / "Contacts of group Projekt FERI" | ovojnica preglednice | FR-004-06 |
| Seznam | table (caption = ime regije) | »Kontakti skupine Projekt FERI« / "Contacts of group Projekt FERI" | preglednica | FR-004-06 |
| Seznam | columnheader | »Ime in priimek« / "Name", »E-naslov« / "Email", »Telefon« / "Phone", »Značke« / "Tags" | glave stolpcev; peti stolpec »Dejanja« / "Actions" (vizualno skrita glava) samo EDITOR+ v nearhivirani skupini | FR-004-06, FR-004-17 |
| Seznam | rowheader > link | prikazno ime (npr. »Janez Novak«) | povezava na `/contacts/:id` (+ poizvedba) | FR-004-06, FR-004-09 |
| Seznam | cell | e-naslov, telefon; značke: največ tri v vrstnem redu vnosa in »+N« | vsebina vrstice | FR-004-06 |
| Seznam | button | »Dejanja za Janez Novak« / "Actions for Janez Novak" | odpre meni vrstice; samo EDITOR+ v nearhivirani skupini | FR-004-12, FR-004-17 |
| Meni vrstice | menuitem | »Uredi kontakt« / "Edit contact" (povezava), »Izbriši kontakt« / "Delete contact" | dejanja vrstice | FR-004-10, FR-004-12 |
| Seznam | navigation | »Strani rezultatov« / "Result pages" | paginacija: `status` »1–25 od 60« / "1–25 of 60", gumba »Prejšnja« / »Naslednja« (Previous / Next), `combobox` »Velikost strani« / "Page size"; vidna, ko je skupnih kontaktov več kot 0 | FR-004-06 |
| Seznam | heading (level 3) | »Ta skupina še nima kontaktov.« / "This group has no contacts yet." | prazno stanje (z linkom *Nov kontakt* samo EDITOR+ v nearhivirani skupini) | FR-004-07 |
| Seznam | status | »Nalagam…« / "Loading…" | nalaganje | FR-004-06 |
| Seznam | alert + button | »Kontaktov ni bilo mogoče naložiti. Poskusi znova.« / "Contacts could not be loaded. Please try again." + »Poskusi znova« / "Try again" | napaka nalaganja | FR-004-16 |
| Seznam | alert | »Kontakt je medtem spremenil(a) ‹ime› ob ‹čas›.« / "The contact was changed by ‹name› at ‹time› in the meantime." | konflikt pri izbrisu iz vrstice | FR-004-12 |
| Seznam | alert | »Tega kontakta ni več – medtem ga je nekdo izbrisal.« / "This contact no longer exists – someone deleted it in the meantime." | izbris iz vrstice, ki je že izbrisan | FR-004-13 |
| Ogrodje | region »Obvestila« | »Kontakt Janez Novak je shranjen.« / "Contact Janez Novak saved."; »Kontakt Janez Novak je izbrisan.« / "Contact Janez Novak deleted." | obvestila uspeha | FR-004-16 |

#### Pogled kontakta (stran ali panel)

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Panel (≥ 1280 px) | region | »Podrobnosti kontakta« / "Contact details" | panel desno od seznama (400 px) | FR-004-09 |
| Pogled | heading (level 2) | prikazno ime | naslov kontakta | FR-004-08 |
| Pogled | term / definition | »Naslov« / "Address", »E-naslov« / "Email", »Telefon« / "Phone" | seznam opredelitev; polja brez vrednosti se ne izrišejo | FR-004-08 |
| Pogled | link | e-naslov (`mailto:`), telefon (`tel:`, samo števke in `+`) | povezavi | FR-004-08 |
| Pogled | heading (level 3) + term / definition | »Dodatni atributi« / "Additional attributes"; ključ / vrednost | seznam opredelitev (Mono); razdelek se ne izriše brez atributov | FR-004-08 |
| Pogled | heading (level 3) + list | »Značke« / "Tags"; ena `listitem` na značko | vse značke; razdelek se ne izriše brez značk | FR-004-08 |
| Pogled | link | »Uredi kontakt« / "Edit contact" | odpre `/contacts/:id/edit`; samo EDITOR+ v nearhivirani skupini | FR-004-10, FR-004-17 |
| Pogled | button | »Izbriši kontakt« / "Delete contact" | odpre potrditveni dialog; samo EDITOR+ v nearhivirani skupini | FR-004-12, FR-004-17 |
| Pogled (< 1280 px) | link | »Nazaj na seznam kontaktov« / "Back to contacts" | vrne na isto stran seznama | FR-004-09 |
| Panel | link | »Zapri podrobnosti« / "Close details" | odpre seznam brez izbranega kontakta | FR-004-09 |
| Pogled | status | »Nalagam…« / "Loading…" | nalaganje | FR-004-08 |
| Pogled / panel | alert + button | »Kontakta ni bilo mogoče naložiti. Poskusi znova.« / "The contact could not be loaded. Please try again." + »Poskusi znova« | napaka nalaganja | FR-004-16 |
| Panel | text (v regiji) | »Tega kontakta ni več – medtem ga je nekdo izbrisal.« / "This contact no longer exists – someone deleted it in the meantime." | 404 v panelu (R-08) | FR-004-13, FR-004-14 |
| Pogled (stran) | heading (level 1) | »Te strani ni« / "This page does not exist" | `NotFoundPage` (001) pod 1280 px | FR-004-14 |
| Dialog izbrisa | dialog | »Izbrišem kontakt Janez Novak?« / "Delete contact Janez Novak?" | potrditev; fokus ob odprtju na »Prekliči« | FR-004-12 |
| Dialog izbrisa | text, button | »Kontakt bo odstranjen iz skupine Projekt FERI.« / "The contact will be removed from the group Projekt FERI."; »Prekliči« / "Cancel", »Izbriši kontakt« / "Delete contact" | posledica, gumba | FR-004-12 |
| Dialog izbrisa | alert | »Kontakta ni bilo mogoče izbrisati. Poskusi znova.« / "The contact could not be deleted. Please try again."; »Ni povezave. Preveri povezavo in poskusi znova.«; »Za to dejanje nimaš več pravic.«; »Skupina je arhivirana – kontaktov ni mogoče spreminjati.« | napaka izbrisa v dialogu | FR-004-12, FR-004-16 |
| Pogled | alert | »Kontakt je medtem spremenil(a) ‹ime› ob ‹čas›.« + osvežen pogled | konflikt pri izbrisu iz pogleda (dialog se zapre) | FR-004-12 |
| Pogled | alert | »Tega kontakta ni več – medtem ga je nekdo izbrisal.« + seznam se osveži | izbris izbrisanega; vmesnik se vrne na seznam (`/groups/:groupId/contacts` z ohranjeno stranjo in velikostjo) – na ločeni strani in v panelu (≥ 1280 px) | FR-004-13 |

#### Obrazec (nov kontakt in urejanje)

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Obrazec | heading (level 2) | »Nov kontakt« / "New contact"; »Uredi kontakt« / "Edit contact" | naslov | FR-004-01, FR-004-10 |
| Obrazec | form | ime = naslov | obrazec | FR-004-01 |
| Obrazec | group | »Osnovni podatki« / "Basic details", »Dodatni atributi« / "Additional attributes", »Značke« / "Tags" | `fieldset` z `legend` | FR-004-03 |
| Osnovni podatki | textbox | »Ime« / "First name", »Priimek« / "Last name", »Naslov« / "Address" (`textarea`), »E-naslov« / "Email" (`type=email`), »Telefon« / "Phone" (`type=tel`) | polja z vidnimi oznakami | FR-004-01, FR-004-02 |
| Osnovni podatki | text (`aria-describedby`, polje `aria-invalid`) | »Vpiši vsaj ime ali priimek.« / "Enter at least a first or last name."; »Vpiši veljaven e-naslov.« / "Enter a valid email address."; »Telefon sme vsebovati samo števke, presledke in znake + - ( ) /.« / "Phone may contain only digits, spaces and + - ( ) / characters."; »Ime je predolgo (največ 100 znakov).« / "The first name is too long (at most 100 characters)." idr. (priimek 100, naslov 300, e-naslov 254, telefon 30) | napake ob poljih | FR-004-02, FR-004-03 |
| Dodatni atributi | textbox | »Ključ« / "Key", »Vrednost« / "Value" (po en par na vrstico, vrstni red vnosa) | polja atributa | FR-004-03 |
| Dodatni atributi | button | »Dodaj atribut« / "Add attribute" | doda vrstico in premakne fokus v novo polje *Ključ*; pri 50 atributih napaka ob gumbu | FR-004-03 |
| Dodatni atributi | button | »Odstrani atribut kompetenca« / "Remove attribute kompetenca" (pri praznem ključu »Odstrani atribut« / "Remove attribute") | odstrani vrstico | FR-004-03 |
| Dodatni atributi | text | »Ključ že obstaja v tem kontaktu.« / "This key already exists in this contact."; »Ključ je rezerviran za predefinirano polje.« / "This key is reserved for a predefined field."; »Vpiši ključ.« / "Enter a key."; »Vpiši vrednost.« / "Enter a value."; »Dodaš lahko največ 50 atributov.« / "You can add at most 50 attributes." | napake ob poljih atributa | FR-004-02, FR-004-03 |
| Značke | combobox | »Dodaj značko« / "Add tag" | vnos značke; predlogi so `option` v `listbox`; *Enter* ali vejica doda | FR-004-04 |
| Značke | list > listitem + button | seznam »Dodane značke« / "Added tags"; »Odstrani značko vip« / "Remove tag vip" | dodane značke | FR-004-04 |
| Značke | text | »Značka ne sme vsebovati presledkov.« / "A tag must not contain spaces."; »Ta značka je že dodana.« / "This tag is already added."; »Dodaš lahko največ 30 značk.« / "You can add at most 30 tags."; »Značka je predolga (največ 50 znakov).« / "The tag is too long (at most 50 characters)." | napake ob polju za značke | FR-004-02, FR-004-04 |
| Obrazec | alert | »Obrazec vsebuje napake.« / "The form contains errors." + povezave na polja (ime = besedilo napake) | povzetek napak nad obrazcem; fokus nanj | FR-004-03 |
| Obrazec | button | »Shrani kontakt« / "Save contact", »Prekliči« / "Cancel" | oddaja, preklic | FR-004-01, FR-004-05 |
| Obrazec | dialog | »Zavržem spremembe?« / "Discard changes?" | ob preklicu ali navigaciji z neshranjenimi spremembami; fokus na »Nadaljuj z urejanjem« / "Keep editing"; drugi gumb »Zavrzi spremembe« / "Discard changes" | FR-004-05 |
| Obrazec | alert + button | »Kontakta ni bilo mogoče shraniti. Poskusi znova.« / "The contact could not be saved. Please try again."; »Ni povezave. Preveri povezavo in poskusi znova.«; »Za to dejanje nimaš več pravic.« + »Poskusi znova« / "Try again" | trajna napaka nad obrazcem | FR-004-16 |
| Obrazec | alert | »Skupina je arhivirana – kontaktov ni mogoče spreminjati.« / "The group is archived – contacts cannot be changed." | `409 GROUP_ARCHIVED` ob oddaji; obrazec ostane | FR-004-15, FR-004-17 |
| Obrazec (urejanje) | alert | »Kontakt je medtem spremenil(a) ‹ime› ob ‹čas›.« / "The contact was changed by ‹name› at ‹time› in the meantime." (»izbrisan uporabnik« / "deleted user") | konflikt; ‹čas› kot v 002: ura in minuta v zapisu jezika, pred njo datum (`dateStyle: medium`), če sprememba ni bila danes | FR-004-11 |
| Konflikt | button | »Prikaži razlike« / "Show differences", »Uporabi trenutno različico« / "Use current version", »Shrani moje spremembe« / "Save my changes" | razrešitev | FR-004-11 |
| Konflikt | table (caption) + columnheader + rowheader | »Razlike med tvojimi in trenutnimi vrednostmi« / "Differences between your and the current values"; »Polje« / "Field", »Tvoja vrednost« / "Your value", »Trenutna vrednost« / "Current value" | razlike samo za polja, ki se razlikujejo; ime polja v vsaki vrstici je `rowheader` (npr. »Priimek«, »Dodatni atributi«, »Značke«); vrstice so v vrstnem redu obrazca: Ime, Priimek, Naslov, E-naslov, Telefon, Dodatni atributi, Značke (D-43) | FR-004-11 |
| Obrazec (urejanje) | alert + link | »Tega kontakta ni več – medtem ga je nekdo izbrisal.« / "This contact no longer exists – someone deleted it in the meantime." + »Nazaj na seznam kontaktov« | 404 ob oddaji; obrazec ostane z vnesenimi podatki | FR-004-13 |
| Pot obrazca (bralec) | text + link | »Za urejanje kontaktov potrebuješ vlogo urednik ali višjo.« / "You need the editor role or higher to edit contacts." + »Nazaj na seznam kontaktov« | namesto obrazca | FR-004-17 |
| Pot obrazca (arhivirana skupina) | text + link | »Skupina je arhivirana – kontaktov ni mogoče spreminjati.« + »Nazaj na seznam kontaktov« | namesto obrazca | FR-004-17 |

- Preverjanje ob zapustitvi polja (`blur`), ne med tipkanjem; napaka izgine, ko jo uporabnik začne popravljati (design.md 8.2).
- Besedila napak strežnika (`field`/`code`) vmesnik preslika v ista sporočila ob poljih.
- Gumb *Izbriši kontakt* je lahko hkrati v pogledu in (v panelu) ob seznamu; testi uporabijo `within(region »Podrobnosti kontakta«)` oziroma `within(main)`.

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-004-01 | `ContactCreateIT`, `ContactIsolationMatrixSecurityIT` | `ContactForm.test` | `kontakti.spec` |
| FR-004-02 | `ContactInputParserTest`, `ContactCreateIT`, `ContactUpdateIT` | `ContactForm.test` | `kontakti.spec` |
| FR-004-03 | – | `ContactForm.test` | `kontakti.spec` |
| FR-004-04 | `ContactTagSuggestionsIT`, `ContactIsolationMatrixSecurityIT` | `ContactTags.test` | `kontakti.spec` |
| FR-004-05 | – | `ContactFormGuard.test` | `kontakti.spec` |
| FR-004-06 | `ContactReadIT` | `ContactsPage.test` | `kontakti.spec` |
| FR-004-07 | `ContactReadIT` | `ContactsPage.test`, `ContactPermissions.test` | `kontakti.spec` |
| FR-004-08 | `ContactReadIT` | `ContactView.test` | `kontakti.spec` |
| FR-004-09 | – | `ContactPanel.test` | `kontakti.spec` |
| FR-004-10 | `ContactUpdateIT` | `ContactEdit.test` | `kontakti.spec` |
| FR-004-11 | `ContactUpdateIT`, `ContactConcurrencyIT` | `ContactConflict.test` | `kontakti.spec` |
| FR-004-12 | `ContactDeleteIT`, `ContactConcurrencyIT` | `ContactDelete.test` | `kontakti.spec` |
| FR-004-13 | `ContactUpdateIT`, `ContactDeleteIT` | `ContactEdit.test`, `ContactDelete.test` | `kontakti.spec` |
| FR-004-14 | `ContactIsolationMatrixSecurityIT` | `ContactView.test`, `ContactPanel.test` | `kontakti.spec` |
| FR-004-15 | `ContactArchivedRuleIT`, `ContactIsolationMatrixSecurityIT` | `ContactPermissions.test` | `kontakti.spec` |
| FR-004-16 | – | `ContactForm.test`, `ContactDelete.test`, `ContactsPage.test` | `kontakti.spec` |
| FR-004-17 | – | `ContactPermissions.test` | `kontakti.spec` |

Merljiva merila: SC-001 – `kontakti.spec` (samo tipkovnica); SC-002 – `ContactReadIT` (10.000 kontaktov, meja 2 s); SC-003 – `ContactIsolationMatrixSecurityIT`; SC-004 – `ContactConcurrencyIT`, `ContactConflict.test`; SC-005 – `ContactPanel.test`, `kontakti.spec`; SC-006 – axe v vseh FE testih in E2E pri 360, 768 in 1280 px.

## Project Structure

### Documentation (this feature)

```text
specs/004-kontakti/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/resources/db/migration/V4__kontakti.sql
backend/src/main/java/si/contactmanager/
├── contact/
│   ├── ContactController.java      # 6 endpointov; GroupAccess.require(…); parser → service
│   ├── ContactService.java         # transakcije: zaklep skupine (FOR SHARE) → kontakt (FOR UPDATE), verzija, primerjava
│   ├── ContactRepository.java      # contact, contact_attribute, contact_tag; page, count, tagSuggestions
│   ├── ContactInput.java · ContactInputParser.java   # razčlenitev, obrez, napake po poljih (R-06)
│   └── {ContactDetail, ContactSummary, ContactPage, Attribute, TagSuggestions}.java
├── group/GroupRepository.java      # contactCount (R-12)
backend/src/test/java/si/contactmanager/contact/
├── {ContactCreateIT, ContactReadIT, ContactUpdateIT, ContactDeleteIT, ContactConcurrencyIT, ContactTagSuggestionsIT, ContactArchivedRuleIT}.java
├── ContactInputParserTest.java · ContactIsolationMatrixSecurityIT.java
└── support/ContactFixtures.java

frontend/src/
├── app/App.tsx                     # podatkovni usmerjevalnik (R-09)
├── features/contacts/
│   ├── api.ts, types.ts, validation.ts, messages.ts (preslikava napak)
│   ├── ContactsPage.tsx (+ ContactTable.tsx, RowActions.tsx), ContactView.tsx, ContactPanel.tsx
│   ├── ContactFormPage.tsx, ContactForm.tsx, AttributeRows.tsx, TagInput.tsx, ConflictAlert.tsx, DiscardDialog.tsx
│   ├── DeleteContactDialog.tsx, ContactsRoutes.tsx, contactsContext.ts
│   └── *.test.tsx
├── features/groups/{GroupLayout, GroupHeader}.tsx  # razdelek contacts + privzeti razdelek
├── i18n/{sl,en}.json               # contacts.*, title.*
├── shared/lib/useMediaQuery.ts     # + PANEL (1280 px)
└── test/{contactsApi.ts, viewport.ts}   # MSW rokovalniki, širina ≥ 1280 px

e2e/tests/kontakti.spec.ts · e2e/tests/support/contacts.ts
```

**Structure Decision**: obstoječa struktura iz 000–003; nov paket `contact` (BE) in `features/contacts` (FE).

## Complexity Tracking

Ni kršitev konstitucije. Namerna odstopanja: razvrščanje po kodnih točkah (D-38), podatkovni usmerjevalnik namesto `BrowserRouter` (R-09, nujen za blokiranje navigacije).
