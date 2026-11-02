# Feature Specification: Revizijska sled skupine

**Feature Branch**: `revizijska-sled` (no number; the directory is `specs/005-revizijska-sled/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Verzioniranje sprememb kontaktov znotraj skupine – vsaka skupina ima svojo revizijsko sled, ki beleži vse (dodajanje, odstranjevanje, urejanje, združevanje, rollback); pregled revizijske sledi (bralec in višje); rollback na poljubno točko revizijske sledi (admin in lastnik), ki vrne stanje skupine na mesto, ki ga točka opisuje."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Beleženje sprememb kontaktov (Priority: P1)

Vsaka uspešna sprememba kontaktov skupine – ustvarjanje, urejanje in izbris iz 004, kasneje tudi množične spremembe (009) in združevanje (011) – ustvari natanko en nespremenljiv vnos v revizijski sledi te skupine, z izvajalcem, časom in vrednostmi prej in potem.

**Why this priority**: brez zanesljivega beleženja ni ne pregleda ne rollbacka; konstitucija V to zahteva za vsako spremembo kontaktov.

**Independent Test**: urednik ustvari, uredi in izbriše kontakt; preveri se, da so nastali natanko trije vnosi s pravilnimi podatki in da zavrnjene operacije ne pustijo vnosa.

**Acceptance Scenarios**:

1. **[FR-005-01]** **Given** urednik v nearhivirani skupini, **When** ustvari kontakt Janez Novak, ga nato uredi in nazadnje izbriše, **Then** so v revizijski sledi skupine natanko trije novi vnosi vrst *dodajanje*, *urejanje* in *odstranjevanje*, vsak z izvajalcem in časom.
2. **[FR-005-01]** **Given** urednik pošlje urejanje z zastarelo verzijo (`409 VERSION_CONFLICT`) ali neveljavne podatke (`400`), **When** je zahteva zavrnjena, **Then** v revizijski sledi ni novega vnosa; **When** shrani kontakt brez dejanske spremembe, **Then** prav tako ni vnosa.
3. **[FR-005-02]** **Given** urednik spremeni telefon kontakta, doda atribut `kompetenca` = »web dev« in odstrani značko `vip`, **When** si član ogleda podrobnosti vnosa, **Then** vidi za ta kontakt vrstice *Telefon* (prej/potem), *kompetenca* (prej prazno, potem »web dev«) in *Značke* (prej seznam z `vip`, potem brez nje), polja brez spremembe pa niso navedena.
4. **[FR-005-02]** **Given** vnos, ki ga je ustvaril uporabnik, ki je kasneje izbrisal račun, **When** član pregleduje sled, **Then** je kot izvajalec prikazan »izbrisan uporabnik«, vnos in njegove vrednosti pa so nespremenjeni.
5. **[FR-005-03]** **Given** operacija, ki naenkrat spremeni več kontaktov (npr. množično urejanje 12 kontaktov iz 009), **When** se uspešno izvede, **Then** nastane en sam vnos vrste *urejanje* z vsemi 12 kontakti in vrednostmi prej/potem za vsakega.
6. **[FR-005-04]** **Given** zapis vnosa v revizijsko sled ne uspe, **When** se izvaja sprememba kontakta, **Then** se tudi sprememba kontakta ne izvede (operacija in vnos uspeta skupaj ali se nič ne spremeni).
7. **[FR-005-05]** **Given** obstoječ vnos v sledi, **When** kateri koli član (tudi lastnik) poskusi vnos spremeniti ali izbrisati, **Then** taka operacija ne obstaja, zahteva je zavrnjena in vnos ostane nespremenjen; **When** je skupina izbrisana (003), **Then** se izbriše tudi njena sled.
8. **[FR-005-06]** **Given** član spremeni vlogo drugega člana ali uredi podatke skupine, **When** si kdo ogleda revizijsko sled, **Then** te spremembe v njej niso zabeležene.

---

### User Story 2 - Pregled revizijske sledi (Priority: P1)

Član skupine (bralec in višje) odpre zavihek *Revizijska sled* in vidi kronološki seznam sprememb, najnovejše zgoraj; lahko filtrira po vrsti dejanja in po kontaktu ter razkrije podrobnosti prej/potem.

**Why this priority**: preglednost sprememb je izrecna zahteva za vse člane in pogoj, da admin izbere pravo točko za rollback.

**Independent Test**: v skupini z vnaprej pripravljenimi vnosi (npr. 40) bralec preveri vrstni red, paginacijo, filtre, podrobnosti in povezavo iz pogleda kontakta.

**Acceptance Scenarios**:

1. **[FR-005-07]** **Given** skupina s 40 vnosi in član z vlogo bralec, **When** odpre zavihek *Revizijska sled*, **Then** vidi 25 najnovejših vnosov, najnovejši zgoraj, vsakega s časom v zapisu jezika vmesnika, izvajalcem in dejanjem kot stavkom (npr. »dodal(a) kontakt Janez Novak«), ter paginacijo z izbiro 25, 50 ali 100.
2. **[FR-005-07]** **Given** arhivirana skupina, **When** jo član odpre, **Then** je sled na voljo za branje enako kot v nearhivirani skupini.
3. **[FR-005-08]** **Given** vnos vrste *urejanje*, **When** član razkrije *Podrobnosti*, **Then** vidi preglednico *Polje · Prej · Potem* za vsak prizadeti kontakt; pri *dodajanju* je stolpec *Prej* prazen, pri *odstranjevanju* stolpec *Potem*.
4. **[FR-005-09]** **Given** sled z vnosi vseh vrst, **When** član izbere filter po vrsti dejanja *odstranjevanje*, **Then** vidi samo vnose te vrste; filter je v naslovu poti in ostane ob osvežitvi.
5. **[FR-005-09]** **Given** pogled kontakta Janez Novak (004), **When** član izbere povezavo »Spremembe tega kontakta v revizijski sledi«, **Then** se odpre sled, filtrirana po tem kontaktu, z vsemi vnosi, v katerih je kontakt med prizadetimi (tudi združevanje in rollback); filter po kontaktu deluje tudi za kontakt, ki je bil medtem izbrisan.
6. **[FR-005-10]** **Given** skupina brez vnosov, **When** član odpre sled, **Then** vidi »V revizijski sledi še ni vnosov.«; **Given** filtri brez zadetkov, **Then** vidi »Ni vnosov, ki ustrezajo filtrom.« in *Počisti filtre*.
7. **[FR-005-09]** **Given** filter po identifikatorju kontakta iz druge skupine, **When** član odpre sled, **Then** je seznam prazen enako kot za kontakt brez vnosov in podatki druge skupine niso razkriti.

---

### User Story 3 - Rollback na točko v sledi (Priority: P2)

Admin ali lastnik izbere vnos v sledi in povrne vse kontakte skupine v stanje takoj po tem vnosu. Spremembe po tej točki ostanejo zabeležene, rollback pa se zapiše kot nov vnos, ki ga je mogoče prav tako razveljaviti.

**Why this priority**: rollback je nadomestilo za razveljavitev (design.md 8.13) in zaščita pred napakami pri množičnih operacijah; je pa nevaren in redkejši od pregleda.

**Independent Test**: admin v skupini pripravi zaporedje dodajanja, urejanja in izbrisov, izvede rollback na vmesno točko in preveri stanje vseh kontaktov, nov vnos in razveljavitev rollbacka.

**Acceptance Scenarios**:

1. **[FR-005-11]** **Given** vnos T (dodan kontakt A), po njem pa: dodan kontakt B, urejen kontakt A, izbrisan kontakt C (ki je obstajal pred T), **When** admin izvede rollback na T, **Then** kontakt B ne obstaja več, kontakt A ima vrednosti takoj po T, kontakt C je obnovljen z istim identifikatorjem in prejšnjimi podatki, vsi ostali kontakti so nespremenjeni.
2. **[FR-005-11]** **Given** rollback, med katerim pride do napake, **When** se izvaja, **Then** se ne spremeni noben kontakt in ne nastane noben vnos (vse ali nič).
3. **[FR-005-12]** **Given** uspešen rollback na T, **When** član pregleduje sled, **Then** so vsi vnosi po T še vedno v sledi, na vrhu je nov vnos vrste *rollback* (»povrnil(a) skupino na stanje ‹čas T›«) s povezavo na vnos T in podrobnostmi prej/potem za vsak kontakt, ki ga je rollback spremenil.
4. **[FR-005-12]** **Given** vnos rollback R, **When** admin izvede rollback na vnos tik pred R, **Then** je stanje kontaktov enako kot pred R in nastane nov vnos vrste *rollback*.
5. **[FR-005-13]** **Given** urednik ima odprt obrazec za urejanje kontakta A, admin pa medtem izvede rollback, ki A spremeni, **When** urednik shrani, **Then** strežnik vrne `409 VERSION_CONFLICT` (pravilo 004) in rollback ni tiho prepisan; obnovljen kontakt dobi verzijo, višjo od katere koli prejšnje verzije tega kontakta.
6. **[FR-005-14]** **Given** admin je odprl sled, ko je bil najnovejši vnos N, drug član pa je medtem ustvaril nov vnos, **When** admin potrdi rollback na T, **Then** strežnik vrne `409 VERSION_CONFLICT`, nič se ne spremeni, vmesnik pokaže »Revizijska sled se je medtem spremenila.« in osveži seznam.
7. **[FR-005-15]** **Given** najnovejši vnos v sledi, **When** admin pošlje rollback nanj (ali na kateri koli vnos, pri katerem rollback ne bi spremenil nobenega kontakta), **Then** strežnik vrne `409 ROLLBACK_NO_CHANGES`, nič se ne spremeni in ne nastane vnos; gumb za rollback pri najnovejšem vnosu ni izrisan.
8. **[FR-005-16]** **Given** admin pri vnosu z dne 12. 10. 2026, 14.32 izbere »Povrni skupino na to točko«, **When** se odpre potrditveni dialog, **Then** naslov je »Povrnem skupino na stanje 12. 10. 2026, 14.32?«, besedilo pove posledico iz design.md 9.6, fokus je na *Prekliči*; **When** potrdi z *Povrni skupino*, **Then** se prikaže obvestilo »Skupina je povrnjena na stanje 12. 10. 2026, 14.32.«; **When** izbere *Prekliči* ali *Esc*, **Then** se nič ne zgodi.
9. **[FR-005-17]** **Given** urednik ali bralec nearhivirane skupine ali kateri koli član arhivirane skupine, **When** odpre sled, **Then** gumb »Povrni skupino na to točko« ni izrisan pri nobenem vnosu.
10. **[FR-005-18]** **Given** rollback ne uspe (npr. strežnik ni dosegljiv), **When** admin potrdi dialog, **Then** je napaka vidna kot trajno sporočilo nad sledjo z gumbom *Poskusi znova*, brez tehničnih kod.

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-005-07, FR-005-08, FR-005-09, FR-005-10 | unauthenticated (no/invalid/expired token) | ogled revizijske sledi ali podrobnosti vnosa | 401, podatki niso vrnjeni |
| FR-005-07, FR-005-08, FR-005-09, FR-005-10 | authenticated non-member | ogled revizijske sledi ali podrobnosti vnosa | 404, obstoj skupine ni razkrit; vmesnik pokaže »Te strani ni« |
| FR-005-08 | član skupine A (katera koli vloga) | zahteva podrobnosti vnosa skupine B prek skupine A | 404, enako kot za neobstoječ vnos |
| FR-005-07, FR-005-09 | member (VIEWER+) | velikost strani, ki ni 25, 50 ali 100, ali neznana vrsta dejanja v filtru | 400 VALIDATION_FAILED |
| FR-005-07 | member of an archived group (VIEWER+) | ogled revizijske sledi | 200 – branje je dovoljeno |
| FR-005-05 | member with any role (VIEWER … OWNER) | sprememba ali izbris vnosa | zavrnjeno (operacija ne obstaja), vnos ostane nespremenjen |
| FR-005-01, FR-005-04 | EDITOR+ | operacija nad kontakti, ki je zavrnjena (401, 403, 404, 409, 400) | v sledi ne nastane vnos |
| FR-005-11 | unauthenticated (no/invalid/expired token) | rollback | 401, nič se ne spremeni |
| FR-005-11 | authenticated non-member | rollback | 404, obstoj ni razkrit, nič se ne spremeni |
| FR-005-11 | member with role VIEWER or EDITOR | rollback | 403, nič se ne spremeni |
| FR-005-11 | member of an archived group with role ADMIN or OWNER | rollback | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-005-11 | member of an archived group with role VIEWER or EDITOR | rollback | 403, nič se ne spremeni |
| FR-005-11 | ADMIN+ | rollback na vnos druge skupine ali na neobstoječ vnos | 404, nič se ne spremeni |
| FR-005-14 | ADMIN+ z zastarelim najnovejšim vnosom | rollback | 409 VERSION_CONFLICT, nič se ne spremeni |
| FR-005-13 | EDITOR+ z verzijo kontakta izpred rollbacka | uredi ali izbriše kontakt | 409 VERSION_CONFLICT (004), nič se ne spremeni |
| FR-005-15 | ADMIN+ | rollback na najnovejši vnos ali brez učinka | 409 ROLLBACK_NO_CHANGES, nič se ne spremeni, ne nastane vnos |

### Edge Cases

- Rollback na točko pred ustvarjanjem vseh kontaktov (prvi vnos *dodajanje*): ostane samo kontakt iz tega vnosa, vsi kasneje ustvarjeni so odstranjeni.
- Rollback na točko, po kateri je bil kontakt večkrat urejen in nato izbrisan: kontakt je obnovljen s stanjem takoj po točki, ne z zadnjim stanjem pred izbrisom.
- Rollback na vnos, ki je sam *rollback*: stanje je enako stanju takoj po tem rollbacku.
- Rollback na vnos *združevanje* (011): združeni kontakt ima stanje takoj po združitvi, odstranjeni kontakti iz združitve ostanejo odstranjeni; rollback na vnos pred združitvijo jih obnovi.
- Rollback, ki spremeni veliko kontaktov (npr. 1.000): je en vnos z vsemi prizadetimi kontakti; podrobnosti se prikažejo po kontaktih, preglednica pa ostane berljiva (prikazani so le spremenjeni atributi).
- Vnos, katerega izvajalec je izbrisal račun, je še vedno lahko točka rollbacka; rollback izvajalca ne spremeni.
- Kontakt je v vnosu imenovan s prikaznim imenom ob času vnosa; poznejše preimenovanje ali izbris kontakta ne spremeni starih vnosov.
- Dva admina hkrati potrdita rollback: uspe samo prvi; drugi dobi `409 VERSION_CONFLICT`, ker se je sled medtem spremenila.
- Vnos s spremembo dodatnega atributa, katerega ključ je spremenil samo velikost črk: prikazan kot odstranitev starega in dodajanje novega ključa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-005-01**: Sistem MORA za vsako uspešno operacijo nad kontakti skupine (ustvarjanje, urejanje in izbris iz 004; množične spremembe 009; združevanje 011; rollback) ustvariti natanko en vnos v revizijski sledi te skupine; zavrnjena operacija in shranjevanje brez dejanske spremembe ne ustvarita vnosa. *(najnižja vloga: EDITOR – vloga operacije, ki se beleži)*
- **FR-005-02**: Sistem MORA v vnos zapisati čas (strežniški), izvajalca, vrsto dejanja, seznam prizadetih kontaktov (identifikator in prikazno ime ob času vnosa) in za vsak prizadeti kontakt vrednosti prej in potem za vsako spremenjeno polje – predefinirane atribute, dodatne atribute (po ključu) in značke (seznam prej in potem). Izvajalec, ki je izbrisal račun, je povsod prikazan kot »izbrisan uporabnik« (feature-map §2.5). *(najnižja vloga: EDITOR)*
- **FR-005-03**: Sistem MORA uporabljati vrste dejanj *dodajanje*, *urejanje*, *odstranjevanje*, *združevanje* in *rollback*; operacija, ki naenkrat spremeni več kontaktov, je en vnos: množično urejanje je *urejanje*, množični izbris *odstranjevanje*, oba z vsemi prizadetimi kontakti. *(najnižja vloga: EDITOR)*
- **FR-005-04**: Sistem MORA vnos zapisati atomarno skupaj z operacijo, ki ga povzroči (če vnosa ni mogoče zapisati, se operacija ne izvede). To je **pogodba beleženja**, ki jo morajo uporabiti 009 in 011: vsaka operacija poda vrsto dejanja, izvajalca in za vsak prizadeti kontakt celotno stanje prej (prazno pri dodajanju) in potem (prazno pri odstranjevanju); združevanje (011) je en vnos *združevanje*, v katerem je ohranjeni kontakt naveden s stanjem prej in potem, odstranjeni kontakti pa s stanjem prej in praznim stanjem potem. *(najnižja vloga: EDITOR)*
- **FR-005-05**: Sistem MORA vnose hraniti nespremenljive: noben član (tudi lastnik) jih ne more spremeniti ali izbrisati; hranijo se, dokler obstaja skupina, in se izbrišejo samo skupaj s skupino (003). *(najnižja vloga: —, nihče)*
- **FR-005-06**: Sistem MORA v revizijsko sled beležiti samo spremembe kontaktov; spremembe članstev, vlog, povabil in podatkov skupine se v njej ne beležijo. *(najnižja vloga: —)*
- **FR-005-07**: Sistem MORA prikazati revizijsko sled skupine kot kronološki seznam, najnovejši vnos zgoraj (design.md 9.6), paginiran po skupnem slovarju (25 privzeto, 50, 100); vnos pokaže čas v zapisu izbranega jezika, izvajalca (ali »izbrisan uporabnik«) in dejanje kot stavek (npr. »dodal(a) kontakt Janez Novak«, »uredil(a) 12 kontaktov«, »združil(a) 2 kontakta«, »povrnil(a) skupino na stanje ‹čas›«); sled se lahko bere tudi v arhivirani skupini. *(najnižja vloga: VIEWER)*
- **FR-005-08**: Sistem MORA ob razkritju *Podrobnosti* vnosa prikazati za vsak prizadeti kontakt preglednico *Polje · Prej · Potem* s spremenjenimi polji (pri dodajanju vsa izpolnjena polja s praznim *Prej*, pri odstranjevanju s praznim *Potem*). *(najnižja vloga: VIEWER)*
- **FR-005-09**: Sistem MORA omogočiti filtriranje sledi po vrsti dejanja (ena ali več vrst) in po kontaktu (vnosi, v katerih je kontakt med prizadetimi, tudi za izbrisan kontakt); filtri in stran so v naslovu poti; pogled kontakta (004) vsebuje povezavo »Spremembe tega kontakta v revizijski sledi«, ki odpre sled, filtrirano po tem kontaktu; filter po kontaktu, ki ne pripada skupini, vrne prazen seznam. *(najnižja vloga: VIEWER)*
- **FR-005-10**: Sistem MORA prikazati prazno stanje (design.md 8.15): »V revizijski sledi še ni vnosov.« za sled brez vnosov in »Ni vnosov, ki ustrezajo filtrom.« s *Počisti filtre* za filtre brez zadetkov. *(najnižja vloga: VIEWER)*
- **FR-005-11**: Sistem MORA omogočiti rollback na kateri koli vnos T sledi skupine, ki atomarno vrne **vse** kontakte skupine v stanje takoj po uveljavitvi T: kontakti, ustvarjeni po T, se odstranijo; kontakti, izbrisani po T, se obnovijo z istim identifikatorjem in podatki takoj po T; urejeni kontakti dobijo vrednosti takoj po T; kontakti, ki jih po T ni spremenila nobena operacija, ostanejo nespremenjeni. Ob kateri koli napaki se nič ne spremeni. *(najnižja vloga: ADMIN)*
- **FR-005-12**: Sistem MORA uspešen rollback zapisati kot nov vnos vrste *rollback*, ki se sklicuje na ciljni vnos T (čas in povezava na vnos) in vsebuje vrednosti prej/potem za vsak kontakt, ki ga je rollback spremenil; vnosi po T ostanejo v sledi; vnos *rollback* je lahko cilj nadaljnjega rollbacka, zato ga je mogoče razveljaviti z rollbackom na vnos tik pred njim. *(najnižja vloga: ADMIN)*
- **FR-005-13**: Sistem MORA vsakemu kontaktu, ki ga rollback spremeni ali obnovi, dodeliti novo verzijo, višjo od katere koli prejšnje verzije tega kontakta, tako da se poznejše urejanje ali izbris z verzijo izpred rollbacka zavrne z `409 VERSION_CONFLICT` (FR-004-11, FR-004-12). *(najnižja vloga: ADMIN)*
- **FR-005-14**: Sistem MORA zahtevo za rollback opremiti z najnovejšim vnosom sledi, ki ga je uporabnik videl; če je v sledi medtem nastal novejši vnos, se rollback zavrne z `409 VERSION_CONFLICT`, nič se ne spremeni, vmesnik pa pokaže »Revizijska sled se je medtem spremenila.« in osveži seznam. *(najnižja vloga: ADMIN)*
- **FR-005-15**: Sistem MORA rollback, ki ne bi spremenil nobenega kontakta (vedno pri najnovejšem vnosu), zavrniti z `409 ROLLBACK_NO_CHANGES`, brez spremembe in brez novega vnosa; vmesnik pri najnovejšem vnosu gumba za rollback ne izriše. *(najnižja vloga: ADMIN)*
- **FR-005-16**: Sistem MORA pred rollbackom zahtevati potrditev v dialogu (design.md 8.11) z naslovom »Povrnem skupino na stanje ‹čas›?«, besedilom posledice iz design.md 9.6, gumboma *Prekliči* in *Povrni skupino* ter fokusom na *Prekliči* ob odprtju; uspeh prikaže obvestilo »Skupina je povrnjena na stanje ‹čas›.« *(najnižja vloga: ADMIN)*
- **FR-005-17**: Sistem MORA gumb »Povrni skupino na to točko« izrisati samo adminu in lastniku nearhivirane skupine; rollback v arhivirani skupini se zavrne z `409 GROUP_ARCHIVED` (ADMIN, OWNER) oziroma `403` (nižje vloge). *(najnižja vloga: ADMIN)*
- **FR-005-18**: Sistem MORA vsak neuspeh nalaganja sledi ali rollbacka prikazati kot trajno sporočilo ob mestu akcije (design.md 8.13) v sl/en brez tehničnih kod, z gumbom *Poskusi znova*, kjer je ponovitev smiselna. *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Vnos revizijske sledi**: nespremenljiv zapis ene operacije nad kontakti v eni skupini; atributi: skupina, čas, izvajalec (sklic na uporabnika; prikaz »izbrisan uporabnik«, če ga ni več), vrsta dejanja, pri vrsti *rollback* sklic na ciljni vnos, seznam sprememb kontaktov. Vnosi skupine so popolnoma urejeni po času nastanka.
- **Sprememba kontakta (v vnosu)**: en prizadeti kontakt v vnosu; identifikator kontakta, prikazno ime ob času vnosa, stanje prej in stanje potem (vsi atributi, dodatni atributi in značke; prazno pri dodajanju oziroma odstranjevanju), iz katerih se izpelje seznam spremenjenih polj.
- **Stanje skupine v točki T**: množica vseh kontaktov skupine z vrednostmi takoj po uveljavitvi vnosa T; izpelje se iz sledi in je cilj rollbacka.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % uspešnih operacij nad kontakti v preizkusih ustvari natanko en vnos; 0 % zavrnjenih operacij ustvari vnos.
- **SC-002**: Po rollbacku na naključno izbrano točko je stanje vseh kontaktov skupine v 100 % preizkusov enako stanju, ki je bilo zabeleženo takoj po tej točki.
- **SC-003**: Rollback skupine z 10.000 kontakti, ki spremeni do 1.000 kontaktov, se zaključi v manj kot 10 sekundah.
- **SC-004**: Bralec najde vse spremembe določenega kontakta (povezava iz pogleda kontakta) v največ dveh korakih.
- **SC-005**: Prva stran sledi s 100.000 vnosi se prikaže v manj kot 2 sekundah v 95 % odpiranj.
- **SC-006**: 100 % primerov matrike izolacije (neprijavljen, nečlan, bralec in urednik pri rollbacku, arhivirana skupina, vnos druge skupine) vrne pričakovan odgovor; zaslon sledi in dialog rollbacka nimata kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px.

## Assumptions

- Odvisnost od **004-kontakti** (operacije, verzije kontaktov, pravilo `VERSION_CONFLICT`, pogled kontakta, v katerega ta funkcionalnost doda povezavo na sled); od **002-skupine** (zavihek *Revizijska sled*, vloge) in **003-arhiviranje** (sled se lahko bere v arhivirani skupini; izbris skupine izbriše tudi sled).
- **009-mnozicno-urejanje** in **011-dvojniki** morata za svoje operacije uporabiti pogodbo beleženja iz FR-005-04 in to zapisati v svojih FR; ta specifikacija določa le obliko vnosa.
- Množične spremembe nimajo lastne vrste dejanja: množično urejanje je *urejanje*, množični izbris *odstranjevanje*, ločita se po številu prizadetih kontaktov (»uredil(a) 12 kontaktov«).
- Sled beleži samo spremembe kontaktov; članstva, vloge, povabila in podatki skupine niso del sledi in rollback nanje ne vpliva.
- Rollback na najnovejši vnos ali na točko, po kateri se stanje kontaktov ni spremenilo, se zavrne s kodo `ROLLBACK_NO_CHANGES` in se ne zabeleži (namesto da bi bil sprejet brez učinka).
- Zahteva za rollback nosi najnovejši vnos, ki ga je uporabnik videl (optimistično zaklepanje sledi), da rollback ne razveljavi tiho sprememb, ki jih uporabnik ob potrditvi ni videl.
- Rollback ne spremeni izvajalcev starih vnosov in ne briše vnosov; obnovljeni kontakti obdržijo prvotne identifikatorje, zato filter po kontaktu pokaže njihovo celotno zgodovino.
- Vnosi so del podatkov skupine, ne osebni podatki izvajalca: ob izbrisu računa (012) ostanejo, izvajalec pa je prikazan kot »izbrisan uporabnik«.
- Paginacija sledi uporablja velikosti iz skupnega slovarja (feature-map §2.6).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
