# Feature Specification: Slike (profilne slike, slike skupin in kontaktov)

**Feature Branch**: `slike` (no number; the directory is `specs/018-slike/`)

**Created**: 2026-11-16

**Input**: User description: "018 slike – fotografije uporabnikov, skupin in kontaktov: nalaganje, zamenjava in odstranitev; avatarji z začetnicami kot nadomestek; izolacija skupin; varna obdelava slik; GDPR; predlog shrambe"

## Clarifications

### Session 2026-11-16

- Q: Kje se hranijo slike? → A: PostgreSQL (`bytea` + metapodatki) za abstrakcijo `ImageStore`; druge shrambe (S3, Firebase Storage) so kasnejša zamenjava brez sprememb API-ja.
- Q: Kako se uporabi slika Google računa? → A: samo prostovoljno (gumb *Uporabi sliko Google računa*); strežnik prenese enkrat, samo naslov iz preverjenega žetona, zavarovano pred SSRF (FR-018-23).
- Q: Kdo sme spreminjati sliko skupine? → A: ADMIN in OWNER (ogled VIEWER in višje).
- Q: Kdo sme spreminjati sliko kontakta? → A: EDITOR in višje.
- Q: Kako se slike obnašajo v sledi, obnovi in rollbacku? → A: sled beleži samo dejstvo spremembe slike, zgodovinskih slik ne hranimo; obnova stare različice obstoječega kontakta in rollback trenutne slike ne spremenita; obnovljen izbrisani kontakt dobi sliko, če je še shranjena; ob trajnem izbrisu (skupina, račun, odstranitev, zamenjava, združitev) se slike izbrišejo (FR-018-12, FR-018-17).
- Q: Katera slika ostane pri združevanju? → A: slika preživelega kontakta; če je nima, prva razpoložljiva (po starosti kontakta); ostale se izbrišejo.
- Q: Ali vCard in CardDAV vključujeta slike? → A: ne; to je ločena odločitev po zaključku 014.
- Q: Omejitve in zapisi slik? → A: strežnik sprejme JPEG in PNG do 5 MB in 4096 × 4096 točk; izhod JPEG (PNG pri prosojnosti) v 96/256/512; WebP preoblikuje brskalnik (Java ImageIO WebP ne podpira, nova knjižnica ni potrebna); predogled, obrezovanje in avatar z začetnicami potrjeni.
- Q: Kako React prikaže zasebne slike? → A: slike se pridobijo z zahtevkom z ID žetonom in prikažejo iz lokalnega objekta v brskalniku; naslov slike ni dovoljenje (FR-018-22).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Profilna slika uporabnika (Priority: P1)

Uporabnik v *Mojem računu* naloži, zamenja ali odstrani svojo sliko. Slika se kot avatar prikaže v meniju računa, pri članih skupin in povsod, kjer je prikazan uporabnik (člani, povabila, revizijska sled). Brez slike je prikazan avatar z začetnicami.

**Why this priority**: najmanjši samostojen kos, ki uvede ves skupni mehanizem (nalaganje, obrezovanje, obdelava, avatar, shramba, brisanje).

**Independent Test**: prijavljen uporabnik naloži sliko, jo vidi v meniju računa, jo zamenja in odstrani; drug uporabnik nima pravice spremeniti njegove slike.

**Acceptance Scenarios**:

1. **[FR-018-01]** **Given** uporabnik brez slike, **When** v *Mojem računu* izbere datoteko, **Then** vmesnik pokaže predogled z obrezovanjem v kvadrat (krog), po potrditvi se slika naloži in avatar se takoj spremeni v meniju računa in v *Mojem računu*.
2. **[FR-018-02]** **Given** uporabnik s sliko, **When** naloži novo ali izbere *Odstrani sliko* (potrditveni dialog), **Then** se slika zamenja oziroma odstrani, stara pa ni več dostopna; brez slike je avatar z začetnicami imena (oz. e-naslova) na barvi, določeni z uporabnikom.
3. **[FR-018-03]** **Given** člani skupine s slikami in brez, **When** uporabnik odpre člane, povabila ali revizijsko sled, **Then** imajo člani avatar s sliko ali začetnicami, drugje so začetnice; izbrisan uporabnik ima nevtralen avatar in »izbrisan uporabnik« (feature-map §2.5).
4. **[FR-018-04]** **Given** nalaganje, **When** traja ali spodleti, **Then** vmesnik pokaže napredek oziroma trajno sporočilo z gumbom *Poskusi znova* (design.md 8.13); dotedanja slika ostane.

---

### User Story 2 - Slika skupine (Priority: P1)

Admin ali lastnik skupine naloži, zamenja ali odstrani sliko ali logotip skupine. Prikazana je na seznamu skupin (domača stran), v preklopniku in glavi skupine, v nastavitvah skupine in na seznamu arhiviranih skupin. Brez slike je prikazan avatar z začetnicami naslova v barvi skupine.

**Why this priority**: najbolj viden element domače strani; prvi, ki uvede avtorizacijo po vlogah nad slikami.

**Independent Test**: admin naloži sliko skupine; bralec jo vidi, a je ne more spremeniti; nečlan sliki ne dostopa.

**Acceptance Scenarios**:

1. **[FR-018-05]** **Given** admin ali lastnik skupine, **When** v nastavitvah skupine naloži sliko, **Then** se slika prikaže na domači strani, v preklopniku, glavi in nastavitvah ter se ne zapiše v kontakte; sprememba povzroči povečanje verzije skupine in uporablja optimistično zaklepanje (feature-map §2.3).
2. **[FR-018-06]** **Given** skupina s sliko, **When** admin slike ne zamenja ali odstrani, **Then** vsi člani, vključno z bralci, vidijo isto sliko; urednik in bralec akcij za spremembo slike ne vidita.
3. **[FR-018-07]** **Given** nečlan ali neprijavljen, **When** poskusi dobiti sliko skupine (tudi z znanim naslovom slike), **Then** je ne dobi; slika zasebne skupine ni nikoli dostopna brez prijave in članstva.
4. **[FR-018-08]** **Given** arhivirana skupina, **When** član gleda skupino, **Then** je slika prikazana (samo branje); sprememba slike je zavrnjena po feature-map §2.4.

---

### User Story 3 - Slika kontakta (Priority: P1)

Urednik naloži, zamenja ali odstrani sliko posameznega kontakta. Slika je prikazana kot avatar v seznamu kontaktov, panelu in pogledu kontakta, v iskanju in primerjavi dvojnikov. Brez slike je prikazan avatar z začetnicami (ime, priimek, sicer podjetje).

**Why this priority**: ključna vrednost za uporabnike imenika; hkrati najzahtevnejša zaradi sledi, obnove in združevanja.

**Independent Test**: urednik naloži sliko kontakta, vidi jo v seznamu in pogledu, jo zamenja in odstrani; v sledi je viden vnos; bralec spremembe ne more narediti.

**Acceptance Scenarios**:

1. **[FR-018-09]** **Given** urednik v obrazcu ali pogledu kontakta, **When** naloži sliko, **Then** je prikazana v seznamu (pomanjšana), pogledu in panelu; shranjevanje slike je ločeno od drugih polj kontakta in ne zahteva, da ima kontakt druge spremembe.
2. **[FR-018-10]** **Given** kontakt s sliko, **When** urednik sliko zamenja ali odstrani, **Then** v revizijski sledi (005) nastane vnos z dejanjem spremembe slike (brez vsebine slike) in verzija kontakta se poveča; ob zastareli verziji `409 VERSION_CONFLICT`.
3. **[FR-018-11]** **Given** združevanje dvojnikov (011), **When** se kontakti združijo, **Then** rezultat obdrži sliko preživelega (najstarejšega) kontakta; če je nima, prevzame sliko prvega od združenih kontaktov, ki jo imajo (po starosti kontakta); slike drugih združenih kontaktov so trajno izbrisane; slika se ne podvoji in vnos `MERGE` v sledi ne vsebuje slike.
4. **[FR-018-12]** **Given** kontakt s sliko, **When** ga urednik izbriše in ga nato obnovi (obnova 015 ali rollback skupine 005), **Then** ima obnovljeni kontakt spet sliko, ki jo je imel ob izbrisu; **When** slike ob izbrisu ni imel ali jo je pred tem odstranil, **Then** je obnovljen brez slike in brez napake. Izbris skupine trajno odstrani vse slike skupine in njenih kontaktov, tudi slike izbrisanih (obnovljivih) kontaktov.
5. **[FR-018-13]** **Given** izvoz vCard, CardDAV ali Excel in uvoz (014), **When** se izvede, **Then** slike kontaktov niso del izvoza in uvoza (uvoz izpusti `PHOTO` kot doslej); vključitev slik v vCard in CardDAV je ločena odločitev po zaključku 014.
6. **[FR-018-10]** **Given** obstoječ kontakt, kateremu je bila slika po izbrani različici spremenjena, **When** urednik obnovi starejšo različico kontakta (015) ali admin izvede rollback skupine (005), **Then** se trenutna slika kontakta ne spremeni; vnos v sledi, ki je spremenil samo sliko, je viden, a ni obnovljiv (gumb obnove ni izrisan, rollback na tak vnos slike ne spremeni).

---

### User Story 4 - Varna obdelava in shramba slik (Priority: P1)

Strežnik vsako naloženo sliko preveri, obdela in shrani v enotni obliki, ne glede na to, kaj je poslal brskalnik.

**Why this priority**: varnost in zasebnost sta pogoja za vsak od treh razdelkov.

**Independent Test**: naložitev datotek z lažno končnico, prevelikih, poškodovanih in slik z metapodatki; preverjanje, kaj je shranjeno.

**Acceptance Scenarios**:

1. **[FR-018-14]** **Given** datoteka, katere dejanska vsebina ni JPEG ali PNG (npr. `.png`, ki je izvedljiva datoteka, SVG, GIF, WebP, poškodovana ali okrnjena datoteka), **When** jo uporabnik naloži neposredno prek API, **Then** je zavrnjena z `400 VALIDATION_FAILED` (`INVALID_IMAGE`); nič se ne shrani. Vmesnik sprejme tudi WebP in ga v brskalniku pretvori v JPEG, preden ga pošlje.
2. **[FR-018-15]** **Given** datoteka nad 5 MB ali nad 4096 × 4096 točk, **When** jo uporabnik naloži, **Then** je zavrnjena z `400 VALIDATION_FAILED` (`FILE_TOO_LARGE`, `IMAGE_TOO_LARGE`), dimenzije se preberejo iz glave in zavrnejo pred dekodiranjem slike v pomnilnik.
3. **[FR-018-16]** **Given** fotografija z metapodatki (GPS, naprava, čas) in orientacijo EXIF, **When** je shranjena, **Then** je orientacija upoštevana, ni nobenega izvornega metapodatka, slika je izrezana v kvadrat, pomanjšana in zapisana kot JPEG (PNG samo, če ima vir prosojnost) v velikostih 96, 256 in 512 točk.

---

### User Story 5 - Zasebnost, brisanje in prenosljivost (Priority: P2)

Slike so osebni podatki: ob izbrisu računa, kontakta ali skupine se izbrišejo, izvoz mojih podatkov jih omenja, dostop do njih je vedno nadzorovan.

**Why this priority**: zahteva GDPR in konstitucije VI, vendar se dá dokončati po osnovnem nalaganju.

**Independent Test**: izbris računa, kontakta in skupine; preveri, da slik ni več; izvoz podatkov vsebuje lastno sliko.

**Acceptance Scenarios**:

1. **[FR-018-17]** **Given** uporabnik, ki izbriše račun (012), **When** je izbris končan, **Then** je njegova profilna slika trajno izbrisana in v ostalih skupinah ni več sledi; slike skupin in kontaktov, ki jih je naložil, ostanejo (pripadajo skupini).
2. **[FR-018-18]** **Given** *Moji podatki* (012), **When** uporabnik izvozi svoje podatke, **Then** izvoz vsebuje lastno profilno sliko; slik kontaktov in skupin ne vsebuje (podatki skupine).
3. **[FR-018-19]** **Given** shramba slik, **When** se kasneje zamenja, **Then** se slike prenesejo brez sprememb v vmesniku, API-ju ali podatkih skupin (pripravljenost na zamenjavo).

---

### User Story 6 - Slika Google računa (Priority: P3)

Uporabnik, prijavljen z Googlom, lahko prostovoljno prevzame sliko svojega Google računa kot profilno sliko. Slika se nikoli ne prevzame samodejno.

**Why this priority**: udobje, ne pogoj; zasebnost in varnost (brez klicev brskalnika na tuje strežnike, brez prenosa poljubnih naslovov) sta pomembnejša od udobja.

**Independent Test**: uporabnik z in brez slike v žetonu pritisne *Uporabi sliko Google računa*; preveri se rezultat in zavrnitev naslovov izven zaupanja vrednega vira.

**Acceptance Scenarios**:

1. **[FR-018-20]** **Given** uporabnik, ki se je prijavil z Googlom in nima slike, **When** odpre *Moj račun*, **Then** vidi avatar z začetnicami in gumb *Uporabi sliko Google računa*; slike Google računa brskalnik nikoli ne naloži sam.
2. **[FR-018-23]** **Given** gumb je pritisnjen, **When** strežnik obdela zahtevek, **Then** uporabi samo naslov slike iz preverjenega ID žetona trenutnega uporabnika (zahtevek ne nosi nobenega naslova), ga prenese samo prek HTTPS z Googlovega gostitelja slik, slika gre skozi enak postopek kot vsaka naložena (FR-018-14 do FR-018-16) in zamenja morebitno obstoječo sliko.
3. **[FR-018-23]** **Given** žeton brez slike (prijava z e-naslovom in geslom, emulator), naslov izven dovoljenega gostitelja, preusmeritev, naslov, ki se razreši v zasebni ali lokalni naslov, odgovor prevelik, počasen ali ne-slikovni, **When** uporabnik pritisne gumb, **Then** se nič ne shrani in vmesnik pokaže razumljivo sporočilo (`GOOGLE_PHOTO_UNAVAILABLE`); gumb ni izrisan, če žeton slike nima.
4. **[FR-018-20]** **Given** uporabnik je prevzel sliko Google računa, **When** pozneje spremeni sliko v Google računu, **Then** se slika v aplikaciji ne spremeni sama; uporabnik jo lahko znova prevzame, zamenja ali odstrani.


### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-018-05, FR-018-07 | unauthenticated (no/invalid/expired token) | branje, nalaganje ali odstranitev slike skupine | 401, nothing changes |
| FR-018-05, FR-018-07 | authenticated non-member | branje, nalaganje ali odstranitev slike skupine | 404, existence is not revealed |
| FR-018-06 | member with role VIEWER, EDITOR | nalaganje ali odstranitev slike skupine | 403, nothing changes |
| FR-018-06 | VIEWER | branje slike skupine | 200 |
| FR-018-08 | ADMIN, OWNER of an archived group | nalaganje ali odstranitev slike skupine | 409 GROUP_ARCHIVED, nothing changes |
| FR-018-08 | VIEWER in arhivirani skupini | branje slike skupine | 200 |
| FR-018-09 | unauthenticated | branje, nalaganje ali odstranitev slike kontakta | 401, nothing changes |
| FR-018-09 | authenticated non-member (tudi član skupine B za kontakt skupine A) | branje, nalaganje ali odstranitev slike kontakta | 404, existence is not revealed |
| FR-018-09 | member with role VIEWER | nalaganje ali odstranitev slike kontakta | 403, nothing changes |
| FR-018-09 | VIEWER | branje slike kontakta | 200 |
| FR-018-10 | member of an archived group | nalaganje ali odstranitev slike kontakta | 409 GROUP_ARCHIVED, nothing changes |
| FR-018-10 | EDITOR+ | zastarela verzija kontakta | 409 VERSION_CONFLICT, nothing changes |
| FR-018-01, FR-018-02 | unauthenticated | nalaganje ali odstranitev profilne slike | 401, nothing changes |
| FR-018-01 | prijavljen uporabnik | sprememba ali odstranitev slike drugega uporabnika | ni mogoča: končne točke delujejo samo nad lastno sliko; branje slike drugega uporabnika samo, če sta v isti skupini, sicer 404 |
| FR-018-20, FR-018-23 | unauthenticated | prevzem slike Google računa | 401, nothing changes |
| FR-018-23 | prijavljen uporabnik z žetonom brez slike ali z nedovoljenim naslovom slike | prevzem slike Google računa | 409 GOOGLE_PHOTO_UNAVAILABLE, nothing changes; zahtevek ne more podati naslova (SSRF) |
| FR-018-15 | prijavljen uporabnik | več kot 10 nalaganj slik na minuto | 429 RATE_LIMITED, nothing changes |
| FR-018-10 | EDITOR+ | obnova različice ali rollback, ki bi spremenila samo sliko | ni sprememb slike; `RESTORE_NO_CHANGES`/`ROLLBACK_NO_CHANGES` po obstoječih pravilih |
| FR-018-14, FR-018-15 | EDITOR+/ADMIN+/uporabnik | neveljavna ali prevelika datoteka | 400 VALIDATION_FAILED, nothing changes (po 401 → 404 → 403 → 409, feature-map §2.2) |

### Edge Cases

- Dve sočasni nalaganji iste slike (dva zavihka): zadnja uspešna zmaga, brez nepovezanih ostankov v shrambi.
- Nalaganje se prekine: stara slika ostane, nepopolna datoteka ni dostopna.
- Uporabnik odstrani sliko, ki je med tem že odstranjena: idempotenten uspeh brez napake.
- Člana izbrišeš ali zapusti skupino: njegova profilna slika ni več vidna članom te skupine.
- Slika s 0 širine/višine, preveč pikslov (»bomba«), večkratne končnice, SVG ali GIF: zavrnjena (FR-018-14, FR-018-15).
- Brez povezave ali počasna povezava: avatar z začetnicami in stalno sporočilo, brez praznih razbitih slik; slika, ki se ne naloži, ne prikaže tehnične napake.
- Uporabnik z bralnikom zaslona: slika ima nadomestno besedilo z imenom (ali je prazno, če ime stoji zraven).
- Preklic uporabnikovega članstva takoj prepreči dostop do slik skupine.
- Prevzem slike Google računa, ko je žeton potekel ali brez slike: sporočilo `GOOGLE_PHOTO_UNAVAILABLE`, brez kopiranja naslovov med zahtevki.
- Slika kontakta, ki je bil izbrisan in je skupina nato izbrisana: slika izbrisana skupaj s skupino.
- Neobstoječa ali tuja slika, branje po znanem id-ju: vedno `404` (nikoli `403`) za nečlane.
- Uporabnik kopira naslov slike v drug zavihek ali ga deli: brez prijave in članstva je odgovor `401`/`404`, torej naslov ni dostop do slike.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-018-01**: Uporabnik MORA v *Mojem računu* naložiti lastno profilno sliko z izbiro datoteke ali povleci in spusti, z predogledom in obrezovanjem v kvadrat (krog) pred nalaganjem. *(najnižja vloga: —; samo lastna slika)*
- **FR-018-02**: Uporabnik MORA lastno sliko zamenjati ali odstraniti (potrditveni dialog); odstranjena ali zamenjana slika ni več dostopna. *(—)*
- **FR-018-03**: Sistem MORA avatar uporabnika prikazati v meniju računa, *Mojem računu* in seznamu članov skupine; povsod drugje, kjer je uporabnik naveden (revizijska sled, povabila, »zadnja sprememba«), so začetnice, izbrisan uporabnik pa ima nevtralen avatar. *(ogled: VIEWER)*
- **FR-018-04**: Vmesnik MORA pri nalaganju prikazati napredek in napake (sl/en, brez tehničnih kod) in omogočiti ponovni poskus; tipkovnica, bralnik zaslona in 360–1280 px so podprti (konstitucija IV).
- **FR-018-05**: Sistem MORA omogočiti nalaganje slike skupine admina in lastnika; prikazana je na seznamih skupin, v glavi, preklopniku, nastavitvah in na seznamu arhiviranih. Sprememba je operacija nad skupino z optimističnim zaklepanjem. *(najnižja vloga: ADMIN)*
- **FR-018-06**: Sistem MORA omogočiti zamenjavo in odstranitev slike skupine admina in lastnika; ogled slike imajo vsi člani. *(najnižja vloga: ADMIN; ogled VIEWER)*
- **FR-018-07**: Sistem MORA sliko skupine in kontaktov postreči samo prijavljenemu članu skupine (vrstni red preverjanj po feature-map §2.2); noben naslov slike ni dostopen javno ali brez preverjanja članstva, tudi ne za zasebne skupine. *(VIEWER)*
- **FR-018-08**: Sistem MORA v arhivirani skupini slike prikazovati, njihovo spremembo pa zavrniti z `409 GROUP_ARCHIVED`. *(ogled VIEWER)*
- **FR-018-09**: Sistem MORA omogočiti nalaganje slike kontakta urednikom in višje in jo prikazati v seznamu, panelu, pogledu, iskanju in primerjavi dvojnikov. *(najnižja vloga: EDITOR; ogled VIEWER)*
- **FR-018-10**: Sistem MORA zamenjavo in odstranitev slike kontakta obravnavati kot spremembo kontakta: poveča verzijo (`409 VERSION_CONFLICT` ob zastarelosti) in ustvari vnos v revizijski sledi, ki prikaže, da je bila slika dodana, zamenjana ali odstranjena (brez vsebine slike). *(najnižja vloga: EDITOR)*
- **FR-018-11**: Sistem MORA pri združevanju dvojnikov (011) obdržati sliko preživelega kontakta, če je nima, prvo razpoložljivo (po starosti kontakta); slike drugih združenih kontaktov se izbrišejo. Slika se ne podvaja in ni del vnosa `MERGE`. *(najnižja vloga: EDITOR)*
- **FR-018-12**: Sistem MORA ob izbrisu kontakta ohraniti njegovo sliko, dokler je kontakt obnovljiv (obnova 015, rollback 005), in ob obnovi kontakta sliko vrniti, če je shranjena; sicer obnovi brez slike in brez napake. Slika se trajno izbriše: ob odstranitvi ali zamenjavi, ob združevanju (kontakti, ki niso preživeli), ob izbrisu skupine in ob izbrisu računa (profilna slika). Drugih zgodovinskih različic slik sistem ne hrani in jih ne obljublja. *(izbris kontakta: EDITOR; izbris skupine po 003)*
- **FR-018-13**: Sistem NE SME vključiti slik kontaktov v izvoz Excel, vCard, CardDAV in uvoz (014); lastnost vCard `PHOTO` se še naprej izpusti. Slike v vCard in CardDAV so ločena odločitev po zaključku 014. *(—)*
- **FR-018-14**: Sistem MORA vsako naloženo datoteko preveriti po dejanski vsebini (ne po končnici ali tipu, ki ga pošlje brskalnik) in sprejeti samo JPEG in PNG; vse ostalo (SVG, GIF, WebP, vgrajene skripte, poškodovane datoteke) zavrne z `400 VALIDATION_FAILED` s kodo `INVALID_IMAGE`. Vmesnik pred nalaganjem vsako sliko (tudi WebP) izreže in pretvori v JPEG ali PNG.
- **FR-018-15**: Sistem MORA zavrniti datoteke nad 5 MB (`FILE_TOO_LARGE`) ali nad 4096 × 4096 točk (`IMAGE_TOO_LARGE`) in dimenzije preveriti pred dekodiranjem; poraba pomnilnika pri dekodiranju je omejena (največ nekaj hkratnih obdelav), nalaganj je največ 10 na uporabnika na minuto (`429 RATE_LIMITED`).
- **FR-018-16**: Sistem MORA vsako sliko ponovno kodirati, upoštevati orientacijo EXIF, odstraniti vse metapodatke (EXIF, GPS, profili ICC, komentarji), jo izrezati v kvadrat (po izbiri uporabnika; neizrezano sredinsko) in shraniti kot JPEG (PNG samo pri prosojnosti) v velikostih 96, 256 in 512 točk; izvirna datoteka se ne hrani.
- **FR-018-17**: Sistem MORA vsako spremembo slike kontakta (dodana, zamenjana, odstranjena) zabeležiti v revizijski sledi kot spremembo kontakta (FR-018-10), brez vsebine slike. Obnova stare različice obstoječega kontakta (015) in rollback skupine (005) trenutne slike obstoječega kontakta ne spreminjata; izbrisani kontakt ob obnovi dobi sliko po FR-018-12.
- **FR-018-18**: Sistem MORA v izvozu *Moji podatki* (012) vključiti lastno profilno sliko in ob izbrisu računa trajno izbrisati sliko skupaj z računom. *(—)*
- **FR-018-19**: Sistem MORA slike hraniti za abstraktnim vmesnikom shrambe, ki omogoča kasnejšo zamenjavo ponudnika brez sprememb API-ja in vmesnika; slike se ne hranijo v brskalniku ali v javnih shrambah.
- **FR-018-20**: Sistem NE SME nalagati slik s tujih strežnikov v brskalniku (konstitucija VI); slika Google računa se prevzame samo na izrecno zahtevo uporabnika (gumb *Uporabi sliko Google računa*), nikoli samodejno.
- **FR-018-21**: Sistem MORA vsa dostopna imena, sporočila in nadomestna besedila slik prevesti (sl/en), avatarji z začetnicami in slike morajo izpolnjevati kontrast WCAG 2.1 AA, barve so samo žetoni design.md.
- **FR-018-22**: Sistem MORA vsako sliko streči samo prek preverjenega API-ja (prijava, članstvo, vloga po feature-map §2.2); naslov slike nikoli ni dovoljenje za dostop (brez podpisanih ali javnih naslovov), vmesnik pa jo prikaže tako, da zahtevek nosi ID žeton; odgovor je `private` in ga je treba pred ponovno uporabo preveriti. *(ogled: VIEWER)*
- **FR-018-23**: Sistem MORA pri prevzemu slike Google računa uporabiti samo naslov iz preverjenega žetona trenutnega uporabnika, ga prenesti samo prek HTTPS z dovoljenega Googlovega gostitelja slik, brez sledenja preusmeritvam, z zavrnitvijo zasebnih in lokalnih naslovov, s časovno in velikostno omejitvijo prenosa in preverjanjem vsebine po FR-018-14; zahtevek ne sme sprejeti nobenega naslova. *(—)*

### Key Entities

- **Slika**: obdelana slika z lastnikom (uporabnik, skupina ali kontakt), vrsto, velikostmi, časom nalaganja; en lastnik ima največ eno sliko.
- **Avatar**: prikaz lastnika: slika ali začetnice na barvi.
- **Shramba slik**: nadomestljiv zaledni sloj, kjer so slike dejansko shranjene.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uporabnik naloži in potrdi sliko (izbira, obrezovanje, shranjevanje) v manj kot 30 sekundah in vidi avatar brez ponovnega nalaganja strani.
- **SC-002**: 100 % zavrnjenih poskusov dostopa do slik (neprijavljen, nečlan, tuja skupina) ne razkrije obstoja slike ali skupine.
- **SC-003**: V nobeni shranjeni sliki ni izvornih metapodatkov (preverjeno na vzorcu slik z GPS in napravo).
- **SC-004**: Seznam 100 kontaktov s slikami se prikaže brez opaznega zamika in brez razbitih slik pri počasni povezavi.
- **SC-005**: Po izbrisu računa, kontakta ali skupine v shrambi ne ostane nobena slika, ki jo je mogoče pridobiti.
- **SC-006**: Vsi zasloni s slikami izpolnjujejo WCAG 2.1 AA (axe brez kršitev) pri 360, 768 in 1280 px.

## Assumptions

- Odvisnosti: 001 (prijava), 002 (skupine), 004 (kontakti), 005 (sled), 007 (člani), 011 (dvojniki), 012 (moji podatki), 014 (uvoz in izvoz) in 015 (napredna revizija) – ta funkcionalnost se jih dotakne samo z dodatkom slike.
- Pravice (potrjeno): lastna slika – vsak uporabnik; slika skupine – ADMIN in OWNER; slika kontakta – EDITOR in višje; ogled VIEWER in višje. Slika uporabnika je vidna članom skupin, v katerih je (člani, povabila, sled).
- Dovoljeni zapisi (strežnik): JPEG in PNG, največ 5 MB, največ 4096 × 4096 točk; izhod JPEG (PNG pri prosojnosti) v 96, 256 in 512 točkah; brez nove knjižnice za kodiranje. WebP preoblikuje brskalnik pred nalaganjem, ker standardni Java ImageIO WebP ne bere in ne piše.
- Shramba (potrjeno): PostgreSQL (`bytea` + metapodatki) za abstrakcijo `ImageStore`; slike se strežejo samo prek preverjenega API-ja; kasnejša zamenjava (npr. S3) brez sprememb vmesnika in API-ja.
- Življenjski cikel (potrjeno, Q5): sled beleži samo dejstvo spremembe slike; slika izbrisanega kontakta se hrani, dokler je kontakt obnovljiv, torej do izbrisa skupine (enako kot besedilni podatki v sledi 005); sistem ne omogoča ločenega »trajnega izbrisa« kontakta, zato slika izbrisanega kontakta ostane do izbrisa skupine.
- Nadomestni avatar: začetnice na barvi iz žetonov; profil dobi barvo po uporabniku, skupina po svoji barvi (design.md 4.2).
- Prenova dizajna: avatar je ena skupna komponenta z velikostmi, da se videz kasneje spremeni na enem mestu.
- Arhitekturna odločitev o shrambi se zapiše v `docs/decisions/` (konstitucija §2.6); to je tvegana funkcionalnost (osebni podatki, zunanja storitev) – plan se pred nalogami pokaže razvijalcu.
