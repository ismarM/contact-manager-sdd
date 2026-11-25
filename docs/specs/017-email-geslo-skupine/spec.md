# Feature Specification: Prijava z e-pošto in geslom, iskanje skupin, zapustitev skupine za lastnika

**Feature Branch**: `email-geslo-skupine` (no number; the directory is `docs/specs/017-email-geslo-skupine/`)

**Created**: 2026-11-16

**Input**: User description: "Firebase Email/Password: registracija, prijava, potrditev e-naslova, pozabljeno geslo, varno povezovanje z Googlom, ponovna avtentikacija pri občutljivih operacijah; iskanje in filtriranje skupin na domači strani; lastnik lahko odpre »Zapusti skupino« in dobi pojasnilo o prenosu lastništva. Fotografije niso del funkcionalnosti."

## Clarifications

### Session 2026-11-16

- Q: Kako se uveljavi potrditev e-naslova? → A: Zaledje zavrne vsak žeton z `email_verified=false` s `403 EMAIL_NOT_VERIFIED`; profil v bazi nastane šele po potrditvi.
- Q: Kako se povežeta Google in geslo? → A: Izrecno, brez samodejnega združevanja različnih Firebase UID; uporabnik doda geslo sam, prijavljen in ponovno avtenticiran, prek dokumentiranega REST postopka `accounts:signUp` z `idToken`, `email` in `password` (pri vključeni zaščiti `accounts:update` in `linkWithCredential` z `EmailAuthCredential` nista podprta) (`linkWithCredential` z `EmailAuthCredential` pri vključeni zaščiti pred naštevanjem ni podprt); zaščita ostane vključena, UID se ne spremeni.
- Q: Arhivirane skupine na domači strani? → A: Filter *Stanje* (*Aktivne* privzeto, *Arhivirane*); iskanje in filter vlog delujeta v obeh; stran *Arhivirane skupine* ostane; brez možnosti *Vse*.
- Potrjene privzete vrednosti: ponovna avtentikacija 5 minut po `auth_time`; geslo najmanj 8 znakov in ustreza Firebase password policy; odstranjevanje prijavnih metod ni del 017; lastnik ne more zapustiti skupine pred prenosom lastništva; edinemu članu se ponudi samo povezava do obstoječega izbrisa skupine.

<!-- Tvegana funkcionalnost (constitution §2.1): avtentikacija. Odločitve o varnosti odloči razvijalec (clarify). -->

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registracija in potrditev e-naslova (Priority: P1)

Nov uporabnik se registrira z e-naslovom in geslom. Do potrditve e-naslova (povezava v prejetem sporočilu) ne vidi podatkov aplikacije; vidi zaslon *Potrdite e-naslov* s ponovnim pošiljanjem sporočila in odjavo.

**Why this priority**: brez potrjenega e-naslova bi lahko kdorkoli prevzel tuj e-naslov (povabila se vežejo na e-naslov, 006).

**Independent Test**: registracija v Auth Emulatorju, klic API z nepotrjenim žetonom, potrditev prek emulatorjeve kode, ponovni klic.

**Acceptance Scenarios**:

1. **[FR-017-01]** **Given** neprijavljen obiskovalec, **When** izpolni e-naslov, geslo (po pravilih Firebase, najmanj 8 znakov) in ga potrdi, **Then** je račun ustvarjen, sporočilo za potrditev poslano in prikazan zaslon *Potrdite e-naslov*.
2. **[FR-017-02]** **Given** uporabnik z nepotrjenim e-naslovom, **When** odpre katerokoli zaščiteno pot ali pokliče API, **Then** dostopa ne dobi (vmesnik: zaslon potrditve; API: `403 EMAIL_NOT_VERIFIED`; profil v bazi se ne ustvari).
3. **[FR-017-03]** **Given** zaslon *Potrdite e-naslov*, **When** uporabnik izbere *Ponovno pošlji* ali *Potrdil sem*, **Then** se sporočilo pošlje (z omejitvijo pogostosti) oziroma se po potrditvi stanje osveži in uporabnik vstopi v aplikacijo brez ponovne prijave.
4. **[FR-017-04]** **Given** nepotrjen račun, **When** je e-naslov potrjen, **Then** se ob prvem dostopu ustvari profil (ime, e-naslov) in uporabnik postane prejemnik povabil na ta e-naslov.

---

### User Story 2 - Prijava z geslom in ponastavitev gesla (Priority: P1)

Uporabnik se prijavi z e-naslovom in geslom ali z Googlom (kot doslej). Pozabljeno geslo ponastavi prek sporočila na e-naslov.

**Why this priority**: brez prijave z geslom registracija nima smisla.

**Independent Test**: prijava z veljavnim in napačnim geslom; ponastavitev z neobstoječim in obstoječim e-naslovom, enako sporočilo.

**Acceptance Scenarios**:

1. **[FR-017-05]** **Given** potrjen račun z geslom, **When** vpiše pravilen e-naslov in geslo, **Then** vstopi v aplikacijo in pristane na zahtevani poti (`next`, 001).
2. **[FR-017-06]** **Given** napačno geslo, neobstoječ račun ali račun samo z Googlom, **When** poskusi prijavo, **Then** vidi eno splošno sporočilo (»E-naslov ali geslo ni pravilno«), ki ne razkriva, ali račun obstaja.
3. **[FR-017-07]** **Given** zaslon prijave, **When** izbere *Pozabljeno geslo* in vpiše e-naslov, **Then** vidi vedno isto potrdilo (»Če račun obstaja, smo poslali sporočilo«) ne glede na obstoj računa.
4. **[FR-017-08]** **Given** prijava z Googlom kot doslej, **When** uporabnik izbere *Nadaljuj z Googlom*, **Then** se prijava ne spremeni in obstoječi uporabniki ohranijo profil, članstva, nastavitve in gesla za aplikacijo (014).

---

### User Story 3 - Povezovanje Googla in gesla v isti račun (Priority: P1)

Uporabnik z istim e-naslovom ima en račun (en Firebase UID, en profil) ne glede na to, ali se prijavlja z Googlom ali z geslom. Obstoječi uporabnik Googla lahko v *Mojem računu* doda geslo; uporabnik z geslom lahko doda Google.

**Why this priority**: podvojen profil bi razdelil članstva in lastništvo skupin; napačno povezovanje bi omogočilo prevzem računa.

**Independent Test**: Google uporabnik z članstvi doda geslo, se odjavi in vstopi z geslom – isti profil in skupine; poskus registracije z e-naslovom obstoječega Google računa ne ustvari drugega profila.

**Acceptance Scenarios**:

1. **[FR-017-09]** **Given** prijavljen uporabnik, **When** v *Mojem računu* po ponovni avtentikaciji (FR-017-12) doda geslo (prek REST `accounts:signUp` z njegovim ID žetonom, e-naslov računa samo za branje) ali Google, **Then** oba načina prijave odpreta isti račun, profil in članstva; prikazan je seznam povezanih metod.
2. **[FR-017-10]** **Given** obstaja račun Google z e-naslovom X, **When** nekdo poskusi registracijo z geslom za X, **Then** drugi račun ali profil ne nastane in Firebase UID se ne spremeni; uporabnik dobi nevtralno pojasnilo, naj se prijavi z Googlom (ali ponastavi geslo) in geslo doda v *Mojem računu*; zaščita pred naštevanjem e-naslovov ostane vključena.
3. **[FR-017-11]** **Given** povezovanje, **When** bi imela dva različna Firebase UID isti e-naslov, **Then** profil v bazi ostane en (UID ne trči, noben podatek ne izgine) in napaka je jasno sporočena.

---

### User Story 4 - Ponovna avtentikacija pri občutljivih operacijah (Priority: P2)

Pred izbrisom računa in pred dodajanjem prijavne metode uporabnik ponovno potrdi identiteto z geslom ali Googlom, če zadnja prijava ni bila pred kratkim (`auth_time` starejši od 5 minut). Odstranjevanje prijavnih metod ni del 017.

**Independent Test**: izbris računa z nepotrjeno stalno sejo zahteva geslo oziroma Google pojavno okno; napačno geslo ne spremeni ničesar.

**Acceptance Scenarios**:

1. **[FR-017-12]** **Given** prijava starejša od 5 minut, **When** uporabnik začne izbris računa (012) ali dodajanje prijavne metode, **Then** vmesnik zahteva ponovno avtentikacijo z metodo, ki jo uporabnik ima, zaledje pa za izbris računa preveri `auth_time` ≤ 5 minut (sicer `403 REAUTHENTICATION_REQUIRED`); dodajanje metode zavrne Firebase sam (`CREDENTIAL_TOO_OLD_LOGIN_AGAIN`); brez tega operacija ne steče.
2. **[FR-017-13]** **Given** zaslon *Potrdite e-naslov*, **When** uporabnik potrdi e-naslov v drugem zavihku in izbere *Potrdil sem*, **Then** vmesnik osveži uporabnika in ID žeton (z novo zahtevo `email_verified=true`) in uporabnik vstopi v aplikacijo brez ponovne prijave; če še ni potrjen, ostane na zaslonu z obvestilom.

---

### User Story 5 - Iskanje in filtriranje skupin na domači strani (Priority: P2)

Uporabnik na zaslonu *Skupine* išče skupine po nazivu in jih filtrira po svoji vlogi (Lastnik, Admin, Urednik, Bralec) ter po stanju (aktivne, arhivirane). Iskanje zajame vse njegove skupine, tudi tiste, ki jih seznam po razdelkih še ni naložil (paginacija 25/50/100).

**Why this priority**: pri več deset skupinah je listanje po razdelkih in straneh počasno.

**Independent Test**: uporabnik s 60 skupinami v istem razdelku poišče skupino s strani 3 po delu naziva; rezultat je takoj vidljiv.

**Acceptance Scenarios**:

1. **[FR-017-14]** **Given** uporabnik s skupinami, **When** v polje *Išči skupine* vpiše del naziva (brez razlike velikosti črk in šumnikov), **Then** vidi samo skupine, katerih naziv ustreza, tudi če niso na prvi strani razdelka; število zadetkov je v naslovu razdelka.
2. **[FR-017-15]** **Given** iskanje ali filter, **When** uporabnik izbere eno ali več vlog, **Then** so prikazani samo razdelki teh vlog.
3. **[FR-017-16]** **Given** filter stanja, **When** izbere *Arhivirane*, **Then** so prikazane arhivirane skupine (feature-map §2.4) z istim iskanjem in filtrom vlog; privzeto so prikazane aktivne; povezava na stran *Arhivirane skupine* ostane.
4. **[FR-017-17]** **Given** iskanje brez zadetkov, **When** je prikazano, **Then** vidi prazno stanje s povezavo *Počisti iskanje*; stanje iskanja in filtrov je v URL in preživi osvežitev.
5. **[FR-017-18]** **Given** iskanje in filtri, **When** se spremenijo, **Then** se paginacija vrne na prvo stran, bralnik zaslona dobi obvestilo o številu zadetkov in za iskanje ni novega endpointa (obstoječa seznama skupin (aktivnih in arhiviranih) dobita neobvezen parameter iskanja; strežniška paginacija ostane).

---

### User Story 6 - Lastnik in »Zapusti skupino« (Priority: P3)

Lastnik vidi akcijo *Zapusti skupino*; ko jo izbere, dialog pojasni, da mora najprej prenesti lastništvo na drugega člana, in ponudi pot do *Prenesi lastništvo*. Backend še naprej zavrne zapustitev (`409 OWNER_CANNOT_LEAVE`).

**Independent Test**: lastnik skupine odpre dialog in vidi pojasnilo; API klic ostane zavrnjen.

**Acceptance Scenarios**:

1. **[FR-017-19]** **Given** lastnik skupine z drugimi člani, **When** izbere *Zapusti skupino*, **Then** dialog pojasni, da je treba najprej prenesti lastništvo, in ponudi *Prenesi lastništvo* (odpre obstoječi dialog 007); potrditev zapustitve ni na voljo.
2. **[FR-017-20]** **Given** lastnik edini član skupine, **When** izbere *Zapusti skupino*, **Then** dialog pojasni, da skupine ne more zapustiti, in ponudi *Izbriši skupino* (003).
3. **[FR-017-21]** **Given** ne-lastnik, **When** zapušča skupino, **Then** se vedenje 007 ne spremeni.

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-017-14 | unauthenticated (no/invalid/expired token) | seznam skupin z iskanjem | 401, nothing returned |
| FR-017-14 | authenticated, nobody's group matches | iskanje po nazivu tuje skupine | 200, prazen seznam; tuja skupina se nikoli ne razkrije |
| FR-017-19 | unauthenticated | `leave` | 401 |
| FR-017-19 | authenticated non-member | `leave` | 404, existence is not revealed |
| FR-017-19 | member OWNER | `leave` (neposreden klic) | 409 OWNER_CANNOT_LEAVE, nothing changes |
| FR-017-19 | member of an archived group (non-owner) | `leave` | 2xx (zapustitev je dovoljena, feature-map §2.4) |
| FR-017-02 | uporabnik z nepotrjenim e-naslovom | katerikoli klic API | 403 EMAIL_NOT_VERIFIED, nič se ne ustvari ali spremeni |
| FR-017-12 | prijava starejša od 5 minut | izbris računa, dodajanje metode (neposreden klic) | zavrnjeno, nič se ne spremeni |

### Edge Cases

- Registracija z e-naslovom, ki že obstaja kot Google račun, in obratno (FR-017-10, -11).
- Povezava za potrditev ali ponastavitev je potekla ali že uporabljena: jasno sporočilo in možnost novega pošiljanja.
- Uporabnik spremeni e-naslov v Firebase: profil v bazi se uskladi samo s potrjenim e-naslovom.
- Obstoječi račun z geslom ima e-naslov, ki je v bazi že pri drugem UID: poskus se zavrne, noben profil se ne prepiše.
- Brez povezave ali Firebase ni dosegljiv: jasno sporočilo, brez izgube vnesenega.
- Emulator: potrditev e-naslova v testih prek kode iz emulatorja; produkcija pošilja prava sporočila.
- Iskanje z znaki `%`, `_`, `\` se obravnava kot navadno besedilo; prazno iskanje = brez filtra.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-017-01**: System MUST omogočiti registracijo z e-naslovom in geslom prek Firebase; gesla hrani samo Firebase, nikoli PostgreSQL ali dnevniki.
- **FR-017-02**: System MUST na zaledju zavrniti vsak zahtevek z žetonom, ki nima potrjenega e-naslova (`email_verified=false`), s `403 EMAIL_NOT_VERIFIED`; profil v bazi se ne ustvari ali posodobi pred potrditvijo.
- **FR-017-03**: Users MUST be able ponovno poslati potrditveno sporočilo (omejitev pogostosti) in po potrditvi vstopiti brez ponovne prijave; vmesnik po potrditvi osveži uporabnika in ID žeton (FR-017-13).
- **FR-017-04**: System MUST ustvariti profil in omogočiti prejem povabil šele za potrjen e-naslov; nepotrjen e-naslov ne more prevzeti povabila (006).
- **FR-017-05**: Users MUST be able prijaviti se z e-naslovom in geslom; geslo ima najmanj 8 znakov in ustreza Firebase password policy.
- **FR-017-06**: System MUST ob neuspešni prijavi ne razkriti, ali račun obstaja.
- **FR-017-07**: Users MUST be able zahtevati ponastavitev gesla; potrdilo je vedno enako.
- **FR-017-08**: System MUST ohraniti prijavo z Googlom in vse podatke, članstva, nastavitve ter gesla za aplikacijo obstoječih uporabnikov.
- **FR-017-09**: Users MUST be able v *Mojem računu* videti povezane prijavne metode ter dodati geslo ali Google.
- **FR-017-10**: System MUST za en e-naslov obdržati en račun in en profil; povezovanje je izrecno (brez samodejnega združevanja UID), z zaščito pred naštevanjem e-naslovov, ki ostane vključena; dodajanje gesla obstoječemu računu teče prek dokumentiranega REST `accounts:signUp` z ID žetonom (`idToken`, `email`, `password`); `accounts:update` in `linkWithCredential` z `EmailAuthCredential` se ne uporabljata. Po povezovanju je UID nespremenjen, stanje SDK in žetona sinhronizirano (ponovna prijava z geslom) in `email_verified` obravnavano brez predpostavke (če ni potrjen, zaslon *Potrdite e-naslov*). Testi (emulator; ta zaščite ne posnema, zato je dodatno ročen preizkus v ločenem testnem projektu) pokrijejo povezovanje, neuspešen poskus z nepotrjenim ali tujim računom in nespremenjen UID.
- **FR-017-11**: System MUST preprečiti podvojen profil in konflikt Firebase UID (en `firebase_uid` ↔ en profil; en e-naslov ↔ en profil); obstoječi profili se ne spreminjajo ob migraciji; trk e-naslova med dvema UID se zavrne z `409 ACCOUNT_CONFLICT` in nič se ne prepiše.
- **FR-017-12**: System MUST zahtevati ponovno avtentikacijo (`auth_time` največ 5 minut star, preverja zaledje) za izbris računa in dodajanje prijavne metode.
- **FR-017-13**: Po potrditvi e-naslova MUST vmesnik osvežiti uporabnika in ID žeton, da vsebuje `email_verified=true`, preden zahteva API.
- **FR-017-14**: Users MUST be able iskati svoje skupine po nazivu (del naziva, brez razlike velikosti črk in šumnikov) po vseh njegovih skupinah, ne le naloženih *(lowest role: VIEWER)*.
- **FR-017-15**: Users MUST be able filtrirati po vlogi (več hkrati).
- **FR-017-16**: Users MUST be able filtrirati po stanju (*Aktivne* privzeto, *Arhivirane*) na domači strani; stran *Arhivirane skupine* ostane.
- **FR-017-17**: System MUST hraniti iskanje in filtre v URL ter prikazati prazno stanje z akcijo počisti.
- **FR-017-18**: System MUST iskanje izvesti na strežniku z razširitvijo obstoječih seznamov skupin in brez novih endpointov; paginacija ostane (25/50/100).
- **FR-017-19**: System MUST lastniku pokazati akcijo *Zapusti skupino* s pojasnilom o prenosu lastništva; backend še naprej zavrne (`OWNER_CANNOT_LEAVE`).
- **FR-017-20**: System MUST lastniku-edinemu članu ponuditi samo povezavo do obstoječega postopka izbrisa skupine (003); izbris se ne izvede neposredno iz akcije *Zapusti skupino*.
- **FR-017-21**: System MUST ne spremeniti zapuščanja za ne-lastnike.
- **FR-017-24**: Users MUST v *Moj račun → Prijavne metode* imeti *Omogoči prijavo z geslom* (neobvezno; prej »dodaj geslo«) in, če geslo imajo, *Spremeni geslo* prek Firebase SDK (`updatePassword`) po ponovni avtentikaciji; UID in podatki ostanejo; *Pozabljeno geslo?* je na prijavnem zaslonu (FR-017-07).
- **FR-017-22**: Vsa besedila (sporočila napak, dostopna imena) so v sl/en; zasloni prijave, registracije, potrditve in ponastavitve so odzivni od 320 px, brez kršitev axe (WCAG 2.1 AA); napake so povezane s polji (`aria-describedby`) in oznanjene.
- **FR-017-23**: System MUST v testih in CI uporabljati samo Firebase Auth Emulator; prava Firebase konfiguracija ostane samo v lokalnem razvoju (docs/architecture-decisions.md#2026-11-15-pravi-firebase-v-lokalnem-razvoju).

### Key Entities

- **Prijavna metoda**: način prijave (Google ali geslo), vezan na en Firebase račun; upravlja jo Firebase, aplikacija ne hrani gesel.
- **Profil uporabnika** (`app_user`): en na uporabnika, ključ je Firebase UID; e-naslov je potrjen.
- **Iskanje skupin**: besedilo, nabor vlog in stanje; stanje je v URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nov uporabnik od odprtja registracije do vstopa v aplikacijo (brez čakanja na sporočilo) opravi postopek v manj kot 2 minutah.
- **SC-002**: 100 % obstoječih uporabnikov Googla po uvedbi vstopi s svojim računom z vsemi skupinami, vlogami in nastavitvami (testirano z migracijskim scenarijem).
- **SC-003**: Pri nobeni kombinaciji prijavnih metod ne nastane drugi profil za isti e-naslov ali UID (testirano).
- **SC-004**: Uporabnik z nepotrjenim e-naslovom v nobenem testu ne dobi podatkov ali povabil.
- **SC-005**: Uporabnik z 100 skupinami najde skupino po nazivu v največ 3 sekundah (vnos do prikaza), tudi če je na tretji strani razdelka.
- **SC-006**: Lastnik, ki izbere *Zapusti skupino*, v 100 % primerov dobi pojasnilo, kaj mora storiti, in nobena skupina ne ostane brez lastnika.

## Assumptions

- Email/Password in Google sta že omogočena v pravem Firebase projektu; Auth Emulator podpira obe metodi.
- Gesla upravlja Firebase (min. 8 znakov); lastnih pravil gesel ne dodajamo.
- Fotografije uporabnikov, kontaktov in skupin niso del 017.
- **Konflikt s konstitucijo §5** (»samo ponudnik Google«): zahteva sprememb konstitucije §5 (»samo ponudnik Google«) in feature-map (nova koda napake, vrstica 017): **Odobritev (2026-11-16)**: razvijalec funkcionalnosti 017 je sprejel razširitev na Google + Email/Password in odstranil blokado; Patrikova potrditev po §7 ob odobritvi ni zabeležena – odstopanje je navedeno v opisu PR, ki se ne združi samodejno. Vsebino potrdita oba razvijalca s PR (constitution §7); ta funkcionalnost ju sama ne spreminja.
- Odvisnosti: 001 (prijava), 006 (povabila), 007 (člani), 012 (izbris računa), 002/003 (skupine).
- Ne posega v 016 (tipizirani atributi): druge mape (`features/contacts`, paket `contact`).
