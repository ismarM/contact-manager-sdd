# Feature Specification: Prijava, ogrodje aplikacije in Moj račun

**Feature Branch**: `prijava` (no number; the directory is `specs/001-prijava/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Registracija in prijava prek Firebase z Googlovim ponudnikom ter odjava; registracija se zgodi ob prvi prijavi. Zaščitene poti, ogrodje aplikacije (zgornja vrstica, meni računa, Preskoči na vsebino), stran za neobstoječe poti in Moj račun – razdelka Profil in Videz (jezik sl/en, tema sistemska/svetla/temna)."

## Clarifications

### Session 2026-11-04

Popravka razvijalca: (1) izbira jezika in teme mora ostati tudi ob prijavi na drugi napravi (trajna zunaj seje in naprave); (2) po odjavi v enem zavihku mora biti drugi zavihek odjavljen ne le ob prvi navigaciji, temveč že ob prvi interakciji, ki pošlje zahtevek, ki zahteva prijavo.

- Q: Shranjevanje jezika in teme v profil nasprotuje konstituciji VI in design.md 4.3 (samo v brskalniku) – ali ju spremenimo? → A: Da; konstitucija 1.1.0, design.md 4.3 in vnos D-19 v DECISIONS.md.
- Q: Kaj velja ob prijavi, če se izbira v profilu razlikuje od izbire na napravi? → A: Velja izbira iz profila; le če profil izbire še nima, se vanj shrani trenutna izrecna izbira naprave (FR-001-19).
- Q: Kaj se zgodi, če shranjevanje izbire v profil ne uspe (brez povezave, napaka zaledja)? → A: Izbira ostane uveljavljena na napravi, prikaže se sporočilo o napaki, profil obdrži prejšnjo vrednost, brez samodejnega ponovnega poskusa (FR-001-19).
- Q: Kaj naredi zavihek, ko uporabnik, odjavljen v drugem zavihku, sproži dejanje z zahtevkom, ki zahteva prijavo? → A: Zahtevek ničesar ne spremeni; preusmeritev na prijavo s sporočilom o poteku seje (FR-001-10) in po prijavi vrnitev na isto pot.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prva prijava z Googlom ustvari račun (Priority: P1)

Nov uporabnik odpre aplikacijo, na strani za prijavo klikne *Prijava z Googlom*, izbere svoj Google račun in je
prijavljen. Ob prvi prijavi aplikacija samodejno ustvari njegov profil z imenom in e-naslovom iz Google računa;
gesla aplikacija nima.

**Why this priority**: brez identitete ne deluje nobena druga funkcionalnost (vse so vezane na prijavljenega uporabnika).

**Independent Test**: z Firebase Auth Emulatorjem se nov uporabnik prijavi; po prijavi je na začetni strani,
zaledje pa ima njegov profil z imenom in e-naslovom.

**Acceptance Scenarios**:

1. **[FR-001-01]** **Given** neprijavljen obiskovalec, **When** odpre stran za prijavo, **Then** vidi kartico po design.md 9.1 z gumbom »Prijava z Googlom« / "Sign in with Google" in brez polj za uporabniško ime ali geslo.
2. **[FR-001-02]** **Given** Google račun, ki se v aplikaciji še ni prijavil, **When** se uporabnik uspešno prijavi z Googlom, **Then** se ustvari natanko en profil z imenom in e-naslovom iz Google računa, uporabnik pa je preusmerjen na začetno stran aplikacije.
3. **[FR-001-03]** **Given** obstoječ profil, katerega ime ali e-naslov se je v Google računu medtem spremenil, **When** se uporabnik znova prijavi, **Then** se ime in e-naslov v profilu posodobita na vrednosti iz Googla, nov profil se ne ustvari.
4. **[FR-001-03]** **Given** nov uporabnik se prijavi hkrati v dveh zavihkih, **When** obe prijavi uspeta, **Then** obstaja natanko en profil.
5. **[FR-001-04]** **Given** stran za prijavo, **When** uporabnik zapre Googlovo okno brez prijave, prijava ne uspe zaradi omrežja ali zaledje profila ne more ustvariti, **Then** kartica prikaže razumljivo sporočilo napake (`role="alert"`, design.md 8.13), uporabnik ostane neprijavljen na strani za prijavo in lahko poskusi znova.
6. **[FR-001-05]** **Given** prijavljen uporabnik, **When** odpre stran za prijavo, **Then** je preusmerjen na začetno stran aplikacije.

---

### User Story 2 - Zaščitene poti in zaledje (Priority: P1)

Vse strani aplikacije razen strani za prijavo so dostopne samo prijavljenim. Kdor odpre zaščiteno povezavo brez
prijave, se najprej prijavi in nato pride točno tja, kamor je hotel. Zaledje zavrne vsak zahtevek brez veljavne prijave.

**Why this priority**: osnova varnostnega modela (konstitucija III) – brez tega izolacija skupin nima smisla.

**Independent Test**: neprijavljen obiskovalec odpre `/<zaščitena pot>?x=1`, je preusmerjen na prijavo in se po
prijavi vrne na isto pot s parametri; zahtevki na API brez žetona, z neveljavnim ali s poteklim žetonom vrnejo `401`.

**Acceptance Scenarios**:

1. **[FR-001-06]** **Given** neprijavljen obiskovalec, **When** odpre katerokoli pot razen strani za prijavo (tudi neobstoječo), **Then** je preusmerjen na stran za prijavo, vsebina zaščitene strani se ne izriše niti za trenutek.
2. **[FR-001-06]** **Given** obiskovalec, preusmerjen s poti `/a/b?c=1`, **When** se uspešno prijavi, **Then** je preusmerjen na `/a/b?c=1`; ciljna pot je lahko samo pot znotraj aplikacije (povezava na tuj izvor se prezre in vodi na začetno stran).
3. **[FR-001-07]** **Given** zahtevek na katerokoli pot API-ja razen javnega preverjanja zdravja (FR-000-02), **When** nima žetona, ima neveljaven, ponarejen, potekel ali za drug projekt izdan žeton, **Then** zaledje vrne `401` s kodo `UNAUTHENTICATED`, nič se ne spremeni in profil se ne ustvari.
4. **[FR-001-07]** **Given** veljaven žeton, **When** pride zahtevek na API, **Then** ga zaledje sprejme kot zahtevek uporabnika, ki mu žeton pripada; uporabnik se nikoli ne določi iz podatkov v telesu ali poti zahtevka.
5. **[FR-001-08]** **Given** prijavljen uporabnik, **When** vmesnik zahteva podatke o trenutnem uporabniku, **Then** zaledje vrne samo njegov profil (ime, e-naslov); vmesnik nima načina, da bi zahteval profil drugega uporabnika.

---

### User Story 3 - Odjava in potek seje (Priority: P1)

Uporabnik se odjavi v meniju računa ali v *Mojem računu* in pristane na strani za prijavo. Če seja poteče med delom,
ga aplikacija s sporočilom vrne na prijavo in po ponovni prijavi na stran, kjer je bil.

**Why this priority**: odjava je prvotna zahteva; brez nje uporabnik na skupnem računalniku ne more zaščititi podatkov.

**Independent Test**: prijavljen uporabnik izbere *Odjava*; je na strani za prijavo, gumb *Nazaj* v brskalniku ne
prikaže zaščitene vsebine. Ob simuliranem poteku seje (emulator) se prikaže sporočilo o poteku.

**Acceptance Scenarios**:

1. **[FR-001-09]** **Given** prijavljen uporabnik, **When** v meniju računa ali na strani *Moj račun* izbere »Odjava« / "Sign out", **Then** se seja konča, podatki prejšnjega uporabnika se odstranijo iz pomnilnika vmesnika, uporabnik je na strani za prijavo, nadaljnji zahtevki ne nosijo žetona.
2. **[FR-001-09]** **Given** uporabnik se je pravkar odjavil, **When** v brskalniku klikne *Nazaj* ali odpre prej obiskano zaščiteno pot, **Then** je preusmerjen na stran za prijavo in zaščitena vsebina se ne prikaže.
3. **[FR-001-10]** **Given** prijavljen uporabnik, čigar seje ni mogoče več podaljšati ali zaledje na zahtevek vrne `401`, **When** se to zgodi med delom na poti `/x`, **Then** je preusmerjen na stran za prijavo s sporočilom »Seja je potekla. Prijavi se znova.« / "Your session has expired. Please sign in again." in se po ponovni prijavi vrne na `/x`.
4. **[FR-001-10]** **Given** uporabnik je prijavljen v zavihkih A in B, zavihek B je na poti `/x`, **When** se v zavihku A odjavi in nato v zavihku B brez navigacije sproži dejanje, ki pošlje zahtevek na API, ki zahteva prijavo (npr. shrani obrazec ali osveži podatke), **Then** zahtevek ničesar ne spremeni, zavihek B je preusmerjen na stran za prijavo s sporočilom »Seja je potekla. Prijavi se znova.« / "Your session has expired. Please sign in again." in se po ponovni prijavi vrne na `/x`.

---

### User Story 4 - Ogrodje aplikacije in stran »Te strani ni« (Priority: P2)

Prijavljen uporabnik vidi enotno ogrodje: zgornjo vrstico z besednim znakom in menijem računa, povezavo
*Preskoči na vsebino* in glavno vsebino. Neobstoječa pot pokaže stran »Te strani ni« s povezavo nazaj.

**Why this priority**: vse nadaljnje strani se izrišejo v tem ogrodju; stran za neobstoječe poti je prvotna zahteva.

**Independent Test**: prijavljen uporabnik s tipkovnico: prvi *Tab* pokaže *Preskoči na vsebino*, ki premakne fokus na
glavno vsebino; meni računa se odpre, zapre z *Esc* in vrne fokus; pot `/ne-obstaja` pokaže »Te strani ni«.

**Acceptance Scenarios**:

1. **[FR-001-11]** **Given** prijavljen uporabnik na katerikoli strani, **When** se stran izriše, **Then** ima zgornjo vrstico (design.md 7.1) z besednim znakom *Kontakti* (povezava na začetno stran) in gumbom menija računa z ikono osebe (brez vidnega besedila; začetnice bi kršile WCAG 2.5.3, ker niso del dostopnega imena) ter dostopnim imenom »Meni računa« / "Account menu" [CR-01], ter glavno vsebino v elementu `main`.
2. **[FR-001-11]** **Given** odprta stran, **When** uporabnik prvič pritisne *Tab*, **Then** se pokaže povezava »Preskoči na vsebino« / "Skip to content", ki ob aktivaciji premakne fokus na začetek glavne vsebine.
3. **[FR-001-12]** **Given** zaprt meni računa, **When** ga uporabnik odpre, **Then** vsebuje »Moj račun«, izbiro jezika (Slovenščina / English) in »Odjava«; puščice premikajo fokus med elementi, *Esc* ali klik drugam meni zapre in fokus se vrne na gumb (design.md 8.16).
4. **[FR-001-12]** **Given** odprt meni računa, **When** uporabnik izbere jezik, **Then** se jezik zamenja enako kot v *Mojem računu* (FR-001-15).
5. **[FR-001-13]** **Given** prijavljen uporabnik, **When** odpre neobstoječo pot, **Then** se v ogrodju prikaže stran z naslovom »Te strani ni« / "Page not found", stavkom in povezavo »Na seznam skupin« / "Back to groups" (design.md 9.10); naslov strani je »Te strani ni – Kontakti«.
6. **[FR-001-13]** **Given** stran, ki od zaledja prejme `404` za vir (npr. skupino), **When** jo izriše, **Then** lahko prikaže isto stran »Te strani ni« brez razkritja, ali vir obstaja.

---

### User Story 5 - Moj račun: Profil in Videz (Priority: P2)

Uporabnik v *Mojem računu* vidi svoje ime in e-naslov iz Google računa ter izbere jezik vmesnika in temo. Izbira
velja takoj, shrani se v njegov profil in velja na vseh napravah, na katerih se prijavi; na tej napravi ostane tudi
po odjavi, na strani za prijavo.

**Why this priority**: dvojezičnost in izbira teme sta zahtevi konstitucije IV in design.md; brez Profila uporabnik ne ve, s katerim računom je prijavljen.

**Independent Test**: v *Mojem računu* izberi *English* in *Temna*; vmesnik se takoj prevede, `<html lang="en">`,
shema temna; po osvežitvi in po odjavi (stran za prijavo) ostane enako; ob prijavi istega uporabnika v drugem
brskalniškem profilu (druga naprava brez shranjene izbire) je vmesnik takoj po prijavi v angleščini in temni shemi.

**Acceptance Scenarios**:

1. **[FR-001-14]** **Given** prijavljen uporabnik, **When** odpre *Moj račun*, **Then** razdelek »Profil« / "Profile" prikaže ime in e-naslov iz Google računa samo za branje (brez polj za urejanje).
2. **[FR-001-15]** **Given** *Moj račun*, razdelek »Videz« / "Appearance", **When** uporabnik v skupini izbirnih gumbov »Jezik« / "Language" izbere *English*, **Then** so vsa besedila, dostopna imena, naslov strani in `<html lang>` takoj v angleščini brez ponovnega nalaganja, izbira se shrani v profil in na napravo ter ostane po osvežitvi, po odjavi in ob prijavi na drugi napravi.
3. **[FR-001-15]** **Given** stran za prijavo, **When** neprijavljen obiskovalec pod kartico izbere *Slovenščina* ali *English*, **Then** se jezik takoj zamenja in shrani na tej napravi; po prijavi velja pravilo FR-001-19.
4. **[FR-001-16]** **Given** neprijavljen obiskovalec na napravi brez shranjene izbire jezika, **When** se aplikacija naloži v brskalniku z jezikom `sl` ali `sl-SI`, **Then** je vmesnik v slovenščini; ob katerem koli drugem jeziku brskalnika v angleščini.
5. **[FR-001-17]** **Given** razdelek »Videz«, **When** uporabnik v skupini »Tema« / "Theme" izbere *Svetla* ali *Temna*, **Then** se shema takoj zamenja in ostane po osvežitvi brez bliska napačne teme; ob izbiri *Sistemska* sledi nastavitvi sistema in shranjena izbira se izbriše na napravi in v profilu (design.md 4.3). Privzeto je izbrana *Sistemska*.
6. **[FR-001-19]** **Given** uporabnik je na napravi A izbral *English* in *Temna*, **When** se prijavi na napravi B, kjer je shranjeno *Slovenščina* in *Svetla* ali ni shranjeno nič, **Then** je vmesnik takoj po prijavi v angleščini in temni shemi, izbira pa se shrani tudi na napravi B.
7. **[FR-001-19]** **Given** uporabnik, čigar profil še nima izbire jezika in teme, na napravi pa je izrecno izbrano *English* in *Temna*, **When** se prijavi, **Then** se ta izbira shrani v njegov profil; če je na napravi *Sistemska* oziroma jezik ni izbran, profil ostane brez izbire.
8. **[FR-001-19]** **Given** prijavljen uporabnik brez povezave ali z napako zaledja, **When** v *Mojem računu* ali meniju računa zamenja jezik ali temo, **Then** izbira takoj velja in ostane na tej napravi, prikaže se sporočilo »Izbire ni bilo mogoče shraniti v račun.« / "Your choice could not be saved to your account." (design.md 8.13), profil obdrži prejšnjo vrednost.
9. **[FR-001-18]** **Given** katerakoli stran te funkcionalnosti, **When** se izriše, **Then** ima edinstven naslov v izbranem jeziku: »Prijava – Kontakti« / "Sign in – Contacts", »Moj račun – Kontakti« / "My account – Contacts", »Te strani ni – Kontakti« / "Page not found – Contacts".

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Funkcionalnost ne dostopa do podatkov skupin. Vsi viri so vezani na uporabnika; edini negativni akter je
neprijavljen uporabnik. Vira drugega uporabnika ni mogoče nasloviti (ni identifikatorja uporabnika v poti), zato
scenarij `404` za tuj vir ne obstaja.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-001-02, FR-001-07 | unauthenticated (no/invalid/expired token) | registracija oziroma prvi zahtevek na API | 401 `UNAUTHENTICATED`, profil se ne ustvari |
| FR-001-03, FR-001-07 | unauthenticated (no/invalid/expired token) | zahtevek, ki bi posodobil profil | 401 `UNAUTHENTICATED`, profil se ne spremeni |
| FR-001-07 | žeton, izdan za drug projekt Firebase, ali ponarejen podpis | katerikoli zahtevek na API | 401 `UNAUTHENTICATED`, nič se ne spremeni |
| FR-001-08, FR-001-14 | unauthenticated (no/invalid/expired token) | branje profila trenutnega uporabnika | 401 `UNAUTHENTICATED`, ne razkrije podatkov |
| FR-001-06, FR-001-11, FR-001-13, FR-001-14 | neprijavljen obiskovalec | odpre zaščiteno ali neobstoječo pot, *Moj račun* | preusmeritev na prijavo, vsebina se ne izriše |
| FR-001-06 | neprijavljen obiskovalec s ciljno potjo na tuj izvor (npr. `//zlonamerno.si`) | prijava | preusmeritev na začetno stran aplikacije, ne na tuj izvor |
| FR-001-09 | uporabnik po odjavi | *Nazaj* v brskalniku, zaščitena pot | preusmeritev na prijavo, zaščitena vsebina se ne prikaže |
| FR-001-10 | prijavljen uporabnik s poteklo sejo | zahtevek na API | 401; vmesnik preusmeri na prijavo s sporočilom o poteku seje |
| FR-001-10 | uporabnik, odjavljen v drugem zavihku | v tem zavihku dejanje, ki pošlje zahtevek na API (npr. shranjevanje) | nič se ne spremeni (zahtevek brez veljavnega žetona → 401); preusmeritev na prijavo s sporočilom o poteku seje |
| FR-001-19 | unauthenticated (no/invalid/expired token) | branje ali sprememba izbire jezika in teme v profilu | 401 `UNAUTHENTICATED`, profil se ne spremeni |
| FR-001-04 | prijava prekinjena ali neuspešna | prijava z Googlom | sporočilo napake v kartici, uporabnik ostane neprijavljen, profil se ne ustvari |

### Edge Cases

- Google račun brez imena: kot ime se prikaže e-naslov (v *Profilu* in na vrhu menija računa) [CR-01].
- Zelo dolgo ime ali e-naslov: v zgornji vrstici in meniju se skrajša z elipso, v *Profilu* je prikazano v celoti s prelomom, brez vodoravnega drsenja pri 320 px.
- Uporabnik je prijavljen v dveh zavihkih in se v enem odjavi: drugi zavihek preide na stran za prijavo najpozneje ob prvi navigaciji ali prvi interakciji, ki pošlje zahtevek na API, ki zahteva prijavo; tak zahtevek ničesar ne spremeni (FR-001-10).
- Uporabnik ima aplikacijo hkrati odprto na dveh napravah in na eni zamenja jezik ali temo: druga naprava jo uveljavi ob naslednjem nalaganju aplikacije ali prijavi; sprotna sinhronizacija med odprtimi napravami ni v obsegu.
- Prva prijava na novi napravi: do prijave velja izbira naprave (oziroma privzeto), po prijavi se zamenja na izbiro iz profila; ob naslednjih nalaganjih na tej napravi ni bliska napačne teme.
- Brskalnik blokira pojavno okno za prijavo: sporočilo napake v kartici z navodilom, naj dovoli pojavna okna, ali prijava s preusmeritvijo – izbere `plan.md`; uporabnik ni nikoli brez povratne informacije.
- Brskalnik ne dovoli shranjevanja v lokalni pomnilnik (zasebni način): pred prijavo jezik in tema veljata do zaprtja strani, po prijavi velja izbira iz profila; aplikacija ne pade.
- Neznana vrednost v shranjenem jeziku ali temi (na napravi ali v profilu): prezre se in velja privzeto (jezik brskalnika, *Sistemska*).
- Brez povezave (PWA): stran za prijavo in ogrodje se naložita, poskus prijave pokaže sporočilo o manjkajoči povezavi (design.md 8.15).
- Uporabnik med prijavo ročno spremeni ciljno pot v neobstoječo: po prijavi vidi »Te strani ni«.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001-01**: Sistem MORA neprijavljenim obiskovalcem ponuditi stran za prijavo (design.md 9.1) z edino možnostjo prijave »Prijava z Googlom«; aplikacija NE SME imeti gesel ali drugih ponudnikov prijave. *(najnižja vloga: javno)*
- **FR-001-02**: Sistem MORA ob prvi uspešni prijavi z Google računom ustvariti profil uporabnika z imenom in e-naslovom iz Google računa (registracija) in uporabnika preusmeriti na začetno stran aplikacije oziroma na zahtevano pot (FR-001-06). *(najnižja vloga: —)*
- **FR-001-03**: Sistem MORA ob vsaki nadaljnji prijavi istega Google računa posodobiti ime in e-naslov v profilu na vrednosti iz Googla; en Google račun MORA imeti največ en profil, tudi ob sočasnih prijavah. *(najnižja vloga: —)*
- **FR-001-04**: Sistem MORA ob neuspešni prijavi (zaprto okno, napaka omrežja, napaka ponudnika ali zaledja) v kartici za prijavo prikazati razumljivo sporočilo napake v izbranem jeziku, uporabnika pustiti neprijavljenega in omogočiti ponoven poskus. *(najnižja vloga: javno)*
- **FR-001-05**: Sistem MORA prijavljenega uporabnika, ki odpre stran za prijavo, preusmeriti na začetno stran aplikacije. *(najnižja vloga: —)*
- **FR-001-06**: Sistem MORA vse poti vmesnika razen strani za prijavo obravnavati kot zaščitene: neprijavljenega obiskovalca preusmeri na stran za prijavo brez izrisa zaščitene vsebine in ga po uspešni prijavi vrne na zahtevano pot s parametri, če je ta pot znotraj aplikacije. *(najnižja vloga: —)*
- **FR-001-07**: Zaledje MORA pri vsakem zahtevku na API, razen javnega preverjanja zdravja (FR-000-02), preveriti žeton Firebase (podpis, izdajatelj, projekt, veljavnost) in zahtevek brez žetona ali z neveljavnim ali poteklim žetonom zavrniti z `401` in kodo `UNAUTHENTICATED`, ne da bi kar koli spremenilo; uporabnik zahtevka se določi samo iz žetona. *(najnižja vloga: —)*
- **FR-001-08**: Zaledje MORA prijavljenemu uporabniku omogočiti branje lastnega profila (ime, e-naslov) in NE SME ponujati branja profila drugega uporabnika po identifikatorju. *(najnižja vloga: —)*
- **FR-001-09**: Sistem MORA v meniju računa in na strani *Moj račun* ponuditi »Odjava«, ki konča sejo, iz vmesnika odstrani podatke odjavljenega uporabnika in ga preusmeri na stran za prijavo; po odjavi zaščitena vsebina ni dosegljiva niti z gumbom *Nazaj*. *(najnižja vloga: —)*
- **FR-001-10**: Sistem MORA ob poteku seje (žetona ni mogoče podaljšati, zaledje vrne `401` ali se je uporabnik odjavil v drugem zavihku) uporabnika preusmeriti na stran za prijavo s sporočilom »Seja je potekla. Prijavi se znova.« in ga po ponovni prijavi vrniti na pot, kjer je bil. Po odjavi v drugem zavihku MORA zavihek preiti na stran za prijavo najpozneje ob prvi navigaciji ali prvi interakciji, ki pošlje zahtevek na API, ki zahteva prijavo; tak zahtevek NE SME ničesar spremeniti. *(najnižja vloga: —)*
- **FR-001-11**: Sistem MORA vse zaščitene strani izrisati v ogrodju aplikacije (design.md 7.1): zgornja vrstica z besednim znakom *Kontakti* (povezava na začetno stran) in menijem računa (gumb z ikono osebe, brez vidnega besedila) [CR-01], povezava »Preskoči na vsebino« kot prvi element, na katerega pride fokus (design.md 8.12), in glavna vsebina v elementu `main`. *(najnižja vloga: —)*
- **FR-001-12**: Meni računa MORA vsebovati »Moj račun«, izbiro jezika (Slovenščina / English) in »Odjava« ter delovati s tipkovnico po design.md 8.16 (puščice, *Esc*, klik drugam, vrnitev fokusa na gumb). *(najnižja vloga: —)*
- **FR-001-13**: Sistem MORA za vsako neobstoječo pot prijavljenemu uporabniku prikazati stran »Te strani ni« (design.md 9.10) s povezavo »Na seznam skupin«; ista stran MORA biti na voljo drugim funkcionalnostim za vire, za katere zaledje vrne `404`, ne da bi razkrila obstoj vira. *(najnižja vloga: —)*
- **FR-001-14**: Stran *Moj račun* MORA imeti razdelek »Profil« z imenom in e-naslovom iz Google računa samo za branje. *(najnižja vloga: —)*
- **FR-001-15**: Stran *Moj račun* MORA imeti razdelek »Videz« s skupino izbirnih gumbov »Jezik« (*Slovenščina*, *English*); izbira MORA takoj zamenjati vsa besedila, dostopna imena, naslove strani in `<html lang>` brez ponovnega nalaganja in se shraniti v brskalniku na tej napravi ter, če je uporabnik prijavljen, v njegovem profilu (FR-001-19); enaka izbira jezika MORA biti na voljo na strani za prijavo pod kartico in v meniju računa. *(najnižja vloga: —; na strani za prijavo javno)*
- **FR-001-16**: Sistem MORA brez shranjene izbire jezika uporabiti jezik brskalnika: `sl` (s katerokoli regijo) → slovenščina, vsak drug jezik → angleščina; shranjena izbira ima prednost. *(najnižja vloga: javno)*
- **FR-001-17**: Razdelek »Videz« MORA imeti skupino izbirnih gumbov »Tema« (*Sistemska*, *Svetla*, *Temna*; privzeto *Sistemska*); izbira MORA takoj veljati, *Svetla* in *Temna* se shranita v brskalniku in v profilu (FR-001-19) ter uveljavita ob naslednjem nalaganju brez bliska napačne teme, *Sistemska* shranjeno izbiro izbriše v brskalniku in v profilu (design.md 4.3). *(najnižja vloga: —)*
- **FR-001-19**: Sistem MORA izbiro jezika in teme prijavljenega uporabnika hraniti v njegovem profilu, da velja na vseh napravah, na katerih se prijavi: (a) ob prijavi in ob nalaganju aplikacije s prijavljenim uporabnikom se uveljavi izbira iz profila in se shrani tudi v brskalniku; (b) če profil izbire še nima, se vanj shrani trenutna izrecna izbira naprave (*Sistemska* oziroma neizbran jezik pomeni brez izbire); (c) če shranjevanje v profil ne uspe (brez povezave, napaka zaledja), izbira ostane uveljavljena na tej napravi, prikaže se sporočilo »Izbire ni bilo mogoče shraniti v račun.« (design.md 8.13), profil obdrži prejšnjo vrednost, samodejnega ponovnega poskusa ni. Zaledje MORA prijavljenemu uporabniku omogočiti branje in spremembo samo lastne izbire. *(najnižja vloga: —)*
- **FR-001-18**: Vsaka stran te funkcionalnosti MORA imeti edinstven naslov v izbranem jeziku v obliki »‹Zaslon› – Kontakti« / "‹Screen› – Contacts" (design.md 9, 10). *(najnižja vloga: javno)*

### Key Entities *(include if feature involves data)*

- **Uporabnik (profil)**: identiteta iz Firebase (stalni identifikator Google računa), ime in e-naslov iz Google računa, čas ustvarjanja, izbira jezika (`sl` / `en` ali ni shranjena) in teme (*Svetla* / *Temna* ali ni shranjena = *Sistemska*). Ustvari se ob prvi prijavi, ime in e-naslov se posodobita ob vsaki naslednji. Drugih osebnih podatkov ne hrani (konstitucija VI).
- **Seja**: veljavna prijava v brskalniku; žeton, ki ga vmesnik pošilja z vsakim zahtevkom; konča se z odjavo (tudi v drugem zavihku) ali potekom.
- **Nastavitve videza v brskalniku**: kopija izbire jezika in teme na napravi; velja pred prijavo (stran za prijavo), ob nalaganju brez bliska in po odjavi. Za prijavljenega uporabnika je vir resnice profil (FR-001-19).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nov uporabnik pride od strani za prijavo do začetne strani aplikacije z enim klikom v aplikaciji (poleg izbire računa v Googlovem oknu) in brez vnosa kakršnihkoli podatkov.
- **SC-002**: 100 % zaščitenih poti neprijavljenega obiskovalca preusmeri na prijavo in ga po prijavi vrne na isto pot s parametri.
- **SC-003**: 100 % zahtevkov na API brez veljavne prijave (brez, z neveljavnim, s poteklim žetonom) je zavrnjenih; 0 sprememb podatkov ob takih zahtevkih.
- **SC-004**: Po odjavi je zaščitena vsebina v 0 primerih vidna (vključno z gumbom *Nazaj*).
- **SC-005**: Sprememba jezika ali teme je vidna takoj (brez ponovnega nalaganja) in ostane po osvežitvi v 100 % poskusov; ob prijavi istega uporabnika na drugi napravi velja takoj po prijavi v 100 % poskusov; ob nalaganju na napravi s shranjeno izbiro ni bliska napačne teme.
- **SC-006**: Strani *Prijava*, *Moj račun* in *Te strani ni* pri 360, 768 in 1280 px v obeh jezikih in shemah: 0 kršitev axe; celoten potek (prijava, meni računa, *Moj račun*, odjava) je izvedljiv samo s tipkovnico.
- **SC-007**: Vsaka stran ima edinstven naslov v obeh jezikih; `<html lang>` se v 100 % primerov ujema z izbranim jezikom.

## Assumptions

- Odvisna od **000-ogrodje**: Docker Compose s Firebase Auth Emulatorjem, i18n infrastruktura, žetoni in `data-theme`, javno preverjanje zdravja (FR-000-02), privzeta zavrnitev zahtevkov brez žetona (FR-000-10). Ta funkcionalnost doda preverjanje veljavnosti žetona in kodo `UNAUTHENTICATED`.
- **Začetna stran aplikacije** po prijavi je seznam skupin, ki ga določa **002-skupine**; dokler 002 ne obstaja, je tam začasna vsebina. Povezava »Na seznam skupin« na strani »Te strani ni« vodi tja.
- **Rezervirano za druge funkcionalnosti** v zgornji vrstici: preklop skupine in stranski pas (**002-skupine**), povezava *Povabila* s številom novih povabil (**006-povabila**). Ta funkcionalnost zanje pusti prostor, ne določa njihovega vedenja.
- Razdelka *Moji podatki* (izvoz JSON) in *Izbris računa* na strani *Moj račun* določa **012-moji-podatki**; ponovna prijava po izbrisu računa ustvari nov profil po FR-001-02.
- Jezik in tema sta **nastavitvi uporabnika**: prijavljenemu uporabniku se hranita v profilu in veljata na vseh njegovih napravah; kopija v brskalniku velja že na strani za prijavo pred prijavo in ostane po odjavi. Zaledje o uporabniku hrani ime, e-naslov in to izbiro (konstitucija VI, 1.1.0; D-19). Izbira je del uporabnikovih podatkov za izvoz in izbris računa (**012-moji-podatki**).
- E-naslov profila je edinstven med uporabniki (en Google račun = en e-naslov) in se primerja ne glede na velikost črk; na tem gradi vabljenje po e-naslovu (**006-povabila**).
- Odjava konča sejo v aplikaciji in brskalniku; žeton, ki je bil izdan pred odjavo, na zaledju velja do svojega naravnega poteka (kratkotrajni žetoni Firebase), ker aplikacija ga po odjavi ne pošilja več. Preklic žetonov na zaledju ni v obsegu.
- Neprijavljen obiskovalec na neobstoječi poti je najprej preusmerjen na prijavo (vse poti razen prijave so zaščitene); po prijavi vidi »Te strani ni«.
- Koda `UNAUTHENTICATED` je strojno berljiva koda napake za `401` (feature-map §2.2); vmesnik je ne prikazuje.
- Natančne poti (npr. stran za prijavo, *Moj račun*), endpointi in dostopna imena določi `plan.md` (*Public Interfaces*); imena v tej specifikaciji so izhodišče.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| CR-01 | 2026-11-04 | FR-001-11 | Gumb menija računa namesto začetnic prikaže ikono osebe: vidne začetnice ob dostopnem imenu »Meni računa« kršijo WCAG 2.5.3 (*Label in Name*), SC-006 pa zahteva axe brez kršitev. Ime in e-naslov uporabnika sta na vrhu menija in v *Profilu*. | D-23, D-24 |
