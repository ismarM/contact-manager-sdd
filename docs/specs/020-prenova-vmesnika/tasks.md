---

description: "Naloge: Prenova vmesnika (Kartoteka v2) – ena izvedba, testi znotraj vsake zgodbe, zgodbe kot ločene faze"
---

# Tasks: Prenova vmesnika (Kartoteka v2)

**Input**: `/docs/specs/020-prenova-vmesnika/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: obvezni (načelo II), nastajajo skupaj s kodo vsake zgodbe. Imena elementov: `getByRole`/`getByLabel`, imena iz prevodov ali skupnega pomočnika (T012).

**Organization**: Setup → Foundational (paket A zaledje, paket B odjemalci) → US1 … US7 (vsaka svoja faza; zgodbe nad ~12 nalog so razdeljene na pakete) → Polish. Vrstni red faz je vrstni red rezin iz §2.5: temelji (US1) → ogrodje (US2) → zasloni (US3–US7).

## Format: `[ID] [P?] [Story] FR-IDs Description`

- **[P]**: neodvisno (druge datoteke). **[Story]**: US1 … US7. Dostopna imena in nova besedila vedno v `frontend/src/i18n/sl.json` in `en.json`.

---

## Phase 1: Setup

- [x] T001 — `design.md` zamenjaj z vsebino Kartoteke v2 (R-02): načela, barve, tipografija, prostor, oblike, sence, gibanje, ilustracije, komponente, zasloni, prepovedi; ohrani §10 (dostopnost), §11 (besedila), §12 (PWA), §13 (implementacija, posodobi na `--k-*` v2) in dodaj zgodovino različice v2 (.specify/memory/design.md) FR-020-01
- [x] T002 [P] — Popravi `docs/specs/002-skupine/spec.md` (FR-002-04 … -06: razdelki po vlogah → en seznam z značko vloge) in `docs/specs/002-skupine/contracts/openapi.yaml` (`GroupSections` → `GroupPage` iz `contracts/openapi.yaml` te funkcionalnosti) FR-020-10

---

## Phase 2: Foundational (blokira vse zgodbe)

### Paket A – zaledje (`GET /api/groups` in matrika izolacije)

- [x] T003 FR-020-10, FR-020-11 — `GET /api/groups` vrne `GroupPage {total,page,size,items[role…]}`: `GroupPage` (nov record), `GroupService.list`, `GroupRepository.countGroups`/`pageGroups` (naslov po kolaciji `lang`, nato id; `role` neobvezen; `page` vedno dovoljen), `GroupController`; odstrani `GroupSection`, `GroupSections`, `countByRole`, `pageByRole` (backend/src/main/java/si/contactmanager/group/)
- [x] T004 FR-020-10, FR-020-11 — Posodobi IT na novo obliko: `GroupListIT`, `GroupSearchIT`, `GroupCreateIT`, `GroupArchiveIT`, `GroupUnarchiveIT`, `GroupPhotoIT`, `InvitationAcceptIT`, `ContactReadIT`, `GroupFixtures` (najdi z `grep -rln "sections\|GroupSection" backend/src/test`); nov scenarij: ena stran čez vloge, filter `role`, `q`, paginacija čez več vlog, razvrstitev po naslovu
- [x] T005 FR-020-10, FR-020-11 — Matrika izolacije **GET /api/groups** (`GroupIsolationMatrixSecurityIT`, posodobi): neprijavljen (brez, neveljaven, potečen žeton) 401; prijavljen vidi samo svoje skupine (tuje skupine in tuji uporabnik z enakim `q` niso razkriti), uporabnik brez profila 200 prazen; neveljavni `role`/`size`/`lang` 400; arhivirane niso v seznamu
- [x] T006 [P] FR-020-13, FR-020-05 — Matrika **GET /api/groups/archived** (`ArchiveIsolationMatrixSecurityIT`, preveri ali dopolni): neprijavljen 401 (3 različice), samo lastne arhivirane, nečlan ne vidi tuje, `size=1` vrne pravilen `total`
- [x] T007 [P] FR-020-05 — Matrika **GET /api/invitations/count** (obstoječi IT povabil, preveri ali dopolni): neprijavljen 401 (3 različice), samo lastna povabila, uporabnik brez profila `count: 0`
- [x] T008 [P] FR-020-06, FR-020-08 — Matrika **GET /api/groups/{groupId}** (`GroupIsolationMatrixSecurityIT`, preveri vnos): neprijavljen 401, nečlan in neobstoječa skupina 404, VIEWER/EDITOR/ADMIN/OWNER 200, arhivirana in trajno arhivirana 200
- [x] T009 [P] FR-020-19 — Matrika **PUT /api/groups/{groupId}/contacts/{contactId}** (`ContactIsolationMatrixSecurityIT`, preveri ali dopolni): 401 (3 različice), nečlan in neobstoječ kontakt 404, VIEWER 403, EDITOR/ADMIN/OWNER 2xx, arhivirana in trajno arhivirana 409 GROUP_ARCHIVED
- [x] T010 [P] FR-020-19 — Matrika **DELETE /api/groups/{groupId}/contacts/{contactId}** (`ContactIsolationMatrixSecurityIT`, preveri ali dopolni): enaki akterji kot T009 (204 za EDITOR in višje; arhivirana 409 GROUP_ARCHIVED)
- [x] T011 [P] FR-020-19 — Matrika **GET /api/groups/{groupId}/audit?contact=** (`AuditIsolationMatrixSecurityIT`, preveri ali dopolni): 401 (3 različice), nečlan 404, VIEWER in višje 200, filter na kontakt tuje skupine ne razkrije vnosov, arhivirana skupina 200

### Paket B – odjemalci in skupni pomočniki

- [x] T012 [P] FR-020-27 — Skupni pomočnik imen `frontend/src/test/names.ts` (dostopna imena glavne navigacije, preklopnika, značk vlog iz prevodov) in `e2e/tests/support/nav.ts` (`openGroup`, `goToGroups`, `goToArchived`, `goToInvitations`, `goToAccount` – deluje pri 360 in 1280 px)
- [x] T013 FR-020-10, FR-020-11, FR-020-27 — **Združljivost testnih podatkov** (en prehod z `grep`): najdi in posodobi vse, kar bere ali gradi razdelke `GET /api/groups` (`grep -rn "sections\|GroupSection\|listGroups" frontend/src e2e/tests`) in vse pričakovane vrednosti, ki jih spremenijo nova imena v navigaciji: MSW rokovalniki in `frontend/src/test/{groupsApi,msw,renderApp}.ts`, `frontend/src/features/groups/{types,api}.ts` (`GroupPage`, `GroupItem`), testi `DeletedContactsPage`, `AuditPage`, `ContactView`, `DuplicatesPage`, `GroupLayout`, `GroupPhoto` (FE), `e2e/tests/support/groups.ts` in drugi pomočniki, `e2e/tests/*.spec.ts` (`dvojniki`, `skupine`, `skupine-iskanje`, `arhiviranje`, `ogrodje`, … – klici in pričakovane vrednosti; odpiranje skupine prek T012)
- [x] T014 FR-020-06, FR-020-10 — `GroupsProvider`/`groupsContext`: namesto razdelkov (`SUMMARY_SIZE`) ploski seznam do 100 nearhiviranih skupin z vlogo (R-07), `refresh()` ostane (frontend/src/features/groups/)

**Checkpoint**: `./verify.sh quick` zelen, ciljani IT (`GroupListIT`, `GroupSearchIT`, matrike T005–T011) zeleni.

---

## Phase 3: User Story 1 – Novi temelji videza (P1) 🎯

**Goal**: žetoni v2 v obeh temah, primitivi, gibanje, vsiljene barve, ilustracije. **Independent Test**: obstoječi zasloni se izrišejo z novimi žetoni, axe brez kršitev, vedenje enako.

- [x] T015 FR-020-01, FR-020-28 — Žetoni v2 iz `tokens.json` v `app.css` (barve v svetli/temni, osem barv skupin, tipografija 600 + sledenje, razmiki, zaobljenosti 4/8/12/16/full, sence sm/md/lg, trajanja/pospeški, velikosti kontrolnikov in vrstic) in preslikava v `@theme`/shadcn (R-01); `design.md` ostane vir (frontend/src/styles/app.css)
- [x] T016 [P] FR-020-02 — Test kontrasta: za vsak par žetona besedila in sloja ≥ 4,5 : 1, robovi kontrolnikov ≥ 3 : 1, svetla in temna tema (SC-006); bere žetone iz `app.css` (frontend/src/styles/tokens.test.ts)
- [x] T017 FR-020-01 — Gumbi (primarni, mehki, sekundarni, tihi, nevarni; pritisk 0,98), vnosna polja, kartice, povezave (podčrtane samo v besedilu, FR-020-26), obroba fokusa 2 px/odmik 2 px v `shared/ui/styles.ts` in vseh uporabah razredov, ki jih zamenja (frontend/src/shared/ui/styles.ts)
- [x] T018 [P] FR-020-01, FR-020-22 — Novi primitivi: `Badge` (vloga, *Arhivirana*, *Trajno arhivirana*), `Chip` (filter), `Callout` (error/warning/info, brez barvnih levih robov), `Monogram` (32/48/24 px, slika skupine 018), `SegmentedControl`, `Avatar` v2 (frontend/src/shared/ui/)
- [x] T019 [P] FR-020-23, FR-020-25 — `dialog.tsx` (sredinski do 480/560 px, na telefonu spodnja ploskev, začetni fokus na *Prekliči* pri nevarnih), `dropdown-menu.tsx`, `sonner.tsx` (spodaj desno / spodaj na sredini, ikona stanja, zapiranje, 5 s) (frontend/src/shared/ui/)
- [x] T020 [P] FR-020-03, FR-020-04, FR-020-25 — Zmanjšano gibanje (premik ≤ 8 px, povečava 0,98–1, izklop pri `prefers-reduced-motion`), vsiljene barve (robovi, izbor, fokus), `Skeleton` (mirni bloki z blagim utripanjem, brez lesketa) (frontend/src/styles/app.css, shared/ui/Skeleton.tsx)
- [x] T021 [P] FR-020-24, FR-020-28 — Ilustracije kartoteke kot lastni SVG iz žetonov, `aria-hidden`, sledijo temi: prvi zagon, ni kontaktov, ni zadetkov, ni povabil, uvoz končan, brez povezave, 404, prijava (hero) (frontend/src/shared/ui/illustrations/)
- [x] T022 FR-020-01, FR-020-02 — Posodobi pravila žetonov (SC-003): `eslint.config.js` in `eslint-rules.test.ts` dovoljujeta samo žetone v2 (barve, sence, zaobljenosti), prepoved gradientov in `backdrop-blur` (frontend/eslint.config.js, frontend/src/test/eslint-rules.test.ts)
- [x] T023 FR-020-01 — Obstoječe FE teste, ki jih lomijo razredi/zaobljenosti/besedila primitivov, uskladi (samo videz, brez oslabitve asercij); vitest-axe na primitivih v obeh temah (frontend/src/shared/ui/*.test.tsx)
- [x] T024 FR-020-01 … -04 — E2E `izgled.spec.ts`: ključni zasloni v svetli/temni temi, `forcedColors: 'active'`, `reducedMotion: 'reduce'`, axe, pri 360 in 1280 px; opazuje se tudi čas do interaktivnosti (SC-007, informativno) (e2e/tests/izgled.spec.ts)

**Checkpoint**: `quick` zelen; ob koncu faze celoten videz v v2 brez spremembe vedenja.

---

## Phase 4: User Story 2 – Novo ogrodje in navigacija (P1)

**Goal**: vitka stranska vrstica, kartica *Trenutna skupina*, spodnja vrstica, glava skupine. **Independent Test**: pri 1280, 768, 360 px s tipkovnico in bralnikom doseže vse cilje in zamenja skupino.

### Paket A – ogrodje in števci

- [x] T025 FR-020-05, FR-020-07 — `AppShell`: postavitev (stranska vrstica ≥ 1024 px, ploskev pod 1024 px, spodnja vrstica pod 640 px), skip link, vsebina brez pomika strani (frontend/src/shared/layout/AppShell.tsx)
- [x] T026 FR-020-05 — `useNavCounts` (R-06): trije neodvisni klici (`GET /api/groups?size=1`, `/api/groups/archived?size=1`, `/api/invitations/count`), ob napaki brez števca, osvežitev ob `refresh()`/spremembi povabil; MSW rokovalniki (frontend/src/shared/layout/useNavCounts.ts, frontend/src/test/)
- [x] T027 FR-020-05, FR-020-09 — `Sidebar`: besedna znamka, *Skupine*/*Arhivirane*/*Povabila* s števci (povabila kot značka), na dnu postavka računa (slika/začetnici, ime, e-naslov) z menijem računa; brez seznama skupin, *Nove skupine* in stikala teme (frontend/src/shared/layout/{Sidebar,AccountMenu}.tsx)
- [x] T028 FR-020-07 — Spodnja vrstica s točno štirimi postavkami *Skupine*, *Arhivirane*, *Povabila*, *Račun* (ikona + napis, `aria-current`), ploskev za stransko vrstico pod 1024 px (frontend/src/shared/layout/BottomBar.tsx)
- [x] T029 [P] FR-020-27 — Testi ogrodja: `AppShell`, `Sidebar`, `BottomBar`, `useNavCounts` (števci, napaka brez števca, 401 → prijava), vitest-axe; pomočnik imen T012 (frontend/src/shared/layout/*.test.tsx)

### Paket B – skupina: kartica, preklopnik, glava

- [x] T030 FR-020-05, FR-020-06 — Kartica *Trenutna skupina* (monogram/slika, naziv z elipso in polnim imenom za bralnik, vloga) in `GroupSwitcher` (nearhivirane skupine iz `GroupsProvider`, izbira ohrani zavihek, kjer obstaja; brez skupin kartice ni) (frontend/src/shared/layout/{CurrentGroupCard,GroupSwitcher}.tsx)
- [x] T031 FR-020-08 — `GroupHeader` in `GroupLayout`: monogram, naziv, opis, značka vloge in *Arhivirana*; zavihki kot povezave z označenim aktivnim; na telefonu strnjena vrstica z nazivom, ki odpre preklopnik, in vodoravno pomičnimi zavihki (frontend/src/features/groups/{GroupHeader,GroupLayout}.tsx)
- [x] T032 FR-020-26 — Podčrtavanje povezav po pravilu (navigacija, kartice, zavihki, značke brez; »Nazaj na …« ob lebdenju) v ogrodju in glavi (frontend/src/shared/layout/, features/groups/)
- [x] T033 [P] FR-020-06, FR-020-08 — Testi: `GroupSwitcher` (zamenjava ohrani zavihek, odstranjena skupina → 404 »Te strani ni«), `GroupHeader`/`GroupLayout` (vloga, arhivirana, trajno arhivirana, dolg naziv), vitest-axe (frontend/src/shared/layout/, features/groups/*.test.tsx)
- [x] T034 FR-020-05 … -09 — E2E `ogrodje.spec.ts` (+ `@w768`): vsi cilji prek glavne navigacije, zamenjava skupine prek kartice (1280) in glave (360), spodnja vrstica s 4 postavkami, stikala teme v glavi ni, tipkovnica; posodobi preostale E2E, ki so odpirali skupino prek stranskega seznama (e2e/tests/ogrodje.spec.ts, e2e/tests/support/nav.ts)

**Checkpoint**: `quick` zelen; E2E celoten (spremenjeni `shared/**`, `app/**`) pred koncem faze.

---

## Phase 5: User Story 3 – Skupine kot ena zbirka kartic (P2)

**Goal**: ena paginirana zbirka z značko vloge; arhivirane enako. **Independent Test**: uporabnik z več vlogami filtrira in odpre skupino s klikom na kartico.

- [x] T035 FR-020-10 — `GroupCard` (monogram/slika, naziv, opis ali »Brez opisa«, število kontaktov, značka vloge z »Vloga:« za bralnik; cela kartica je ena povezava) in zbirka: mreža na namizju, vrstice v enem seznamu na telefonu (frontend/src/features/groups/GroupCard.tsx, GroupCollection.tsx)
- [x] T036 FR-020-11 — Orodna vrstica: iskanje (017), čipi vlog *Vse vloge/Lastnik/Admin/Urednik/Bralec*, števec zadetkov v `aria-live`, paginacija, stanje (`q`, `role`, `page`) v URL (frontend/src/features/groups/GroupToolbar.tsx, SectionPagination.tsx)
- [x] T037 FR-020-10, FR-020-12 — `GroupsPage`: ena zbirka iz `GET /api/groups`, primarni gumb *Nova skupina* (dialog 002 nespremenjen), napake in nalaganje (okostje > 300 ms); odstrani `GroupSection.tsx` in razdelke (frontend/src/features/groups/GroupsPage.tsx)
- [x] T038 FR-020-13 — `ArchivedGroupsPage`/`ArchivedGroupsList`: ista zbirka in orodna vrstica z `GET /api/groups/archived`, znački *Arhivirana*/*Trajno arhivirana* (ključavnica), »lastnik: izbrisan uporabnik« (frontend/src/features/groups/ArchivedGroupsPage.tsx)
- [x] T039 [P] FR-020-10, FR-020-11 — FE testi: kartica (vloga, dolg naziv, slika), filtri in iskanje, URL stanje, paginacija čez vloge, prazno stanje, vitest-axe (frontend/src/features/groups/*.test.tsx)
- [x] T040 FR-020-10 … -13 — E2E: `skupine.spec.ts`, `skupine-iskanje.spec.ts`, `arhiviranje.spec.ts` na novih zaslonih (enotna zbirka, čipi, *Nova skupina*, arhivirane) pri 360 in 1280 px, axe (e2e/tests/)

---

## Phase 6: User Story 4 – Prijava in nov račun (P2)

**Goal**: pozdravna ploskev, vrstni red Google → ločilo → e-pošta in geslo, pravila gesla sproti. **Independent Test**: tokovi 001/017 delujejo kot prej pri 360 in 1280 px.

- [x] T041 FR-020-14, FR-020-09 — `AuthLayout`: dva stolpca na namizju (hero z naslovom, stavkom, ilustracijo T021 in počasnim vzorcem po FR-020-03), na telefonu pas z besedno znamko, izbiro jezika in naslovom (frontend/src/features/auth/AuthCard.tsx → AuthLayout.tsx)
- [x] T042 FR-020-14 — `LoginPage`/`AuthForm`: *Nadaljuj z Googlom*, ločilo »ali z e-pošto«, e-pošta, geslo z gumbom za prikaz, »Pozabljeno geslo?« (podčrtano), polni primarni gumb, povezava na drugi zaslon (frontend/src/features/auth/{LoginPage,AuthForm}.tsx)
- [x] T043 FR-020-14, FR-020-15 — `RegisterPage` s tremi prednostmi in `PasswordRules`: seznam pravil 017 (`passwordValidation.ts`) z ikono in besedilom, stanje ob zapustitvi polja v `aria-live` (frontend/src/features/auth/{RegisterPage,PasswordRules}.tsx)
- [x] T044 [P] FR-020-16, FR-020-24 — `VerifyEmailPage`, `ForgotPasswordPage` in `NotFoundPage` po platnu (pozdravna ploskev ali sredinska kartica z ilustracijo), brez spremembe vedenja (frontend/src/features/auth/, frontend/src/shared/pages/NotFoundPage.tsx)
- [x] T045 [P] FR-020-14 … -16 — FE testi (tokovi 017 z MSW/emulator-fake, pravila gesla, 404, vitest-axe) (frontend/src/features/auth/*.test.tsx)
- [x] T046 FR-020-14 … -16 — E2E: `prijava.spec.ts`, `prijava-geslo.spec.ts` na novih zaslonih, axe, 360 in 1280 px (e2e/tests/)

---

## Phase 7: User Story 5 – Kontakti in kartica kontakta (P2)

**Goal**: preglednica, plavajoča vrstica izbora, lepljiva plošča, kartica po platnu. **Independent Test**: iskanje, filtri, izbor, množične akcije, ogled, urejanje, izbris delujejo kot prej pri 360, 768, 1280 px.

- [x] T047 FR-020-17 — `ContactList`: semantična preglednica (lepljiva glava, začetnice/slika, ime, največ tri značke + »+N«), zlaganje v kartice po širini vsebnika < 640 px (R-08) (frontend/src/features/contacts/ContactList.tsx)
- [x] T048 FR-020-21 — Plavajoča vrstica izbora (»Izbrano: N« + akcije) in izbrana vrstica z barvo in označenim potrditvenim poljem (frontend/src/features/contacts/selection/)
- [x] T049 [P] FR-020-17, FR-020-22 — `ContactToolbar`, `FilterChips`, `FilterPanel`, paginacija v jeziku v2 (čipi z »Odstrani filter …«, mehki gumbi) (frontend/src/features/contacts/)
- [x] T050 FR-020-18 — `ContactsPage`: od 1280 px plošča ob seznamu `sticky` z lastnim pomikom, pod 1280 px stran kontakta, na telefonu primarna akcija v spodnji vrstici akcij (frontend/src/features/contacts/ContactsPage.tsx)
- [x] T051 FR-020-19 — `ContactView`: trak barve skupine (6 px v plošči), 64 px avatar/začetnice, ime, »Dodal … · nazadnje urejeno …«, *Uredi kontakt* (primarno) pred *Izbriši kontakt* (tiho, nevarno), *Deli s kodo QR*, *Prenesi vizitko*, polja po skupinah, atributi, značke, razdelek *Zgodovina* s povezavama na zgodovino kontakta in revizijsko sled s filtrom `contact`; akcije po vlogi/stanju (frontend/src/features/contacts/ContactView.tsx)
- [x] T052 FR-020-20 — Odstrani `RevertedBadge.tsx` in prikaz `contact.reverted` na kartici (podatek ostane v API in sledi); posodobi `ContactReverted.test.tsx`: kartica po rollbacku in obnovi nima značke ali opombe, podatek je viden v sledi/zgodovini (frontend/src/features/contacts/)
- [x] T053 [P] FR-020-17 … -21 — FE testi: preglednica ↔ kartice, izbor, kartica po vlogah (VIEWER, arhivirana: akcij ni), vrstni red akcij, povezavi zgodovine, vitest-axe (frontend/src/features/contacts/*.test.tsx)
- [x] T054 FR-020-17 … -21 — E2E: `kontakti.spec.ts`, `iskanje.spec.ts`, `mnozicno-urejanje.spec.ts` (izbor, plavajoča vrstica, plošča pri 1280 px, kartica), axe (e2e/tests/)

---

## Phase 8: User Story 6 – Preostali zasloni in dialogi (P3)

**Goal**: postavitve s platna brez spremembe vedenja. Štirje neodvisni paketi (vsak ≤ 8 nalog); vsak paket zaključi z `quick` in ciljanimi testi.

### Paket A – obrazec, uvoz, zgodovina

- [x] T055 FR-020-22 — `ContactFormPage`/`ContactForm` (+ `ContactPhotoSection`, `TagInput`, `SuggestInput`, atributi) po platnu (frontend/src/features/contacts/)
- [x] T056 [P] FR-020-22 — `ImportPage`/`ImportMenu` (koraki, preslikava, rezultat) (frontend/src/features/import/)
- [x] T057 [P] FR-020-22 — `ContactHistoryPage`, `VersionPage`, primerjava različic (`history/ComparePage`), `DeletedContactsPage`, `HistoryTimeline` (frontend/src/features/history/)
- [x] T058 FR-020-22 — FE testi in E2E (`kontakti`, `uvoz-izvoz`, `izvoz-excel`, zgodovina) za zaslone paketa; axe (frontend/src/features/{contacts,import,history}/, e2e/tests/)

### Paket B – dvojniki, revizija, atributi

- [x] T059 [P] FR-020-22 — `DuplicatesPage`, `DuplicateCard`, `ComparePage`, `MergePreview` (frontend/src/features/duplicates/)
- [x] T060 [P] FR-020-22 — `AuditPage`, `AuditEntryPage`, `AuditFilters`, `AuditEntryItem`, `ChangeTable`, `InitialStateItem` (frontend/src/features/audit/)
- [x] T061 [P] FR-020-22 — `GroupAttributesPage`, `TypeConflictList` (frontend/src/features/attributes/)
- [x] T062 FR-020-22 — FE testi in E2E (`dvojniki`, `revizijska-sled`, `napredna-revizija`, `tipizirani-atributi`, `pametni-atributi`), axe (frontend/src/features/{duplicates,audit,attributes}/, e2e/tests/)

### Paket C – nastavitve, člani, povabila, račun, API

- [x] T063 [P] FR-020-22 — `SettingsPage`, `GroupDetailsSection`, `GroupManagementSection`, `MembersSection`/`MemberRow`/`MemberActionsMenu`, `PendingInvitationsSection`, `InviteMemberSection` (frontend/src/features/{groups,members,invitations}/)
- [x] T064 [P] FR-020-22 — `InvitationsPage`/`InvitationItem` (monogram skupine, sprejmi/zavrni) (frontend/src/features/invitations/)
- [x] T065 [P] FR-020-09, FR-020-22 — `AccountPage` in razdelki (profil, tema/jezik/oblika zapisa samo tukaj, načini prijave, gesla za aplikacijo, API ključi, moji podatki, izbris), `ApiKeyUsagePage` in graf (frontend/src/features/{account,apikeys}/)
- [x] T066 [P] FR-020-22 — `ApiDocsPage`, `CodeBlock` (javna stran, brez ogrodja aplikacije) (frontend/src/features/api-docs/)
- [x] T067 FR-020-22 — FE testi in E2E (`clani`, `povabila`, `moji-podatki`, `api-kljuci`), axe (frontend/src/features/**, e2e/tests/)

### Paket D – dialogi

- [x] T068 FR-020-23 — Nevarni dialogi (naslov je vprašanje, telo pove posledico, gumb ponovi dejanje, fokus na *Prekliči*): izbris kontakta, izbris/arhiviranje skupine, izbris računa, preklic API ključa, odstranitev člana, zavrnitev/umik povabila, *Lastnik ne more zapustiti*, rollback, obnova (`RestoreDialog`), sprememba tipa ključa (`ChangeTypeDialog`), obvestilo o konfliktu (frontend/src/features/**/*Dialog.tsx)
- [x] T069 FR-020-22, FR-020-23 — Dialogi obrazcev: nova skupina, množično urejanje, nov API ključ, ustvarjen ključ, geslo za aplikacijo, vklop prijave z geslom, združevanje (`MergeDialog`) (frontend/src/features/**)
- [x] T070 FR-020-22, FR-020-23 — Dialogi slike (izbira, obrezovanje: `ImageUploadDialog`, `CropCanvas`), zemljevid in približni zemljevid (`MapDialog`), koda QR (deljenje, branje) (frontend/src/shared/images/, features/map/, features/contacts/qr/)
- [x] T071 FR-020-23, FR-020-27 — FE testi dialogov: začetni fokus, spodnja ploskev pod 640 px, zaprtje z Esc, vitest-axe; E2E odprtje enega dialoga na vrsto pri 360 in 1280 px (frontend/src/**/*Dialog*.test.tsx, e2e/tests/)

---

## Phase 9: User Story 7 – Prazna stanja, obvestila in povezave (P3)

**Goal**: prijazna prazna stanja, mirno nalaganje, pravilne povezave. **Independent Test**: vsako prazno stanje ima skrito ilustracijo in dovoljeno dejanje.

- [x] T072 FR-020-24 — Skupna komponenta `EmptyState` (ilustracija T021, naslov, stavek, dejanje po vlogi in stanju skupine) in uporaba: ni skupin, ni kontaktov, ni zadetkov (skupine, kontakti, dvojniki, revizija), ni povabil, uvoz končan, sprejeto povabilo, brez povezave, 404; ilustracij na delovnih zaslonih ni (frontend/src/shared/ui/EmptyState.tsx, features/**)
- [x] T073 [P] FR-020-25 — Okostja po vseh seznamih in zaslonih (nad 300 ms, `useDelayed`), obvestila (toast) po vseh tokovih z ikono in zapiranjem (frontend/src/features/**)
- [x] T074 [P] FR-020-26 — Pregled povezav: podčrtane samo v tekočem besedilu (npr. »Pozabljeno geslo?«, e-naslov in telefon kot vrednost, ime kontakta v stavku sledi), ime kontakta v preglednici in »Nazaj na …« ob lebdenju; test z vitest po mestih uporabe (frontend/src/features/**)
- [x] T075 [P] FR-020-24, FR-020-27 — FE testi praznih stanj po vlogah (VIEWER ne vidi dejanja, arhivirana skupina brez dejanj), ilustracija `aria-hidden`, vitest-axe; E2E prvi zagon in 404 (frontend/src/**/*.test.tsx, e2e/tests/)

---

## Phase 10: Polish

- [x] T076 — `feature-map.md`: širša pravila (oblika `GET /api/groups`, značka vloge na kartici, števci navigacije, vloga in stanje skupine v glavi, `Povrnjeno` samo v sledi) (.specify/memory/feature-map.md)
- [x] T077 FR-020-01, FR-020-27 — Prevodi: preveri sl/en paritet in dostopna imena vseh novih elementov (`frontend/src/i18n/{sl,en}.json`); pregled `grep` za barve, sence in zaobljenosti mimo žetonov (SC-003)
- [x] T078 — Celoten `./verify.sh e2e` in `quickstart.md` (SC-001, SC-002, SC-004); seznam spremenjenih obstoječih testov z razlogom za opis PR (opomba: celoten e2e in backend preveri CI na PR po odločitvi razvijalca; quickstart.md pregledan na suho, usklajen s kodo; seznam testov v opisu PR)
- [x] T079 — Dodatek nadzornika: gumb X »Zapri dialog« / »Close dialog« v glavi vseh dialogov (`shared/ui/dialog.tsx`); oznaka »(neobvezno)« / »(optional)« ob neobveznih poljih (`shared/ui/FieldLabel.tsx`, zunaj dostopnega imena); E2E `getByRole('button', {name: 'Zapri'})` postane `exact: true`, da se ne podvaja z »Zapri dialog« (frontend/src/shared/ui/, e2e/tests/)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (paket A pred B) → US1 → US2 → US3 … US7; US3–US7 so po US2 neodvisne (priporočen vrstni red P2 pred P3). T021 (ilustracije) je pogoj za T041 in T072. T012 je pogoj za T013 in vse E2E.
- Paketi nadzornika: P0 = Setup + Foundational A; P1 = Foundational B + US1; P2 = US2 A; P3 = US2 B; P4 = US3; P5 = US4; P6 = US5; P7 = US6 A+B; P8 = US6 C+D; P9 = US7 + Polish.

## Phase 11: Convergence

- [x] T080 FR-020-20 — Odstranjeni neuporabljeni ključi `contacts.reverted.*` (sl, en); FR-005-19 v `docs/specs/005-revizijska-sled/spec.md` že odraža odstranitev značke
- [x] T081 FR-020-26 — Zaslon Compare: struktura (stolpci kontaktov, `fieldset` + `legend` na vrstico, razpirni del enakih vrednosti, značke, predogled) je skladna s platnom; postavitev vrstic kot kartic v isti mreži stolpcev namesto ene tabele s stolpcem polj je zavestno ohranjena (dostopnost, ožja prelomna točka 640 px); ni dodatnega dela
