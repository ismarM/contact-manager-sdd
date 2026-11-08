# Feature Specification: Povabila v skupino

**Feature Branch**: `povabila` (no number; the directory is `specs/006-povabila/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Dodajanje že registriranih uporabnikov v skupino po njihovem e-naslovu z vlogo (urednik, bralec, admin), ki mora biti nižja od vloge povabitelja; uporabnik dobi povabilo v aplikaciji, na katerega se lahko odzove (le admin in višje lahko vabijo); prikaz prejetih povabil; sprejem ali zavrnitev povabila."

## Clarifications

### Session 2026-11-08

- Navodilo razvijalca: povabilo v arhivirano skupino je mogoče sprejeti in zavrniti; v arhivirani skupini ni mogoče le poslati novega povabila.
- Navodilo razvijalca: zavrnitev povabila zahteva potrditveni dialog.
- Navodilo razvijalca: nova zmožnost – admin in lastnik vidita vsa čakajoča (poslana) povabila skupine in jih lahko umakneta; povabilo z vlogo *Admin* lahko umakne samo lastnik.
- Navodilo razvijalca: povabilo ostane veljavno, če je povabitelj znižan ali odstranjen iz skupine.
- Navodilo razvijalca: ob izbrisu računa povabitelja poslana povabila ostanejo s povabiteljem »izbrisan uporabnik«, prejeta povabila izbrisanega uporabnika pa se izbrišejo.
- Navodilo razvijalca: izvoz mojih podatkov (012) vsebuje prejeta in poslana povabila.
- Q: Ali sprejem povabila velja tudi za trajno arhivirano skupino? → A: Da, enako pravilo kot za arhivirano skupino.
- Q: Ali lahko admin ali lastnik v arhivirani skupini umakne čakajoče povabilo? → A: Da, umik je dovoljen; blokirano je samo pošiljanje novih povabil.
- Q: Kje je prikazan seznam poslanih povabil skupine? → A: V *Nastavitvah* skupine, v razdelku *Čakajoča povabila* takoj pod *Povabi člana*.
- Q: Ali umik povabila zahteva potrditveni dialog? → A: Da, enako kot zavrnitev.
- Q: Katere podatke o povabljenem vsebuje poslano povabilo v izvozu? → A: Naslov skupine, ponujeno vlogo, datum in e-naslov povabljenega; drugih podatkov povabljenega ne.
- Izraz: dejanje admina oziroma lastnika se imenuje **umik povabila** (*Umakni povabilo*), da se ne meša z gumbom *Prekliči* v dialogu.

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
11. **[FR-006-04]** **Given** veljaven obrazec, **When** admin pošlje povabilo, **Then** se pokaže obvestilo o uspehu »Povabilo je poslano.«, obrazec se izprazni, fokus ostane v razdelku *Povabi člana*, novo povabilo pa se pojavi na vrhu seznama *Čakajoča povabila*.

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
8. **[FR-006-07]** **Given** skupina, v katero je uporabnik povabljen, je arhivirana ali trajno arhivirana, **When** odpre stran *Povabila*, **Then** je ob povabilu oznaka *Arhivirano* in razlaga »Skupina je arhivirana – po sprejemu jo boš lahko le pregledoval(a).«, na voljo pa sta *Sprejmi povabilo* in *Zavrni*.

---

### User Story 3 - Sprejem povabila (Priority: P1)

Povabljeni sprejme povabilo in postane član skupine s ponujeno vlogo; po sprejemu dobi obvestilo s povezavo »Odpri skupino«. Sprejem je mogoč tudi v arhivirano skupino.

**Why this priority**: Sprejem je trenutek, ko uporabnik dejansko postane član – brez njega povabila ne dosežejo namena.

**Independent Test**: Uporabnik sprejme povabilo z vlogo *Urednik*; je član z vlogo *Urednik*, skupina je na njegovem seznamu skupin, povabilo izgine.

**Acceptance Scenarios**:

1. **[FR-006-08]** **Given** uporabnik ima čakajoče povabilo v nearhivirano skupino z vlogo *Urednik*, **When** klikne *Sprejmi povabilo*, **Then** postane član skupine z vlogo *Urednik*, povabilo izgine s seznama, pokaže se obvestilo »Pridružil(a) si se skupini ‹naslov›.« s povezavo »Odpri skupino«, skupina se pojavi na seznamu njegovih skupin pod ustrezno vlogo.
2. **[FR-006-08]** **Given** uporabnik je sprejel povabilo, **When** klikne »Odpri skupino«, **Then** se odpre skupina in uporabnik ima v njej pravice ponujene vloge.
3. **[FR-006-09]** **Given** uporabnik ima čakajoče povabilo z vlogo *Urednik* v skupino, ki je bila medtem arhivirana (ali trajno arhivirana), **When** klikne *Sprejmi povabilo*, **Then** postane član z vlogo *Urednik*, povabilo izgine, pokaže se obvestilo s povezavo »Odpri skupino«, skupina se pojavi na seznamu *Arhivirane skupine* in v njej ima uporabnik efektivno pravice bralca (feature-map §2.4).
4. **[FR-006-09]** **Given** uporabnik je sprejel povabilo z vlogo *Urednik* v arhivirano skupino, **When** lastnik skupino odarhivira (003), **Then** ima uporabnik v skupini pravice urednika.

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

Uporabnik se ne more odzvati na tuje povabilo, na že obdelano ali umaknjeno povabilo ali na povabilo v izbrisano skupino; obstoj tujih povabil se ne razkrije.

**Why this priority**: Varnostna meja virov, vezanih na uporabnika (konstitucija III); funkcionalnost je brez nje nevarna, a je ločeno preizkusljiva.

**Independent Test**: Uporabnik B poskusi sprejeti ali zavrniti povabilo uporabnika A in dobi 404; dvakratni sprejem istega povabila vrne 404.

**Acceptance Scenarios**:

1. **[FR-006-11]** **Given** povabilo uporabnika A, **When** uporabnik B pošlje sprejem ali zavrnitev tega povabila, **Then** sistem vrne 404, povabilo ostane nespremenjeno, B ne postane član.
2. **[FR-006-11]** **Given** uporabnik je povabilo že sprejel ali zavrnil, **When** znova pošlje sprejem ali zavrnitev (npr. v drugem zavihku), **Then** sistem vrne 404, vmesnik pokaže »Povabilo ni več na voljo.« in osveži seznam.
3. **[FR-006-11]** **Given** admin je povabilo umaknil, medtem ko ga ima povabljeni odprtega na strani *Povabila*, **When** povabljeni klikne *Sprejmi povabilo* ali potrdi zavrnitev, **Then** sistem vrne 404, uporabnik ne postane član, vmesnik pokaže »Povabilo ni več na voljo.« in osveži seznam ter število v zgornji vrstici.
4. **[FR-006-12]** **Given** uporabnik ima čakajoče povabilo v skupino, ki je bila nato izbrisana (003), **When** odpre stran *Povabila* ali pošlje sprejem tega povabila, **Then** povabila ni na seznamu niti v številu v zgornji vrstici in sprejem vrne 404.

---

### User Story 6 - Pregled in umik poslanih povabil skupine (Priority: P2)

Admin in lastnik v *Nastavitvah* skupine v razdelku *Čakajoča povabila* vidita vsa čakajoča povabila skupine (ne glede na to, kdo jih je poslal) in jih lahko umakneta. Povabilo z vlogo *Admin* lahko umakne samo lastnik.

**Why this priority**: Brez umika napačno poslanega povabila (npr. napačna vloga) povabitelj nima popravka; sistem pa deluje tudi brez tega, ker se povabljeni lahko odzove.

**Independent Test**: Lastnik in admin vidita isti seznam čakajočih povabil skupine; admin umakne povabilo z vlogo *Urednik*, ne more pa umakniti povabila z vlogo *Admin*; lastnik umakne povabilo z vlogo *Admin*; umaknjenega povabila povabljeni ne vidi več.

**Acceptance Scenarios**:

1. **[FR-006-13]** **Given** skupina ima tri čakajoča povabila, ki sta jih poslala lastnik in admin, **When** admin ali lastnik odpre *Nastavitve* skupine, **Then** takoj pod *Povabi člana* vidi razdelek *Čakajoča povabila* s preglednico *Povabljeni · Vloga · Povabil(a) · Datum · Dejanja* z vsemi tremi povabili, novejše prvo; *Povabljeni* je e-naslov povabljenega, *Povabil(a)* ime povabitelja.
2. **[FR-006-13]** **Given** skupina ima več kot 25 čakajočih povabil, **When** admin odpre *Čakajoča povabila*, **Then** je seznam paginiran (privzeto 25 na stran, izbira 25 / 50 / 100).
3. **[FR-006-13]** **Given** skupina nima čakajočih povabil, **When** admin odpre *Nastavitve*, **Then** razdelek *Čakajoča povabila* prikazuje prazno stanje »Ni čakajočih povabil.«
4. **[FR-006-13]** **Given** urednik ali bralec skupine, **When** odpre *Nastavitve*, **Then** razdelek *Čakajoča povabila* ni izrisan, zahtevek za seznam pa vrne 403.
5. **[FR-006-13]** **Given** povabitelj je bil medtem znižan v urednika, odstranjen iz skupine ali je izbrisal račun, **When** admin odpre *Čakajoča povabila*, **Then** je povabilo še vedno na seznamu; pri znižanem ali odstranjenem povabitelju je prikazano njegovo ime, pri izbrisanem »izbrisan uporabnik«.
6. **[FR-006-13]** **Given** arhivirana ali trajno arhivirana skupina s čakajočimi povabili, **When** admin ali lastnik odpre *Nastavitve*, **Then** razdelek *Povabi člana* ni izrisan, *Čakajoča povabila* pa je izrisan s povabili.
7. **[FR-006-14]** **Given** admin skupine in čakajoči povabili z vlogama *Urednik* in *Admin*, **When** si ogleda *Čakajoča povabila*, **Then** ima pri povabilu z vlogo *Urednik* gumb *Umakni povabilo*, pri povabilu z vlogo *Admin* pa gumba ni; zahtevek za umik povabila z vlogo *Admin* vrne 403 in povabilo ostane.
8. **[FR-006-14]** **Given** lastnik skupine, **When** si ogleda *Čakajoča povabila*, **Then** ima *Umakni povabilo* pri vseh povabilih (*Admin*, *Urednik*, *Bralec*), ne glede na povabitelja.
9. **[FR-006-14]** **Given** admin skupine in povabilo z vlogo *Bralec*, ki ga je poslal lastnik, **When** ga umakne in potrdi, **Then** umik uspe.
10. **[FR-006-15]** **Given** admin klikne *Umakni povabilo*, **When** se odpre potrditveni dialog (design.md 8.11), **Then** ima naslov »Umaknem povabilo za ‹e-naslov›?«, besedilo »Uporabnik povabila ne bo več videl. Lahko ga znova povabiš.«, fokus je na *Prekliči*, nevarni gumb je »Umakni povabilo«; *Prekliči* ali *Esc* ne spremeni ničesar in vrne fokus na sprožilni gumb.
11. **[FR-006-15]** **Given** odprt potrditveni dialog, **When** admin potrdi z »Umakni povabilo«, **Then** povabilo izgine s seznama, pokaže se obvestilo »Povabilo je umaknjeno.«, povabljeni ga ne vidi več na strani *Povabila* niti v številu v zgornji vrstici, istega uporabnika je mogoče znova povabiti.
12. **[FR-006-15]** **Given** arhivirana ali trajno arhivirana skupina, **When** admin umakne povabilo z vlogo *Urednik* in potrdi, **Then** umik uspe.
13. **[FR-006-16]** **Given** povabilo je bilo medtem sprejeto, zavrnjeno ali umaknjeno (npr. v drugem zavihku), **When** admin potrdi umik, **Then** sistem vrne 404, vmesnik pokaže »Povabilo ni več na voljo.« in osveži seznam *Čakajoča povabila*.

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
| FR-006-11 | povabljeni | sprejme ali zavrne že obdelano, umaknjeno ali neobstoječe povabilo | 404 |
| FR-006-12 | povabljeni | sprejme povabilo v izbrisano skupino | 404 |
| FR-006-09 | povabljeni | sprejme povabilo v arhivirano ali trajno arhivirano skupino | uspeh – postane član s ponujeno vlogo (efektivno bralec, §2.4) |
| FR-006-10 | povabljeni | zavrne povabilo v arhivirano ali trajno arhivirano skupino | uspeh – zavrnitev je vedno dovoljena |
| FR-006-08 | povabljeni, ki je medtem že član skupine | sprejme povabilo | 409 `ALREADY_MEMBER`, povabilo se odstrani, vloga obstoječega članstva se ne spremeni |
| FR-006-13, FR-006-14 | neprijavljen | odpre seznam poslanih povabil skupine ali umakne povabilo | 401, nič se ne spremeni |
| FR-006-13, FR-006-14 | prijavljen nečlan skupine (tudi neobstoječa skupina) | odpre seznam ali umakne povabilo | 404, obstoj skupine se ne razkrije |
| FR-006-13, FR-006-14 | član z vlogo VIEWER ali EDITOR (tudi v arhivirani skupini) | odpre seznam ali umakne povabilo | 403, nič se ne spremeni |
| FR-006-14 | ADMIN | umakne povabilo z vlogo ADMIN | 403, povabilo ostane |
| FR-006-14 | ADMIN ali OWNER arhivirane skupine; ADMIN trajno arhivirane skupine | odpre seznam / umakne povabilo z vlogo pod svojo | 2xx – umik v arhivirani skupini je dovoljen |
| FR-006-16 | ADMIN ali OWNER | umakne povabilo druge skupine, že obdelano, umaknjeno ali neobstoječe povabilo | 404, nič se ne spremeni |

### Edge Cases

- **Povabitelj izgubi pravico po pošiljanju** (vloga znižana, odstranjen, zapustil skupino – 007): povabilo ostane veljavno s prvotno ponujeno vlogo; kot povabitelj je še vedno prikazano njegovo ime (na strani *Povabila* in v *Čakajočih povabilih*).
- **Povabitelj izbriše račun** (012): poslana povabila ostanejo veljavna, povabitelj je povsod prikazan kot »izbrisan uporabnik«.
- **Povabljeni izbriše račun** (012): njegova prejeta povabila se izbrišejo in izginejo iz *Čakajočih povabil* skupin.
- **Skupina je arhivirana po pošiljanju:** povabilo je vidno z oznako *Arhivirano*; sprejem in zavrnitev uspeta; admin in lastnik ga lahko umakneta; novih povabil ni mogoče poslati, dokler skupina ni odarhivirana (003).
- **Trajno arhivirana skupina** (brez lastnika): sprejem, zavrnitev in umik veljajo kot pri arhivirani skupini; povabil z vlogo *Admin* ne more umakniti nihče, ker skupina nima lastnika – ostanejo, dokler se povabljeni ne odzove.
- **Skupina je izbrisana** (003): njena povabila izginejo iz seznama in števila; sprejem vrne 404.
- **Naslov ali barva skupine se spremenita po pošiljanju:** seznam povabil vedno prikazuje trenutni naslov in barvo skupine.
- **Sočasna sprejem in zavrnitev istega povabila** (dva zavihka): uspe samo prva akcija, druga vrne 404 in vmesnik osveži seznam.
- **Sočasna umik in odziv povabljenega:** uspe samo prva akcija; druga vrne 404 (»Povabilo ni več na voljo.«) in vmesnik osveži ustrezni seznam.
- **Povabljeni je bil prej član in je skupino zapustil ali bil odstranjen** (007): lahko ga znova povabijo; po sprejemu ima ponujeno vlogo, ne prejšnje.
- **Ponovno vabljenje po umiku:** po umiku je istega uporabnika mogoče znova povabiti s katero koli dovoljeno vlogo.
- **E-naslov z velikimi črkami ali presledki na robovih:** primerja se obrezan, ne glede na velikost črk.
- **Povabila ne potečejo:** čakajoče povabilo ostane, dokler se povabljeni ne odzove, ga admin ali lastnik ne umakne ali dokler skupina ali račun povabljenega ne prenehata obstajati.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-006-01**: Sistem MORA v *Nastavitvah* skupine prikazati razdelek *Povabi člana* (design.md 9.7, točka 3) s poljem *E-naslov*, izbirnimi gumbi *Vloga* in gumbom *Pošlji povabilo*; izbirni gumbi ponujajo samo vloge, strogo nižje od vloge trenutnega uporabnika (ADMIN: *Urednik*, *Bralec*; OWNER: *Admin*, *Urednik*, *Bralec*), nikoli *Lastnik*; razdelek se ne izriše članom pod ADMIN in v arhivirani skupini. *(najnižja vloga: ADMIN)*
- **FR-006-02**: Sistem MORA omogočiti, da član z vlogo ADMIN ali OWNER nearhivirane skupine ustvari čakajoče povabilo za registriranega uporabnika, določenega z e-naslovom (obrezan, primerjan ne glede na velikost črk), s ponujeno vlogo, ki je strogo nižja od povabiteljeve in ni OWNER; ponudba vloge, ki ni strogo nižja, se zavrne s 403; pošiljanje v arhivirani ali trajno arhivirani skupini se zavrne z `409 GROUP_ARCHIVED`. *(najnižja vloga: ADMIN)*
- **FR-006-03**: Sistem MORA zavrniti povabilo brez sprememb in napako prikazati ob polju *E-naslov* oziroma *Vloga*, kadar: podatki niso veljavni (`400 VALIDATION_FAILED`: prazen, neveljaven ali predolg e-naslov, manjkajoča ali neznana vloga), povabitelj vabi sam sebe (`409 CANNOT_INVITE_SELF`), e-naslov ne pripada registriranemu uporabniku (`409 INVITEE_NOT_REGISTERED`), uporabnik je že član skupine (`409 ALREADY_MEMBER`) ali za tega uporabnika in skupino že obstaja čakajoče povabilo (`409 INVITATION_ALREADY_PENDING`). *(najnižja vloga: ADMIN)*
- **FR-006-04**: Sistem MORA po uspešno poslanem povabilu prikazati obvestilo o uspehu (design.md 8.13), izprazniti obrazec in novo povabilo prikazati v razdelku *Čakajoča povabila*; napaka strežnika ali povezave ostane prikazana na mestu akcije. *(najnižja vloga: ADMIN)*
- **FR-006-05**: Sistem MORA prijavljenemu uporabniku na strani *Povabila* prikazati paginiran seznam (§2.6) njegovih čakajočih povabil, razvrščen od najnovejšega, z jezičkom in naslovom skupine, povabiteljem, ponujeno vlogo in datumom povabila (design.md 9.8), ter prazno stanje »Nimaš novih povabil.«, kadar povabil ni; seznam nikoli ne vsebuje tujih povabil. *(najnižja vloga: —)*
- **FR-006-06**: Sistem MORA v zgornji vrstici (ogrodje iz 001) prikazati povezavo *Povabila* na stran povabil s številom čakajočih povabil uporabnika, ki je del dostopnega imena; pri nič povabilih se število ne prikaže; po sprejemu ali zavrnitvi se število posodobi brez ponovnega nalaganja aplikacije. *(najnižja vloga: —)*
- **FR-006-07**: Sistem MORA na seznamu povabil prikazati povabitelja, ki je izbrisal račun, kot »izbrisan uporabnik« (§2.5), in pri povabilu v arhivirano ali trajno arhivirano skupino prikazati oznako *Arhivirano* z razlago, da bo uporabnik po sprejemu skupino lahko le pregledoval; gumba *Sprejmi povabilo* in *Zavrni* sta izrisana. *(najnižja vloga: —)*
- **FR-006-08**: Sistem MORA ob sprejemu čakajočega povabila povabljenega atomarno dodati med člane skupine s ponujeno vlogo in povabilo odstraniti ter prikazati obvestilo o uspehu s povezavo »Odpri skupino«; če je povabljeni medtem že član, vrne `409 ALREADY_MEMBER`, povabilo odstrani in obstoječe vloge ne spremeni. *(najnižja vloga: —)*
- **FR-006-09**: Sistem MORA dovoliti sprejem povabila tudi v arhivirano ali trajno arhivirano skupino: povabljeni postane član s ponujeno vlogo, a ima, dokler je skupina arhivirana, efektivno pravice bralca (feature-map §2.4); skupina se mu prikaže na seznamu *Arhivirane skupine*; po odarhiviranju (003) veljajo pravice ponujene vloge. *(najnižja vloga: —)*
- **FR-006-10**: Sistem MORA omogočiti zavrnitev čakajočega povabila po potrditvi v potrditvenem dialogu (design.md 8.11, fokus na *Prekliči*); po zavrnitvi se povabilo odstrani, uporabnik ne postane član in prikaže se obvestilo o uspehu; zavrnitev je dovoljena tudi za povabila v arhivirane in trajno arhivirane skupine. *(najnižja vloga: —)*
- **FR-006-11**: Sistem MORA na sprejem ali zavrnitev povabila, ki ne obstaja, je že obdelano, umaknjeno ali pripada drugemu uporabniku, odgovoriti s 404 brez razkritja obstoja in brez sprememb; vmesnik prikaže »Povabilo ni več na voljo.« in osveži seznam ter število povabil. *(najnižja vloga: —)*
- **FR-006-12**: Sistem MORA povabila v izbrisano skupino izključiti iz seznama in števila povabil ter njihov sprejem zavrniti s 404. *(najnižja vloga: —)*
- **FR-006-13**: Sistem MORA članu z vlogo ADMIN ali OWNER v *Nastavitvah* skupine takoj pod razdelkom *Povabi člana* prikazati razdelek *Čakajoča povabila* s paginiranim seznamom (§2.6) vseh čakajočih povabil skupine ne glede na povabitelja, razvrščenim od najnovejšega, s stolpci *Povabljeni* (e-naslov), *Vloga*, *Povabil(a)* (ime povabitelja, tudi če ni več član ali ni več ADMIN+; »izbrisan uporabnik« po §2.5), *Datum* in *Dejanja*, ter prazno stanje »Ni čakajočih povabil.«; razdelek je izrisan tudi v arhivirani in trajno arhivirani skupini; članom pod ADMIN se ne izriše, zahtevek za seznam pa vrne 403. *(najnižja vloga: ADMIN)*
- **FR-006-14**: Sistem MORA omogočiti umik čakajočega povabila skupine: OWNER sme umakniti vsako povabilo, ADMIN samo povabila s ponujeno vlogo, strogo nižjo od ADMIN (EDITOR, VIEWER), ne glede na povabitelja; umik povabila z vlogo ADMIN s strani ADMIN se zavrne s 403, gumb *Umakni povabilo* pa se pri takem povabilu ne izriše; umik je dovoljen tudi v arhivirani in trajno arhivirani skupini. *(najnižja vloga: ADMIN)*
- **FR-006-15**: Sistem MORA umik izvesti šele po potrditvi v potrditvenem dialogu (design.md 8.11, fokus na *Prekliči*, nevarni gumb »Umakni povabilo«); po umiku se povabilo odstrani (povabljeni ga ne vidi več na seznamu niti v številu povabil), prikaže se obvestilo o uspehu »Povabilo je umaknjeno.« in istega uporabnika je mogoče znova povabiti. *(najnižja vloga: ADMIN)*
- **FR-006-16**: Sistem MORA na umik povabila, ki ne obstaja, je že sprejeto, zavrnjeno ali umaknjeno ali pripada drugi skupini, odgovoriti s 404 brez sprememb; vmesnik prikaže »Povabilo ni več na voljo.« in osveži seznam *Čakajoča povabila*. *(najnižja vloga: ADMIN)*

### Key Entities *(include if feature involves data)*

- **Povabilo**: čakajoča ponudba članstva; povezuje skupino, povabljenega uporabnika (registriran uporabnik), povabitelja (član skupine z vlogo ADMIN+ ob pošiljanju; ostane povabitelj tudi po znižanju ali odstranitvi; po izbrisu računa »izbrisan uporabnik«), ponujeno vlogo (ADMIN, EDITOR ali VIEWER) in čas ustvarjanja. Za par (uporabnik, skupina) obstaja največ eno čakajoče povabilo. Po sprejemu, zavrnitvi ali umiku povabilo preneha obstajati. Izbris računa povabljenega izbriše njegova povabila; izbris računa povabitelja jih ohrani.
- **Članstvo** (opredeljeno v 002, upravljanje v 007): ob sprejemu povabila nastane članstvo povabljenega v skupini s ponujeno vlogo (tudi v arhivirani skupini).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin ali lastnik pošlje povabilo (vpis e-naslova, izbira vloge, pošiljanje) v manj kot 30 sekundah, brez zapuščanja *Nastavitev* skupine.
- **SC-002**: Povabljeni od prijave do članstva v skupini pride v največ treh dejanjih (odpri *Povabila*, *Sprejmi povabilo*, *Odpri skupino*).
- **SC-003**: Pri 100 % neuspešnih pošiljanj (vseh pet razlogov iz FR-006-03) je ob ustreznem polju prikazano razumljivo sporočilo v slovenščini in angleščini, brez tehničnih kod.
- **SC-004**: 100 % poskusov odziva na tuje, obdelano, umaknjeno ali neobstoječe povabilo ter umika povabila druge skupine ali že obdelanega povabila vrne 404 in ne spremeni nobenega članstva ali povabila (preverjeno v matriki izolacije).
- **SC-005**: Število povabil v zgornji vrstici se po sprejemu ali zavrnitvi ujema z dejanskim številom čakajočih povabil v 100 % primerov, brez ponovnega nalaganja.
- **SC-006**: Strani *Povabila* ter razdelka *Povabi člana* in *Čakajoča povabila* nimajo nobene kršitve WCAG 2.1 A/AA pri samodejnem preverjanju in so uporabni pri 320 px širine.
- **SC-007**: Admin ali lastnik umakne napačno poslano povabilo v največ dveh dejanjih (*Umakni povabilo*, potrditev), brez zapuščanja *Nastavitev* skupine.

## Assumptions

- **Odvisnosti:** 001-prijava (registrirani uporabniki, ogrodje z zgornjo vrstico, kjer je povezava *Povabila*), 002-skupine (skupine, članstva, vloge, *Nastavitve* skupine), 003-arhiviranje (arhivirane in trajno arhivirane skupine, odarhiviranje, izbris skupine – ob izbrisu skupine izginejo tudi njena povabila), 012-moji-podatki (izbris računa povabljenega izbriše njegova prejeta povabila; izbris povabitelja ohrani poslana povabila in ga prikaže kot »izbrisan uporabnik«; izvoz vsebuje čakajoča prejeta povabila in čakajoča poslana povabila – pri poslanih naslov skupine, ponujena vloga, datum in e-naslov povabljenega).
- **Seznam članov, spreminjanje vlog, odstranjevanje in zapuščanje** so v 007; ta funkcionalnost samo ustvari članstvo ob sprejemu.
- **Povabila ne potečejo** (zahteve tega ne določajo).
- **Umik povabila** je dodatna zmožnost, ki je zahteve (zahteve-raw) ne navajajo; dodal jo je razvijalec (Clarifications 2026-11-08). Pravilo za umik sledi »le nižjim od sebe« (feature-map §2.1) glede na **ponujeno** vlogo, ne glede na povabitelja.
- **Arhivirana skupina:** pošiljanje povabil je pisanje v skupino (`409 GROUP_ARCHIVED`, feature-map §2.4); sprejem, zavrnitev in umik so izjeme od §2.4 in so dovoljeni (Clarifications 2026-11-08).
- **Razdelek *Povabi člana* v arhivirani skupini** se ne izriše brez nadomestne razlage: stanje in razlog (»na voljo so pregled, iskanje in izvoz«) že pove pasica arhivirane skupine (003, FR-003-05), *Čakajoča povabila* pa ostanejo vidna (FR-006-13).
- **Povabitelj ni obveščen** o sprejemu, zavrnitvi ali umiku; sprejem je viden v seznamu članov (007), odziv pa kot izginotje povabila iz *Čakajočih povabil*.
- **Povabljeni ni obveščen o umiku**; povabilo samo izgine s strani *Povabila* in iz števila (ob naslednjem nalaganju ali ob neuspelem odzivu, FR-006-11).
- **Razkritje registriranosti:** napaka `INVITEE_NOT_REGISTERED` adminu ali lastniku razkrije, ali je e-naslov registriran; to je sprejemljivo, ker zahteve izrecno predvidevajo vabljenje registriranih uporabnikov po e-naslovu in napako ob polju (design.md 9.7), dostop pa je omejen na ADMIN+ prijavljene člane. Iz istega razloga *Čakajoča povabila* adminom prikažejo e-naslov povabljenega.
- **Kode in vrstni red:** po §2.2. Pošiljanje: 401 → 404 (nečlan skupine) → 403 (vloga pod ADMIN ali ponujena vloga ni strogo nižja) → 409 `GROUP_ARCHIVED` → 400 `VALIDATION_FAILED` → 409 poslovna pravila v vrstnem redu `CANNOT_INVITE_SELF`, `INVITEE_NOT_REGISTERED`, `ALREADY_MEMBER`, `INVITATION_ALREADY_PENDING`. Sprejem: 401 → 404 (tuje / neobstoječe / umaknjeno povabilo ali izbrisana skupina) → 409 `ALREADY_MEMBER`. Zavrnitev: 401 → 404. Seznam poslanih povabil: 401 → 404 (nečlan) → 403 (vloga pod ADMIN). Umik: 401 → 404 (nečlan skupine) → 403 (vloga pod ADMIN) → 404 (povabilo ne obstaja v tej skupini ali ni več čakajoče) → 403 (ADMIN umika povabilo z vlogo ADMIN).
- **Povabilo ostane veljavno** tudi, če povabitelj kasneje izgubi vlogo ADMIN+ ali ni več član; ponujena vloga se ob sprejemu ne preverja ponovno glede na povabiteljevo trenutno vlogo.
- **Optimistično zaklepanje** se za povabila ne uporablja: povabilo je enkratno, drugi odziv ali umik vrne 404.
- **Osveževanje števila povabil** ob prihodu novega ali umiku obstoječega povabila se zgodi ob nalaganju aplikacije in ob prehodu med stranmi; sprotno potiskanje obvestil ni zahtevano.
- Potrditveni dialog za zavrnitev zahteva feature-map §2.8 in design.md 9.8 (seznam v design.md 8.11 zavrnitve povabila ne navaja); potrditveni dialog za umik zahteva ta specifikacija (Clarifications 2026-11-08) in je dodan v feature-map §2.8.
- **Revizijska sled (005, FR-005-06):** ustvarjanje, sprejem, zavrnitev in umik povabil ne ustvarijo vnosa v `audit_entry`; testi te funkcionalnosti morajo preveriti, da ostane `audit_entry` skupine nespremenjen.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb (pojasnila 2026-11-08 so bila vnesena pred planom, zato niso CR) | – |
