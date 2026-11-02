# Feature Specification: Izbor in množično urejanje kontaktov

**Feature Branch**: `mnozicno-urejanje` (no number; the directory is `specs/009-mnozicno-urejanje/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Množično urejanje kontaktov – urednik in višje lahko izbere več kontaktov, nato pa nastavi značke in druge lastnosti ali jih izbriše; izbor kontaktov (tudi čez strani) uporablja tudi izvoz v Excel."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Izbor kontaktov čez strani in »vsi zadetki« (Priority: P1)

Vsak član skupine (tudi bralec) lahko v seznamu kontaktov izbere posamezne kontakte, vse na strani ali vse zadetke trenutnega iskanja in filtrov. Izbor ostane, ko lista po straneh ali spreminja filtre, dokler ga ne počisti. Akcijska vrstica pokaže število izbranih in akcije, ki jih vloga in stanje skupine dovoljujeta.

**Why this priority**: Izbor je podlaga za vse množične operacije in za izvoz v Excel (010), ki je na voljo vsem članom.

**Independent Test**: Bralec izbere kontakte na dveh straneh in z »Izberi vse zadetke« ter preveri število v akcijski vrstici in prikazane akcije; urednik preveri, da vidi tudi urejanje in izbris.

**Acceptance Scenarios**:

1. **[FR-009-01]** **Given** seznam kontaktov, **When** član označi potrditveno polje »Izberi Janez Novak«, **Then** je vrstica označena kot izbrana (design.md 8.6) in akcijska vrstica pokaže »Izbranih: 1«.
2. **[FR-009-01]** **Given** stran s 25 kontakti, **When** član označi »Izberi vse na strani«, **Then** je izbranih 25 kontaktov; ponovna aktivacija jih odznači.
3. **[FR-009-02]** **Given** član je izbral 3 kontakte na strani 1, **When** preide na stran 2, izbere še 2, spremeni filtre in razvrstitev, **Then** akcijska vrstica pokaže »Izbranih: 5«, kontakti s strani 1 pa so ob vrnitvi še vedno označeni.
4. **[FR-009-03]** **Given** iskanje in filtri (008) vrnejo 312 zadetkov, **When** član aktivira »Izberi vse zadetke (312)«, **Then** je izbranih 312 kontaktov, ki so ustrezali iskanju in filtrom ob kliku.
5. **[FR-009-04]** **Given** filtri vrnejo 1500 zadetkov, **When** član aktivira »Izberi vse zadetke (1500)«, **Then** se izbor ne spremeni in prikaže se sporočilo »Izbereš lahko največ 1000 kontaktov. Zoži iskanje s filtri.«
6. **[FR-009-05]** **Given** bralec ali član arhivirane skupine z izbranimi kontakti, **When** se prikaže akcijska vrstica, **Then** vsebuje »Izbranih: N«, *Izberi vse zadetke (N)*, *Izvozi v Excel* in *Počisti izbor*, ne pa *Uredi izbrane* in *Izbriši*.
7. **[FR-009-05]** **Given** urednik v nearhivirani skupini z izbranimi kontakti, **When** se prikaže akcijska vrstica, **Then** vsebuje tudi *Uredi izbrane* in *Izbriši*; sprememba števila izbranih je sporočena bralniku zaslona.
8. **[FR-009-02]** **Given** izbranih 5 kontaktov, **When** član aktivira *Počisti izbor*, **Then** ni izbran noben kontakt in akcijska vrstica se zamenja z orodno vrstico.

---

### User Story 2 - Množično urejanje značk in atributov (Priority: P1)

Urednik za izbrane kontakte v enem dialogu doda značke, odstrani značke in nastavi ali odstrani atribute. Operacija uspe za vse kontakte ali za nobenega.

**Why this priority**: To je jedro prvotne zahteve »množično urejanje kontaktov«.

**Independent Test**: Urednik izbere kontakte, v dialogu doda in odstrani značko ter nastavi dodatni atribut; preveri stanje vseh kontaktov, obvestilo o uspehu in en vnos v revizijski sledi.

**Acceptance Scenarios**:

1. **[FR-009-06]** **Given** urednik je izbral 12 kontaktov, **When** aktivira *Uredi izbrane*, v *Dodaj značke* doda `konferenca2025`, v *Odstrani značke* `staro` in aktivira »Uporabi za 12 kontaktov«, **Then** ima vseh 12 kontaktov značko `konferenca2025` in nobeden značke `staro`.
2. **[FR-009-12]** **Given** uspešna operacija, pri kateri se je spremenilo 10 od 12 izbranih kontaktov (2 sta značko že imela in nista imela `staro`), **When** se dialog zapre, **Then** se prikaže obvestilo »Posodobljenih 10 kontaktov.«, seznam se osveži, izbor 12 kontaktov ostane.
3. **[FR-009-07]** **Given** izbrani kontakti, **When** urednik v *Nastavi atribut* vpiše ključ `podjetje` in vrednost »FERI«, **Then** ima vsak izbrani kontakt atribut `podjetje=FERI` (obstoječa vrednost z enakim ključem ne glede na velikost črk se prepiše).
4. **[FR-009-07]** **Given** izbrani kontakti, od katerih imajo nekateri atribut `podjetje`, **When** urednik nastavi ključ `podjetje` s prazno vrednostjo, **Then** se atribut odstrani iz kontaktov, ki ga imajo; ostali ostanejo nespremenjeni.
5. **[FR-009-07]** **Given** izbrani kontakti, **When** urednik v *Nastavi atribut* izbere predefiniran atribut *Telefon* in vpiše »01 234 56 78«, **Then** imajo vsi izbrani kontakti ta telefon; pri izbiri polja *Ime* ali *Priimek* ta možnost ne obstaja, zahtevek z njima pa strežnik zavrne z `400 VALIDATION_FAILED`.
6. **[FR-009-08]** **Given** kontakt že ima značko `VIP`, **When** urednik množično doda `vip`, **Then** kontakt ostane z eno značko `VIP` in se ne šteje med posodobljene.
7. **[FR-009-17]** **Given** dialog *Uredi izbrane* z vnesenimi spremembami, **When** strežnik zahtevo zavrne, **Then** dialog ostane odprt z vnosi in nad obrazcem je vidno sporočilo o napaki (design.md 8.13).

---

### User Story 3 - Atomarnost in spremenjen izbor (Priority: P1)

Če bi operacija za kateregakoli izbranega kontakta kršila pravila podatkov ali če kakšen izbrani kontakt medtem ne obstaja več, se ne spremeni nič in urednik izve, zakaj in pri katerih kontaktih.

**Why this priority**: Atomarnost množičnih operacij je skupno pravilo (feature-map §2.3, konstitucija V); delno izvedena operacija bi pustila podatke v nepredvidljivem stanju.

**Independent Test**: Urednik izbere kontakt s 30 značkami in še nekaj drugih, doda novo značko in preveri, da se ni spremenil noben kontakt in da sporočilo navaja problematični kontakt; nato drug uporabnik izbriše izbrani kontakt in urednik preveri odziv.

**Acceptance Scenarios**:

1. **[FR-009-09]** **Given** med 5 izbranimi kontakti ima »Mojca Kralj« že 30 značk, **When** urednik doda novo značko `nova`, **Then** strežnik vrne `400 VALIDATION_FAILED` z napako za kontakt »Mojca Kralj« (preveč značk), nobeden od 5 kontaktov se ne spremeni, vmesnik pa v dialogu navede kontakt in razlog.
2. **[FR-009-09]** **Given** izbrani kontakti, **When** urednik nastavi *E-naslov* na `ni-veljaven`, **Then** strežnik vrne `400 VALIDATION_FAILED` z napako pri polju vrednosti in nič se ne spremeni.
3. **[FR-009-10]** **Given** urednik je izbral 8 kontaktov, drug urednik pa je medtem izbrisal 2 od njih, **When** prvi urednik uporabi množično urejanje ali izbris, **Then** strežnik vrne `409 SELECTION_CHANGED` s seznamom manjkajočih kontaktov, nič se ne spremeni, vmesnik pa pokaže »2 izbrana kontakta ne obstajata več.« z gumbom *Odstrani jih iz izbora*; po tem lahko urednik operacijo ponovi za preostalih 6.
4. **[FR-009-11]** **Given** zahtevek množične operacije v skupini A, ki med kontakti navaja kontakt skupine B, **When** ga strežnik prejme, **Then** vrne `404` in v nobeni skupini se nič ne spremeni.
5. **[FR-009-16]** **Given** urednik je pred množičnim urejanjem odprl obrazec kontakta X z verzijo 3, množično urejanje pa je kontakt X spremenilo (verzija 4), **When** urednik shrani obrazec, **Then** dobi konflikt verzij (`409 VERSION_CONFLICT`, design.md 8.14) in nič se ne prepiše tiho.

---

### User Story 4 - Množični izbris (Priority: P2)

Urednik izbriše vse izbrane kontakte naenkrat po potrditvi v dialogu.

**Why this priority**: Prvotna zahteva množično urejanje izrecno vključuje izbris; je pa redkejši od urejanja značk.

**Independent Test**: Urednik izbere 3 kontakte, aktivira *Izbriši*, preveri potrditveni dialog s fokusom na *Prekliči*, potrdi in preveri, da kontaktov ni več, da je izbor prazen in da revizijska sled vsebuje en vnos.

**Acceptance Scenarios**:

1. **[FR-009-13]** **Given** izbrani 3 kontakti, **When** urednik aktivira *Izbriši*, **Then** se odpre potrditveni dialog »Izbrišem 3 kontakte?« z razlago posledice, fokus je na *Prekliči*, nevarni gumb je »Izbriši 3 kontakte« (design.md 8.11).
2. **[FR-009-13]** **Given** odprt potrditveni dialog, **When** urednik aktivira *Prekliči* ali pritisne *Esc*, **Then** se nič ne izbriše, izbor ostane, fokus se vrne na *Izbriši*.
3. **[FR-009-13]** **Given** odprt potrditveni dialog, **When** urednik potrdi z »Izbriši 3 kontakte«, **Then** so vsi 3 kontakti izbrisani, prikaže se obvestilo »Izbrisanih 3 kontaktov.« (s pravilno slovnično obliko), izbor se počisti in seznam osveži.
4. **[FR-009-14]** **Given** uspešen množični izbris 3 kontaktov, **When** admin odpre revizijsko sled skupine, **Then** je zanje natanko en vnos vrste *odstranjevanje* (005) z izvajalcem, časom in stanjem vseh 3 kontaktov pred izbrisom.

---

### User Story 5 - Revizijska sled in arhivirana skupina (Priority: P2)

Vsaka množična operacija je v revizijski sledi en vnos, ki zajema vse spremenjene kontakte; v arhivirani skupini množično urejanje in izbris nista mogoča.

**Why this priority**: Sledljivost sprememb je skupno pravilo (§2.7); arhivirana skupina je samo za branje (§2.4).

**Independent Test**: Po množičnem urejanju 10 kontaktov preveri en vnos s stanji prej/potem; v arhivirani skupini preveri, da akcij ni in da neposreden zahtevek vrne `409 GROUP_ARCHIVED`.

**Acceptance Scenarios**:

1. **[FR-009-14]** **Given** uspešno množično urejanje, ki je spremenilo 10 kontaktov, **When** član odpre revizijsko sled skupine, **Then** obstaja natanko en vnos vrste *urejanje* (005) z izvajalcem, časom ter stanjem prej in potem za vsakega od 10 kontaktov; nespremenjeni izbrani kontakti v vnosu niso navedeni.
2. **[FR-009-14]** **Given** množično urejanje, pri katerem se ni spremenil noben kontakt, **When** se izvede, **Then** se ne ustvari vnos v revizijski sledi in prikaže se obvestilo »Nobenega kontakta ni bilo treba spremeniti.«
3. **[FR-009-15]** **Given** arhivirana skupina in član z vlogo urednik ali višjo, **When** pošlje zahtevek za množično urejanje ali izbris, **Then** strežnik vrne `409 GROUP_ARCHIVED` in nič se ne spremeni; v vmesniku akcij *Uredi izbrane* in *Izbriši* ni.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Izbor (FR-009-01 … 05) je branje (najnižja vloga VIEWER, deluje tudi v arhivirani skupini). Množično urejanje in izbris (FR-009-06 … 17) sta pisanje z najnižjo vlogo EDITOR. Vrstni red preverjanj po feature-map §2.2.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-009-03, FR-009-04 | neprijavljen (brez, neveljaven ali potekel žeton) | »Izberi vse zadetke« (pridobitev vseh zadetkov) | 401, ni podatkov |
| FR-009-03, FR-009-04 | prijavljen nečlan | »Izberi vse zadetke« | 404, obstoj skupine se ne razkrije |
| FR-009-03 | član arhivirane ali trajno arhivirane skupine (katerakoli vloga) | »Izberi vse zadetke« | 200, enako kot v nearhivirani |
| FR-009-03 | član | neveljavni parametri iskanja/filtrov | 400 VALIDATION_FAILED (pravila FR-008-14) |
| FR-009-06 … FR-009-13 | neprijavljen (brez, neveljaven ali potekel žeton) | množično urejanje ali izbris | 401, nič se ne spremeni |
| FR-009-06 … FR-009-13 | prijavljen nečlan (skupina obstaja ali ne obstaja) | množično urejanje ali izbris | 404, obstoj se ne razkrije, nič se ne spremeni |
| FR-009-06 … FR-009-13 | VIEWER | množično urejanje ali izbris | 403, nič se ne spremeni |
| FR-009-11 | član skupine A (katerakoli vloga) | zahtevek navaja kontakt skupine B ali neobstoječ kontakt | 404, v nobeni skupini se nič ne spremeni |
| FR-009-15 | EDITOR, ADMIN ali OWNER arhivirane ali trajno arhivirane skupine | množično urejanje ali izbris | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-009-15 | VIEWER arhivirane skupine | množično urejanje ali izbris | 403 (vloga se preveri pred arhiviranostjo), nič se ne spremeni |
| FR-009-04, FR-009-09 | EDITOR | prazen izbor ali več kot 1000 kontaktov v zahtevku | 400 VALIDATION_FAILED, nič se ne spremeni |
| FR-009-07, FR-009-09 | EDITOR | nastavljanje imena ali priimka; neveljaven ključ (prazen, > 50 znakov, enak imenu predefiniranega atributa); vrednost, ki krši slovar (§2.6) | 400 VALIDATION_FAILED z napakami po poljih, nič se ne spremeni |
| FR-009-08, FR-009-09 | EDITOR | neveljavna značka (presledek, > 50 znakov), ista značka v *Dodaj* in *Odstrani*, prazna operacija (nič za dodati, odstraniti ali nastaviti) | 400 VALIDATION_FAILED, nič se ne spremeni |
| FR-009-09 | EDITOR | operacija bi pri vsaj enem kontaktu presegla 30 značk ali 50 dodatnih atributov | 400 VALIDATION_FAILED z napakami po kontaktih, nič se ne spremeni |
| FR-009-10 | EDITOR | vsaj en izbrani kontakt te skupine je bil medtem izbrisan (ali združen v drug kontakt) | 409 SELECTION_CHANGED s seznamom manjkajočih kontaktov, nič se ne spremeni |
| FR-009-16 | EDITOR | shranjevanje posameznega kontakta z verzijo, ki jo je množična operacija medtem povečala | 409 VERSION_CONFLICT (pravila 004), nič se ne prepiše |

### Edge Cases

- Isti kontakt je v zahtevku naveden večkrat: šteje se enkrat.
- Izbran kontakt, ki po spremembi filtrov ni več viden, ostane izbran in se šteje v »Izbranih: N«; množične operacije in izvoz veljajo za vse izbrane, ne samo za vidne.
- Ročni izbor nad 1000 kontaktov: dodatni kontakt se ne izbere, prikaže se sporočilo o omejitvi (FR-009-04).
- »Izberi vse zadetke« je posnetek ob kliku: kontakti, ki začnejo ustrezati filtrom pozneje, niso izbrani; že izbrani kontakti zunaj zadetkov ostanejo izbrani (izbor se razširi, ne zamenja).
- Odstranitev značke, ki je kontakt nima, ali odstranitev atributa, ki ga kontakt nima, za ta kontakt ni napaka in ni sprememba.
- Primerjava značk in ključev pri dodajanju, odstranjevanju in prepisu ne upošteva velikosti črk; pri prepisu atributa obstoječi ključ dobi zapis, ki ga je vpisal urednik.
- Nastavitev predefiniranega atributa (naslov, e-naslov, telefon) na prazno vrednost ga izprazni.
- Vrstni red uporabe v enem zahtevku: najprej odstranitev značk, nato dodajanje značk, nato nastavljanje atributov; pravila slovarja se preverijo nad končnim stanjem vsakega kontakta.
- Dve hkratni množični operaciji nad prekrivajočimi se kontakti se izvedeta ena za drugo; vsaka je atomarna in ima svoj vnos v revizijski sledi.
- Skupino medtem arhivira lastnik: naslednja množična operacija vrne `409 GROUP_ARCHIVED`, vmesnik pokaže pasico arhivirane skupine (003) in skrije akcije pisanja; izbor ostane za izvoz.
- Uporabniku se medtem zniža vloga na bralca: operacija vrne `403`, vmesnik pokaže sporočilo in skrije akcije pisanja.
- Osvežitev strani ali zaprtje zavihka izbor izgubi (izbor ni del naslova strani, FR-009-02).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-009-01**: Sistem MORA v seznamu kontaktov omogočiti izbor posameznega kontakta (potrditveno polje »Izberi ‹ime in priimek›«) in vseh kontaktov na trenutni strani (»Izberi vse na strani«); izbrane vrstice so označene tudi z obkljukanim poljem (design.md 8.6). *(najnižja vloga: VIEWER)*
- **FR-009-02**: Sistem MORA izbor ohraniti ob menjavi strani, velikosti strani, iskanja, filtrov in razvrstitve ter ob odprtju kontakta in vrnitvi na seznam iste skupine, dokler ga uporabnik ne počisti s *Počisti izbor*, ne zapusti skupine v aplikaciji, ne osveži strani ali se ne odjavi; izbor velja samo za eno skupino. *(najnižja vloga: VIEWER)*
- **FR-009-03**: Sistem MORA z gumbom »Izberi vse zadetke (N)« izboru dodati vse kontakte, ki ob kliku ustrezajo trenutnemu iskanju in filtrom (pomen po 008), ne glede na stran. *(najnižja vloga: VIEWER)*
- **FR-009-04**: Sistem MORA izbor in vsako množično operacijo omejiti na največ 1000 kontaktov; preseganje v vmesniku pokaže sporočilo »Izbereš lahko največ 1000 kontaktov. Zoži iskanje s filtri.« brez spremembe izbora, zahtevek z več kot 1000 ali 0 kontakti pa strežnik zavrne z `400 VALIDATION_FAILED`. *(najnižja vloga: VIEWER)*
- **FR-009-05**: Sistem MORA ob izboru vsaj enega kontakta prikazati akcijsko vrstico z »Izbranih: N« (sprememba sporočena bralniku zaslona), *Izberi vse zadetke (N)*, *Izvozi v Excel* in *Počisti izbor*; *Uredi izbrane* in *Izbriši* samo za urednika in višje v nearhivirani skupini (design.md 8.8). *(najnižja vloga: VIEWER)*
- **FR-009-06**: Sistem MORA z *Uredi izbrane* odpreti dialog z razdelki *Dodaj značke*, *Odstrani značke* in *Nastavi atribut* ter gumbom »Uporabi za N kontaktov« in v eni operaciji uporabiti vse vnesene spremembe za vse izbrane kontakte (največ 30 značk za dodajanje, 30 za odstranjevanje in 10 atributov na operacijo). *(najnižja vloga: EDITOR)*
- **FR-009-07**: Sistem MORA pri *Nastavi atribut* dovoliti dodatni ključ (pravila §2.6) ali predefiniran atribut *Naslov*, *E-naslov* ali *Telefon*, ne pa *Ime* ali *Priimek*; neprazna vrednost doda atribut ali prepiše obstoječo vrednost (ključ se primerja ne glede na velikost črk), prazna vrednost atribut odstrani oziroma predefiniran atribut izprazni. *(najnižja vloga: EDITOR)*
- **FR-009-08**: Sistem MORA pri množičnem dodajanju značk dodati značko le kontaktom, ki je še nimajo (ne glede na velikost črk), pri odstranjevanju pa jo odstraniti le kontaktom, ki jo imajo; značke morajo ustrezati slovarju (§2.6), ista značka ne sme biti hkrati za dodajanje in odstranjevanje. *(najnižja vloga: EDITOR)*
- **FR-009-09**: Sistem MORA množično urejanje in izbris izvesti atomarno: če bi končno stanje kateregakoli kontakta kršilo slovar podatkov (npr. več kot 30 značk ali 50 dodatnih atributov, neveljaven e-naslov), se ne spremeni noben kontakt, strežnik vrne `400 VALIDATION_FAILED` z napakami po kontaktih in poljih, vmesnik pa v dialogu navede prizadete kontakte (do 10 po imenu in »… in še N«) in razlog. *(najnižja vloga: EDITOR)*
- **FR-009-10**: Sistem MORA, kadar vsaj eden od izbranih kontaktov te skupine medtem ne obstaja več (izbrisan ali združen), operacijo zavrniti z `409 SELECTION_CHANGED` s seznamom manjkajočih kontaktov, ne spremeniti ničesar in v vmesniku ponuditi *Odstrani jih iz izbora*, nato pa ponovitev operacije. *(najnižja vloga: EDITOR)*
- **FR-009-11**: Sistem MORA množično operacijo, ki navaja kontakt druge skupine ali kontakt, ki nikoli ni obstajal v tej skupini, zavrniti z `404`, ne da bi razkril obstoj kontakta, in ne spremeniti ničesar. *(najnižja vloga: EDITOR)*
- **FR-009-12**: Sistem MORA po uspešnem množičnem urejanju zapreti dialog, prikazati obvestilo »Posodobljenih N kontaktov.« (N = število dejansko spremenjenih kontaktov, s pravilnimi slovničnimi oblikami) oziroma »Nobenega kontakta ni bilo treba spremeniti.«, osvežiti seznam in ohraniti izbor. *(najnižja vloga: EDITOR)*
- **FR-009-13**: Sistem MORA z *Izbriši* odpreti potrditveni dialog »Izbrišem N kontaktov?« z razlago posledice, s fokusom na *Prekliči* in nevarnim gumbom »Izbriši N kontaktov« (design.md 8.11); šele potrditev izbriše vse izbrane kontakte (pomen izbrisa kot pri posameznem izbrisu v 004), nato se prikaže obvestilo »Izbrisanih N kontaktov.«, izbor se počisti in seznam osveži. *(najnižja vloga: EDITOR)*
- **FR-009-14**: Sistem MORA za vsako uspešno množično urejanje ali izbris ustvariti natanko en vnos v revizijski sledi skupine (vrsta *urejanje* oziroma *odstranjevanje*; množične spremembe nimajo lastne vrste, FR-005-03), ki vsebuje izvajalca, čas ter stanje prej in potem za vsak dejansko spremenjen ali izbrisan kontakt, po pogodbi beleženja iz 005; operacija brez sprememb vnosa ne ustvari. *(najnižja vloga: EDITOR)*
- **FR-009-15**: Sistem MORA množično urejanje in izbris v arhivirani ali trajno arhivirani skupini zavrniti z `409 GROUP_ARCHIVED` (članom z vlogo urednik ali višjo) in v vmesniku akcij *Uredi izbrane* in *Izbriši* ne izrisati; izbor in izvoz ostaneta na voljo. *(najnižja vloga: EDITOR)*
- **FR-009-16**: Sistem MORA vsakemu kontaktu, ki ga množična operacija spremeni, povečati verzijo, tako da poznejše shranjevanje tega kontakta s starejšo verzijo vrne `409 VERSION_CONFLICT` (004); sočasne množične operacije nad istimi kontakti se izvedejo zaporedno, vsaka atomarno. *(najnižja vloga: EDITOR)*
- **FR-009-17**: Sistem MORA ob kakršnemkoli neuspehu množične operacije (napaka podatkov, spremenjen izbor, arhivirana skupina, nezadostna vloga, nedosegljiv strežnik) dialog pustiti odprt z vnosi in prikazati vidno, razumljivo sporočilo o napaki brez tehničnih kod (design.md 8.13); med pošiljanjem gumb pokaže stanje pošiljanja in ne sprejme drugega klika. *(najnižja vloga: EDITOR)*

### Key Entities *(include if feature involves data)*

- **Izbor kontaktov**: množica identitet kontaktov ene skupine (največ 1000), ki jo hrani vmesnik v trenutnem zavihku; ni shranjena na strežniku in ni del naslova strani.
- **Množično urejanje**: operacija nad seznamom kontaktov z značkami za dodajanje, značkami za odstranjevanje in nastavitvami atributov (ključ ali predefiniran atribut *Naslov*/*E-naslov*/*Telefon* in vrednost; prazna vrednost odstrani).
- **Množični izbris**: operacija, ki izbriše seznam kontaktov.
- **Rezultat množične operacije**: število dejansko spremenjenih ali izbrisanih kontaktov ali seznam napak po kontaktih oziroma manjkajočih kontaktov.
- **Vnos revizijske sledi množične operacije**: en vnos (005) z izvajalcem, časom, vrsto in stanjem prej/potem za vse prizadete kontakte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Urednik doda značko 300 kontaktom, izbranim z enim filtrom, v manj kot 30 sekundah od začetka do obvestila o uspehu.
- **SC-002**: Množična operacija nad 1000 kontakti se zaključi (uspeh ali zavrnitev) v manj kot 5 sekundah v 95 % primerov.
- **SC-003**: V 100 % testiranih primerov kršitve (preveč značk, neveljavna vrednost, manjkajoč ali tuj kontakt, arhivirana skupina, nezadostna vloga) se ne spremeni noben kontakt in ne nastane vnos v revizijski sledi.
- **SC-004**: Vsaka uspešna množična operacija ustvari natanko en vnos v revizijski sledi, ki zajema 100 % spremenjenih kontaktov.
- **SC-005**: Izbor, akcijska vrstica, dialog urejanja in potrditveni dialog so v celoti uporabni samo s tipkovnico in pri 320 px širine, brez kršitev axe (WCAG 2.1 A in AA).

## Assumptions

- Odvisna od **004-kontakti** (kontakti, slovar podatkov, pomen izbrisa, verzije in `VERSION_CONFLICT`, preglednica s stolpcem izbire), **005-revizijska-sled** (pogodba beleženja; množična operacija je en vnos z več kontakti) in **008-iskanje** (iskanje in filtri, ki jih uporabi »Izberi vse zadetke«).
- **Izvoz v Excel** (gumb *Izvozi v Excel* v akcijski vrstici in sama datoteka) je v lasti **010-izvoz-excel**; 010 uporablja ta izbor in njegovo omejitev **1000 kontaktov**.
- **Odločitev – izbor za vse člane:** izbor in akcijska vrstica sta na voljo bralcu in višjim ter v arhivirani skupini, ker ju potrebuje izvoz (010).
- **Odločitev – največja velikost:** 1000 kontaktov na izbor in na množično operacijo; večje skupine se obdelajo v več korakih s filtri.
- **Odločitev – trajanje izbora:** izbor živi v trenutnem zavihku za eno skupino; osvežitev strani, odjava, preklop na drugo skupino ali *Počisti izbor* ga izbrišejo. Izbor ni v naslovu strani (prevelik in ni namenjen deljenju).
- **Odločitev – »Izberi vse zadetke«** je posnetek identitet ob kliku in izbor razširi (ne zamenja); pridobi ga strežnik z enakimi parametri kot iskanje 008.
- **Odločitev – nastavljivi atributi:** množično se smejo nastaviti dodatni atributi ter *Naslov*, *E-naslov* in *Telefon*; *Ime* in *Priimek* ne, ker množično enako ime ni smiselno in bi lahko kršilo pravilo »vsaj eno od obeh je obvezno«.
- **Odločitev – brez verzij v zahtevku:** množična operacija ne pošilja verzij posameznih kontaktov; uporabi se nad trenutnim stanjem, verzije spremenjenih kontaktov pa se povečajo (FR-009-16). `VERSION_CONFLICT` se zato pri množični operaciji ne pojavi.
- **Odločitev – kode:** kršitev slovarja pri kateremkoli kontaktu je `400 VALIDATION_FAILED` z napakami po kontaktih (korak 6 v §2.2); izbrisan ali združen kontakt te skupine je `409 SELECTION_CHANGED` (korak 7 – poslovno pravilo, zato se preveri po veljavnosti podatkov); kontakt druge skupine ali nikoli obstoječ kontakt je `404` (korak 2). Razlikovanje 404/409 ne razkrije podatkov drugih skupin, ker so izbrisani kontakti lastne skupine vidni v njeni revizijski sledi.
- **Odločitev – štetje:** »Posodobljenih N« in revizijska sled vključujeta samo dejansko spremenjene kontakte; nespremenjenim se verzija ne poveča.
- Izbris po FR-009-13 ima enak pomen kot posamezen izbris v 004 (in ga je mogoče razveljaviti z rollbackom v 005).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
