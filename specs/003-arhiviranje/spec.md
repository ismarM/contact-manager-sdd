# Feature Specification: Arhiviranje in izbris skupine

**Feature Branch**: `arhiviranje` (no number; the directory is `specs/003-arhiviranje/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Arhiviranje skupine (lastnik) – članom ne prepreči dostopa, le zamrzne skupino in jo označi kot arhivirano; odarhiviranje (lastnik); prikaz arhiviranih skupin; v arhivirani skupini so mogoči le pregled, izvoz, zapuščanje, izbris in odarhiviranje; trajno arhivirane skupine brez lastnika; izbris skupine, kadar je uporabnik njen edini član."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arhiviranje skupine (Priority: P1)

Lastnik zamrzne skupino, ki je ne uporablja več aktivno. Člani ohranijo dostop in lahko skupino pregledujejo, iščejo in izvažajo, ničesar pa ne morejo več spremeniti.

**Why this priority**: arhiviranje je osnova vseh pravil »samo za branje«, na katera se sklicujejo vse funkcionalnosti s pisanjem, in pogoj za izbris računa lastnika (012).

**Independent Test**: lastnik arhivira skupino; urednik iste skupine jo še vedno odpre, vidi pasico in nima akcij spreminjanja; poskus spremembe podatkov skupine vrne `409 GROUP_ARCHIVED`.

**Acceptance Scenarios**:

1. **[FR-003-01]** **Given** lastnik nearhivirane skupine »Projekt FERI« v *Nastavitve → Upravljanje skupine*, **When** izbere *Arhiviraj skupino*, **Then** se odpre potrditveni dialog z vprašanjem »Arhiviram skupino Projekt FERI?«, besedilom posledic (člani ohranijo dostop, skupina bo samo za branje, odarhivirati jo lahko samo lastnik) ter gumboma *Prekliči* in *Arhiviraj skupino*; fokus je na *Prekliči* (design.md 8.11).
2. **[FR-003-01]** **Given** odprt potrditveni dialog, **When** lastnik izbere *Prekliči* ali pritisne *Esc*, **Then** se nič ne spremeni in fokus se vrne na *Arhiviraj skupino*.
3. **[FR-003-01]** **Given** odprt potrditveni dialog, **When** lastnik potrdi, **Then** je skupina arhivirana, prikaže se obvestilo o uspehu in skupina ostane odprta v načinu samo za branje.
4. **[FR-003-02]** **Given** skupina je bila arhivirana, **When** kateri koli njen član odpre zaslon *Skupine* ali stranski pas, **Then** skupine ni med razdelki po vlogah, je pa na seznamu *Arhivirane skupine*; član jo lahko še vedno odpre in ohrani svojo vlogo.
5. **[FR-003-01]** **Given** admin nearhivirane skupine, **When** odpre *Upravljanje skupine*, **Then** akcije *Arhiviraj skupino* ni; zahtevek za arhiviranje, ki ga vseeno pošlje, strežnik zavrne s `403`.

---

### User Story 2 - Skupina samo za branje (Priority: P1)

V arhivirani skupini so vsem članom na voljo samo pregled, iskanje, revizijska sled, člani, podatki skupine, izvoz v Excel, zapuščanje, izbris (kjer ga pravila dovoljujejo) in – lastniku – odarhiviranje. Vse drugo strežnik zavrne, vmesnik pa akcij spreminjanja sploh ne izriše.

**Why this priority**: pravilo je skupno vsem funkcionalnostim s pisanjem; brez njega arhiviranje nima učinka.

**Independent Test**: v arhivirani skupini lastnik poskusi spremeniti podatke skupine (002) in dobi `409 GROUP_ARCHIVED`; na vseh zaslonih skupine je pasica in ni akcij spreminjanja.

**Acceptance Scenarios**:

1. **[FR-003-03]** **Given** arhivirana skupina in admin z zadostno vlogo za urejanje podatkov skupine, **When** pošlje spremembo podatkov skupine, **Then** strežnik vrne `409 GROUP_ARCHIVED` in nič se ne spremeni.
2. **[FR-003-03]** **Given** arhivirana skupina in bralec, **When** pošlje spremembo podatkov skupine, **Then** strežnik vrne `403` (vloga se preveri pred stanjem skupine, feature-map §2.2).
3. **[FR-003-03]** **Given** arhivirana skupina, **When** kateri koli član bere podatke skupine, **Then** strežnik vrne podatke (`200`).
4. **[FR-003-04]** **Given** arhivirana skupina, **When** lastnik odpre kateri koli zaslon skupine, **Then** ni izrisana nobena akcija spreminjanja (npr. obrazec *Podatki skupine*, *Arhiviraj skupino*); v *Upravljanju skupine* ostanejo samo *Odarhiviraj skupino*, *Zapusti skupino* in *Izbriši skupino* oziroma razlaga, kjer akcija ni mogoča.
5. **[FR-003-04]** **Given** admin ima odprt obrazec, skupino pa je medtem arhiviral lastnik, **When** admin shrani, **Then** vmesnik prikaže razumljivo sporočilo, da je skupina arhivirana in je ni mogoče spreminjati, ter zaslon ponovno naloži v načinu samo za branje.
6. **[FR-003-05]** **Given** arhivirana skupina, **When** član odpre kateri koli zaslon skupine, **Then** je pod glavo skupine pasica »Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.«; lastnik ima v pasici tudi *Odarhiviraj skupino*, drugi člani ne (design.md 9.11).

---

### User Story 3 - Odarhiviranje (Priority: P2)

Lastnik odmrzne arhivirano skupino, ki spet deluje normalno.

**Why this priority**: arhiviranje mora biti povratno, a je redkejše od arhiviranja.

**Independent Test**: lastnik odarhivira skupino; ta se vrne v razdelek *Lastnik* na zaslonu *Skupine*, pasica izgine in urejanje podatkov skupine spet deluje.

**Acceptance Scenarios**:

1. **[FR-003-06]** **Given** lastnik arhivirane skupine, **When** izbere *Odarhiviraj skupino* (v pasici ali v *Upravljanju skupine*), **Then** skupina ni več arhivirana, prikaže se obvestilo o uspehu, pasica in oznaka *Arhivirano* izgineta, akcije spreminjanja se spet izrišejo po vlogah, skupina pa se pri vseh članih vrne v razdelke po vlogah in izgine s seznama *Arhivirane skupine*.
2. **[FR-003-06]** **Given** admin arhivirane skupine, **When** pošlje zahtevek za odarhiviranje, **Then** strežnik vrne `403` in skupina ostane arhivirana.
3. **[FR-003-06]** **Given** lastnik nearhivirane skupine, **When** pošlje zahtevek za odarhiviranje, **Then** strežnik vrne `409 GROUP_NOT_ARCHIVED` in nič se ne spremeni.

---

### User Story 4 - Seznam arhiviranih skupin (Priority: P2)

Uporabnik na ločenem seznamu vidi arhivirane skupine, katerih član je, in jih odpre.

**Why this priority**: arhivirane skupine niso na seznamu po vlogah, zato brez tega seznama postanejo nedosegljive.

**Independent Test**: uporabnik, ki je član ene arhivirane in ene trajno arhivirane skupine, na zaslonu *Arhivirane skupine* vidi obe, drugo z opombo »lastnik: izbrisan uporabnik«.

**Acceptance Scenarios**:

1. **[FR-003-07]** **Given** uporabnik je urednik arhivirane skupine »Konferenca 2025«, **When** izbere povezavo *Arhivirane skupine* (zaslon *Skupine* ali stranski pas), **Then** vidi zaslon *Arhivirane skupine* (naslov strani »Arhivirane skupine – Kontakti«) z vrstico: jeziček, naslov, skrajšan opis, število kontaktov, oznaka vloge »Urednik« in oznaka *Arhivirano*; vrstica odpre skupino.
2. **[FR-003-07]** **Given** uporabnik je član 30 arhiviranih skupin, **When** odpre *Arhivirane skupine*, **Then** vidi prvih 25 po abecedi naslovov in paginacijo (design.md 8.9).
3. **[FR-003-07]** **Given** uporabnik ni član nobene arhivirane skupine, **When** odpre *Arhivirane skupine*, **Then** vidi prazno stanje »Nimaš arhiviranih skupin.« s povezavo *Na seznam skupin*.
4. **[FR-003-08]** **Given** uporabnik je član trajno arhivirane skupine, **When** odpre *Arhivirane skupine*, **Then** ima vrstica te skupine opombo »lastnik: izbrisan uporabnik« (design.md 8.5).

---

### User Story 5 - Trajno arhivirana skupina (Priority: P3)

Skupina, katere lastnik je izbrisal račun, ostane trajno arhivirana in brez lastnika. Člani jo lahko še berejo, zapustijo (razen zadnjega) ali – kot zadnji član – izbrišejo.

**Why this priority**: stanje nastane šele z izbrisom računa (012); tukaj so le njegova pravila.

**Independent Test**: v testnih podatkih pripravljena trajno arhivirana skupina z enim članom-urednikom: pasica pove, da je trajno arhivirana, odarhiviranja ni, izbris je mogoč.

**Acceptance Scenarios**:

1. **[FR-003-08]** **Given** trajno arhivirana skupina, **When** član odpre kateri koli zaslon skupine, **Then** pasica pove »Skupina je trajno arhivirana, ker lastnik nima več računa.«, akcije *Odarhiviraj skupino* ni nikjer, kot lastnik pa je povsod prikazan »izbrisan uporabnik«.
2. **[FR-003-08]** **Given** trajno arhivirana skupina, **When** kateri koli član pošlje zahtevek za odarhiviranje, **Then** strežnik vrne `403` (skupina nima člana z vlogo lastnik) in skupina ostane trajno arhivirana.
3. **[FR-003-08]** **Given** trajno arhivirana skupina, **When** član pošlje katero koli spremembo podatkov skupine, **Then** veljajo enaka pravila kot v arhivirani skupini (`403` ali `409 GROUP_ARCHIVED`).

---

### User Story 6 - Izbris skupine (Priority: P2)

Uporabnik, ki je edini član skupine, jo dokončno izbriše skupaj z vsemi podatki. Kadar to ni mogoče, vidi razlago, zakaj.

**Why this priority**: omogoča pospravljanje nepotrebnih skupin in je edini izhod iz trajno arhivirane skupine za zadnjega člana.

**Independent Test**: lastnik, ki je edini član, izbriše skupino z vpisom njenega naslova; povezava do skupine nato vodi na »Te strani ni«.

**Acceptance Scenarios**:

1. **[FR-003-10]** **Given** lastnik je edini član skupine »Projekt FERI«, **When** v *Upravljanju skupine* izbere *Izbriši skupino*, **Then** se odpre potrditveni dialog »Izbrišem skupino Projekt FERI?« z besedilom posledic (izbrisani bodo vsi kontakti, revizijska sled in čakajoča povabila; izbrisa ni mogoče razveljaviti), poljem za vpis naslova skupine ter gumboma *Prekliči* in *Izbriši skupino*; fokus je na *Prekliči*.
2. **[FR-003-10]** **Given** odprt dialog za izbris, **When** uporabnik vpiše besedilo, ki se ne ujema z naslovom skupine, in izbere *Izbriši skupino*, **Then** se skupina ne izbriše in ob polju je napaka.
3. **[FR-003-09]** **[FR-003-10]** **Given** odprt dialog za izbris, **When** uporabnik vpiše natančen naslov skupine in potrdi, **Then** je skupina izbrisana, uporabnik je preusmerjen na zaslon *Skupine* in vidi obvestilo o uspehu.
4. **[FR-003-11]** **Given** skupina s kontakti, revizijsko sledjo in čakajočim povabilom je bila izbrisana, **When** kdor koli (tudi nekdanji član) odpre povezavo do skupine ali njenega kontakta, **Then** strežnik vrne `404` in vmesnik prikaže »Te strani ni«; čakajočega povabila povabljeni ne vidi več.
5. **[FR-003-09]** **Given** lastnik skupine z dvema članoma, **When** pošlje zahtevek za izbris skupine, **Then** strežnik vrne `409 GROUP_HAS_OTHER_MEMBERS` in nič se ne izbriše.
6. **[FR-003-10]** **Given** lastnik skupine z več člani, **When** odpre *Upravljanje skupine*, **Then** gumba *Izbriši skupino* ni, namesto njega je razlaga »Skupino lahko izbrišeš, ko si njen edini član.« (design.md 9.7, točka 4).
7. **[FR-003-09]** **Given** lastnik je edini član **arhivirane** skupine, **When** jo izbriše s potrditvijo, **Then** izbris uspe (izbris je v arhivirani skupini dovoljen).
8. **[FR-003-09]** **Given** trajno arhivirana skupina, katere edini preostali član je bralec, **When** ta izbriše skupino s potrditvijo, **Then** izbris uspe.
9. **[FR-003-09]** **Given** trajno arhivirana skupina z dvema članoma, **When** eden od njiju pošlje zahtevek za izbris, **Then** strežnik vrne `409 GROUP_HAS_OTHER_MEMBERS`.
10. **[FR-003-09]** **Given** admin nearhivirane skupine, **When** pošlje zahtevek za izbris skupine, **Then** strežnik vrne `403` in nič se ne izbriše.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-003-01, FR-003-06, FR-003-09 | neprijavljen (ni žetona, neveljaven ali potekel žeton) | arhiviraj / odarhiviraj / izbriši skupino | 401, nič se ne spremeni |
| FR-003-01, FR-003-06, FR-003-09 | prijavljen nečlan (ali skupina ne obstaja) | arhiviraj / odarhiviraj / izbriši skupino | 404, obstoj se ne razkrije, nič se ne spremeni |
| FR-003-01 | član z vlogo VIEWER, EDITOR ali ADMIN | arhiviraj skupino | 403, nič se ne spremeni |
| FR-003-01 | OWNER že arhivirane skupine | arhiviraj skupino | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-003-06 | član z vlogo VIEWER, EDITOR ali ADMIN | odarhiviraj skupino | 403, skupina ostane arhivirana |
| FR-003-06 | OWNER nearhivirane skupine | odarhiviraj skupino | 409 GROUP_NOT_ARCHIVED, nič se ne spremeni |
| FR-003-08 | kateri koli član trajno arhivirane skupine | odarhiviraj skupino | 403 (ni člana OWNER), skupina ostane trajno arhivirana |
| FR-003-03 | ADMIN ali OWNER arhivirane skupine | spremeni podatke skupine (002) ali katero koli drugo pisanje, ki ga vloga sicer dovoljuje | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-003-03 | član z vlogo pod najnižjo dovoljeno za to pisanje, v arhivirani skupini | pisanje | 403 (vloga pred stanjem), nič se ne spremeni |
| FR-003-03, FR-003-08 | kateri koli član trajno arhivirane skupine | pisanje, ki ga §2.4 ne dovoljuje | 403 ali 409 GROUP_ARCHIVED po vrstnem redu §2.2, nič se ne spremeni |
| FR-003-03 | kateri koli član arhivirane skupine | branje (podatki skupine, seznami) | 200 |
| FR-003-07 | neprijavljen | pridobi seznam arhiviranih skupin | 401 |
| FR-003-07 | prijavljen uporabnik | pridobi seznam arhiviranih skupin | vsebuje samo arhivirane skupine, katerih član je; tuje in nearhivirane niso vključene |
| FR-003-09 | član z vlogo VIEWER, EDITOR ali ADMIN nearhivirane ali arhivirane (ne trajno arhivirane) skupine | izbriši skupino | 403, nič se ne izbriše |
| FR-003-09 | OWNER skupine z vsaj enim drugim članom | izbriši skupino | 409 GROUP_HAS_OTHER_MEMBERS, nič se ne izbriše |
| FR-003-09 | član trajno arhivirane skupine z vsaj enim drugim članom | izbriši skupino | 409 GROUP_HAS_OTHER_MEMBERS, nič se ne izbriše |
| FR-003-11 | nekdanji član ali kdor koli po izbrisu | odpri skupino, njen kontakt, revizijsko sled ali povabilo vanjo | 404 |

### Edge Cases

- Arhiviranje ne zahteva pošiljanja verzije podatkov skupine; sočasno arhiviranje in urejanje podatkov se razreši tako, da je urejanje po arhiviranju zavrnjeno z `409 GROUP_ARCHIVED`.
- Dva sočasna zahtevka za arhiviranje: prvi uspe, drugi vrne `409 GROUP_ARCHIVED`; dva sočasna odarhiviranja: drugi vrne `409 GROUP_NOT_ARCHIVED`. Vmesnik v obeh primerih osveži stanje skupine.
- Med odprtim dialogom za izbris se pridruži nov član (sprejeto povabilo, 006): izbris vrne `409 GROUP_HAS_OTHER_MEMBERS`, dialog prikaže razumljivo sporočilo, skupina ostane nespremenjena.
- Vpis naslova pri potrditvi izbrisa se primerja z naslovom skupine po obrezu vodilnih in končnih presledkov, z enakimi velikimi in malimi črkami.
- Lastnik, ki je edini član in skupino ravnokar arhivira, jo lahko takoj tudi izbriše.
- Arhivirana skupina, katere lastnik ni edini član: *Izbriši skupino* ni izrisana, namesto nje je razlaga (FR-003-10).
- Član, ki je imel skupino odprto, ko je bila izbrisana: naslednji zahtevek vrne `404` in vmesnik prikaže »Te strani ni«.
- Oznaka vloge v arhivirani skupini ostane prvotna (npr. »Urednik«), čeprav ima član efektivno pravice bralca.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-003-01**: Sistem MORA lastniku nearhivirane skupine v *Nastavitve → Upravljanje skupine* (design.md 9.7, točka 4) ponuditi *Arhiviraj skupino* z enim stavkom razlage in jo po potrditvi v potrditvenem dialogu (design.md 8.11: vprašanje s predmetom, besedilo posledic, fokus na *Prekliči*, nevarni gumb »Arhiviraj skupino«) arhivirati, prikazati obvestilo o uspehu in skupino pustiti odprto v načinu samo za branje; arhiviranje že arhivirane skupine strežnik zavrne z `409 GROUP_ARCHIVED`. *(najnižja vloga: OWNER)*
- **FR-003-02**: Sistem MORA arhivirano skupino izločiti iz seznamov po vlogah (zaslon *Skupine*, stranski pas, preklop skupine – 002) in jo prikazati na seznamu *Arhivirane skupine*; člani ohranijo članstvo, vlogo in dostop za branje. *(najnižja vloga: VIEWER)*
- **FR-003-03**: Sistem MORA v arhivirani (tudi trajno arhivirani) skupini dovoliti samo operacije iz feature-map §2.4 – branje vseh podatkov skupine (kontakti, podrobnosti, iskanje, filtri, revizijska sled, člani, podatki skupine), izvoz izbranih kontaktov v Excel, zapuščanje skupine (007), izbris skupine (FR-003-09), odarhiviranje (FR-003-06) ter sprejem, zavrnitev in umik čakajočega povabila (006) [CR-02] – in vsako drugo pisanje nad podatki skupine (vključno s pošiljanjem povabil, spremembami vlog, odstranjevanjem članov, prenosom lastništva, urejanjem skupine, kontakti, rollbackom, dvojniki) zavrniti z `409 GROUP_ARCHIVED`, kadar ima član zanj sicer zadostno vlogo; preverjanja 401, 404 in 403 imajo prednost (feature-map §2.2); nič se ne spremeni. Pravilo velja za vse sedanje in prihodnje endpointe s pisanjem; vsaka funkcionalnost ga preveri za svoje endpointe. *(najnižja vloga: VIEWER za branje; za pisanje po posamezni operaciji)*
- **FR-003-04**: Sistem MORA v arhivirani skupini na vseh zaslonih skupine izpustiti akcije spreminjanja (izrišejo se le dovoljene po FR-003-03); kadar strežnik vrne `409 GROUP_ARCHIVED` (npr. skupina je bila arhivirana med urejanjem), vmesnik prikaže razumljivo sporočilo (design.md 8.13) in zaslon ponovno naloži v načinu samo za branje. *(najnižja vloga: VIEWER)*
- **FR-003-05**: Sistem MORA na vsakem zaslonu arhivirane skupine pod glavo prikazati pasico (design.md 9.11) z besedilom »Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.« in akcijo *Odarhiviraj skupino* samo za lastnika; pri trajno arhivirani skupini z besedilom »Skupina je trajno arhivirana, ker lastnik nima več računa.« brez akcije. *(najnižja vloga: VIEWER)*
- **FR-003-06**: Sistem MORA lastniku arhivirane skupine (v pasici in v *Upravljanju skupine*) omogočiti *Odarhiviraj skupino* brez potrditvenega dialoga; po uspehu skupina deluje kot pred arhiviranjem, vrne se v sezname po vlogah, prikaže se obvestilo o uspehu; odarhiviranje nearhivirane skupine strežnik zavrne z `409 GROUP_NOT_ARCHIVED`. *(najnižja vloga: OWNER)*
- **FR-003-07**: Sistem MORA prijavljenemu uporabniku na zaslonu *Arhivirane skupine* (povezava z zaslona *Skupine* in iz stranskega pasu; naslov strani »Arhivirane skupine – Kontakti«) prikazati arhivirane skupine, katerih član je, kot en seznam, urejen po naslovu abecedno in paginiran (privzeto 25, izbira 25/50/100, design.md 8.9); vrstica vsebuje jeziček, naslov, skrajšan opis, število kontaktov, oznako vloge in oznako *Arhivirano* ter odpre skupino; brez skupin prazno stanje »Nimaš arhiviranih skupin.« s povezavo *Na seznam skupin*. *(najnižja vloga: —)*
- **FR-003-08**: Sistem MORA podpirati stanje **trajno arhivirana skupina** (nastane z izbrisom računa lastnika arhivirane skupine, 012): skupina je arhivirana in nima člana z vlogo `OWNER`; povsod, kjer je prikazan lastnik (tudi opomba »lastnik: izbrisan uporabnik« na seznamu *Arhivirane skupine*), je prikazan »izbrisan uporabnik« (feature-map §2.5); ni je mogoče odarhivirati (vsak zahtevek zavrne `403`, akcija se ne izriše); zanjo veljajo vsa pravila FR-003-03; izbriše jo lahko zadnji preostali član s katero koli vlogo (FR-003-09). *(najnižja vloga: VIEWER)*
- **FR-003-09**: Sistem MORA izbris skupine dovoliti samo uporabniku, ki je njen edini član – v nearhivirani in arhivirani skupini je to lastnik (najnižja vloga OWNER), v trajno arhivirani skupini član s katero koli vlogo; izbris je dovoljen tudi v arhivirani skupini; če ima skupina še druge člane, ga strežnik zavrne z `409 GROUP_HAS_OTHER_MEMBERS` in nič se ne izbriše. *(najnižja vloga: OWNER; v trajno arhivirani skupini VIEWER)*
- **FR-003-10**: Sistem MORA v *Upravljanju skupine* ponuditi *Izbriši skupino* samo, kadar je izbris po FR-003-09 mogoč, sicer namesto gumba prikazati razlago »Skupino lahko izbrišeš, ko si njen edini član.«; izbris potrditi v potrditvenem dialogu z vpisom naslova skupine (design.md 8.11; fokus na *Prekliči*, ob neujemanju napaka ob polju in nič se ne izbriše); po uspehu uporabnika preusmeriti na zaslon *Skupine* z obvestilom o uspehu, ob neuspehu pa v dialogu prikazati razumljivo sporočilo. *(najnižja vloga: OWNER; v trajno arhivirani skupini VIEWER)*
- **FR-003-11**: Sistem MORA ob izbrisu skupine trajno odstraniti vse njene podatke – podatke skupine, članstva, kontakte z atributi in značkami, revizijsko sled in čakajoča povabila – tako, da po izbrisu vsak zahtevek do skupine ali njenih virov vrne `404`. *(najnižja vloga: OWNER; v trajno arhivirani skupini VIEWER)*

### Key Entities *(include if feature involves data)*

- **Skupina – stanje arhiviranosti**: `nearhivirana` → `arhivirana` (lastnik arhivira) → `nearhivirana` (lastnik odarhivira); `arhivirana` → `trajno arhivirana` (izbris računa lastnika, 012; končno stanje, iz katerega je mogoč le izbris). Trajno arhivirana skupina nima lastnika.
- **Izbris skupine**: dokončna odstranitev skupine in vseh njenih odvisnih podatkov (članstva, kontakti, revizijska sled, čakajoča povabila).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: V 100 % preizkušenih operacij pisanja v arhivirani skupini se nič ne spremeni (strežnik vrne `403` ali `409 GROUP_ARCHIVED`).
- **SC-002**: Na 100 % zaslonov arhivirane skupine je vidna pasica in ni izrisana nobena akcija spreminjanja, ki je pravila ne dovoljujejo.
- **SC-003**: Lastnik arhivira ali odarhivira skupino v manj kot 30 sekundah od odprtja *Nastavitev*.
- **SC-004**: Po izbrisu skupine ostane 0 dostopnih podatkov skupine (kontakti, revizijska sled, povabila, članstva) za katerega koli uporabnika.
- **SC-005**: Nobena skupina se ne izbriše brez vpisa njenega naslova in nobena skupina z več člani se ne izbriše.
- **SC-006**: Zasloni in dialogi te funkcionalnosti so brez kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px, v slovenščini in angleščini.

## Assumptions

- Odvisnost od **002-skupine**: skupina, članstva, glava skupine (oznaka *Arhivirano*), seznami po vlogah, stranski pas in *Nastavitve*; 003 doda razdelek *Upravljanje skupine* z akcijami arhiviranja, odarhiviranja in izbrisa ter povezavo *Arhivirane skupine*.
- **Splošno pravilo FR-003-03** velja za vse funkcionalnosti; 004–011 v svojih negativnih scenarijih preverijo `409 GROUP_ARCHIVED` za svoje endpointe s pisanjem, 003 ga preveri za svoje endpointe in za urejanje podatkov skupine (002).
- **Odarhiviranje trajno arhivirane skupine** vrne `403`, ker skupina nima člana `OWNER` in se vloga preverja pred poslovnimi pravili (feature-map §2.2); posebna koda (npr. `GROUP_PERMANENTLY_ARCHIVED`) zato ni potrebna.
- **Odarhiviranje ni nevarna operacija** (ni na seznamu feature-map §2.8), zato nima potrditvenega dialoga.
- Arhiviranje in odarhiviranje ne zahtevata pošiljanja verzije; konflikt rešujeta kodi `GROUP_ARCHIVED` in `GROUP_NOT_ARCHIVED`.
- Potrditev izbrisa z vpisom naslova je zaščita v vmesniku; strežnik pri izbrisu preverja pravila FR-003-09.
- Stanje *trajno arhivirana* nastane izključno v **012-moji-podatki** (izbris računa); 003 določa samo stanje in njegova pravila. V testih se stanje pripravi s testnimi podatki.
- **Zapuščanje skupine** pripada **007-clani**; pravilo, da zadnji član trajno arhivirane skupine ne more zapustiti in jo lahko le izbriše (feature-map §2.4), mora upoštevati 007.
- **Povabila** (006): pošiljanje povabila v arhivirano skupino je pisanje in zanj velja FR-003-03 (`409 GROUP_ARCHIVED`); sprejem, zavrnitev in umik čakajočega povabila so v arhivirani in trajno arhivirani skupini dovoljeni (feature-map §2.4) [CR-02] – sprejeti član ima do odarhiviranja efektivno pravice bralca; ob izbrisu skupine se čakajoča povabila izbrišejo (FR-003-11) in izginejo s seznama prejetih povabil.
- Seznam arhiviranih skupin ni razdeljen po vlogah (vloga je oznaka v vrstici), ker design.md 9.2 predvideva en seznam z oznako *Arhivirano*.
- Arhiviranje, odarhiviranje in izbris skupine se ne beležijo v revizijski sledi (ta beleži spremembe kontaktov; ob izbrisu se izbriše tudi sama).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| CR-02 | 2026-11-08 | FR-003-03 | V arhivirani in trajno arhivirani skupini so dovoljeni tudi sprejem, zavrnitev in umik čakajočega povabila (006); pošiljanje povabil ostane zavrnjeno z `409 GROUP_ARCHIVED`. Predpostavka *Povabila* usklajena. Testi 003 niso prizadeti (endpointov za povabila v 003 ni). | D-54, D-56 |
