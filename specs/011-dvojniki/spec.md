# Feature Specification: Iskanje in združevanje podvojenih kontaktov

**Feature Branch**: `dvojniki` (no number; the directory is `specs/011-dvojniki/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Iskanje podvojenih kontaktov znotraj skupine po različnih kategorijah in združevanje podvojenih kontaktov s tabelo razlik, kjer uporabnik izbere, katere vrednosti bodo v združenem kontaktu (urednik in višje)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iskanje dvojnikov po kategoriji (Priority: P1)

Urednik odpre zavihek *Dvojniki* v skupini, izbere kategorijo (ime in priimek, e-naslov ali telefon) in klikne *Poišči dvojnike*. Dobi seznam skupin kontaktov, ki se v izbrani kategoriji ujemajo, z razlogom ujemanja.

**Why this priority**: brez iskanja ni mogoče najti, kaj združiti; že sam seznam dvojnikov ima vrednost (pregled kakovosti podatkov).

**Independent Test**: v skupini s kontakti »Janez Novak« (`janez@primer.si`), »janez  novak« (`JANEZ@primer.si`) in »Ana Kos« poišči dvojnike po e-naslovu – en rezultat z dvema kontaktoma in razlogom »Enak e-naslov: janez@primer.si«.

**Acceptance Scenarios**:

1. **[FR-011-01]** **Given** urednik je v nearhivirani skupini, **When** si ogleda zavihke skupine, **Then** vidi zavihek »Dvojniki« / "Duplicates"; bralec ga ne vidi, v arhivirani skupini ga ne vidi nihče (design.md 7.1).
2. **[FR-011-01]** **Given** bralec odpre pot zavihka *Dvojniki* neposredno, **When** se stran naloži, **Then** vidi razlago »Dvojnike lahko išče in združuje urednik ali višja vloga.« s povezavo na kontakte skupine, brez iskalnega obrazca; v arhivirani skupini je razlaga »Skupina je arhivirana – iskanje dvojnikov ni na voljo.«
3. **[FR-011-02]** **Given** urednik je na zavihku *Dvojniki*, **When** si ogleda obrazec, **Then** vidi skupino izbirnih gumbov »Kategorija« z možnostmi »Ime in priimek«, »E-naslov«, »Telefon« (privzeto izbrana »Ime in priimek«) in gumb »Poišči dvojnike«; izbrana kategorija je po iskanju v naslovu strani (URL), zato osvežitev in *Nazaj* ohranita rezultat.
4. **[FR-011-03]** **Given** kontakti »Janez Novak«, » janez   NOVAK « in »Janez Nóvak«, **When** urednik išče po kategoriji »Ime in priimek«, **Then** so vsi trije v isti skupini dvojnikov z razlogom »Enako ime in priimek: Janez Novak«.
5. **[FR-011-03]** **Given** kontakta »Janez Novak« in »Novak Janez« (ime in priimek zamenjana), **When** urednik išče po imenu in priimku, **Then** nista dvojnika.
6. **[FR-011-04]** **Given** kontakta z e-naslovoma `Janez@Primer.si` in ` janez@primer.si`, **When** urednik išče po e-naslovu, **Then** sta dvojnika z razlogom »Enak e-naslov: Janez@Primer.si«.
7. **[FR-011-05]** **Given** kontakti s telefoni `+386 41 123 456`, `00386 41-123-456` in `(041) 123 456`, **When** urednik išče po telefonu, **Then** sta prva dva dvojnika (»Enak telefon: +386 41 123 456«), tretji pa ni v isti skupini.
8. **[FR-011-06]** **Given** trije kontakti brez e-naslova, **When** urednik išče po e-naslovu, **Then** nobeden od njih ni v rezultatih.
9. **[FR-011-07]** **Given** po izbrani kategoriji je 30 skupin dvojnikov, **When** se rezultati prikažejo, **Then** je na strani 25 kartic (vsaka z imeni kontaktov, razlogom in gumbom »Primerjaj in združi«), paginacija pa omogoča prehod na drugo stran (design.md 8.9); vsak kontakt je v največ eni skupini.
10. **[FR-011-07]** **Given** v skupini ni dvojnikov po e-naslovu, **When** urednik išče po e-naslovu, **Then** vidi prazno stanje »Ni dvojnikov po kategoriji E-naslov.« (design.md 8.15).

---

### User Story 2 - Primerjava dvojnikov v tabeli razlik (Priority: P1)

Urednik ob kartici skupine dvojnikov klikne *Primerjaj in združi*. Odpre se tabela razlik: vrstice so polja, stolpci kontakti. Za vsako polje izbere vrednost, ki jo bo imel združeni kontakt, pri značkah obkljuka, katere ostanejo, po potrebi kontakt izloči iz združevanja, in sproti vidi predogled združenega kontakta.

**Why this priority**: tabela razlik je jedro zahteve (izbira vrednosti); brez nje združevanje ni nadzorovano.

**Independent Test**: odpri primerjavo dveh kontaktov z različnim telefonom in enakim e-naslovom, izberi telefon drugega kontakta in preveri predogled.

**Acceptance Scenarios**:

1. **[FR-011-08]** **Given** skupina dvojnikov s kontaktoma A (starejši) in B, **When** urednik klikne »Primerjaj in združi«, **Then** se odpre stran primerjave s trenutnimi podatki obeh kontaktov: stolpca A in B, vrstice »Ime«, »Priimek«, »Naslov«, »E-naslov«, »Telefon«, po ena vrstica za vsak ključ dodatnega atributa, ki ga ima vsaj en kontakt, in vrstica »Značke« (design.md 9.5).
2. **[FR-011-09]** **Given** A nima telefona, B ima `041 111 222`, C ima `041 333 444`, **When** se primerjava odpre, **Then** je vrstica »Telefon« skupina izbirnih gumbov (`fieldset` z `legend` »Telefon«) z možnostmi »(prazno)«, `041 111 222`, `041 333 444`, privzeto je izbrana `041 111 222` (prva neprazna vrednost po vrstnem redu kontaktov).
3. **[FR-011-09]** **Given** A in B imata enak e-naslov in priimek, **When** se primerjava odpre, **Then** sta ti vrstici strnjeni pod »Enaka polja (2)« in ju je mogoče razkriti.
4. **[FR-011-09]** **Given** A ima atribut `Kompetenca=web dev`, B pa `kompetenca=java`, **When** se primerjava odpre, **Then** je za ta ključ ena vrstica z izbiro med `web dev` in `java`.
5. **[FR-011-10]** **Given** A ima značke `vip`, `konferenca2025`, B pa `VIP`, `alumni`, **When** se primerjava odpre, **Then** vrstica »Značke« prikaže potrditvena polja `vip`, `konferenca2025`, `alumni`, vsa privzeto obkljukana; urednik lahko katerokoli odkljuka.
6. **[FR-011-11]** **Given** primerjava treh kontaktov A, B, C, **When** urednik pri C klikne »Izloči iz združevanja«, **Then** stolpec C izgine iz tabele, C se ne bo spremenil, izbire, ki so kazale na vrednosti C, se vrnejo na privzete; **When** ostaneta dva kontakta, **Then** izločanje ni več mogoče (gumb ni na voljo, razlaga »Združiti je treba vsaj 2 kontakta.«).
7. **[FR-011-11]** **Given** urednik izloči prvi kontakt A, **When** si ogleda primerjavo, **Then** je ohranjeni kontakt naslednji po vrstnem redu (B), kar je označeno v glavi njegovega stolpca (»Ostane«).
8. **[FR-011-12]** **Given** primerjava je odprta, **When** urednik spremeni katerokoli izbiro, **Then** se predogled združenega kontakta pod tabelo takoj posodobi in prikazuje ime, priimek, naslov, e-naslov, telefon, dodatne atribute in značke, kot bodo po združitvi.
9. **[FR-011-13]** **Given** urednik izbere za »Ime« in »Priimek« vrednost »(prazno)«, **When** klikne »Združi kontakte«, **Then** se dialog ne odpre, ob vrstici »Ime« se prikaže napaka »Vsaj ime ali priimek mora biti izpolnjen.«, nič se ne spremeni.
10. **[FR-011-13]** **Given** unija značk ima 32 značk, **When** urednik klikne »Združi kontakte«, **Then** se prikaže napaka ob vrstici »Značke« »Kontakt ima lahko največ 30 značk – odkljukaj vsaj 2.«; strežnik enako zavrne prevelik združen kontakt z `400 VALIDATION_FAILED`.

---

### User Story 3 - Združitev kontaktov (Priority: P1)

Ko je urednik zadovoljen s predogledom, klikne *Združi kontakte*, potrdi v dialogu in dobi en kontakt z izbranimi vrednostmi. Združitev je ena sprememba v revizijski sledi, zato jo lahko admin ali lastnik razveljavi z rollbackom.

**Why this priority**: končni cilj zahteve; brez njega so dvojniki le najdeni, ne odpravljeni.

**Independent Test**: združi dva kontakta, preveri, da obstaja samo ohranjeni kontakt z izbranimi vrednostmi, da drugi kontakt vrne stran »Te strani ni« in da je v revizijski sledi natanko en vnos vrste *združevanje*.

**Acceptance Scenarios**:

1. **[FR-011-14]** **Given** primerjava treh kontaktov, **When** urednik klikne »Združi kontakte«, **Then** se odpre potrditveni dialog »Združim 3 kontakte?« z besedilom »Nastal bo en kontakt ‹Janez Novak›, ostala 2 bosta izbrisana. Združevanje bo zabeleženo v revizijski sledi.«, fokus je na »Prekliči«, nevarni gumb je »Združi 3 kontakte« (design.md 8.11); *Prekliči* zapre dialog brez sprememb.
2. **[FR-011-15]** **Given** urednik je potrdil združitev kontaktov A (najstarejši), B, C, **When** se operacija izvede, **Then** obstaja samo kontakt A z izbranimi vrednostmi in obkljukanimi značkami, B in C sta izbrisana, povezava na A ostane enaka, povezavi na B in C prikažeta stran »Te strani ni«.
3. **[FR-011-15]** **Given** med združevanjem pride do napake pri brisanju C, **When** se operacija konča, **Then** se ne spremeni nič: A, B in C so v stanju pred združitvijo (atomarnost).
4. **[FR-011-16]** **Given** urednik je odprl primerjavo A in B, drug urednik pa je medtem spremenil B, **When** prvi urednik potrdi združitev, **Then** strežnik odgovori `409 VERSION_CONFLICT`, nič se ne spremeni, primerjava se znova naloži s trenutnimi podatki in izbire se ponastavijo na privzete, nad tabelo pa je opozorilo »Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.« (design.md 8.14).
5. **[FR-011-16]** **Given** primerjava treh kontaktov, od katerih je bil eden medtem izbrisan, **When** urednik potrdi združitev, **Then** odgovor je `409 VERSION_CONFLICT`, nič se ne spremeni, ponovno naložena primerjava vsebuje samo preostala dva kontakta; če ostane manj kot dva, se urednik vrne na osvežene rezultate iskanja s sporočilom »Te skupine dvojnikov ni več.«
6. **[FR-011-17]** **Given** uspešna združitev treh kontaktov, **When** član odpre revizijsko sled skupine, **Then** je zanjo natanko en nov vnos vrste »združevanje« (»združil(a) 3 kontakte«) z izvajalcem, časom, stanjem vseh treh kontaktov prej in stanjem ohranjenega kontakta potem (design.md 9.6).
7. **[FR-011-17]** **Given** združitev je zabeležena, **When** admin izvede rollback na točko tik pred združitvijo (005), **Then** so A, B in C spet v stanju pred združitvijo.
8. **[FR-011-18]** **Given** združitev je uspela, **When** se operacija konča, **Then** se prikaže obvestilo »Združenih kontaktov: 3. Ostal je kontakt Janez Novak.« in urednik je na osveženih rezultatih iskanja iste kategorije, kjer te skupine dvojnikov ni več.
9. **[FR-011-18]** **Given** strežnik združitve ne more izvesti (npr. napaka strežnika ali ni povezave), **When** urednik potrdi združitev, **Then** primerjava ostane odprta z izbirami, nad njo je sporočilo napake (`role="alert"`) z gumbom *Poskusi znova*, nič se ne spremeni.

---

### User Story 4 - Zaščita dostopa (Priority: P2)

Dvojnike sme iskati in združevati samo urednik ali višja vloga, samo v nearhivirani skupini in samo nad kontakti te skupine.

**Why this priority**: izhaja iz skupnih pravil (feature-map §2.2, §2.4); je pogoj za sprejem, a ne prinaša nove uporabniške vrednosti.

**Independent Test**: matrika izolacije za iskanje, primerjavo in združitev (401/404/403/409).

**Acceptance Scenarios**:

1. **[FR-011-19]** **Given** bralec skupine, **When** zahteva iskanje dvojnikov, primerjavo ali združitev, **Then** strežnik odgovori `403` in nič se ne spremeni.
2. **[FR-011-19]** **Given** urednik arhivirane skupine, **When** zahteva iskanje dvojnikov, primerjavo ali združitev, **Then** strežnik odgovori `409 GROUP_ARCHIVED` in nič se ne spremeni.
3. **[FR-011-20]** **Given** urednik skupine A, **When** zahteva primerjavo ali združitev, v kateri je kontakt skupine B, **Then** strežnik odgovori `404`, ne razkrije obstoja kontakta in nič se ne spremeni.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Operacije: **iskanje** dvojnikov (FR-011-02 … FR-011-07), **primerjava** – nalaganje kontaktov za tabelo razlik (FR-011-08), **združitev** (FR-011-15). Feature-map §2.4 našteva dvojnike med operacijami, ki so v arhivirani skupini zavrnjene, zato `409 GROUP_ARCHIVED` velja za vse tri.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-011-02, FR-011-08, FR-011-15, FR-011-19 | neprijavljen (brez žetona, neveljaven ali potekel žeton) | iskanje / primerjava / združitev | 401, nič se ne spremeni |
| FR-011-02, FR-011-08, FR-011-15, FR-011-19 | prijavljen nečlan ali neobstoječa skupina | iskanje / primerjava / združitev | 404, obstoj skupine se ne razkrije |
| FR-011-02, FR-011-08, FR-011-15, FR-011-19 | član z vlogo VIEWER | iskanje / primerjava / združitev | 403, nič se ne spremeni |
| FR-011-02, FR-011-08, FR-011-15, FR-011-19 | VIEWER v arhivirani skupini | iskanje / primerjava / združitev | 403 (vloga se preveri pred arhiviranostjo, feature-map §2.2) |
| FR-011-02, FR-011-08, FR-011-15, FR-011-19 | EDITOR, ADMIN ali OWNER arhivirane ali trajno arhivirane skupine | iskanje / primerjava / združitev | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-011-08, FR-011-15, FR-011-20 | EDITOR+ skupine A | primerjava / združitev s kontaktom skupine B ali neobstoječim identifikatorjem | 404, obstoj se ne razkrije, nič se ne spremeni |
| FR-011-16 | EDITOR+ | združitev, ko je bil katerikoli vključeni kontakt po odprtju primerjave spremenjen ali izbrisan | 409 VERSION_CONFLICT, nič se ne spremeni, primerjava se znova naloži |
| FR-011-11, FR-011-13 | EDITOR+ | združitev z manj kot 2 različnima kontaktoma ali s ponovljenim kontaktom | 400 VALIDATION_FAILED, nič se ne spremeni |
| FR-011-13 | EDITOR+ | združitev z rezultatom, ki krši slovar podatkov (ime in priimek prazna, > 30 značk, > 50 atributov, predolga vrednost) | 400 VALIDATION_FAILED z napakami po poljih, nič se ne spremeni |
| FR-011-02 | EDITOR+ | iskanje z neznano kategorijo | 400 VALIDATION_FAILED |
| FR-011-01 | VIEWER ali član arhivirane skupine | ogled zavihkov / neposredna pot *Dvojniki* | zavihka ni; na neposredni poti razlaga brez iskalnega obrazca |

### Edge Cases

- **Prehodnost**: kontakti A, B, C z enakim normaliziranim e-naslovom so ena skupina s tremi kontakti, ne trije pari; skupine so ločene, kontakt je v največ eni skupini (ker se primerja ena normalizirana vrednost).
- **Primerjava ne ustreza več kategoriji**: če je bil kontakt po iskanju spremenjen tako, da se ne ujema več, primerjava ob odprtju pokaže trenutne podatke; urednik se sam odloči, ali združi. Ob odprtju se nalagajo trenutne verzije, zato se konflikt ugotavlja glede na odprtje primerjave, ne glede na iskanje.
- **Kontakt, izbrisan pred odprtjem primerjave**: primerjava ga ne prikaže; če ostane manj kot 2 kontakta, se prikaže »Te skupine dvojnikov ni več.« in povezava na osvežene rezultate.
- **Vse vrednosti v vrstici enake** (tudi vse prazne): vrstica je strnjena pod »Enaka polja (N)«; vrednost se prevzame.
- **Ključ dodatnega atributa z različno velikostjo črk** v kontaktih: ena vrstica; združeni kontakt dobi zapis ključa iz kontakta, katerega vrednost je izbrana. Izbira »(prazno)« pomeni, da združeni kontakt tega atributa nima.
- **Značka z različno velikostjo črk** (`vip`, `VIP`): eno potrditveno polje; zapis iz prvega kontakta (po vrstnem redu), ki jo ima.
- **Telefon brez števk** (npr. samo `()`) šteje kot prazen in ni nikoli dvojnik.
- **Nacionalna in mednarodna oblika** (`041 123 456` in `+386 41 123 456`) se ne štejeta za enaka (glej *Assumptions*).
- **Veliko kontaktov v eni skupini dvojnikov**: tabela se vodoravno drsi; na < 640 px je primerjava zaporedje polj (design.md 9.5); urednik lahko odvečne kontakte izloči.
- **Dva urednika hkrati združujeta isto skupino**: prvi uspe, drugi dobi `409 VERSION_CONFLICT`; ker sta bila kontakta izbrisana, se drugemu prikaže »Te skupine dvojnikov ni več.«
- **Rezultati iskanja so posnetek**: se ne osvežujejo sami; *Poišči dvojnike* jih osveži.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-011-01**: Sistem MORA zavihek »Dvojniki« / "Duplicates" prikazati samo članom z vlogo EDITOR ali višjo v nearhivirani skupini; ob neposrednem odprtju poti zavihka bralec dobi razlago »Dvojnike lahko išče in združuje urednik ali višja vloga.«, član arhivirane skupine pa »Skupina je arhivirana – iskanje dvojnikov ni na voljo.«, oba s povezavo na kontakte skupine in brez iskalnega obrazca. *(najnižja vloga: EDITOR)*
- **FR-011-02**: Sistem MORA omogočiti izbiro natanko ene kategorije iskanja (skupina izbirnih gumbov »Ime in priimek«, »E-naslov«, »Telefon«; privzeto »Ime in priimek«) in iskanje z gumbom »Poišči dvojnike« med **vsemi** kontakti skupine (ne glede na iskanje in filtre seznama); izbrana kategorija in stran rezultatov sta v naslovu strani (URL). *(najnižja vloga: EDITOR)*
- **FR-011-03**: Sistem MORA v kategoriji »Ime in priimek« šteti dva kontakta za dvojnika, ko sta enaka hkrati ime in priimek (vsak zase), po normalizaciji: odstranitev presledkov na začetku in koncu, strnitev zaporednih presledkov v enega, primerjava ne glede na velikost črk in ne glede na diakritična znamenja (č = c, ó = o). *(najnižja vloga: EDITOR)*
- **FR-011-04**: Sistem MORA v kategoriji »E-naslov« šteti dva kontakta za dvojnika, ko sta njuna e-naslova enaka po odstranitvi presledkov na začetku in koncu in ne glede na velikost črk. *(najnižja vloga: EDITOR)*
- **FR-011-05**: Sistem MORA v kategoriji »Telefon« šteti dva kontakta za dvojnika, ko je enako zaporedje števk njunih telefonov, pri čemer se vsi znaki razen števk prezrejo, vodilni `00` pa se odstrani (tako sta `+386 41 123 456` in `00386 41 123 456` enaka); druge pretvorbe (npr. nacionalna ↔ mednarodna oblika) se ne izvajajo. *(najnižja vloga: EDITOR)*
- **FR-011-06**: Sistem MORA kontakt, katerega vrednost v izbrani kategoriji je po normalizaciji prazna (pri imenu in priimku: oba prazna), izpustiti iz iskanja; tak kontakt ni nikoli dvojnik. *(najnižja vloga: EDITOR)*
- **FR-011-07**: Sistem MORA kot rezultat vrniti skupine dvojnikov z vsaj dvema kontaktoma (vsi kontakti z enako normalizirano vrednostjo so ena skupina; kontakt je v največ eni skupini), paginirane po feature-map §2.6; vsaka je kartica z imeni kontaktov (razvrščenih od najstarejšega po času ustvaritve), razlogom ujemanja (»Enako ime in priimek: …«, »Enak e-naslov: …«, »Enak telefon: …« z vrednostjo prvega kontakta) in gumbom »Primerjaj in združi«; skupine so razvrščene abecedno po vrednosti v razlogu; brez zadetkov se prikaže prazno stanje »Ni dvojnikov po kategoriji ‹kategorija›.« *(najnižja vloga: EDITOR)*
- **FR-011-08**: Sistem MORA ob »Primerjaj in združi« odpreti stran primerjave (tabelo razlik) s trenutnimi podatki in verzijami kontaktov skupine dvojnikov: stolpci so kontakti v vrstnem redu iz FR-011-07, vrstice so »Ime«, »Priimek«, »Naslov«, »E-naslov«, »Telefon«, po ena vrstica za vsak ključ dodatnega atributa, ki ga ima vsaj en kontakt (ključi primerjani ne glede na velikost črk), in »Značke«; prvi kontakt je označen kot »Ostane«. *(najnižja vloga: EDITOR)*
- **FR-011-09**: Sistem MORA za vsako vrstico razen značk omogočiti izbiro natanko ene vrednosti izmed vrednosti vključenih kontaktov (prazna vrednost je možnost »(prazno)«); privzeto je izbrana vrednost prvega kontakta, če ni prazna, sicer prva neprazna vrednost naslednjih kontaktov po vrstnem redu; vrstice, v katerih imajo vsi vključeni kontakti enako vrednost, so strnjene pod »Enaka polja (N)«. *(najnižja vloga: EDITOR)*
- **FR-011-10**: Sistem MORA v vrstici »Značke« prikazati unijo značk vključenih kontaktov (značke primerjane ne glede na velikost črk, zapis iz prvega kontakta, ki jo ima) kot potrditvena polja, privzeto vsa obkljukana; združeni kontakt dobi natanko obkljukane značke. *(najnižja vloga: EDITOR)*
- **FR-011-11**: Sistem MORA omogočiti izločitev kontakta iz združevanja (»Izloči iz združevanja«), dokler ostaneta vsaj dva kontakta; izločeni kontakt se ne spremeni; ohranjeni kontakt je prvi preostali po vrstnem redu; izbire, ki so kazale na vrednosti izločenega kontakta, se vrnejo na privzete po FR-011-09. *(najnižja vloga: EDITOR)*
- **FR-011-12**: Sistem MORA pod tabelo prikazati predogled združenega kontakta (vsi predefinirani atributi, dodatni atributi in značke), ki se posodobi ob vsaki spremembi izbire ali izločitvi. *(najnižja vloga: EDITOR)*
- **FR-011-13**: Sistem MORA združeni kontakt preveriti po slovarju podatkov (feature-map §2.6: vsaj ime ali priimek, dolžine, oblika e-naslova in telefona, največ 50 atributov in 30 značk) ter zahtevati vsaj dva različna kontakta; ob kršitvi združitev zavrne z `400 VALIDATION_FAILED`, vmesnik pa napako prikaže ob ustrezni vrstici, preden odpre potrditveni dialog. *(najnižja vloga: EDITOR)*
- **FR-011-14**: Sistem MORA pred združitvijo prikazati potrditveni dialog (design.md 8.11) z naslovom »Združim N kontaktov?«, besedilom, ki pove, kateri kontakt ostane in koliko jih bo izbrisanih ter da bo združevanje zabeleženo v revizijski sledi, s fokusom na »Prekliči« in nevarnim gumbom »Združi N kontaktov«. *(najnižja vloga: EDITOR)*
- **FR-011-15**: Sistem MORA ob potrjeni združitvi atomarno posodobiti ohranjeni (prvi) kontakt z izbranimi vrednostmi in obkljukanimi značkami ter izbrisati vse druge vključene kontakte; ob kakršnemkoli neuspehu se ne spremeni nič. *(najnižja vloga: EDITOR)*
- **FR-011-16**: Sistem MORA združitev zavrniti z `409 VERSION_CONFLICT`, če je bil katerikoli vključeni kontakt po odprtju primerjave spremenjen ali izbrisan; nič se ne spremeni, vmesnik primerjavo znova naloži s trenutnimi podatki, ponastavi izbire na privzete in prikaže opozorilo »Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.«; če ostane manj kot dva kontakta, vrne uporabnika na osvežene rezultate s sporočilom »Te skupine dvojnikov ni več.« *(najnižja vloga: EDITOR)*
- **FR-011-17**: Sistem MORA vsako uspešno združitev zabeležiti kot **en** vnos v revizijski sledi skupine vrste »združevanje« (po pogodbi vnosov iz 005) z izvajalcem, časom, stanjem vseh vključenih kontaktov prej in stanjem ohranjenega kontakta potem, tako da jo rollback iz 005 lahko razveljavi. *(najnižja vloga: EDITOR)*
- **FR-011-18**: Sistem MORA po uspešni združitvi prikazati obvestilo »Združenih kontaktov: N. Ostal je kontakt ‹ime in priimek›.« in uporabnika vrniti na osvežene rezultate iste kategorije; ob neuspehu primerjava ostane odprta z izbirami in sporočilom napake z gumbom *Poskusi znova* (design.md 8.13); besedila so v sl in en. *(najnižja vloga: EDITOR)*
- **FR-011-19**: Sistem MORA iskanje, primerjavo in združitev dovoliti samo članom z vlogo EDITOR ali višjo (VIEWER → `403`) in jih v arhivirani ali trajno arhivirani skupini zavrniti z `409 GROUP_ARCHIVED`, po vrstnem redu preverjanj iz feature-map §2.2. *(najnižja vloga: EDITOR)*
- **FR-011-20**: Sistem MORA primerjavo in združitev omejiti na kontakte te skupine: identifikator, ki ni bil nikoli kontakt te skupine (kontakt druge skupine ali neobstoječ), povzroči `404` brez razkritja obstoja in brez sprememb. *(najnižja vloga: EDITOR)*

### Key Entities *(include if feature involves data)*

- **Kategorija iskanja**: ime in priimek, e-naslov ali telefon, vsaka s svojim pravilom normalizacije (FR-011-03 … FR-011-05).
- **Skupina dvojnikov**: množica vsaj dveh kontaktov iste skupine z enako normalizirano vrednostjo v izbrani kategoriji; ima razlog ujemanja; ni shranjena (izračuna se ob iskanju).
- **Primerjava (tabela razlik)**: vključeni kontakti z verzijami ob odprtju, izbira vrednosti po polju, izbrane značke, ohranjeni kontakt; ni shranjena.
- **Združeni kontakt**: ohranjeni kontakt z izbranimi vrednostmi; ostali vključeni kontakti so izbrisani.
- **Vnos revizijske sledi »združevanje«** (pogodba iz 005): izvajalec, čas, stanje vseh vključenih kontaktov prej, stanje ohranjenega kontakta potem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Urednik od odprtja zavihka *Dvojniki* do združitve dveh kontaktov s privzetimi izbirami potrebuje največ 4 klike (*Poišči dvojnike*, *Primerjaj in združi*, *Združi kontakte*, potrditev).
- **SC-002**: Iskanje dvojnikov v skupini s 5000 kontakti prikaže prvo stran rezultatov v največ 3 sekundah.
- **SC-003**: Pri 100 % preizkusnih združitev obstaja po operaciji natanko en kontakt z izbranimi vrednostmi, v revizijski sledi pa natanko en vnos »združevanje«.
- **SC-004**: Pri 100 % sočasnih sprememb med primerjavo se nobena sprememba ne prepiše tiho (združitev je zavrnjena, podatki nespremenjeni).
- **SC-005**: Vsaka združitev je razveljavljiva z rollbackom na točko pred njo, tako da so vsi vključeni kontakti v prejšnjem stanju.
- **SC-006**: Nobena operacija dvojnikov ne vrne ali spremeni kontakta druge skupine (matrika izolacije brez izjem).

## Assumptions

- **Odvisnosti**: 004-kontakti (kontakt, verzije, slovar podatkov, stran kontakta), 005-revizijska-sled (vnos vrste »združevanje«, pogodba vnosov in rollback), 003-arhiviranje (arhivirana in trajno arhivirana skupina), 002-skupine (zavihki skupine). Ta specifikacija ne določa revizijske sledi ali rollbacka, le zahteva vnos po pogodbi 005.
- **Diakritična znamenja (odločitev)**: pri imenu in priimku se prezrejo (č = c), ker so razlike pogosto posledica tipkovnice brez šumnikov (»Kovacic« / »Kovačič«); ker urednik vsako združitev pregleda in potrdi, lažno ujemanje (npr. »Čeh« / »Ceh«) ne povzroči škode.
- **Telefonska predpona (odločitev)**: `+` in `00` sta enakovredni oznaki mednarodne predpone (vodilni `00` se odstrani, `+` se kot neštevka prezre). Nacionalna oblika (`041 …`) se ne pretvarja v mednarodno (`+386 41 …`), ker bi to zahtevalo poznavanje države kontakta.
- **Ohranjeni kontakt (odločitev)**: ohrani se **prvi** kontakt skupine dvojnikov – najstarejši po času ustvaritve (oziroma prvi preostali po izločitvi) – in se posodobi z izbranimi vrednostmi; ostali se izbrišejo. Tako ostane povezava na najstarejši kontakt veljavna in njegova zgodovina v revizijski sledi neprekinjena.
- **Zbrisan kontakt v primerjavi** je `409 VERSION_CONFLICT` (ne `404`), ker je bil kontakt te skupine; `404` velja samo za identifikatorje, ki niso bili nikoli kontakt te skupine (FR-011-20). Predpostavljeno je, da sistem izbris kontakta skupine pozna (npr. iz revizijske sledi 005).
- **Iskanje je bralna operacija, a je omejeno** na EDITOR+ in na nearhivirane skupine, ker feature-map §2.4 dvojnike izrecno uvršča med zavrnjene operacije v arhivirani skupini in ker zahteva navaja »urednik in višje« za iskanje.
- **Vrednosti v tabeli razlik** so le vrednosti vključenih kontaktov; strežnik preveri združeni kontakt po slovarju podatkov (FR-011-13), izvora posamezne vrednosti pa ne preverja.
- Rezultati iskanja niso shranjeni in se ne osvežujejo sami.
- Velikost strani rezultatov: privzeto 25 skupin, izbira 25 / 50 / 100 (feature-map §2.6).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
