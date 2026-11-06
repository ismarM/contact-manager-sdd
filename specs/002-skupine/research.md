# Research: Skupine kontaktov (002)

**Datum:** 2026-11-05 · **Vhod:** [spec.md](spec.md) (s *Clarifications* 2026-11-05), konstitucija 2.0.0, `feature-map.md` §2.1–§2.6 in
§2.10, `design.md` 4.2, 7.1, 7.2, 8.5, 8.9, 8.10, 8.13–8.16, 9.2, 9.7, 9.10, 13.4, plan 001 (`GroupAccess` nadgradi vzorce 001)

Različica `sonner` je preverjena v registru npm na dan plana (2.0.8). Odločitve so zapisane v `DECISIONS.md` D-25 … D-28 (R-12).

---

## R-01 Identifikator skupine v API-ju (D-28)

- **Decision:** `contact_group.id` je `uuid` (`DEFAULT uuidv7()`, PostgreSQL 18); v poteh `/api/groups/{groupId}` in v URL-jih
  vmesnika nastopa ta uuid. Neveljaven zapis uuid v poti → `404` (enako kot neobstoječa skupina, FR-002-08). Kontroler sprejme
  `groupId` kot niz, razčleni ga `GroupAccess` (neuspeh → `NotFoundException`); splošne preslikave `MethodArgumentTypeMismatchException`
  ni, da se odgovori drugih endpointov ne spremenijo.
- **Rationale:** konstitucija III zahteva, da nečlan ne izve ničesar o tuji skupini; zaporedne številke bi omogočile
  naštevanje skupin in sklepanje o njihovem številu. `uuidv7()` je vgrajen v PostgreSQL 18 in je časovno urejen (dober za indeks).
- **Alternatives:** `bigint identity` (naštevanje); `gen_random_uuid()` (v redu, a slabša lokalnost indeksa).

## R-02 Skupni sloj `GroupAccess` (feature-map §2.2; D-25, D-27)

- **Decision:** javen razred `si.contactmanager.group.GroupAccess` z metodo
  `Membership require(Jwt jwt, UUID groupId, Role lowest, boolean write)`; vrstni red preverjanj: uporabnik/članstvo ni najdeno →
  `NotFoundException` (404); `role < lowest` → `ForbiddenException` (403); `write` in skupina arhivirana → `GroupArchivedException` (409).
  Vrne `Membership(groupId, userId, role, archived)`. Kontrolerji ne preverjajo vlog sami.
- **Rationale:** vrstni red mora biti enak v vseh funkcionalnostih (003–011); ena izvedba pomeni en test matrike. Preverjanje 401
  opravi Spring Security pred kontrolerjem.
- **Verzija in neveljavni podatki** (§2.2, koraka 5 in 6): `GroupInputParser` telo razčleni v `Parsed(input, version, errors)` in
  ničesar ne vrže. Kontroler nato pokliče `GroupAccess.require` (koraki 2–4), `GroupService.update` pa v transakciji prebere
  vrstico z zaklepom (`SELECT … FOR UPDATE`), primerja `version` (korak 5, `409`) in šele nato vrne `400` iz `errors` (korak 6).
  Če `version` manjka ali ni število, koraka 5 ni mogoče izvesti in odgovor je `400` (po korakih 2–4).
- **Alternatives:** `@PreAuthorize` z izrazi (razprši pravila, vrstnega reda 403/409 ni mogoče zagotoviti); filter na poteh
  (nepregledno za arhivirana pravila).

## R-03 Uporabnik iz žetona

- **Decision:** `account.UserDirectory` (javen): `Optional<Long> find(Jwt)` (`SELECT id FROM app_user WHERE firebase_uid = :sub`) in
  `long ensure(Jwt)` (`INSERT … ON CONFLICT (firebase_uid) DO UPDATE SET firebase_uid = excluded.firebase_uid RETURNING id`, ime in
  e-naslov iz žetona). Branje (`GET`) uporablja `find` (ni profila → prazen seznam / 404), `POST /api/groups` uporablja `ensure`.
- **Rationale:** vmesnik vedno pokliče `PUT /api/me` ob prijavi, a zaledje se ne sme zanašati na vrstni red klicev (nobenih `500`).
  Ustvarjanje profila ob prvem pisanju je enako vedenju `PUT /api/me/preferences` iz 001.
- **Alternatives:** zahtevati predhodno sinhronizacijo (`409`/`500` ob dirki); materializirati profil v vsakem zahtevku (pisanje v bran).

## R-04 Seznam po vlogah, paginacija in abecedni red (FR-002-04; D-26, D-28)

- **Decision:** en endpoint `GET /api/groups` vrne `GroupSections`; brez `role` vrne prvo stran vsakega razdelka, z `role` in `page` samo
  izbrani razdelek. Poizvedbi: (1) števila po vlogah
  `SELECT role, count(*) FROM group_member m JOIN contact_group g … WHERE m.user_id = :u AND g.archived_at IS NULL GROUP BY role`,
  (2) po razdelek `… ORDER BY g.title COLLATE "title_<lang>", g.id LIMIT :size OFFSET :page*:size`. Strani so določene z
  `size` (1–100, privzeto 25); stranski pas in meni uporabljata `size=10`, zaslon *Skupine* 25/50/100. `id` v `ORDER BY` zagotovi stabilno
  paginacijo pri enakih naslovih (spec: naslov ni edinstven).
- **Abecedni red po pravilih jezika vmesnika:** migracija ustvari ICU kolaciji
  `CREATE COLLATION title_sl (provider = icu, locale = 'sl')` in `title_en (provider = icu, locale = 'en')`; kolacijo izbere parameter
  `lang` (`sl|en`, privzeto `en`), ime kolacije je vedno iz zaprtega seznama (ni vnosa uporabnika v SQL). Slovenski red razlikuje
  č/š/ž (č za c, š za s, ž za z); angleški ne.
- **Rationale:** razvrščanje v Javi bi zahtevalo nalaganje vseh skupin; ICU v PostgreSQL ohrani paginacijo v bazi. Podpora ICU
  v sliki `postgres:18-alpine` ob planu **ni bila preverjena**; preveri jo integracijski test `GroupListIT` (naslovi s č/š/ž v `sl`
  in `en`), ki teče na isti sliki kot Compose (`PostgresContainer.IMAGE`). Če kolacija ne deluje, se odločitev ponovno odpre z novim
  vnosom v `DECISIONS.md` (D-28).
- **Alternatives:** `ORDER BY lower(title)` (ne spoštuje č/š/ž); razvrščanje v vmesniku (ne deluje s paginacijo); jezik iz glave
  `Accept-Language` (jezik vmesnika je lahko drugačen od jezika brskalnika – FR-001-15).

## R-05 Razmerje do arhiviranja (003; D-27)

- **Decision:** `contact_group.archived_at timestamptz NULL` (`NULL` = nearhivirana). 002 ga bere (seznam, glava, `GroupAccess`) in nikoli
  ne piše. Testi arhivirano stanje pripravijo neposredno prek JDBC (`GroupFixtures.archive(groupId)`); 003 doda pisanje, stanje
  »trajno arhivirana« in seznam arhiviranih.
- **Rationale:** negativni scenariji 002 (arhivirana skupina: 200 pri branju, 409/403 pri urejanju, ni na seznamu) zahtevajo stanje,
  ki ga 002 ne ustvarja. Ena nullable vrednost je najmanjša vrzel, ki je 003 ne bo moral preimenovati.
- **Alternatives:** `archived boolean` (izgubi čas arhiviranja, ki ga 003 potrebuje za prikaz); počakati na 003 (blokira testiranje).

## R-06 Optimistično zaklepanje in nespremenjeno shranjevanje (FR-002-12)

- **Decision:** `PUT` v transakciji: `SELECT … FROM contact_group WHERE id = :id FOR UPDATE`; če `version` ≠ poslana → `409 VERSION_CONFLICT`
  s trenutnim `GroupDetail` v `current` (kdo in kdaj je spremenil – vmesnik ne rabi dodatnega klica); če so po obrezu naslova
  in normalizaciji opisa vrednosti enake obstoječim → `200` z nespremenjeno vrstico (brez `UPDATE`, brez povečanja `version`,
  `updated_by` in `updated_at`); sicer `UPDATE … SET version = version + 1, updated_by, updated_at = now()`.
  Zastarela verzija pri nespremenjenih podatkih je še vedno `409` (spec, *Edge Cases* po razjasnitvi 2026-11-05).
- **Rationale:** zaklep vrstice zagotavlja, da dva sočasna `PUT` z isto verzijo ne uspeta oba (SC-004); test `GroupConcurrencyIT`
  pošlje dva sočasna zahtevka in pričakuje točno en `200` in en `409`.
- **Alternatives:** samo `UPDATE … WHERE version = :v` (deluje, a ne loči nespremenjenega shranjevanja brez dodatnega branja);
  ETag/`If-Match` (nekonsistentno z 004, kjer verzija potuje v telesu).

## R-07 Pravila za podatke (FR-002-02)

- **Decision:** `GroupInputParser` razčleni telo in vrne napake po poljih (`title`, `description`, `color`, `version`, `body`):
  naslov obrezan (`strip()`), dolžina v **kodnih točkah** (`codePointCount`), 1–100; opis: dolžina v kodnih točkah ≤ 1000, brez obreza
  (kot ga pošlje uporabnik), prazen niz ali samo presledki → `null` (brez opisa); barva iz seznama osmih imen (velike/male črke
  se ne ujemajo – samo male), manjkajoča/`null` pri `POST` → `tinta`, pri `PUT` obvezna. Znaki: `REQUIRED`, `TOO_LONG`, `INVALID_VALUE`,
  `UNKNOWN_FIELD`, `MALFORMED` (enaka množica kot 001). Vmesnik ima enak niz pravil v `groupValidation.ts` (takojšnja napaka ob
  polju); zaledje je merodajno in napako s strežnika preslika v isto polje.
- **Rationale:** emotikoni in drugi znaki izven BMP bi se pri štetju `String.length()` šteli dvakrat; spec govori o »znakih«.

## R-08 Odjemalec API in napake

- **Decision:** `ApiError` (001) dobi `body: unknown` (razčlenjeno JSON telo odgovora, sicer `null`), da vmesnik prebere `errors[]` pri
  `400` in `current` pri `409 VERSION_CONFLICT`. Preslikava neuspeha v sporočilo (design.md 8.13) je v `features/groups/api.ts`:
  `400` → napake ob poljih; `409 GROUP_ARCHIVED` / `403` / omrežna napaka / ostalo → splošno sporočilo iz tabele dostopnih imen;
  `404` → `NotFoundPage`; `401` obravnava `authFetch` (001).
- **Rationale:** minimalna razširitev obstoječega odjemalca; ne uvaja nove knjižnice za podatke.

## R-09 Stanje seznamov v vmesniku (stranski pas, meni, zaslon)

- **Decision:** `GroupsProvider` (v `AppShell`) naloži povzetek `GET /api/groups?size=10&lang=…` enkrat za prijavljenega
  uporabnika; izpostavi `sections`, `loading`, `error` in `refresh()`. `refresh()` pokličejo ustvarjanje in uspešno urejanje skupine
  ter vrnitev na zaslon *Skupine*. Zaslon *Skupine* ima lastna stanja razdelkov (stran, velikost) in vsak razdelek lastno
  poizvedbo `?role=…&page=…&size=…`; prvo nalaganje je ena poizvedba brez `role`. Ni predpomnjenja med zasloni (PWA ne predpomni
  podatkov API, konstitucija IV).
- **Rationale:** brez dodatne knjižnice (TanStack Query bi zahteval vnos v `DECISIONS.md` in bi za 4 klice prinesel več kot koristi).
  Naloga je preprosta: osvežitev po mutaciji in ob menjavi jezika.

## R-10 Stranski pas ≥ 1024 px in meni < 1024 px

- **Decision:** `useMediaQuery('(min-width: 1024px)')` (`matchMedia`, naročnina na `change`) določa, ali `AppShell` izriše
  `Sidebar` ali `GroupSwitcher`; v DOM je vedno samo eden. Stranski pas: `nav` z aria-label »Moje skupine«, razdelki z `h2`, do 10
  povezav, »Vse skupine«, gumb *Nova skupina*. `GroupSwitcher`: shadcn *Dropdown Menu* (D-15, že v projektu), skupine v
  `DropdownMenuGroup` z oznako vloge, povezave kot `menuitem` (`asChild` + `Link`). Trenutna skupina se določi iz `useMatch('/groups/:groupId/*')`.
- **Rationale:** CSS `hidden`/`lg:` bi ohranil oba v DOM-u in v jsdom (brez CSS) podvojil dostopna imena. Preklop z `matchMedia` je
  tudi enostavno testiran (stub vrne `matches`).
- **Alternatives:** CSS-only (podvojeni elementi v dostopnostnem drevesu → axe in testi težavni).

## R-11 Dialog, obvestila, obrazec (FR-002-01, -03, -13)

- **Decision:** *Nova skupina* = shadcn *Dialog* (D-15) nad `radix-ui` (že nameščen): `DialogTitle` je `h2`, fokus se ob odprtju premakne
  na *Naslov*, ob zaprtju vrne na sprožilec; zapiranje z *Esc* in *Prekliči*; klik ob dialog ne zapre obrazca z vnosi. Obvestila uspeha =
  shadcn *Sonner* (D-15): `closeButton`, 5000 ms, spodaj desno / spodaj na sredini pod `md`, brez `richColors`; angleški privzeti nizi
  (`Notifications`, `Close toast`) se prek `customAriaLabel` in `toastOptions.closeButtonAriaLabel` nadomestijo z i18n (13.4, točka 5).
  Polja obrazca (`GroupFormFields`, `ColorPicker`) uporabljata skupno komponento v dialogu in v *Podatkih skupine*; barvni izbirnik
  je nativna skupina `radio` v `fieldset` (D-15, *Radio Group* nativni).
- **Rationale:** D-15 že določa shadcn za *Dialog* in *Sonner*; komponenti doda funkcionalnost, ki ju prva potrebuje (D-15).
  Dostopnost dialoga (ujetost fokusa, `aria-modal`) zagotovi Radix.
- **Dostopnost Sonner 2.0.8 (preverjeno v izvorni kodi paketa, `dist/index.mjs` in `index.d.ts`, 2026-11-05):** `Toaster` izriše
  `<section aria-label=… aria-live="polite" aria-relevant="additions text" aria-atomic="false" tabIndex=-1>` (dostopna vloga
  `region`); posamezno obvestilo (`li`) **nima** vloge `status`. Ime regije je privzeto »Notifications ‹bližnjica›« in se v celoti
  nadomesti s `customAriaLabel`; gumb za zapiranje ima privzeto »Close toast« in se nastavi s `toastOptions.closeButtonAriaLabel`.
  **Odločitev:** `customAriaLabel` = i18n »Obvestila« / "Notifications", `closeButtonAriaLabel` = »Zapri obvestilo« / "Close
  notification"; regija `aria-live="polite"` zadošča za objavo (design.md 8.13 dovoljuje Sonner namesto `role="status"`). Testi
  obvestilo iščejo kot besedilo znotraj `region` »Obvestila« in gumb »Zapri obvestilo«; vloge `status` ne pričakujejo.

## R-12 Zapisane odločitve (`DECISIONS.md`)

Odločitve je potrdil razvijalec, odgovoren za 002 (2026-11-05). Vnosi D-25, D-26 in D-27 spreminjajo skupne dokumente ali vplivajo
na druge funkcionalnosti, zato jih drugi razvijalec potrdi ob pregledu PR 002.

| Vnos | Vsebina | Vpliv zunaj 002 |
|---|---|---|
| D-25 | `403 {"code":"FORBIDDEN"}`; nečlan in neobstoječa skupina ostaneta `404` s praznim telesom; vrstni red §2.2 nespremenjen | feature-map §2.2, §2.10; vsi endpointi skupin (003–011) |
| D-26 | `nav` paginacije ima ime »Strani rezultatov: ‹seznam›«, če je na strani več paginiranih seznamov | design.md 8.9; poznejši seznami |
| D-27 | `archived_at` (piše 003), `group_member.version` (uporabi 007), skupni `GroupAccess`, testni podatki neposredno v testni bazi | 003, 007, 012, vse poznejše funkcionalnosti |
| D-28 | `sonner` 2.0.8, shadcn *Dialog*, `uuidv7()`, ICU kolaciji (preverjeno z `GroupListIT`), `404` s praznim telesom | – |

## R-13 Testna podpora

- **Decision (D-27):** BE: `GroupFixtures` ustvari skupine in članstva neposredno prek JDBC (druge vloge nastanejo šele s povabili v
  006/007) in nastavi `archived_at` (003 še ne obstaja). Matrika izolacije je parametriziran test: vloga ∈ {neprijavljen, nečlan,
  VIEWER, EDITOR, ADMIN, OWNER} × {nearhivirana, arhivirana} × endpoint. FE: MSW obdelovalniki `GET/POST /api/groups`,
  `GET/PUT /api/groups/:id`; `matchMedia` nadomestek v `test/`. E2E (`tests/support/groups.ts`): skupine ustvari uporabnik prek
  vmesnika; dodatne vloge in arhiviranje nastavi SQL v bazi Compose (`docker compose exec -T db psql`, z istim projektom in
  datotekami Compose kot `verify.sh`), uporabnik se poišče po e-naslovu iz emulatorja. Brez nove knjižnice in brez objave vrat baze.
- **Rationale:** konstitucija II: v testih samo Firebase Auth Emulator, Testcontainers in MSW; produkcijski endpointi samo za teste
  so prepovedani (plan.md je edini vir endpointov), zato pripravo stanja opravijo testi neposredno v testni bazi.
- **Odprto za `/speckit-tasks`:** kako `verify.sh` (`run_e2e`) pomočniku poda ukaz Compose (npr. spremenljivka okolja); to je
  sprememba skupnega orodja in se zapiše v nalogo.
