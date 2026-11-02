# Feature Specification: Upravljanje članov skupine

**Feature Branch**: `clani` (no number; the directory is `specs/007-clani/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Upravljanje članov skupine: seznam članov, spreminjanje vloge članov in odstranjevanje članov (lastnik in admin, le nižjim od sebe), zapuščanje skupine (vsi člani razen lastnika; izjema so trajno arhivirane skupine brez lastnika, kjer zadnji član skupine ne more zapustiti, lahko jo le izbriše) in prenos lastništva (lastnik preda vlogo drugemu članu in sam postane admin)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seznam članov skupine (Priority: P1)

Vsak član skupine v *Nastavitvah* skupine v razdelku *Člani* vidi paginirano preglednico članov: ime, e-naslov in vlogo. Lastnik in admin ob članih, ki jih smeta upravljati, vidita meni dejanj.

**Why this priority**: Seznam je osnova za vse druge operacije nad člani in daje članom preglednost, kdo ima dostop do kontaktov.

**Independent Test**: Skupina s člani vseh vlog; bralec odpre *Nastavitve* in vidi vse člane z vlogami, brez menijev dejanj.

**Acceptance Scenarios**:

1. **[FR-007-01]** **Given** skupina z lastnikom, adminom, urednikom in bralcem, **When** bralec odpre *Nastavitve* skupine, **Then** v razdelku *Člani* vidi preglednico *Član · E-naslov · Vloga · Dejanja* (design.md 9.7, točka 2) z vsemi štirimi člani, razvrščenimi po vlogi (*Lastnik*, *Admin*, *Urednik*, *Bralec*) in nato po imenu; svoja vrstica je označena z »(ti)«.
2. **[FR-007-01]** **Given** skupina z več kot 25 člani, **When** član odpre razdelek *Člani*, **Then** je seznam paginiran (privzeto 25 na stran, izbira 25 / 50 / 100).
3. **[FR-007-01]** **Given** arhivirana skupina, **When** kateri koli član odpre *Nastavitve*, **Then** vidi seznam članov (branje je dovoljeno).
4. **[FR-007-01]** **Given** trajno arhivirana skupina (003, 012), **When** član odpre seznam članov, **Then** je kot lastnik prikazano »izbrisan uporabnik« (design.md 8.5) brez e-naslova in brez dejanj.
5. **[FR-007-02]** **Given** admin nearhivirane skupine, **When** odpre seznam članov, **Then** ima meni dejanj (*Spremeni vlogo*, *Odstrani iz skupine*) samo ob urednikih in bralcih, ne ob sebi, drugih adminih ali lastniku.
6. **[FR-007-02]** **Given** lastnik nearhivirane skupine, **When** odpre seznam članov, **Then** ima meni dejanj ob vseh adminih, urednikih in bralcih, ne ob sebi.
7. **[FR-007-02]** **Given** urednik ali bralec oziroma kateri koli član arhivirane skupine, **When** odpre seznam članov, **Then** ni izrisan noben meni dejanj.

---

### User Story 2 - Sprememba vloge člana (Priority: P1)

Lastnik ali admin članu z nižjo vlogo dodeli drugo vlogo, ki je nižja od njegove lastne. Če je vlogo medtem spremenil kdo drug, sistem spremembo zavrne in ponudi razrešitev.

**Why this priority**: Zahteve izrecno predvidevajo prilagajanje pravic; brez tega je edina pot odstranitev in ponovno vabilo.

**Independent Test**: Lastnik spremeni bralca v admina; bralec ima nato pravice admina. Admin poskusi isto in ne more.

**Acceptance Scenarios**:

1. **[FR-007-03]** **Given** lastnik in član z vlogo *Bralec*, **When** lastnik izbere *Spremeni vlogo*, **Then** se odpre potrditveni dialog (design.md 8.11) z naslovom »Spremenim vlogo člana ‹ime›?«, izbirnimi gumbi *Admin*, *Urednik*, *Bralec* (označena trenutna vloga, nikoli *Lastnik*), fokusom na *Prekliči* in nevarnim gumbom »Spremeni vlogo«.
2. **[FR-007-03]** **Given** odprt dialog, **When** lastnik izbere *Admin* in potrdi, **Then** ima član vlogo *Admin*, seznam prikazuje novo vlogo in pokaže se obvestilo »Vloga člana ‹ime› je spremenjena v Admin.«
3. **[FR-007-03]** **Given** admin in član z vlogo *Urednik*, **When** admin odpre *Spremeni vlogo*, **Then** dialog ponuja samo *Urednik* in *Bralec*.
4. **[FR-007-03]** **Given** admin, **When** pošlje spremembo vloge drugega admina ali lastnika, ali dodeli vlogo *Admin* ali *Lastnik*, **Then** sistem vrne 403 in vloga se ne spremeni.
5. **[FR-007-03]** **Given** odprt dialog, **When** uporabnik potrdi, ne da bi izbral vlogo, drugačno od trenutne, **Then** sistem vrne 400 `VALIDATION_FAILED` in v dialogu se pokaže »Izberi drugo vlogo.«
6. **[FR-007-04]** **Given** lastnik in admin sta hkrati odprla dialog za istega urednika, admin je vlogo že spremenil v *Bralec*, **When** lastnik potrdi spremembo z verzijo, ki jo je videl, **Then** sistem vrne 409 `VERSION_CONFLICT`, vloga ostane *Bralec*, dialog ostane odprt z opozorilom »Vlogo člana je medtem spremenil(a) ‹ime› ob ‹čas›.« in možnostma *Uporabi trenutno različico* (naloži trenutno vlogo) in *Shrani moje spremembe* (ponovno pošlje izbiro nad trenutno verzijo) (design.md 8.14).

---

### User Story 3 - Odstranitev člana (Priority: P1)

Lastnik ali admin po potrditvi odstrani člana z nižjo vlogo; odstranjeni takoj izgubi dostop do skupine.

**Why this priority**: Odvzem dostopa je ključen za varnost podatkov skupine (konstitucija III).

**Independent Test**: Admin odstrani urednika; urednik pri naslednjem zahtevku za skupino dobi 404, skupine ni več na njegovem seznamu.

**Acceptance Scenarios**:

1. **[FR-007-05]** **Given** admin in urednik skupine, **When** admin izbere *Odstrani iz skupine*, **Then** se odpre potrditveni dialog z naslovom »Odstranim ‹ime› iz skupine ‹naslov›?«, besedilom »‹ime› ne bo več imel(a) dostopa do kontaktov skupine.«, fokusom na *Prekliči* in nevarnim gumbom »Odstrani člana«.
2. **[FR-007-05]** **Given** odprt dialog, **When** admin potrdi, **Then** urednik ni več član, izgine s seznama članov in pokaže se obvestilo »‹ime› je odstranjen(a) iz skupine.«
3. **[FR-007-05]** **Given** urednik je bil odstranjen, **When** pošlje kateri koli zahtevek za to skupino (kontakti, nastavitve, revizijska sled), **Then** dobi 404, skupine ni na njegovem seznamu skupin, odprta stran skupine ob naslednji akciji prikaže stran »Te strani ni«.
4. **[FR-007-05]** **Given** admin, **When** pošlje odstranitev drugega admina, lastnika ali sebe, **Then** sistem vrne 403 in nihče ni odstranjen.
5. **[FR-007-05]** **Given** odstranjeni urednik je pred tem urejal kontakte, **When** kdor koli odpre revizijsko sled skupine, **Then** so njegovi vnosi še vedno prikazani z njegovim imenom.

---

### User Story 4 - Zapuščanje skupine (Priority: P2)

Član, ki ni lastnik, po potrditvi zapusti skupino in pride na seznam skupin. Lastnik dobi razlago, da mora najprej prenesti lastništvo; zadnji član trajno arhivirane skupine dobi razlago, da jo lahko le izbriše.

**Why this priority**: Uporabnik mora imeti nadzor nad lastnim članstvom, a je funkcionalnost ločena od upravljanja drugih.

**Independent Test**: Bralec zapusti skupino in skupine ni več na njegovem seznamu; lastnik in zadnji član trajno arhivirane skupine tega ne moreta.

**Acceptance Scenarios**:

1. **[FR-007-06]** **Given** urednik skupine, **When** v *Nastavitvah* v razdelku *Upravljanje skupine* izbere *Zapusti skupino*, **Then** se odpre potrditveni dialog z naslovom »Zapustim skupino ‹naslov›?«, besedilom »Do kontaktov skupine ne boš imel(a) več dostopa, dokler te znova ne povabijo.«, fokusom na *Prekliči* in nevarnim gumbom »Zapusti skupino«.
2. **[FR-007-06]** **Given** odprt dialog, **When** urednik potrdi, **Then** ni več član, prikaže se seznam skupin z obvestilom »Zapustil(a) si skupino ‹naslov›.« in skupine ni več na seznamu.
3. **[FR-007-06]** **Given** bralec arhivirane skupine, **When** zapusti skupino in potrdi, **Then** zapuščanje uspe.
4. **[FR-007-07]** **Given** lastnik skupine, **When** odpre *Nastavitve*, **Then** gumb *Zapusti skupino* ni izrisan, namesto njega je razlaga »Kot lastnik lahko skupino zapustiš šele, ko preneseš lastništvo na drugega člana.«; **And When** lastnik vseeno pošlje zahtevek za zapuščanje, **Then** sistem vrne 409 `OWNER_CANNOT_LEAVE` in lastnik ostane član.
5. **[FR-007-08]** **Given** trajno arhivirana skupina z enim samim članom, **When** ta član odpre *Nastavitve*, **Then** gumb *Zapusti skupino* ni izrisan, namesto njega je razlaga »Kot zadnji član skupine je ne moreš zapustiti, lahko jo le izbrišeš.«; **And When** vseeno pošlje zahtevek za zapuščanje, **Then** sistem vrne 409 `LAST_MEMBER_CANNOT_LEAVE` in ostane član.
6. **[FR-007-08]** **Given** trajno arhivirana skupina z dvema članoma, **When** eden od njiju zapusti skupino, **Then** zapuščanje uspe; preostali član je zdaj zadnji in je ne more zapustiti.

---

### User Story 5 - Prenos lastništva (Priority: P2)

Lastnik preda lastništvo drugemu članu; po potrditvi z vpisom naslova skupine postane izbrani član lastnik, prejšnji lastnik pa admin.

**Why this priority**: Pogoj, da lastnik lahko zapusti skupino ali izbriše račun (012); redkejša operacija.

**Independent Test**: Lastnik prenese lastništvo na bralca; bralec je lastnik, prejšnji lastnik admin, v skupini je natanko en lastnik.

**Acceptance Scenarios**:

1. **[FR-007-09]** **Given** lastnik nearhivirane skupine z več člani, **When** v *Upravljanju skupine* izbere *Prenesi lastništvo*, **Then** se odpre potrditveni dialog z izbiro enega od ostalih članov, besedilom »‹ime› bo postal(a) lastnik, ti pa boš admin.«, poljem za vpis naslova skupine, fokusom na *Prekliči* in nevarnim gumbom »Prenesi lastništvo« (design.md 8.11).
2. **[FR-007-09]** **Given** odprt dialog z izbranim članom, **When** lastnik vpiše napačen naslov skupine in klikne »Prenesi lastništvo«, **Then** se ob polju pokaže napaka »Vpisani naslov se ne ujema z naslovom skupine.« in nič se ne spremeni.
3. **[FR-007-09]** **Given** odprt dialog z izbranim bralcem in pravilno vpisanim naslovom, **When** lastnik potrdi, **Then** je bralec lastnik, prejšnji lastnik je admin, v skupini je natanko en lastnik, prikaže se obvestilo »Lastništvo je preneseno na ‹ime›.« in *Nastavitve* prikazujejo možnosti za vlogo admina.
4. **[FR-007-09]** **Given** lastnik skupine, v kateri je edini član, **When** odpre *Upravljanje skupine*, **Then** *Prenesi lastništvo* ni izrisan; namesto njega je razlaga »Lastništvo lahko preneseš, ko ima skupina še vsaj enega člana.«
5. **[FR-007-09]** **Given** izbrani član je medtem zapustil skupino ali bil odstranjen, **When** lastnik potrdi prenos, **Then** sistem vrne 409 `TARGET_NOT_MEMBER`, nič se ne spremeni in dialog prikaže »Izbrani uporabnik ni več član skupine.«

---

### User Story 6 - Zaščita arhivirane skupine in sporočila (Priority: P2)

V arhivirani skupini sprememb vlog, odstranitev in prenosa lastništva ni; zapuščanje je dovoljeno. Vsak uspeh in neuspeh je viden.

**Why this priority**: Skupno pravilo §2.4; brez tega bi arhivirana skupina ne bila »zamrznjena«.

**Independent Test**: Lastnik arhivirane skupine poskusi spremeniti vlogo, odstraniti člana in prenesti lastništvo; vsak poskus vrne 409 `GROUP_ARCHIVED`, akcije niso izrisane.

**Acceptance Scenarios**:

1. **[FR-007-10]** **Given** arhivirana skupina, **When** lastnik ali admin pošlje spremembo vloge, odstranitev člana ali (lastnik) prenos lastništva, **Then** sistem vrne 409 `GROUP_ARCHIVED` in nič se ne spremeni; v vmesniku teh akcij ni.
2. **[FR-007-11]** **Given** strežnik akcijo nad člani zavrne ali povezava ni na voljo, **When** se odgovor vrne, **Then** je na mestu akcije prikazano razumljivo sporočilo v jeziku vmesnika brez tehničnih kod (design.md 8.13), npr. »Skupina je arhivirana, članov zdaj ni mogoče spreminjati.«
3. **[FR-007-12]** **Given** urednik, ki je urejal kontakte, je skupino zapustil, **When** kdor koli pogleda revizijsko sled skupine, **Then** so vnosi prikazani z njegovim imenom, sprememb članstva pa v revizijski sledi ni.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-007-01, FR-007-03, FR-007-05, FR-007-06, FR-007-09 | neprijavljen (brez / neveljaven / potekel žeton) | seznam, sprememba vloge, odstranitev, zapuščanje, prenos | 401, nič se ne spremeni |
| FR-007-01, FR-007-03, FR-007-05, FR-007-06, FR-007-09 | prijavljen nečlan (tudi neobstoječa skupina, odstranjen ali bivši član) | katera koli od operacij | 404, obstoj skupine se ne razkrije |
| FR-007-03, FR-007-05 | član skupine A, ki naslovi članstvo iz skupine B | sprememba vloge / odstranitev | 404 |
| FR-007-03, FR-007-05 | ADMIN ali OWNER | ciljni uporabnik ni član skupine | 404 |
| FR-007-01 | VIEWER (najnižja vloga) | seznam članov | uspeh – vsi člani smejo brati; tudi v arhivirani skupini |
| FR-007-03, FR-007-05 | VIEWER ali EDITOR | sprememba vloge / odstranitev kogar koli | 403 |
| FR-007-03, FR-007-05 | ADMIN | cilj je ADMIN ali OWNER | 403 (»le nižjim od sebe«) |
| FR-007-03, FR-007-05 | ADMIN ali OWNER | cilj je lastno članstvo | 403 |
| FR-007-03 | ADMIN | dodeli vlogo ADMIN ali OWNER | 403 |
| FR-007-03 | OWNER | dodeli vlogo OWNER | 403 (lastništvo samo s prenosom) |
| FR-007-03 | ADMIN ali OWNER | manjkajoča, neznana ali enaka trenutni vlogi | 400 `VALIDATION_FAILED` |
| FR-007-04 | ADMIN ali OWNER | sprememba vloge z zastarelo verzijo članstva | 409 `VERSION_CONFLICT`, vloga se ne spremeni |
| FR-007-10 | ADMIN ali OWNER arhivirane skupine; ADMIN trajno arhivirane skupine | sprememba vloge / odstranitev člana z nižjo vlogo | 409 `GROUP_ARCHIVED` |
| FR-007-10 | VIEWER ali EDITOR arhivirane skupine | sprememba vloge / odstranitev | 403 (vloga se preveri pred stanjem skupine) |
| FR-007-06 | VIEWER, EDITOR ali ADMIN arhivirane skupine | zapuščanje | uspeh – zapuščanje je v arhivirani skupini dovoljeno |
| FR-007-07 | OWNER (tudi arhivirane skupine) | zapuščanje | 409 `OWNER_CANNOT_LEAVE`, ostane član |
| FR-007-08 | zadnji član trajno arhivirane skupine | zapuščanje | 409 `LAST_MEMBER_CANNOT_LEAVE`, ostane član |
| FR-007-09 | VIEWER, EDITOR ali ADMIN (tudi vsi člani trajno arhivirane skupine) | prenos lastništva | 403 |
| FR-007-09 | OWNER | manjkajoč cilj ali cilj je on sam | 400 `VALIDATION_FAILED` |
| FR-007-09 | OWNER | cilj ni (več) član skupine | 409 `TARGET_NOT_MEMBER` |
| FR-007-10 | OWNER arhivirane skupine | prenos lastništva | 409 `GROUP_ARCHIVED` |
| FR-007-05 | odstranjen član | kateri koli zahtevek za skupino po odstranitvi | 404 |

### Edge Cases

- **Sočasna odstranitev in sprememba vloge istega člana:** če je član že odstranjen, sprememba vloge vrne 404 in vmesnik osveži seznam.
- **Ciljnemu članu je bila vloga medtem zvišana na raven upravljavca ali višje** (npr. admin hoče spremeniti urednika, ki ga je lastnik medtem naredil za admina): preverjanje »le nižjim od sebe« uporabi trenutno vlogo → 403; vmesnik pokaže »Tega člana ne moreš več upravljati.« in osveži seznam.
- **Upravljavec je medtem sam izgubil vlogo** (znižan, odstranjen): naslednja akcija vrne 403 oziroma 404 glede na novo stanje.
- **Dva sočasna prenosa lastništva:** uspe samo prvi; drugi vrne 403, ker pošiljatelj ni več lastnik.
- **Prenos lastništva na admina ali bralca:** dovoljen na katerega koli drugega člana ne glede na vlogo; cilj postane OWNER, prejšnji lastnik ADMIN.
- **Odstranjeni ali bivši član ima odprto stran skupine:** naslednji zahtevek vrne 404 in vmesnik prikaže stran »Te strani ni« (design.md 9.10).
- **Ponovni vstop:** bivšega ali odstranjenega člana je mogoče znova povabiti (006); po sprejemu ima novo ponujeno vlogo.
- **Čakajoča povabila, ki jih je poslal odstranjeni ali bivši član, ostanejo veljavna** (006).
- **Član z več kot eno stranjo seznama**: paginacija ohrani vrstni red, menjava strani ne izgubi fokusa (design.md 8.9).
- **Trajno arhivirana skupina:** lastnika ni, zato nihče nima vloge, ki bi omogočala spremembe; vsi člani razen zadnjega jo lahko zapustijo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-007-01**: Sistem MORA vsem članom skupine v *Nastavitvah* v razdelku *Člani* prikazati paginiran seznam (§2.6) članov z imenom, e-naslovom in vlogo, razvrščen po vlogi od najvišje in nato po imenu, z označeno lastno vrstico; v trajno arhivirani skupini je kot lastnik prikazan »izbrisan uporabnik« brez e-naslova in dejanj; branje je dovoljeno tudi v arhivirani skupini. *(najnižja vloga: VIEWER)*
- **FR-007-02**: Sistem MORA meni dejanj (*Spremeni vlogo*, *Odstrani iz skupine*) izrisati samo ob članih s strogo nižjo vlogo od trenutnega uporabnika, samo za lastnika in admina in samo v nearhivirani skupini; ob lastni vrstici menija ni. *(najnižja vloga: ADMIN)*
- **FR-007-03**: Sistem MORA lastniku in adminu omogočiti spremembo vloge člana s strogo nižjo vlogo v vlogo, ki je strogo nižja od lastne in ni OWNER, prek potrditvenega dialoga z izbirnimi gumbi samo dovoljenih vlog (design.md 8.11, fokus na *Prekliči*); kršitev pravila »le nižjim od sebe« ali sprememba lastnega članstva vrne 403, enaka, manjkajoča ali neznana vloga 400 `VALIDATION_FAILED`. *(najnižja vloga: ADMIN)*
- **FR-007-04**: Sistem MORA pri spremembi vloge uporabiti optimistično zaklepanje članstva: zahtevek nosi verzijo članstva, ki jo je uporabnik videl; ob neujemanju vrne `409 VERSION_CONFLICT`, vloga ostane nespremenjena, vmesnik pa prikaže opozorilo in razrešitev po vzorcu design.md 8.14. *(najnižja vloga: ADMIN)*
- **FR-007-05**: Sistem MORA lastniku in adminu po potrditvi v potrditvenem dialogu (design.md 8.11) omogočiti odstranitev člana s strogo nižjo vlogo; odstranitev sebe, enakovrednega ali višjega člana vrne 403; odstranjeni takoj izgubi dostop (vsak nadaljnji zahtevek za skupino vrne 404), skupina izgine z njegovega seznama skupin. *(najnižja vloga: ADMIN)*
- **FR-007-06**: Sistem MORA vsakemu članu, ki ni lastnik, po potrditvi v potrditvenem dialogu omogočiti zapuščanje skupine, tudi arhivirane; po zapuščanju član izgubi dostop (404), vmesnik pa prikaže seznam skupin z obvestilom o uspehu. *(najnižja vloga: VIEWER)*
- **FR-007-07**: Sistem MORA zapuščanje skupine s strani lastnika zavrniti z `409 OWNER_CANNOT_LEAVE`; vmesnik lastniku namesto gumba *Zapusti skupino* prikaže razlago, da mora najprej prenesti lastništvo. *(najnižja vloga: OWNER)*
- **FR-007-08**: Sistem MORA v trajno arhivirani skupini zapuščanje zadnjega preostalega člana zavrniti z `409 LAST_MEMBER_CANNOT_LEAVE`; vmesnik mu namesto gumba *Zapusti skupino* prikaže razlago, da lahko skupino le izbriše (003). *(najnižja vloga: VIEWER)*
- **FR-007-09**: Sistem MORA lastniku nearhivirane skupine omogočiti prenos lastništva na katerega koli drugega člana s potrditvijo z vpisom naslova skupine (design.md 8.11); prenos je atomaren – cilj postane OWNER, prejšnji lastnik ADMIN, skupina ima ves čas natanko enega lastnika; neujemanje vpisanega naslova prikaže napako ob polju brez pošiljanja; manjkajoč cilj ali cilj sam lastnik vrne 400 `VALIDATION_FAILED`, cilj, ki ni član, `409 TARGET_NOT_MEMBER`; akcija ni izrisana, če je lastnik edini član. *(najnižja vloga: OWNER)*
- **FR-007-10**: Sistem MORA v arhivirani (tudi trajno arhivirani) skupini zavrniti spremembo vloge, odstranitev člana in prenos lastništva z `409 GROUP_ARCHIVED` (članom z zadostno vlogo; drugim 403 po §2.2) in teh akcij ne izrisati; zapuščanje ostane dovoljeno. *(najnižja vloga: ADMIN)*
- **FR-007-11**: Sistem MORA vsak uspeh operacije nad člani prikazati z obvestilom, vsak neuspeh (vključno z `VERSION_CONFLICT`, `GROUP_ARCHIVED`, `OWNER_CANNOT_LEAVE`, `LAST_MEMBER_CANNOT_LEAVE`, `TARGET_NOT_MEMBER`, 403, 404) pa z razumljivim sporočilom v sl/en na mestu akcije, brez tehničnih kod (design.md 8.13). *(najnižja vloga: VIEWER)*
- **FR-007-12**: Sistem MORA ohraniti ime odstranjenega ali bivšega člana v obstoječih vnosih revizijske sledi kontaktov in sprememb članstva (sprememba vloge, odstranitev, zapuščanje, prenos lastništva) NE beležiti v revizijski sledi kontaktov (§2.7, 005). *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Članstvo**: povezava uporabnika in skupine z vlogo (OWNER, ADMIN, EDITOR, VIEWER) in verzijo za optimistično zaklepanje; nastane ob ustvarjanju skupine (002) ali sprejemu povabila (006); preneha z odstranitvijo, zapuščanjem, izbrisom skupine (003) ali izbrisom računa (012). Nearhivirana skupina ima natanko eno članstvo z vlogo OWNER, trajno arhivirana nobenega.
- **Skupina** (002, 003): ima stanje (aktivna, arhivirana, trajno arhivirana), ki določa, katere operacije nad člani so dovoljene.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Po odstranitvi ali zapustitvi 100 % nadaljnjih zahtevkov bivšega člana za to skupino vrne 404 (preverjeno v matriki izolacije za vsak endpoint skupine).
- **SC-002**: V 100 % preizkušenih sočasnih sprememb vloge istega člana se ohrani natanko ena sprememba, druga pa je zavrnjena s konfliktom; nobena sprememba se ne prepiše tiho.
- **SC-003**: Po vsakem prenosu lastništva ima skupina natanko enega lastnika (0 primerov z dvema ali nobenim lastnikom v testih, vključno s sočasnimi prenosi).
- **SC-004**: Lastnik ali admin spremeni vlogo člana ali ga odstrani v največ štirih dejanjih od odprtja *Nastavitev* (meni, akcija, izbira, potrditev).
- **SC-005**: Vsaka dovoljena in prepovedana kombinacija vloge upravljavca, vloge cilja in dodeljene vloge (matrika »le nižjim od sebe«) ima test in v 100 % vrne pričakovani odgovor.
- **SC-006**: Razdelka *Člani* in *Upravljanje skupine* ter vsi dialogi te funkcionalnosti nimajo kršitev WCAG 2.1 A/AA pri samodejnem preverjanju in so uporabni pri 320 px širine in s tipkovnico.

## Assumptions

- **Odvisnosti:** 002-skupine (skupine, članstva, *Nastavitve* skupine, seznam skupin po vlogah), 003-arhiviranje (arhivirana in trajno arhivirana skupina, izbris skupine – zadnji član trajno arhivirane skupine jo izbriše tam), 006-povabila (nastanek članstva s sprejemom povabila; ponovno vabljenje bivših članov), 005-revizijska-sled (prikaz imen izvajalcev), 012-moji-podatki (izbris računa odstrani članstva in povzroči trajno arhivirane skupine).
- **Vrstni red preverjanj** po §2.2: 401 → 404 (nečlan; ciljno članstvo ne obstaja v tej skupini) → 403 (vloga pod najnižjo dovoljeno, »le nižjim od sebe« po trenutnih vlogah, lastno članstvo, dodelitev OWNER) → 409 `GROUP_ARCHIVED` → 409 `VERSION_CONFLICT` (samo sprememba vloge) → 400 `VALIDATION_FAILED` → 409 poslovna pravila (`OWNER_CANNOT_LEAVE`, `LAST_MEMBER_CANNOT_LEAVE`, `TARGET_NOT_MEMBER`).
- **Imenovane kode** (nove): `OWNER_CANNOT_LEAVE`, `LAST_MEMBER_CANNOT_LEAVE`, `TARGET_NOT_MEMBER`.
- **Optimistično zaklepanje** se uporablja za spremembo vloge (verzija članstva). Odstranitev in prenos lastništva verzije ne pošiljata: odstranitev je idempotentna glede cilja (drugič 404), »le nižjim od sebe« pa se vedno preveri po trenutnih vlogah; sočasen prenos je zaščiten s preverjanjem, da je pošiljatelj še lastnik.
- **Prenos lastništva** je mogoč na katerega koli drugega člana, ne glede na njegovo vlogo; prejšnji lastnik postane ADMIN in lahko nato skupino zapusti.
- **Prenos lastništva** se potrdi z vpisom naslova skupine; ujemanje preveri vmesnik (enaka pravila primerjave kot pri izbrisu skupine v 003). Zaledje potrditve ne preverja – to je zaščita pred napako uporabnika, ne varnostna meja.
- **Sprememba v isto vlogo** se zavrne kot neveljaven podatek (400), da je odziv nedvoumen.
- **Razvrščanje članov:** po vlogi (Lastnik, Admin, Urednik, Bralec), nato po imenu po pravilih jezika vmesnika; ime je prikazno ime iz Google računa.
- **Trajno arhivirana skupina** na seznamu članov prikaže informativno vrstico »izbrisan uporabnik« z vlogo *Lastnik* (§2.4), ki ni članstvo in se ne šteje pri pravilu zadnjega člana.
- **Obveščanje:** odstranjeni ali član s spremenjeno vlogo ni posebej obveščen; spremembo vidi ob naslednjem zahtevku.
- **Revizijska sled** zajema samo kontakte (005); spremembe članstva niso zabeležene. Imena odstranjenih in bivših članov v revizijski sledi ostanejo; samo izbris računa (012) jih nadomesti z »izbrisan uporabnik«.
- Seznam članov je za vse člane enak (vključno z e-naslovi): zahteve in design.md 9.7 predvidevajo e-naslov v preglednici; člani skupine si delijo kontakte in so si medsebojno znani.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
