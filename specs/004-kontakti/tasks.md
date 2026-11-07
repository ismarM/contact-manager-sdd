---

description: "Tasks for 004-kontakti (tests mandatory, independent test review)"
---

# Tasks: Kontakti skupine

**Input**: `specs/004-kontakti/` – spec.md, plan.md (*Public Interfaces*), research.md (R-01 … R-13), data-model.md,
contracts/openapi.yaml, quickstart.md; odločitve D-38, D-39

**Tests**: obvezni (konstitucija II). Vsak FR-004-01 … FR-004-17 ima vsaj eno testno nalogo. Testi pred kodo, nato pregled
neodvisnega agenta `pregled-testov` (workflow.md §4.2).

**Organization**: Setup → Foundational → Tests → Test review → US1 … US5 → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Imena endpointov, poti, dostopnih imen in sporočil so **samo** iz plan.md (*Public Interfaces*).
- Testi nosijo FR-ID (`@Tag("FR-004-04")`; Vitest/Playwright v imenu testa `"FR-004-04: …"`).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] FR-004-01 … FR-004-17 i18n ključi za vsa besedila, dostopna imena, naslove strani in obvestila iz plan.md (*Key elements and accessible names*) v frontend/src/i18n/sl.json in en.json (`contacts.list.*`, `contacts.view.*`, `contacts.form.*`, `contacts.errors.*`, `contacts.conflict.*`, `contacts.delete.*`, `contacts.discard.*`, `contacts.toast.*`, `groups.header.contacts`, `title.contacts*`); ista drevesa ključev v obeh jezikih
- [X] T002 [P] FR-004-01 FR-004-06 FR-004-10 FR-004-12 FR-004-14 Podpora BE testom: backend/src/test/java/si/contactmanager/contact/support/ContactFixtures.java – `insert(groupId, firstName, lastName, …)` (SQL, vrne id), `insertMany(groupId, count)`, `withAttribute`, `withTag`, `exists(contactId)`, `version(contactId)`, `row(contactId)`, `tagsOf`, `attributesOf`
- [X] T003 [P] FR-004-06 FR-004-09 FR-004-17 Podpora FE testom: frontend/src/test/contactsApi.ts – `contactDetail(overrides)`, `contactSummary(n, overrides)`, `mockContactsApi({ list, get, create, update, remove, tags })` (zabeleži zahtevke, privzeto prazen seznam, `404` za branje, `201`/`200`/`204`), `renderContactsApp(path, handlers)`; frontend/src/test/viewport.ts – `setViewport('panel')` (≥ 1280 px, implicira `wide`) in poizvedba `(min-width: 1280px)`
- [X] T004 [P] FR-004-01 FR-004-14 FR-004-15 Podpora E2E: e2e/tests/support/contacts.ts – `createContact(groupId, …)` (SQL), `contactCount`, `contactExists`, `contactVersion`, `setContactField` (simulacija sočasne spremembe)

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [X] T005 FR-004-01 … FR-004-15 Ogrodje BE: backend/src/main/resources/db/migration/V4__kontakti.sql po data-model.md (`contact`, `contact_attribute`, `contact_tag`, indeksa, `UNIQUE`, `CHECK`, `ON DELETE CASCADE`, `sort_last`/`sort_first` `COLLATE "C"`); backend/src/main/java/si/contactmanager/contact/: zapisi `ContactInput`, `ContactDetail`, `ContactSummary`, `ContactPage`, `Attribute`, `TagSuggestions`; `ContactInputParser` (public, enaka oblika kot `GroupInputParser`: `parseCreate`, `parseUpdate`, `Parsed(input, version, errors)`) z ogrodjem, ki vrne prazen rezultat; `ContactController` s 6 endpointi (poti iz plan.md), ki vsi vrnejo `501`
- [X] T006 [P] FR-004-06 FR-004-08 FR-004-01 FR-004-10 Ogrodje FE: frontend/src/features/contacts/types.ts, api.ts (funkcije vržejo `Error('not implemented')`), prazne komponente `ContactsPage`, `ContactView`, `ContactFormPage`, `DeleteContactDialog`; v `GroupLayout` razdelek `contacts` z njimi na poteh iz plan.md (privzeti razdelek ostane `settings`, dokler ne pride koda)

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja (`501`, prazna stran, `not implemented`).

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje – enotni, integracijski in varnostni

- [X] T007 [P] [US2] FR-004-02 backend/src/test/java/si/contactmanager/contact/ContactInputParserTest.java: ime/priimek obrezana, prazna → `null`, vsaj eno obvezno (`REQUIRED` na obeh poljih), 100 znakov OK / 101 `TOO_LONG` (kodne točke), naslov 300/301, večvrstični naslov; e-naslov veljaven / »janez@« / brez domene / 254 / 255 znakov; telefon »+386 (1) 234-56/7« OK, »01 234 abc« `INVALID_VALUE`, 30/31; atributi: ključ 1–50, vrednost 1–500, podvojen ključ ne glede na velikost črk `DUPLICATE` (na drugi vrstici), rezervirani ključi (»Telefon«, »phone«, »E-NASLOV«, »first  name«) `RESERVED_KEY`, prazna vrstica (ključ in vrednost) prezrta, vrstica z enim praznim poljem `REQUIRED`, 50 OK / 51 `TOO_MANY`; značke: 1–50, presledek (tudi tabulator) `INVALID_VALUE`, podvojena ne glede na velikost črk `DUPLICATE`, 30 OK / 31 `TOO_MANY`, različni velikosti črk dveh kontaktov dovoljeni; neznano polje `UNKNOWN_FIELD`; pokvarjen JSON `MALFORMED`; `version` obvezen samo pri `parseUpdate`
- [X] T008 [P] [US2] FR-004-01 FR-004-02 FR-004-14 backend/src/test/java/si/contactmanager/contact/ContactCreateIT.java: urednik `POST` → `201`, kontakt v tej skupini (`group_id`), `version` 0, `updatedBy` urednik, atributi in značke v vrstnem redu vnosa, `displayName`; samo ime / samo priimek; vrednosti obrezane, prazna neobvezna polja `null`; brez imena in priimka → `400 VALIDATION_FAILED` z napakama `firstName` in `lastName`, nič shranjeno; podvojen ključ → `400` s poljem `attributes[1].key`; neveljaven e-naslov, telefon, značka s presledkom → `400` z imenom polja; 51 atributov, 31 značk → `400`; kontakt druge skupine se ne pojavi; vsi nepravilni primeri ne spremenijo števila vrstic
- [X] T009 [P] [US1] FR-004-06 FR-004-07 FR-004-08 FR-004-14 backend/src/test/java/si/contactmanager/contact/ContactReadIT.java: 60 kontaktov → `size` privzeto 25: `items.length 25`, `total 60`, vrstni red priimek, ime (po kodnih točkah, ne glede na velikost črk: »Čeh« za »Zupan«, »abc« pred »Bcd«, brez priimka na koncu, nato po imenu; enak priimek in ime po času ustvarjanja); `size=50&page=1` → 10 kontaktov; strani 0–2 zaporedoma ne ponovijo ali izpustijo kontakta; `page` onkraj zadnje → prazen `items` in `total 60`; `size=10`, `size=abc`, `page=-1` → `400`; polja `ContactSummary` (`displayName`, `tags` v vrstnem redu vnosa, `version`); bralec in člani arhivirane skupine berejo (`200`); `GET …/contacts/{id}` vrne vsa polja (naslov, atributi v vrstnem redu, značke, `updatedAt`, `updatedBy`); `updatedBy` `null`, ko je uporabnik izbrisal račun; kontakt druge skupine pod potjo moje skupine in neveljaven uuid → `404`; prazna skupina → `total 0`; `contactCount` v `GET /api/groups` in `GET /api/groups/archived` je število kontaktov; SC-002: skupina z 10.000 kontakti, stran s 100 kontakti < 2 s (mediana petih klicev)
- [X] T010 [P] [US3] FR-004-02 FR-004-10 FR-004-11 FR-004-13 backend/src/test/java/si/contactmanager/contact/ContactUpdateIT.java: `PUT` s trenutno verzijo in spremembo → `200`, `version + 1`, `updatedBy`/`updatedAt` posodobljena, spremenjen telefon, odstranjena značka, spremenjen vrstni red atributov; nespremenjeni podatki (tudi samo drugačni presledki ob robovih) → `200`, verzija, `updatedAt`, `updatedBy` nespremenjeni; zastarela verzija z različnimi vrednostmi → `409 VERSION_CONFLICT` s `current` (vrednosti drugega urednika, `updatedBy`, `updatedAt`), kontakt nespremenjen; **zastarela verzija z vrednostmi, enakimi trenutnim → `200` brez povečanja verzije** (Clarifications 2026-11-06); zastarela verzija z neveljavnimi podatki → `409`; trenutna verzija z neveljavnimi podatki → `400`, nič spremenjeno; manjkajoča ali neštevilska `version` → `400` s poljem `version`; izbrisan kontakt → `404`, ne ustvari se znova; kontakt druge skupine → `404`, nespremenjen
- [X] T011 [P] [US4] FR-004-12 FR-004-13 backend/src/test/java/si/contactmanager/contact/ContactDeleteIT.java: `DELETE …?version=n` s trenutno verzijo → `204`, vrstice v `contact`, `contact_attribute`, `contact_tag` izbrisane, drugi kontakti nedotaknjeni; zastarela verzija → `409 VERSION_CONFLICT` s `current`, kontakt obstaja; manjkajoč ali neveljaven `version` → `400`; že izbrisan → `404`; kontakt druge skupine → `404`, obstaja; izbris skupine (003) izbriše tudi njene kontakte
- [X] T012 [P] [US3] [US4] FR-004-11 FR-004-12 backend/src/test/java/si/contactmanager/contact/ContactConcurrencyIT.java: dva sočasna `PUT` z isto verzijo in različnima vrednostma → natanko en `200` in en `409 VERSION_CONFLICT`, verzija +1; `PUT` in `DELETE` iste verzije → ali `PUT` uspe in `DELETE` `409`, ali `DELETE` uspe in `PUT` `404`, nikoli ponovno ustvarjen kontakt; dva sočasna `DELETE` → en `204`, en `404`; sočasno arhiviranje skupine (003) in `PUT` → `PUT` uspe pred arhiviranjem ali `409 GROUP_ARCHIVED`, nikoli sprememba v arhivirani skupini; ponovljeno 10-krat
- [X] T013 [P] [US2] FR-004-04 backend/src/test/java/si/contactmanager/contact/ContactTagSuggestionsIT.java: skupina A z `vip`, `VIP2`, `ne_obveščaj`, skupina B s `tajno`: `GET …/tags?q=v` v A → `vip`, `VIP2` (brez ne glede na velikost črk podvojenih, razvrščeno), nikoli `tajno`; `q=t` v A → prazno; brez `q` → največ 20 različnih; značka, ki se razlikuje samo po velikosti črk, je ena (obstoječa oblika); uporabnik skupine A in B dobi za vsako skupino samo njene značke; po izbrisu zadnjega kontakta z značko je predlog izginil
- [X] T014 [P] [US5] FR-004-15 backend/src/test/java/si/contactmanager/contact/ContactArchivedRuleIT.java: v arhivirani skupini lastnik/admin/urednik `POST`/`PUT`/`DELETE` → `409 GROUP_ARCHIVED`, število in vrednosti kontaktov nespremenjeni; VIEWER → `403`; vsi člani `GET` seznam in kontakt → `200`; po odarhiviranju `POST` spet uspe; trajno arhivirana skupina: urednik/admin `409`, bralec `403`, branje `200`
- [X] T015 [P] [US1] [US2] [US3] [US4] FR-004-01 FR-004-04 FR-004-06 FR-004-08 FR-004-10 FR-004-12 FR-004-14 FR-004-15 backend/src/test/java/si/contactmanager/contact/ContactIsolationMatrixSecurityIT.java (parametriziran, workflow.md §2.5): vseh 6 endpointov × {brez glave, pokvarjen žeton, potekel žeton → `401 UNAUTHENTICATED`; nečlan → `404` prazno telo; VIEWER/EDITOR/ADMIN/OWNER: branje `200`, pisanje VIEWER `403`, EDITOR+ `2xx`; predlogi značk VIEWER `403`; arhivirana: pisanje EDITOR+ `409 GROUP_ARCHIVED`, VIEWER `403`, branje `200`; kontakt skupine B pod potjo skupine A (član obeh, vsaka vloga): `GET`, `PUT`, `DELETE` → `404`, nespremenjen}; nobena zavrnitev ne spremeni stanja

### Vmesnik – funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel z imeni iz plan.md)

- [X] T016 [P] [US1] FR-004-06 FR-004-07 FR-004-16 frontend/src/features/contacts/ContactsPage.test.tsx: bralec odpre `/groups/<id>/contacts` → `link` v glavi »Kontakti« z `aria-current`, `heading` level 2 »Kontakti«, naslov strani »Kontakti – Projekt FERI – Kontakti" (en "Contacts – …"), `table` s `caption`, `columnheader` »Ime in priimek«, »E-naslov«, »Telefon«, »Značke« (brez »Dejanja«), vrstice z `rowheader` > `link` na `/contacts/<id>`, prvih 25 vrstic, `status` »1–25 od 60«; značke: kontakt s petimi → prve tri in »+2«; MSW zahtevek `page=0&size=25`; *Naslednja* → `?page=2` v naslovu poti; velikost 50 + naslednja → `?page=2&size=50` in `status` »51–60 od 60«, zahtevek `page=1&size=50`; osvežitev (ponovni izris na isti poti) ohrani stran; stran onkraj zadnje (`total` 60, prazen `items`) → preusmeritev na zadnjo obstoječo stran; po menjavi strani je fokus na `heading` »Kontakti«; prazna skupina: `heading` level 3 »Ta skupina še nima kontaktov.«, urednik ima `link` »Nov kontakt« (v glavi in praznem stanju), bralec in člani arhivirane skupine ne; nalaganje `status` »Nalagam…«; napaka `alert` »Kontaktov ni bilo mogoče naložiti. Poskusi znova.« + *Poskusi znova* ponovi zahtevek; axe v sl in en
- [X] T017 [P] [US1] FR-004-08 FR-004-14 FR-004-16 frontend/src/features/contacts/ContactView.test.tsx: pod 1280 px `/groups/<id>/contacts/<cid>` → `heading` level 2 z imenom in priimkom, `term` »Naslov«, »E-naslov«, »Telefon« z `definition`, `link` e-naslov (`href` `mailto:`), `link` telefon (`href` `tel:+38612345678`), `heading` level 3 »Dodatni atributi« z `term`/`definition` v vrstnem redu, `heading` »Značke« in `list` z vsemi značkami; kontakt brez naslova/telefona nima teh polj; kontakt brez atributov in značk nima razdelkov; bralec nima `link` »Uredi kontakt« in `button` »Izbriši kontakt«, `link` »Nazaj na seznam kontaktov« vodi na `?page=2&size=50`, če je bil odprt s tem naslovom; `404` → »Te strani ni« (`heading` level 1 in `link` »Na seznam skupin«), brez podatkov; napaka nalaganja `alert` + *Poskusi znova*; axe v sl in en
- [X] T018 [P] [US1] FR-004-09 FR-004-14 frontend/src/features/contacts/ContactPanel.test.tsx: `setViewport('panel')`: izbira kontakta (klik na `link` v vrstici) → naslov poti `/contacts/<cid>`, `region` »Podrobnosti kontakta« desno od seznama (seznam ostane, `table` še vedno prisoten), `link` »Zapri podrobnosti« vodi na seznam; osvežitev na tej poti → isti kontakt izbran; panel se ob menjavi izbire posodobi; `404` kontakta → `region` z besedilom »Tega kontakta ni več – medtem ga je nekdo izbrisal.«, seznam ostane; pod 1280 px (`wide`) klik odpre ločeno stran brez seznama (brez `table`); axe
- [X] T019 [P] [US2] FR-004-01 FR-004-02 FR-004-03 FR-004-16 frontend/src/features/contacts/ContactForm.test.tsx: `/contacts/new` urednik → `heading` »Nov kontakt«, `form`, `group` »Osnovni podatki«, »Dodatni atributi«, »Značke«, `textbox` »Ime«, »Priimek«, »Naslov«, »E-naslov«, »Telefon«; izpolni ime, priimek, e-naslov, atribut (»Dodaj atribut« → fokus v novem polju »Ključ«), znački → *Shrani kontakt* → `POST` telo (`firstName`, `attributes`, `tags`) → preusmeritev na `/contacts/<novi id>` s pogledom, obvestilo »Kontakt Janez Novak je shranjen.«; prazno ime in priimek → `alert` »Obrazec vsebuje napake.« s povezavo »Vpiši vsaj ime ali priimek.«, fokus na povzetku, brez zahtevka; neveljaven e-naslov: napaka se pokaže šele ob zapustitvi polja (ne med tipkanjem) in izgine ob popravljanju, `aria-invalid`, `aria-describedby`; neveljaven telefon; ključ »Telefon« → »Ključ je rezerviran za predefinirano polje.«; podvojen ključ ne glede na velikost črk → napaka ob drugem »Ključ«; vrstica z enim praznim poljem → napaka, popolnoma prazna vrstica se ne pošlje; »Odstrani atribut kompetenca« odstrani vrstico; 50 atributov → napaka ob »Dodaj atribut«; strežnik `400` z napakami po poljih se prikaže ob poljih; strežnik `500` / brez povezave → `alert` »Kontakta ni bilo mogoče shraniti. Poskusi znova.« oziroma »Ni povezave. …« z gumbom *Poskusi znova*, vneseni podatki ostanejo, ponovitev pošlje enako telo; axe v sl in en
- [X] T020 [P] [US2] FR-004-04 frontend/src/features/contacts/ContactTags.test.tsx: `combobox` »Dodaj značko«: vpis »v« → zahtevek `GET /api/groups/<id>/tags?q=v`, `listbox` z `option` `vip`, ne `tajno`; puščica dol + *Enter* doda predlog; vpis »konferenca2025« + *Enter* doda znački; vejica doda; seznam »Dodane značke« z `button` »Odstrani značko vip« ga odstrani; presledek v znački → napaka »Značka ne sme vsebovati presledkov.«, ni dodana; podvojena (druga velikost črk) → »Ta značka je že dodana.«; 30 značk → »Dodaš lahko največ 30 značk.«; 51 znakov → »Značka je predolga …«; *Backspace* v praznem polju ne odstrani značke; `aria-expanded`, `aria-activedescendant`; axe z odprtim `listbox`
- [X] T021 [P] [US2] [US3] FR-004-05 frontend/src/features/contacts/ContactFormGuard.test.tsx: obrazec z vnosom → *Prekliči* → `dialog` »Zavržem spremembe?« s fokusom na »Nadaljuj z urejanjem«; ta gumb zapre dialog, obrazec in vnosi ostanejo; »Zavrzi spremembe« → navigacija na seznam; klik na povezavo »Kontakti« v glavi z neshranjenimi spremembami → isti dialog, ob zavrnitvi ostane pot; brez sprememb *Prekliči* in navigacija brez vprašanja; ob uspešnem shranjevanju ni vprašanja; `beforeunload` ima `preventDefault`, ko so spremembe, sicer ne; urejanje: sprememba in povrnitev na izvorno vrednost = brez sprememb; axe z odprtim dialogom
- [X] T022 [P] [US3] FR-004-10 FR-004-13 FR-004-16 frontend/src/features/contacts/ContactEdit.test.tsx: `/contacts/<cid>/edit` → obrazec izpolnjen z vrednostmi kontakta; sprememba telefona in odstranitev značke + shrani → `PUT` s `version`, preusmeritev na pogled z novimi vrednostmi, obvestilo »Kontakt Janez Novak je shranjen.«; brez sprememb shrani → `PUT` s starimi vrednostmi, obvestilo, vrednosti nespremenjene; `404` pri shranjevanju → `alert` »Tega kontakta ni več – medtem ga je nekdo izbrisal.« in `link` »Nazaj na seznam kontaktov«, vnosi ostanejo, brez ponovnega ustvarjanja (en `PUT`); `404` pri nalaganju obrazca pod 1280 px → »Te strani ni«; `409 GROUP_ARCHIVED` pri shranjevanju → `alert` »Skupina je arhivirana – kontaktov ni mogoče spreminjati.«, obrazec in vnosi ostanejo; axe
- [X] T023 [P] [US3] FR-004-11 frontend/src/features/contacts/ContactConflict.test.tsx: `PUT` vrne `409 VERSION_CONFLICT` s `current` → `alert` »Kontakt je medtem spremenil(a) Ana Novak ob 14.32.« (en "… at 2:32 PM."; »izbrisan uporabnik« za `updatedBy: null`), obrazec ostane z vnosi; *Prikaži razlike* → `table` »Razlike med tvojimi in trenutnimi vrednostmi« z `columnheader` »Polje«, »Tvoja vrednost«, »Trenutna vrednost« in vrsticami samo za polja, ki se razlikujejo (tudi atributi, značke); *Uporabi trenutno različico* → obrazec dobi trenutne vrednosti, naslednje shranjevanje pošlje trenutno `version`; *Shrani moje spremembe* → `PUT` z vnosi in trenutno `version`; ponoven `409` → opozorilo se ponovi; axe
- [X] T024 [P] [US4] FR-004-12 FR-004-13 FR-004-16 frontend/src/features/contacts/ContactDelete.test.tsx: v pogledu *Izbriši kontakt* → `dialog` »Izbrišem kontakt Janez Novak?« z besedilom »Kontakt bo odstranjen iz skupine Projekt FERI.« in fokusom na »Prekliči«; *Prekliči* in *Esc* → brez zahtevka, fokus nazaj na »Izbriši kontakt«; potrditev → `DELETE …?version=<n>`, obvestilo »Kontakt Janez Novak je izbrisan.«, pot `/contacts` in kontakta ni več v seznamu; iz menija vrstice: `button` »Dejanja za Janez Novak« → `menuitem` »Izbriši kontakt« → isti dialog, po potrditvi se seznam ponovno prebere in obvestilo; `409 VERSION_CONFLICT` → dialog se zapre, `alert` »Kontakt je medtem spremenil(a) … ob ….«, pogled osvežen (nov `GET`), izbris je mogoče ponovno potrditi; `404` → `alert` »Tega kontakta ni več – medtem ga je nekdo izbrisal.« in osvežen seznam; brez povezave in `500` → `alert` v dialogu, dialog ostane; stran, ki po izbrisu ostane prazna, preusmeri na zadnjo obstoječo; axe z odprtim dialogom v sl in en
- [X] T025 [P] [US5] FR-004-07 FR-004-15 FR-004-17 frontend/src/features/contacts/ContactPermissions.test.tsx: bralec nearhivirane skupine in vsak član arhivirane skupine (lastnik, admin, urednik): seznam brez `link` »Nov kontakt«, brez stolpca »Dejanja« in gumbov »Dejanja za …«, pogled brez »Uredi kontakt« in »Izbriši kontakt«; urednik nearhivirane ima vse; bralec odpre `/contacts/new` in `/contacts/<cid>/edit` neposredno → brez `form`, besedilo »Za urejanje kontaktov potrebuješ vlogo urednik ali višjo.« in `link` »Nazaj na seznam kontaktov«, brez zahtevka za predloge značk; arhivirana skupina (urednik/lastnik): »Skupina je arhivirana – kontaktov ni mogoče spreminjati.« namesto obrazca; vloga člana se vzame iz `GET /api/groups/<id>`; axe v sl in en
- [X] T026 [P] [US1] FR-004-06 Posodobitev testov 002/003 zaradi privzetega razdelka *Kontakti* (002 spec, Assumptions; D-39, D-40): frontend/src/features/groups/GroupLayout.test.tsx (`/groups/<id>` preusmeri na `/contacts`, povezava »Kontakti« pred »Nastavitve«), NewGroupDialog.test.tsx (po ustvaritvi `/groups/<id>/contacts`), GroupSwitcher.test.tsx in Sidebar.test.tsx po potrebi, e2e/tests/skupine.spec.ts in arhiviranje.spec.ts (preusmeritve po ustvaritvi na `/contacts`); vnos D-40 (`sprememba-testa`) z navedenimi testi in razlogom (citat 002 Assumptions)
- [X] T027 [P] [US1] [US2] [US3] [US4] [US5] FR-004-01 … FR-004-17 e2e/tests/kontakti.spec.ts (pri 360, 768, 1280 px, axe na vsaki strani): (1) urednik v prazni skupini ustvari kontakt z atributom in dvema značkama samo s tipkovnico (SC-001), najde ga v seznamu; (2) validacija: prazno ime/priimek, neveljaven e-naslov ob zapustitvi polja, povzetek napak; (3) predlogi značk: skupina B ne pušča značk v A; (4) *Prekliči* z vnosom → »Zavržem spremembe?«; (5) seznam 60 kontaktov (SQL): 25 na stran, »1–25 od 60«, velikost 50 in stran 2 ostaneta ob osvežitvi, vrstni red; (6) izbira kontakta: pri 1280 px panel in ostane po osvežitvi (SC-005), pod 1280 px ločena stran in vrnitev na isto stran seznama; (7) urejanje + konflikt dveh urednikov (drugi brskalniški kontekst): opozorilo, razlike, tri možnosti (SC-004); (8) izbris iz pogleda in iz menija vrstice, fokus, obvestilo; izbris zastarele verzije; (9) bralec in arhivirana skupina: brez akcij, neposredna pot obrazca → razlaga; (10) kontakt druge skupine pod potjo moje skupine → pri < 1280 px »Te strani ni«, pri 1280 px »Tega kontakta ni več …« v panelu; (11) en scenarij v angleščini; (12) brez povezave: shrani → trajno sporočilo in *Poskusi znova*

**Checkpoint**: vsi testi T007–T027 se prevedejo in padejo zaradi pravega razloga; testi 000–003, ki niso v T026, ostanejo zeleni.

---

## Phase 4: Pregled testov

- [X] T028 Pregled testov – agent `pregled-testov` (workflow.md §4.2): SPREJETO pred nadaljevanjem; izid vseh krogov v traceability.md (*Pregled testov*); commit `test(004): …`

---

## Phase 5: Implementacija

### US1 – pregled kontaktov (P1)

- [X] T029 [US1] FR-004-06 FR-004-08 FR-004-14 backend `ContactRepository` (`page` z `ORDER BY sort_last NULLS LAST, sort_first NULLS LAST, created_at, id`, `count`, `find` z `group_id`, značke strani z `contact_id = ANY(:ids)`, atributi in značke kontakta po `position`, `updated_by` → `UserRef`/`null`), `ContactService` (branje), `ContactController` `GET …/contacts` (razčlenitev `page`/`size` kot pri skupinah, `size` ∈ {25, 50, 100}) in `GET …/contacts/{id}` z `GroupAccess.require(…, VIEWER, false)`; `GroupRepository` `contactCount` (R-12)
- [X] T030 [US1] FR-004-06 FR-004-07 FR-004-09 frontend `api.listContacts`, `api.getContact`, `ContactsPage` + `ContactTable` (preglednica ↔ kartice z `@container`, značke »+N«), `SectionPagination` z URL stanjem (1-osna stran, privzete vrednosti brez zapisa, preusmeritev ob strani onkraj zadnje, fokus na naslov), prazno stanje, nalaganje (zakasnjeno 300 ms), napaka; `GroupHeader` povezava »Kontakti«, `GroupLayout` razdelek `contacts/*` in privzeti razdelek `contacts`
- [X] T031 [US1] FR-004-08 FR-004-09 FR-004-14 frontend `ContactView` (`dl` s `mailto:`/`tel:`, atributi, značke, povezava nazaj z ohranjeno poizvedbo), `ContactPanel` (≥ 1280 px, `useMediaQuery(PANEL)`), `404` → `NotFoundPage` oziroma sporočilo v panelu (R-08), `ContactsRoutes` z `contacts`, `contacts/new`, `contacts/:id`, `contacts/:id/edit`

### US2 – ustvarjanje (P1)

- [X] T032 [US2] FR-004-01 FR-004-02 backend `ContactInputParser` po R-06 (razčlenitev, obrez, normalizacija, napake po poljih), `ContactRepository.insert` (+ atributi, značke, `sort_*`, `key_norm`, `tag_norm`), `ContactService.create` (transakcija), `POST …/contacts` z `GroupAccess.require(…, EDITOR, true)` → `201`
- [X] T033 [US2] FR-004-04 backend `ContactRepository.tagSuggestions`, `GET /api/groups/{groupId}/tags?q=` (`EDITOR`, `write = false`)
- [X] T034 [US2] FR-004-01 FR-004-02 FR-004-03 FR-004-16 frontend `api.createContact`, `validation.ts` (isti pravili kot strežnik), `ContactForm` (trije `fieldset`, preverjanje ob `blur`, povzetek napak s fokusom, napake strežnika po poljih), `AttributeRows` (dodaj/odstrani, fokus), `ContactFormPage` (nov), trajna napaka z *Poskusi znova*, obvestilo in preusmeritev na pogled
- [X] T035 [US2] FR-004-04 frontend `TagInput` (combobox po ARIA 1.2, predlogi iz `api.suggestTags`, *Enter*/vejica, odstranjevanje, napake)
- [X] T036 [US2] FR-004-05 frontend `App.tsx` na `createBrowserRouter` (R-09), `DiscardDialog`, `useBlocker` + `beforeunload` v `ContactForm`

### US3 – urejanje in konflikt (P2)

- [X] T037 [US3] FR-004-10 FR-004-11 FR-004-13 backend `ContactRepository.lock`, `update` (zamenjava atributov in značk, `version + 1`, `updated_by`, `updated_at`), `ContactService.update` (R-05: zaklep skupine `FOR SHARE`, zaklep kontakta, primerjava vrednosti, `VersionConflictException(current)`), `PUT …/contacts/{id}`
- [X] T038 [US3] FR-004-10 FR-004-11 FR-004-13 FR-004-16 frontend `api.updateContact`, urejanje v `ContactFormPage`, `ConflictAlert` (opozorilo, razlike, tri možnosti), `404` in `GROUP_ARCHIVED` ob shranjevanju

### US4 – izbris (P2)

- [X] T039 [US4] FR-004-12 FR-004-13 backend `ContactService.delete` (zaklepi, `version` iz poizvedbe, `409`/`404`), `DELETE …/contacts/{id}`
- [X] T040 [US4] FR-004-12 FR-004-13 FR-004-16 frontend `api.deleteContact`, `DeleteContactDialog`, `RowActions` (meni dejanj vrstice), izbris iz pogleda in vrstice, obravnava `409`/`404`, obvestilo

### US5 – pravice v vmesniku (P3)

- [X] T041 [US5] FR-004-07 FR-004-15 FR-004-17 frontend `canEditContacts(group)` (EDITOR+ in nearhivirana) v `ContactsPage`, `ContactView`, `RowActions`; poti obrazcev z razlago za nezadostno vlogo oziroma arhivirano skupino; `409 GROUP_ARCHIVED` ob oddaji

---

## Phase 6: Polish

- [ ] T042 `./verify.sh quick`, nato `./verify.sh full` zeleno; `traceability.md` (FR-ID → testi, implementacija); README/CLAUDE.md po potrebi; AI dnevnik
- [ ] T043 `/speckit-converge` do »Converged«; PR v `main`

## Dependencies

Setup → Foundational → Tests → T028 → Implementacija (T029 → T030 → T031; T032 → T033; T032 → T034 → T035 → T036; T037 → T038; T039 → T040; T041 po T031/T034/T038/T040) → Polish. Backend in vmesnik posamezne zgodbe sta neodvisna po T029/T032/T037/T039.

## Parallel execution

- Setup T001–T004 so vsi `[P]`. Foundational: T005 (BE) in T006 (FE) sta neodvisna.
- Testi T007–T015 (BE) in T016–T026 (FE) so `[P]`; E2E T027 po FE testih (isti pomočniki).
- Implementacija: BE in FE posamezne zgodbe tečeta vzporedno; naloge, ki spreminjajo isto datoteko (`ContactService`, `ContactRepository`, `ContactController`, `ContactForm`, `ContactFormPage`), tečejo zaporedno.

## Implementation strategy

1. MVP = US1 + US2 (seznam, pogled, ustvarjanje): T029–T036.
2. Nato US3 (urejanje in konflikt), US4 (izbris), US5 (pravice); po vsaki zgodbi `./verify.sh quick`.
3. Na koncu `./verify.sh full`, `/speckit-converge`, PR.

## Analysis (`/speckit-analyze`, 2026-11-06, samo branje; neskladja odpravljena v spec/plan/tasks)

Vseh 17 FR in 6 SC ima vsaj eno nalogo in test (tabela pokritosti v plan.md); vsi endpointi iz *Public Interfaces* so v T015 (matrika).
Konstitucijskih navzkrižij ni (0 CRITICAL, 0 HIGH). Ugotovitve:

- **MEDIUM – 404 kontakta: spec (Edge Cases) in FR-004-14 govorita različno:** strežnik ne loči izbrisanega kontakta od kontakta
  druge skupine. Odločitev (research R-08, D-39): pod 1280 px stran »Te strani ni«, od 1280 px seznam ostane in panel pokaže
  »Tega kontakta ni več …«. Preverjata T017, T018, T027 (10). Predpostavka gre v opis PR.
- **MEDIUM – razvrščanje (feature-map §2.6) je bilo v navzkrižju s Clarifications:** odpravljeno z D-38 in uskladitvijo §2.6;
  002/003 ostaneta pri ICU razvrščanju naslovov skupin.
- **LOW – 002/003 testi pričakujejo preusmeritev na `/settings`:** spec 002 (Assumptions) že določa *Kontakti* od 004; T026 + D-40.
- **LOW – `HealthAndMigrationIT` morda našteva migracije:** T005 ob dodajanju `V4` preveri in uskladi (ne spreminja pomena testa).
- **LOW – `Status: Draft` v spec.md:** ostane do sprejema PR.
