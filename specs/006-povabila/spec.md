# Feature Specification: Povabila v skupino

**Feature Branch**: `povabila` (no number; the directory is `specs/006-povabila/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Dodajanje že registriranih uporabnikov v skupino po njihovem e-naslovu z vlogo (urednik, bralec, admin), ki mora biti nižja od vloge povabitelja; uporabnik dobi povabilo v aplikaciji, na katerega se lahko odzove (le admin in višje lahko vabijo); prikaz prejetih povabil; sprejem ali zavrnitev povabila."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Povabilo registriranega uporabnika v skupino (Priority: P1)

Admin ali lastnik skupine v *Nastavitvah* skupine v razdelku *Povabi člana* vpiše e-naslov že registriranega uporabnika, izbere vlogo, ki je strogo nižja od njegove lastne, in pošlje povabilo. Če povabila ni mogoče poslati (uporabnik ni registriran, je že član, že ima čakajoče povabilo, vabi sam sebe), dobi jasno napako ob polju.

**Why this priority**: Brez povabil ima skupina samo lastnika – sodelovanje v skupini (osrednja vrednost sistema) ni mogoče.

**Independent Test**: Lastnik pošlje povabilo registriranemu uporabniku z vlogo *Urednik*; povabilo obstaja in je v podatkih povabljenega. Preizkusi se tudi vsak razlog zavrnitve.

**Acceptance Scenarios**:

1. **[FR-006-01]** **Given** prijavljen admin nearhivirane skupine, **When** odpre *Nastavitve* skupine, **Then** vidi razdelek *Povabi člana* s poljem *E-naslov* in izbirnimi gumbi vlog *Urednik* in *Bralec* (brez *Admin* in *Lastnik*) ter gumbom *Pošlji povabilo*.
2. **[FR-006-01]** **Given** prijavljen lastnik nearhivirane skupine, **When** odpre *Nastavitve*, **Then** izbirni gumbi ponujajo *Admin*, *Urednik* in *Bralec*, nikoli *Lastnik*.
3. **[FR-006-01]** **Given** urednik ali bralec skupine oziroma kateri koli član arhivirane skupine, **When** odpre *Nastavitve*, **Then** razdelek *Povabi člana* ni izrisan.
4. **[FR-006-02]** **Given** lastnik skupine in registriran uporabnik `ana@primer.si`, ki ni član skupine in nima čakajočega povabila vanjo, **When** pošlje povabilo na ` Ana@Primer.si ` z vlogo *Admin*, **Then** nastane čakajoče povabilo za uporabnika `ana@primer.si` z vlogo *Admin* (e-naslov se primerja brez presledkov na robovih in ne glede na velikost črk).
5. **[FR-006-02]** **Given** admin skupine, **When** pošlje povabilo z vlogo *Admin* ali *Lastnik*, **Then** sistem vrne 403 in povabilo ne nastane.
6. **[FR-006-03]** **Given** admin skupine, **When** pošlje povabilo na e-naslov, ki ne pripada registriranemu uporabniku, **Then** sistem vrne 409 `INVITEE_NOT_REGISTERED`, ob polju *E-naslov* se pokaže napaka »Uporabnik s tem e-naslovom ni registriran.« in povabilo ne nastane.
7. **[FR-006-03]** **Given** admin skupine, **When** pošlje povabilo na e-naslov obstoječega člana skupine, **Then** sistem vrne 409 `ALREADY_MEMBER` in ob polju se pokaže »Ta uporabnik je že član skupine.«
8. **[FR-006-03]** **Given** uporabnik že ima čakajoče povabilo v to skupino, **When** admin pošlje novo povabilo na njegov e-naslov (s katero koli vlogo), **Then** sistem vrne 409 `INVITATION_ALREADY_PENDING`, ob polju se pokaže »Ta uporabnik že ima povabilo v to skupino.« in obstoječe povabilo ostane nespremenjeno.
9. **[FR-006-03]** **Given** admin skupine, **When** pošlje povabilo na svoj e-naslov, **Then** sistem vrne 409 `CANNOT_INVITE_SELF` in ob polju se pokaže »Sebe ne moreš povabiti.«
10. **[FR-006-03]** **Given** admin skupine, **When** pošlje obrazec s praznim ali neveljavnim e-naslovom ali brez izbrane vloge, **Then** sistem vrne 400 `VALIDATION_FAILED` z napako po poljih, napaka je prikazana ob ustreznem polju in povabilo ne nastane.
11. **[FR-006-04]** **Given** veljaven obrazec, **When** admin pošlje povabilo, **Then** se pokaže obvestilo o uspehu »Povabilo je poslano.«, obrazec se izprazni, fokus ostane v razdelku *Povabi člana*.

---

### User Story 2 - Pregled prejetih povabil (Priority: P1)

Prijavljen uporabnik v zgornji vrstici vidi *Povabila* s številom čakajočih povabil. Na strani *Povabila* vidi seznam prejetih povabil: skupino (jeziček v barvi skupine in naslov), kdo vabi, ponujeno vlogo in datum.

**Why this priority**: Povabilo, ki ga povabljeni ne vidi, je brez vrednosti; to je pogoj za sprejem.

**Independent Test**: Uporabnik z dvema čakajočima povabiloma vidi »Povabila (2)« in na strani oba vnosa s pravilnimi podatki; uporabnik brez povabil vidi prazno stanje.

**Acceptance Scenarios**:

1. **[FR-006-05]** **Given** uporabnik ima dve čakajoči povabili, **When** odpre stran *Povabila*, **Then** vidi obe povabili, novejše prvo, vsako z jezičkom in naslovom skupine, imenom povabitelja, ponujeno vlogo (»Admin«, »Urednik«, »Bralec«) in datumom v zapisu izbranega jezika.
2. **[FR-006-05]** **Given** uporabnik ima več kot 25 čakajočih povabil, **When** odpre stran *Povabila*, **Then** je seznam paginiran (privzeto 25 na stran, izbira 25 / 50 / 100).
3. **[FR-006-05]** **Given** uporabnik nima čakajočih povabil, **When** odpre stran *Povabila*, **Then** vidi prazno stanje »Nimaš novih povabil.«
4. **[FR-006-05]** **Given** uporabnika A in B imata vsak svoje povabilo, **When** A odpre stran *Povabila*, **Then** vidi samo svoja povabila.
5. **[FR-006-06]** **Given** uporabnik ima tri čakajoča povabila, **When** je v aplikaciji, **Then** zgornja vrstica prikazuje povezavo »Povabila (3)« z dostopnim imenom, ki vsebuje število (»Povabila, 3 nova«); pri nič povabilih je prikazano samo »Povabila« brez števila.
6. **[FR-006-06]** **Given** uporabnik je sprejel ali zavrnil povabilo, **When** se akcija uspešno konča, **Then** se število v zgornji vrstici zmanjša brez ponovnega nalaganja aplikacije.
7. **[FR-006-07]** **Given** povabitelj je medtem izbrisal račun, **When** povabljeni odpre stran *Povabila*, **Then** je kot povabitelj prikazano »izbrisan uporabnik« (design.md 8.5) in povabilo je še vedno veljavno.
8. **[FR-006-07]** **Given** skupina, v katero je uporabnik povabljen, je arhivirana, **When** odpre stran *Povabila*, **Then** je ob povabilu oznaka *Arhivirano* in razlaga »Skupina je arhivirana, povabila zdaj ne moreš sprejeti.«, gumb *Sprejmi povabilo* ni izrisan, *Zavrni* pa je na voljo.

---

### User Story 3 - Sprejem povabila (Priority: P1)

Povabljeni sprejme povabilo in postane član skupine s ponujeno vlogo; po sprejemu dobi obvestilo s povezavo »Odpri skupino«.

**Why this priority**: Sprejem je trenutek, ko uporabnik dejansko postane član – brez njega povabila ne dosežejo namena.

**Independent Test**: Uporabnik sprejme povabilo z vlogo *Urednik*; je član z vlogo *Urednik*, skupina je na njegovem seznamu skupin, povabilo izgine.

**Acceptance Scenarios**:

1. **[FR-006-08]** **Given** uporabnik ima čakajoče povabilo v nearhivirano skupino z vlogo *Urednik*, **When** klikne *Sprejmi povabilo*, **Then** postane član skupine z vlogo *Urednik*, povabilo izgine s seznama, pokaže se obvestilo »Pridružil(a) si se skupini ‹naslov›.« s povezavo »Odpri skupino«, skupina se pojavi na seznamu njegovih skupin pod ustrezno vlogo.
2. **[FR-006-08]** **Given** uporabnik je sprejel povabilo, **When** klikne »Odpri skupino«, **Then** se odpre skupina in uporabnik ima v njej pravice ponujene vloge.
3. **[FR-006-09]** **Given** uporabnik ima čakajoče povabilo v skupino, ki je bila medtem arhivirana, **When** pošlje sprejem, **Then** sistem vrne 409 `GROUP_ARCHIVED`, uporabnik ne postane član, povabilo ostane na seznamu in vmesnik pokaže sporočilo »Skupina je arhivirana, povabila zdaj ne moreš sprejeti.«

---

### User Story 4 - Zavrnitev povabila (Priority: P2)

Povabljeni povabilo zavrne; po potrditvi povabilo izgine, uporabnik ne postane član.

**Why this priority**: Uporabnik mora imeti možnost nadzora nad tem, v katerih skupinah je, a sistem deluje tudi, če povabila samo ostanejo čakajoča.

**Independent Test**: Uporabnik zavrne povabilo; povabilo ne obstaja več, uporabnik ni član, admin lahko istega uporabnika znova povabi.

**Acceptance Scenarios**:

1. **[FR-006-10]** **Given** uporabnik ima čakajoče povabilo, **When** klikne *Zavrni*, **Then** se odpre potrditveni dialog (design.md 8.11) z naslovom »Zavrnem povabilo v skupino ‹naslov›?«, fokus je na *Prekliči*, nevarni gumb je »Zavrni povabilo«.
2. **[FR-006-10]** **Given** odprt potrditveni dialog, **When** uporabnik klikne *Prekliči* ali pritisne *Esc*, **Then** se nič ne spremeni in fokus se vrne na gumb *Zavrni*.
3. **[FR-006-10]** **Given** odprt potrditveni dialog, **When** uporabnik potrdi z »Zavrni povabilo«, **Then** povabilo izgine s seznama, uporabnik ni član skupine, pokaže se obvestilo »Povabilo je zavrnjeno.«, admin skupine lahko istega uporabnika znova povabi.
4. **[FR-006-10]** **Given** povabilo v arhivirano (tudi trajno arhivirano) skupino, **When** ga uporabnik zavrne in potrdi, **Then** zavrnitev uspe in povabilo izgine.

---

### User Story 5 - Povabila, ki ne pripadajo uporabniku ali ne obstajajo več (Priority: P2)

Uporabnik se ne more odzvati na tuje povabilo, na že obdelano povabilo ali na povabilo v izbrisano skupino; obstoj tujih povabil se ne razkrije.

**Why this priority**: Varnostna meja virov, vezanih na uporabnika (konstitucija III); funkcionalnost je brez nje nevarna, a je ločeno preizkusljiva.

**Independent Test**: Uporabnik B poskusi sprejeti ali zavrniti povabilo uporabnika A in dobi 404; dvakratni sprejem istega povabila vrne 404.

**Acceptance Scenarios**:

1. **[FR-006-11]** **Given** povabilo uporabnika A, **When** uporabnik B pošlje sprejem ali zavrnitev tega povabila, **Then** sistem vrne 404, povabilo ostane nespremenjeno, B ne postane član.
2. **[FR-006-11]** **Given** uporabnik je povabilo že sprejel ali zavrnil, **When** znova pošlje sprejem ali zavrnitev (npr. v drugem zavihku), **Then** sistem vrne 404, vmesnik pokaže »Povabilo ni več na voljo.« in osveži seznam.
3. **[FR-006-12]** **Given** uporabnik ima čakajoče povabilo v skupino, ki je bila nato izbrisana (003), **When** odpre stran *Povabila* ali pošlje sprejem tega povabila, **Then** povabila ni na seznamu niti v številu v zgornji vrstici in sprejem vrne 404.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-006-02 | neprijavljen (brez / neveljaven / potekel žeton) | pošlje povabilo | 401, povabilo ne nastane |
| FR-006-02 | prijavljen nečlan skupine (tudi neobstoječa skupina) | pošlje povabilo | 404, obstoj skupine se ne razkrije |
| FR-006-02 | član z vlogo VIEWER ali EDITOR | pošlje povabilo | 403, povabilo ne nastane |
| FR-006-02 | ADMIN | ponudi vlogo ADMIN ali OWNER (»le nižjim od sebe«) | 403, povabilo ne nastane |
| FR-006-02 | OWNER | ponudi vlogo OWNER | 403, povabilo ne nastane |
| FR-006-02 | ADMIN ali OWNER arhivirane skupine; ADMIN trajno arhivirane skupine | pošlje povabilo | 409 `GROUP_ARCHIVED`, povabilo ne nastane |
| FR-006-02 | VIEWER ali EDITOR arhivirane skupine | pošlje povabilo | 403 (vloga se preveri pred stanjem skupine) |
| FR-006-03 | ADMIN ali OWNER | prazen ali neveljaven e-naslov, e-naslov daljši od 254 znakov, manjkajoča ali neznana vloga | 400 `VALIDATION_FAILED` z napako po poljih |
| FR-006-03 | ADMIN ali OWNER | vabi sam sebe | 409 `CANNOT_INVITE_SELF` |
| FR-006-03 | ADMIN ali OWNER | e-naslov ni registriran uporabnik | 409 `INVITEE_NOT_REGISTERED` |
| FR-006-03 | ADMIN ali OWNER | vabi obstoječega člana | 409 `ALREADY_MEMBER` |
| FR-006-03 | ADMIN ali OWNER | vabi uporabnika s čakajočim povabilom v isto skupino | 409 `INVITATION_ALREADY_PENDING`, obstoječe povabilo nespremenjeno |
| FR-006-05, FR-006-06 | neprijavljen | odpre seznam ali število povabil | 401 |
| FR-006-05, FR-006-06 | prijavljen uporabnik | seznam / število | vsebuje samo njegova čakajoča povabila; tuja povabila niso nikoli vrnjena |
| FR-006-08, FR-006-10 | neprijavljen | sprejme ali zavrne povabilo | 401, nič se ne spremeni |
| FR-006-11 | prijavljen uporabnik, ki ni povabljeni | sprejme ali zavrne tuje povabilo | 404, obstoj povabila se ne razkrije, nič se ne spremeni |
| FR-006-11 | povabljeni | sprejme ali zavrne že obdelano ali neobstoječe povabilo | 404 |
| FR-006-12 | povabljeni | sprejme povabilo v izbrisano skupino | 404 |
| FR-006-09 | povabljeni | sprejme povabilo v arhivirano ali trajno arhivirano skupino | 409 `GROUP_ARCHIVED`, povabilo ostane, uporabnik ni član |
| FR-006-10 | povabljeni | zavrne povabilo v arhivirano skupino | uspeh – zavrnitev je vedno dovoljena |
| FR-006-08 | povabljeni, ki je medtem že član skupine | sprejme povabilo | 409 `ALREADY_MEMBER`, povabilo se odstrani, vloga obstoječega članstva se ne spremeni |

### Edge Cases

- **Povabitelj izgubi pravico po pošiljanju** (vloga znižana, odstranjen, zapustil skupino – 007): povabilo ostane veljavno s prvotno ponujeno vlogo; kot povabitelj je še vedno prikazano njegovo ime.
- **Povabitelj izbriše račun** (012): povabilo ostane veljavno, povabitelj je prikazan kot »izbrisan uporabnik«.
- **Povabljeni izbriše račun** (012): njegova povabila se izbrišejo (pravilo 012).
- **Skupina je arhivirana po pošiljanju:** povabilo je vidno z oznako *Arhivirano*, sprejem vrne 409 `GROUP_ARCHIVED`, zavrnitev uspe; po odarhiviranju (003) je sprejem znova mogoč.
- **Skupina je izbrisana** (003): njena povabila izginejo iz seznama in števila; sprejem vrne 404.
- **Naslov ali barva skupine se spremenita po pošiljanju:** seznam povabil vedno prikazuje trenutni naslov in barvo skupine.
- **Sočasna sprejem in zavrnitev istega povabila** (dva zavihka): uspe samo prva akcija, druga vrne 404 in vmesnik osveži seznam.
- **Povabljeni je bil prej član in je skupino zapustil ali bil odstranjen** (007): lahko ga znova povabijo; po sprejemu ima ponujeno vlogo, ne prejšnje.
- **E-naslov z velikimi črkami ali presledki na robovih:** primerja se obrezan, ne glede na velikost črk.
- **Povabila ne potečejo:** čakajoče povabilo ostane, dokler se povabljeni ne odzove ali dokler skupina ali račun povabljenega ne prenehata obstajati.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-006-01**: Sistem MORA v *Nastavitvah* skupine prikazati razdelek *Povabi člana* (design.md 9.7, točka 3) s poljem *E-naslov*, izbirnimi gumbi *Vloga* in gumbom *Pošlji povabilo*; izbirni gumbi ponujajo samo vloge, strogo nižje od vloge trenutnega uporabnika (ADMIN: *Urednik*, *Bralec*; OWNER: *Admin*, *Urednik*, *Bralec*), nikoli *Lastnik*; razdelek se ne izriše članom pod ADMIN in v arhivirani skupini. *(najnižja vloga: ADMIN)*
- **FR-006-02**: Sistem MORA omogočiti, da član z vlogo ADMIN ali OWNER nearhivirane skupine ustvari čakajoče povabilo za registriranega uporabnika, določenega z e-naslovom (obrezan, primerjan ne glede na velikost črk), s ponujeno vlogo, ki je strogo nižja od povabiteljeve in ni OWNER; ponudba vloge, ki ni strogo nižja, se zavrne s 403. *(najnižja vloga: ADMIN)*
- **FR-006-03**: Sistem MORA zavrniti povabilo brez sprememb in napako prikazati ob polju *E-naslov* oziroma *Vloga*, kadar: podatki niso veljavni (`400 VALIDATION_FAILED`: prazen, neveljaven ali predolg e-naslov, manjkajoča ali neznana vloga), povabitelj vabi sam sebe (`409 CANNOT_INVITE_SELF`), e-naslov ne pripada registriranemu uporabniku (`409 INVITEE_NOT_REGISTERED`), uporabnik je že član skupine (`409 ALREADY_MEMBER`) ali za tega uporabnika in skupino že obstaja čakajoče povabilo (`409 INVITATION_ALREADY_PENDING`). *(najnižja vloga: ADMIN)*
- **FR-006-04**: Sistem MORA po uspešno poslanem povabilu prikazati obvestilo o uspehu (design.md 8.13) in izprazniti obrazec; napaka strežnika ali povezave ostane prikazana na mestu akcije. *(najnižja vloga: ADMIN)*
- **FR-006-05**: Sistem MORA prijavljenemu uporabniku na strani *Povabila* prikazati paginiran seznam (§2.6) njegovih čakajočih povabil, razvrščen od najnovejšega, z jezičkom in naslovom skupine, povabiteljem, ponujeno vlogo in datumom povabila (design.md 9.8), ter prazno stanje »Nimaš novih povabil.«, kadar povabil ni; seznam nikoli ne vsebuje tujih povabil. *(najnižja vloga: —)*
- **FR-006-06**: Sistem MORA v zgornji vrstici (ogrodje iz 001) prikazati povezavo *Povabila* na stran povabil s številom čakajočih povabil uporabnika, ki je del dostopnega imena; pri nič povabilih se število ne prikaže; po sprejemu ali zavrnitvi se število posodobi brez ponovnega nalaganja aplikacije. *(najnižja vloga: —)*
- **FR-006-07**: Sistem MORA na seznamu povabil prikazati povabitelja, ki je izbrisal račun, kot »izbrisan uporabnik« (§2.5), in pri povabilu v arhivirano skupino prikazati oznako *Arhivirano* z razlago ter ne izrisati gumba *Sprejmi povabilo*. *(najnižja vloga: —)*
- **FR-006-08**: Sistem MORA ob sprejemu čakajočega povabila v nearhivirano skupino povabljenega atomarno dodati med člane skupine s ponujeno vlogo in povabilo odstraniti ter prikazati obvestilo o uspehu s povezavo »Odpri skupino«; če je povabljeni medtem že član, vrne `409 ALREADY_MEMBER`, povabilo odstrani in obstoječe vloge ne spremeni. *(najnižja vloga: —)*
- **FR-006-09**: Sistem MORA zavrniti sprejem povabila v arhivirano ali trajno arhivirano skupino z `409 GROUP_ARCHIVED`; povabilo ostane čakajoče in vmesnik prikaže razumljivo sporočilo. *(najnižja vloga: —)*
- **FR-006-10**: Sistem MORA omogočiti zavrnitev čakajočega povabila po potrditvi v potrditvenem dialogu (design.md 8.11, fokus na *Prekliči*); po zavrnitvi se povabilo odstrani, uporabnik ne postane član in prikaže se obvestilo o uspehu; zavrnitev je dovoljena tudi za povabila v arhivirane skupine. *(najnižja vloga: —)*
- **FR-006-11**: Sistem MORA na sprejem ali zavrnitev povabila, ki ne obstaja, je že obdelano ali pripada drugemu uporabniku, odgovoriti s 404 brez razkritja obstoja in brez sprememb; vmesnik prikaže »Povabilo ni več na voljo.« in osveži seznam. *(najnižja vloga: —)*
- **FR-006-12**: Sistem MORA povabila v izbrisano skupino izključiti iz seznama in števila povabil ter njihov sprejem zavrniti s 404. *(najnižja vloga: —)*

### Key Entities *(include if feature involves data)*

- **Povabilo**: čakajoča ponudba članstva; povezuje skupino, povabljenega uporabnika (registriran uporabnik), povabitelja (član skupine ob pošiljanju; po izbrisu računa »izbrisan uporabnik«), ponujeno vlogo (ADMIN, EDITOR ali VIEWER) in čas ustvarjanja. Za par (uporabnik, skupina) obstaja največ eno čakajoče povabilo. Po sprejemu ali zavrnitvi povabilo preneha obstajati.
- **Članstvo** (opredeljeno v 002, upravljanje v 007): ob sprejemu povabila nastane članstvo povabljenega v skupini s ponujeno vlogo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin ali lastnik pošlje povabilo (vpis e-naslova, izbira vloge, pošiljanje) v manj kot 30 sekundah, brez zapuščanja *Nastavitev* skupine.
- **SC-002**: Povabljeni od prijave do članstva v skupini pride v največ treh dejanjih (odpri *Povabila*, *Sprejmi povabilo*, *Odpri skupino*).
- **SC-003**: Pri 100 % neuspešnih pošiljanj (vseh pet razlogov iz FR-006-03) je ob ustreznem polju prikazano razumljivo sporočilo v slovenščini in angleščini, brez tehničnih kod.
- **SC-004**: 100 % poskusov odziva na tuje, obdelano ali neobstoječe povabilo vrne 404 in ne spremeni nobenega članstva ali povabila (preverjeno v matriki izolacije).
- **SC-005**: Število povabil v zgornji vrstici se po sprejemu ali zavrnitvi ujema z dejanskim številom čakajočih povabil v 100 % primerov, brez ponovnega nalaganja.
- **SC-006**: Strani *Povabila* in razdelek *Povabi člana* nimata nobene kršitve WCAG 2.1 A/AA pri samodejnem preverjanju in sta uporabni pri 320 px širine.

## Assumptions

- **Odvisnosti:** 001-prijava (registrirani uporabniki, ogrodje z zgornjo vrstico, kjer je povezava *Povabila*), 002-skupine (skupine, članstva, vloge, *Nastavitve* skupine), 003-arhiviranje (arhivirane in trajno arhivirane skupine, izbris skupine – ob izbrisu skupine izginejo tudi njena povabila), 012-moji-podatki (izbris računa povabljenega izbriše njegova povabila; izbris povabitelja ga prikaže kot »izbrisan uporabnik«; izvoz vsebuje čakajoča povabila).
- **Seznam članov, spreminjanje vlog, odstranjevanje in zapuščanje** so v 007; ta funkcionalnost samo ustvari članstvo ob sprejemu.
- **Povabila ne potečejo** (zahteve tega ne določajo).
- **Povabitelj ne more preklicati** čakajočega povabila in ne vidi seznama poslanih povabil (ni v zahtevah); ob ponovnem vabljenju dobi napako `INVITATION_ALREADY_PENDING`.
- **Povabitelj ni obveščen** o sprejemu ali zavrnitvi; sprejem je viden v seznamu članov (007).
- **Razkritje registriranosti:** napaka `INVITEE_NOT_REGISTERED` adminu ali lastniku razkrije, ali je e-naslov registriran; to je sprejemljivo, ker zahteve izrecno predvidevajo vabljenje registriranih uporabnikov po e-naslovu in napako ob polju (design.md 9.7), dostop pa je omejen na ADMIN+ prijavljene člane.
- **Kode in vrstni red:** po §2.2 – 401 → 404 (nečlan skupine) → 403 (vloga pod ADMIN ali ponujena vloga ni strogo nižja) → 409 `GROUP_ARCHIVED` → 400 `VALIDATION_FAILED` → 409 poslovna pravila v vrstnem redu `CANNOT_INVITE_SELF`, `INVITEE_NOT_REGISTERED`, `ALREADY_MEMBER`, `INVITATION_ALREADY_PENDING`. Za sprejem: 401 → 404 (tuje / neobstoječe povabilo ali izbrisana skupina) → 409 `GROUP_ARCHIVED` → 409 `ALREADY_MEMBER`.
- **Povabilo ostane veljavno** tudi, če povabitelj kasneje izgubi vlogo ADMIN+ ali ni več član; ponujena vloga se ob sprejemu ne preverja ponovno glede na povabiteljevo trenutno vlogo.
- **Optimistično zaklepanje** se za povabila ne uporablja: povabilo je enkratno, drugi odziv vrne 404.
- **Osveževanje števila povabil** ob prihodu novega povabila se zgodi ob nalaganju aplikacije in ob prehodu med stranmi; sprotno potiskanje obvestil ni zahtevano.
- Potrditveni dialog za zavrnitev zahteva feature-map §2.8 in design.md 9.8 (seznam v design.md 8.11 zavrnitve povabila ne navaja – glej poročilo).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
