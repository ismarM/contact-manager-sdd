---

description: "Tasks for 002-skupine (tests mandatory, independent test review)"
---

# Tasks: Skupine kontaktov

**Input**: `specs/002-skupine/` – spec.md (s *Clarifications* 2026-11-05), plan.md (*Public Interfaces*), research.md (R-01 … R-13),
data-model.md, contracts/openapi.yaml, quickstart.md; odločitve D-25 … D-28

**Tests**: obvezni (konstitucija II). Vsak FR-002-01 … FR-002-13 ima vsaj eno testno nalogo. Testi pred kodo, nato pregled
neodvisnega agenta `pregled-testov` (workflow.md §4.2).

**Organization**: Setup → Foundational → Tests → Test review → US1 … US4 → Polish.

## Format: `[ID] [P?] [Story] FR-IDs Description`

- Imena endpointov, poti, dostopnih imen in sporočil so **samo** iz plan.md (*Public Interfaces*); naloge jih ne ponavljajo, kjer
  zadošča sklic na tabelo.
- Testi nosijo FR-ID (`@Tag("FR-002-04")`; Vitest/Playwright v imenu testa `"FR-002-04: …"`).

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [P] — Dodaj točno pripet `sonner` 2.0.8 v frontend/package.json in package-lock.json (`npm install --save-exact`); knjižnica je že zapisana v DECISIONS.md D-28
- [ ] T002 [P] FR-002-02 FR-002-03 FR-002-04 Migracija backend/src/main/resources/db/migration/V3__skupine.sql po data-model.md: `CREATE COLLATION title_sl (provider = icu, locale = 'sl')`, `CREATE COLLATION title_en (provider = icu, locale = 'en')`; tabela `contact_group` – `id uuid primary key default uuidv7()`, `title text not null check (char_length(title) between 1 and 100)`, `description text null check (description is null or char_length(description) between 1 and 1000)`, `color varchar(6) not null default 'tinta' check (color in ('tinta','mah','opeka','oker','sliva','morje','grafit','rja'))`, `version bigint not null default 0`, `archived_at timestamptz null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `updated_by bigint null references app_user(id) on delete set null`; tabela `group_member` – `group_id uuid not null references contact_group(id) on delete cascade`, `user_id bigint not null references app_user(id) on delete cascade`, `role varchar(6) not null check (role in ('VIEWER','EDITOR','ADMIN','OWNER'))`, `version bigint not null default 0`, `created_at timestamptz not null default now()`, `primary key (group_id, user_id)`; `create unique index group_member_one_owner on group_member (group_id) where role = 'OWNER'`; `create index group_member_user_role on group_member (user_id, role)`
- [ ] T003 [P] FR-002-01 … FR-002-13 i18n ključi za vsa besedila, dostopna imena, naslove strani, sporočila napak in obvestila iz plan.md (*Key elements and accessible names*, *Pages and routes*) v frontend/src/i18n/sl.json in frontend/src/i18n/en.json (ista drevesa ključev: `groups.*`, `roles.*` – OWNER »Lastnik«/"Owner", ADMIN »Admin«/"Admin", EDITOR »Urednik«/"Editor", VIEWER »Bralec«/"Viewer"; `colors.*` – tinta »Tinta«/"Ink", mah »Mah«/"Moss", opeka »Opeka«/"Brick", oker »Oker«/"Ochre", sliva »Sliva«/"Plum", morje »Morje«/"Sea", grafit »Grafit«/"Graphite", rja »Rja«/"Rust"); število kontaktov z i18next množinskimi oblikami (sl: ena, dve, tri/štiri, več)
- [ ] T004 [P] FR-002-04 FR-002-07 FR-002-11 Podpora BE testom (D-27): backend/src/test/java/si/contactmanager/group/support/GroupFixtures.java (prek `JdbcTemplate`: `userId(SignedIn)` – vrstica `app_user` iz `PUT /api/me` ali neposreden `INSERT`; `createGroup(ownerUserId, title, description, color)` vrne `UUID` in vstavi članstvo `OWNER`; `addMember(groupId, userId, role)`; `archive(groupId)` nastavi `archived_at = now()`; `setUpdatedBy(groupId, userId)`; `version(groupId)`); v backend/src/test/java/si/contactmanager/support/ApiTest.java dodaj `get(path, token)` in `post(path, token, jsonBody)` po vzoru obstoječega `put`
- [ ] T005 [P] FR-002-04 FR-002-06 Podpora FE testom: frontend/src/test/groupsApi.ts (gradniki `GroupDetail`, `GroupSummary`, `GroupSections` po contracts/openapi.yaml in MSW obdelovalniki `GET/POST /api/groups`, `GET/PUT /api/groups/:groupId`, ki beležijo zahtevke); `setViewport('wide' | 'narrow')` – nadomestek `window.matchMedia` za `(min-width: 1024px)` z dogodkom `change` v frontend/src/test/setup.ts (privzeto `narrow`); v frontend/src/test/renderApp.tsx privzet obdelovalnik `GET /api/groups` → `{"sections": []}`, ker ogrodje po 002 vedno naloži povzetek skupin – obstoječi testi 001 se ne spremenijo (vnos `sprememba-testa` v DECISIONS.md: podpora testom, ne asercija)
- [ ] T006 [P] FR-002-04 FR-002-07 FR-002-10 Podpora E2E (D-27, research R-13): e2e/tests/support/groups.ts – `createGroup(page, {title, description?, color?})` prek dialoga *Nova skupina* (imena iz plan.md), vrne `groupId` iz URL; `sql(statement)` izvede SQL z `docker compose ${E2E_COMPOSE_ARGS} exec -T db psql -v ON_ERROR_STOP=1 -U contacts -d contacts -c …` (`node:child_process`, brez nove knjižnice; privzeto `E2E_COMPOSE_ARGS="-f ../compose.yaml"` za lokalni zagon); `setRole(groupId, email, role)` (vstavi ali posodobi `group_member` za uporabnika z danim e-naslovom, ki se je že prijavil), `archive(groupId)`; `createGroupsBulk(email, count, role)` – en stavek SQL, ki uporabniku z danim e-naslovom ustvari `count` skupin z naslovi »Skupina 001« … in članstvom `role` (za SC-002); v verify.sh (`run_e2e`) izvozi `E2E_COMPOSE_ARGS` z istim projektom in datotekami kot `COMPOSE` (`-p contact-manager-verify -f ../compose.yaml -f ../compose.verify.yaml`); `verify.sh` je skupno orodje → nov vnos `odločitev` v DECISIONS.md (sklic na D-27)

---

## Phase 2: Foundational (minimalno ogrodje, da se testi prevedejo)

- [ ] T007 FR-002-01 FR-002-04 FR-002-07 FR-002-11 Ogrodje BE v backend/src/main/java/si/contactmanager/group/: enuma `Role` (`VIEWER < EDITOR < ADMIN < OWNER`, `atLeast(Role)`) in `GroupColor` (8 imen, `code()`, `static Optional<GroupColor> fromCode(String)` – v ogrodju vedno `Optional.empty()`, `DEFAULT = TINTA`); zapisi `GroupInput(title, description, color)`, `UserRef(name, email)`, `GroupDetail`, `GroupSummary`, `GroupSection`, `GroupSections` po contracts/openapi.yaml; `GroupInputParser` z `Parsed parseCreate(String body)` in `Parsed parseUpdate(String body)`, ki vržeta `UnsupportedOperationException`; `GroupController` z vsemi štirimi endpointi iz plan.md, ki vrnejo `501`
- [ ] T008 [P] FR-002-04 FR-002-07 FR-002-09 Ogrodje FE: frontend/src/features/groups/types.ts (tipi po contracts/openapi.yaml), api.ts (`listGroups`, `getGroup`, `createGroup`, `updateGroup` vržejo `Error('not implemented')`), groupValidation.ts (`validateGroupInput` vrže), conflictMessage.ts (`conflictMessage(updatedBy, updatedAt, language, now)` vrže), colors.ts (8 barv: koda → i18n ključ in razred žetona `bg-group-<koda>`); groupsContext.ts (`useGroups()` s privzetkom `{sections: [], loading: false, error: null, refresh: () => {}}`); prazne komponente `GroupsPage`, `NewGroupDialog`, `GroupLayout`, `SettingsPage` (izrišejo `null`) in frontend/src/shared/layout/{Sidebar,GroupSwitcher}.tsx; frontend/src/shared/lib/useMediaQuery.ts (vrne `false`); poti v frontend/src/app/App.tsx: indeks `/` → `GroupsPage`, `groups/:groupId/*` → `GroupLayout`; odstrani začasno frontend/src/app/StartPage.tsx in StartPage.test.tsx ter ključ `start.ready` (plan 001: »začasna vsebina do 002«; vnos `sprememba-testa` v DECISIONS.md)

**Checkpoint**: testi se prevedejo in padejo zaradi manjkajočega vedenja (`501`, prazna stran, `not implemented`).

---

## Phase 3: Tests (write FIRST – must FAIL for the right reason)

### Zaledje – unit

- [ ] T009 [P] [US1] FR-002-02 FR-002-03 backend/src/test/java/si/contactmanager/group/GroupInputParserTest.java: naslov se obreže (`"  Projekt  "` → `"Projekt"`); prazen ali samo presledki → `title`/`REQUIRED`; 100 znakov po obrezu sprejet, 101 → `title`/`TOO_LONG`; 100 emotikonov (znaki izven BMP) sprejetih (štetje kodnih točk, R-07); opis 1000 znakov sprejet, 1001 → `description`/`TOO_LONG`; opis `""` ali presledki → `null`; opis se ne obreže; `color` neznan ali z velikimi črkami (`"Mah"`) → `color`/`INVALID_VALUE`; pri ustvarjanju manjkajoč ali `null` `color` → `tinta`, manjkajoč `description` → `null`; pri urejanju manjkajoči `title`, `description`, `color`, `version` → `REQUIRED`; `version` ni celo število → `version`/`INVALID_VALUE`; neznano polje → `UNKNOWN_FIELD`; neveljaven JSON ali ne-objekt → `body`/`MALFORMED`; več napak hkrati vrne vse; parser nikoli ne vrže (vrne `errors`)
- [ ] T010 [P] [US1] FR-002-03 backend/src/test/java/si/contactmanager/group/GroupColorTest.java: `fromCode` za vseh 8 kod iz data-model.md vrne barvo z isto `code()`; `"Tinta"`, `"blue"`, `""`, `null` → prazno; `DEFAULT` je `tinta`

### Zaledje – integracijski in varnostni (Testcontainers + Firebase Auth Emulator)

- [ ] T011 [P] [US1] FR-002-01 FR-002-02 FR-002-03 backend/src/test/java/si/contactmanager/group/GroupCreateIT.java: `POST /api/groups {"title":"Projekt FERI","description":"Opis","color":"mah"}` → `201`, telo `GroupDetail` z `role: OWNER`, `archived: false`, `version: 0`, `updatedBy` = ime in e-naslov ustvarjalca, `id` je uuid; v bazi ena skupina in natanko eno članstvo (ustvarjalec, `OWNER`); brez `color` → `tinta`; z naslovom »  X  « → `"X"`; prazen naslov, 101 znak, opis 1001 znak, `"color":"blue"` → `400 VALIDATION_FAILED` z ustreznim `field` in nobena skupina ni ustvarjena; uporabnik brez predhodnega `PUT /api/me` ustvari skupino (profil se ustvari, R-03); dva uporabnika lahko ustvarita skupino z enakim naslovom
- [ ] T012 [P] [US2] FR-002-04 FR-002-05 FR-002-06 backend/src/test/java/si/contactmanager/group/GroupListIT.java: uporabnik brez skupin → `200 {"sections": []}`; lastnik A in B, admin C, bralec D (članstva prek `GroupFixtures`) → razdelki v vrstnem redu `OWNER`(2), `ADMIN`(1), `VIEWER`(1), brez `EDITOR`; `items` z `id`, `title`, `description`, `color`, `contactCount: 0`; arhivirana skupina E ni v nobenem razdelku in ni šteta v `total`; tuja skupina ni vključena; 30 lastniških skupin → `total: 30`, prva stran 25, `?role=OWNER&page=1` vrne preostalih 5, brez podvajanj in izpustov; `size=10` vrne 10; **abecedni red (D-28, na sliki `postgres:18-alpine`)**: naslovi »Čebela«, »Cesta«, »Dom«, »Šola«, »Sova«, »Žaba«, »Zebra« z `lang=sl` → Cesta, Čebela, Dom, Sova, Šola, Zebra, Žaba; isti naslovi z `lang=en` → Čebela, Cesta, Dom, Šola, Sova, Žaba, Zebra (č/š/ž se štejejo kot c/s/z); enaki naslovi so urejeni stabilno (`id`) čez strani; `size=0`, `size=101`, `page=-1`, `role=OWNERX`, `lang=de`, `page=1` brez `role` → `400 VALIDATION_FAILED` z ustreznim `field`
- [ ] T013 [P] [US3] FR-002-07 FR-002-08 FR-002-10 backend/src/test/java/si/contactmanager/group/GroupReadIT.java: `GET /api/groups/{id}` za urednika → `200`, `role: EDITOR`, vsa polja `GroupDetail`; za člana arhivirane skupine → `200`, `archived: true`; nečlan, neobstoječ uuid in neveljaven zapis (`/api/groups/abc`) → `404` s **praznim telesom**, odgovora za nečlana in neobstoječo skupino sta enaka (status, telo, `Content-Type`); izvajalec zadnje spremembe, ki je izbrisal račun (`DELETE FROM app_user` za uporabnika, ki ni član) → `updatedBy: null`; ustvarjalec brez imena → `updatedBy.name: null`
- [ ] T014 [P] [US4] FR-002-02 FR-002-11 FR-002-12 backend/src/test/java/si/contactmanager/group/GroupUpdateIT.java: admin `PUT` z `version: 0` in novim naslovom ter barvo → `200`, `version: 1`, `updatedBy` = admin, `updatedAt` novejši; lastnik pobriše opis (`null` ali `""`) → `description: null`; nespremenjeni podatki z veljavno verzijo → `200`, `version`, `updatedBy`, `updatedAt` nespremenjeni (Clarifications 2026-11-05); naslov z dodanimi presledki ob robu šteje kot nespremenjen; zastarela verzija → `409 {"code":"VERSION_CONFLICT","current": GroupDetail}` s trenutnimi podatki, nič se ne spremeni; zastarela verzija pri nespremenjenih podatkih → `409 VERSION_CONFLICT`; prazen naslov, 101 znak, opis 1001, `"color":"blue"` → `400` z napako po polju, nič se ne spremeni; manjkajoča `version` → `400` (`version`/`REQUIRED`); **vrstni red (feature-map §2.2)**: arhivirana + zastarela verzija + neveljaven naslov → `409 GROUP_ARCHIVED`; zastarela verzija + neveljaven naslov → `409 VERSION_CONFLICT`
- [ ] T015 [P] [US4] FR-002-12 backend/src/test/java/si/contactmanager/group/GroupConcurrencyIT.java: dva sočasna `PUT` (lastnik in admin, z različnima naslovoma) z isto verzijo → natanko en `200` in en `409 VERSION_CONFLICT`; končna `version` je za 1 večja od začetne; v bazi je naslov uspešnega zahtevka (SC-004); ponovljeno 10-krat
- [ ] T016 [P] [US1] [US2] [US3] [US4] FR-002-01 FR-002-04 FR-002-07 FR-002-08 FR-002-10 FR-002-11 backend/src/test/java/si/contactmanager/group/GroupIsolationMatrixIT.java (parametriziran, workflow.md §2.5): `GET /api/groups/{id}` in `PUT /api/groups/{id}` × {neprijavljen (brez glave, pokvarjen, potekel žeton – `Tokens`), nečlan, VIEWER, EDITOR, ADMIN, OWNER} × {nearhivirana, arhivirana}: `GET` – 401 / 404 / 200 za vse člane v obeh stanjih; `PUT` – 401 / 404 / `403 {"code":"FORBIDDEN"}` za VIEWER in EDITOR (tudi v arhivirani) / 200 za ADMIN in OWNER v nearhivirani / `409 {"code":"GROUP_ARCHIVED"}` za ADMIN in OWNER v arhivirani; 401 ima `{"code":"UNAUTHENTICATED"}`; 404 prazno telo; po vsakem neuspehu se vrstica v `contact_group` ne spremeni; `POST /api/groups` in `GET /api/groups` neprijavljen → 401 in nobena skupina ni ustvarjena

### Vmesnik – unit

- [ ] T017 [P] [US1] FR-002-02 frontend/src/features/groups/groupValidation.test.ts: ista pravila kot T009 za vnos v obrazcu (obrez naslova, 1–100 in 1000 v kodnih točkah, prazen opis → brez opisa); vrne ključe sporočil iz plan.md (»Vpiši naslov.«, »Naslov je lahko dolg največ 100 znakov.«, »Opis je lahko dolg največ 1000 znakov.«)
- [ ] T018 [P] [US4] FR-002-12 FR-002-13 frontend/src/shared/api/client.test.ts (dopolnitev, obstoječi testi ostanejo): `ApiError` ima `body` z razčlenjenim JSON telesom (`errors[]` pri `400`, `current` pri `409`), `null` za telo, ki ni JSON, in za prazno telo (`404`); `code` ostane kot doslej
- [ ] T019 [P] [US4] FR-002-12 frontend/src/features/groups/conflictMessage.test.ts: `conflictMessage(updatedBy, updatedAt, language, now)` vrne sl »Skupino je medtem spremenil(a) Bojan Kos ob ‹ura›.« in en "The group was changed in the meantime by Bojan Kos at ‹time›."; ‹ura› je `Intl.DateTimeFormat(<jezik>, {hour: 'numeric', minute: '2-digit'})` v lokalnem času; če sprememba ni bila na isti koledarski dan kot `now`, je pred uro še datum (`dateStyle: 'medium'`); `updatedBy.name` `null` → e-naslov; `updatedBy` `null` → »izbrisan uporabnik« / "deleted user"

### Vmesnik – funkcionalni (RTL + MSW + vitest-axe; samo getByRole/getByLabel z imeni iz plan.md)

- [ ] T020 [P] [US1] FR-002-01 FR-002-02 FR-002-03 FR-002-13 frontend/src/features/groups/NewGroupDialog.test.tsx (prek `renderApp` na `/`): *Nova skupina* odpre `dialog` »Nova skupina« s fokusom na *Naslov*; polja *Naslov* (`aria-required`), *Opis*, `radiogroup` »Barva« z 8 `radio` v vrstnem redu iz plan.md, izbrana *Tinta*; *Prekliči* in *Esc* zapreta brez zahtevka, fokus nazaj na sprožilcu; prazen naslov ali samo presledki → brez zahtevka, napaka »Vpiši naslov.« povezana s poljem (`aria-invalid`, opis napake), dialog ostane z vnosi; 101 znak naslova / 1001 znak opisa → napaka ob polju; `400` s strežnika (`color`/`INVALID_VALUE`) → »Izberi eno od ponujenih barv.« ob *Barva*; `500` in omrežna napaka → `alert` nad obrazcem (sporočili iz plan.md, brez kod), vnosi ostanejo, ponovni poskus uspe; uspeh → telo `{"title":"Projekt FERI","description":"…","color":"mah"}`, besedilo »Skupina je ustvarjena.« znotraj `region` »Obvestila« in gumb »Zapri obvestilo«, ki ga zapre (vloge `status` test ne pričakuje – research R-11), pot `/groups/<id>/settings`, fokus na `heading` level 1 »Projekt FERI«, povzetek skupin ponovno naložen; brez izbire barve telo nosi `tinta` (ali brez `color`); axe brez kršitev z odprtim dialogom in z napakami, v sl in en (v en tudi dostopna imena: `dialog` "New group", `region` "Notifications", "Close notification")
- [ ] T021 [P] [US2] FR-002-04 FR-002-05 FR-002-09 FR-002-13 frontend/src/features/groups/GroupsPage.test.tsx: `heading` level 1 »Skupine«; razdelki `heading` level 2 »Lastnik (2)«, »Admin (1)«, »Bralec (1)« v tem vrstnem redu, brez »Urednik«; vrstica: `link` z naslovom skupine na `/groups/<id>`, opis, »0 kontaktov«; jeziček je `aria-hidden`; prazno stanje »Nimaš še nobene skupine.« z eno kontrolo *Nova skupina* v `main`; nalaganje »Nalagam…« z `aria-busy`; napaka nalaganja → `alert` iz plan.md in »Poskusi znova« ponovi zahtevek; zahtevek nosi `lang` jezika vmesnika in ob menjavi jezika se ponovi; naslov dokumenta »Skupine – Kontakti« / "Groups – Contacts"; axe brez kršitev (polno, prazno, napaka; sl in en)
- [ ] T022 [P] [US2] FR-002-04 frontend/src/features/groups/GroupSection.test.tsx: razdelek s 30 skupinami → `navigation` »Strani rezultatov: Lastnik« (D-26) s `status` »1–25 od 30«, »Stran 1 od 2«, *Prejšnja* onemogočena; *Naslednja* zahteva `?role=OWNER&page=1&size=25`, prikaže 5 skupin in »26–30 od 30«, fokus na naslovu razdelka; `combobox` »Velikost strani« (25/50/100) z 50 zahteva `size=50&page=0`; razdelek s ≤ 25 skupinami nima paginacije; dva razdelka z več kot 25 skupinami imata ločeni `navigation` z različnima imenoma in ločeno stanje strani; v en `navigation` "Result pages: Owner", `combobox` "Page size"; axe brez kršitev v sl in en
- [ ] T023 [P] [US2] FR-002-01 FR-002-06 frontend/src/shared/layout/Sidebar.test.tsx (`setViewport('wide')`): `navigation` »Moje skupine« na `/`, `/account` in v skupini; razdelki `heading` level 2 »Lastnik«, »Admin«, »Bralec« brez praznih; največ 10 povezav na razdelek in povezava »Vse skupine« na `/` samo, kadar je `total` > 10 (bralec 14 skupin); povezava odprte skupine ima `aria-current="page"`; gumb *Nova skupina* odpre dialog; pri `setViewport('narrow')` stranskega pasu ni v DOM; po uspešnem ustvarjanju ali urejanju se povzetek ponovno naloži; axe brez kršitev v sl in en ("My groups", "All groups")
- [ ] T024 [P] [US2] FR-002-06 frontend/src/shared/layout/GroupSwitcher.test.tsx (`setViewport('narrow')`): gumb »Preklopi skupino« v `banner` z `aria-haspopup="menu"`; odpre `menu` »Preklopi skupino« s skupinami `group` »Lastnik«, … (brez praznih), največ 10 `menuitem` na razdelek in »Vse skupine«; trenutna skupina `aria-current="page"`; izbira `menuitem` odpre skupino; *Esc* zapre in vrne fokus na gumb; puščice premikajo fokus; pri `setViewport('wide')` gumba ni; axe brez kršitev (zaprt in odprt meni) v sl in en ("Switch group")
- [ ] T025 [P] [US3] FR-002-07 FR-002-08 FR-002-09 frontend/src/features/groups/GroupLayout.test.tsx: urednik na `/groups/<id>` → preusmeritev na `/groups/<id>/settings`; `region` »Projekt FERI« z `heading` level 1 »Projekt FERI«, besedilom vloge (regija `toHaveTextContent('Vloga: Urednik')`; predpona »Vloga: « je `sr-only`, vidno je samo »Urednik«; v en "Role: Editor") in `navigation` »Razdelki skupine« s povezavo »Nastavitve« (`aria-current="page"`); arhivirana skupina → še besedilo »Arhivirano«; bralec vidi »Nastavitve«; `GET` vrne `404` (nečlan, neobstoječa) → `heading` »Te strani ni«, povezava »Na seznam skupin«, naslov »Te strani ni – Kontakti«, brez naslova skupine v DOM; neznan podrazdelek (`/groups/<id>/neznano`) → »Te strani ni«; naslov dokumenta »Nastavitve – Projekt FERI – Kontakti« in "Settings – Projekt FERI – Contacts"; dolg naslov (100 znakov) prikazan v celoti v `h1`; axe brez kršitev (navadna, arhivirana, 404) v sl in en
- [ ] T026 [P] [US4] FR-002-02 FR-002-10 FR-002-11 FR-002-12 FR-002-13 frontend/src/features/groups/GroupDetailsSection.test.tsx (na `/groups/<id>/settings`): `heading` level 2 »Podatki skupine«; **bralec in urednik** – `term`/`definition` »Naslov«, »Opis« (prazen → »Brez opisa«), »Barva« z »Mah«, brez `form`, `textbox` in »Shrani spremembe«; **admin/lastnik arhivirane skupine** – enako, brez obrazca; **admin nearhivirane** – `form` »Podatki skupine« z vrednostmi, sprememba naslova in barve → `PUT` z `version`, besedilo »Podatki skupine so shranjeni.« znotraj `region` »Obvestila«, nov naslov v `h1`, naslov dokumenta in ponovno naložen povzetek (stranski pas); lastnik pobriše opis → telo `description: null`; prazen naslov → brez zahtevka, napaka ob polju; `409 VERSION_CONFLICT` s `current` (izvajalec »Bojan Kos«) → obrazec ostane z vnosi, `alert` z besedilom iz `conflictMessage` (»Skupino je medtem spremenil(a) Bojan Kos ob ‹čas›.«); `updatedBy: null` → »izbrisan uporabnik«; »Prikaži razlike« (`aria-expanded`) razkrije `table` »Razlike med tvojimi in trenutnimi vrednostmi« s stolpci »Polje«, »Tvoja vrednost«, »Trenutna vrednost« samo za različna polja; »Uporabi trenutno različico« prikaže `current` v obrazcu in zavrže vnose brez zahtevka; »Shrani moje spremembe« pošlje vnose z `current.version` in ob uspehu skrije opozorilo; `409 GROUP_ARCHIVED`, `403`, `500` in omrežna napaka → ustrezni `alert` iz plan.md, vnosi ostanejo; `404` → »Te strani ni«; axe brez kršitev (branje, obrazec, konflikt z razlikami, napaka) v sl in en

### E2E (Compose, emulator; 360/768/1280 px; axe na vsaki strani)

- [ ] T027 [P] [US1] [US2] [US3] [US4] FR-002-01 … FR-002-13 e2e/tests/skupine.spec.ts (pomočniki T006): (1) nov uporabnik → »Nimaš še nobene skupine.« (axe); *Nova skupina* → »Projekt FERI«, *Mah* → skupina odprta z »Lastnik«, obvestilo (axe na dialogu in skupini); (2) prazen naslov → napaka ob polju, dialog odprt; (3) pri 1280 px stranski pas »Moje skupine« s skupino in `aria-current`; pri 360 in 768 px »Preklopi skupino« odpre meni in odpre drugo skupino; (4) uporabnik z vlogami prek `setRole` (lastnik, admin, bralec) → razdelki in števila na `/`; arhivirana skupina (`archive`) ni na seznamu, njena povezava pokaže oznako »Arhivirano« in podatke brez obrazca; (5) drug uporabnik odpre URL tuje skupine → »Te strani ni«; (6) admin spremeni naslov in barvo → nov naslov v glavi, stranskem pasu ali meniju in naslovu strani; bralec vidi podatke brez obrazca; (7) dva konteksta brskalnika (lastnik in admin) odpreta *Podatke skupine*, prvi shrani, drugi shrani → opozorilo o konfliktu s tremi možnostmi, »Prikaži razlike«, »Shrani moje spremembe« uspe; (8) zaledje ni dosegljivo (`page.route('/api/groups', abort)`) ob ustvarjanju → `alert` brez kod, vnosi ostanejo; (9) naslovi strani in axe brez kršitev v sl **in** en na vseh straneh in stanjih 002: *Skupine* (prazno, polno), dialog *Nova skupina* (z napako), meni preklopa (odprt), skupina z *Nastavitvami* (branje, obrazec, opozorilo o konfliktu z razlikami), arhivirana skupina, »Te strani ni« (SC-006); (10) 320 px in dolg naslov/opis (100/1000 znakov): brez vodoravnega drsenja na `/`, v skupini in v dialogu; (11) tipkovnica: dialog (Tab, Esc, vrnitev fokusa), meni preklopa (puščice, Esc), navigacija skupine; (12) **SC-002 – uporabniška izkušnja**: uporabnik s 100 skupinami (`createGroupsBulk`, vloga OWNER) se prijavi, nato se izmeri čas od `page.goto('/')` do trenutka, ko so v `main` vidni `heading` »Lastnik (100)« in prvih 25 povezav skupin – mora biti < 2000 ms pri vseh treh širinah; razdelek prikaže največ 25 vrstic, `navigation` »Strani rezultatov: Lastnik« je viden

---

## Phase 4: Test review (independent agent gate)

- [ ] T028 — Pregled testov z NOVIM podagentom `pregled-testov` (`.claude/agents/pregled-testov.md`), ki dobi samo `specs/002-skupine/` in seznam testnih datotek T009–T027 (in podporo T004–T006). Ob ZAVRNJENO popravi teste in zaženi novega pregledovalca (največ trije krogi, nato vprašaj razvijalca). Ob SPREJETO zapiši vse kroge v specs/002-skupine/traceability.md (*Pregled testov*) in naredi commit `test(002): …` (samo testi, podpora testom, minimalno ogrodje in vnosi `sprememba-testa` iz T005 in T008).

**Checkpoint**: nobena naloga od T029 naprej se ne začne pred SPREJETO.

---

## Phase 5: User Story 1 - Ustvarjanje skupine (P1) 🎯 MVP

**Goal**: prijavljen uporabnik ustvari skupino in postane njen lastnik. **Independent Test**: T009–T011, T016 (`POST`), T017, T020, E2E (1), (2), (8).

- [ ] T029 [P] [US1] FR-002-02 FR-002-03 `GroupColor.fromCode` in `GroupInputParser` (research R-07: naslov `strip()`, 1–100 kodnih točk; opis ≤ 1000 kodnih točk, ne obreže se, prazen ali presledki → `null`; barva samo male črke iz 8 imen, pri ustvarjanju privzeto `tinta`; kode `REQUIRED`, `TOO_LONG`, `INVALID_VALUE`, `UNKNOWN_FIELD`, `MALFORMED`; vrne `Parsed(input, version, errors)` in nikoli ne vrže) v backend/src/main/java/si/contactmanager/group/
- [ ] T030 [P] [US1] FR-002-01 backend/src/main/java/si/contactmanager/account/UserDirectory.java (javen, research R-03): `Optional<Long> find(Jwt)` in `long ensure(Jwt)` (`INSERT … ON CONFLICT (firebase_uid) DO UPDATE SET firebase_uid = excluded.firebase_uid RETURNING id`, ime in e-naslov iz žetona)
- [ ] T031 [US1] FR-002-01 FR-002-03 `GroupRepository.insert` in `insertMember`, `GroupService.create` (`@Transactional`: skupina z `updated_by` = ustvarjalec in članstvo `OWNER`) in `POST /api/groups` v `GroupController` (`ensure`, parser, ob `errors` → `ValidationException`, `201` z `GroupDetail`) v backend/src/main/java/si/contactmanager/group/ (potrebuje T029, T030)
- [ ] T032 [P] [US1] FR-002-01 FR-002-03 shadcn *Dialog* v frontend/src/shared/ui/dialog.tsx (`radix-ui`) in *Sonner* v frontend/src/shared/ui/sonner.tsx, prilagojena po design.md 13.4 (Tabler, skupni razred fokusa, `text-base`, `h-11`, brez senc nad `float`, i18n za skrita besedila – Sonner `customAriaLabel` »Obvestila« / "Notifications" in `toastOptions.closeButtonAriaLabel` »Zapri obvestilo« / "Close notification" (research R-11); Sonner: `closeButton`, 5000 ms, spodaj desno / pod `md` spodaj na sredini, brez `richColors`); `Toaster` v frontend/src/shared/layout/AppShell.tsx
- [ ] T033 [P] [US1] FR-002-01 FR-002-02 groupValidation.ts, ColorPicker.tsx (nativni `fieldset`/`legend` »Barva«, 8 `radio` z vzorcem 24 × 24 px `aria-hidden` in imenom, design.md 4.2) in GroupFormFields.tsx (*Naslov* `aria-required`, *Opis* `textarea`, napake z `aria-invalid` in `aria-describedby`) v frontend/src/features/groups/
- [ ] T034 [US1] FR-002-01 FR-002-03 FR-002-13 `ApiError.body` v frontend/src/shared/api/client.ts (research R-08); `createGroup` v api.ts; NewGroupDialog.tsx (preverjanje pred pošiljanjem, napake strežnika ob poljih, `alert` ob neuspehu, obvestilo, navigacija na novo skupino, `useGroups().refresh()` iz groupsContext.ts) v frontend/src/features/groups/ (potrebuje T032, T033)

**Checkpoint**: T009–T011, T017, T018, T020 zeleni; `./verify.sh quick` zelen.

## Phase 6: User Story 2 - Pregled mojih skupin po vlogah (P1)

**Goal**: zaslon *Skupine*, stranski pas in meni preklopa. **Independent Test**: T012, T016 (`GET /api/groups`), T021–T024, E2E (3), (4).

- [ ] T035 [US2] FR-002-04 FR-002-05 FR-002-06 `GroupRepository.countByRole` in `pageByRole` (samo `archived_at IS NULL`, `ORDER BY g.title COLLATE "title_sl"|"title_en", g.id`, kolacija iz zaprte preslikave `lang` → ime, `contactCount` = 0) in `GET /api/groups` v `GroupController` (parametri `role`, `page`, `size` 1–100, `lang` `sl|en` – neveljavni → `400` z napako po polju; brez `role` prva stran vseh nepraznih razdelkov v vrstnem redu OWNER, ADMIN, EDITOR, VIEWER; `find` – uporabnik brez profila → `sections: []`) v backend/src/main/java/si/contactmanager/group/
- [ ] T036 [P] [US2] FR-002-06 frontend/src/shared/lib/useMediaQuery.ts (`matchMedia`, naročnina na `change`, research R-10)
- [ ] T037 [US2] FR-002-06 `listGroups` v api.ts; frontend/src/features/groups/GroupsProvider.tsx, ki napolni obstoječi groupsContext.ts (povzetek `size=10&lang=…`, `sections`, `loading`, `error`, `refresh()`; ponovno ob menjavi jezika; R-09); `GroupsProvider` v AppShell
- [ ] T038 [US2] FR-002-04 FR-002-05 FR-002-09 FR-002-13 GroupsPage.tsx, GroupSection.tsx, SectionPagination.tsx v frontend/src/features/groups/ (design.md 8.9 z D-26, 8.15, 9.2; skrajšan opis v eni vrstici; v praznem stanju glava zaslona nima gumba *Nova skupina* – gumb je samo v praznem stanju (ena kontrola v `main`, plan.md); sicer je gumb v glavi zaslona; naslov »Skupine – Kontakti«)
- [ ] T039 [US2] FR-002-01 FR-002-06 frontend/src/shared/layout/Sidebar.tsx (256 px, design.md 7.1) in GroupSwitcher.tsx (shadcn *Dropdown Menu* iz frontend/src/shared/ui/dropdown-menu.tsx, `DropdownMenuGroup` z oznako vloge, `menuitem` kot `Link`); trenutna skupina iz `useMatch('/groups/:groupId/*')`; AppShell izriše enega od obeh po `useMediaQuery('(min-width: 1024px)')` (potrebuje T036, T037)

**Checkpoint**: T012, T021–T024 zeleni; obstoječi testi 001 zeleni; `./verify.sh quick` zelen.

## Phase 7: User Story 3 - Glava in zavihki skupine (P1)

**Goal**: okvir vseh zaslonov skupine in »Te strani ni« za nečlana. **Independent Test**: T013, T016 (`GET /api/groups/{id}`), T025, E2E (4), (5).

- [ ] T040 [US3] FR-002-08 Javni `GroupAccess.require(Jwt, UUID, Role lowest, boolean write)` → `Membership(groupId, userId, role, archived)` (research R-02, D-27: ni uporabnika/članstva → `NotFoundException`; vloga pod `lowest` → `ForbiddenException`; `write` in arhivirana → `GroupArchivedException`) v backend/src/main/java/si/contactmanager/group/GroupAccess.java; izjeme v backend/src/main/java/si/contactmanager/shared/error/ in preslikave v ApiExceptionHandler.java: `404` prazno telo; `groupId` kontroler sprejme kot niz in ga razčleni `GroupAccess` (neveljaven uuid → `NotFoundException`), brez splošne preslikave `MethodArgumentTypeMismatchException` (odgovori drugih endpointov se ne spremenijo, research R-01); `403 {"code":"FORBIDDEN"}` (D-25), `409 {"code":"GROUP_ARCHIVED"}`
- [ ] T041 [US3] FR-002-07 FR-002-10 `GroupRepository.findDetail` (spoj z `app_user` za `updatedBy`, `null` ob izbrisanem) in `GET /api/groups/{groupId}` v `GroupController` (`GroupAccess` z `VIEWER`, `write=false`) (potrebuje T040)
- [ ] T042 [US3] FR-002-07 FR-002-08 FR-002-09 GroupLayout.tsx (nalaganje `getGroup`, `404` → `NotFoundPage`, kontekst skupine za razdelke, indeks → `settings` z `replace`, neznan podrazdelek → `NotFoundPage`), GroupHeader.tsx (`section` z `aria-labelledby` na `h1` `tabIndex=-1`, jeziček `bg-group-<koda>` `aria-hidden`, oznaka vloge po design.md 8.5 s skrito predpono »Vloga: « (`sr-only`) in *Arhivirano*, `nav` »Razdelki skupine« z `NavLink`) in SettingsPage.tsx (naslov dokumenta »Nastavitve – ‹naslov› – Kontakti«) v frontend/src/features/groups/

**Checkpoint**: T013, T016 (`GET`), T025 zeleni; `./verify.sh quick` zelen.

## Phase 8: User Story 4 - Ogled in urejanje podatkov skupine (P2)

**Goal**: branje za vse člane, urejanje z razrešitvijo konflikta za admina in lastnika. **Independent Test**: T014–T016, T018, T019, T026, E2E (6), (7).

- [ ] T043 [US4] FR-002-02 FR-002-11 FR-002-12 `VersionConflictException(GroupDetail current)` in preslikava `409 {"code":"VERSION_CONFLICT","current":…}` v ApiExceptionHandler.java; `GroupService.update` (`@Transactional`: `SELECT … FOR UPDATE`; `version` ≠ → konflikt; nato `errors` → `400`; nespremenjene vrednosti → brez `UPDATE`; sicer `version + 1`, `updated_by`, `updated_at = now()`; research R-06) in `PUT /api/groups/{groupId}` (`GroupAccess` z `ADMIN`, `write=true`, nato `update`) v backend/src/main/java/si/contactmanager/group/
- [ ] T044 [US4] FR-002-10 FR-002-11 FR-002-13 `updateGroup` v api.ts; GroupDetailsSection.tsx (branje z `dl` in imenom barve za VIEWER/EDITOR in arhivirano skupino; obrazec za ADMIN/OWNER nearhivirane s `GroupFormFields`; uspeh → obvestilo, posodobitev konteksta skupine in `refresh()`; napake → `alert` iz plan.md) v frontend/src/features/groups/
- [ ] T045 [US4] FR-002-12 conflictMessage.ts in ConflictAlert.tsx (design.md 8.14: besedilo iz `conflictMessage` – izvajalec ali »izbrisan uporabnik« in čas v zapisu jezika, »Prikaži razlike« s tabelo samo različnih polj, »Uporabi trenutno različico«, »Shrani moje spremembe« s `current.version`) in vključitev v GroupDetailsSection.tsx (potrebuje T044)

**Checkpoint**: vsi testi T009–T027 zeleni; `./verify.sh quick` zelen.

---

## Phase N: Polish & Cross-Cutting Concerns

- [ ] T046 — `/speckit-converge` do »Converged«; `./verify.sh quick` zelen (vključno z vsemi testi 000 in 001)
- [ ] T047 — Posodobi specs/002-skupine/traceability.md (vsak FR-ID → testi → stanje; matrika izolacije za `GET`/`PUT /api/groups/{groupId}`)
- [ ] T048 — `./verify.sh full` zelen (integracijski z ICU na `postgres:18-alpine`, varnostni, E2E pri treh širinah); če ICU ne deluje, ustavi se in odpri D-28 z novim vnosom
- [ ] T049 — Potisni vejo `skupine` in odpri PR v `main` (predpostavke, izid pregleda testov, commit `test(002)`; v opisu označi D-25, D-26, D-27 in spremembo `verify.sh` za pregled drugega razvijalca)
- [ ] T050 — Razvijalca: pregled PR, potrditev D-25 … D-27 in ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10, quickstart #11); združitev (agent pusti neoznačeno)

---

## Dependencies & Execution Order

- Setup (T001–T006) → Foundational (T007–T008) → Tests (T009–T027) → Test review (T028) strogo zaporedno.
- Po T028: US1 (T029–T034) → US2 (T035–T039) → US3 (T040–T042) → US4 (T043–T045) → Polish (T046–T050).
- Odvisnosti med zgodbami: US1 po uspehu odpre skupino (pot iz US3) in osveži povzetek (US2) – T020 je v celoti zelen šele po T037 in T042; US4 potrebuje `GroupAccess` (T040) in okvir skupine (T042).
- Znotraj zgodb: T031 ← T029, T030; T034 ← T032, T033; T039 ← T036, T037; T041 ← T040; T045 ← T044.
- `/speckit-implement` teče dvakrat: najprej do vključno faze 3, po SPREJETO še ostale faze.

## Parallel Opportunities

- Setup: T001–T006 (različne datoteke).
- Foundational: T007 (BE) in T008 (FE).
- Tests: T009–T016 (BE, vsak svoja datoteka), T017–T026 (FE, vsak svoja datoteka), T027 (E2E).
- US1: T029, T030 (BE) vzporedno s T032, T033 (FE). US2: T036 vzporedno s T035.

## Implementation Strategy

- **MVP**: US1 + US2 + US3 (vse P1) – ustvarjanje, seznam po vlogah, okvir skupine z izolacijo; nato US4 (P2).
- Vsaka zgodba po zaključku: njeni testi zeleni, `./verify.sh quick` zelen.

## Notes

- Testi se po pregledu spreminjajo samo zaradi specifikacije (DECISIONS.md).
- Brez utišanj brez D-NN; barve samo iz žetonov (`bg-group-*`, design.md 4.2 in 13.2).
- `GroupAccess` je skupni temelj za 003–011 (D-27); kontrolerji vlog ne preverjajo sami.
