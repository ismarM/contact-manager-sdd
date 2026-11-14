# Feature Specification: Kontakti skupine

**Feature Branch**: `kontakti` (no number; the directory is `specs/004-kontakti/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Ustvarjanje, ogled, urejanje in izbris kontaktov znotraj skupine (predefinirani atributi ime, priimek, naslov, e-naslov, telefon; dodatni atributi ključ=vrednost, npr. kompetenca='web dev'; poljubne značke, npr. ne_obveščaj, konferenca2025; urejanje in izbris urednik in višje) ter prikaz kontaktov skupine s paginacijo (bralec in višje), z optimističnim zaklepanjem in izolacijo med skupinami."

## Clarifications

### Session 2026-11-06

- Q: Kaj naj strežnik stori pri shranjevanju z zastarelo verzijo, če so poslane vrednosti enake trenutnim? → A: `200` brez povečanja verzije; `409 VERSION_CONFLICT` le, če se vrednosti razlikujejo.
- Q: Po pravilih katerega jezika se kontakti razvrščajo po priimku in imenu? → A: ~~neodvisno od jezika, osnovni vrstni red Unicode (brez posebnih pravil za šumnike)~~ – nadomeščeno z D-63 (2026-11-10, `/speckit-clarify` 008): neodvisno od jezika vmesnika, vedno po slovenski abecedi (Č za C, Š za S, Ž za Z); velikost črk se ne upošteva.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pregled kontaktov skupine (Priority: P1)

Član skupine (bralec in višje) odpre zavihek *Kontakti* in vidi paginiran seznam kontaktov skupine, razvrščen po priimku in imenu. Izbere kontakt in si ogleda vse njegove podatke – na širokem zaslonu v panelu ob seznamu, sicer na ločeni strani.

**Why this priority**: prikaz kontaktov je osnova, brez katere nobena druga funkcionalnost s kontakti (iskanje, množično urejanje, izvoz, dvojniki) nima smisla; bralec ima samo to pravico.

**Independent Test**: v skupino z vnaprej pripravljenimi kontakti (npr. 60) se prijavi bralec; preveri se seznam, paginacija, prazna stanja in pogled kontakta – brez ustvarjanja ali urejanja.

**Acceptance Scenarios**:

1. **[FR-004-06]** **Given** skupina s 60 kontakti in član z vlogo bralec, **When** odpre zavihek *Kontakti*, **Then** vidi prvih 25 kontaktov s stolpci *Ime in priimek*, *E-naslov*, *Telefon*, *Značke*, razvrščene po priimku in nato imenu naraščajoče, in paginacijo »1–25 od 60«.
2. **[FR-004-06]** **Given** seznam iz prejšnjega scenarija, **When** bralec izbere velikost strani 50 in gre na naslednjo stran, **Then** vidi kontakte 51–60, velikost strani in številka strani sta v naslovu poti in ostaneta ob osvežitvi.
3. **[FR-004-06]** **Given** kontakt s petimi značkami, **When** je prikazan v seznamu, **Then** so vidne prve tri značke in oznaka »+2«.
4. **[FR-004-07]** **Given** skupina brez kontaktov, **When** jo odpre urednik nearhivirane skupine, **Then** vidi »Ta skupina še nima kontaktov.« in gumb *Nov kontakt*; **When** jo odpre bralec ali kateri koli član arhivirane skupine, **Then** vidi samo razlago, brez gumba.
5. **[FR-004-08]** **Given** kontakt z e-naslovom, telefonom, dvema dodatnima atributoma in tremi značkami, **When** ga bralec odpre, **Then** vidi ime in priimek kot naslov, *Naslov*, *E-naslov* kot povezavo `mailto:`, *Telefon* kot povezavo `tel:`, dodatne atribute kot seznam opredelitev ključ–vrednost, vse značke in nobene akcije *Uredi kontakt* ali *Izbriši kontakt*.
6. **[FR-004-09]** **Given** zaslon širok vsaj 1280 px, **When** član izbere kontakt v seznamu, **Then** se podrobnosti prikažejo v panelu desno od seznama, identifikator kontakta je v naslovu poti in ob osvežitvi strani je isti kontakt še vedno izbran.
7. **[FR-004-09]** **Given** zaslon, ožji od 1280 px, **When** član izbere kontakt, **Then** se podrobnosti odprejo na ločeni strani, s katere se vrne na seznam na isto stran paginacije.
8. **[FR-004-14]** **Given** uporabnik je član skupin A in B, **When** odpre pot kontakta skupine B pod skupino A, **Then** vidi stran »Te strani ni« in podatki kontakta niso razkriti.

---

### User Story 2 - Ustvarjanje kontakta (Priority: P1)

Urednik (ali višje) doda nov kontakt s predefiniranimi atributi, poljubnimi dodatnimi atributi ključ=vrednost in značkami. Obrazec napake pokaže ob poljih in v povzetku, predlaga značke, ki jih skupina že uporablja.

**Why this priority**: brez ustvarjanja skupina nima vsebine; skupaj z zgodbo 1 tvori najmanjši uporaben izdelek.

**Independent Test**: urednik v prazni skupini ustvari kontakt z atributi in značkami, nato ga najde v seznamu; preveri se še preverjanje veljavnosti in predlogi značk.

**Acceptance Scenarios**:

1. **[FR-004-01]** **Given** urednik v nearhivirani skupini, **When** izpolni ime »Janez«, priimek »Novak«, e-naslov, doda atribut `kompetenca` = »web dev« in znački `ne_obveščaj` in `konferenca2025` ter izbere *Shrani kontakt*, **Then** je kontakt ustvarjen v tej skupini, prikaže se obvestilo »Kontakt Janez Novak je shranjen.« in odpre se pogled novega kontakta.
2. **[FR-004-02]** **Given** obrazec za nov kontakt, **When** urednik pusti ime in priimek prazna ter odda obrazec, **Then** se nič ne shrani, strežnik vrne `400 VALIDATION_FAILED` z napako za ime in priimek, vmesnik pa pokaže »Vpiši vsaj ime ali priimek.«
3. **[FR-004-02]** **Given** obrazec z dodatnima atributoma `Kompetenca` in `kompetenca`, **When** urednik odda obrazec, **Then** je ponovljen ključ napaka ob drugem polju *Ključ* in nič se ne shrani.
4. **[FR-004-02]** **Given** obrazec, **When** urednik vpiše e-naslov »janez@«, telefon »01 234 abc«, značko »moja znacka« (s presledkom) ali dodatni atribut s ključem »E-naslov«, **Then** je vsaka od teh vrednosti zavrnjena z razumljivim sporočilom ob polju.
5. **[FR-004-03]** **Given** obrazec za nov kontakt, **When** urednik vpiše neveljaven e-naslov in zapusti polje, **Then** se napaka prikaže ob polju (ne že med tipkanjem) in izgine, ko jo začne popravljati; **When** odda obrazec z napakami, **Then** se nad obrazcem prikaže povzetek napak s povezavami na polja in fokus se premakne nanj.
6. **[FR-004-03]** **Given** obrazec, **When** urednik izbere *Dodaj atribut*, **Then** se doda prazna vrstica *Ključ*/*Vrednost* in fokus se premakne v novo polje *Ključ*; **When** izbere »Odstrani atribut kompetenca«, **Then** se vrstica odstrani.
7. **[FR-004-04]** **Given** skupina A, v kateri kontakti uporabljajo značko `vip`, in skupina B z značko `tajno`, **When** urednik v skupini A v polje za značke vpiše »v« oziroma »t«, **Then** predlogi vsebujejo `vip` in nikoli `tajno`; *Enter* ali vejica doda vpisano značko, »Odstrani značko vip« jo odstrani.
8. **[FR-004-05]** **Given** urednik je v obrazec vpisal podatke, **When** izbere *Prekliči* ali zapusti stran, **Then** ga vmesnik vpraša »Zavržem spremembe?«; ob zavrnitvi ostane v obrazcu z vnesenimi podatki.
9. **[FR-004-16]** **Given** strežnik ni dosegljiv, **When** urednik odda obrazec, **Then** obrazec ostane odprt z vnesenimi podatki in nad njim je trajno sporočilo napake z gumbom *Poskusi znova*.

---

### User Story 3 - Urejanje kontakta in sočasne spremembe (Priority: P2)

Urednik popravi kontakt. Če je kontakt medtem spremenil kdo drug, se nič ne prepiše tiho: obrazec ostane odprt, urednik vidi razlike in izbere, kako nadaljevati.

**Why this priority**: urejanje je nujno za vzdrževanje podatkov, optimistično zaklepanje pa je zahtevano z vidika celovitosti podatkov (konstitucija V).

**Independent Test**: dva urednika odpreta isti kontakt; prvi shrani, drugi poskusi shraniti – preveri se `409 VERSION_CONFLICT` in vse tri možnosti razrešitve.

**Acceptance Scenarios**:

1. **[FR-004-10]** **Given** urednik ima odprt obrazec za urejanje kontakta z verzijo, ki je še trenutna, **When** spremeni telefon, odstrani značko in shrani, **Then** so spremembe shranjene, verzija kontakta se poveča, prikaže se obvestilo »Kontakt Janez Novak je shranjen.« in pogled kontakta pokaže nove vrednosti.
2. **[FR-004-11]** **Given** urednika U1 in U2 sta odprla isti kontakt in U1 je shranil spremembo ob 14.32, **When** U2 shrani svoje spremembe, **Then** strežnik vrne `409 VERSION_CONFLICT`, kontakt ostane v stanju, ki ga je shranil U1, obrazec U2 ostane odprt z njegovimi vrednostmi in nad njim je opozorilo »Kontakt je medtem spremenil(a) ‹U1› ob 14.32.« z možnostmi *Prikaži razlike*, *Uporabi trenutno različico* in *Shrani moje spremembe*.
3. **[FR-004-11]** **Given** opozorilo o konfliktu, **When** U2 izbere *Prikaži razlike*, **Then** vidi preglednico *Polje · Tvoja vrednost · Trenutna vrednost* za polja, ki se razlikujejo; **When** izbere *Uporabi trenutno različico*, **Then** obrazec naloži trenutno stanje in verzijo; **When** izbere *Shrani moje spremembe*, **Then** se njegove vrednosti shranijo nad trenutno verzijo (če se je kontakt vmes spet spremenil, se konflikt ponovi).
4. **[FR-004-13]** **Given** urednik ima odprt obrazec za urejanje, kontakt pa je medtem izbrisal drug član, **When** shrani, **Then** strežnik vrne `404`, obrazec ostane odprt z vnesenimi podatki in sporočilom »Tega kontakta ni več – medtem ga je nekdo izbrisal.« ter povezavo nazaj na seznam kontaktov; kontakt se ne ustvari znova.
5. **[FR-004-10]** **Given** urednik odpre obrazec za urejanje in ne spremeni ničesar, **When** shrani, **Then** shranjevanje uspe, verzija kontakta se ne poveča.
6. **[FR-004-10, FR-004-11]** **Given** urednika U1 in U2 sta odprla isti kontakt, U1 je shranil spremembo, **When** U2 shrani z zastarelo verzijo, a z vrednostmi, ki so enake trenutnim vrednostim kontakta, **Then** strežnik vrne `200`, verzija se ne poveča, ni opozorila o konfliktu; če se vrednosti razlikujejo v vsaj enem polju, strežnik vrne `409 VERSION_CONFLICT`.

---

### User Story 4 - Izbris kontakta (Priority: P2)

Urednik izbriše posamezen kontakt po potrditvi v dialogu.

**Why this priority**: odstranjevanje zastarelih kontaktov je osnovna operacija; je nevarna, zato potrebuje potrditev.

**Independent Test**: urednik izbriše kontakt iz pogleda kontakta in iz menija dejanj vrstice; preveri se dialog, fokus, obvestilo in odsotnost kontakta v seznamu.

**Acceptance Scenarios**:

1. **[FR-004-12]** **Given** urednik v pogledu kontakta Janez Novak, **When** izbere *Izbriši kontakt*, **Then** se odpre potrditveni dialog »Izbrišem kontakt Janez Novak?« s posledico in gumboma *Prekliči* in *Izbriši kontakt*, fokus je na *Prekliči*.
2. **[FR-004-12]** **Given** odprt potrditveni dialog, **When** urednik izbere *Izbriši kontakt*, **Then** je kontakt odstranjen iz skupine, prikaže se obvestilo »Kontakt Janez Novak je izbrisan.«, uporabnik je na seznamu kontaktov in kontakta ni več v seznamu; **When** pa izbere *Prekliči* ali pritisne *Esc*, **Then** se nič ne zgodi in fokus se vrne na gumb *Izbriši kontakt*.
3. **[FR-004-12]** **Given** urednik je odprl dialog za izbris, drug urednik pa je kontakt medtem spremenil, **When** potrdi izbris, **Then** strežnik vrne `409 VERSION_CONFLICT`, kontakt ni izbrisan, vmesnik pokaže »Kontakt je medtem spremenil(a) ‹ime› ob ‹čas›.« in osveži pogled kontakta, da lahko uporabnik izbris ponovno potrdi.
4. **[FR-004-13]** **Given** kontakt je medtem izbrisal drug član, **When** urednik potrdi izbris, **Then** strežnik vrne `404`, vmesnik pokaže »Tega kontakta ni več – medtem ga je nekdo izbrisal.« in osveži seznam.

---

### User Story 5 - Arhivirana skupina in pravice v vmesniku (Priority: P3)

V arhivirani skupini in za bralca so kontakti samo za branje; vmesnik ne ponuja akcij, ki jih strežnik ne bi dovolil.

**Why this priority**: zaščito zagotavlja strežnik (zgodbe 2–4 negativni scenariji); ta zgodba dopolni udobje in jasnost vmesnika.

**Independent Test**: lastnik arhivirane skupine in bralec nearhivirane skupine odpreta seznam, pogled kontakta in neposredno pot do obrazca.

**Acceptance Scenarios**:

1. **[FR-004-15]** **Given** arhivirana skupina, **When** lastnik pošlje zahtevo za ustvarjanje, urejanje ali izbris kontakta, **Then** strežnik vrne `409 GROUP_ARCHIVED` in nič se ne spremeni; branje seznama in pogleda kontakta uspe.
2. **[FR-004-17]** **Given** bralec nearhivirane skupine ali kateri koli član arhivirane skupine, **When** odpre seznam ali pogled kontakta, **Then** gumbi *Nov kontakt*, *Uredi kontakt*, *Izbriši kontakt* in meni dejanj vrstice z urejanjem in izbrisom niso izrisani.
3. **[FR-004-17]** **Given** bralec, **When** neposredno odpre pot obrazca za nov kontakt ali za urejanje kontakta, **Then** obrazec ni prikazan, namesto njega je razlaga »Za urejanje kontaktov potrebuješ vlogo urednik ali višjo.« s povezavo na seznam kontaktov; v arhivirani skupini je razlaga »Skupina je arhivirana – kontaktov ni mogoče spreminjati.«
4. **[FR-004-16]** **Given** katera koli uspešna operacija ustvarjanja, urejanja ali izbrisa, **When** se zaključi, **Then** je uspeh viden kot obvestilo, ki ga bralnik zaslona prebere; **Given** katera koli zavrnjena operacija, **Then** je napaka vidna kot trajno sporočilo ob mestu akcije, prevedena v razumljivo besedilo brez tehničnih kod.

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-004-06, FR-004-07, FR-004-08, FR-004-09 | unauthenticated (no/invalid/expired token) | seznam kontaktov ali pogled kontakta | 401, podatki niso vrnjeni |
| FR-004-06, FR-004-07, FR-004-08, FR-004-09 | authenticated non-member | seznam kontaktov ali pogled kontakta | 404, obstoj skupine in kontakta ni razkrit; vmesnik pokaže »Te strani ni« |
| FR-004-06 | member (VIEWER+) | seznam z velikostjo strani, ki ni 25, 50 ali 100 | 400 VALIDATION_FAILED |
| FR-004-06, FR-004-08 | member of an archived group (VIEWER+) | seznam kontaktov ali pogled kontakta | 200 – branje je dovoljeno |
| FR-004-01, FR-004-04, FR-004-10, FR-004-12 | unauthenticated (no/invalid/expired token) | ustvari, uredi ali izbriše kontakt; zahteva predloge značk | 401, nič se ne spremeni |
| FR-004-01, FR-004-04, FR-004-10, FR-004-12 | authenticated non-member | ustvari, uredi ali izbriše kontakt; zahteva predloge značk | 404, obstoj ni razkrit, nič se ne spremeni |
| FR-004-01, FR-004-04, FR-004-10, FR-004-12 | member with role VIEWER | ustvari, uredi ali izbriše kontakt; zahteva predloge značk | 403, nič se ne spremeni |
| FR-004-01, FR-004-10, FR-004-12, FR-004-15 | member of an archived group (EDITOR, ADMIN, OWNER) | ustvari, uredi ali izbriše kontakt | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-004-15 | member of an archived group with role VIEWER | ustvari, uredi ali izbriše kontakt | 403 (vloga se preveri pred arhiviranostjo), nič se ne spremeni |
| FR-004-10, FR-004-11 | EDITOR+ z zastarelo verzijo | uredi kontakt z vrednostmi, ki se razlikujejo od trenutnih | 409 VERSION_CONFLICT, kontakt ostane nespremenjen |
| FR-004-10 | EDITOR+ z zastarelo verzijo | uredi kontakt z vrednostmi, enakimi trenutnim | 200, verzija se ne poveča |
| FR-004-12 | EDITOR+ z zastarelo verzijo | izbriše kontakt | 409 VERSION_CONFLICT, kontakt ni izbrisan |
| FR-004-13 | EDITOR+ | uredi ali izbriše kontakt, ki je bil medtem izbrisan | 404, nič se ne ustvari ali spremeni |
| FR-004-14 | član skupin A in B (katera koli vloga) | bere, ureja ali briše kontakt skupine B prek poti/zahteve skupine A | 404, enako kot za neobstoječ kontakt; nič se ne spremeni |
| FR-004-01, FR-004-02, FR-004-10 | EDITOR+ | pošlje neveljavne podatke (brez imena in priimka, predolge vrednosti, neveljaven e-naslov ali telefon, podvojen ključ ali značka, preveč atributov ali značk) | 400 VALIDATION_FAILED z napakami po poljih, nič se ne spremeni |

### Edge Cases

- Kontakt ima samo ime ali samo priimek: prikazno ime je tisto, ki obstaja; pri razvrščanju se prazen priimek uvrsti za vse kontakte s priimkom (nato po imenu).
- Dva kontakta z enakim priimkom in imenom: vrstni red med njima je stalen (po času ustvarjanja), da se kontakt med listanjem ne pojavi na dveh straneh ali izgine.
- Stran paginacije onkraj zadnje (npr. po izbrisu ali iz stare povezave): strežnik vrne prazen seznam s pravilnim skupnim številom, vmesnik pa prikaže zadnjo obstoječo stran (enako kot FR-008-08).
- Vrednosti z vodilnimi ali končnimi presledki se obrežejo; neobvezno polje, ki je po obrezu prazno, nima vrednosti; vrstica dodatnega atributa, v kateri sta prazna ključ in vrednost, se prezre, vrstica s samo enim od njiju je napaka.
- Značka, ki se od obstoječe značke skupine razlikuje le po velikosti črk, je dovoljena; kombinirano polje predlaga obstoječo obliko.
- Ključ dodatnega atributa, ki se ujema z imenom predefiniranega atributa ne glede na velikost črk in jezik (npr. »Telefon«, »phone«), je napaka.
- Kontakt na meji omejitev (50 dodatnih atributov, 30 značk): *Dodaj atribut* oziroma dodajanje značke pokaže napako ob polju in ne doda nove vrstice ali značke.
- Izbrani kontakt v panelu podrobnosti je bil medtem izbrisan: ob osvežitvi ali ponovnem nalaganju se pokaže »Tega kontakta ni več …« namesto podrobnosti, seznam ostane prikazan.
- Zadnji urejevalec kontakta je izbrisal račun: v opozorilu o konfliktu piše »izbrisan uporabnik«.
- Skupina je bila arhivirana, medtem ko je urednik imel odprt obrazec: shranjevanje vrne `409 GROUP_ARCHIVED`, obrazec ostane odprt z vnesenimi podatki in sporočilom, da je skupina arhivirana.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-004-01**: Sistem MORA omogočiti ustvarjanje kontakta v skupini s predefiniranimi atributi (ime, priimek, naslov, e-naslov, telefon), poljubnim številom dodatnih atributov ključ=vrednost in značkami v okviru omejitev iz FR-004-02; nov kontakt pripada natanko tej skupini in dobi začetno verzijo; po uspehu se odpre pogled novega kontakta. *(najnižja vloga: EDITOR)*
- **FR-004-02**: Sistem MORA ob ustvarjanju in urejanju na strežniku preveriti podatke po skupnem slovarju (feature-map §2.6): vsaj eno od imena in priimka, ime in priimek do 100 znakov, naslov do 300 znakov (večvrstičen), e-naslov veljavne oblike do 254 znakov, telefon do 30 znakov iz števk, presledkov in `+ - ( ) /`; ključ dodatnega atributa 1–50 znakov, edinstven v kontaktu ne glede na velikost črk in različen od imen predefiniranih atributov (v slovenščini in angleščini, ne glede na velikost črk), vrednost 1–500 znakov, največ 50 atributov; značka 1–50 znakov brez presledkov, edinstvena v kontaktu ne glede na velikost črk, največ 30 značk. Vrednosti se pred preverjanjem obrežejo. Neveljavna zahteva se zavrne z `400 VALIDATION_FAILED` in napakami po poljih; nič se ne shrani. *(najnižja vloga: EDITOR)*
- **FR-004-03**: Sistem MORA za ustvarjanje in urejanje ponuditi obrazec s tremi skupinami polj *Osnovni podatki*, *Dodatni atributi* in *Značke* (design.md 8.2–8.4, 9.4): dodajanje vrstice atributa s premikom fokusa v novo polje *Ključ*, odstranjevanje vrstice z gumbom »Odstrani atribut ‹ključ›«, preverjanje ob zapustitvi polja (ne med tipkanjem) z napako ob polju in ob neuspešni oddaji povzetek napak nad obrazcem s povezavami na polja in fokusom na povzetku. *(najnižja vloga: EDITOR)*
- **FR-004-04**: Sistem MORA v polju za značke (kombinirano polje, design.md 8.4) predlagati samo obstoječe značke kontaktov **te** skupine, nikoli značk drugih skupin; *Enter* ali vejica doda vpisano značko, vsaka dodana značka ima gumb »Odstrani značko ‹ime›«. *(najnižja vloga: EDITOR)*
- **FR-004-05**: Sistem MORA ob neshranjenih spremembah v obrazcu pri izbiri *Prekliči* ali pri zapuščanju strani (navigacija v aplikaciji, zapiranje ali osvežitev zavihka) vprašati »Zavržem spremembe?«; ob zavrnitvi obrazec ostane odprt z vnesenimi podatki. *(najnižja vloga: EDITOR)*
- **FR-004-06**: Sistem MORA prikazati kontakte skupine v paginiranem seznamu (preglednica ali kartice po design.md 8.6) s stolpci *Ime in priimek* (povezava na kontakt), *E-naslov*, *Telefon* in *Značke* (največ tri značke v vrstnem redu, kot so vpisane v kontaktu, ter »+N« za preostale), privzeto razvrščen po priimku in nato imenu naraščajoče po slovenski abecedi (Č za C, Š za S, Ž za Z), ne glede na velikost črk in neodvisno od jezika vmesnika (D-63), in s stalnim vrstnim redom pri enakih vrednostih; paginacija po design.md 8.9 z velikostjo strani 25 (privzeto), 50 ali 100 in skupnim številom kontaktov; stran in velikost strani sta v naslovu poti; druga velikost strani se zavrne z `400 VALIDATION_FAILED`. Arhivirana skupina se lahko bere. *(najnižja vloga: VIEWER)*
- **FR-004-07**: Sistem MORA za skupino brez kontaktov prikazati prazno stanje (design.md 8.15) »Ta skupina še nima kontaktov.«; urednik in višje v nearhivirani skupini dobijo tudi gumb *Nov kontakt*, bralec in člani arhivirane skupine samo razlago. *(najnižja vloga: VIEWER)*
- **FR-004-08**: Sistem MORA prikazati pogled kontakta (design.md 9.4): naslov z imenom in priimkom, *Naslov*, *E-naslov* kot povezavo `mailto:`, *Telefon* kot povezavo `tel:`, dodatne atribute kot seznam opredelitev ključ–vrednost in vse značke; polja brez vrednosti se ne izrišejo. Arhivirana skupina se lahko bere. *(najnižja vloga: VIEWER)*
- **FR-004-09**: Sistem MORA pri širini zaslona vsaj 1280 px prikazati podrobnosti izbranega kontakta v panelu desno od seznama, pri ožjih zaslonih pa na ločeni strani (design.md 7.2); izbrani kontakt je v naslovu poti, zato ostane izbran ob osvežitvi in deljenju povezave, vrnitev s strani podrobnosti pa ohrani stran paginacije. *(najnižja vloga: VIEWER)*
- **FR-004-10**: Sistem MORA omogočiti urejanje vseh atributov in značk kontakta; zahteva vsebuje verzijo kontakta, ki jo je uporabnik videl; ob uspehu se verzija poveča in zabeležita čas ter izvajalec zadnje spremembe; shranjevanje brez dejanske spremembe, to je kadar so poslane vrednosti enake trenutnim vrednostim kontakta, uspe brez povečanja verzije, tudi če je poslana verzija zastarela. *(najnižja vloga: EDITOR)*
- **FR-004-11**: Sistem MORA spremembo z zastarelo verzijo, katere vrednosti se razlikujejo od trenutnih, zavrniti z `409 VERSION_CONFLICT` brez kakršne koli spremembe; obrazec ostane odprt z vnesenimi podatki, nad njim je opozorilo z imenom zadnjega urejevalca (ali »izbrisan uporabnik«) in časom spremembe ter možnosti *Prikaži razlike*, *Uporabi trenutno različico* in *Shrani moje spremembe* (design.md 8.14); *Shrani moje spremembe* ponovno pošlje uporabnikove vrednosti s trenutno verzijo. *(najnižja vloga: EDITOR)*
- **FR-004-12**: Sistem MORA omogočiti izbris posameznega kontakta iz pogleda kontakta in iz menija dejanj vrstice po potrditvi v dialogu (design.md 8.11) z naslovom »Izbrišem kontakt ‹ime›?«, besedilom posledice, gumboma *Prekliči* in *Izbriši kontakt* ter fokusom na *Prekliči* ob odprtju; zahteva vsebuje verzijo, ki jo je uporabnik videl – ob zastareli verziji se izbris zavrne z `409 VERSION_CONFLICT` in pogled se osveži. Po uspehu je uporabnik na seznamu kontaktov. *(najnižja vloga: EDITOR)*
- **FR-004-13**: Sistem MORA urejanje ali izbris kontakta, ki je bil medtem izbrisan, zavrniti z `404` brez ponovnega ustvarjanja kontakta; vmesnik pokaže »Tega kontakta ni več – medtem ga je nekdo izbrisal.« s povezavo na seznam, pri urejanju pa obdrži vnesene podatke vidne v obrazcu. *(najnižja vloga: EDITOR)*
- **FR-004-14**: Sistem MORA kontakte strogo izolirati med skupinami: vsako branje, urejanje ali izbris kontakta, ki ne pripada skupini iz zahteve, se obravnava kot neobstoječ kontakt (`404`), tudi kadar je uporabnik član obeh skupin; vmesnik pokaže stran »Te strani ni« (design.md 9.10). *(najnižja vloga: VIEWER)*
- **FR-004-15**: Sistem MORA v arhivirani skupini ustvarjanje, urejanje in izbris kontaktov zavrniti z `409 GROUP_ARCHIVED` (člani z vlogo EDITOR ali višjo) oziroma `403` (VIEWER), branje seznama in pogleda kontakta pa dovoliti (feature-map §2.2, §2.4). *(najnižja vloga: EDITOR)*
- **FR-004-16**: Sistem MORA vsak uspeh ustvarjanja, urejanja in izbrisa prikazati kot obvestilo (design.md 8.13: »Kontakt ‹ime› je shranjen.«, »Kontakt ‹ime› je izbrisan.«), ki ga sporoči bralnik zaslona, in vsak neuspeh kot trajno sporočilo ob mestu akcije v sl/en brez tehničnih kod, z gumbom *Poskusi znova*, kjer je ponovitev smiselna; ob neuspehu obrazec ohrani vnesene podatke. *(najnižja vloga: EDITOR)*
- **FR-004-17**: Sistem MORA bralcu in vsem članom arhivirane skupine ne izrisati akcij *Nov kontakt*, *Uredi kontakt*, *Izbriši kontakt* in ustreznih elementov menija dejanj vrstice; ob neposrednem odprtju poti obrazca namesto obrazca prikaže razlago (nezadostna vloga oziroma arhivirana skupina) s povezavo na seznam kontaktov. *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Kontakt**: oseba v skupini; pripada natanko eni skupini. Atributi: ime, priimek, naslov, e-naslov, telefon, seznam dodatnih atributov, seznam značk, verzija, čas ustvarjanja, čas zadnje spremembe in izvajalec zadnje spremembe (prikazan kot »izbrisan uporabnik«, če je izbrisal račun).
- **Dodatni atribut**: par ključ–vrednost, ki pripada enemu kontaktu; ključ je edinstven v kontaktu ne glede na velikost črk; vrstni red je vrstni red vnosa.
- **Značka**: kratka oznaka brez presledkov, ki pripada enemu kontaktu; edinstvena v kontaktu ne glede na velikost črk; *značke skupine* so množica vseh značk kontaktov skupine (vir predlogov v kombiniranem polju).
- **Stran seznama**: izsek kontaktov skupine (številka strani, velikost strani, skupno število) v privzetem vrstnem redu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Urednik ustvari kontakt z imenom, priimkom, e-naslovom, dvema dodatnima atributoma in dvema značkama v manj kot 90 sekundah, samo s tipkovnico.
- **SC-002**: V skupini z 10.000 kontakti se katera koli stran seznama (do 100 kontaktov) prikaže v manj kot 2 sekundah v 95 % odpiranj.
- **SC-003**: 100 % primerov matrike izolacije (neprijavljen, nečlan, bralec, arhivirana skupina, kontakt druge skupine) vrne pričakovan odgovor brez razkritja podatkov drugih skupin.
- **SC-004**: V preizkusih sočasnega urejanja in izbrisa se nobena sprememba ne prepiše ali izgubi tiho (0 primerov); vsak konflikt uporabnik razreši z eno od treh ponujenih možnosti.
- **SC-005**: Izbrani kontakt v panelu podrobnosti ostane izbran po osvežitvi strani v 100 % primerov pri širini 1280 px.
- **SC-006**: Seznam, pogled kontakta, obrazec in potrditveni dialog nimajo kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px in so uporabni samo s tipkovnico.

## Assumptions

- Odvisnost od **002-skupine** (skupine, vloge, glava in zavihki skupine) in **003-arhiviranje** (arhivirana skupina, pasica, splošno pravilo zavračanja pisanja); od **001-prijava** stran »Te strani ni« in prijava.
- **005-revizijska-sled** doda beleženje ustvarjanja, urejanja in izbrisa iz te funkcionalnosti ter povezavo »Spremembe tega kontakta v revizijski sledi« v pogledu kontakta; ta specifikacija revizijske sledi ne določa.
- **008-iskanje** je lastnik iskanja, filtrov in razvrščanja (vključno z gumbi za razvrščanje v glavah stolpcev in praznim stanjem »Ni kontaktov, ki ustrezajo filtrom.«); ta funkcionalnost določa le privzeto razvrščanje in paginacijo, ki ju 008 razširi.
- **009-mnozicno-urejanje** je lastnik stolpca za izbiro, akcijske vrstice in množičnega izbrisa; **011-dvojniki** združevanja.
- Ime predefiniranega atributa pri preverjanju ključa pomeni slovensko ali angleško ime polja (ime/first name, priimek/last name, naslov/address, e-naslov/email/e-mail, telefon/phone), primerjano ne glede na velikost črk.
- Izbris uporablja optimistično zaklepanje enako kot urejanje (izbris zastarele verzije → `409 VERSION_CONFLICT`), da izbris ne zavrže tiho tuje spremembe, ki je uporabnik ni videl.
- Shranjevanje brez dejanske spremembe ni sprememba: verzija se ne poveča (005 zanj ne ustvari vnosa).
- Razvrščanje uporablja eno samo, slovensko abecedno primerjavo (Č za C, Š za S, Ž za Z), ne glede na jezik vmesnika in uporabnika: vrstni red je za vse člane enak, zato so strani paginacije in povezave pri vseh enake (D-63; prvotni D-38 s kodnimi točkami je nadomeščen).
- Pri razvrščanju se prazna vrednost uvrsti za neprazne; enake vrednosti uredi čas ustvarjanja.
- Značke se hranijo v obliki, kot jih je vpisal uporabnik; edinstvenost in predlogi so neodvisni od velikosti črk.
- Izbris kontakta je trajen v smislu te funkcionalnosti; obnovitev omogoča le rollback (005).
- Velikost strani zunaj 25/50/100 se zavrne (`400`), stran onkraj zadnje vrne prazen seznam s pravilnim skupnim številom.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| CR-004-1 | 2026-11-10 | FR-004-06 | Privzeto razvrščanje po slovenski abecedi namesto po kodnih točkah Unicode (nasprotje z 008, FR-008-07). Spremembo kode in testov 004 izvede 008 (glej D-63). | D-63 |
