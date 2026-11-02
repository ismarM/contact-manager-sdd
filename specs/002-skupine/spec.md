# Feature Specification: Skupine kontaktov

**Feature Branch**: `skupine` (no number; the directory is `specs/002-skupine/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Ustvarjanje skupine kontaktov (naslov, opis, barva; ustvarjalec postane lastnik), prikaz vseh skupin, katerih član je uporabnik, ločeno po vlogah, glava in zavihki skupine ter ogled in urejanje podatkov skupine (lastnik in admin)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ustvarjanje skupine (Priority: P1)

Prijavljen uporabnik ustvari novo skupino kontaktov: vpiše naslov, po želji opis in izbere eno od osmih barv. Postane njen lastnik in edini član, nova skupina pa se takoj odpre.

**Why this priority**: brez skupine ni mogoče narediti ničesar drugega (kontakti, člani, povabila); to je prvi korak vsakega uporabnika.

**Independent Test**: prijavljen uporabnik brez skupin odpre dialog *Nova skupina*, ustvari skupino in vidi njeno glavo z oznako vloge »Lastnik«.

**Acceptance Scenarios**:

1. **[FR-002-01]** **Given** prijavljen uporabnik na zaslonu *Skupine* (ali s stranskim pasom pri ≥ 1024 px), **When** izbere *Nova skupina*, **Then** se odpre dialog s polji *Naslov* (obvezno), *Opis* in *Barva* (8 poimenovanih vzorcev, izbrana *tinta*) ter gumboma *Prekliči* in *Ustvari skupino*.
2. **[FR-002-01]** **Given** odprt dialog *Nova skupina*, **When** uporabnik vpiše naslov »Projekt FERI«, opis in izbere barvo *mah* ter izbere *Ustvari skupino*, **Then** se skupina ustvari z vpisanimi podatki.
3. **[FR-002-02]** **Given** odprt dialog *Nova skupina*, **When** uporabnik pusti *Naslov* prazen (ali samo presledke) in izbere *Ustvari skupino*, **Then** se skupina ne ustvari, dialog ostane odprt z vnesenimi podatki in ob polju *Naslov* je razumljiva napaka.
4. **[FR-002-02]** **Given** odprt dialog, **When** uporabnik vpiše naslov s 101 znakom (po obrezu presledkov) ali opis s 1001 znakom, **Then** se skupina ne ustvari in ob ustreznem polju je napaka; naslov s 100 znaki in opis s 1000 znaki sta sprejeta.
5. **[FR-002-02]** **Given** zahtevek za ustvarjanje skupine z barvo, ki ni med osmimi poimenovanimi, **When** ga strežnik prejme, **Then** vrne `400 VALIDATION_FAILED` z napako za polje barve in skupina se ne ustvari.
6. **[FR-002-03]** **Given** uporabnik je uspešno ustvaril skupino, **When** ustvarjanje uspe, **Then** je uporabnik edini član skupine z vlogo `OWNER`, nova skupina se odpre in prikaže se obvestilo o uspehu.
7. **[FR-002-03]** **Given** uporabnik v dialogu ne izbere barve, **When** ustvari skupino, **Then** ima skupina barvo *tinta*.
8. **[FR-002-13]** **Given** odprt dialog *Nova skupina*, **When** strežnik zahtevo zavrne ali ni dosegljiv, **Then** dialog ostane odprt z vnesenimi podatki in nad obrazcem je sporočilo o napaki (design.md 8.13) brez tehničnih kod.

---

### User Story 2 - Pregled mojih skupin po vlogah (Priority: P1)

Uporabnik vidi vse nearhivirane skupine, katerih član je, razvrščene v razdelke po svoji vlogi (*Lastnik*, *Admin*, *Urednik*, *Bralec*), na zaslonu *Skupine* in v stranskem pasu, ter iz seznama odpre skupino.

**Why this priority**: seznam skupin je vstopna točka aplikacije; brez njega uporabnik ne pride do skupin, v katere je povabljen.

**Independent Test**: uporabnik, ki je lastnik ene, admin druge in bralec tretje skupine, na zaslonu *Skupine* vidi tri razdelke s pravimi skupinami in števili; razdelka *Urednik* ni.

**Acceptance Scenarios**:

1. **[FR-002-04]** **Given** uporabnik je lastnik skupin A in B, admin skupine C in bralec skupine D, **When** odpre zaslon *Skupine*, **Then** vidi razdelke *Lastnik* (2), *Admin* (1) in *Bralec* (1) v tem vrstnem redu, vsak z naslovom ravni 2 in številom; razdelka *Urednik* ni.
2. **[FR-002-04]** **Given** zaslon *Skupine*, **When** se izriše vrstica skupine, **Then** vsebuje jeziček v barvi skupine, naslov, opis v eni skrajšani vrstici in število kontaktov skupine; vrstica je povezava, ki odpre skupino.
3. **[FR-002-04]** **Given** uporabnik je član arhivirane skupine E, **When** odpre zaslon *Skupine*, **Then** skupine E ni v nobenem razdelku po vlogah.
4. **[FR-002-04]** **Given** uporabnik je lastnik 30 nearhiviranih skupin, **When** odpre zaslon *Skupine*, **Then** razdelek *Lastnik* pokaže število 30, prvih 25 skupin po abecedi naslovov in paginacijo razdelka (design.md 8.9), s katero pride do preostalih 5.
5. **[FR-002-05]** **Given** uporabnik ni član nobene nearhivirane skupine, **When** odpre zaslon *Skupine*, **Then** vidi prazno stanje »Nimaš še nobene skupine.« z akcijo *Nova skupina* (design.md 8.15).
6. **[FR-002-06]** **Given** širina zaslona ≥ 1024 px, **When** je uporabnik kjerkoli v aplikaciji, **Then** stranski pas prikazuje iste razdelke po vlogah kot zaslon *Skupine* (brez praznih razdelkov), z največ 10 skupinami na razdelek, in trenutno odprta skupina je označena kot trenutna stran.
7. **[FR-002-06]** **Given** širina ≥ 1024 px in uporabnik je bralec 14 skupin, **When** si ogleda stranski pas, **Then** razdelek *Bralec* pokaže 10 skupin in povezavo *Vse skupine*, ki vodi na zaslon *Skupine*.
8. **[FR-002-06]** **Given** širina zaslona < 1024 px, **When** uporabnik izbere gumb za preklop skupine v zgornji vrstici, **Then** se odpre meni z istimi razdelki in omejitvami kot stranski pas, iz katerega odpre drugo skupino.

---

### User Story 3 - Glava in zavihki skupine (Priority: P1)

Ko uporabnik odpre skupino, vedno vidi, kje je: jeziček, naslov skupine, svojo vlogo, morebitno oznako *Arhivirano* in navigacijo do razdelkov skupine.

**Why this priority**: glava je skupni okvir vseh zaslonov skupine, na katerega se naslanjajo funkcionalnosti 003–011.

**Independent Test**: urednik odpre skupino in vidi njen naslov, oznako »Urednik« in navigacijo z zavihkom *Nastavitve*; nečlan z isto povezavo vidi stran »Te strani ni«.

**Acceptance Scenarios**:

1. **[FR-002-07]** **Given** uporabnik je urednik skupine »Projekt FERI«, **When** jo odpre, **Then** glava prikazuje jeziček v barvi skupine, naslov »Projekt FERI«, oznako vloge »Urednik« in navigacijo skupine (z dostopnim imenom) s povezavo *Nastavitve*; trenutni razdelek je označen kot trenutna stran.
2. **[FR-002-07]** **Given** uporabnik je član arhivirane skupine, **When** jo odpre, **Then** glava poleg oznake vloge prikazuje oznako *Arhivirano* (design.md 8.5).
3. **[FR-002-07]** **Given** uporabnik je član skupine z vlogo bralec, **When** jo odpre, **Then** vidi samo povezave razdelkov, ki so dovoljeni njegovi vlogi (*Nastavitve* vidijo vsi člani).
4. **[FR-002-08]** **Given** prijavljen uporabnik ni član skupine X, **When** odpre povezavo do skupine X ali katerega koli njenega razdelka, **Then** strežnik vrne `404` in vmesnik prikaže stran »Te strani ni« (001, design.md 9.10), brez naslova ali drugih podatkov skupine X.
5. **[FR-002-08]** **Given** prijavljen uporabnik, **When** odpre povezavo do skupine, ki ne obstaja (ali je bila izbrisana), **Then** vidi enako stran »Te strani ni« kot pri tuji skupini.
6. **[FR-002-09]** **Given** uporabnik je v skupini »Projekt FERI« na razdelku *Nastavitve*, **When** se stran naloži, **Then** je naslov strani »Nastavitve – Projekt FERI – Kontakti«; na zaslonu *Skupine* je naslov strani »Skupine – Kontakti«.

---

### User Story 4 - Ogled in urejanje podatkov skupine (Priority: P2)

Vsi člani v *Nastavitve → Podatki skupine* vidijo naslov, opis in barvo skupine. Lastnik in admin jih lahko spremenita; sočasna sprememba se ne prepiše tiho.

**Why this priority**: urejanje skupine je izrecna zahteva, a ni pogoj za osnovno delo s skupino.

**Independent Test**: admin spremeni naslov skupine in nov naslov vidi v glavi in stranskem pasu; bralec v istem razdelku vidi podatke brez obrazca.

**Acceptance Scenarios**:

1. **[FR-002-10]** **Given** uporabnik je bralec skupine, **When** odpre *Nastavitve → Podatki skupine*, **Then** vidi naslov, opis in ime barve skupine (npr. »Barva: mah«), brez obrazca in brez gumba *Shrani spremembe*.
2. **[FR-002-11]** **Given** uporabnik je admin nearhivirane skupine, **When** odpre *Podatki skupine*, spremeni naslov in barvo ter izbere *Shrani spremembe*, **Then** se spremembe shranijo, prikaže se obvestilo o uspehu, glava skupine, stranski pas in naslov strani pa prikažejo nov naslov in barvo.
3. **[FR-002-11]** **Given** uporabnik je lastnik skupine, **When** pobriše opis in shrani, **Then** skupina nima opisa.
4. **[FR-002-02]** **Given** admin ureja podatke skupine, **When** pusti naslov prazen in shrani, **Then** se nič ne spremeni in ob polju *Naslov* je napaka.
5. **[FR-002-12]** **Given** admin A in lastnik B sta odprla *Podatki skupine* pri isti verziji in je B shranil nov naslov, **When** A shrani svoje spremembe, **Then** strežnik vrne `409 VERSION_CONFLICT`, nič se ne prepiše, obrazec A ostane odprt z njegovimi vnosi in nad njim je opozorilo, kdo in kdaj je skupino medtem spremenil, z možnostmi *Prikaži razlike*, *Uporabi trenutno različico* in *Shrani moje spremembe* (design.md 8.14).
6. **[FR-002-12]** **Given** opozorilo o konfliktu verzij, **When** A izbere *Shrani moje spremembe*, **Then** se njegove vrednosti shranijo nad trenutno verzijo; **When** namesto tega izbere *Uporabi trenutno različico*, **Then** obrazec prikaže trenutne podatke in njegove spremembe so zavržene.
7. **[FR-002-11]** **Given** uporabnik je urednik skupine, **When** odpre *Podatki skupine*, **Then** obrazca ni; če vseeno pošlje zahtevek za spremembo, strežnik vrne `403` in nič se ne spremeni.
8. **[FR-002-13]** **Given** admin shranjuje podatke skupine, **When** strežnik zahtevo zavrne (npr. skupina je bila medtem arhivirana), **Then** obrazec ostane odprt z vnosi in nad njim je razumljivo sporočilo o napaki v jeziku vmesnika (design.md 8.13).

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-002-01, FR-002-03 | neprijavljen (ni žetona, neveljaven ali potekel žeton) | ustvari skupino | 401, skupina se ne ustvari |
| FR-002-02 | prijavljen uporabnik | ustvari skupino s praznim naslovom, naslovom > 100 znakov, opisom > 1000 znakov ali neznano barvo | 400 VALIDATION_FAILED z napakami po poljih, skupina se ne ustvari |
| FR-002-04, FR-002-05, FR-002-06 | neprijavljen | pridobi seznam mojih skupin | 401 |
| FR-002-04, FR-002-06 | prijavljen uporabnik | pridobi seznam mojih skupin | seznam vsebuje samo skupine, katerih član je; tuje in arhivirane skupine niso vključene |
| FR-002-07, FR-002-08, FR-002-10 | neprijavljen | pridobi glavo / podatke skupine | 401 |
| FR-002-07, FR-002-08, FR-002-10 | prijavljen nečlan | pridobi glavo / podatke skupine | 404, obstoj skupine se ne razkrije; vmesnik pokaže »Te strani ni« |
| FR-002-08 | prijavljen uporabnik | pridobi skupino, ki ne obstaja | 404, enak odgovor kot za tujo skupino |
| FR-002-07, FR-002-10 | član arhivirane skupine (katerakoli vloga) | pridobi glavo / podatke skupine | 200 (branje je dovoljeno) |
| FR-002-11 | neprijavljen | spremeni podatke skupine | 401, nič se ne spremeni |
| FR-002-11 | prijavljen nečlan | spremeni podatke skupine | 404, nič se ne spremeni, obstoj se ne razkrije |
| FR-002-11 | član z vlogo VIEWER | spremeni podatke skupine | 403, nič se ne spremeni |
| FR-002-11 | član z vlogo EDITOR | spremeni podatke skupine | 403, nič se ne spremeni |
| FR-002-11 | ADMIN ali OWNER arhivirane skupine | spremeni podatke skupine | 409 GROUP_ARCHIVED, nič se ne spremeni (pravilo 003) |
| FR-002-11 | VIEWER ali EDITOR arhivirane skupine | spremeni podatke skupine | 403 (vloga se preveri pred stanjem, feature-map §2.2) |
| FR-002-12 | ADMIN ali OWNER z zastarelo verzijo | spremeni podatke skupine | 409 VERSION_CONFLICT, nič se ne prepiše |
| FR-002-02, FR-002-11 | ADMIN ali OWNER | spremeni podatke skupine z neveljavnim naslovom, opisom ali barvo | 400 VALIDATION_FAILED z napakami po poljih, nič se ne spremeni |

### Edge Cases

- Naslov z vodilnimi in končnimi presledki se shrani obrezan; naslov iz samih presledkov je prazen in zavrnjen.
- Več skupin ima lahko enak naslov; naslov ni edinstven (ločujeta jih jeziček in razdelek po vlogi).
- Uporabnik izgubi članstvo (odstranitev, zapuščanje – 007) ali skupina je izbrisana (003), medtem ko je skupina odprta: naslednji zahtevek vrne 404 in vmesnik prikaže »Te strani ni«; seznam skupin in stranski pas se ob naslednjem nalaganju posodobita.
- Vloga uporabnika se spremeni, medtem ko ima odprto skupino: oznaka vloge in dovoljene povezave v glavi ob naslednjem nalaganju skupine odražata novo vlogo; zahtevek z nekdanjo vlogo zavrne strežnik (403).
- Skupina je arhivirana, medtem ko admin ureja njene podatke: shranjevanje vrne `409 GROUP_ARCHIVED`, prikaže se razumljivo sporočilo (FR-002-13), obrazec izgine ob ponovnem nalaganju (003).
- Konflikt verzij, pri katerem je skupino medtem spremenil izbrisan uporabnik: v opozorilu je kot izvajalec prikazan »izbrisan uporabnik« (feature-map §2.5).
- Dolg naslov ali opis se v vrstici seznama in v stranskem pasu skrajša, celoten pa je dostopen (npr. na glavi skupine in v *Podatkih skupine*); pri 320 px in povečavi 400 % ni vodoravnega drsenja strani.
- Shranjevanje nespremenjenih podatkov je dovoljeno in uspe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-002-01**: Sistem MORA prijavljenemu uporabniku omogočiti ustvarjanje skupine prek dialoga *Nova skupina* (dosegljiv z zaslona *Skupine* in iz stranskega pasu) s polji *Naslov* (obvezno), *Opis* (neobvezno) in *Barva* (izbirni gumbi osmih poimenovanih barv, design.md 4.2 in 9.2), s *Prekliči* in *Ustvari skupino*. *(najnižja vloga: —)*
- **FR-002-02**: Sistem MORA pri ustvarjanju in urejanju skupine preveriti podatke po skupnem slovarju (feature-map §2.6): naslov 1–100 znakov po obrezu presledkov, opis do 1000 znakov, barva ena od *tinta, mah, opeka, oker, sliva, morje, grafit, rja*; neveljavne podatke zavrne z `400 VALIDATION_FAILED` in napakami po poljih, vmesnik pa napako prikaže ob ustreznem polju in ohrani vnesene podatke. *(najnižja vloga: — pri ustvarjanju, ADMIN pri urejanju)*
- **FR-002-03**: Sistem MORA ustvarjalca skupine nastaviti kot njenega edinega člana z vlogo `OWNER`, skupini brez izbrane barve dodeliti barvo *tinta*, po uspehu prikazati obvestilo o uspehu in odpreti novo skupino. *(najnižja vloga: —)*
- **FR-002-04**: Sistem MORA na zaslonu *Skupine* prikazati vse **nearhivirane** skupine, katerih član je uporabnik, v razdelkih po njegovi vlogi v vrstnem redu *Lastnik*, *Admin*, *Urednik*, *Bralec*; razdelek brez skupin se ne izriše; vsak razdelek ima naslov ravni 2 in skupno število skupin; vrstica skupine vsebuje jeziček, naslov, skrajšan opis in število kontaktov ter odpre skupino; skupine so v razdelku urejene po naslovu abecedno (po pravilih jezika vmesnika), vsak razdelek je paginiran ločeno (privzeto 25, izbira 25/50/100, design.md 8.9). *(najnižja vloga: —)*
- **FR-002-05**: Sistem MORA uporabniku, ki ni član nobene nearhivirane skupine, na zaslonu *Skupine* prikazati prazno stanje »Nimaš še nobene skupine.« z akcijo *Nova skupina* (design.md 8.15). *(najnižja vloga: —)*
- **FR-002-06**: Sistem MORA pri širini ≥ 1024 px v stranskem pasu (design.md 7.1), pri širini < 1024 px pa v meniju gumba za preklop skupine v zgornji vrstici, prikazati iste razdelke po vlogah kot FR-002-04, z največ 10 skupinami na razdelek (po naslovu) in povezavo *Vse skupine* na zaslon *Skupine*, kadar ima razdelek več skupin; trenutno odprta skupina je označena kot trenutna stran. *(najnižja vloga: —)*
- **FR-002-07**: Sistem MORA na vseh zaslonih skupine prikazati glavo skupine (design.md 7.1): jeziček v barvi skupine, naslov, oznako vloge uporabnika (*Lastnik*, *Admin*, *Urednik*, *Bralec*), oznako *Arhivirano*, kadar je skupina arhivirana, in navigacijo med razdelki skupine (povezave, ne ARIA zavihki), v kateri je trenutni razdelek označen in so prikazani samo razdelki, dovoljeni vlogi in stanju skupine; razdelek *Nastavitve* vidijo vsi člani; druge razdelke dodajajo poznejše funkcionalnosti (004, 005, 011). *(najnižja vloga: VIEWER)*
- **FR-002-08**: Sistem MORA za skupino, ki ne obstaja, ali skupino, katere uporabnik ni član, na vseh poteh skupine vrniti `404` brez razkritja obstoja ali podatkov skupine, vmesnik pa prikazati stran »Te strani ni« (001, design.md 9.10). *(najnižja vloga: VIEWER)*
- **FR-002-09**: Sistem MORA zaslonom skupine nastaviti naslov strani »‹Zaslon› – ‹naslov skupine› – Kontakti« (npr. »Nastavitve – Projekt FERI – Kontakti«), zaslonu *Skupine* pa »Skupine – Kontakti«, v jeziku vmesnika. *(najnižja vloga: VIEWER)*
- **FR-002-10**: Sistem MORA vsem članom skupine v razdelku *Nastavitve → Podatki skupine* (design.md 9.7, točka 1) prikazati naslov, opis in barvo skupine (z imenom barve, ne samo vzorcem). *(najnižja vloga: VIEWER)*
- **FR-002-11**: Sistem MORA lastniku in adminu nearhivirane skupine v *Podatkih skupine* omogočiti spremembo naslova, opisa in barve z obrazcem in gumbom *Shrani spremembe*; po uspehu prikazati obvestilo o uspehu in nove podatke takoj prikazati v glavi, stranskem pasu, seznamu skupin in naslovu strani; članom z nižjo vlogo in vsem v arhivirani skupini obrazca ne izrisati (strežnik takšno spremembo zavrne po feature-map §2.2). *(najnižja vloga: ADMIN)*
- **FR-002-12**: Sistem MORA podatkom skupine voditi verzijo: sprememba pošlje verzijo, ki jo je uporabnik videl; ob neujemanju se nič ne spremeni (`409 VERSION_CONFLICT`), vmesnik pa ohrani obrazec z vnosi in ponudi razrešitev po design.md 8.14 (kdo in kdaj je spremenil, *Prikaži razlike*, *Uporabi trenutno različico*, *Shrani moje spremembe*). *(najnižja vloga: ADMIN)*
- **FR-002-13**: Sistem MORA pri ustvarjanju in urejanju skupine vsak neuspeh prikazati kot razumljivo sporočilo v slovenščini ali angleščini na mestu akcije (design.md 8.13), brez tehničnih kod, in ohraniti vnesene podatke. *(najnižja vloga: —)*

### Key Entities *(include if feature involves data)*

- **Skupina**: najemnik, ki združuje kontakte in člane. Atributi: naslov, opis, barva (eno od 8 imen), stanje arhiviranosti (vodi ga 003), verzija podatkov, čas in izvajalec zadnje spremembe podatkov.
- **Članstvo**: povezava uporabnika in skupine z vlogo `VIEWER | EDITOR | ADMIN | OWNER`; skupina ima natanko enega člana `OWNER` (izjema trajno arhivirana skupina, 003). Ta funkcionalnost ustvari prvo članstvo (lastnik); druga članstva nastanejo s povabili (006) in se upravljajo v 007.
- **Povzetek skupine (za sezname)**: naslov, skrajšan opis, barva, vloga uporabnika, število kontaktov (kontakte vodi 004).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nov uporabnik ustvari prvo skupino v manj kot 1 minuti od odprtja zaslona *Skupine*.
- **SC-002**: Pri uporabniku s 100 skupinami se zaslon *Skupine* prikaže v manj kot 2 sekundah in nikoli ne prikaže več kot 100 skupin na razdelek naenkrat.
- **SC-003**: V 100 % preizkusov izolacije nečlan ne izve ničesar o tuji skupini (enak odgovor kot za neobstoječo skupino).
- **SC-004**: V 100 % sočasnih sprememb podatkov skupine se nobena sprememba ne prepiše tiho.
- **SC-005**: Uporabnik na vsakem zaslonu skupine v enem pogledu prepozna skupino, svojo vlogo in morebitno arhiviranost (preverjeno z ročnim preizkusom in bralnikom zaslona).
- **SC-006**: Vsi zasloni te funkcionalnosti so brez kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px, v slovenščini in angleščini.

## Assumptions

- Odvisnost od **001-prijava**: prijava, ogrodje aplikacije (zgornja vrstica, *Preskoči na vsebino*) in stran »Te strani ni«; 002 doda stranski pas in gumb za preklop skupine.
- **Omejitev seznamov (konstitucija V)**: zaslon *Skupine* je paginiran po razdelkih (privzeto 25 na stran, 25/50/100, največ 100); stranski pas in meni preklopa skupine pokažeta največ 10 skupin na razdelek in povezavo *Vse skupine*. Razvrščanje vedno po naslovu abecedno.
- **Število kontaktov** v vrstici skupine šteje kontakte skupine iz 004; dokler 004 ni implementirana, je 0.
- **Privzeti razdelek skupine**: odprtje skupine (tudi po ustvarjanju) prikaže prvi razdelek navigacije; od 004 naprej je to *Kontakti*, do takrat *Nastavitve*.
- **Navigacija skupine**: 002 vzpostavi glavo, navigacijo in razdelek *Nastavitve* s podrazdelkom *Podatki skupine*. *Kontakti* (004), *Revizijska sled* (005), *Dvojniki* (011; samo EDITOR in višje, v arhivirani skupini ga ni) ter razdelki *Člani* in *Povabi člana* (007, 006) in *Upravljanje skupine* (003, 007) v *Nastavitvah* dodajo poznejše funkcionalnosti.
- **Arhiviranost**: stanje arhivirane in trajno arhivirane skupine, pasico, seznam arhiviranih skupin in splošno pravilo `409 GROUP_ARCHIVED` določa **003-arhiviranje**; 002 v glavi le prikaže oznako *Arhivirano* in v seznamih po vlogah izpusti arhivirane skupine. Negativni scenarij urejanja v arhivirani skupini je naveden tukaj, pravilo pa pripada 003.
- **Konflikt verzij**: verzijo vodijo samo podatki skupine (naslov, opis, barva); za opozorilo se hrani izvajalec in čas zadnje spremembe; izbrisan izvajalec je prikazan kot »izbrisan uporabnik«.
- Spremembe podatkov skupine se **ne** beležijo v revizijski sledi (ta po konstituciji V in feature-map §2.7 beleži spremembe kontaktov).
- Število skupin, ki jih uporabnik lahko ustvari, ni omejeno; naslov skupine ni edinstven.
- Urejanje podatkov skupine ni nevarna operacija (feature-map §2.8), zato nima potrditvenega dialoga.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
