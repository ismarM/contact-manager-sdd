# Feature Specification: Napredna revizijska sled in zgodovina kontakta

**Feature Branch**: `napredna-revizija` (no number; the directory is `specs/015-napredna-revizija/`)

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "Nadgradnja 005 – revizijska sled: filtriranje sledi po uporabniku (tudi izbrisani in nekdanji člani, v kombinaciji z obstoječimi filtri); zgodovina posameznega kontakta kot razumljiva časovnica v podrobnostih kontakta (tudi za izbrisane in združene kontakte); ogled prejšnjega stanja in primerjava dveh različic (osnovna polja, dodatni atributi, značke); obnova samo enega kontakta z ogledom sprememb pred obnovo, optimističnim zaklepanjem in novim revizijskim zapisom; rollback celotne skupine ostane. Večnajemniška izolacija in vloge OWNER, ADMIN, EDITOR, VIEWER se ne spremenijo; funkcionalnost mora delovati z vnosi, ki jih bo ustvaril množični uvoz 014, ne da bi se spreminjalo njegovo delo."

## Clarifications

### Session 2026-11-15

- Q: Katera je najnižja vloga za obnovo enega kontakta? → A: EDITOR (kot ustvarjanje, urejanje in izbris kontaktov); rollback celotne skupine ostane ADMIN.
- Q: Kako se obnova zapiše v sled? → A: nova vrsta dejanja *obnova* s sklicem na obnovljeno različico (ciljni vnos); vrste *dodajanje*, *urejanje*, *odstranjevanje*, *združevanje*, *rollback* se ne spremenijo.
- Q: Kaj kaže kontakt po obnovi kot zadnjo spremembo? → A: dejanskega izvajalca obnove in čas obnove, brez oznake *Povrnjeno* (ta ostane samo za rollback skupine, 005 FR-005-19).
- Q: Kateri izbrisani ali združeni kontakti so obnovljivi? → A: obnovljivi so kontakti, izbrisani z odstranjevanjem (tudi množičnim), in kontakti, odstranjeni z rollbackom skupine; z združevanjem odstranjeni kontakti imajo zgodovino, a se jih ne da neposredno obnoviti.
- Q: Kako uporabnik pride do izbrisanega kontakta? → A: seznam *Izbrisani kontakti* v skupini (iskanje, ločitev obnovljivih in združenih, ogled zgodovine, obnova), izpeljan iz revizijske sledi; ločena tabela izbrisanih kontaktov se ne uvede.
- Q (dodatno, uporabnik): Kako ravnati ob možnosti podvajanja ob obnovi izbrisanega kontakta? → A: predogled opozori na obstoječe kontakte z enakim e-naslovom ali istim prikaznim imenom; obnova ni blokirana, a jo uporabnik mora izrecno potrditi (potrditveno polje, brez njega je gumb onemogočen) – zaključni pregled 2026-11-15.
- Q (zaključni pregled, uporabnik): Ali sme obnova stare različice kršiti trenutna pravila 013? → A: ne; zgodovina ostane dobesedna, novo stanje pa velja po današnjih pravilih: neuradna koda države in predolgo podjetje zavrneta obnovo, nov rezerviran ključ atributa (ki ga kontakt še nima) zavrne obnovo (`400 VALIDATION_FAILED`, predogled `restorable: false`, razlog `INVALID_STATE`), ključi in značke dobijo kanonični zapis skupine.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zgodovina kontakta (Priority: P1)

Član skupine v podrobnostih kontakta vidi časovnico vseh sprememb tega kontakta (kdo, kdaj, kaj je bilo storjeno in katera polja so se spremenila), ne da bi moral prebirati celotno sled skupine. Časovnica uporablja podatke, ki jih sled že hrani (005); nič se ne beleži dvakrat.

**Why this priority**: najpogostejše vprašanje uporabnikov je »kaj se je zgodilo s tem kontaktom«; nadgradnja je koristna že sama in je podlaga za primerjavo in obnovo.

**Independent Test**: bralec odpre kontakt z več spremembami (ustvarjanje, urejanje, množično urejanje, rollback skupine, združevanje) ter preveri vrstni red, izvajalca, čas, vrsto in spremenjena polja; ponovi za izbrisan in za združen kontakt.

**Acceptance Scenarios**:

1. **[FR-015-05]** **Given** kontakt, ki ga je urednik ustvaril, nato uredil telefon in dodal značko, **When** bralec v podrobnostih kontakta odpre *Zgodovina*, **Then** vidi tri dogodke, najnovejši zgoraj, vsakega z izvajalcem, časom v zapisu jezika vmesnika, vrsto spremembe kot stavek (»ustvaril(a) kontakt«, »uredil(a) kontakt«) in imenom spremenjenih polj.
2. **[FR-015-06]** **Given** dogodek »uredil(a) kontakt«, **When** član razkrije spremembe dogodka, **Then** vidi za vsako spremenjeno polje staro in novo vrednost (dodatni atributi po ključu, značke kot dodane/odstranjene), polja brez spremembe niso navedena.
3. **[FR-015-06]** **Given** kontakt, ki ga je spremenila množična operacija s 500 kontakti ali rollback skupine, **When** član odpre njegovo zgodovino, **Then** je dogodek prikazan samo za ta kontakt (ne seznam vseh 500) s povezavo na celoten vnos v sledi skupine.
4. **[FR-015-07]** **Given** izbrisan kontakt, **When** član odpre njegovo zgodovino iz vnosa *odstranjevanje* v sledi, **Then** vidi vso zgodovino do izbrisa, zadnji dogodek je »odstranil(a) kontakt«, kontakt pa je jasno označen kot izbrisan.
5. **[FR-015-07]** **Given** kontakt, ki je bil z združevanjem (011) odstranjen, **When** član odpre njegovo zgodovino, **Then** je zadnji dogodek »združen v ‹ime ohranjenega kontakta›« s povezavo na zgodovino ohranjenega kontakta; zgodovina ohranjenega kontakta vsebuje dogodek »združil(a) ‹n› kontaktov«.
6. **[FR-015-07]** **Given** kontakt, ki je obstajal pred začetkom beleženja in ga ni spremenila nobena operacija, **When** član odpre zgodovino, **Then** vidi »Ni zabeleženih sprememb«, ne napake.
7. **[FR-015-05]** **Given** zgodovina z več kot 25 dogodki, **When** član odpre zgodovino, **Then** vidi paginiran seznam po skupnem slovarju (25 privzeto, 50, 100).

---

### User Story 2 - Filtriranje sledi po uporabniku (Priority: P1)

Član v sledi skupine izbere izvajalca in vidi samo njegove spremembe; filter se kombinira z vrsto dejanja in kontaktom. Na izbiro so tudi nekdanji člani in »izbrisan uporabnik«.

**Why this priority**: odgovor na »kaj je spremenil ta član« je ob odhodu člana ali pri preverjanju množične napake takojšnja potreba; sledi 005 je brez tega težko pregledovati.

**Independent Test**: sled z vnosi štirih izvajalcev (trenutni član, nekdanji član, izbrisan uporabnik, lastnik); preveri se vsak filter posebej, v kombinacijah z vrsto dejanja in kontaktom ter izolacija med skupinama.

**Acceptance Scenarios**:

1. **[FR-015-01]** **Given** sled z vnosi članov Ana in Boris, **When** član izbere izvajalca Ana, **Then** vidi samo vnose, ki jih je zapisala Ana; oznaka filtra je odstranljiva, filter je v naslovu poti in ostane ob osvežitvi.
2. **[FR-015-02]** **Given** izbran izvajalec Ana in vrsta dejanja *odstranjevanje* ter kontakt Janez, **When** se uporabijo vsi trije filtri, **Then** so prikazani samo vnosi, ki ustrezajo vsem trem hkrati (več izbranih vrst dejanj ostane ALI; med različnimi filtri je IN).
3. **[FR-015-03]** **Given** skupina, v kateri je Boris izstopil, izvajalec tretjega vnosa pa je izbrisal račun, **When** član odpre izbiro izvajalca, **Then** vidi seznam izvajalcev te sledi: trenutne člane, nekdanje člane (z oznako »nekdanji član«) in eno postavko »izbrisan uporabnik«; izbira vsake prikaže njegove vnose.
4. **[FR-015-03]** **Given** uporabnik, ki je bil član samo druge skupine, **When** član odpre izbiro izvajalca, **Then** ta uporabnik ni na seznamu; **When** je njegov identifikator ročno vpisan v naslov poti, **Then** je seznam prazen kot za izvajalca brez vnosov in podatki druge skupine niso razkriti.
5. **[FR-015-04]** **Given** filtriran pogled in ob njem odprt rollback skupine, **When** admin potrdi rollback, **Then** še vedno velja preverjanje najnovejšega vnosa celotne sledi (005 FR-005-14), ne glede na izbrani filter uporabnika.
6. **[FR-015-04]** **Given** filter, ki ne najde nobenega vnosa, **When** se prikaže seznam, **Then** vidi »Ni vnosov, ki ustrezajo filtrom.« in *Počisti filtre* (005).

---

### User Story 3 - Ogled in primerjava različic (Priority: P2)

Član za izbrani dogodek v zgodovini odpre prejšnje stanje kontakta in lahko primerja dve poljubni različici; razlike so jasno označene kot dodano, odstranjeno ali spremenjeno.

**Why this priority**: brez primerjave je zgodovina seznam dogodkov, ne razumevanje, kaj se je spremenilo skozi čas; pogoj za varno obnovo.

**Independent Test**: kontakt z več različicami; preveri se ogled stanja po izbranem dogodku in primerjava dveh različic za osnovna polja, dodatne atribute in značke.

**Acceptance Scenarios**:

1. **[FR-015-08]** **Given** zgodovina kontakta, **When** član pri dogodku izbere »Ogled stanja po tej spremembi«, **Then** vidi vsa polja kontakta, kot so bila takoj po tem dogodku (osnovna polja, dodatni atributi, značke) samo za branje, z izvajalcem in časom dogodka.
2. **[FR-015-09]** **Given** dve različici, med katerima je bil spremenjen telefon, dodan atribut `kompetenca`, odstranjena značka `vip` in dodana značka `konferenca`, **When** član izbere primerjavo, **Then** so razlike navedene po poljih: *Telefon* – spremenjeno (prej/potem), `kompetenca` – dodano, značka `vip` – odstranjeno, značka `konferenca` – dodano; nespremenjena polja so privzeto skrita z možnostjo prikaza vseh.
3. **[FR-015-09]** **Given** primerjava, **When** je ena izmed različic »trenutno stanje«, **Then** je pri vseh dogodkih mogoče izbrati primerjavo s trenutnim stanjem; pri izbrisanem kontaktu je primerjava možna samo med zabeleženimi različicami.
4. **[FR-015-09]** **Given** primerjava različic, **When** član gleda zaslon samo v enobarvnem prikazu ali s bralnikom zaslona, **Then** je vrsta spremembe (dodano, odstranjeno, spremenjeno) razvidna iz besedila, ne samo iz barve.
5. **[FR-015-08]** **Given** kontakt, ki je obstajal pred začetkom beleženja, **When** član odpre ogled pri prvem zabeleženem dogodku, **Then** je na voljo tudi »Izhodiščno stanje« (stanje pred prvim zabeleženim dogodkom).

---

### User Story 4 - Obnova enega kontakta (Priority: P2)

Uporabnik z ustrezno vlogo obnovi izbrano različico samo tega kontakta, po ogledu, kaj se bo spremenilo. Drugi kontakti in stara zgodovina ostanejo nespremenjeni, obnova pa se zapiše kot nov vnos.

**Why this priority**: rollback skupine je pregrob za popravek enega kontakta; obnova enega kontakta je varnejša, a brez ogleda in primerjave ni smiselna.

**Independent Test**: admin v skupini z več kontakti obnovi starejšo različico enega kontakta; preveri se stanje tega kontakta, nespremenjenost drugih, nov vnos s pravim izvajalcem in časom, nespremenjeni stari vnosi ter zavrnitve (vloge, sočasnost, arhivirana skupina).

**Acceptance Scenarios**:

1. **[FR-015-10]** **Given** uporabnik z zadostno vlogo v nearhivirani skupini, **When** pri dogodku v zgodovini kontakta izbere »Obnovi to različico«, **Then** se odpre potrditveni dialog; uporabnik brez zadostne vloge gumba ne vidi.
2. **[FR-015-11]** **Given** odprt dialog obnove, **When** je prikazan, **Then** vidi seznam sprememb, ki jih bo obnova povzročila (primerjava *trenutno → izbrana različica* po polju), naslov »Obnovim kontakt ‹ime› na stanje ‹čas›?«, besedilo posledice, gumba *Prekliči* in *Obnovi kontakt* ter fokus na *Prekliči*; *Esc* ne spremeni ničesar.
3. **[FR-015-12]** **Given** potrjena obnova kontakta A, **When** uspe, **Then** ima A vrednosti izbrane različice (osnovna polja, dodatni atributi, značke), vsi drugi kontakti skupine so nespremenjeni, vsi obstoječi vnosi sledi so nespremenjeni, na vrhu sledi je nov vnos, ki ga je zapisal uporabnik, ki je obnovil, s strežniškim časom obnove in prizadetim samo kontaktom A, v zgodovini A pa se pojavi nov dogodek »obnovil(a) kontakt na stanje ‹čas›«.
4. **[FR-015-12]** **Given** obnovljen kontakt, **When** urednik shrani obrazec z verzijo izpred obnove, **Then** strežnik vrne `409 VERSION_CONFLICT` (004), ker je obnova kontaktu dodelila novo, višjo verzijo.
5. **[FR-015-13]** **Given** dva uporabnika sočasno obnavljata različici istega kontakta ali eden obnavlja, drug pa ureja, **When** druga zahteva pride za prvo, **Then** druga dobi `409 VERSION_CONFLICT`, nič se ne spremeni, dialog pokaže »Kontakt se je medtem spremenil.« in osveži zgodovino.
6. **[FR-015-14]** **Given** izbrisan kontakt, **When** uporabnik z zadostno vlogo obnovi njegovo zadnjo zabeleženo različico, **Then** kontakt spet obstaja z istim identifikatorjem in je v zgodovini nadaljevanje stare časovnice.
7. **[FR-015-15]** **Given** različica, ki je enaka trenutnemu stanju, **When** uporabnik zahteva obnovo, **Then** strežnik vrne `409 RESTORE_NO_CHANGES`, nič se ne spremeni, ne nastane vnos; gumb pri trenutni različici ni izrisan.
8. **[FR-015-17]** **Given** skupina z obstoječim rollbackom (005), **When** admin po obnovi kontakta izvede rollback skupine na točko pred obnovo, **Then** rollback deluje kot doslej in obnovo kontakta razveljavi enako kot vsak drug vnos.
9. **[FR-015-16]** **Given** arhivirana skupina, **When** član odpre zgodovino in primerjavo, **Then** sta na voljo za branje; obnove ni mogoče.

---

### User Story 5 - Razumljiv pregled za ne-tehnične uporabnike (Priority: P3)

Zgodovina, primerjava in obnova so napisane v preprostem jeziku, brez tehničnih izrazov, odzivne in dostopne.

**Why this priority**: celotna nadgradnja je namenjena razumljivosti; je pa lastnost zaslonov, ne ločen tok.

**Independent Test**: pregled zaslonov pri 360, 768 in 1280 px v sl in en; samodejni pregled dostopnosti; stavki dogodkov brez internih izrazov.

**Acceptance Scenarios**:

1. **[FR-015-19]** **Given** napaka pri nalaganju zgodovine, primerjave ali obnove, **When** se prikaže, **Then** je trajno sporočilo ob mestu akcije v sl/en brez tehničnih kod, z gumbom *Poskusi znova*, kjer je ponovitev smiselna.
2. **[FR-015-20]** **Given** zaslon zgodovine, primerjave in dialog obnove, **When** se pregledajo pri 360, 768 in 1280 px s tipkovnico in bralnikom zaslona, **Then** ni kršitev WCAG 2.1 A in AA, vsa dejanja so dosegljiva s tipkovnico, besedila so v obeh jezikih.
3. **[FR-015-18]** **Given** vnos neznane ali novejše vrste dejanja (npr. množični uvoz 014) z velikim številom kontaktov, **When** se odpre zgodovina kontakta, ki je v njem, **Then** je dogodek prikazan z občim stavkom (»spremenil(a) kontakt«) in spremenjenimi polji, brez napake, in odpiranje zgodovine ni opazno počasnejše.

---

### User Story 6 - Seznam izbrisanih kontaktov (Priority: P2)

Član skupine odpre *Izbrisani kontakti*: preprost seznam kontaktov, ki jih ni več, z iskanjem, z jasno ločitvijo med obnovljivimi in združenimi ter z neposrednim ogledom zgodovine in obnovo. Iskati revizijski dogodek ni potrebno.

**Why this priority**: brez seznama je izbrisan kontakt dosegljiv le iz vnosa v sledi, kar je za ne-tehnične uporabnike prezapleteno; seznam naredi obnovo opazno in varno.

**Independent Test**: skupina z izbrisanim, množično izbrisanim, z rollbackom odstranjenim in z združevanjem odstranjenim kontaktom; preveri se seznam, iskanje, filtri, razlaga pri združenem, predogled z opozorilom o podvajanju, obnova in dostopnost.

**Acceptance Scenarios**:

1. **[FR-015-22]** **Given** skupina z izbrisanimi kontakti, **When** član odpre *Izbrisani kontakti* (povezava v glavi seznama kontaktov), **Then** vidi paginiran seznam (25 privzeto, 50, 100), najnovejši izbris zgoraj, za vsak kontakt ime, e-naslov in podjetje (če obstajata), kdo ga je odstranil in kdaj ter oznako *Obnovljiv* ali *Združen*.
2. **[FR-015-22]** **Given** kontakt, ki je bil izbrisan in nato obnovljen (obnova ali rollback), **When** član odpre seznam, **Then** kontakta na seznamu ni (obstaja spet).
3. **[FR-015-23]** **Given** seznam z več kot 25 kontakti, **When** član vpiše del imena, e-naslova ali podjetja, **Then** so prikazani samo ujemajoči kontakti (brez razlikovanja velikosti črk in šumnikov, kot iskanje 008); filter *Vsi / Obnovljivi / Združeni* je v naslovu poti in ostane ob osvežitvi.
4. **[FR-015-24]** **Given** z združevanjem odstranjen kontakt, **When** je prikazan na seznamu, **Then** je označen *Združen v ‹ime›* z razlago »Ta kontakt je bil združen v kontakt ‹ime›; njegovi podatki so v ohranjenem kontaktu. Neposredna obnova bi ustvarila podvojen kontakt.« in povezavami *Zgodovina* ter *Odpri ohranjeni kontakt*; gumba *Obnovi* ni; razlaga omeni skupinski rollback (admin) kot drugo pot.
5. **[FR-015-14]** **Given** obnovljiv kontakt, **When** uporabnik z vlogo EDITOR ali višje izbere *Obnovi*, **Then** se odpre predogled sprememb (kontakt bo spet obstajal z naštetimi podatki) z opozorilom o možnih podvojenih kontaktih, če obstaja kontakt z enakim e-naslovom ali istim imenom (s povezavo nanj); potrditev obnovi kontakt, ki izgine s seznama.
6. **[FR-015-22]** **Given** seznam brez izbrisanih kontaktov ali iskanje brez zadetkov, **When** se prikaže, **Then** vidi »Ni izbrisanih kontaktov.« oziroma »Ni kontaktov, ki ustrezajo iskanju.« s *Počisti iskanje* (design.md 8.15).
7. **[FR-015-22]** **Given** kontakt z dvema izbrisoma in obnovama, **When** je trenutno izbrisan, **Then** je na seznamu enkrat, s stanjem iz zadnjega izbrisa.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-015-01, FR-015-03, FR-015-05, FR-015-08, FR-015-09 | unauthenticated (no/invalid/expired token) | ogled sledi s filtrom uporabnika, zgodovine, različice ali primerjave | 401, podatki niso vrnjeni |
| FR-015-01, FR-015-03, FR-015-05, FR-015-08, FR-015-09 | authenticated non-member | isto | 404, obstoj skupine ni razkrit |
| FR-015-05, FR-015-08, FR-015-09 | član skupine A (katera koli vloga) | zgodovina, različica ali primerjava kontakta ali vnosa skupine B prek skupine A | 404, enako kot za neobstoječ kontakt |
| FR-015-01, FR-015-03 | član | filter po uporabniku, ki ni izvajalec te sledi (tuj ali neobstoječ) | 200 z praznim seznamom, brez razkritja podatkov o uporabniku |
| FR-015-01, FR-015-04, FR-015-05 | član | neveljavna vrednost filtra uporabnika, velikost strani ni 25, 50 ali 100 | 400 VALIDATION_FAILED |
| FR-015-09 | član | primerjava dveh različic, od katerih ena pripada drugemu kontaktu ali skupini | 404, nič ni razkrito |
| FR-015-10 | unauthenticated (no/invalid/expired token) | obnova | 401, nič se ne spremeni |
| FR-015-10 | authenticated non-member | obnova | 404, obstoj ni razkrit, nič se ne spremeni |
| FR-015-10 | member z vlogo, nižjo od najnižje za obnovo | obnova | 403, nič se ne spremeni |
| FR-015-10 | ADMIN+ | obnova različice kontakta ali vnosa druge skupine ali neobstoječe različice | 404, nič se ne spremeni |
| FR-015-16 | member z zadostno vlogo v arhivirani skupini | obnova | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-015-16 | member z nezadostno vlogo v arhivirani skupini | obnova | 403, nič se ne spremeni |
| FR-015-13 | uporabnik z zastarelo verzijo ali zadnjim dogodkom kontakta | obnova | 409 VERSION_CONFLICT, nič se ne spremeni |
| FR-015-13 | dve sočasni obnovi ali obnova in urejanje istega kontakta | druga zahteva | 409 VERSION_CONFLICT; kontakt ima eno veljavno stanje, natanko en nov vnos |
| FR-015-15 | uporabnik z zadostno vlogo | obnova različice, enake trenutnemu stanju | 409 RESTORE_NO_CHANGES, nič se ne spremeni, ne nastane vnos |
| FR-015-12 | uporabnik z zadostno vlogo | obnova, med katero pride do napake | nič se ne spremeni in ne nastane vnos (vse ali nič) |
| FR-015-12 | EDITOR+ | urejanje ali izbris kontakta z verzijo izpred obnove | 409 VERSION_CONFLICT (004) |
| FR-015-22, FR-015-23 | unauthenticated (no/invalid/expired token) | seznam izbrisanih kontaktov | 401, podatki niso vrnjeni |
| FR-015-22, FR-015-23 | authenticated non-member | seznam izbrisanih kontaktov | 404, obstoj skupine ni razkrit |
| FR-015-22 | član skupine A | seznam izbrisanih kontaktov skupine B prek skupine A | 404; seznam skupine A ne vsebuje kontaktov skupine B |
| FR-015-22, FR-015-23 | member (VIEWER+) | velikost strani, ki ni 25, 50 ali 100, ali neznan filter stanja | 400 VALIDATION_FAILED |
| FR-015-22 | member arhivirane skupine (VIEWER+) | ogled seznama izbrisanih kontaktov | 200 – branje je dovoljeno |
| FR-015-10 | VIEWER | obnova izbrisanega kontakta | 403, nič se ne spremeni |
| FR-015-14 | EDITOR+ | obnova kontakta, ki je bil z združevanjem odstranjen | 409 RESTORE_NOT_ALLOWED, nič se ne spremeni, ne nastane vnos |
| FR-015-14 | EDITOR+ | obnova kontakta, ki že obstaja (kdo ga je medtem obnovil) | 409 VERSION_CONFLICT, nič se ne spremeni |
| FR-015-14 | EDITOR+ | obnova izbrisanega kontakta, medtem ko obstaja kontakt z istim e-naslovom | 201 (opozorilo je samo v predogledu), obnovljen je samo ta kontakt |

### Edge Cases

- Izvajalec je izbrisal račun: njegovi vnosi so v filtru združeni v eno postavko »izbrisan uporabnik«; med več izbrisanimi uporabniki ni razlikovanja (osebni podatki se ne hranijo, feature-map §2.5).
- Nekdanji član (odstranjen ali izstopil) ostane izbirljiv v filtru, dokler ima v sledi vnose; njegovo ime je prikazano tako kot v sledi 005; če se vrne v skupino, je prikazan kot trenutni član.
- Izvajalec nima nobenega vnosa v sledi te skupine: ni na seznamu izvajalcev.
- Kontakt je bil izbrisan in z rollbackom ali obnovo obnovljen z istim identifikatorjem: zgodovina je ena sama, neprekinjena časovnica.
- Kontakt, ki je bil združen v drugega in nato z rollbackom skupine obnovljen: zgodovina vsebuje tudi dogodek rollbacka; ohranjeni kontakt ima ob tem lastne dogodke.
- Stanja iz časa pred 013 nimajo polj *Podjetje* in *Država*: v primerjavi se obravnavata kot prazni polji, ne kot napaka.
- Primerjava različice s samo seboj: ni na voljo (izbira dveh različnih različic).
- Zelo dolga zgodovina (npr. 1.000 dogodkov): paginirana; primerjava in obnova se nanašata na izbrane različice, ne na stran.
- Preimenovanje kontakta: dogodki prikazujejo ime ob času dogodka (005); v naslovu zgodovine je trenutno ime (ali zadnje zabeleženo ime pri izbrisanem kontaktu).
- Obnovljena različica je zaradi poznejših pravil (npr. 013) drugačna od današnjih omejitev (npr. nekanoničen ključ atributa): obnova zapiše stanje, kot je bilo zabeleženo, in ne preverja znova vsebine (enako kot rollback 005).
- Kontakt je bil združen v drugega in nato z rollbackom skupine obnovljen, nato izbrisan: zadnja sprememba je odstranjevanje, zato je obnovljiv.
- Kontakt, ki ga je odstranil rollback skupine, je na seznamu obnovljiv; če rollback na prejšnjo točko kontakt vrne, z seznama izgine.
- Ohranjeni kontakt združitve se obnaša kot vsak drug kontakt: njegove različice so obnovljive (EDITOR+); obnova različice izpred združitve ne obnovi odstranjenih kontaktov.
- Dva uporabnika sočasno obnavljata isti izbrisani kontakt: uspe eden, drugi dobi `409 VERSION_CONFLICT` in seznam se osveži.
- Skupinski rollback in obnova kontakta ne smeta izbrisati ali spremeniti nobenega vnosa sledi (nespremenljivost, 005 FR-005-05).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-015-01**: Sistem MORA omogočiti filtriranje revizijske sledi po izvajalcu (en izbran izvajalec ali »izbrisan uporabnik«); filter je v naslovu poti, ostane ob osvežitvi in je prikazan kot odstranljiva oznaka med oznakami filtrov. *(najnižja vloga: VIEWER)*
- **FR-015-02**: Sistem MORA filter po izvajalcu kombinirati z obstoječima filtroma (vrsta dejanja, kontakt) tako, da so prikazani samo vnosi, ki ustrezajo vsem uporabljenim filtrom (IN med različnimi filtri, ALI med več izbranimi vrstami dejanj), in števec ter paginacija ustrezajo filtriranemu seznamu. *(najnižja vloga: VIEWER)*
- **FR-015-03**: Sistem MORA za izbiro izvajalca ponuditi izvajalce, ki imajo vsaj en vnos v sledi te skupine: trenutne člane, nekdanje člane (z oznako) in eno postavko »izbrisan uporabnik« (feature-map §2.5); noben uporabnik, ki ni izvajalec te sledi, ni na seznamu ali razkrit; filter po izvajalcu, ki ni izvajalec te sledi, vrne prazen seznam. *(najnižja vloga: VIEWER)*
- **FR-015-04**: Sistem MORA zagotoviti, da filter po izvajalcu ne vpliva na preverjanje najnovejšega vnosa celotne sledi pri rollbacku skupine (005 FR-005-14) in na prazna stanja (005 FR-005-10). *(najnižja vloga: VIEWER)*
- **FR-015-05**: Sistem MORA v podrobnostih kontakta prikazati zgodovino kontakta kot paginirano časovnico (25 privzeto, 50, 100), najnovejši dogodek zgoraj, z izvajalcem (ali »izbrisan uporabnik«), časom v zapisu jezika vmesnika, vrsto spremembe kot stavek in imeni spremenjenih polj; en dogodek pomeni en vnos sledi, v katerem je kontakt prizadet. *(najnižja vloga: VIEWER)*
- **FR-015-06**: Sistem MORA za vsak dogodek na zahtevo prikazati spremenjena polja kontakta (staro in novo vrednost; dodatni atributi po ključu; značke dodane in odstranjene) iz podatkov sledi 005, brez ločenega zapisa ali podvajanja zgodovine; pri vnosih z več kontakti so prikazane samo spremembe tega kontakta s povezavo na celoten vnos v sledi skupine. *(najnižja vloga: VIEWER)*
- **FR-015-07**: Sistem MORA zgodovino ohraniti in jo omogočiti odpreti tudi za izbrisane in z združevanjem odstranjene kontakte (povezava iz vnosov sledi in iz zgodovine ohranjenega kontakta): izbrisan kontakt je označen kot izbrisan; z združevanjem odstranjen kontakt pokaže »združen v ‹ime›« s povezavo na ohranjeni kontakt, ohranjeni kontakt pa dogodek združitve; kontakt brez zabeleženih sprememb pokaže prazno stanje, ne napake. *(najnižja vloga: VIEWER)*
- **FR-015-08**: Sistem MORA za vsak dogodek omogočiti ogled različice kontakta (stanje takoj po dogodku: osnovna polja, dodatni atributi, značke) samo za branje, ter za kontakt, ki je obstajal pred začetkom beleženja, tudi izhodiščno stanje (pred prvim zabeleženim dogodkom). *(najnižja vloga: VIEWER)*
- **FR-015-09**: Sistem MORA omogočiti primerjavo dveh različic istega kontakta (ali različice s trenutnim stanjem) s prikazom razlik po poljih – osnovna polja, dodatni atributi, značke – kjer je vsaka razlika označena kot dodano, odstranjeno ali spremenjeno z besedilom in ne samo z barvo; nespremenjena polja so privzeto skrita z možnostjo prikaza. *(najnižja vloga: VIEWER)*
- **FR-015-10**: Sistem MORA omogočiti obnovo izbrane različice posameznega kontakta uporabniku z vlogo EDITOR ali višje (OWNER, ADMIN); gumb »Obnovi to različico« je izrisan samo uporabniku s to vlogo v nearhivirani skupini; VIEWER dobi `403`. *(najnižja vloga: EDITOR)*
- **FR-015-11**: Sistem MORA pred obnovo zahtevati potrditev v dialogu (feature-map §2.8, design.md 8.11), ki prikazuje seznam sprememb po poljih (trenutno stanje → izbrana različica), naslov »Obnovim kontakt ‹ime› na stanje ‹čas›?«, gumba *Prekliči* in *Obnovi kontakt* ter fokus na *Prekliči*; uspeh prikaže obvestilo »Kontakt je obnovljen na stanje ‹čas›.« *(najnižja vloga: EDITOR)*
- **FR-015-12**: Sistem MORA obnovo izvesti atomarno nad samim izbranim kontaktom: noben drug kontakt in noben obstoječi vnos sledi se ne spremeni; kontakt dobi vrednosti izbrane različice in novo verzijo, višjo od vseh prejšnjih verzij tega kontakta (FR-005-13), kot izvajalca in čas zadnje spremembe pa dejanskega izvajalca in čas obnove (brez oznake *Povrnjeno*, ki ostane samo za rollback skupine, FR-005-19); zapiše se nov vnos sledi nove vrste dejanja *obnova* (stavek »obnovil(a) kontakt ‹ime› na stanje ‹čas›«) z izvajalcem, ki je obnovo izvedel, strežniškim časom obnove in sklicem na obnovljeno različico; ob napaki se nič ne spremeni in vnos ne nastane. Zapisano stanje mora ustrezati trenutnim pravilom 013 (država kot uradna koda ISO, podjetje do 200 znakov, nova rezervirana imena atributov niso dovoljena, kanonični zapis ključev in značk); zgodovina ostane dobesedna, različica, ki bi kršila pravila, se zavrne z `400 VALIDATION_FAILED`. *(najnižja vloga: EDITOR)*
- **FR-015-13**: Sistem MORA obnovo opremiti s stanjem kontakta, kot ga je uporabnik videl (verzija; pri izbrisanem kontaktu zadnji dogodek njegove zgodovine); če se je kontakt medtem spremenil, obnovo zavrne z `409 VERSION_CONFLICT`, nič se ne spremeni, vmesnik pa pokaže »Kontakt se je medtem spremenil.« in osveži zgodovino; sočasni zahtevi uspe največ ena. *(najnižja vloga: EDITOR)*
- **FR-015-14**: Sistem MORA omogočiti obnovo izbrisanega kontakta z istim identifikatorjem, kadar je bila njegova zadnja zabeležena sprememba odstranjevanje (posamično ali množično) ali odstranitev z rollbackom skupine; obnova kontakta, ki je bil z združevanjem odstranjen, se zavrne z `409 RESTORE_NOT_ALLOWED` (nova koda poslovnega pravila v feature-map §2.10), njegova zgodovina pa ostane vidna. Predogled obnove opozori na obstoječe kontakte skupine z enakim e-naslovom ali istim prikaznim imenom (možnost podvajanja); opozorilo obnove ne blokira, vmesnik pa zahteva izrecno potrditev podvajanja pred potrditvijo obnove. *(najnižja vloga: EDITOR)*
- **FR-015-15**: Sistem MORA obnovo različice, ki ne bi spremenila nobenega polja trenutnega kontakta, zavrniti z `409 RESTORE_NO_CHANGES` (nova koda poslovnega pravila v register feature-map §2.10), brez spremembe in brez novega vnosa; gumb pri trenutni različici ni izrisan. *(najnižja vloga: EDITOR)*
- **FR-015-16**: Sistem MORA dovoliti ogled zgodovine, različic in primerjave tudi v arhivirani skupini; obnova v arhivirani skupini se zavrne z `409 GROUP_ARCHIVED` (z zadostno vlogo) oziroma `403` (z nižjo) po vrstnem redu preverjanj feature-map §2.2. *(najnižja vloga: VIEWER za branje)*
- **FR-015-17**: Sistem MORA ohraniti obstoječo revizijsko sled in rollback celotne skupine (005) nespremenjena po vedenju, API-ju in pravilih; vnos obnove kontakta je v sledi skupine prikazan in ga rollback skupine upošteva kot vsak drug vnos. *(najnižja vloga: kot 005)*
- **FR-015-18**: Sistem MORA zgodovino kontakta, filter po izvajalcu in primerjavo omogočiti za vnose katere koli vrste in velikosti, ki jih zapiše pogodba beleženja (005 FR-005-04) – tudi za vrste dejanj, ki jih ta funkcionalnost ne pozna (npr. množični uvoz 014): neznana vrsta je prikazana z občim stavkom, brez napake; funkcionalnost ne zahteva sprememb pogodbe beleženja in ne dela funkcionalnosti 014. *(najnižja vloga: VIEWER)*
- **FR-015-19**: Sistem MORA vsak neuspeh nalaganja zgodovine, različic, primerjave ali obnove prikazati kot trajno sporočilo ob mestu akcije (design.md 8.13) v sl/en brez tehničnih kod z gumbom *Poskusi znova*, kjer je ponovitev smiselna; prazna stanja po design.md 8.15. *(najnižja vloga: VIEWER)*
- **FR-015-20**: Sistem MORA vse nove zaslone in dialog (zgodovina, ogled različice, primerjava, obnova, izbira izvajalca) izdelati po design.md, v sl/en, odzivno pri 360, 768 in 1280 px, brez kršitev WCAG 2.1 A in AA ter s polno dostopnostjo s tipkovnico; stavki dogodkov so razumljivi brez tehničnega znanja. *(najnižja vloga: VIEWER)*
- **FR-015-22**: Sistem MORA v skupini ponuditi seznam *Izbrisani kontakti* (povezava v glavi seznama kontaktov), izpeljan iz revizijske sledi brez ločene hrambe izbrisanih kontaktov: na seznamu je vsak kontakt, ki ga zdaj ni v skupini in ga sled pozna, enkrat, s stanjem iz zadnje spremembe (ime, e-naslov, podjetje, kdo je odstranil in kdaj, oznaka *Obnovljiv* ali *Združen*); paginiran (25 privzeto, 50, 100), najnovejši izbris zgoraj; kontakt, ki spet obstaja, ni na seznamu; ogled tudi v arhivirani skupini; prazno stanje po design.md 8.15. *(najnižja vloga: VIEWER)*
- **FR-015-23**: Sistem MORA seznam izbrisanih kontaktov omogočiti iskati po imenu, e-naslovu in podjetju (brez razlikovanja velikosti črk in šumnikov kot 008) ter filtrirati po *Vsi / Obnovljivi / Združeni*; iskanje in filter sta v naslovu poti. *(najnižja vloga: VIEWER)*
- **FR-015-24**: Sistem MORA pri z združevanjem odstranjenem kontaktu v razumljivem jeziku pojasniti, zakaj neposredna obnova ni mogoča (podatki so v ohranjenem kontaktu, obnova bi ustvarila podvojen kontakt), ponuditi povezavi na njegovo zgodovino in na ohranjeni kontakt ter omeniti rollback skupine (admin) kot drugo pot; gumba *Obnovi* ne izriše. *(najnižja vloga: VIEWER)*
- **FR-015-21**: Sistem MORA vse poizvedbe (filter izvajalca, izbira izvajalca, zgodovina, različica, primerjava, obnova) omejiti na skupino iz poti; kontakt, vnos ali različica druge skupine je enako kot neobstoječ (`404`). *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Vnos revizijske sledi / Sprememba kontakta** (005): obstoječa entiteta; edini vir zgodovine. Nova funkcionalnost ju bere in za obnovo zapiše en nov vnos; podatkov ne podvaja.
- **Izvajalec**: uporabnik, ki je zapisal vnos (trenutni član, nekdanji član ali izbrisan uporabnik – brez identitete).
- **Zgodovina kontakta**: izpeljan pogled vseh sprememb enega kontakta (po identifikatorju kontakta v skupini), urejen po zaporedju sledi; ni ločeno shranjen.
- **Različica kontakta**: stanje kontakta takoj po izbranem dogodku; izhodiščna različica je stanje pred prvim zabeleženim dogodkom; *trenutno stanje* je živ kontakt.
- **Primerjava**: izpeljana razlika med dvema različicama po poljih (dodano, odstranjeno, spremenjeno).
- **Izbrisan kontakt**: kontakt, ki ga ni v skupini in ga sled pozna; stanje, razlog odstranitve (odstranjevanje, rollback skupine, združevanje) in čas sta izpeljana iz zadnje spremembe v sledi; je *obnovljiv*, razen če je zadnja sprememba združevanje (*združen*).
- **Obnova kontakta**: operacija, ki z novim vnosom sledi nastavi kontakt na stanje izbrane različice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Član najde vse spremembe določenega kontakta v največ dveh korakih iz podrobnosti kontakta in vidi, kdo je kaj spremenil, brez branja sledi skupine; v preizkusu uporabnosti ne-tehnični uporabnik v 90 % poskusov pravilno odgovori, kdo je spremenil določeno polje.
- **SC-002**: Filter po izvajalcu skupaj z vrsto dejanja in kontaktom vrne v 100 % preizkusov natanko vnose, ki ustrezajo vsem filtrom, tudi za nekdanje in izbrisane uporabnike.
- **SC-003**: Prva stran zgodovine kontakta se pri skupini s 100.000 vnosi prikaže v manj kot 2 sekundah v 95 % odpiranj.
- **SC-004**: V 100 % preizkusov obnova enega kontakta ne spremeni nobenega drugega kontakta in nobenega obstoječega vnosa sledi, nastane natanko en nov vnos s pravim izvajalcem in časom.
- **SC-005**: Pri dveh sočasnih obnovah ali obnovi in urejanju istega kontakta uspe natanko ena; druga je zavrnjena z `409` in nič se ne spremeni (100 % ponovitev).
- **SC-006**: 100 % primerov matrike izolacije (neprijavljen, nečlan, nižje vloge, arhivirana skupina, kontakt druge skupine) vrne pričakovan odgovor; zaslon zgodovine, primerjave in dialog obnove nimajo kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px.
- **SC-007**: Uporabnik najde izbrisani kontakt in ga obnovi v največ treh korakih (odpri *Izbrisani kontakti*, poišči, obnovi) brez odpiranja sledi; seznam z 10.000 izbrisanimi kontakti prikaže prvo stran v manj kot 2 sekundah v 95 % odpiranj.
- **SC-008**: Obstoječi preizkusi sledi in rollbacka skupine (005) ter vnosov 009, 011 prehajajo brez oslabitve asercij.

## Assumptions

- Odvisnost od **005-revizijska-sled** (vnosi, spremembe, rollback; vir vse zgodovine), **004-kontakti** (podrobnosti kontakta, verzije, `VERSION_CONFLICT`), **007-clani** (nekdanji člani), **011-dvojniki** (vnosi združevanja), **012-moji-podatki** (»izbrisan uporabnik«), **013-pametni-atributi** (polji *Podjetje* in *Država*).
- Zgodovina se izpelje iz obstoječih podatkov sledi; za obstoječe vnose ni migracije podatkov. Kontaktov, ki jih sled ne pozna, ni mogoče obnoviti na stanje, ki ni zabeleženo.
- Funkcionalnost **014 (uvoz/izvoz, Patrik)** teče vzporedno: 015 ne spreminja njene veje, datotek ali pogodbe beleženja; uporabi samo obstoječe podatke sledi. Če 014 uvede novo vrsto dejanja ali migracijo, 015 deluje z njo (FR-015-18); morebitni trk številk migracij ali vrstice v feature-map §1 se razreši ob združitvi.
- Pravila prikaza izvajalca, imen in časov so enaka kot v 005; izbrisani uporabniki se ne razlikujejo med seboj.
- Obnova ne preverja vsebine znova (enako kot rollback 005): zapiše se zabeleženo stanje.
- Skupna pravila (vloge §2.1, vrstni red preverjanj §2.2, optimistično zaklepanje §2.3, arhivirana skupina §2.4, izbrisan uporabnik §2.5, slovar §2.6, nevarne operacije §2.8) veljajo brez ponavljanja.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
