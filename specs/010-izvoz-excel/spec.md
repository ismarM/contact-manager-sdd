# Feature Specification: Izvoz izbranih kontaktov v Excel

**Feature Branch**: `izvoz-excel` (no number; the directory is `specs/010-izvoz-excel/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Izvoz izbranih kontaktov skupine v Excel (bralec in višje)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Izvoz izbranih kontaktov v datoteko Excel (Priority: P1)

Član skupine (tudi bralec) na seznamu kontaktov izbere nekaj kontaktov – lahko čez več strani – in v akcijski vrstici izbora klikne *Izvozi v Excel*. Brskalnik prenese datoteko `.xlsx` z enim listom: v prvi vrstici so naslovi stolpcev v jeziku vmesnika, nato po ena vrstica za vsak izbran kontakt s predefiniranimi atributi, dodatnimi atributi in značkami, v enakem vrstnem redu kot na seznamu.

**Why this priority**: to je celotna vrednost funkcionalnosti – podatke skupine je mogoče odnesti v preglednico za nadaljnje delo (pošiljanje vabil, poročila).

**Independent Test**: v skupini s petimi znanimi kontakti izberi tri, izvozi, prenesi datoteko in jo preberi nazaj: en list, glava, tri vrstice z natanko pričakovanimi besedili celic (konstitucija II, workflow.md 2.9).

**Acceptance Scenarios**:

1. **[FR-010-01]** **Given** bralec v skupini Projekt FERI je izbral vsaj en kontakt, **When** si ogleda akcijsko vrstico izbora, **Then** vidi gumb »Izvozi v Excel« / "Export to Excel" (design.md 8.8); urednik, admin in lastnik ga vidijo prav tako.
2. **[FR-010-01]** **Given** nihče ni izbral nobenega kontakta, **When** uporabnik pogleda orodno vrstico seznama, **Then** gumba »Izvozi v Excel« ni.
3. **[FR-010-02]** **Given** uporabnik je izbral kontakta Ana Kos (stran 1) in Bor Zupan (stran 2), **When** klikne *Izvozi v Excel*, **Then** prenesena datoteka vsebuje natanko ta dva kontakta in nobenega drugega.
4. **[FR-010-03]** **Given** izvoz treh kontaktov, **When** uporabnik odpre preneseno datoteko, **Then** ima ta natanko en list z imenom »Kontakti« (v angleškem vmesniku »Contacts«), v vrstici 1 glavo in v vrsticah 2–4 kontakte, brez drugih nepraznih vrstic.
5. **[FR-010-04]** **Given** jezik vmesnika je slovenščina in izvoženi kontakti nimajo dodatnih atributov, **When** se datoteka prebere, **Then** so celice glave od leve proti desni »Ime«, »Priimek«, »Naslov«, »E-naslov«, »Telefon«, »Značke«.
6. **[FR-010-04]** **Given** jezik vmesnika je angleščina, **When** se izvozijo isti kontakti, **Then** je glava "First name", "Last name", "Address", "E-mail", "Phone", "Tags".
7. **[FR-010-05]** **Given** izvozita se kontakt A z atributoma `kompetenca=web dev` in `Oddelek=IT` ter kontakt B z atributom `podjetje=FERI` in brez drugih, **When** se datoteka prebere, **Then** so za stolpcem »Telefon« stolpci »kompetenca«, »Oddelek«, »podjetje« (abecedno ne glede na velikost črk), nato »Značke«; v vrstici kontakta B sta celici »kompetenca« in »Oddelek« prazni.
8. **[FR-010-05]** **Given** v skupini ima kontakt C atribut `hobi`, C pa ni izbran, **When** se izvozita A in B, **Then** stolpca »hobi« v datoteki ni.
9. **[FR-010-06]** **Given** kontakt ima značke `konferenca2025`, `Alumni`, `ne_obveščaj`, **When** se izvozi, **Then** je v celici »Značke« besedilo »Alumni, konferenca2025, ne_obveščaj«; kontakt brez značk ima prazno celico.
10. **[FR-010-07]** **Given** seznam je razvrščen po e-naslovu padajoče in izbrani so trije kontakti, **When** se izvozijo, **Then** so vrstice v datoteki v enakem vrstnem redu, kot ga ima seznam pri tej razvrstitvi.
11. **[FR-010-07]** **Given** uporabnik razvrstitve ni spreminjal, **When** izvozi izbor, **Then** so vrstice razvrščene po priimku, nato imenu, naraščajoče (feature-map §2.6).
12. **[FR-010-08]** **Given** kontakt ima telefon »041 123 456«, naslov v dveh vrsticah in ime »007«, **When** se datoteka prebere, **Then** so vse celice tipa besedilo, telefon je »041 123 456«, ime »007« (vodilne ničle ohranjene), naslov vsebuje prelom vrstice, prazna polja so prazne celice.
13. **[FR-010-10]** **Given** skupina z naslovom »Projekt FERI« in izvoz 2. 11. 2026, **When** se datoteka prenese v slovenskem vmesniku, **Then** se imenuje `Projekt-FERI-kontakti-2026-11-02.xlsx` (v angleškem `Projekt-FERI-contacts-2026-11-02.xlsx`).
14. **[FR-010-10]** **Given** skupina z naslovom »Šola: 2./3. letnik?«, **When** se izvozi 2. 11. 2026 v slovenskem vmesniku, **Then** se datoteka imenuje `Sola-2.-3.-letnik-kontakti-2026-11-02.xlsx`.
15. **[FR-010-14]** **Given** revizijska sled skupine ima N vnosov in kontakti imajo verzije V, **When** uporabnik izvozi izbor, **Then** ima sled še vedno N vnosov, verzije kontaktov so nespremenjene in izbor ostane izbran.
16. **[FR-010-15]** **Given** uporabnik je kliknil *Izvozi v Excel*, **When** se datoteka pripravlja, **Then** je gumb onemogočen z oznako »Pripravljam izvoz…« (ponoven klik ne sproži drugega izvoza); **When** je datoteka pripravljena, **Then** se prenos začne sam in prikaže se obvestilo »Izvoženih kontaktov: 3.« (design.md 8.13).
17. **[FR-010-15]** **Given** strežnik izvoza ne more izvesti (npr. napaka strežnika ali ni povezave), **When** uporabnik klikne *Izvozi v Excel*, **Then** se nad seznamom pokaže sporočilo napake (`role="alert"`) z gumbom *Poskusi znova*, datoteka se ne prenese, izbor ostane.

---

### User Story 2 - Izvoz vseh zadetkov iskanja (Priority: P2)

Uporabnik poišče kontakte s filtri (npr. značka `konferenca2025`), izbere *Izberi vse zadetke (312)* in izvozi vse zadetke naenkrat, ne da bi jih izbiral po straneh.

**Why this priority**: najpogostejša raba izvoza (seznam udeležencev), a temelji na zgodbi 1.

**Independent Test**: v skupini z 30 kontakti, od katerih jih 12 ima značko `konferenca2025`, filtriraj po znački, izberi vse zadetke, izvozi in preveri, da datoteka vsebuje natanko 12 vrstic kontaktov.

**Acceptance Scenarios**:

1. **[FR-010-02]** **Given** filter »Značka: konferenca2025« ima 12 zadetkov na dveh straneh in uporabnik izbere »vsi zadetki«, **When** klikne *Izvozi v Excel*, **Then** datoteka vsebuje natanko teh 12 kontaktov.
2. **[FR-010-02]** **Given** izbor »vsi zadetki« za filter z 12 zadetki, **When** drug urednik pred izvozom doda trinajstemu kontaktu značko `konferenca2025`, **Then** izvoz vsebuje 13 kontaktov (zadetki se ovrednotijo ob izvozu, po pravilih izbora iz 009).
3. **[FR-010-13]** **Given** izbor »vsi zadetki« obsega več kontaktov, kot je največja velikost izbora iz 009, **When** uporabnik zahteva izvoz, **Then** se datoteka ne ustvari, prikaže se napaka, ki pove največje dovoljeno število kontaktov v izvozu, in predlaga zožitev filtrov.

---

### User Story 3 - Varen izvoz in razrešitev sprememb med izborom (Priority: P2)

Izvožena datoteka ne sme ob odprtju v preglednici izvesti formule, ki jo je kdo vpisal v kontakt. Če je bil kateri od izbranih kontaktov medtem izbrisan, se izvoz vseeno izvede za preostale, uporabnik pa izve, koliko jih manjka.

**Why this priority**: varnost (vbrizgavanje formul) in predvidljivost ob sočasnem delu; brez tega izvoz ni zanesljiv.

**Independent Test**: kontakt z imenom `=HYPERLINK("http://x","klik")` izvozi in preberi nazaj – celica je besedilo z vodilnim opuščajem; izberi tri kontakte, enega izbriši prek drugega uporabnika, izvozi in preveri dve vrstici ter sporočilo o enem izpuščenem kontaktu.

**Acceptance Scenarios**:

1. **[FR-010-09]** **Given** kontakt ima ime `=HYPERLINK("http://x","klik")`, telefon `+386 41 123 456`, naslov `-Glavni trg 1` in atribut `opomba=@SUM(A1)`, **When** se datoteka prebere, **Then** so vrednosti celic `'=HYPERLINK("http://x","klik")`, `'+386 41 123 456`, `'-Glavni trg 1` in `'@SUM(A1)`, vse tipa besedilo; nobena celica datoteke ne vsebuje formule.
2. **[FR-010-09]** **Given** dodatni atribut ima ključ `=ključ`, **When** se izvozi, **Then** je glava tega stolpca `'=ključ`.
3. **[FR-010-11]** **Given** uporabnik je izbral 3 kontakte in drug urednik je enega od njih medtem izbrisal, **When** uporabnik izvozi izbor, **Then** datoteka vsebuje preostala 2 kontakta, obvestilo pa pove »Izvoženih kontaktov: 2. 1 izbrani kontakt je bil medtem izbrisan in ni v datoteki.«
4. **[FR-010-11]** **Given** vsi izbrani kontakti so bili medtem izbrisani (ali izbor »vsi zadetki« nima več nobenega zadetka), **When** uporabnik zahteva izvoz, **Then** se datoteka ne ustvari in prikaže se sporočilo »Nobeden od izbranih kontaktov ne obstaja več.« (koda `EXPORT_EMPTY`).
5. **[FR-010-12]** **Given** zahtevek za izvoz v skupini A vsebuje identifikator kontakta, ki pripada skupini B (ali ni nikoli obstajal), **When** ga strežnik obdela, **Then** odgovori `404`, datoteka se ne ustvari in odgovor ne razkrije, ali kontakt obstaja drugje.

---

### User Story 4 - Izvoz v arhivirani skupini (Priority: P3)

V arhivirani (tudi trajno arhivirani) skupini so vsi člani efektivno bralci, izvoz pa ostane na voljo (feature-map §2.4).

**Why this priority**: izhaja iz skupnega pravila; pomembno, ker je izvoz ena redkih dovoljenih operacij v arhivirani skupini.

**Independent Test**: arhiviraj skupino, kot urednik izberi kontakte in izvozi; datoteka se prenese.

**Acceptance Scenarios**:

1. **[FR-010-01]** **Given** skupina je arhivirana in uporabnik (katerakoli vloga) je izbral kontakte, **When** pogleda akcijsko vrstico, **Then** vidi samo *Izvozi v Excel* in *Počisti izbor* (design.md 8.8).
2. **[FR-010-16]** **Given** skupina je arhivirana ali trajno arhivirana, **When** član zahteva izvoz, **Then** se datoteka ustvari enako kot v nearhivirani skupini (ni `409 GROUP_ARCHIVED`).

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Najnižja vloga je VIEWER, zato ni vloge pod najnižjo dovoljeno (ni primera `403`). Izvoz ni pisanje, zato je dovoljen v arhivirani in trajno arhivirani skupini in nima optimističnega zaklepanja.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-010-02, FR-010-16 | neprijavljen (brez žetona, neveljaven ali potekel žeton) | zahteva izvoz izbora | 401, datoteka se ne ustvari |
| FR-010-02, FR-010-16 | prijavljen nečlan skupine | zahteva izvoz izbora | 404, obstoj skupine se ne razkrije, datoteka se ne ustvari |
| FR-010-02, FR-010-16 | prijavljen uporabnik, skupina ne obstaja | zahteva izvoz | 404 (enak odgovor kot za nečlana) |
| FR-010-12 | član skupine A | zahteva izvoz z identifikatorjem kontakta skupine B ali neobstoječega kontakta | 404, datoteka se ne ustvari, obstoj kontakta se ne razkrije |
| FR-010-16 | VIEWER, EDITOR, ADMIN, OWNER | zahteva izvoz | 200, datoteka |
| FR-010-16 | član arhivirane ali trajno arhivirane skupine | zahteva izvoz | 200, datoteka (izvoz ni pisanje; ni 409 GROUP_ARCHIVED) |
| FR-010-13 | član | zahteva izvoz s praznim izborom | 400 VALIDATION_FAILED, datoteka se ne ustvari |
| FR-010-13 | član | zahteva izvoz z več kontakti, kot je največja velikost izbora iz 009 | 400 VALIDATION_FAILED, datoteka se ne ustvari |
| FR-010-11 | član | vsi izbrani kontakti so bili medtem izbrisani / »vsi zadetki« nima zadetkov | 409 EXPORT_EMPTY, datoteka se ne ustvari |
| FR-010-14 | član | uspešen ali neuspešen izvoz | revizijska sled in verzije kontaktov ostanejo nespremenjene |

### Edge Cases

- **Isti ključ z različno velikostjo črk** (`Kompetenca` pri enem, `kompetenca` pri drugem kontaktu): en stolpec; glava je zapis ključa iz prve vrstice datoteke (po vrstnem redu vrstic), ki ta ključ ima (FR-010-05).
- **Dodatni ključ, ki je enak besedilu glave** (npr. ključ `Značke`): stolpca ostaneta ločena; stolpec značk je vedno zadnji.
- **Vrednost, ki se začne s presledkom in nato z `=`**: vrednost se izvozi dobesedno (pravilo FR-010-09 velja samo za prvi znak); celica je še vedno besedilo, zato se formula ne izvede.
- **Telefon z vodilnim `+`** (`+386 …`) dobi vodilni opuščaj, kot vsaka vrednost, ki se začne z `+` (zavestna odločitev, glej *Assumptions*).
- **Naslov skupine samo iz nedovoljenih znakov** (npr. `???`): del imena datoteke je `skupina` (`group` v angleščini) – `skupina-kontakti-2026-11-02.xlsx`.
- **Kontakt je bil po izboru spremenjen** (ne izbrisan): izvozi se njegovo trenutno stanje ob izvozu.
- **Izbor z enim kontaktom**: izvoz deluje enako; obvestilo »Izvoženih kontaktov: 1.«
- **Jezik vmesnika se zamenja med izborom**: glava, ime lista in ime datoteke sledijo jeziku ob kliku *Izvozi v Excel*.
- **Brez povezave (PWA)**: gumb ostane viden, ob kliku pa pojasni, da izvoz potrebuje povezavo (design.md 8.15).
- **Bralnik zaslona**: stanje »Pripravljam izvoz…« in obvestilo o uspehu se sporočita (`role="status"`), napaka kot `role="alert"`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-010-01**: Sistem MORA v akcijski vrstici izbora (009, design.md 8.8) ob izboru vsaj enega kontakta prikazati gumb »Izvozi v Excel« / "Export to Excel" vsem članom skupine, tudi bralcem in članom arhivirane ali trajno arhivirane skupine; brez izbora gumba ni. *(najnižja vloga: VIEWER)*
- **FR-010-02**: Sistem MORA izvoziti natanko kontakte izbora, kot ga določa 009: izrecno izbrane kontakte (tudi čez več strani) ali, pri izboru »vsi zadetki«, vse kontakte, ki ob izvozu ustrezajo iskanju in filtrom izbora. *(najnižja vloga: VIEWER)*
- **FR-010-03**: Sistem MORA ustvariti eno datoteko v zapisu Excel `.xlsx` z natanko enim listom, imenovanim »Kontakti« (sl) / "Contacts" (en); vrstica 1 je glava, vsaka naslednja vrstica je natanko en izvožen kontakt, drugih nepraznih vrstic ni. *(najnižja vloga: VIEWER)*
- **FR-010-04**: Sistem MORA stolpce postaviti v tem vrstnem redu, z glavo v jeziku vmesnika ob izvozu: »Ime« / "First name", »Priimek« / "Last name", »Naslov« / "Address", »E-naslov« / "E-mail", »Telefon« / "Phone", nato stolpci dodatnih atributov (FR-010-05), na koncu »Značke« / "Tags". *(najnižja vloga: VIEWER)*
- **FR-010-05**: Sistem MORA za vsak ključ dodatnega atributa, ki ga ima vsaj en izvožen kontakt, dodati natanko en stolpec (ključi se primerjajo ne glede na velikost črk); stolpci so razvrščeni abecedno po ključu ne glede na velikost črk po pravilih jezika vmesnika; glava je ključ v zapisu iz prve vrstice datoteke, ki ključ ima; kontakt brez tega ključa ima prazno celico. Ključi, ki jih nima noben izvožen kontakt, se ne izvozijo. *(najnižja vloga: VIEWER)*
- **FR-010-06**: Sistem MORA v stolpec značk zapisati vse značke kontakta, razvrščene abecedno ne glede na velikost črk po pravilih jezika vmesnika in ločene z vejico in presledkom (`, `); kontakt brez značk ima prazno celico. *(najnižja vloga: VIEWER)*
- **FR-010-07**: Sistem MORA vrstice razvrstiti po trenutni razvrstitvi seznama kontaktov (polje in smer iz 008); brez izbrane razvrstitve po privzetem razvrščanju (priimek, nato ime, naraščajoče; feature-map §2.6). *(najnižja vloga: VIEWER)*
- **FR-010-08**: Sistem MORA vse celice zapisati kot besedilo (ne kot število, datum ali formulo), z vrednostjo, enako shranjeni vrednosti kontakta (tudi vodilne ničle in prelomi vrstic v naslovu), razen dopolnitve po FR-010-09; prazna ali manjkajoča vrednost je prazna celica. *(najnižja vloga: VIEWER)*
- **FR-010-09**: Sistem MORA vsaki vrednosti celice (tudi glavi stolpca dodatnega atributa), katere prvi znak je `=`, `+`, `-`, `@`, tabulator ali pomik na začetek vrstice (CR), dodati vodilni opuščaj `'`, tako da preglednica vrednosti ne obravnava kot formulo (zaščita pred vbrizgavanjem formul); datoteka ne vsebuje nobene formule. *(najnižja vloga: VIEWER)*
- **FR-010-10**: Sistem MORA datoteko poimenovati `‹naslov›-kontakti-‹YYYY-MM-DD›.xlsx` (sl) oziroma `‹naslov›-contacts-‹YYYY-MM-DD›.xlsx` (en), kjer je datum dan izvoza po lokalnem času uporabnika, ‹naslov› pa naslov skupine, prilagojen za ime datoteke: črkam se odstranijo diakritična znamenja (č → c, Š → S), vsako zaporedje znakov, ki niso črka angleške abecede, števka, `.` ali `_`, se zamenja z enim `-`, vodilni in končni `-` in `.` se odstranijo; če ostane prazen niz, je ‹naslov› `skupina` (sl) / `group` (en). *(najnižja vloga: VIEWER)*
- **FR-010-11**: Sistem MORA kontakte izbora, ki so bili po izboru izbrisani iz skupine, izpustiti, izvoziti preostale in uporabniku sporočiti število izpuščenih (»N izbranih kontaktov je bilo medtem izbrisanih in jih ni v datoteki.«); če ne ostane noben kontakt, datoteke ne ustvari in odgovori `409 EXPORT_EMPTY` (»Nobeden od izbranih kontaktov ne obstaja več.«). *(najnižja vloga: VIEWER)*
- **FR-010-12**: Sistem MORA zavrniti celoten izvoz z `404`, če izbor vsebuje identifikator, ki ni bil nikoli kontakt te skupine (kontakt druge skupine ali neobstoječ identifikator), ne da bi razkril, ali tak kontakt obstaja drugje; datoteka se ne ustvari. *(najnižja vloga: VIEWER)*
- **FR-010-13**: Sistem MORA zavrniti izvoz s praznim izborom ali z več kontakti, kot je največja velikost izbora, ki jo določa 009, z `400 VALIDATION_FAILED`; vmesnik pove, koliko kontaktov je mogoče izvoziti naenkrat. *(najnižja vloga: VIEWER)*
- **FR-010-14**: Sistem MORA izvoz izvesti kot branje: ne spremeni nobenega kontakta ali verzije, ne ustvari vnosa v revizijski sledi (izvoz ni sprememba, feature-map §2.7) in ne počisti izbora. *(najnižja vloga: VIEWER)*
- **FR-010-15**: Sistem MORA med pripravo datoteke gumb *Izvozi v Excel* onemogočiti z oznako »Pripravljam izvoz…«, po uspehu sam začeti prenos in prikazati obvestilo o uspehu »Izvoženih kontaktov: N.« (z dodatnim stavkom po FR-010-11, če so bili kontakti izpuščeni), ob neuspehu pa prikazati sporočilo napake na mestu akcije z gumbom *Poskusi znova* (design.md 8.13); besedila so v sl in en. *(najnižja vloga: VIEWER)*
- **FR-010-16**: Sistem MORA izvoz dovoliti vsakemu članu skupine z vlogo VIEWER ali višjo, tudi v arhivirani in trajno arhivirani skupini, in ga zavrniti po vrstnem redu preverjanj iz feature-map §2.2 (neprijavljen `401`, nečlan ali neobstoječa skupina `404`). *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Izbor za izvoz**: množica kontaktov skupine, ki jo določa 009 – seznam izrecno izbranih kontaktov ali »vsi zadetki« (iskanje in filtri) – skupaj s trenutno razvrstitvijo seznama.
- **Izvozna datoteka**: datoteka `.xlsx` z enim listom; glava (predefinirani atributi, dodatni ključi, značke) in vrstice kontaktov; ime iz naslova skupine in datuma. Se ne shranjuje v sistemu.
- **Kontakt** (iz 004): predefinirani atributi, dodatni atributi ključ=vrednost, značke.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bralec iz seznama kontaktov izvozi izbrane kontakte z največ dvema klikoma po izboru (klik *Izvozi v Excel*, nato odprtje datoteke).
- **SC-002**: Izvoz izbora največje dovoljene velikosti (009) se prenese v največ 10 sekundah pri običajni povezavi.
- **SC-003**: Pri 100 % preizkusnih izvozov se vsebina datoteke, prebrane nazaj, ujema s pričakovano po vrsticah, stolpcih in besedilu celic (preverljivo z E2E testom, ki datoteko prenese in prebere).
- **SC-004**: Nobena izvožena datoteka ne vsebuje formule; 100 % vrednosti, ki se začnejo z `=`, `+`, `-`, `@`, tabulatorjem ali CR, je zaščitenih.
- **SC-005**: Uporabnik po vsakem izvozu (uspešnem ali ne) v manj kot 1 sekundi po odgovoru vidi rezultat (obvestilo ali sporočilo napake).
- **SC-006**: Izvoz nikoli ne vsebuje kontakta druge skupine (matrika izolacije brez izjem).

## Assumptions

- **Odvisnosti**: 009-mnozicno-urejanje (izbor, »vsi zadetki«, akcijska vrstica, največja velikost izbora), 008-iskanje (razvrstitev, filtri), 004-kontakti (kontakt in slovar podatkov), 003-arhiviranje (arhivirana in trajno arhivirana skupina). Ta specifikacija ne določa izbora samega; največjo velikost izbora povzame iz 009 in je ne ponavlja.
- **Izbrisani kontakti (odločitev)**: kontakti, izbrisani po izboru, se **izpustijo** in uporabnik dobi njihovo število (ne zavrnemo celotnega izvoza), ker uporabnik izvoz skoraj vedno želi in ker izvoz ne spreminja podatkov. Če ne ostane noben kontakt, je odgovor `409 EXPORT_EMPTY`. Sistem loči »kontakt, ki je bil v tej skupini in je izbrisan« (izpuščen) od »identifikatorja, ki ni bil nikoli kontakt te skupine« (`404`, FR-010-12); predpostavljeno je, da sistem izbris kontakta skupine pozna (npr. iz revizijske sledi 005). Tako `404` ne razkrije obstoja kontakta v drugi skupini, ker naključen neobstoječ identifikator dobi enak odgovor.
- **»Vsi zadetki«** se ovrednotijo ob izvozu (po definiciji izbora v 009), zato pri njem izbrisani kontakti preprosto niso zadetki in se ne štejejo kot izpuščeni.
- **Preseženo največje število in prazen izbor** sta neveljavna vhodna podatka → `400 VALIDATION_FAILED` (feature-map §2.2, točka 6). Če 009 za preseženo velikost izbora določi drugačno kodo, se ta specifikacija uskladi z njo.
- **Zaščita pred formulami (odločitev)**: vodilni opuščaj `'` je dejanski znak vrednosti celice (viden ob branju nazaj), ne samo oblikovanje, ker ostane zaščita tudi, ko uporabnik datoteko shrani kot CSV. Pravilo velja enotno za vsa polja, tudi telefon (`+386 …` → `'+386 …`); preprostost in varnost imata prednost pred videzom. Poleg `=`, `+`, `-`, `@` sta vključena tabulator in CR po priporočilu OWASP.
- **Jezik**: glava, ime lista in del imena datoteke (`kontakti` / `contacts`) sledijo jeziku vmesnika ob izvozu (konstitucija IV – vsa besedila dvojezična).
- **Razvrščanje dodatnih stolpcev in značk** je abecedno po pravilih jezika vmesnika in ne glede na velikost črk, da je vsebina datoteke predvidljiva za test.
- **Datum v imenu datoteke** je dan izvoza po lokalnem času uporabnika (časovni pas brskalnika).
- Izvoz ne zahteva potrditvenega dialoga (ni nevarna operacija, feature-map §2.8).
- Izvoz se ne beleži v revizijski sledi (ni sprememba kontaktov, feature-map §2.7).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
