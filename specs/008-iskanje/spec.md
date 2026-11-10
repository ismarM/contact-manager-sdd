# Feature Specification: Iskanje, filtri in razvrščanje kontaktov

**Feature Branch**: `iskanje` (no number; the directory is `specs/008-iskanje/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Iskanje kontaktov znotraj skupine s filtri (predefinirani atributi, dodatni atributi, značke) in razvrščanjem naraščajoče/padajoče (bralec in višje)."

## Clarifications

### Session 2026-11-10

- Q: Po pravilih katerega jezika se kontakti razvrščajo (privzeto in po izbranem polju), glede na to, da D-38 (004) določa kodne točke Unicode, ta spec pa abecedo jezika vmesnika? → A: vedno po slovenski abecedi (Č za C, Š za S, Ž za Z), neodvisno od jezika vmesnika in uporabnika; velikost črk se ne upošteva; enake vrednosti razločijo priimek, ime, čas nastanka in id, da so strani paginacije stabilne. Odločitev D-63 nadomešča D-38 (feature-map §2.6 in FR-004-06 sta usklajena).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hitro iskanje po kontaktih skupine (Priority: P1)

Član skupine (tudi bralec) v iskalno polje nad seznamom kontaktov vpiše del imena, priimka, naslova, e-naslova ali telefona in takoj vidi samo ustrezne kontakte ter število zadetkov.

**Why this priority**: Iskanje je najpogostejši način, kako uporabnik v večji skupini najde kontakt; brez njega je seznam pri nekaj sto kontaktih neuporaben.

**Independent Test**: V skupini s pripravljenimi kontakti bralec vpiše iskalni niz in preveri, da seznam vsebuje natanko ustrezne kontakte in da je število zadetkov prikazano in sporočeno bralniku zaslona.

**Acceptance Scenarios**:

1. **[FR-008-01]** **Given** skupina s kontakti »Janez Novak« (e-naslov janez@feri.si) in »Mojca Kralj«, **When** bralec v polje »Iskanje po kontaktih« vpiše `feri`, **Then** se po kratkem premoru (design.md 8.7) prikaže samo »Janez Novak«.
2. **[FR-008-02]** **Given** kontakt s priimkom »Zupančič«, **When** član išče `ZUPANCIC` ali `zupanč`, **Then** je kontakt med zadetki (velikost črk in strešice se ne upoštevajo).
3. **[FR-008-02]** **Given** kontakta »Janez Novak« in »Janez Kralj«, **When** član išče `janez novak`, **Then** je zadetek samo »Janez Novak« (vsaka beseda mora biti v vsaj enem predefiniranem atributu).
4. **[FR-008-01]** **Given** kontakt z dodatnim atributom `kompetenca=web dev` in značko `konferenca2025`, ki nobenega od teh nizov nima v predefiniranih atributih, **When** član išče `web dev` ali `konferenca2025`, **Then** kontakt ni med zadetki (prosto iskanje zajema samo predefinirane atribute; za ostalo so filtri).
5. **[FR-008-10]** **Given** iskanje vrne 18 kontaktov, **When** se rezultati osvežijo, **Then** je vidno in bralniku zaslona sporočeno »Najdenih 18 kontaktov«.
6. **[FR-008-13]** **Given** iskanje nima zadetkov, **When** se rezultati osvežijo, **Then** je prikazano prazno stanje »Ni kontaktov, ki ustrezajo filtrom.« z gumbom *Počisti filtre*.

---

### User Story 2 - Filtri po atributih in značkah (Priority: P1)

Član odpre panel *Filtri*, doda enega ali več pogojev nad predefiniranimi ali dodatnimi atributi in izbere značke. Uporabljeni filtri so vidni kot odstranljive oznake nad seznamom.

**Why this priority**: Prvotna zahteva izrecno zahteva filtre po atributih, dodatnih atributih in značkah; filtri so tudi podlaga za izbor »vseh zadetkov« (009) in izvoz (010).

**Independent Test**: V skupini s kontakti z znanimi atributi in značkami član nastavi kombinacijo pogojev in preveri, da so prikazani natanko kontakti, ki ustrezajo vsem pogojem, in da odstranitev posamezne oznake filtra ustrezno razširi seznam.

**Acceptance Scenarios**:

1. **[FR-008-03]** **Given** kontakti z dodatnim atributom `kompetenca` z vrednostmi »web dev«, »Web Design« in »backend«, **When** član doda pogoj *kompetenca* vsebuje `web`, **Then** sta zadetka kontakta z »web dev« in »Web Design«.
2. **[FR-008-03]** **Given** pogoja *kompetenca* vsebuje `web` in *E-naslov* vsebuje `feri.si`, **When** član uporabi filtre, **Then** so zadetki samo kontakti, ki izpolnjujejo oba pogoja.
3. **[FR-008-04]** **Given** kontakt A z značkama `konferenca2025` in `vip` ter kontakt B samo z `vip`, **When** član izbere znački `vip` in `konferenca2025`, **Then** je zadetek samo kontakt A.
4. **[FR-008-05]** **Given** iskalni niz `novak`, pogoj *Telefon* vsebuje `041` in značka `vip`, **When** se uporabijo, **Then** so zadetki samo kontakti, ki ustrezajo iskanju **in** pogoju **in** znački.
5. **[FR-008-06]** **Given** skupina, v kateri obstajata dodatna ključa `kompetenca` in `podjetje`, in druga skupina s ključem `skrivno` in značko `tajno`, **When** član prve skupine odpre panel *Filtri*, **Then** izbira polja ponudi ime, priimek, naslov, e-naslov, telefon, `kompetenca` in `podjetje`, seznam značk pa samo značke prve skupine (brez `skrivno` in `tajno`).
6. **[FR-008-11]** **Given** uporabljena filtra *Značka: konferenca2025* in *kompetenca vsebuje web*, **When** član aktivira gumb »Odstrani filter Značka: konferenca2025«, **Then** filter izgine, seznam se osveži, gumb *Filtri* pokaže »Filtri (1)«, fokus pa ostane v območju oznak filtrov.
7. **[FR-008-12]** **Given** uporabljeni iskalni niz in dva filtra, **When** član aktivira *Počisti filtre*, **Then** se iskanje in vsi filtri odstranijo, prikaže se prva stran vseh kontaktov, razvrstitev in velikost strani pa ostaneta.

---

### User Story 3 - Razvrščanje rezultatov (Priority: P2)

Član razvrsti seznam po kateremkoli predefiniranem atributu ali dodatnem ključu, naraščajoče ali padajoče, tudi na telefonu, kjer glav stolpcev ni.

**Why this priority**: Razvrščanje je del prvotne zahteve, a seznam je uporaben že s privzeto razvrstitvijo.

**Independent Test**: Član izbere polje in smer razvrščanja ter preveri vrstni red, vključno s kontakti brez vrednosti in enakimi vrednostmi.

**Acceptance Scenarios**:

1. **[FR-008-07]** **Given** prvi obisk seznama brez parametrov, **When** se seznam prikaže, **Then** je razvrščen po priimku, nato imenu, naraščajoče po slovenski abecedi, neodvisno od jezika vmesnika (č za c, š za s, ž za z), npr. »Cene«, »Čeh«, »Dana«, »Šuligoj«, »Zupan«, »Žagar«.
2. **[FR-008-07]** **Given** kontakti z dodatnim atributom `podjetje` »Beta«, »Alfa« in kontakt brez tega atributa, **When** član izbere *Razvrsti* po `podjetje` padajoče, **Then** je vrstni red »Beta«, »Alfa«, nato kontakt brez vrednosti; pri naraščajoči smeri »Alfa«, »Beta«, nato kontakt brez vrednosti.
3. **[FR-008-07]** **Given** dva kontakta z enakim e-naslovom domene in razvrščanje po e-naslovu, kjer imata enako vrednost, **When** se seznam prikaže, **Then** je med njima vrstni red po priimku, nato imenu (naraščajoče), pri popolnoma enakih podatkih pa po času nastanka in id, tako da se kontakt pri listanju ne ponovi in ne manjka.
4. **[FR-008-07]** **Given** isti kontakti z imeni »Cene«, »Čeh«, »Zupan«, »Žagar« in povezava z isto razvrstitvijo, **When** jo odpreta član s slovenskim in član z angleškim vmesnikom, **Then** oba vidita enak vrstni red (Č za C, Ž za Z).
5. **[FR-008-07]** **Given** razvrščanje po stolpcu v preglednici, **When** član ponovno aktivira gumb v glavi stolpca, **Then** se smer obrne in `aria-sort` stolpca to odraža (design.md 8.6).

---

### User Story 4 - Stanje v naslovu, paginacija in deljenje povezave (Priority: P2)

Iskanje, filtri, razvrstitev, stran in velikost strani so del naslova strani, zato delujejo *Nazaj*, osvežitev in deljenje povezave z drugim članom skupine.

**Why this priority**: Brez tega uporabnik ob vrnitvi s podrobnosti kontakta izgubi iskanje; deljenje povezave je pogost način sodelovanja.

**Independent Test**: Član nastavi iskanje, filtre, razvrstitev in stran, osveži stran ter odpre isto povezavo kot drug član in preveri enak prikaz.

**Acceptance Scenarios**:

1. **[FR-008-08]** **Given** 312 zadetkov in velikost strani 25, **When** se seznam prikaže, **Then** paginacija pokaže »1–25 od 312« in »Stran 1 od 13«; ob izbiri velikosti 100 se prikaže »1–100 od 312«.
2. **[FR-008-08]** **Given** član je na strani 3, **When** spremeni iskalni niz, filter ali razvrstitev, **Then** se prikaže stran 1 novih rezultatov.
3. **[FR-008-09]** **Given** član je nastavil iskanje, dva filtra, razvrstitev in stran 2, **When** osveži stran ali odpre kontakt in se vrne z *Nazaj*, **Then** je prikazano enako stanje seznama.
4. **[FR-008-09]** **Given** povezava s parametri iskanja, ki jo je poslal drug član skupine, **When** jo odpre član iste skupine, **Then** vidi enake filtre in enak nabor zadetkov.
5. **[FR-008-08]** **Given** povezava na stran 20, ki po spremembi podatkov ne obstaja več (zadnja stran je 13), **When** jo član odpre, **Then** se prikaže zadnja obstoječa stran (13).

---

### User Story 5 - Iskanje v arhivirani skupini in robni primeri (Priority: P3)

Iskanje, filtri in razvrščanje delujejo enako v arhivirani in trajno arhivirani skupini; neveljaven vnos je jasno zavrnjen.

**Why this priority**: Arhivirana skupina je po prvotni zahtevi namenjena prav pregledu, iskanju in izvozu.

**Independent Test**: V arhivirani skupini član izvede iskanje s filtri; ročno spremenjen naslov z neveljavnimi parametri prikaže razumljivo napako.

**Acceptance Scenarios**:

1. **[FR-008-15]** **Given** arhivirana (ali trajno arhivirana) skupina, **When** katerikoli član išče, filtrira in razvršča, **Then** dobi enake rezultate kot v nearhivirani skupini.
2. **[FR-008-14]** **Given** naslov strani s pogojem nad ključem, ki v skupini ne obstaja, ali iskalni niz, daljši od 200 znakov, **When** se zahteva izvede, **Then** strežnik vrne `400 VALIDATION_FAILED` z napako po polju, vmesnik pa pokaže sporočilo »Filtri niso veljavni.« z gumbom *Počisti filtre*.
3. **[FR-008-16]** **Given** kontakt »Janez Novak« v skupini A in kontakt »Janez Kralj« v skupini B, kjer je član v obeh, **When** išče `janez` v skupini A, **Then** je med zadetki samo »Janez Novak«.
4. **[FR-008-17]** **Given** strežnik ni dosegljiv ali vrne nepričakovano napako, **When** član išče, **Then** seznam obdrži prejšnjo vsebino, nad njim je sporočilo o napaki (`role="alert"`) z gumbom *Poskusi znova* (design.md 8.13).

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Najnižja vloga za vse zahteve te funkcionalnosti je VIEWER, zato vrstica »vloga pod najnižjo« (403) ne obstaja. Vse operacije so branje, zato so dovoljene tudi v arhivirani skupini (`409 GROUP_ARCHIVED` se ne pojavi). Optimistično zaklepanje ni uporabljeno (ni sprememb).

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-008-01 … FR-008-09, FR-008-16 | neprijavljen (brez, neveljaven ali potekel žeton) | iskanje, filtriranje, razvrščanje, paginacija seznama kontaktov skupine | 401, ni podatkov |
| FR-008-06 | neprijavljen (brez, neveljaven ali potekel žeton) | branje seznama ključev in značk za filtre | 401, ni podatkov |
| FR-008-01 … FR-008-09, FR-008-16 | prijavljen nečlan (skupina obstaja ali ne obstaja) | iskanje v skupini | 404, obstoj skupine se ne razkrije; v vmesniku stran »Te strani ni« |
| FR-008-06 | prijavljen nečlan | branje ključev in značk skupine | 404, obstoj skupine se ne razkrije |
| FR-008-15 | član arhivirane ali trajno arhivirane skupine (katerakoli vloga) | iskanje, filtri, razvrščanje, ključi in značke | 200, enako kot v nearhivirani skupini |
| FR-008-14 | član | pogoj nad neznanim poljem ali ključem, ki ne obstaja v tej skupini (tudi ključ iz druge skupine) | 400 VALIDATION_FAILED, napaka pri polju pogoja; ne razkrije, ali ključ obstaja drugje |
| FR-008-14 | član | razvrščanje po neznanem polju ali ključu, neznana smer razvrščanja | 400 VALIDATION_FAILED |
| FR-008-14 | član | iskalni niz > 200 znakov, prazna vrednost pogoja ali vrednost > 500 znakov, več kot 10 pogojev, več kot 30 značk, značka > 50 znakov | 400 VALIDATION_FAILED z napakami po poljih |
| FR-008-14 | član | velikost strani ni 25, 50 ali 100; številka strani ni pozitivno celo število | 400 VALIDATION_FAILED |
| FR-008-16 | član skupine A | značka ali vrednost, ki obstaja samo v skupini B | zadetki samo iz skupine A (značka, ki v A ne obstaja, da 0 zadetkov) |

### Edge Cases

- Iskalni niz iz samih presledkov se obravnava kot prazen (prikazani so vsi kontakti); presledki na začetku in koncu se odstranijo, zaporedni presledki štejejo kot eden.
- Posebni znaki v iskanju (`%`, `_`, `*`, `+`, `(`) se iščejo dobesedno, nimajo posebnega pomena.
- Iskanje telefona: `041 123` najde »041 123 456«, ne pa »041123456« (primerjava je dobesedna, brez normalizacije telefonskih številk).
- Pogoj nad dodatnim ključem se ujema s ključem ne glede na velikost črk (`Kompetenca` = `kompetenca`); kontakt brez tega ključa pogoju ne ustreza.
- Več pogojev nad istim poljem se kombinira z IN (npr. *kompetenca* vsebuje `web` in *kompetenca* vsebuje `dev`).
- Značka v filtru, ki ne obstaja (več) v skupini, ne povzroči napake, ampak 0 zadetkov in prazno stanje; oznaka filtra ostane vidna in odstranljiva.
- Ključ, ki je bil v deljeni povezavi veljaven, pa ga medtem noben kontakt nima več, povzroči `400 VALIDATION_FAILED` in sporočilo s *Počisti filtre* (FR-008-14).
- Med tipkanjem se prikaže le rezultat zadnjega iskalnega niza; počasnejši odgovor starejše zahteve ne prepiše novejšega.
- Kontakt, ki ga drug uporabnik spremeni ali izbriše med listanjem, se na naslednji strani pokaže po novem stanju; zaradi tega se lahko kontakt na sosednjih straneh ponovi ali manjka – to je sprejemljivo.
- Prazna skupina (brez kontaktov): prikaže se prazno stanje funkcionalnosti 004, ne stanje »Ni kontaktov, ki ustrezajo filtrom.«, razen če je nastavljen vsaj en filter ali iskalni niz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-008-01**: Sistem MORA omogočiti prosto iskanje po kontaktih skupine z iskalnim poljem »Iskanje po kontaktih«, ki zajema samo predefinirane atribute (ime, priimek, naslov, e-naslov, telefon); rezultati se osvežijo po premoru v tipkanju (design.md 8.7). *(najnižja vloga: VIEWER)*
- **FR-008-02**: Sistem MORA pri iskanju in pogojih filtrov uporabljati primerjavo »vsebuje«, ki ne upošteva velikosti črk in diakritičnih znakov (`c` = `č`, `s` = `š`, `z` = `ž` ipd.); iskalni niz se razdeli na besede, kontakt je zadetek, če se vsaka beseda pojavi v vsaj enem predefiniranem atributu. *(najnižja vloga: VIEWER)*
- **FR-008-03**: Sistem MORA omogočiti filtriranje s pogoji *polje vsebuje vrednost*, kjer je polje predefiniran atribut ali dodatni ključ, ki obstaja v tej skupini; največ 10 pogojev, ki se kombinirajo z IN. *(najnižja vloga: VIEWER)*
- **FR-008-04**: Sistem MORA omogočiti filtriranje po značkah (največ 30), pri čemer so zadetki samo kontakti, ki imajo **vse** izbrane značke (primerjava ne upošteva velikosti črk). *(najnižja vloga: VIEWER)*
- **FR-008-05**: Sistem MORA iskalni niz, pogoje atributov in značke kombinirati z IN. *(najnižja vloga: VIEWER)*
- **FR-008-06**: Sistem MORA za panel *Filtri* in izbiro *Razvrsti* ponuditi predefinirane atribute in seznam dodatnih ključev, ki obstajajo v kontaktih te skupine, ter seznam značk, ki obstajajo v kontaktih te skupine; nikoli ključev ali značk drugih skupin. *(najnižja vloga: VIEWER)*
- **FR-008-07**: Sistem MORA omogočiti razvrščanje po kateremkoli predefiniranem atributu ali dodatnem ključu te skupine, naraščajoče ali padajoče, z izbirnim seznamom *Razvrsti* in gumbom smeri ter z gumbi v glavah stolpcev (design.md 8.6, 8.7); primerjava je abecedna po slovenski abecedi (Č za C, Š za S, Ž za Z), ne glede na velikost črk in neodvisno od jezika vmesnika (D-63), zato je vrstni red za vse člane in vse deljene povezave enak; kontakti brez vrednosti so v obeh smereh na koncu; enake vrednosti se razvrstijo po priimku, nato imenu (naraščajoče), nato po času nastanka in id, da je vrstni red popolnoma določen; privzeto razvrščanje je po priimku, nato imenu, naraščajoče z istimi pravili (feature-map §2.6). *(najnižja vloga: VIEWER)*
- **FR-008-08**: Sistem MORA rezultate iskanja in filtrov paginirati (25 / 50 / 100 na stran, privzeto 25) in prikazati skupno število zadetkov ter položaj (design.md 8.9); ob spremembi iskanja, filtrov, razvrstitve ali velikosti strani se prikaže stran 1; zahtevana stran za zadnjo prikaže zadnjo obstoječo stran. *(najnižja vloga: VIEWER)*
- **FR-008-09**: Sistem MORA iskalni niz, filtre, razvrstitev, stran in velikost strani hraniti v naslovu strani (URL), tako da *Nazaj*, *Naprej*, osvežitev in odprtje deljene povezave pri članu iste skupine prikažejo enako stanje. *(najnižja vloga: VIEWER)*
- **FR-008-10**: Sistem MORA po vsaki osvežitvi rezultatov število zadetkov prikazati in ga sporočiti bralniku zaslona (»Najdenih N kontaktov«, z ustreznimi slovničnimi oblikami v sl/en). *(najnižja vloga: VIEWER)*
- **FR-008-11**: Sistem MORA uporabljene filtre prikazati nad seznamom kot odstranljive oznake z dostopnim imenom »Odstrani filter ‹opis›« in na gumbu *Filtri* prikazati število uporabljenih filtrov (»Filtri (N)«); odstranitev oznake takoj osveži rezultate. *(najnižja vloga: VIEWER)*
- **FR-008-12**: Sistem MORA z gumbom *Počisti filtre* (v panelu filtrov, ob oznakah filtrov in v praznem stanju) odstraniti iskalni niz in vse filtre ter prikazati prvo stran; razvrstitev in velikost strani ostaneta. *(najnižja vloga: VIEWER)*
- **FR-008-13**: Sistem MORA, kadar iskanje ali filtri nimajo zadetkov, prikazati prazno stanje »Ni kontaktov, ki ustrezajo filtrom.« z gumbom *Počisti filtre* (design.md 8.15). *(najnižja vloga: VIEWER)*
- **FR-008-14**: Sistem MORA neveljavne parametre iskanja zavrniti z `400 VALIDATION_FAILED` in napakami po poljih: neznano polje ali ključ, ki ne obstaja v tej skupini, neznana smer, iskalni niz > 200 znakov, prazna vrednost pogoja ali > 500 znakov, > 10 pogojev, > 30 značk ali značka > 50 znakov, neveljavna velikost ali številka strani; vmesnik pokaže razumljivo sporočilo z gumbom *Počisti filtre*. *(najnižja vloga: VIEWER)*
- **FR-008-15**: Sistem MORA iskanje, filtre, razvrščanje in paginacijo omogočiti tudi v arhivirani in trajno arhivirani skupini, enako kot v nearhivirani. *(najnižja vloga: VIEWER)*
- **FR-008-16**: Sistem MORA iskati, filtrirati in razvrščati izključno kontakte skupine, v kateri se iskanje izvaja; zadetki, predlogi in števila nikoli ne vključujejo ali razkrivajo podatkov drugih skupin. *(najnižja vloga: VIEWER)*
- **FR-008-17**: Sistem MORA med nalaganjem rezultatov obdržati prejšnjo vsebino seznama z oznako nalaganja in ob neuspehu zahteve prikazati vidno sporočilo o napaki z gumbom *Poskusi znova* (design.md 8.13, 8.15); vedno prikaže le rezultat zadnje zahteve. *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Poizvedba seznama kontaktov**: stanje seznama, ki ga določajo iskalni niz, seznam pogojev atributov, seznam značk, polje in smer razvrščanja, stran in velikost strani; v celoti zapisljiva v naslov strani.
- **Pogoj atributa**: par *polje* (predefiniran atribut ali dodatni ključ skupine) in *vrednost* (1–500 znakov), primerjava »vsebuje«.
- **Možnosti filtrov skupine**: seznam dodatnih ključev in seznam značk, ki trenutno obstajajo v kontaktih skupine (izpeljano iz kontaktov 004, ni samostojno urejano).
- **Rezultat iskanja**: stran kontaktov in skupno število zadetkov.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: V skupini z 10.000 kontakti 95 % iskanj s kombinacijo iskalnega niza, dveh pogojev in dveh značk vrne prvo stran rezultatov v manj kot 1 sekundi.
- **SC-002**: Uporabnik v skupini s 500 kontakti najde določen kontakt po delu imena, e-naslova ali telefona v manj kot 15 sekundah.
- **SC-003**: Odprtje deljene povezave ali osvežitev strani v 100 % primerov prikaže enako stanje iskanja, filtrov, razvrstitve in strani, vključno z enakim vrstnim redom kontaktov ne glede na jezik vmesnika uporabnika.
- **SC-004**: Testi izolacije v 100 % primerov ne vrnejo nobenega kontakta, ključa ali značke druge skupine.
- **SC-005**: Celoten potek iskanja, filtriranja in razvrščanja je izvedljiv samo s tipkovnico in pri 320 px širine, brez kršitev axe (WCAG 2.1 A in AA).

## Assumptions

- Odvisna od **004-kontakti** (kontakti, predefinirani in dodatni atributi, značke, seznam in preglednica kontaktov s paginacijo); 008 seznam razširi z iskanjem, filtri in razvrščanjem, sama preglednica in prazno stanje prazne skupine sta v lasti 004.
- Odvisna od **002-skupine** (članstvo in vloge) in **003-arhiviranje** (stanje arhivirane skupine, pasica).
- **Odločitev – diakritični znaki:** pri iskanju in pogojih se diakritični znaki ne upoštevajo (`zupancic` najde »Zupančič«, `čeh` najde »Ceh«), ker uporabniki pogosto tipkajo brez strešic. Pri **razvrščanju** pa velja slovenska abeceda (D-63), torej je »Č« za »C« za vse uporabnike, ne glede na jezik vmesnika; iskanje (brez strešic) in razvrščanje (s strešicami) sta namerno različna.
- **Odločitev – prosto iskanje** zajema samo predefinirane atribute (design.md 8.7); dodatni atributi in značke se iščejo s filtri. Besede iskalnega niza se kombinirajo z IN.
- **Odločitev – meje:** iskalni niz do 200 znakov, do 10 pogojev atributov, do 30 značk v filtru, vrednost pogoja 1–500 znakov (najdaljša vrednost dodatnega atributa po §2.6).
- **Odločitev – neznan ključ proti neznani znački:** pogoj ali razvrščanje nad ključem, ki ga v skupini ni, je `400 VALIDATION_FAILED` (ker gre za polje); značka, ki je v skupini ni, je veljavna vrednost in da 0 zadetkov. Odgovor je enak ne glede na to, ali ključ ali značka obstajata v drugi skupini, zato izolacija ni ogrožena.
- Razvrščanje po dodatnem ključu je vedno besedilno (tudi za vrednosti, ki so videti kot števila); ločevanja tipov vrednosti ni.
- Prazen niz ali niz iz samih presledkov kot vrednost atributa ne obstaja (§2.6 zahteva 1–500 znakov), zato »brez vrednosti« pri razvrščanju pomeni, da kontakt atributa nima oziroma je predefiniran atribut prazen.
- Izbor kontaktov, »Izberi vse zadetke« in akcijska vrstica so v lasti **009-mnozicno-urejanje**; 009 uporabi poizvedbo te funkcionalnosti (iskalni niz, pogoje, značke) z enakim pomenom. Izvoz je v lasti **010-izvoz-excel**.
- Predlogi značk v obrazcu kontakta (design.md 8.4) so v lasti 004; lahko uporabijo isti seznam značk skupine kot FR-008-06.
- Revizijska sled (005) ni prizadeta, ker iskanje ničesar ne spreminja.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb (razjasnitev 2026-11-10 je v *Clarifications*) | D-63 |
