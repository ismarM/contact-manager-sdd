# Feature Specification: Uvoz in izvoz kontaktov (Excel, vCard, koda QR, CardDAV)

**Feature Branch**: `uvoz-izvoz` (no number; the directory is `specs/014-uvoz-izvoz/`)

**Created**: 2026-11-15

**Input**: User description: "add a batch of new functionalities for 014: imports and exports. this functionality will expand on the already existing excel exports. it will add excel imports, .vcf imports and exports for contacts, qr-code generation for sharing a singular contact and a qr-code import option that opens a camera/requests an image, scans it and adds the contact (needs to be compatible with the qr code export). additionally this feature should add carddav integration. all of this should be included in 014"


## Clarifications

### Session 2026-11-15

- Q: Kako uvoz obravnava vrstice, ki ustrezajo obstoječim kontaktom skupine? → A: Urednik v predogledu za vsako označeno vrstico izbere *Preskoči* ali *Ustvari*; privzeto *Preskoči*. Obstoječi kontakti se pri uvozu nikoli ne spreminjajo.
- Q: Kaj vsebuje koda QR? → A: Celotno vizitko (vCard) s podatki kontakta; deluje s katerimkoli telefonom brez računa, podatki so vidni vsakomur, ki kodo poskenira (namen deljenja).
- Q: Kaj pomeni integracija CardDAV? → A: Contact Manager je strežnik CardDAV, vsaka skupina je imenik samo za branje, dostop z gesli za aplikacijo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Uvoz kontaktov iz Excela (Priority: P1)

Urednik ima seznam kontaktov v preglednici (lasten ali izvožen iz 010) in ga želi prenesti v skupino, ne da bi kontakte vpisoval enega po enega. Na seznamu kontaktov izbere *Uvozi*, naloži datoteko `.xlsx`, preveri samodejno preslikavo stolpcev, si ogleda predogled z napakami po vrsticah, razreši države, ki jih sistem ne prepozna, in potrdi uvoz. Kontakti nastanejo naenkrat, uvoz je v revizijski sledi en vnos.

**Why this priority**: največja posamična vrednost funkcionalnosti (ročni vnos večjega seznama ni izvedljiv) in temelj za uvoz vCard, ki uporabi isti predogled.

**Independent Test**: v prazni skupini izvozi znane kontakte iz druge skupine (010), datoteko uvozi, potrdi in preveri, da so kontakti z vsemi polji, atributi in značkami enaki izvoženim ter da je v sledi en vnos uvoza.

**Acceptance Scenarios**:

1. **[FR-014-01]** **Given** urednik v nearhivirani skupini, **When** odpre seznam kontaktov, **Then** vidi akcijo »Uvozi« / "Import" z možnostma *Iz Excela (.xlsx)* in *Iz vizitk (.vcf)*; bralec in član arhivirane skupine akcije ne vidita.
2. **[FR-014-02]** **Given** datoteka, ustvarjena z izvozom 010 v slovenskem ali angleškem vmesniku, **When** jo urednik naloži, **Then** sistem stolpce *Ime*, *Priimek*, *Naslov*, *E-naslov*, *Telefon*, *Država*, *Podjetje* in *Značke* (oz. angleške glave) samodejno preslika na ustrezna polja, vsak drug stolpec pa na dodatni atribut s ključem, enakim glavi.
3. **[FR-014-02]** **Given** predogled preslikave, **When** urednik stolpcu »Mobitel« izbere cilj *Telefon* in stolpcu »Opombe interno« *Ne uvozi*, **Then** predogled vrstic upošteva novo preslikavo; dva stolpca ne moreta imeti istega predefiniranega cilja (izbira drugega pokaže napako ob stolpcu).
4. **[FR-014-03]** **Given** datoteka s 120 vrsticami, od katerih imata vrstica 7 neveljaven e-naslov in vrstica 15 prazno ime in priimek, **When** se pokaže predogled, **Then** povzetek pove »118 kontaktov je pripravljenih za uvoz, 2 vrstici imata napake.«, vrstici 7 in 15 sta označeni z razlogom ob polju, gumb *Uvozi 118 kontaktov* uvozi samo veljavne vrstice.
5. **[FR-014-04]** **Given** stolpec *Država* z vrednostmi »Slovenija«, »AT«, »Avstrija«, »Kongo« in »Atlantida«, **When** se pokaže predogled, **Then** so »Slovenija« → `SI`, »AT« in »Avstrija« → `AT` prepoznane samodejno, za »Kongo« (dvoumno) urednik izbere med kandidati, za »Atlantida« (neprepoznano) izbere državo s seznama ali *Pusti prazno*; vsaka različna vrednost se razreši enkrat za vse vrstice; dokler kakšna vrednost ni razrešena, uvoz ni mogoč.
6. **[FR-014-05]** **Given** veljaven predogled s 118 kontakti, **When** urednik potrdi uvoz, **Then** nastane natanko 118 kontaktov, obvestilo pove »Uvoženih kontaktov: 118.«, seznam pokaže nove kontakte in revizijska sled ima en nov vnos *Uvoz* s 118 kontakti, ki ga admin lahko povrne (rollback, 005).
7. **[FR-014-05]** **Given** med potrditvijo pride do napake strežnika ali prekinitve povezave, **When** uvoz ne uspe, **Then** v skupini ne nastane noben kontakt, predogled ostane odprt s sporočilom napake in gumbom *Poskusi znova*.
8. **[FR-014-06]** **Given** celica izvožene datoteke `'=HYPERLINK("x")` (zaščita FR-010-09), **When** se datoteka uvozi, **Then** ima kontakt vrednost `=HYPERLINK("x")` (vodilni opuščaj odstranjen), shranjeno kot besedilo.
9. **[FR-014-07]** **Given** ključ `kompetenca` v datoteki in kanonični zapis skupine `Kompetenca` (013), **When** se kontakti uvozijo, **Then** imajo atribut `Kompetenca`; enako velja za značke.
10. **[FR-014-08]** **Given** datoteka z več kot 10 000 vrsticami podatkov, večja od 10 MB, brez vrstice glave ali ni veljavna datoteka `.xlsx`, **When** jo urednik naloži, **Then** se predogled ne pokaže, sporočilo pove razlog (največ 10 000 kontaktov naenkrat, največ 10 MB, datoteka ni preglednica Excel) in v skupini se nič ne spremeni.
11. **[FR-014-09]** **Given** predogled z vrstico, ki ima enak e-naslov kot obstoječi kontakt skupine, **When** se predogled pokaže, **Then** je vrstica označena kot možen dvojnik z razlogom (»Enak e-naslov kot Ana Kos«) in izbiro *Preskoči* (privzeto) / *Ustvari*; **When** urednik potrdi uvoz brez sprememb izbire, **Then** ta vrstica ne ustvari kontakta, obstoječi kontakt ostane nespremenjen, povzetek pa pove »1 vrstica je preskočena kot dvojnik.«; **When** izbere *Ustvari*, **Then** nastane nov kontakt in obstoječi ostane nespremenjen.

---

### User Story 2 - Izvoz in uvoz vizitk vCard (.vcf) (Priority: P1)

Član iz skupine izvozi izbrane kontakte ali en kontakt kot datoteko vizitk `.vcf`, ki jo odpre telefon, poštni odjemalec ali drug imenik. Urednik v skupino uvozi datoteko `.vcf`, izvoženo iz telefona, Googla, Outlooka ali iz Contact Managerja; uvoz uporabi isti predogled in pravila kot uvoz iz Excela.

**Why this priority**: vCard je splošno sprejet zapis za izmenjavo kontaktov med aplikacijami in je osnova kode QR (zgodbi 3 in 4).

**Independent Test**: izberi tri kontakte z vsemi polji, atributi in značkami, izvozi `.vcf`, datoteko uvozi v prazno skupino in primerjaj kontakte; datoteko odpri v standardni aplikaciji imenika in preveri ime, e-naslov, telefon, naslov in podjetje.

**Acceptance Scenarios**:

1. **[FR-014-10]** **Given** član (tudi bralec, tudi v arhivirani skupini) z vsaj enim izbranim kontaktom, **When** v akcijski vrstici izbora izbere *Izvozi v vCard (.vcf)*, **Then** se prenese ena datoteka `.vcf` z natanko izbranimi kontakti v vrstnem redu seznama; preverjanje izbora, izpuščeni izbrisani kontakti, `409 EXPORT_EMPTY`, meja 10 000 in `404` za tuj identifikator veljajo kot pri izvozu v Excel (FR-010-02, -11, -12, -13).
2. **[FR-014-10]** **Given** pogled kontakta Ana Kos, **When** član izbere *Prenesi vizitko (.vcf)*, **Then** se prenese `Ana-Kos.vcf` z enim kontaktom (ime datoteke po pravilu FR-010-10 iz imena in priimka).
3. **[FR-014-11]** **Given** kontakt z imenom, priimkom, dvovrstičnim naslovom, e-naslovom, telefonom, podjetjem, državo `AT`, atributom `Vloga=mentor` in značkama `alumni`, `konferenca2025`, **When** se izvozi in datoteka odpre v standardni aplikaciji imenika, **Then** aplikacija prikaže ime, priimek, naslov, državo, e-naslov, telefon in podjetje v ustreznih poljih in značke kot kategorije.
4. **[FR-014-12]** **Given** datoteka `.vcf` iz zgodbe 2, scenarija 3, **When** jo urednik uvozi v drugo skupino, **Then** je nastali kontakt v vseh poljih, dodatnih atributih in značkah enak izvoženemu.
5. **[FR-014-13]** **Given** vizitka iz telefona z dvema e-naslovoma (drugi označen kot prednostni), tremi telefoni, rojstnim dnevom in fotografijo, **When** se uvozi, **Then** prednostni e-naslov in prednostni (sicer prvi) telefon gresta v polji *E-naslov* in *Telefon*, ostali v dodatne atribute `E-naslov 2`, `Telefon 2`, `Telefon 3`, rojstni dan v atribut `Rojstni dan` (`Birthday` v angleškem vmesniku), fotografija se ne uvozi; predogled to pokaže pred potrditvijo.
6. **[FR-014-13]** **Given** vizitka samo s poljem polnega imena »Dr. Ana Marija Kos« brez razčlenjenega imena, **When** se uvozi, **Then** je ime »Dr. Ana Marija«, priimek »Kos« (zadnja beseda je priimek), predogled pa vrednosti pokaže, da ju urednik lahko popravi pred uvozom.
7. **[FR-014-03]** **Given** datoteka `.vcf` s 40 vizitkami v zapisih 2.1, 3.0 in 4.0, od katerih je ena brez imena in telefon druge vsebuje nedovoljene znake, **When** se pokaže predogled, **Then** je 38 vizitk pripravljenih za uvoz, dve sta označeni z razlogom, uvoz poteka po FR-014-05.

---

### User Story 3 - Deljenje kontakta s kodo QR (Priority: P2)

Član na pogledu kontakta izbere *Deli s kodo QR*. Odpre se pogovorno okno s kodo QR, ki jo lahko nekdo poskenira s kamero telefona in kontakt doda v svoj imenik, ali jo poskenira drug uporabnik Contact Managerja (zgodba 4). Kodo je mogoče tudi prenesti kot sliko.

**Why this priority**: hitro deljenje enega kontakta v živo (sestanek, konferenca); manj pogosto kot množični uvoz in izvoz.

**Independent Test**: kodo QR kontakta poskeniraj z vgrajeno kamero telefona iOS in Android in preveri, da telefon ponudi dodajanje kontakta z imenom, e-naslovom in telefonom; isto kodo poskeniraj v zgodbi 4 in preveri predizpolnjen obrazec.

**Acceptance Scenarios**:

1. **[FR-014-14]** **Given** član (tudi bralec, tudi v arhivirani skupini) na pogledu kontakta, **When** izbere *Deli s kodo QR*, **Then** se odpre pogovorno okno (design.md 8.11) s kodo QR, imenom kontakta, seznamom polj, ki jih koda vsebuje, in gumboma *Prenesi sliko* in *Zapri*.
2. **[FR-014-15]** **Given** kontakt z imenom, priimkom, e-naslovom in telefonom, **When** se koda QR poskenira z vgrajeno kamero telefona, **Then** telefon kontakt prepozna in ponudi njegovo dodajanje v imenik z imenom, priimkom, e-naslovom in telefonom, ne da bi bila potrebna prijava ali račun v Contact Managerju.
3. **[FR-014-16]** **Given** kontakt z 30 značkami in dolgim naslovom, katerega podatki ne gredo v eno kodo QR, **When** se odpre pogovorno okno, **Then** koda vsebuje polja po prednostnem vrstnem redu FR-014-16, okno pa pove, katera polja niso vključena (»Ni vključeno: značke.«).
4. **[FR-014-14]** **Given** odprto pogovorno okno, **When** član izbere *Prenesi sliko*, **Then** se prenese slika `‹ime-priimek›-qr.png`, ki vsebuje isto kodo.

---

### User Story 4 - Dodajanje kontakta s skeniranjem kode QR (Priority: P2)

Urednik na seznamu kontaktov izbere *Dodaj s kodo QR*. Aplikacija odpre kamero (ali, če kamere ni ali dostop ni dovoljen, ponudi izbiro slike), prebere kodo QR z vizitko in odpre obrazec novega kontakta, predizpolnjen s prebranimi podatki. Urednik podatke preveri in shrani. Deluje s kodami iz zgodbe 3 in z vizitkami v kodah QR drugih aplikacij.

**Why this priority**: dopolnjuje zgodbo 3 in ročni vnos; odvisna od pretvorbe vizitke iz zgodbe 2.

**Independent Test**: izdelaj kodo QR kontakta v skupini A (zgodba 3), jo kot sliko naloži v *Dodaj s kodo QR* v skupini B, preveri predizpolnjen obrazec in shrani; z zavrnjenim dostopom do kamere preveri izbiro slike.

**Acceptance Scenarios**:

1. **[FR-014-17]** **Given** urednik v nearhivirani skupini, **When** izbere *Dodaj s kodo QR*, **Then** brskalnik zaprosi za dostop do kamere, pogovorno okno prikaže sliko kamere in navodilo »Usmeri kamero v kodo QR.«, poleg tega pa gumb *Izberi sliko*; bralec in član arhivirane skupine akcije ne vidita.
2. **[FR-014-18]** **Given** kamera kaže kodo QR, ustvarjeno v zgodbi 3, **When** jo aplikacija prebere, **Then** se kamera ustavi, okno se zapre in odpre se obrazec novega kontakta (004) s predizpolnjenimi polji; kontakt nastane šele, ko urednik shrani, s svojim vnosom v sledi (FR-005-01).
3. **[FR-014-17]** **Given** uporabnik je zavrnil dostop do kamere ali naprava kamere nima, **When** se okno odpre, **Then** se namesto slike kamere pokaže »Kamera ni na voljo. Izberi sliko s kodo QR.« z gumbom *Izberi sliko*; iz izbrane slike se koda prebere enako.
4. **[FR-014-19]** **Given** slika brez kode QR ali s kodo, ki ni kontakt (npr. spletni naslov), **When** jo aplikacija obdela, **Then** se pokaže »Na sliki ni kode QR s kontaktom.« in okno ostane odprto za nov poskus.
5. **[FR-014-18]** **Given** vizitka iz kode QR z neveljavnim telefonom ali državo, ki je ni mogoče prepoznati, **When** se odpre obrazec, **Then** so veljavna polja predizpolnjena, neveljavne vrednosti so v poljih z napako ob polju (država kot predlog za izbiro), shranjevanje sledi pravilom 004.
6. **[FR-014-20]** **Given** urednik zapre okno ali zapusti stran, **When** je kamera vklopljena, **Then** se kamera takoj ustavi; slika s kamere ali izbrana slika se ne pošlje na strežnik in se ne shrani.

---

### User Story 5 - Sinhronizacija skupin z imeniki prek CardDAV (Priority: P3)

Član želi kontakte skupin, katerih član je, videti v imeniku telefona ali poštnega odjemalca, ne da bi jih izvažal. V *Mojem računu* ustvari geslo za aplikacijo, ga vpiše v nastavitve računa CardDAV na telefonu (naslov strežnika, e-naslov, geslo) in vsaka njegova skupina se pojavi kot imenik, ki se samodejno osvežuje. Imeniki so samo za branje: kontakti se spreminjajo samo v aplikaciji.

**Why this priority**: največ dela in tveganja (nov tip klicatelja in nov način prijave, konstitucija §2.1 *tvegana funkcionalnost*); vrednost je velika, a ni pogoj za zgodbe 1–4.

**Independent Test**: ustvari geslo za aplikacijo, z odjemalcem CardDAV se poveži, preveri, da so vidne natanko skupine uporabnika s pravimi kontakti; spremeni kontakt v aplikaciji in preveri spremembo po naslednji sinhronizaciji; prekliči geslo in preveri `401`.

**Acceptance Scenarios**:

1. **[FR-014-21]** **Given** prijavljen uporabnik v *Mojem računu*, **When** ustvari geslo za aplikacijo z imenom »iPhone«, **Then** se geslo pokaže **enkrat** skupaj z naslovom strežnika in uporabniškim imenom (e-naslov) ter gumbom *Kopiraj*; po zaprtju okna gesla ni več mogoče videti, na seznamu je »iPhone« z datumom nastanka in »še ni uporabljeno«.
2. **[FR-014-22]** **Given** uporabnik je član skupin Projekt FERI (bralec) in Klub (lastnik) ter ima arhivirano skupino Stari projekt, **When** se odjemalec CardDAV prijavi z veljavnim geslom za aplikacijo, **Then** vidi tri imenike z naslovi skupin in v vsakem natanko kontakte te skupine; imenikov drugih skupin ne vidi.
3. **[FR-014-23]** **Given** odjemalec je sinhroniziran, **When** urednik v aplikaciji doda, spremeni ali izbriše kontakt, **Then** odjemalec ob naslednji sinhronizaciji pokaže spremembo, ne da bi znova prenesel nespremenjene kontakte.
4. **[FR-014-24]** **Given** odjemalec poskusi v imeniku ustvariti, spremeniti ali izbrisati kontakt, **When** strežnik prejme zahtevo, **Then** jo zavrne kot nedovoljeno in v skupini se nič ne spremeni.
5. **[FR-014-25]** **Given** uporabnik prekliče geslo »iPhone«, **When** se odjemalec z njim znova poveže, **Then** strežnik odgovori `401` in odjemalec ne dobi nobenih podatkov; druga gesla delujejo naprej.
6. **[FR-014-22]** **Given** uporabnik zapusti skupino Klub ali je iz nje odstranjen, **When** se odjemalec naslednjič sinhronizira, **Then** imenika Klub ni več in zahteva po njem dobi `404`.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Uvoz je pisanje (najnižja vloga EDITOR, v arhivirani skupini `409 GROUP_ARCHIVED`). Izvoz vCard in koda QR sta branje kot izvoz v Excel (VIEWER, dovoljena v arhivirani skupini). Gesla za aplikacijo so vir, vezan na uporabnika.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-014-01, -05 | neprijavljen (brez žetona, neveljaven ali potekel žeton) | predogled ali potrditev uvoza | 401, nič se ne spremeni |
| FR-014-01, -05 | prijavljen nečlan ali neobstoječa skupina | predogled ali potrditev uvoza | 404, obstoj skupine se ne razkrije |
| FR-014-01, -05 | VIEWER | predogled ali potrditev uvoza | 403, nič se ne spremeni |
| FR-014-05 | EDITOR, ADMIN, OWNER v arhivirani ali trajno arhivirani skupini | potrditev uvoza | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-014-05 | EDITOR | skupina je bila arhivirana med predogledom in potrditvijo | 409 GROUP_ARCHIVED, noben kontakt ne nastane |
| FR-014-08 | EDITOR | uvoz z več kot 10 000 kontakti, nad 10 MB ali neberljiva datoteka | 400 VALIDATION_FAILED, nič se ne spremeni |
| FR-014-10 | neprijavljen | izvoz vCard (izbor ali en kontakt) | 401 |
| FR-014-10 | nečlan; kontakt druge skupine ali neobstoječ kontakt | izvoz vCard | 404, datoteka se ne ustvari |
| FR-014-10 | VIEWER … OWNER, tudi v arhivirani skupini | izvoz vCard | 200, datoteka |
| FR-014-14 | neprijavljen; nečlan; kontakt druge skupine | odpiranje kode QR kontakta | 401; 404; 404 |
| FR-014-17 | VIEWER; član arhivirane skupine | shranjevanje kontakta iz kode QR | 403; 409 GROUP_ARCHIVED (pravila 004) |
| FR-014-21, -25 | neprijavljen | seznam, ustvarjanje ali preklic gesel za aplikacijo | 401 |
| FR-014-25 | prijavljen uporabnik | preklic tujega gesla za aplikacijo | 404, geslo ostane veljavno |
| FR-014-22 | odjemalec CardDAV brez gesla, z napačnim, preklicanim geslom ali geslom izbrisanega računa | katerakoli zahteva | 401, brez podatkov |
| FR-014-22 | odjemalec CardDAV z veljavnim geslom | zahteva po imeniku ali kontaktu skupine, katere uporabnik ni član (ali ne obstaja) | 404, obstoj se ne razkrije |
| FR-014-22 | odjemalec CardDAV, prijava z Googlovim žetonom ali sejo spletne aplikacije namesto gesla za aplikacijo | katerakoli zahteva | 401 |
| FR-014-24 | odjemalec CardDAV katerekoli vloge | ustvarjanje, sprememba ali izbris kontakta ali imenika | 403, nič se ne spremeni |
| FR-014-26 | odjemalec CardDAV | 10 zaporednih neuspelih prijav za isti račun v 15 minutah | nadaljnje prijave za ta račun 15 minut zavrnjene z 401, tudi s pravim geslom |

### Edge Cases

- **Prazne vrstice in stolpci brez glave** v Excelu se preskočijo; stolpec z glavo, a brez vrednosti, ne ustvari atributov.
- **Dve glavi z istim ključem** (npr. »Vloga« in »vloga«): ob predogledu je napaka preslikave, en stolpec je treba preimenovati v cilju ali izključiti.
- **Več listov v datoteki**: uvozi se samo prvi list; predogled to pove.
- **Številke, datumi in formule v celicah**: uvozi se besedilo, kot ga prikazuje celica (npr. telefon `41123456`, datum v zapisu datoteke); formula se ne izvede znova, uporabi se shranjena prikazana vrednost.
- **Vrednost daljša od dovoljene** (npr. ime 150 znakov) ali več kot 50 atributov / 30 značk: vrstica je napaka v predogledu, vrednost se ne skrajša tiho.
- **Rezervirani ključ** (`država`, `podjetje`, `country`, `company`, imena predefiniranih polj) kot neprepoznana glava: predogled predlaga preslikavo na ustrezno predefinirano polje; atribut s tem ključem ne nastane (FR-013-08).
- **Kodiranje znakov**: vizitke v UTF-8 in vizitke 2.1 z drugim kodiranjem (npr. `QUOTED-PRINTABLE`, `CHARSET=`) se preberejo tako, da so šumniki pravilni.
- **Vizitka z več naslovi**: prednostni (sicer prvi) gre v *Naslov* in *Država*, ostali v atribute `Naslov 2` …
- **Ponoven uvoz iste datoteke**: vse vrstice so označene kot možni dvojniki in privzeto preskočene (FR-014-09), zato ne nastanejo podvojeni kontakti.
- **Koda QR z vizitko v zapisu MECARD** (pogost pri telefonih Android): prepozna se enako kot vCard.
- **Več kod QR na sliki**: uporabi se prva prepoznana koda s kontaktom; če jih je več s kontakti, se pokaže »Na sliki je več kod QR. Izberi sliko z eno kodo.«
- **Brez povezave (PWA)**: izvoz in predogled uvoza pokažeta sporočilo »Ni povezave.« z *Poskusi znova* (design.md 8.15); prikaz kode QR že naloženega kontakta in branje kode delujeta, shranjevanje pa sledi pravilom 004.
- **Gesla za aplikacijo po izbrisu računa (012)**: so preklicana skupaj z računom.
- **Kontakt v več skupinah** ne obstaja (kontakt pripada natanko eni skupini, 004), zato se v odjemalcu CardDAV pojavi v natanko enem imeniku.
- **Bralnik zaslona**: koda QR ima besedilno alternativo (»Koda QR s kontaktom Ana Kos«), stanje predogleda in uvoza se sporoča (`role="status"`), napake kot `role="alert"`.

## Requirements *(mandatory)*

### Functional Requirements

**Uvoz (Excel in vCard)**

- **FR-014-01**: Sistem MORA urednikom v nearhivirani skupini na seznamu kontaktov ponuditi akcijo »Uvozi« / "Import" z izbiro *Iz Excela (.xlsx)* ali *Iz vizitk (.vcf)*; bralcem in v arhivirani skupini akcije ni (konstitucija III – udobje, ne zaščita). *(najnižja vloga: EDITOR)*
- **FR-014-02**: Sistem MORA pri uvozu iz Excela prvi list prebrati z glavo v vrstici 1 in vsak stolpec preslikati na cilj *Ime*, *Priimek*, *Naslov*, *E-naslov*, *Telefon*, *Država*, *Podjetje*, *Značke*, *Dodatni atribut ‹ključ›* ali *Ne uvozi*: glave predefiniranih polj iz izvoza 010/013 v slovenščini ali angleščini (brez razlike velikosti črk) se preslikajo samodejno, druge glave na dodatni atribut z ključem, enakim glavi; urednik lahko preslikavo spremeni; predefinirano polje je lahko cilj največ enega stolpca. Celica *Značke* se razdeli pri vejicah, vrednosti se obrežejo. *(najnižja vloga: EDITOR)*
- **FR-014-03**: Sistem MORA pred uvozom pokazati predogled: povzetek (število kontaktov, pripravljenih za uvoz, in število vrstic z napakami), prvih 25 vrstic s paginacijo in vsako vrstico z napako z razlogom po polju po pravilih 004 in 013 (slovar feature-map §2.6); vrstice z napakami se ne uvozijo, uvoz pa je mogoč, če je vsaj ena vrstica veljavna. *(najnižja vloga: EDITOR)*
- **FR-014-04**: Sistem MORA vrednosti države prepoznati po FR-013-19; vsako različno dvoumno ali neprepoznano vrednost urednik v predogledu razreši enkrat (izbira države s seznama ali *Pusti prazno*), dokler niso razrešene vse, potrditev ni mogoča. Sistem nikoli ne izbere države namesto uporabnika. *(najnižja vloga: EDITOR)*
- **FR-014-05**: Sistem MORA potrjen uvoz izvesti atomarno: ustvari vse veljavne kontakte iz predogleda ali nobenega (konstitucija V); vsak nov kontakt dobi začetno verzijo, uvoz ustvari en vnos v revizijski sledi skupine (*Uvoz*, z izvajalcem, časom in številom kontaktov), ki ga je mogoče povrniti kot množično operacijo (005, 009). Po uspehu vmesnik pokaže »Uvoženih kontaktov: N.« in seznam z novimi kontakti, ob neuspehu sporočilo napake s *Poskusi znova* (design.md 8.13), predogled ostane. *(najnižja vloga: EDITOR)*
- **FR-014-06**: Sistem MORA pri uvozu iz Excela odstraniti en vodilni opuščaj `'` z vrednosti, kadar mu sledi znak, ki ga ščiti FR-010-09 (`=`, `+`, `-`, `@`, tabulator, CR), tako da izvoz 010 in ponoven uvoz ohranita vrednost; vse vrednosti se shranijo kot besedilo, nobena se ne izvede kot formula. *(najnižja vloga: EDITOR)*
- **FR-014-07**: Sistem MORA za uvožene ključe atributov in značke uporabiti kanonični zapis skupine (FR-013-10) in rezervirana imena (FR-013-08) enako kot pri ročnem vnosu. *(najnižja vloga: EDITOR)*
- **FR-014-08**: Sistem MORA z `400 VALIDATION_FAILED` zavrniti datoteko, ki ni berljiva `.xlsx` oziroma `.vcf`, je večja od 10 MB, nima glave (Excel) ali vsebuje več kot 10 000 kontaktov; vmesnik pove razlog v sl in en, v skupini se nič ne spremeni. *(najnižja vloga: EDITOR)*
- **FR-014-09**: Sistem MORA vrstice, ki se ujemajo z obstoječim kontaktom skupine po pravilih dvojnikov 011 (ime in priimek ali e-naslov ali telefon), v predogledu označiti kot možne dvojnike z razlogom ujemanja in za vsako takšno vrstico ponuditi izbiro *Preskoči* (privzeto) ali *Ustvari*; enako velja za vrstice, ki se med seboj ujemajo znotraj iste datoteke (prva je navadna, naslednje so možni dvojniki). Uvoz obstoječih kontaktov nikoli ne spremeni; število preskočenih se pokaže v povzetku predogleda in v obvestilu po uvozu (»Uvoženih kontaktov: N. Preskočenih dvojnikov: M.«). *(najnižja vloga: EDITOR)*

**Izvoz in pretvorba vCard**

- **FR-014-10**: Sistem MORA vsem članom (tudi bralcem in v arhivirani skupini) omogočiti izvoz izbora v eno datoteko `.vcf` iz akcijske vrstice izbora (*Izvozi v vCard (.vcf)*) z enakimi pravili izbora, preverjanja, izpuščanja, mej in napak kot izvoz v Excel (FR-010-02, -07, -11, -12, -13, -14, -15, -16) in izvoz enega kontakta s pogleda kontakta (*Prenesi vizitko (.vcf)*); ime datoteke izbora je `‹naslov›-kontakti-‹YYYY-MM-DD›.vcf` (en: `contacts`), enega kontakta `‹ime-priimek›.vcf`, oboje po pravilu FR-010-10. *(najnižja vloga: VIEWER)*
- **FR-014-11**: Sistem MORA kontakt zapisati kot vizitko vCard različice 3.0 v UTF-8 tako, da standardne aplikacije imenikov (telefon iOS in Android, Google Contacts, Outlook, Thunderbird) prikažejo ime, priimek, naslov, državo, e-naslov, telefon in podjetje v ustreznih poljih, značke pa kot kategorije; dodatni atributi se zapišejo tako, da jih Contact Manager prebere nazaj, druge aplikacije pa jih lahko prezrejo. *(najnižja vloga: VIEWER)*
- **FR-014-12**: Sistem MORA zagotoviti, da izvoz vCard (FR-014-10) in ponoven uvoz (FR-014-13) ohranita vsa polja, dodatne atribute in značke kontakta brez spremembe vrednosti (preverljivo s primerjavo). *(najnižja vloga: EDITOR)*
- **FR-014-13**: Sistem MORA pri uvozu iz `.vcf` (in pri branju kode QR, FR-014-18) brati vizitke vCard 2.1, 3.0 in 4.0: razčlenjeno ime v *Ime* in *Priimek* (brez razčlenjenega imena se polno ime razdeli tako, da je zadnja beseda priimek); prednostni, sicer prvi, e-naslov, telefon in naslov v predefinirana polja (država naslova po FR-014-04), naslednji v dodatne atribute `E-naslov 2`, `Telefon 2`, `Naslov 2` …; organizacijo v *Podjetje*; kategorije v značke (presledki v znački se zamenjajo z `-`); rojstni dan, spletno stran in opombo v atribute `Rojstni dan` / `Birthday`, `Spletna stran` / `Website`, `Opomba` / `Note` (po jeziku vmesnika); fotografije in drugih lastnosti ne uvozi. Uvoz iz `.vcf` uporabi predogled in pravila FR-014-03 do -09. *(najnižja vloga: EDITOR)*

**Koda QR**

- **FR-014-14**: Sistem MORA vsem članom (tudi bralcem in v arhivirani skupini) na pogledu kontakta ponuditi *Deli s kodo QR*, ki odpre pogovorno okno s kodo QR, imenom kontakta, seznamom vključenih polj ter gumboma *Prenesi sliko* (`‹ime-priimek›-qr.png`) in *Zapri*; koda ima besedilno alternativo, okno je dostopno s tipkovnico in bralnikom zaslona (design.md 8.11). *(najnižja vloga: VIEWER)*
- **FR-014-15**: Sistem MORA v kodo QR zapisati kontakt kot vizitko po FR-014-11, tako da jo vgrajena kamera telefonov iOS in Android prepozna kot kontakt in jo prebere FR-014-18; koda vsebuje podatke kontakta (ne povezave na aplikacijo) in jo je mogoče uporabiti brez računa. Okno pred kodo opozori »Kdor kodo poskenira, vidi vključene podatke.« *(najnižja vloga: VIEWER)*
- **FR-014-16**: Sistem MORA kodo QR omejiti na velikost, ki jo telefoni zanesljivo preberejo s papirja ali zaslona; če kontakt ne gre v kodo, se polja izpuščajo v tem vrstnem redu, dokler ne gre: dodatni atributi, značke, naslov; ime, priimek, e-naslov, telefon, podjetje in država so vedno vključeni. Okno pove, katera polja niso vključena, in ponudi *Prenesi vizitko (.vcf)* s celotnim kontaktom. *(najnižja vloga: VIEWER)*
- **FR-014-17**: Sistem MORA urednikom v nearhivirani skupini na seznamu kontaktov ponuditi *Dodaj s kodo QR*, ki zaprosi za dostop do kamere in pokaže sliko kamere z navodilom; kadar kamera ni na voljo ali dostop ni dovoljen, ali na zahtevo uporabnika (*Izberi sliko*), MORA ponuditi branje kode iz izbrane slike (PNG, JPEG, do 10 MB). *(najnižja vloga: EDITOR)*
- **FR-014-18**: Sistem MORA iz prebrane kode QR z vizitko (vCard 2.1–4.0 po FR-014-13 ali MECARD) odpreti obrazec novega kontakta (004), predizpolnjen s prebranimi podatki; neveljavne vrednosti so v poljih z napako ob polju, država se prepozna po FR-013-19 (dvoumna ali neprepoznana je predlog, ne izbira); kontakt nastane šele ob shranjevanju po pravilih 004 in 013, z vnosom v sledi. *(najnižja vloga: EDITOR)*
- **FR-014-19**: Sistem MORA za sliko brez kode QR ali s kodo, ki ni kontakt, pokazati »Na sliki ni kode QR s kontaktom.« / "No contact QR code found in the image." in omogočiti nov poskus; besedila v sl in en. *(najnižja vloga: EDITOR)*
- **FR-014-20**: Sistem MORA kamero ustaviti takoj po prebrani kodi, ob zaprtju okna ali zapustitvi strani; slike s kamere in izbrane slike se ne pošiljajo na strežnik in se ne shranjujejo (konstitucija VI). *(najnižja vloga: EDITOR)*

**CardDAV**

- **FR-014-21**: Sistem MORA prijavljenemu uporabniku v *Mojem računu* omogočiti ustvarjanje gesel za aplikacijo (ime 1–50 znakov, največ 10 aktivnih na uporabnika; preseženo → `409 APP_PASSWORD_LIMIT`): geslo se pokaže samo enkrat skupaj z naslovom strežnika in uporabniškim imenom, sistem ga hrani samo v obliki, iz katere ga ni mogoče razbrati; seznam gesel kaže ime, čas nastanka in zadnje uporabe, nikoli gesla. *(najnižja vloga: — (vezano na uporabnika))*
- **FR-014-22**: Sistem MORA odjemalcem CardDAV s prijavo z e-naslovom računa in veljavnim geslom za aplikacijo ponuditi en imenik za vsako skupino, katere član je uporabnik (tudi arhivirano), z imenom skupine in natanko kontakti te skupine kot vizitkami po FR-014-11; članstvo in vloga se preverita ob vsaki zahtevi (matrika izolacije: brez ali z neveljavnim geslom `401`, tuja ali neobstoječa skupina ali kontakt `404`). Drugi načini prijave (Googlov žetoni, seja spletne aplikacije) za CardDAV ne veljajo. *(najnižja vloga: VIEWER)*
- **FR-014-23**: Sistem MORA odjemalcem omogočiti postopno sinhronizacijo: odjemalec ob vsaki sinhronizaciji izve, kateri kontakti so bili dodani, spremenjeni ali izbrisani od prejšnje, ne da bi prenesel vse kontakte; spremembe iz aplikacije so vidne ob prvi naslednji sinhronizaciji. *(najnižja vloga: VIEWER)*
- **FR-014-24**: Sistem MORA imenike CardDAV ponujati samo za branje: vsako zahtevo za ustvarjanje, spremembo ali izbris kontakta ali imenika zavrne s `403` ne glede na vlogo in nič ne spremeni. *(najnižja vloga: —)*
- **FR-014-25**: Sistem MORA uporabniku omogočiti preklic posameznega gesla za aplikacijo (s potrditvenim dialogom, feature-map §2.8); preklicano geslo takoj neha delovati (`401`), druga ostanejo. Izbris računa (012) prekliče vsa gesla; izvoz lastnih podatkov (012) vključi imena, čase nastanka in zadnje uporabe gesel, ne pa gesel. *(najnižja vloga: — (vezano na uporabnika))*
- **FR-014-26**: Sistem MORA po 10 zaporednih neuspelih prijavah CardDAV za isti račun v 15 minutah zavrniti nadaljnje prijave CardDAV za ta račun za 15 minut (`401`); omejitev ne vpliva na prijavo v spletno aplikacijo. *(najnižja vloga: —)*
- **FR-014-27**: Sistem MORA v *Mojem računu* prikazati navodilo za povezavo (naslov strežnika, uporabniško ime, kje vpisati geslo) v sl in en; branje prek CardDAV se ne beleži v revizijski sledi (ni sprememba, feature-map §2.7). *(najnižja vloga: —)*

### Key Entities *(include if feature involves data)*

- **Predogled uvoza**: naložena datoteka (Excel ali vCard), preslikava stolpcev oziroma lastnosti na polja kontakta, vrstice z rezultatom preverjanja (veljavna, napaka po poljih, možen dvojnik z izbiro *Preskoči* / *Ustvari*), razrešitve držav. Obstaja samo do potrditve ali preklica; datoteka se ne hrani.
- **Uvoz**: ena atomarna operacija, ki ustvari N kontaktov v skupini in en vnos revizijske sledi (izvajalec, čas, število, vrsta vira).
- **Vizitka (vCard)**: zapis enega kontakta za izmenjavo; isti zapis uporabljajo datoteka `.vcf`, koda QR in CardDAV.
- **Koda QR kontakta**: vizitka kontakta v kodi QR, morda brez polj po FR-014-16; se ne hrani.
- **Geslo za aplikacijo**: pripada enemu uporabniku; ime, nerazberljiva oblika gesla, čas nastanka, čas zadnje uporabe, stanje (aktivno / preklicano).
- **Imenik CardDAV**: pogled na kontakte ene skupine za enega uporabnika; ni nov podatek, ampak drug dostop do kontaktov skupine.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Urednik uvozi datoteko s 500 kontakti (z izvoženo glavo iz 010) od izbire datoteke do potrditve v manj kot 2 minutah in z največ petimi dejanji (Uvozi → Iz Excela → izbira datoteke → pregled → potrditev).
- **SC-002**: Predogled datoteke z 10 000 vrsticami je pripravljen v manj kot 10 s, potrjen uvoz 10 000 kontaktov se zaključi v manj kot 30 s v 95 % primerov.
- **SC-003**: 100 % kontaktov preizkusnega nabora (vsa polja, šumniki, večvrstični naslovi, 50 atributov, 30 značk, vrednosti z `=`/`+`) je po izvozu v Excel ali vCard in ponovnem uvozu enakih izvirnim.
- **SC-004**: Kodo QR kontakta prepozna kot kontakt vgrajena kamera trenutnih različic iOS in Android in branje v aplikaciji (s kamero in iz slike) v 100 % preizkusnih primerov; branje s kamero traja manj kot 3 s od usmeritve.
- **SC-005**: Datoteko `.vcf` iz izvoza brez napak odprejo vsaj tri razširjene aplikacije imenikov (telefon iOS, Android, namizni poštni odjemalec) z imenom, e-naslovom in telefonom v pravih poljih.
- **SC-006**: Odjemalec CardDAV pokaže spremembo kontakta najpozneje ob prvi naslednji sinhronizaciji; vzpostavitev povezave z novim geslom traja uporabniku manj kot 3 minute po navodilu FR-014-27.
- **SC-007**: Noben uvoz, izvoz, koda QR ali zahteva CardDAV ne vrne ali ustvari kontakta v skupini, katere uporabnik ni član (matrika izolacije brez izjem, tudi za CardDAV).
- **SC-008**: Neuspel uvoz v 100 % primerov ne pusti nobenega novega kontakta (atomarnost).

## Assumptions

- **Odvisnosti**: 004 (kontakt in pravila), 005 (sled in rollback), 009 (izbor, akcijska vrstica, meja 10 000), 010 (izvoz v Excel – zapis glave in zaščita formul), 011 (pravila ujemanja dvojnikov), 012 (moji podatki in izbris računa), 013 (Podjetje, Država, prepoznavanje države FR-013-19, kanonični zapis, rezervirana imena).
- **»Razširitev izvoza v Excel«** pomeni, da je izvožena datoteka 010 neposredno uvozna predloga (krožna pot izvoz → uvoz); sam izvoz v Excel se ne spreminja.
- **Velikost in tveganje**: zgodba 5 (CardDAV) uvaja nov tip klicatelja in nov način prijave, zato je funkcionalnost po konstituciji §2.1 *tvegana*; `plan.md` se pred nalogami pokaže razvijalcu. Zgodbe so neodvisne in jih je mogoče uvajati v ločenih PR-jih (rezinah) v vrstnem redu prioritet.
- **Meje uvoza** (10 000 kontaktov, 10 MB) so usklajene z največjim izborom 009; uvoz je ena množična operacija.
- **Uvoz iz kode QR** odpre predizpolnjen obrazec namesto takojšnjega shranjevanja, ker uporabnik tako vidi in popravi podatke iz tuje kode; shranjevanje je navadno ustvarjanje kontakta (004).
- **Branje kode QR** poteka v brskalniku; slike ne zapustijo naprave.
- **Gesla za aplikacijo** so potrebna, ker odjemalci CardDAV ne podpirajo prijave z Googlom; to je nov tip poverilnice in zahteva zapis odločitve v `docs/decisions/` (konstitucija §2.6).
- **Omejitev neuspelih prijav** (10 v 15 minutah, zaklep 15 minut) je privzeta vrednost po običajni praksi; odpravi ugibanje gesel brez vpliva na spletno prijavo.
- **Nove kode napak** (`APP_PASSWORD_LIMIT`) in razširitev seznama dovoljenih operacij v arhivirani skupini (izvoz vCard, koda QR, branje CardDAV) se v istem PR prenesejo v `feature-map.md` §2.4 in §2.10.
- **Imena dodatnih atributov iz vizitk** (`E-naslov 2`, `Rojstni dan` …) so v jeziku vmesnika ob uvozu in niso rezervirana.
