# Feature Specification: Pametni atributi in značke

**Feature Branch**: `pametni-atributi` (no number; the directory is `docs/specs/013-pametni-atributi/`)

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "Predefinirani polji Država in Podjetje; samodejni predlogi ključev atributov glede na obstoječe ključe v skupini; samodejni predlogi vrednosti glede na izbran atribut; izboljšani predlogi značk brez podvajanja obstoječe funkcionalnosti; preprečevanje nepotrebnih podvojenih ključev (`Podjetje` in `podjetje`); preprost in odziven vmesnik po design.md. Obstoječi kontakti, atributi, značke in revizijska sled ostanejo delujoči; izolacija skupin in pravice se ne spremenijo."

## Clarifications

### Session 2026-11-15

- Q: Kako shranjevati državo (prosto besedilo ali standardiziran seznam)? → A: Standardiziran seznam: shrani se ISO 3166-1 alpha-2 koda (SI, AT, DE …); vmesnik prikazuje lokalizirana imena (sl/en); iskanje po imenu in kodi; ob uvozu (014) se Slovenija, Slovenia in SI preslikajo v SI, neprepoznane ali dvoumne vrednosti se nikoli ne spremenijo samodejno, odloči uporabnik.
- Q: Kaj narediti z obstoječimi dodatnimi atributi z imeni Država, Podjetje, Country, Company? → A: Ostanejo nespremenjeni (brez migracije); uporabnik jih lahko ročno in varno prenese v novi polji; vrednosti držav, ki niso veljavne, je treba pred prenosom razrešiti.
- Q: Kako deluje kanonični zapis ključev in značk? → A: Strežnik ob pisanju zamenja vpisani zapis s kanoničnim zapisom skupine (velja za ključe in značke); obstoječi podatki se ne spreminjajo samodejno.
- Q: Ali je kontakt brez imena in priimka, samo s podjetjem, dovoljen? → A: Ne; pravilo »ime ali priimek« ostane; podjetje je podatek kontaktne osebe, ne samostojen tip kontakta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Država in podjetje kot predefinirani polji (Priority: P1)

Urednik pri kontaktu izbere državo s seznama in vpiše podjetje v svoji polji, ne več kot poljubna atributa. Polji sta vidni v obrazcu in pogledu kontakta ter delujeta v iskanju, filtrih, izvozu, množičnem urejanju, primerjavi dvojnikov in revizijski sledi kot druga predefinirana polja.

**Why this priority**: profesorjeva zahteva izrecno našteva državo in podjetje med predefiniranimi polji; polji sta tudi cilja preslikave pri uvozu (014).

**Independent Test**: urednik ustvari kontakt s podjetjem in državo, ga najde z iskanjem in filtrom, ga izvozi, množično spremeni državo in preveri, da sta spremembi v revizijski sledi.

**Acceptance Scenarios**:

1. **[FR-013-01]** **Given** urednik v nearhivirani skupini, **When** ustvari kontakt Janez Novak s podjetjem »Acme d.o.o.« in državo »Slovenija« (izbrano s seznama), **Then** je kontakt shranjen s kodo `SI`, pogled kontakta pa prikaže »Acme d.o.o.« in državo v jeziku vmesnika (»Slovenija« oz. »Slovenia«) z oznakama *Podjetje* in *Država*; ostala polja in pravila iz 004 veljajo nespremenjeno.
2. **[FR-013-01]** **Given** urednik vpiše podjetje z 201 znaki, **When** shrani, **Then** je shranjevanje zavrnjeno z napako ob polju in kontakt ostane nespremenjen.
3. **[FR-013-13]** **Given** zahteva z državo, ki ni veljavna koda ISO 3166-1 alpha-2 (npr. `XX`, `slovenija`, `SVN`, `si`), **When** urednik shrani kontakt, **Then** je zahteva zavrnjena z napako ob polju *Država* in kontakt ostane nespremenjen.
4. **[FR-013-13]** **Given** polje *Država* v obrazcu, **When** urednik vpiše »avs« ali »at«, **Then** seznam ponudi »Avstrija« (v angleškem vmesniku »Austria«); izbira s tipkovnico shrani kodo `AT`; polje ne sprejme besedila, ki ni država s seznama.
5. **[FR-013-02]** **Given** skupina s kontakti, ustvarjenimi pred 013, **When** član odpre seznam, pogled ali obrazec kontakta, **Then** kontakti delujejo kot prej, polji *Podjetje* in *Država* sta prazni, verzije kontaktov se ne spremenijo in noben podatek ni prepisan.
6. **[FR-013-03]** **Given** kontakt s podjetjem »Acme d.o.o.« in državo `AT`, **When** član v iskalno polje vpiše »acme«, »avstrija«, »austria« ali »at« ali v filtru izbere polje *Podjetje* oziroma *Država*, **Then** je kontakt med zadetki, ne glede na jezik vmesnika.
7. **[FR-013-04]** **Given** izvoz izbranih kontaktov, **When** se datoteka ustvari, **Then** vsebuje stolpca *Država* (ime države v jeziku izvoza) in *Podjetje* takoj za stolpcem *Telefon* in pred stolpci dodatnih atributov, glavi sta v jeziku vmesnika (sl/en).
8. **[FR-013-05]** **Given** urednik je izbral 12 kontaktov, **When** v množičnem urejanju nastavi državo »Avstrija« ali počisti podjetje, **Then** se vrednost atomarno spremeni pri vseh 12 (kot za naslov, e-naslov in telefon po 009) in nastane en vnos v sledi.
9. **[FR-013-06]** **Given** skupina dvojnikov, katerih kontakta imata različni podjetji in državi, **When** urednik odpre primerjavo, **Then** sta *Podjetje* in *Država* vrstici z izbiro vrednosti kot druga predefinirana polja (država z imenom v jeziku vmesnika), združeni kontakt prejme izbrani vrednosti.
10. **[FR-013-07]** **Given** urednik spremeni državo kontakta iz `SI` v `AT`, **When** član odpre podrobnosti vnosa v sledi, **Then** vidi vrstico *Država* z vrednostma »Slovenija« in »Avstrija« (v jeziku vmesnika); **When** admin povrne skupino na točko pred spremembo, **Then** ima kontakt prejšnjo državo (ali prazno, če je ni imel), tudi za vnose, zapisane pred 013.

---

### User Story 2 - Predlogi ključev dodatnih atributov (Priority: P1)

Pri dodajanju atributa urednik ob polju *Ključ* dobi predloge ključev, ki jih skupina že uporablja, in ne vpisuje vedno znova enakih imen. Ključ, ki se od obstoječega razlikuje le po velikosti črk, ne nastane kot nov ključ.

**Why this priority**: profesorjev predlog 1 in konkurenčna prednost enostavnosti; brez tega se ključi v skupini razdrobijo (`Kompetenca`, `kompetenca`) in filtri ter izvoz postanejo nepregledni.

**Independent Test**: v skupini s ključem `Kompetenca` urednik doda atribut na drugem kontaktu, izbere predlog s tipkovnico in preveri, da ključ ostane `Kompetenca`; vpiše `kompetenca` in preveri enak izid.

**Acceptance Scenarios**:

1. **[FR-013-09]** **Given** skupina, v kateri so ključi `Kompetenca` (na 12 kontaktih), `Vloga` (5) in `Projekt` (2), **When** urednik doda atribut in fokusira prazno polje *Ključ*, **Then** se prikažejo predlogi `Kompetenca`, `Vloga`, `Projekt` v tem vrstnem redu (najpogostejši prvi, največ 10).
2. **[FR-013-09]** **Given** isti predlogi, **When** urednik vpiše »vl« ali »ompe«, **Then** se predlogi zožijo na ujemajoče ključe brez razlike velikosti črk in strešic, predpona pred ujemanjem v sredini; z *Puščica navzdol*, *Enter* izbere predlog in fokus preide v polje *Vrednost*.
3. **[FR-013-09]** **Given** kontakt že ima atribut `Vloga`, **When** urednik doda nov atribut, **Then** `Vloga` ni med predlogi; rezervirana imena (FR-013-08) prav tako niso.
4. **[FR-013-10]** **Given** v skupini obstaja ključ `Kompetenca`, **When** urednik vpiše `kompetenca` (ali `KOMPETENCA`) in shrani, **Then** strežnik shrani atribut s ključem `Kompetenca`, vmesnik pa je to pokazal že ob zapustitvi polja; v skupini ne nastane drugi ključ; enako velja za zahtevo prek API in za množično urejanje.
5. **[FR-013-09]** **Given** vpisan ključ, ki ga skupina še nima, **When** urednik shrani, **Then** je ključ sprejet kot nov (prost vnos ostane mogoč) in je od takrat naprej predlog.
6. **[FR-013-15]** **Given** urednik pri množičnem urejanju nastavlja atribut, **When** vpisuje ključ in vrednost, **Then** dobi enake predloge in enako ravnanje kot v obrazcu kontakta.

---

### User Story 3 - Predlogi vrednosti glede na ključ (Priority: P1)

Ko je ključ atributa znan, polje *Vrednost* ponudi vrednosti, ki jih skupina že uporablja za ta ključ. Podobno polje *Podjetje* ponudi podjetja, ki jih skupina že ima, polje *Država* pa države s seznama, najprej tiste, ki jih skupina najpogosteje uporablja.

**Why this priority**: profesorjev predlog 1; poenoteni zapisi (»web dev« namesto »Web Dev«, »Acme d.o.o.« namesto »ACME«) izboljšajo iskanje, filtre in dvojnike.

**Independent Test**: urednik izbere ključ `Kompetenca`, v polju *Vrednost* vidi predloge iz skupine, izbere enega; v obrazcu doda novo podjetje in ga na naslednjem kontaktu najde med predlogi.

**Acceptance Scenarios**:

1. **[FR-013-11]** **Given** v skupini ima ključ `Kompetenca` vrednosti »web dev« (8 kontaktov), »data« (3), **When** urednik v vrstici s ključem `Kompetenca` fokusira polje *Vrednost*, **Then** vidi predloga »web dev« in »data« (najpogostejši prvi, največ 10); ob vpisu »da« ostane »data«.
2. **[FR-013-11]** **Given** ključ, ki ga skupina še nima, ali prazen ključ, **When** urednik fokusira polje *Vrednost*, **Then** predlogov ni in prosti vnos deluje.
3. **[FR-013-11]** **Given** vrednost, ki ni med predlogi, **When** urednik shrani, **Then** je vrednost sprejeta (predlogi ne omejujejo vnosa vrednosti atributa) in je odslej predlog.
4. **[FR-013-12]** **Given** v skupini obstajata podjetji »Acme d.o.o.« (7 kontaktov) in »Beta« (2), **When** urednik v obrazcu kontakta fokusira polje *Podjetje*, **Then** vidi predloga po pogostosti, ob vpisu »ac« samo »Acme d.o.o.«; vnos podjetja ostane prosto besedilo.
5. **[FR-013-12]** **Given** v skupini ima 9 kontaktov državo `AT` in 2 državo `DE`, **When** urednik fokusira prazno polje *Država*, **Then** sta na vrhu seznama »Avstrija« in »Nemčija« (po pogostosti v skupini), nato ostale države po abecedi jezika vmesnika.

---

### User Story 4 - Boljši predlogi značk (Priority: P2)

Obstoječe predloge značk (004: po predponi, šele po vpisu) nadgradimo: predlogi se prikažejo že ob fokusu, urejeni po pogostosti, z enakim pravilom zapisa kot pri ključih. Komponento in končno točko iz 004 razširimo, ne podvajamo.

**Why this priority**: profesorjev predlog 1 za značke; manjša nadgradnja že delujoče funkcionalnosti.

**Independent Test**: v skupini z značkami `vip` (20 kontaktov) in `novi` (4) urednik fokusira polje značk, vidi obe po pogostosti, vpiše `VIP` in dobi `vip`.

**Acceptance Scenarios**:

1. **[FR-013-14]** **Given** skupina z značkami `vip` (20 kontaktov), `novi` (4), `stranka` (9), **When** urednik fokusira prazno polje za značke, **Then** vidi `vip`, `stranka`, `novi` (najpogostejše prve, z vidnim številom kontaktov, največ 10), razen značk, ki jih kontakt že ima.
2. **[FR-013-14]** **Given** isti predlogi, **When** urednik vpiše »st«, **Then** so predlogi ujemajoče značke brez razlike velikosti črk in strešic, predpona pred ujemanjem v sredini (prej samo predpona, 004 FR-004-04).
3. **[FR-013-10]** **Given** v skupini obstaja značka `vip`, **When** urednik doda značko `VIP`, **Then** strežnik shrani `vip`; enako velja za zahtevo prek API in za množično urejanje.
4. **[FR-013-14]** **Given** obstoječa pravila značk (1–50 znakov, brez presledkov, največ 30, edinstvena v kontaktu), **When** urednik vpiše neveljavno značko, **Then** napake in sporočila ostanejo kot v 004.
5. **[FR-013-15]** **Given** množično urejanje značk (009), **When** urednik fokusira polje *Dodaj značke*, **Then** dobi enake predloge.

---

### User Story 5 - Prenos obstoječih atributov v novi polji (Priority: P2)

Skupina, ki je državo ali podjetje doslej vodila kot dodatni atribut (`Država`, `Podjetje`, `Country`, `Company`), teh atributov ne izgubi in jih ne mora izgubiti samodejno: kontakt se še vedno odpre in shrani, uporabnik pa lahko vrednost varno prenese v novo polje.

**Why this priority**: zahteva, da obstoječi podatki ostanejo delujoči in se ne spreminjajo brez dogovorjene migracije.

**Independent Test**: kontakt z atributom `Država` = »Slovenija« in drugi z `Država` = »Slovenija?!«; uporabnik prenese prvega v polje (koda `SI`) in pri drugem izbere državo ročno; oba prenosa sta navadni urejanji v sledi.

**Acceptance Scenarios**:

1. **[FR-013-08]** **Given** kontakt iz časa pred 013 z atributom `Država` = »Slovenija«, **When** urednik kontakt odpre, spremeni telefon in shrani, **Then** je shranjen, atribut `Država` ostane nespremenjen in v sledi je samo sprememba telefona.
2. **[FR-013-20]** **Given** isti kontakt v obrazcu za urejanje, **When** urednik pri atributu `Država` izbere »Premakni v polje Država«, **Then** je polje *Država* predizpolnjeno z »Slovenija« (`SI`), atribut je odstranjen iz obrazca, dokler urednik ne shrani, pa se na strežniku ne spremeni nič; po shranjevanju je v sledi ena sprememba (država in atribut).
3. **[FR-013-20]** **Given** atribut `Država` = »Korea«, ki je dvoumen (Južna in Severna Koreja), ali »Slovenija?!«, ki ni prepoznan, **When** urednik izbere »Premakni v polje Država«, **Then** polje ni samodejno izpolnjeno, vmesnik pokaže vrednost atributa in zahteva izbiro države s seznama (pri dvoumni vrednosti so ponujeni kandidati); brez izbire prenos ni mogoč, atribut ostane.
4. **[FR-013-20]** **Given** kontakt z atributom `Podjetje` = »Acme« in poljem *Podjetje* = »Acme d.o.o.«, **When** urednik izbere »Premakni v polje Podjetje«, **Then** vmesnik pokaže obe vrednosti in zahteva odločitev (obdrži vrednost polja in odstrani atribut, nadomesti vrednost polja z atributom ali prekliči); če je polje prazno, se vrednost prenese brez vprašanja.
5. **[FR-013-08]** **Given** urednik pri kontaktu ali v množičnem urejanju vpiše nov ključ `Country` (ali `država`, `COMPANY`), **When** shrani, **Then** je zahteva zavrnjena z RESERVED_KEY in vmesnik uporabnika napoti na ustrezno polje.
6. **[FR-013-08]** **Given** množično urejanje, ki odstranjuje atribut `Država`, **When** urednik potrdi, **Then** se atribut odstrani pri kontaktih, ki ga imajo; dovoljen je tudi izbris takega atributa v obrazcu.
7. **[FR-013-08]** **Given** združevanje dvojnikov (011), kjer eden od kontaktov ima atribut `Država`, **When** urednik združi, **Then** združitev uspe in atribut se obravnava kot vsak drug dodatni atribut.

---

### User Story 6 - Zanesljivost in ohranitev obstoječega delovanja (Priority: P1)

Predlogi pospešijo delo, vendar ga nikoli ne ovirajo: ob napaki ali počasnem odgovoru vnos deluje brez njih, podatki druge skupine nikoli niso vidni in obstoječi kontakti ostanejo uporabni.

**Why this priority**: konstitucija III (izolacija) in zahteva, da obstoječi podatki ostanejo delujoči.

**Independent Test**: matrika izolacije za nove končne točke predlogov; urednik z odpovedjo omrežja še vedno shrani kontakt (država je izbirni seznam brez omrežja).

**Acceptance Scenarios**:

1. **[FR-013-16]** **Given** članstvo urednika v skupinah A in B, **When** v skupini A zahteva predloge, **Then** vsebujejo samo ključe, vrednosti, podjetja, značke in števila skupine A.
2. **[FR-013-17]** **Given** odgovor predlogov ne prispe ali vrne napako, **When** urednik nadaljuje z vnosom, **Then** polja ključ, vrednost, podjetje in značke delujejo kot navadna besedilna polja, obrazec se shrani in uporabniku ni prikazana napaka zaradi predlogov; seznam držav je na voljo tudi brez predlogov po pogostosti.
3. **[FR-013-18]** **Given** uporabnik tipkovnice ali bralnika zaslona, **When** uporablja polja s predlogi pri 360, 768 in 1280 px, **Then** je vsa interakcija mogoča s tipkovnico, število predlogov je sporočeno bralniku zaslona in na zaslonih ni kršitev WCAG 2.1 A in AA.
4. **[FR-013-19]** **Given** besedilo »Slovenija«, »Slovenia«, »SI« ali »SVN«, **When** ga sistem prepozna kot državo (prepoznavanje države v 013 uporabi prenos v US5, v 014 pa uvoz), **Then** je izid `SI`; **Given** besedilo, ki ustreza več državam ali nobeni, **Then** je izid »dvoumno« (s kandidati) oziroma »neprepoznano« in sistem vrednosti nikoli ne spremeni samodejno.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-013-09, FR-013-11, FR-013-12, FR-013-14 | unauthenticated (no/invalid/expired token) | zahteva predlogov ključev, vrednosti, podjetij ali značk | 401, podatki niso vrnjeni |
| FR-013-09, FR-013-11, FR-013-12, FR-013-14 | authenticated non-member | zahteva predlogov | 404, obstoj skupine ni razkrit |
| FR-013-09, FR-013-11, FR-013-12, FR-013-14 | member with role VIEWER | zahteva predlogov | 403, podatki niso vrnjeni |
| FR-013-09, FR-013-11, FR-013-12, FR-013-14 | EDITOR+ of an archived group | zahteva predlogov | 200 – samo branje, enako kot predlogi značk v 004 |
| FR-013-16 | member of group A | predlogi s ključem, vrednostjo ali predpono, ki obstaja samo v skupini B | 200 s praznim seznamom, podatki skupine B niso razkriti |
| FR-013-01 | unauthenticated | ustvarjanje ali urejanje kontakta s poljema Država, Podjetje | 401, nič se ne spremeni |
| FR-013-01 | authenticated non-member | ustvarjanje ali urejanje kontakta | 404, nič se ne spremeni |
| FR-013-01, FR-013-05 | member with role VIEWER | ustvarjanje, urejanje ali množično urejanje polj Država, Podjetje | 403, nič se ne spremeni |
| FR-013-01, FR-013-05 | member of an archived group | ustvarjanje, urejanje ali množično urejanje | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-013-01 | EDITOR+ | zastarela verzija kontakta | 409 VERSION_CONFLICT, nič se ne spremeni |
| FR-013-01 | EDITOR+ | podjetje > 200 znakov | 400 VALIDATION_FAILED s kodo TOO_LONG ob polju |
| FR-013-13 | EDITOR+ | država, ki ni veljavna koda ISO 3166-1 alpha-2 (tudi mala črka ali alpha-3) | 400 VALIDATION_FAILED s kodo INVALID_VALUE ob polju |
| FR-013-08 | EDITOR+ | nov ali spremenjen ključ `Država`, `Country`, `Podjetje` ali `Company` (v poljubni velikosti črk) pri kontaktu, ki takega ključa še nima | 400 VALIDATION_FAILED s kodo RESERVED_KEY ob ključu |

### Edge Cases

- Dve različici istega ključa v skupini iz časa pred 013 (`Kompetenca` pri 12 kontaktih, `kompetenca` pri 3): kanonični zapis je pogostejša različica; obstoječi kontakti se ne spremenijo; predlog je samo ena (kanonična) različica.
- Enako število uporab: kanonična je različica, ki jo ima najstarejši kontakt (po času nastanka, nato id).
- Ključa, ki se razlikujeta samo po strešicah (`Cena` in `Čena`), sta različna ključa (identiteta ključa ostane brez razlike velikosti črk iz 004); predlogi pa ujemanje iščejo brez strešic.
- Kontakt, ki že ima atribut `kompetenca`, ob urejanju drugih polj ne dobi preimenovanja (nespremenjen zapis ostane, FR-013-10); če uporabnik ključ spremeni, se nov zapis uskladi s kanoničnim zapisom skupine.
- Vrednost predloga, daljša od 100 znakov: prikazana skrajšano, ob izbiri vstavljena v celoti.
- Skupina z več kot 10 ključi, vrednostmi, podjetji ali značkami: prikaže se samo 10 najpogostejših, ostale najde uporabnik z vpisom.
- Vpis ključa v drugem jeziku (`Company` v slovenski skupini): napaka RESERVED_KEY z napotkom na polje *Podjetje*.
- Hitro tipkanje: veljavni so samo odgovori na zadnji vpis; zastarel odgovor ne prepiše predlogov.
- Rollback (005) na točko pred 013: stanje brez polj Država in Podjetje je stanje s praznima poljema; rollback ju počisti, če sta bili nastavljeni po točki. Rollback obnovi posnetke dobesedno, brez kanonizacije in brez preverjanja rezerviranih imen.
- Množično urejanje atributa nad kontakti z različnimi različicami istega ključa: nastavitev uporabi kanonični zapis ključa; obstoječi atributi z drugo različico istega ključa se ne spreminjajo.
- Kontakt iz časa pred 013 z atributom `Država`, ki se v obrazcu pri istem imenu pojavi poleg novega polja *Država*: oba sta vidna, dokler ju uporabnik ne združi; strežnik ne preverja ujemanja vrednosti.
- Dvoje sočasnih zapisov, ki istočasno ustvarita ključ `x` in `X` v skupini, ki ga še nima: lahko nastaneta obe različici (brez zaklepanja); stanje je veljavno, naslednji zapisi uporabijo kanonično.
- Prepoznavanje države je brez razlike velikosti črk in strešic ter uporablja imena v obeh jezikih (sl, en), kode alpha-2 in alpha-3 ter kratek seznam uveljavljenih alternativnih imen; vse drugo je dvoumno ali neprepoznano.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-013-01**: Sistem MORA kontaktu dodati neobvezni predefinirani polji *Podjetje* (do 200 znakov, obrezano presledkov) in *Država* (FR-013-13), ki ju uredniki urejajo v obrazcu in vsi člani vidijo v pogledu kontakta; pravilo, da je vsaj ime ali priimek obvezen, ostane (podjetje je podatek kontaktne osebe, ne samostojen kontakt). Seznam kontaktov (design.md 8.6) ne dobi novih stolpcev. *(najnižja vloga: EDITOR; ogled VIEWER)*
- **FR-013-02**: Sistem NE SME spreminjati obstoječih podatkov: nova polja so za obstoječe kontakte prazna, verzije kontaktov se ne spremenijo, posnetki revizijske sledi iz časa pred 013 se berejo kot posnetki s praznima poljema. Migracija je samo dodajanje polj. *(najnižja vloga: —)*
- **FR-013-03**: Sistem MORA polji *Podjetje* in *Država* vključiti v iskanje po besedilu in v filtre po predefiniranih poljih enako kot druga predefinirana polja (008); država se išče po kodi in po imenu v slovenščini in angleščini, ne glede na jezik vmesnika in brez razlike velikosti črk in strešic. *(najnižja vloga: VIEWER)*
- **FR-013-04**: Sistem MORA v izvoz (010) dodati stolpca *Država* (ime države v jeziku izvoza, sl/en) in *Podjetje* takoj za stolpcem *Telefon* in pred stolpce dodatnih atributov, z glavama v jeziku izvoza. *(najnižja vloga: VIEWER)*
- **FR-013-05**: Sistem MORA v množično urejanje (009) dodati nastavitev in čiščenje polj *Podjetje* in *Država* z enako atomarnostjo, validacijo in vnosom v sledi kot za naslov, e-naslov in telefon. *(najnižja vloga: EDITOR)*
- **FR-013-06**: Sistem MORA polji *Podjetje* in *Država* obravnavati kot predefinirani polji v primerjavi dvojnikov in združevanju (011): vrstici z izbiro vrednosti, privzeto prva neprazna vrednost; kategorije iskanja dvojnikov ostanejo *Ime in priimek*, *E-naslov*, *Telefon*. *(najnižja vloga: EDITOR)*
- **FR-013-07**: Sistem MORA polji *Podjetje* in *Država* vključiti v razlike revizijske sledi (005, prikaz *Polje · Prej · Potem*; država z imenom v jeziku vmesnika) in v rollback, kar vključuje združevanje (011) in množične spremembe. *(najnižja vloga: VIEWER za ogled; ADMIN za rollback)*
- **FR-013-08**: Sistem MORA imena `država`, `country`, `podjetje` in `company` (po obstoječi normalizaciji: male črke, strnjeni presledki) dodati med rezervirana imena ključev dodatnih atributov (004): nov ali spremenjen ključ s tem imenom je zavrnjen (`400 VALIDATION_FAILED`, `RESERVED_KEY`) in vmesnik uporabnika napoti na ustrezno polje. **Obstoječi atributi s temi imeni ostanejo nespremenjeni**: kontakt, ki tak atribut že ima, se lahko ureja in shrani, atribut pa se lahko spremeni, ohrani ali odstrani; izbris atributa je dovoljen tudi v množičnem urejanju, združevanje (011) in rollback (005) ga prenašata kot vsak drug atribut. Nič se ne migrira samodejno. *(najnižja vloga: EDITOR)*
- **FR-013-09**: Sistem MORA ob polju *Ključ* (obrazec kontakta in množično urejanje atributov) ponuditi predloge ključev skupine kot kombinirano polje po design.md 8.4: ob fokusu praznega polja do 10 najpogostejših ključev skupine, ob vpisu ujemajoči ključi brez razlike velikosti črk in strešic (predpona pred ujemanjem v sredini, nato po pogostosti); ključi, ki jih kontakt že ima, in rezervirana imena (FR-013-08) niso ponujeni; prosti vnos novega ključa ostane mogoč. Vsak ključ je v predlogih v kanonični obliki (FR-013-10). *(najnižja vloga: EDITOR)*
- **FR-013-10**: Sistem MORA na strežniku preprečiti podvojene ključe atributov in značk, ki se razlikujejo samo po velikosti črk: pri vsakem pisanju (ustvarjanje, urejanje, množično urejanje, združevanje) se ključ oziroma značka, ki ustreza obstoječemu ključu oziroma znački skupine brez razlike velikosti črk, nadomesti s kanonično obliko skupine, to je s pogostejšo različico (pri enakem številu z različico najstarejšega kontakta). Zapis, ki ga kontakt že ima in ga uporabnik ne spremeni, se ne spremeni. Obstoječi podatki se nikoli ne spreminjajo samodejno; rollback obnovi posnetke dobesedno. Identiteta ključa ostane brez razlike velikosti črk (004), strešice razlikujejo ključe. Vmesnik pokaže kanonični zapis, preden uporabnik shrani. *(najnižja vloga: EDITOR)*
- **FR-013-11**: Sistem MORA ob polju *Vrednost* atributa, katerega ključ obstaja v skupini, ponuditi do 10 najpogostejših vrednosti tega ključa v skupini (ob vpisu ujemajoče brez razlike velikosti črk in strešic); za neznan ali prazen ključ predlogov ni; vrednost ostane prosto besedilo (1–500 znakov). *(najnižja vloga: EDITOR)*
- **FR-013-12**: Sistem MORA ob polju *Podjetje* ponuditi do 10 najpogostejših podjetij kontaktov skupine (ob vpisu ujemajoča brez razlike velikosti črk in strešic); vnos ostane prosto besedilo. Ob polju *Država* MORA ponuditi seznam držav, v katerem so na vrhu države, ki jih skupina najpogosteje uporablja, nato druge po abecedi jezika vmesnika. *(najnižja vloga: EDITOR)*
- **FR-013-13**: Sistem MORA državo shraniti kot kodo ISO 3166-1 alpha-2 (dve veliki črki, uradno dodeljena koda); vsaka druga vrednost je zavrnjena (`400 VALIDATION_FAILED`, `INVALID_VALUE`). Vmesnik prikazuje lokalizirana imena držav (sl/en) v obrazcu, pogledu, filtrih, primerjavi dvojnikov in prikazu sledi; polje v obrazcu je izbirni seznam z iskanjem po imenu in kodi (brez prostega besedila). API sprejema in vrača kode. *(najnižja vloga: EDITOR)*
- **FR-013-14**: Sistem MORA predloge značk (004, FR-004-04) razširiti, ne podvojiti: ob fokusu praznega polja do 10 najpogostejših značk skupine s številom kontaktov, ob vpisu ujemajoče brez razlike velikosti črk in strešic (predpona pred ujemanjem v sredini, nato po pogostosti); značke, ki jih kontakt že ima, niso ponujene; pravila značk iz 004 (dolžina, brez presledkov, največ 30, edinstvenost v kontaktu) se ne spremenijo. *(najnižja vloga: EDITOR)*
- **FR-013-15**: Sistem MORA enake predloge in enako ravnanje (FR-013-09, -10, -11, -14) zagotoviti v množičnem urejanju (009), kjer so polja ključ, vrednost in značke. *(najnižja vloga: EDITOR)*
- **FR-013-16**: Sistem MORA predloge ključev, vrednosti, podjetij in značk vračati samo iz skupine v zahtevi in samo kot besedilo s številom uporab; ne razkrije identifikatorjev ali podatkov kontaktov. Neprijavljen dobi 401, nečlan 404, bralec 403; v arhivirani skupini je branje dovoljeno. *(najnižja vloga: EDITOR)*
- **FR-013-17**: Sistem MORA zagotoviti, da predlogi nikoli ne ovirajo vnosa: ob napaki, počasnem odgovoru ali brez predlogov polja ključ, vrednost, podjetje in značke delujejo kot navadna besedilna polja, neuspeh predlogov ne prikaže napake; zastareli odgovori ne prepišejo novejših; seznam držav deluje tudi brez predlogov po pogostosti. *(najnižja vloga: EDITOR)*
- **FR-013-18**: Sistem MORA kombinirana polja iz tega razdelka (ključ, vrednost, podjetje, država, značke) izvesti po ARIA 1.2 (design.md 8.4): tipkovnica (*Puščica*, *Enter*, *Esc*), število predlogov sporočeno bralniku zaslona, ciljne površine najmanj 44 px, delovanje od 320 px naprej, besedila v sl/en, barve samo iz žetonov. *(najnižja vloga: EDITOR)*
- **FR-013-19**: Sistem MORA zagotoviti skupno prepoznavanje države iz besedila (uporabita ga prenos po FR-013-20 in uvoz 014): brez razlike velikosti črk in strešic prepozna uradna imena v slovenščini in angleščini, kodi alpha-2 in alpha-3 ter kratek seznam uveljavljenih alternativnih imen (npr. »UK«, »USA«, »Czech Republic«) in vrne natanko eno od treh: *država* (ena koda), *dvoumno* (več kandidatov) ali *neprepoznano*. Dvoumne in neprepoznane vrednosti sistem nikoli ne spremeni samodejno; odločitev je uporabnikova. *(najnižja vloga: EDITOR)*
- **FR-013-20**: Sistem MORA urejevalcu v obrazcu kontakta ob obstoječem atributu `Država`, `Podjetje`, `Country` ali `Company` ponuditi ročen prenos vrednosti v ustrezno polje: vrednost države se prepozna po FR-013-19 (ena država: predizpolnjeno; dvoumno ali neprepoznano: uporabnik izbere državo s seznama, sicer prenos ni mogoč); če ciljno polje že ima drugačno vrednost, uporabnik izbere, katera ostane; prenos je samo sprememba obrazca, dokler uporabnik ne shrani, nato je navadno urejanje s svojim vnosom v sledi (FR-005-01). Množičnega ali samodejnega prenosa ni. *(najnižja vloga: EDITOR)*

### Key Entities *(include if feature involves data)*

- **Kontakt (razširitev 004)**: dobi polji *Podjetje* (besedilo) in *Država* (koda ISO 3166-1 alpha-2); vse ostalo (ključ razvrščanja, verzija, atributi, značke) nespremenjeno.
- **Seznam držav**: uradne kode ISO 3166-1 alpha-2 z imeni v slovenščini in angleščini; vir imen je ena, zgrajena iz standardnih podatkov o jezikih, brez ročnega vzdrževanja.
- **Predlog**: izpeljan iz obstoječih kontaktov skupine, ni shranjena entiteta: besedilo (ključ, vrednost, podjetje ali značka), število uporab in kanonična oblika zapisa.
- **Kanonična oblika ključa ali značke**: zapis, ki ga skupina za dani normaliziran ključ uporablja najpogosteje (pri enakem številu: zapis najstarejšega kontakta).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uporabnik doda atribut s ključem, ki ga skupina že uporablja, z največ tremi aktivacijami tipkovnice ali dotiki (fokus, izbira predloga, vnos vrednosti), brez tipkanja ključa.
- **SC-002**: V 100 % preizkusov dodajanja ključa ali značke prek vmesnika ali API, ki se razlikuje od obstoječega le po velikosti črk, v skupini ne nastane nova različica; noben obstoječi zapis se zaradi tega ne spremeni.
- **SC-003**: Predlogi se prikažejo v manj kot 300 ms (95. percentil) v skupini z 10.000 kontakti.
- **SC-004**: 100 % obstoječih testov 004–012 deluje brez razlike v vedenju (spremenjeni testi, npr. glave izvoza, so našteti v opisu PR); kontakti brez novih polj in kontakti z atributi `Država` ali `Podjetje` se odprejo in shranijo.
- **SC-005**: 100 % primerov matrike izolacije za nove končne točke vrne pričakovan odgovor; zasloni s predlogi nimajo kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px.
- **SC-006**: Iskanje po »avstrija«, »austria« in »at« najde enake kontakte z državo `AT`, ne glede na jezik vmesnika; prepoznavanje države iz besedila (FR-013-19) na naboru 30 preizkusnih besedil (veljavna, dvoumna, neprepoznana) nikoli ne vrne napačne ene kode.

## Assumptions

- Odvisnost od **004-kontakti** (polja, atributi, značke, pravilo rezerviranih ključev), **005-revizijska-sled** (posnetki in razlike), **008-iskanje**, **009-mnozicno-urejanje**, **010-izvoz-excel**, **011-dvojniki** in **006/007** (vloge); komponenta kombiniranega polja za značke (004) se razširi in uporabi za ključe, vrednosti in podjetje.
- Predlogi so izpeljani iz obstoječih podatkov skupine; nova tabela predlogov ali kataloga ključev ni potrebna. Vnaprej določen seznam ključev za prazno skupino ni del te funkcionalnosti.
- Seznam kontaktov ne dobi novih stolpcev, razvrščanje po podjetju ali državi ni del te funkcionalnosti.
- Uvoz (014) uporabi polji *Podjetje* in *Država* kot ciljna polja preslikave in prepoznavanje države iz FR-013-19; uporabniški tok za dvoumne vrednosti pri uvozu je del 014.
- Preoblikovanje obstoječih različic ključev v skupini (orodje »poenoti ključe«) in masovni prenos starih atributov v nova polja nista del te funkcionalnosti.
- Izvoz prikazuje ime države, ne kodo; pri ponovnem uvozu (014) ga prepozna FR-013-19.
- Vsa besedila v sl/en po feature-map §2.9; omejitve podatkov (feature-map §2.6) se dopolnijo v istem PR: *Podjetje* do 200 znakov, *Država* koda ISO 3166-1 alpha-2, nova rezervirana imena, kanonični zapis.
