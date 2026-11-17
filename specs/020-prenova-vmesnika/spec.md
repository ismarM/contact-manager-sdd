# Feature Specification: Prenova vmesnika (Kartoteka v2)

**Feature Branch**: `prenova-vmesnika` (no number; the directory is `specs/020-prenova-vmesnika/`)

**Created**: 2026-11-17

**Input**: User description: "an app redesign. apply the design system i shared with you along with the designs i added."

**Viri oblikovanja** (zunanja, samo za branje; ob spremembi obvelja različica, iz katere je bil posodobljen `design.md`):

- oblikovni sistem *Kartoteka, refined* (v2): https://claude.ai/code/artifact/3c27f387-2de3-41da-a88e-d47c39f36e74 – pravila (`README.md`) in žetoni (`tokens.json`, različica `1794925463-fd13`);
- platno *Contacts — app redesign*: https://claude.ai/code/artifact/3666557c-f681-4357-828f-92c45377c803 – 25 zaslonov (namizje 1440 px in telefon 390 px) in 16 dialogov (različica `1794925188-cb58`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Novi temelji videza (Priority: P1)

Uporabnik v svetli in temni temi vidi umirjen, »papirnat« videz Kartoteke v2: toplo ozadje, mehke bele kartice, skoraj črno besedilo in en sam modri poudarek; naslovi so lažji in bolj prečiščeni, zaobljenosti in sence so po novi lestvici. Vse, kar je bilo prej mogoče narediti, deluje enako.

**Why this priority**: vse druge zgodbe gradijo na novih žetonih; brez njih bi vsak zaslon uvajal svoje vrednosti.

**Independent Test**: obstoječi zasloni se izrišejo z novimi žetoni v obeh temah in v načinu vsiljenih barv, brez kršitev axe in brez spremembe vedenja.

**Acceptance Scenarios**:

1. **[FR-020-01]** **Given** prijavljen uporabnik v svetli ali temni temi, **When** odpre katerikoli zaslon, **Then** so vse barve, pisave, razmiki, zaobljenosti, sence in trajanja gibanja iz žetonov Kartoteke v2 in nobena vrednost ni zapisana mimo žetonov.
2. **[FR-020-02]** **Given** besedilo ali rob kontrolnika na kateremkoli sloju (ozadje, kartica, plavajoči sloj, pogreznjena površina), **When** se izmeri kontrast, **Then** besedilo dosega vsaj 4,5 : 1 in robovi kontrolnikov vsaj 3 : 1 v obeh temah.
3. **[FR-020-03]** **Given** uporabnik z nastavitvijo zmanjšanega gibanja, **When** se odprejo meniji, dialogi, obvestila ali seznami, **Then** se nič ne premika in okostja nalaganja so mirna.
4. **[FR-020-04]** **Given** način vsiljenih barv, **When** uporabnik uporablja aplikacijo, **Then** so plasti, kontrolniki, izbor in fokus vidni z realnimi robovi in sistemskimi barvami.

---

### User Story 2 - Novo ogrodje in navigacija (Priority: P1)

Uporabnik se orientira prek vitke stranske vrstice z enakovrednimi postavkami *Skupine*, *Arhivirane* in *Povabila* (s števci), znotraj skupine pa vidi kartico *Trenutna skupina*, prek katere zamenja skupino. Na telefonu je glavna navigacija spodnja vrstica s štirimi postavkami. Seznam skupin ni več v stranski vrstici.

**Why this priority**: ogrodje je skupno vsem zaslonom in po pravilu uvajanja (konstitucija §2.5) pride pred posameznimi zasloni.

**Independent Test**: pri 1280, 768 in 360 px uporabnik s tipkovnico in bralnikom zaslona doseže vse glavne cilje in zamenja skupino.

**Acceptance Scenarios**:

1. **[FR-020-05]** **Given** širina 1024 px ali več, **When** je uporabnik prijavljen, **Then** stranska vrstica od zgoraj navzdol pokaže besedno znamko, postavke *Skupine* (število), *Arhivirane* (število) in *Povabila* (število novih kot značka), znotraj skupine kartico *Trenutna skupina* (monogram, naziv, vloga) in na dnu postavko računa (slika ali začetnici, ime, e-naslov), ki odpre meni računa; seznama skupin in gumba *Nova skupina* v stranski vrstici ni.
2. **[FR-020-06]** **Given** uporabnik v skupini, **When** odpre kartico *Trenutna skupina* (ali na telefonu naziv skupine v glavi), **Then** se odpre preklopnik skupin z njegovimi nearhiviranimi skupinami in izbira odpre izbrano skupino na istem zavihku, kjer ta obstaja.
3. **[FR-020-07]** **Given** širina pod 1024 px, **When** uporabnik odpre navigacijo, **Then** se stranska vrstica odpre kot ploskev z isto vsebino; **Given** širina pod 640 px, **Then** je glavna navigacija spodnja vrstica z natanko štirimi postavkami *Skupine*, *Arhivirane*, *Povabila*, *Račun* (ikona in napis) in označeno trenutno postavko.
4. **[FR-020-08]** **Given** zaslon skupine, **When** se izriše, **Then** glava pokaže monogram skupine, naziv, opis, značko vloge in (v arhivirani skupini) značko *Arhivirana*, pod njo pa zavihke skupine kot povezave z označenim aktivnim zavihkom; na telefonu se glava strne v vrstico, katere naziv odpre preklopnik, zavihki pa se pomikajo vodoravno.
5. **[FR-020-09]** **Given** katerikoli zaslon, **When** uporabnik išče stikalo teme, **Then** ga v glavi ni; tema, jezik in oblika zapisa so samo v *Moj račun*.

---

### User Story 3 - Skupine kot ena zbirka kartic (Priority: P2)

Uporabnik vidi vse svoje skupine kot eno zbirko kartic; vloga je značka na vsaki kartici, ne razdelek. Nad zbirko so iskanje, filtri vlog in stanja ter gumb *Nova skupina*. Arhivirane skupine imajo svoj zaslon z enakimi karticami.

**Why this priority**: najvidnejša sprememba vedenja seznama; zahteva enotno paginacijo čez vloge.

**Independent Test**: uporabnik z več skupinami različnih vlog vidi eno zbirko, jo filtrira po vlogi in stanju in odpre skupino s klikom na kartico.

**Acceptance Scenarios**:

1. **[FR-020-10]** **Given** uporabnik s skupinami več vlog, **When** odpre *Skupine*, **Then** vidi eno paginirano zbirko kartic (na namizju mreža, na telefonu vrstice v enem seznamu); vsaka kartica pokaže monogram ali sliko skupine, naziv, opis (ali »Brez opisa«), število kontaktov in značko vloge z dostopnim napisom »Vloga:«; cela kartica je ena povezava na skupino.
2. **[FR-020-11]** **Given** zbirka skupin, **When** uporabnik vpiše iskalni niz, izbere vlogo med čipi (*Vse vloge*, *Lastnik*, *Admin*, *Urednik*, *Bralec*) ali stanje (*Aktivne*, *Arhivirane*), **Then** so prikazane samo ustrezne skupine, števec in paginacija ustrezata filtriranemu seznamu, stanje je v URL in bralnik zaslona dobi obvestilo o številu zadetkov.
3. **[FR-020-12]** **Given** zaslon *Skupine*, **When** uporabnik izbere *Nova skupina*, **Then** se odpre dialog nove skupine (vedenje 002 nespremenjeno).
4. **[FR-020-13]** **Given** uporabnik z arhiviranimi skupinami, **When** odpre *Arhivirane* v navigaciji, **Then** vidi enako zbirko in orodno vrstico z značko *Arhivirana* (ali *Trajno arhivirana* z ikono ključavnice) ob znački vloge in pri skupini brez lastnika napis »lastnik: izbrisan uporabnik«.

---

### User Story 4 - Prijava in nov račun (Priority: P2)

Nov ali vračajoči se uporabnik vidi pozdravni zaslon s kratkim naslovom, enim stavkom in ilustracijo kartoteke; obrazec ima vrstni red Google → ločilo → e-pošta in geslo. Pri ustvarjanju računa sproti vidi, katera pravila gesla so izpolnjena.

**Why this priority**: prvi vtis; tokovi (017) ostanejo enaki, spremeni se predstavitev.

**Independent Test**: prijava, registracija, potrditev e-naslova in ponastavitev gesla delujejo kot v 017 pri 360 in 1280 px.

**Acceptance Scenarios**:

1. **[FR-020-14]** **Given** neprijavljen uporabnik na namizju, **When** odpre prijavo ali ustvarjanje računa, **Then** vidi dva stolpca – pozdravno ploskev (naslov, stavek, ilustracija; pri novem računu še tri kratke prednosti) in obrazec z naslovom, gumbom *Nadaljuj z Googlom*, ločilom »ali z e-pošto«, poljema e-pošta in geslo (z gumbom za prikaz gesla; pri prijavi povezava »Pozabljeno geslo?«), polnim primarnim gumbom in povezavo na drugi zaslon; na telefonu je pozdravni del pas na vrhu z besedno znamko, izbiro jezika in naslovom.
2. **[FR-020-15]** **Given** obrazec za nov račun, **When** uporabnik tipka geslo, **Then** pod poljem sproti vidi seznam pravil gesla 017, vsako označeno kot izpolnjeno ali ne z ikono in besedilom (ne samo z barvo), in bralnik zaslona izve stanje ob zapustitvi polja.
3. **[FR-020-16]** **Given** zasloni *Potrdi e-naslov*, *Pozabljeno geslo* in *Te strani ni*, **When** se izrišejo, **Then** sledijo postavitvi platna (pozdravna ploskev ali sredinska kartica z ilustracijo) brez spremembe vedenja.

---

### User Story 5 - Kontakti in kartica kontakta (Priority: P2)

Urednik dela s preglednico kontaktov, ki ostane v ospredju; izbrani kontakt se na širokem zaslonu odpre v plošči ob seznamu, ki ostane vidna med pomikanjem. Kartica kontakta ima tanek trak v barvi skupine, ime, vrstico »Dodal … · nazadnje urejeno …« in akciji *Uredi kontakt* ter *Izbriši kontakt* v tem vrstnem redu.

**Why this priority**: glavni delovni zaslon; večina časa uporabnika.

**Independent Test**: iskanje, filtri, izbor, množične akcije, ogled, urejanje in izbris kontakta delujejo kot prej pri 360, 768 in 1280 px.

**Acceptance Scenarios**:

1. **[FR-020-17]** **Given** seznam kontaktov, **When** se izriše v vsebniku, širšem od 640 px, **Then** je semantična preglednica z lepljivo glavo, vrsticami z začetnicami ali sliko in imenom, največ tremi značkami in »+N«; v ožjem vsebniku se vrstice zložijo v kartice z isto vsebino in akcijami.
2. **[FR-020-18]** **Given** širina 1280 px ali več in izbran kontakt, **When** uporabnik pomika seznam, **Then** plošča podrobnosti ostane v vidnem polju in se, če je višja od okna, pomika sama; pod 1280 px je kontakt svoja stran, na telefonu je njegova primarna akcija v spodnji vrstici akcij.
3. **[FR-020-19]** **Given** kartica kontakta (stran ali plošča), **When** se izriše, **Then** pokaže trak v barvi skupine, sliko ali začetnice, ime, vrstico o nastanku in zadnji spremembi, *Uredi kontakt* (primarno) pred *Izbriši kontakt* (tiho, nevarno), *Deli s kodo QR* in *Prenesi vizitko (.vcf)*, polja po skupinah, dodatne atribute, značke in razdelek *Zgodovina* s povezavama na zgodovino kontakta in na revizijsko sled, filtrirano na ta kontakt; akcije, ki jih vloga ali stanje skupine ne dovoljujeta, niso izrisane.
4. **[FR-020-20]** **Given** kontakt, ki ga je spremenil rollback skupine ali obnova različice, **When** se prikaže, **Then** na kartici ni značke ali opombe *Povrnjeno*; podatek o obnovi je viden samo v revizijski sledi in zgodovini kontakta (sprememba prikaza FR-005-19; podatek se še naprej hrani).
5. **[FR-020-21]** **Given** izbranih več kontaktov, **When** je izbor aktiven, **Then** se od spodaj prikaže plavajoča vrstica izbora s »Izbrano: N« in akcijami; izbrana vrstica ima poleg barve tudi označeno potrditveno polje.

---

### User Story 6 - Preostali zasloni in dialogi po platnu (Priority: P3)

Vsak preostali zaslon in dialog dobi postavitev s platna, brez spremembe vedenja: uvoz, zgodovina kontakta, različica, primerjava različic, izbrisani kontakti, dvojniki, primerjava in združevanje, revizijska sled in vnos sledi, atributi skupine, nastavitve skupine, povabila, *Moj račun*, statistika API ključa, dokumentacija API ter vsi dialogi (nova skupina, množično urejanje, slika – izbira in obrezovanje, zemljevid in približni zemljevid, koda QR – deljenje in branje, obnova, sprememba tipa ključa, nov API ključ, ustvarjen ključ, geslo za aplikacijo, vklop prijave z geslom, lastnik ne more zapustiti, izbris računa).

**Why this priority**: zaključi enoten videz; posamezni zasloni so neodvisni in se lahko uvajajo po delih.

**Independent Test**: obstoječi FE in E2E scenariji teh zaslonov prestanejo s posodobljenimi skupnimi pomočniki za imena, brez kršitev axe.

**Acceptance Scenarios**:

1. **[FR-020-22]** **Given** katerikoli zaslon ali dialog iz platna, **When** se izriše pri 1280 in 360 px, **Then** sledi postavitvi, hierarhiji in komponentam platna (en primarni gumb na zaslon, kartice, čipi filtrov, segmentirani kontrolnik, opozorila brez barvnih levih robov), vsebina in akcije pa so enake kot pred prenovo.
2. **[FR-020-23]** **Given** dialog, **When** se odpre, **Then** je na namizju sredinski dialog (do 480 px, obrazci do 560 px), na telefonu spodnja ploskev; *Prekliči* je pred potrditvijo, pri nevarnih operacijah je naslov vprašanje, telo pove posledico, gumb ponovi dejanje in začetni fokus je na *Prekliči*.

---

### User Story 7 - Prazna stanja, obvestila in povezave (Priority: P3)

Uporabnik v praznih in vmesnih trenutkih (ni skupin, ni kontaktov, ni zadetkov, ni povabil, uvoz končan, brez povezave, 404) vidi prijazno ilustracijo kartoteke, kratek naslov, en stavek in naslednje dovoljeno dejanje; na delovnih zaslonih ilustracij ni.

**Why this priority**: dodana vrednost brez vpliva na delovne tokove.

**Independent Test**: vsako prazno stanje se izriše z ilustracijo, ki je skrita bralniku zaslona, in z dejanjem, ki ga vloga dovoljuje.

**Acceptance Scenarios**:

1. **[FR-020-24]** **Given** prazno stanje ali trenutek uspeha, **When** se izriše, **Then** pokaže ilustracijo v slogu »črtna risba kartoteke« iz žetonov (sledi temi, skrita bralniku zaslona), naslov, en stavek in naslednje dejanje, ki ga vloga in stanje skupine dovoljujeta; v preglednicah, obrazcih, dialogih in orodnih vrsticah ilustracij ni.
2. **[FR-020-25]** **Given** nalaganje, daljše od 300 ms, **When** se prikaže, **Then** so okostja mirni bloki z blagim utripanjem (brez drsečega lesketa); obvestila so spodaj desno (na telefonu spodaj na sredini) z ikono stanja in gumbom za zaprtje.
3. **[FR-020-26]** **Given** povezava, **When** se izriše, **Then** je podčrtana samo, če stoji v tekočem besedilu (npr. »Pozabljeno geslo?«, e-naslov in telefon kot vrednost, ime kontakta v stavku sledi); navigacija, gumbi, kartice, vrstice, značke in naslovi niso podčrtani, ime kontakta v preglednici in povezave »Nazaj na …« pa samo ob lebdenju.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Prenova ne spremeni avtorizacije: vsak obstoječi endpoint ohrani svoj vnos v matriki izolacije. Novi ali spremenjeni vmesniki za seznam skupin (FR-020-10, FR-020-11) in števce v navigaciji (FR-020-05) dobijo vnos v matriki.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-020-10 | unauthenticated (no/invalid/expired token) | naloži zbirko skupin ali števce navigacije | 401, vmesnik preusmeri na prijavo |
| FR-020-10 | prijavljen uporabnik | naloži zbirko skupin | vidi samo skupine, katerih član je; tuje skupine niso razkrite ne v zbirki ne v števcih |
| FR-020-11 | prijavljen uporabnik | filtrira po vlogi ali iskalnem nizu | rezultat je vedno podmnožica njegovih skupin; števec ne razkrije tujih skupin |
| FR-020-06 | authenticated non-member | odpre skupino iz preklopnika ali URL-ja tuje skupine | 404, prikaz »Te strani ni«, obstoj ni razkrit |
| FR-020-19 | member with role VIEWER | odpre kartico kontakta | *Uredi kontakt* in *Izbriši kontakt* nista izrisana; neposredno pisanje vrne 403 |
| FR-020-19 | member of an archived group | odpre kartico kontakta | pisalne akcije niso izrisane; pisanje vrne 409 GROUP_ARCHIVED |
| FR-020-12 | unauthenticated | ustvari skupino | 401, nič se ne ustvari |

### Edge Cases

- Uporabnik brez skupin: zbirka pokaže prazno stanje prvega zagona z ilustracijo in *Nova skupina*; kartica *Trenutna skupina* ni izrisana.
- Uporabnik je odstranjen iz skupine, ki je odprta: naslednja zahteva vrne 404 in prikaže »Te strani ni«; preklopnik ob osvežitvi skupine ne vsebuje več.
- Zelo dolg naziv ali opis skupine na kartici, v glavi in kartici *Trenutna skupina*: skrajšan z elipso, celoten naziv dostopen bralniku zaslona in ob lebdenju.
- Povečava do 400 % in širina 320 px: brez vodoravnega pomikanja strani; preglednice se pomikajo samo v svojem okvirju.
- Skupina s sliko (018): monogram se zamenja s sliko povsod, kjer bi bil monogram.
- Arhivirana in trajno arhivirana skupina: značke in način samo za branje veljajo v glavi, zbirki, kartici *Trenutna skupina* in preklopniku.
- Nalaganje števcev navigacije spodleti: postavke ostanejo uporabne brez števcev, napaka ne blokira navigacije.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-020-01**: Sistem MORA vse barve, pisave, velikosti besedila, razmike, zaobljenosti, sence, trajanja in pospeške gibanja izrisati iz žetonov Kartoteke v2; `design.md` MORA biti posodobljen na v2 v istem PR kot žetoni (konstitucija §7). *(najnižja vloga: —)*
- **FR-020-02**: Sistem MORA zagotoviti kontrast besedila vsaj 4,5 : 1 in robov kontrolnikov vsaj 3 : 1 na vseh slojih v svetli in temni temi; tema sledi sistemu, razen če je izbrana v *Moj račun*. *(najnižja vloga: —)*
- **FR-020-03**: Sistem MORA gibanje omejiti na prosojnost, premik do 8 px in povečavo 0,98–1 ter ga pri nastavitvi zmanjšanega gibanja v celoti izklopiti; ponavljajoče se animacije niso dovoljene (izjema: zelo počasen premik vzorca na pozdravni ploskvi prijave, ki se ustavi pri zmanjšanem gibanju in skritem zavihku). *(najnižja vloga: —)*
- **FR-020-04**: Sistem MORA v načinu vsiljenih barv ohraniti vidne robove slojev, kontrolnikov, izbora in fokusa. *(najnižja vloga: —)*
- **FR-020-05**: Sistem MORA od 1024 px prikazati stransko navigacijo z besedno znamko, enakovrednimi postavkami *Skupine*, *Arhivirane* in *Povabila* s števci (skupine, arhivirane skupine, nova povabila), kartico *Trenutna skupina* znotraj skupine in postavko računa na dnu; seznam skupin in *Nova skupina* nista v navigaciji. *(najnižja vloga: —, uporabnik)*
- **FR-020-06**: Sistem MORA v skupini ponuditi kartico *Trenutna skupina* in preklopnik nearhiviranih skupin uporabnika, ki ohrani zavihek, kjer ta obstaja v ciljni skupini. *(najnižja vloga: VIEWER)*
- **FR-020-07**: Sistem MORA pod 1024 px prikazati navigacijo kot ploskev in pod 640 px kot spodnjo vrstico z natanko štirimi postavkami (*Skupine*, *Arhivirane*, *Povabila*, *Račun*). *(najnižja vloga: —)*
- **FR-020-08**: Sistem MORA vsak zaslon skupine odpreti z glavo skupine (monogram ali slika, naziv, opis, značka vloge, značka arhiviranosti) in zavihki skupine kot povezavami; na telefonu strnjeno glavo z odpiranjem preklopnika in vodoravno pomičnimi zavihki. *(najnižja vloga: VIEWER)*
- **FR-020-09**: Sistem MORA nastavitve teme, jezika in oblike zapisa ponuditi samo v *Moj račun* (tudi na zaslonih prijave ostane izbira jezika). *(najnižja vloga: —)*
- **FR-020-10**: Sistem MORA skupine uporabnika prikazati kot eno paginirano zbirko kartic z značko vloge na vsaki kartici (namesto razdelkov po vlogah), s številom kontaktov in povezavo na skupino; prikazane so samo skupine, katerih član je uporabnik. *(najnižja vloga: —, uporabnik)*
- **FR-020-11**: Sistem MORA zbirko skupin filtrirati po iskalnem nizu (017), eni vlogi ali vseh vlogah in stanju (aktivne/arhivirane), z enotno paginacijo, števcem zadetkov, stanjem v URL in obvestilom bralniku zaslona. *(najnižja vloga: —, uporabnik)*
- **FR-020-12**: Sistem MORA *Nova skupina* ponuditi kot primarno akcijo zaslona *Skupine*. *(najnižja vloga: —, uporabnik)*
- **FR-020-13**: Sistem MORA arhivirane skupine prikazati na lastnem zaslonu iz navigacije z enako zbirko in orodno vrstico ter značkami *Arhivirana* / *Trajno arhivirana* in »lastnik: izbrisan uporabnik«. *(najnižja vloga: —, uporabnik)*
- **FR-020-14**: Sistem MORA zaslona prijave in novega računa izrisati po platnu (pozdravna ploskev z ilustracijo, vrstni red obrazca Google → ločilo → e-pošta in geslo, mobilni pas na vrhu), ob nespremenjenih tokovih 001 in 017. *(najnižja vloga: —)*
- **FR-020-15**: Sistem MORA pri novem računu pod poljem gesla sproti prikazati pravila gesla 017 z oznako izpolnjenosti, ki ni samo barvna. *(najnižja vloga: —)*
- **FR-020-16**: Sistem MORA zaslone *Potrdi e-naslov*, *Pozabljeno geslo* in *Te strani ni* izrisati po platnu. *(najnižja vloga: —)*
- **FR-020-17**: Sistem MORA seznam kontaktov prikazati kot preglednico, ki se v vsebniku pod 640 px zloži v kartice, z največ tremi značkami na vrstico in »+N«. *(najnižja vloga: VIEWER)*
- **FR-020-18**: Sistem MORA od 1280 px izbran kontakt prikazati v plošči ob seznamu, ki ostane v vidnem polju med pomikanjem seznama; pod 1280 px kot svojo stran, na telefonu s primarno akcijo v spodnji vrstici. *(najnižja vloga: VIEWER)*
- **FR-020-19**: Sistem MORA kartico kontakta izrisati po platnu (trak barve skupine, vrstica o nastanku in zadnji spremembi, *Uredi kontakt* pred *Izbriši kontakt*, razdelek *Zgodovina* s povezavama) in izrisati samo akcije, ki jih vloga in stanje skupine dovoljujeta. *(najnižja vloga: VIEWER za ogled, EDITOR za urejanje)*
- **FR-020-20**: Sistem NE SME na kartici kontakta prikazati značke ali opombe o obnovi ali rollbacku; ta podatek je viden v revizijski sledi in zgodovini kontakta. FR-005-19 se v tem PR ustrezno popravi (hranjenje podatka ostane). *(najnižja vloga: VIEWER)*
- **FR-020-21**: Sistem MORA izbor kontaktov prikazati s plavajočo vrstico izbora in izbrano vrstico označiti z barvo in potrditvenim poljem. *(najnižja vloga: VIEWER)*
- **FR-020-22**: Sistem MORA vse preostale zaslone in dialoge iz platna izrisati po njegovi postavitvi, brez spremembe vsebine, akcij, endpointov in pravil vlog. *(najnižja vloga: kot obstoječa funkcionalnost)*
- **FR-020-23**: Sistem MORA dialoge izrisati na namizju kot sredinske dialoge in na telefonu kot spodnje ploskve, s *Prekliči* pred potrditvijo in začetnim fokusom na *Prekliči* pri nevarnih operacijah. *(najnižja vloga: —)*
- **FR-020-24**: Sistem MORA prazna stanja in trenutke uspeha (ni skupin, ni kontaktov, ni zadetkov, ni povabil, uvoz končan, sprejeto povabilo, brez povezave, 404) opremiti z ilustracijo iz žetonov, naslovom, stavkom in dovoljenim naslednjim dejanjem; na delovnih zaslonih ilustracij ni. *(najnižja vloga: —)*
- **FR-020-25**: Sistem MORA nalaganje, daljše od 300 ms, prikazati z mirnimi okostji in obvestila z ikono stanja in zapiranjem (5 s). *(najnižja vloga: —)*
- **FR-020-26**: Sistem MORA podčrtati samo povezave v tekočem besedilu; navigacija, gumbi, kartice, vrstice, značke in naslovi niso podčrtani, ime kontakta v preglednici in povezave »Nazaj na …« pa samo ob lebdenju. *(najnižja vloga: —)*
- **FR-020-27**: Sistem MORA vse nove in spremenjene elemente izdelati v sl/en (tudi dostopna imena), odzivno od 320 px naprej, brez kršitev WCAG 2.1 A in AA, s polno dostopnostjo s tipkovnico in pravilnim fokusom (2 px obroba v poudarku z odmikom 2 px). *(najnižja vloga: —)*
- **FR-020-28**: Sistem MORA pisave in ilustracije gostiti lokalno, brez klicev na tuje storitve (konstitucija VI); ikone so iz obstoječega nabora Tabler. *(najnižja vloga: —)*

### Key Entities *(include if feature involves data)*

- **Žetoni oblikovanja**: imenovane vrednosti Kartoteke v2 (barve slojev, besedila, robov, poudarka, stanj in osmih barv skupin v obeh temah; tipografija; razmiki; zaobljenosti; sence; gibanje; velikosti kontrolnikov in vrstic). Edini vir videza.
- **Povzetek skupine za zbirko**: skupina, kot jo vidi uporabnik – naziv, opis, barva ali slika, število kontaktov, vloga uporabnika, stanje (aktivna, arhivirana, trajno arhivirana, brez lastnika). Brez novih hranjenih podatkov.
- **Števci navigacije**: število aktivnih skupin, arhiviranih skupin in novih povabil uporabnika; izpeljani, ne hranjeni.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Vseh 25 zaslonov in 16 dialogov s platna je izdelanih; pri ročnem pregledu ob platnu pri 1280 in 360 px ni odstopanja v postavitvi, hierarhiji ali komponentah, ki ga ne bi utemeljilo obstoječe vedenje.
- **SC-002**: 0 kršitev axe (WCAG 2.1 A in AA) na vseh obiskanih straneh pri 360, 768 in 1280 px v svetli in temni temi.
- **SC-003**: 0 barv, senc ali zaobljenosti mimo žetonov v kodi vmesnika (preverjeno samodejno v `quick`).
- **SC-004**: Vsi obstoječi tokovi (prijava, skupine, kontakti, iskanje, množično urejanje, uvoz, izvoz, revizija, dvojniki, povabila, člani, račun, API ključi) prestanejo E2E; spremenjeni testi se nanašajo samo na besedilo, postavitev ali navigacijo in so navedeni v opisu PR.
- **SC-005**: Uporabnik iz katerekoli strani doseže katerokoli svojo skupino v največ dveh dejanjih in glavne cilje (Skupine, Arhivirane, Povabila, Račun) v enem dejanju, tudi na telefonu.
- **SC-006**: Vsa besedila v obeh temah dosegajo kontrast vsaj 4,5 : 1 (robovi kontrolnikov 3 : 1), preverjeno za vsak par žetonov besedila in sloja.
- **SC-007**: Prvi izris zaslonov po prenovi ni opazno počasnejši kot pred njo (čas do interaktivnosti glavnih zaslonov se ne poslabša za več kot 10 %).

## Assumptions

- **Vir resnice**: za vedenje veljajo obstoječe specifikacije 001–019; za videz in postavitev platno, za pravila komponent in žetone oblikovni sistem. Kjer se platno in pravila oblikovnega sistema razhajata (npr. sistem omenja razvrščanje skupin, nastavitev gostote preglednice in sled kontakta neposredno na strani kontakta, platno pa ne), velja platno; te stvari niso v obsegu.
- **Brez novega vedenja zaledja**, razen kar zahteva enotna zbirka skupin (FR-020-10, FR-020-11) in števci navigacije (FR-020-05); način (obstoječi endpointi ali nov parameter) določi `plan.md`, z vnosom v matriki izolacije za vsak spremenjen endpoint.
- **Brez novih osebnih podatkov ali nastavitev**; tema, jezik in oblika zapisa ostanejo kot v 001 in 016.
- **Uvajanje po rezinah** (konstitucija §2.5): temelji (US1) → ogrodje (US2, skupaj s posodobljenimi skupnimi pomočniki za teste) → zasloni (US3–US7); vsaka rezina je svoj PR in pusti `main` zelen.
- **`design.md`** se zamenja z vsebino Kartoteke v2 (načela, barve, tipografija, prostor, oblike, gibanje, ilustracije, komponente, zasloni, prepovedi), ohrani pa poglavja o dostopnosti, besedilih, PWA in implementaciji; sprememba zahteva potrditev obeh razvijalcev (konstitucija §7).
- Pisave (Atkinson Hyperlegible Next in Mono) in ikone (Tabler) ostanejo; nova knjižnica ni predvidena.
- Ilustracije se izdelajo kot vektorske risbe iz žetonov po pravilih oblikovnega sistema; fotografij in ustvarjenih slik ni.
- Odvisno od: 001, 002, 003, 004, 005 (sprememba prikaza FR-005-19), 015, 016, 017, 018, 019.
