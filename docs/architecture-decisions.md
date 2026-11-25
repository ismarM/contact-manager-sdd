# Arhitekturne odločitve

Tu so zapisane samo odločitve, ki jih iz kode ni mogoče razbrati (pravila: `.specify/memory/constitution.md` §2.6):
nova knjižnica ali zunanja storitev, sprememba avtentikacije, pomembna odločitev o shemi, odstop od pravil projekta.
Spremembe testov, predpostavke in manjše izbire sodijo v opis commita ali PR.

- Vse odločitve so v tej datoteki, ena na razdelek, urejene po datumu; nova gre na konec. Razdelek ima sidro
  `LLLL-MM-DD-kratko-ime` (nanj kažejo sklici, npr. `docs/architecture-decisions.md#2026-11-16-api-kljuc-jwt`).
  Brez številčenja.
- Odločitev se ne popravlja za nazaj; če jo nova nadomesti, nova to pove v vrstici *Nadomešča* (s sidrom stare).
- Odločitve prve različice (`D-01` … `D-104`) so v zgodovini Gita: `git show 2365b23:DECISIONS.md`.

## Predloga

```markdown
<a id="LLLL-MM-DD-kratko-ime"></a>
## Kratek naslov odločitve

- **Datum:** LLLL-MM-DD
- **Avtor:** kdo je odločil
- **Nadomešča:** – (ali sidro odločitve)

### Kontekst
Kaj je bilo treba odločiti in zakaj.

### Odločitev
Kaj velja od zdaj naprej.

### Posledice
Kaj to pomeni za kodo, teste ali uporabnike; kaj smo zavrnili.
```

## Kazalo

- [shadcn/ui po vzorcih](#2026-11-04-shadcn-ui-po-vzorcih)
- [Gesla za aplikacijo in strežnik CardDAV samo za branje (014)](#2026-11-15-gesla-za-aplikacijo-carddav)
- [Pravi Firebase projekt v lokalnem razvoju, emulator za teste](#2026-11-15-pravi-firebase-v-lokalnem-razvoju)
- [Knjižnice za uvoz, vCard in kodo QR (014)](#2026-11-15-uvoz-izvoz-knjiznice)
- [Nova vrsta revizijskega dejanja `RESTORE` in migracija V11](#2026-11-15-vrsta-dejanja-obnova)
- [API ključ kot podpisan JWT in ločen imenski prostor `/v1` (019)](#2026-11-16-api-kljuc-jwt)
- [Prijava z e-pošto in geslom, potrjen e-naslov in povezovanje z Googlom (017)](#2026-11-16-email-geslo-povezovanje)
- [Kartografska storitev OpenStreetMap samo prek zaledja](#2026-11-16-kartografska-storitev-osm)
- [Shramba slik v PostgreSQL za vmesnikom `ImageStore`](#2026-11-16-shramba-slik-v-bazi)
- [Knjižnice za telefonske številke in zemljevid](#2026-11-16-tipizirani-atributi-knjiznice)

---

<a id="2026-11-04-shadcn-ui-po-vzorcih"></a>
## shadcn/ui po vzorcih

- **Datum:** 2026-11-04 (prenos iz arhiva, prej `D-15`)
- **Avtor:** Claude Code po navodilu razvijalcev
- **Nadomešča:** –

### Kontekst
`design.md` 13.4 za vsak vzorec vmesnika zahteva natanko en način izvedbe: nativni element ali komponento shadcn/ui.

### Odločitev

| Vzorec | Način |
|---|---|
| Alert Dialog / Dialog | shadcn |
| Dropdown Menu | shadcn |
| Command / Combobox | shadcn |
| Sonner | shadcn |
| Checkbox / Radio Group | nativni |
| Button / Input / Textarea / Label / Table / Separator | nativni |
| Select | nativni |
| Card / Sidebar / Tooltip / Carousel / Chart | nativni (lastni preprosti elementi) |

Komponento doda funkcionalnost, ki jo prva potrebuje (`frontend/src/shared/ui/`).

### Posledice
- `frontend/components.json` (slog `new-york`, `stone`, `cssVariables`, alias `ui` → `@/shared/ui`) in
  `frontend/src/shared/lib/cn.ts` sta napisana ročno; `shadcn init` se ne poganja, ker bi prepisal žetone v `app.css`
  in dodal `lucide-react` (ikone so Tabler).
- Pot `@/*` → `src/*` je nastavljena v `tsconfig` in Vite.

---

<a id="2026-11-15-gesla-za-aplikacijo-carddav"></a>
## Gesla za aplikacijo in strežnik CardDAV samo za branje (014)

- **Datum:** 2026-11-15
- **Avtor:** razvijalec (Clarifications Q3, posvet `/rollout`), docs/specs/014-uvoz-izvoz/research.md R-08, R-09
- **Nadomešča:** –

### Kontekst
Odjemalci CardDAV (iOS, DAVx5, Thunderbird) ne podpirajo prijave z Googlom, ki je edini način prijave v aplikacijo.
Za CardDAV je potreben nov tip klicatelja in nov način prijave.

### Odločitev
- Contact Manager je strežnik CardDAV pod `/dav/` (ročna izvedba na Spring MVC), vsaka skupina uporabnika je imenik
  **samo za branje**; vsako pisanje vrne `403`.
- Ločena veriga Spring Security (`@Order(1)`, `/dav/**`, `/.well-known/carddav`): stateless, brez CSRF, samo HTTP
  Basic z e-naslovom računa in **geslom za aplikacijo**; Firebase JWT na teh poteh ne velja, Basic na `/api` ne velja.
- Geslo: 28 naključnih znakov base32 (140 bit), prikazano enkrat; hrani se samo SHA-256 (primerjava v konstantnem
  času), največ 10 na uporabnika, preklic izbriše vrstico, izbris računa vsa gesla.
- Zaklep: 10 zaporednih neuspehov v 15 minutah zaklene prijavo CardDAV za 15 minut (stanje v bazi `dav_login_state`).
- **HTTPS:** Basic pošilja geslo v vsakem zahtevku, zato je CardDAV v produkciji dosegljiv samo prek HTTPS (TLS pred
  nginx). Strežnik HTTP sam ne zavrača (lokalni compose teče brez TLS) – odločitev razvijalca.

### Posledice
Nov tip poverilnice v podatkovnem modelu (V12) in v izvozu »moji podatki«. Zavrnjeno: knjižnica WebDAV (licenca,
teža), bcrypt (počasno ob vsakem zahtevku sinhronizacije), stanje zaklepa v pomnilniku.

---

<a id="2026-11-15-pravi-firebase-v-lokalnem-razvoju"></a>
## Pravi Firebase projekt v lokalnem razvoju, emulator za teste

- **Datum:** 2026-11-15
- **Avtor:** Ismar (izvedba: Claude Code)
- **Nadomešča:** –

### Kontekst
Projekt `contact-manager-sdd-6bd9b` ima omogočeno Google prijavo. Do zdaj je razvojni sistem vedno uporabljal Auth Emulator
(`demo-contact-manager`), pravi projekt pa ni bil nikjer povezan. Koda je že podpirala oba načina (backend: prazen
`FIREBASE_AUTH_EMULATOR_HOST` = produkcija; frontend: `VITE_FIREBASE_EMULATOR=false`; brisanje identitete 012: `GoogleAccessTokenSource`).

### Odločitev
- Nova prekrivna datoteka `compose.firebase.yaml` (ločen projekt Compose `contact-manager-firebase`, ločena baza) preklopi na pravi
  projekt; storitev `auth` dobi profil `emulator` in se ne zažene.
- Vrednosti pridejo iz `.env.firebase` (v `.gitignore`); ključ storitvenega računa je mount izven repozitorija prek
  `GOOGLE_APPLICATION_CREDENTIALS` (012, research R-06). Obvezne spremenljivke so označene z `${VAR:?}`.
- `frontend/nginx.conf` razrešuje `auth` leno (`resolver` + spremenljivka), sicer nginx ne bi zagnal brez storitve `auth`.
- Privzeto (`compose.yaml`, `verify.sh`, CI, Testcontainers) ostane emulator; testi ne potrebujejo pravih ključev (konstitucija §3.2).

### Posledice
- Brez kode zaledja ali vmesnika; spremenjeni sta nginx.conf (enako vedenje) in konfiguracija Compose.
- Prava prijava je ročno preverjanje, ne avtomatski test. Zavrnjeno: pravi projekt v CI ali testih (skrivnosti, nedeterminizem).

---

<a id="2026-11-15-uvoz-izvoz-knjiznice"></a>
## Knjižnice za uvoz, vCard in kodo QR (014)

- **Datum:** 2026-11-15
- **Avtor:** razvijalec (predlog nadzornika `/rollout`), docs/specs/014-uvoz-izvoz/research.md R-01, R-02, R-06, R-07
- **Nadomešča:** –

### Kontekst
Funkcionalnost 014 bere preglednice `.xlsx` in vizitke vCard 2.1–4.0, piše vCard 3.0 ter izdela in bere kode QR v
brskalniku (tudi brez povezave).

### Odločitev
- **`org.dhatim:fastexcel-reader` 0.20.2** (Apache-2.0): obstoječa odvisnost testov 010 preide v `compile`, ista
  različica kot pisalnik. Nima zaščite pred zip-bombo, zato jo ima aplikacija (`XlsxGuard`: največ 500 vnosov, ≤ 100 MB
  razširjeno, razmerje stiskanja, datoteka ≤ 10 MB, ≤ 10 000 vrstic).
- **`com.googlecode.ez-vcard:ez-vcard` 0.12.1** (BSD-2) brez opcijskih `jackson-core` in `jsoup`. Knjižnica je stabilna,
  zadnja izdaja je iz leta 2023 (avgust); vzdrževanje je redko, zato je uporaba zaprta v `VcardReader` in `VcardWriter`.
- **`qrcode` 1.5.4** (MIT, z `@types/qrcode` 1.5.6): koda QR (SVG za prikaz, PNG za prenos) v brskalniku.
- **`barcode-detector` 3.2.3** (MIT, `zxing-wasm` 3.1.6): polyfill `BarcodeDetector`; `zxing_reader.wasm` se gosti
  lokalno (`?url`, precache PWA), ne s CDN (konstitucija VI).

### Posledice
Večji sveženj frontenda le ob odprtju okna za branje kode (dinamični uvoz). Zavrnjeno: Apache POI (velikost, pretekle
ranljivosti), SheetJS (licenca), `html5-qrcode`/`jsQR` (slabše branje), ročni razčlenjevalnik vCard na zaledju.

---

<a id="2026-11-15-vrsta-dejanja-obnova"></a>
## Nova vrsta revizijskega dejanja `RESTORE` in migracija V11

- **Datum:** 2026-11-15
- **Avtor:** Ismar (odločitev Q2 pri 015), izvedba Claude
- **Nadomešča:** –

### Kontekst
Obnova enega kontakta (015) mora biti v sledi razločljiva od urejanja in od skupinskega rollbacka ter se sklicevati na obnovljeno različico. Obstoječi `CHECK` na `audit_entry` dovoljuje pet vrst in sklic na cilj samo pri `ROLLBACK`.

### Odločitev
`audit_entry.action` dobi vrednost `RESTORE`; sklic na različico uporablja obstoječa stolpca `target_entry_id` / `target_initial` (`CHECK audit_entry_target` velja za `ROLLBACK` in `RESTORE`). Migracija `V11__napredna_revizija.sql` zamenja obe omejitvi in doda dva indeksa; novih tabel in stolpcev ni. Zgodovina, različice in seznam izbrisanih kontaktov se izpeljejo iz `audit_change`.

### Posledice
Pri vzporedni funkcionalnosti 014 (ki bi lahko dodala svojo vrsto dejanja ali `V11`) mora druga migracija v `CHECK` vključiti unijo vrst, imeni datotek in številki verzij se ne smeta ujemati (kdor združi drugi, preštevilči). Zavrnjeno: ponovna uporaba `ROLLBACK` z enim kontaktom (napačen stavek), `UPDATE` z oznako (obnova ni razločljiva), ločena tabela zgodovine ali izbrisanih kontaktov (podvajanje).

---

<a id="2026-11-16-api-kljuc-jwt"></a>
## API ključ kot podpisan JWT in ločen imenski prostor `/v1` (019)

- **Datum:** 2026-11-16
- **Avtor:** razvijalec (posvet `/rollout`, docs/specs/019-api-kljuci/spec.md *Clarifications*), research R-01 … R-04
- **Nadomešča:** –

### Kontekst
Programi in skripte uporabnikov potrebujejo dostop do kontaktov brez prijave z Googlom/Firebase. Potrebna sta nov tip
klicatelja in nova poverilnica. Razvijalec je zahteval najpreprostejši mehanizem, ki ne hrani skrivnosti v bazi.

### Odločitev
- **Poverilnica:** API ključ je `cmk_` + kompaktni JWT, podpisan s HS256 (Nimbus JOSE + JWT, ki je že v projektu prek
  `spring-boot-starter-security-oauth2-resource-server`; brez nove odvisnosti). Trditve: `iss` `contact-manager`,
  `aud` `contact-manager-api`, `sub` (id uporabnika), `jti` (id vrstice `api_key`), `iat`, neobvezen `exp` (brez roka
  ga ni) in `scp` (obseg: `{"all":"READ|WRITE"}` ali `{"groups":{"<groupId>":"READ|WRITE",…}}`).
- **Preverjanje ob vsaki zahtevi:** predpona → podpis, `iss`, `aud`, `exp` → vrstica `api_key` po `jti` (obstaja, isti
  uporabnik, `revoked_at IS NULL`). Izbris računa kaskadno izbriše vrstice, zato ključ izbrisanega računa vrne `401`.
- **Hramba:** žeton in njegova zgoščena vrednost se ne hranita. Vrstica hrani ime, prepoznavni del (zadnjih 6 znakov),
  prikazni obseg, čase, preklic in statistiko.
- **Podpisni ključ:** `API_KEY_SIGNING_SECRET` (≥ 32 bajtov, base64) iz okolja; brez vrednosti se zaledje ne zažene.
  V testih se generira naključno; v Gitu ni nobene vrednosti.
- **Imenski prostor:** operacije API so pod `/v1/**` v ločeni verigi Spring Security (`@Order(2)`): stateless, brez
  CSRF, brez CORS, samo `Authorization: Bearer cmk_…`. Firebase žeton na `/v1` in API ključ na `/api` vrneta `401`.
  `EmailVerifiedFilter` (017) velja samo za `/api/**`.

### Posledice
- Zamenjava podpisnega ključa okolja razveljavi vse API ključe (uporabniki jih ustvarijo znova) – sprejemljivo.
- Preklic deluje takoj, ker se vrstica preveri ob vsaki zahtevi; JWT sam ne zadošča.
- Obseg je v podpisanem žetonu, vrstica `api_key_group` je samo za prikaz; oba nastaneta hkrati in se ne spreminjata.
- Zavrnjeno: naključna skrivnost + SHA-256 (kot gesla 014) – razvijalec je izbral JWT; RS256/ES256 (ni potrebe po
  javnem ključu, ker preverja samo zaledje); OAuth 2 odjemalci (preobsežno za prvo različico).

---

<a id="2026-11-16-email-geslo-povezovanje"></a>
## Prijava z e-pošto in geslom, potrjen e-naslov in povezovanje z Googlom (017)

- **Datum:** 2026-11-16
- **Avtor:** razvijalec 017 (Clarifications 2026-11-16, odobritev razširitve §5), docs/specs/017-email-geslo-skupine/research.md R-01 … R-05
- **Nadomešča:** –

### Kontekst
Do 017 je bil edini ponudnik prijave Google (konstitucija §5), ki vedno da potrjen e-naslov. Z Email/Password lahko
kdorkoli ustvari račun s tujim e-naslovom; povabila (006) in en profil na e-naslov (`UNIQUE(lower(email))`) pa so vezani
na e-naslov. Projekt ima v Firebase vključeno zaščito pred naštevanjem e-naslovov (EEP), ki blokira
`accounts:update`/`setAccountInfo` in `linkWithCredential` z `EmailAuthCredential` za dodajanje gesla obstoječemu računu.

### Odločitev
- **Potrjen e-naslov na zaledju:** `EmailVerifiedFilter` za `BearerTokenAuthenticationFilter` zavrne vsak veljaven
  žeton brez `email_verified=true` (samo logična vrednost) s `403 EMAIL_NOT_VERIFIED`, pred kontrolerji – tudi
  `PUT /api/me`, zato profil pred potrditvijo ne nastane. Izjema je `GET /api/health`; veriga `/dav/**` (gesla za
  aplikacijo) je ločena in nespremenjena. 403 (ne 401), da odjemalec ne šteje zavrnitve za izgubo seje.
- **Vmesnik po potrditvi:** `user.reload()` → `getIdToken(true)` → izrecno obvestilo poslušalcem, šele nato
  `PUT /api/me` (`onAuthStateChanged` se po `reload()` ne sproži).
- **Dodajanje gesla obstoječemu (Google) računu:** REST `accounts:signUp` z `idToken`, `email` (e-naslov računa, samo
  za branje) in `password` – dokumentirana pot ob vključeni EEP. Pogoj je ponovna avtentikacija (svež `idToken`).
  Gateway primerja `localId` odgovora z UID pred klicem; nato `signInWithEmailAndPassword` z istim geslom (svež žeton
  in stanje SDK), preveri nespremenjen `auth.currentUser.uid` (sicer odjava in napaka), `email_verified` prebere brez
  predpostavke. REST odgovora (`idToken`, `refreshToken`) ne shranjujemo.
- **EEP ostane vključena**, UID se nikoli ne spremeni, samodejnega združevanja računov ni; Google se računu z geslom
  doda z `linkWithPopup`.
- **Sporočila so nevtralna:** neuspešna prijava (`invalid-credential`, `user-not-found`, `wrong-password`) ima eno
  sporočilo; ponastavitev gesla vedno isto potrdilo; registracija z obstoječim e-naslovom ne razkrije ponudnika.
- Geslo najmanj 8 znakov: vmesnik in Firebase *password policy* (nastavi razvijalec v Console).

### Posledice
Gesla so samo v Firebase, zaledje jih nikoli ne vidi; podatkovni model in migracije so nespremenjeni. Auth Emulator
EEP ne posnema, zato testi dokazujejo potrditev, UID in sinhronizacijo, zavrnitev `accounts:update` ob EEP pa le ročni
preizkus v ločenem testnem projektu (quickstart.md). Zavrnjeno: `accounts:update`/`linkWithCredential` (blokirano ob
EEP), izklop EEP, preverjanje potrditve v validatorju JWT (bi dalo 401) ali v vsakem kontrolerju (pozabljivo), lasten
endpoint za gesla.

---

<a id="2026-11-16-kartografska-storitev-osm"></a>
## Kartografska storitev OpenStreetMap samo prek zaledja

- **Datum:** 2026-11-16
- **Avtor:** razvijalec (potrjeno ob pregledu plan.md, 2026-11-16)
- **Nadomešča:** –

### Kontekst
016 doda zemljevid naslovov in samodokončanje naslova (spec Clarifications Q2). Konstitucija VI ne dovoljuje klicev na tuje
storitve iz brskalnika; besedilo naslova kontakta je osebni podatek.

### Odločitev
- Zaledje (paket `maps`) je edini odjemalec: lokacija – Nominatim, predlogi – Photon (podatki OSM; Nominatim samodokončanja
  ne dovoljuje), ploščice – `tile.openstreetmap.org` prek posrednika. URL-ji nastavljivi (`MAPS_NOMINATIM_URL`,
  `MAPS_PHOTON_URL`, `MAPS_TILE_URL`), tako da je mogoč lasten strežnik.
- Posreduje se samo besedilo naslova na izrecno zahtevo (gumb zemljevida, vpis s samodokončanjem, *Razčleni naslov*);
  `User-Agent: ContactManager/<različica> (+https://github.com/ismarM/contact-manager-sdd)`, brez e-naslova, piškotkov in
  podatkov uporabnika; besedilo naslova se ne beleži.
- Omejevanje: Nominatim 1 zahteva/s globalno; Photon 5/s globalno in 2/s na uporabnika; ploščice 20/s globalno in 60/10 s
  na uporabnika. Predpomnilnik samo v pomnilniku (lokacije 24 h, predlogi 1 h, ploščice do 7 dni / 50 MB); koordinate se ne
  shranjujejo.
- Napaka storitve nikoli ne ovira dela s kontaktom (503 `MAP_SERVICE_UNAVAILABLE`, prazni predlogi).
- Testi brez pravih klicev: nadomestni strežnik v zaledju, MSW v FE, `osm-stub` v E2E.

### Posledice
- Konstitucija VI se dopolni z izjemo za strežniške klice OSM in z »obliko zapisa« med hranjenimi podatki.
- Ploščice javnega strežnika OSM so dovoljene le za majhen promet; ob rasti prehod na ponudnika ploščic (nov ADR).
- En primerek zaledja (omejevalnik v pomnilniku); več primerkov bi potrebovalo skupen omejevalnik.
- Zavrnjeno: klici iz brskalnika (FR-016-23), komercialni ponudnik (ključi, pogodba), statična slika (ni premikanja).

---

<a id="2026-11-16-shramba-slik-v-bazi"></a>
## Shramba slik v PostgreSQL za vmesnikom `ImageStore`

- **Datum:** 2026-11-16
- **Avtor:** Ismar (potrditev plana 018), izvedba Claude
- **Nadomešča:** –

### Kontekst
Funkcionalnost 018 uvaja tri vrste slik (profil, skupina, kontakt). Slike so po obdelavi majhne (96, 256 in 512 točk, 3–80 KB skupaj), pripadajo skupini ali uporabniku in jih je treba skupaj z lastnikom tudi trajno izbrisati (izbris skupine, računa, združitev dvojnikov). Odločiti je bilo treba, kje jih hraniti.

### Odločitev
Slike so v PostgreSQL: tabeli `image` (metapodatki, `revision`, lastnik) in `image_variant` (`bytea` po velikosti), ena slika na lastnika (delni `UNIQUE` indeksi). Aplikacija jih vedno bere in piše prek vmesnika `ImageStore` (`put`, `get`, `revision`, `delete`, `contactRevisions`, `mergeInto`, `reassign`); samo `PostgresImageStore` pozna SQL. Slika kontakta nima tujega ključa na `contact` (kontakt je lahko izbrisan in obnovljen z istim id): sprožilca `AFTER DELETE/INSERT` na `contact` nastavita in odstranita `detached_at`. Tuji ključi z `ON DELETE CASCADE` izbrišejo slike ob izbrisu skupine ali računa. Migracija: `V15__slike.sql` (začasna številka, glej plan 018, naloga T093).

Pogodba vmesnika je preverjena z nizom `ImageStoreContract`, ki ga prestaneta PostgreSQL (`ImageStoreIT`) in pomnilniška implementacija (`ImageStorePortabilityTest`); druga shramba mora prestati isti niz.

### Posledice
- Transakcijsko brisanje, ena varnostna kopija in brez nove storitve v Composeu in testih; API, vmesnik in podatki skupin so neodvisni od shrambe.
- Zavrnjeno: Firebase Storage (po avtorjevem vedenju plačljiv plan, preveriti pri Googlu; pravila varnosti bi podvajala avtorizacijo), S3/MinIO (nova storitev in usklajevanje brisanja s skupinami), lokalni disk (varnostne kopije, več primerkov).
- **Prehod na S3 (ali drugo shrambo):** (1) nova implementacija `ImageStore` (ključ `slike/<kind>/<lastnik>/<velikost>`, `revision` v metapodatkih ali v tabeli `image`, ki ostane); (2) pogodbeni testi `ImageStoreContract` morajo biti zeleni; (3) enkratna kopija iz `image_variant` v novo shrambo, nato preklop `@Primary` implementacije; (4) brisanje ob izbrisu skupine in računa, ki ga zdaj opravijo tuji ključi, je treba nadomestiti z izrecnim klicem `delete` (kaskada v shrambi ne obstaja); (5) API, `ETag` (`<revision>-<velikost>`) in vmesnik se ne spremenijo.
- Omejitev nalaganj (`UploadRateLimiter`) je v pomnilniku enega primerka; pri več primerkih je potrebna skupna shramba (predpostavka v research R-09).

---

<a id="2026-11-16-tipizirani-atributi-knjiznice"></a>
## Knjižnice za telefonske številke in zemljevid

- **Datum:** 2026-11-16
- **Avtor:** razvijalec (potrjeno ob pregledu plan.md, 2026-11-16)
- **Nadomešča:** –

### Kontekst
016 normalizira telefone po mednarodnem standardu številčenja (E.164, nacionalni prikaz po državi številke) in prikaže
interaktiven zemljevid, upravljiv s tipkovnico.

### Odločitev
- Zaledje: `com.googlecode.libphonenumber:libphonenumber` 9.0.42 (Apache-2.0) – preverjanje, E.164, kratke številke.
- Frontend: `libphonenumber-js` 1.13.15 (MIT, metapodatki `max`, nalaganje z `import()`) – prikaz po shemi in opozorilo
  ob polju; odloča strežnik.
- Frontend: `leaflet` 1.9.4 (BSD-2) in `@types/leaflet` 1.9.22 (dev) – zemljevid; ploščice z žetonom prek `/api/map-tiles`,
  CSS in ikone v paketu.
- Oblike naslovov po državah: lastna tabela JSON iz podatkov Google libaddressinput (Apache-2.0), v zaledju in frontendu,
  test enakosti; brez knjižnice.

### Posledice
- Metapodatki številčenja se posodabljajo z novimi različicami obeh knjižnic; razlika med njima vpliva le na opozorilo v FE.
- Zavrnjeno: lastna pravila za telefone (nepopolna), MapLibre (vektorske ploščice, WebGL, večji paket).
