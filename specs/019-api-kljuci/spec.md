# Feature Specification: API ključi in javni programski vmesnik

**Feature Branch**: `api-kljuci` (no number; the directory is `specs/019-api-kljuci/`)

**Created**: 2026-11-16

**Input**: User description: "API ključi (posebej endpointi za API, ki v ozadju uporabljajo enake service kot navadni endpointi, le avtorizacija je drugačna - preko API ključa), stran za razlago in uporabo API-ja."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ustvarjanje in preklic API ključa (Priority: P1)

Uporabnik želi kontakte svojih skupin uporabljati v lastnem programu ali skripti (npr. sinhronizacija s CRM, nočni izvoz). V *Mojem računu* na zavihku *API ključi* ustvari ključ z imenom (npr. »Nočni izvoz«), izbere, za katere skupine velja, ali sme samo brati ali tudi pisati, in rok veljavnosti. Ključ se pokaže **enkrat**; kasneje ga lahko le prekliče.

**Why this priority**: brez ključa programski vmesnik ni dosegljiv; preklic je varnostni pogoj za vse ostalo.

**Independent Test**: ustvari ključ, preveri, da je viden enkrat in nato samo na seznamu brez vrednosti; z njim pokliči API (`2xx`); prekliči ga in preveri `401`.

**Acceptance Scenarios**:

1. **[FR-019-01]** **Given** prijavljen uporabnik na zavihku *API ključi*, **When** ustvari ključ »Nočni izvoz« (skupina Klub, samo branje, velja 90 dni), **Then** se ključ pokaže **enkrat** z gumbom *Kopiraj* in opozorilom, da ga ne bo več mogoče videti; po zaprtju okna je na seznamu »Nočni izvoz« s skupinami, pravico, časom nastanka, rokom veljavnosti in »še ni uporabljen«, nikoli z vrednostjo ključa.
2. **[FR-019-01]** **Given** uporabnik ima 10 aktivnih ključev, **When** ustvari enajstega, **Then** je zahteva zavrnjena (`409 API_KEY_LIMIT`), vmesnik pove, da mora najprej preklicati obstoječega, in nič ne nastane.
3. **[FR-019-02]** **Given** ključ »Nočni izvoz« je bil uporabljen, **When** uporabnik odpre seznam, **Then** vidi čas zadnje uporabe.
4. **[FR-019-03]** **Given** aktiven ključ »Nočni izvoz«, **When** ga uporabnik prekliče in potrdi v dialogu, **Then** naslednja zahteva s tem ključem dobi `401`, drugi ključi delujejo naprej, ključ je na seznamu označen kot preklican.
5. **[FR-019-04]** **Given** ključu je potekel rok veljavnosti, **When** program pošlje zahtevo z njim, **Then** dobi `401` in na seznamu je ključ označen kot potekel.
6. **[FR-019-05]** **Given** uporabnik ima aktivne ključe, **When** izbriše račun (012), **Then** so vsi njegovi ključi preklicani; izvoz lastnih podatkov (012) vsebuje imena, skupine, pravice in čase ključev, ne pa vrednosti.

---

### User Story 2 - Branje skupin in kontaktov prek API (Priority: P1)

Program z veljavnim ključem prebere seznam skupin, za katere ključ velja, in kontakte teh skupin – paginirano, z enakim iskanjem, filtri in razvrščanjem kot v spletni aplikaciji, ter posamezen kontakt.

**Why this priority**: branje je najpogostejša raba (izvoz, sinhronizacija) in je osnova za pisanje.

**Independent Test**: s ključem za skupino Klub preberi seznam skupin (samo Klub), stran kontaktov z iskanjem in en kontakt; rezultati se ujemajo s tem, kar isti uporabnik vidi v spletni aplikaciji.

**Acceptance Scenarios**:

1. **[FR-019-06]** **Given** uporabnik je član skupin Klub in Projekt FERI, ključ velja samo za Klub, **When** program prebere seznam skupin, **Then** dobi samo Klub z naslovom, opisom, barvo, stanjem arhiviranja in vlogo uporabnika.
2. **[FR-019-07]** **Given** ključ za Klub, **When** program prebere kontakte Kluba z iskalnim nizom »novak«, filtrom po znački in velikostjo strani 50, **Then** dobi enake kontakte v enakem vrstnem redu in z enakimi podatki paginacije, kot jih isti uporabnik vidi v spletni aplikaciji (008, feature-map §2.6).
3. **[FR-019-07]** **Given** ključ za Klub, **When** program prebere en kontakt Kluba, **Then** dobi vsa polja kontakta (predefinirana, dodatni atributi s tipi, značke) v kanoničnem zapisu (016) in verzijo kontakta.
4. **[FR-019-08]** **Given** skupina Klub je arhivirana, **When** program bere njene kontakte, **Then** branje uspe.
5. **[FR-019-09]** **Given** uporabnik je bil medtem odstranjen iz Kluba, **When** program s ključem bere Klub, **Then** dobi `404`; ključ za druge skupine deluje naprej.

---

### User Story 3 - Pisanje kontaktov prek API (Priority: P2)

Program s ključem s pravico pisanja ustvari, spremeni ali izbriše kontakt v skupini, kjer ima uporabnik vlogo urednik ali višjo. Pravila so enaka kot v spletni aplikaciji: preverjanje in normalizacija podatkov, optimistično zaklepanje, revizijska sled.

**Why this priority**: omogoča integracije v obe smeri, a je tvegano in ni nujno za prvo rabo.

**Independent Test**: s ključem za pisanje ustvari kontakt, ga spremeni z verzijo in izbriše; v spletni aplikaciji preveri kontakt in tri vnose v sledi z oznako ključa.

**Acceptance Scenarios**:

1. **[FR-019-10]** **Given** urednik Kluba in ključ s pravico pisanja za Klub, **When** program ustvari kontakt, **Then** kontakt nastane z enako normalizacijo kot v obrazcu (npr. telefon v E.164, 016) in odgovor vsebuje kontakt z verzijo.
2. **[FR-019-10]** **Given** program pošlje neveljaven kontakt (brez imena in priimka, napačen e-naslov), **When** ga ustvari ali spremeni, **Then** dobi `400 VALIDATION_FAILED` z napakami po poljih enako kot spletna aplikacija in nič se ne spremeni.
3. **[FR-019-11]** **Given** program spremeni kontakt z zastarelo verzijo, **When** pošlje spremembo, **Then** dobi `409 VERSION_CONFLICT` in nič se ne prepiše.
4. **[FR-019-12]** **Given** program prek API ustvari, spremeni ali izbriše kontakt, **When** član odpre revizijsko sled, **Then** je vnos zapisan z uporabnikom kot izvajalcem in oznako »prek API ključa »Nočni izvoz««; ob izbrisu uporabnika je prikazan »izbrisan uporabnik« (feature-map §2.5).
5. **[FR-019-13]** **Given** ključ samo za branje, **When** program poskusi pisati, **Then** dobi `403` in nič se ne spremeni, tudi če ima uporabnik v skupini vlogo lastnik.

---

### User Story 4 - Stran z razlago in uporabo API (Priority: P2)

Razvijalec integracije odpre stran *API* in na njej najde vse, kar potrebuje: kako dobi ključ, kako ga pošlje, seznam operacij s primeri zahtev in odgovorov, paginacijo, kode napak, omejitve pogostosti in strojno berljiv opis vmesnika za prenos.

**Why this priority**: brez razlage vmesnika ni mogoče uporabiti, a zgodbi 1–3 sta preverljivi tudi brez nje.

**Independent Test**: neprijavljen obiskovalec odpre stran *API*, prenese strojno berljiv opis in po primeru s strani z veljavnim ključem uspešno prebere kontakte.

**Acceptance Scenarios**:

1. **[FR-019-14]** **Given** obiskovalec (prijavljen ali ne), **When** odpre stran *API*, **Then** vidi v izbranem jeziku (sl/en): uvod in varnostna priporočila, kako ustvariti ključ (s povezavo na *API ključi*, ki neprijavljenega vodi na prijavo), kako ga poslati, seznam vseh operacij z vlogo in pravico ključa, primere zahtev in odgovorov, paginacijo, register kod napak in omejitve pogostosti.
2. **[FR-019-15]** **Given** stran *API*, **When** obiskovalec izbere *Prenesi opis vmesnika*, **Then** prenese strojno berljiv opis, ki se ujema z dejanskim vmesnikom (vsaka operacija vmesnika je v opisu in obratno).
3. **[FR-019-19]** **Given** program uporablja različico 1 vmesnika, **When** v vmesnik pride novo neobvezno polje kontakta, **Then** program brez sprememb deluje naprej; stran *API* navaja trenutno različico in spremembe.
4. **[FR-019-14]** **Given** stran *API*, **When** jo uporabnik pregleda s tipkovnico in bralnikom zaslona pri 320 px in 1280 px, **Then** so primeri kode berljivi in kopirljivi (gumb *Kopiraj*), brez vodoravnega drsenja strani in brez kršitev axe.

---

### User Story 5 - Statistika uporabe ključa (Priority: P2)

Uporabnik želi videti, kako njegovi programi uporabljajo ključe: koliko zahtev pošiljajo, koliko je napak in zavrnitev zaradi omejitve pogostosti, ali kateri ključ sploh še teče. Na zavihku *API ključi* v *Mojem računu* odpre statistiko posameznega ključa.

**Why this priority**: uporabnik brez nje ne opazi pokvarjenega programa ali zlorabe ključa; ni pa pogoj za samo uporabo API.

**Independent Test**: s ključem pošlji nekaj uspešnih zahtev, eno neveljavno in nekaj čez omejitev pogostosti; statistika ključa pokaže točna števila po dnevih in izidu, drug ključ ima svoja ločena števila.

**Acceptance Scenarios**:

1. **[FR-019-20]** **Given** ključ »Nočni izvoz« je danes poslal 40 uspešnih branj, 5 uspešnih pisanj, 3 zahteve z napako klicatelja (npr. `400`, `404`) in 2 zavrnitvi zaradi omejitve pogostosti, **When** uporabnik odpre statistiko ključa, **Then** vidi za danes 50 zahtev: 45 uspešnih (od tega 40 branj in 5 pisanj), 3 napake in 2 zavrnitvi zaradi omejitve, ter skupno število za izbrano obdobje.
2. **[FR-019-20]** **Given** ključ je bil uporabljen v zadnjih 30 dneh, **When** uporabnik izbere obdobje 7 ali 30 dni, **Then** vidi število zahtev po dnevih kot graf in kot enakovredno tabelo (dan, uspešne, napake, zavrnitve), dneve brez zahtev z vrednostjo 0.
3. **[FR-019-20]** **Given** uporabnik ima več ključev, **When** odpre seznam ključev, **Then** ob vsakem ključu vidi število zahtev v zadnjih 24 urah in čas zadnje uporabe; števila enega ključa nikoli ne vključujejo zahtev drugega.
4. **[FR-019-21]** **Given** ključ je preklican ali potekel, **When** uporabnik odpre seznam, **Then** ključ s statistiko ostane viden še 90 dni od preklica oziroma poteka, nato se odstrani skupaj s statistiko.
5. **[FR-019-21]** **Given** uporabnik izbriše račun ali izvozi svoje podatke (012), **When** se operacija izvede, **Then** se statistika izbriše z računom oziroma je v izvozu kot dnevni povzetki po ključih.

---

### User Story 6 - Zaščita pred zlorabo (Priority: P3)

Ključ v napačnih rokah ali pokvarjen program ne sme preobremeniti sistema ali neopazno delovati: zahteve so omejene po pogostosti, uporaba je vidna lastniku ključa.

**Why this priority**: varnostna mreža; osnovna zaščita (preklic, potek, izolacija) je že v zgodbah 1–3.

**Independent Test**: s ključem pošlji več zahtev, kot jih dovoljuje omejitev, in preveri `429` s časom do ponovnega poskusa; drug ključ istega uporabnika ni prizadet.

**Acceptance Scenarios**:

1. **[FR-019-16]** **Given** ključ je v zadnji minuti poslal 120 zahtev, **When** pošlje naslednjo, **Then** dobi `429 RATE_LIMITED` s časom, po katerem sme ponoviti; drugi ključi in spletna aplikacija niso prizadeti.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Operacije API so nov tip klicatelja (konstitucija §2.1, *tvegana funkcionalnost*). Vrstni red preverjanj je feature-map §2.2 z dodatkom: po članstvu (404) se preveri še, ali ključ velja za skupino (404) in ali ima pravico pisanja (403). Ključi sami so vir, vezan na uporabnika.

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-019-06, 07 | brez ključa, neveljaven, preklican ali potekel ključ, ključ izbrisanega računa | katerakoli operacija API | 401 `UNAUTHENTICATED`, brez podatkov |
| FR-019-06, 07 | Googlov (Firebase) žeton ali seja spletne aplikacije namesto ključa | katerakoli operacija API | 401 |
| FR-019-17 | API ključ namesto prijave | katerikoli endpoint spletne aplikacije (`/api`) ali CardDAV | 401 |
| FR-019-07 | veljaven ključ, uporabnik ni član skupine (ali skupina ne obstaja, ali kontakt druge skupine) | branje ali pisanje | 404, obstoj se ne razkrije |
| FR-019-07 | veljaven ključ, uporabnik je član, a ključ za to skupino ne velja | branje ali pisanje | 404, obstoj se ne razkrije |
| FR-019-10 | ključ za pisanje, uporabnik je bralec | ustvarjanje, sprememba, izbris kontakta | 403, nič se ne spremeni |
| FR-019-13 | ključ samo za branje, uporabnik urednik ali višje | ustvarjanje, sprememba, izbris kontakta | 403, nič se ne spremeni |
| FR-019-10 | ključ za pisanje, urednik arhivirane skupine | ustvarjanje, sprememba, izbris kontakta | 409 `GROUP_ARCHIVED`, nič se ne spremeni |
| FR-019-11 | ključ za pisanje, urednik | sprememba ali izbris z zastarelo verzijo | 409 `VERSION_CONFLICT`, nič se ne spremeni |
| FR-019-01, 03 | neprijavljen | ustvarjanje, seznam ali preklic ključev | 401 |
| FR-019-03 | prijavljen uporabnik | preklic tujega ključa | 404, ključ ostane veljaven |
| FR-019-18 | API ključ | ustvarjanje, seznam ali preklic ključev | 401 (ključi se upravljajo samo v spletni aplikaciji) |
| FR-019-01 | prijavljen uporabnik | ključ za skupino, katere ni član | 404, nič ne nastane |
| FR-019-20 | neprijavljen | branje statistike ključa | 401 |
| FR-019-20 | prijavljen uporabnik | branje statistike tujega ključa | 404, obstoj se ne razkrije |
| FR-019-20 | API ključ | branje statistike (tudi lastnega ključa) | 401 (statistika je samo v spletni aplikaciji) |

### Edge Cases

- **Vloga se spremeni po ustvarjanju ključa**: velja vedno trenutna vloga uporabnika v skupini; ključ pravic nikoli ne poveča (urednik, znižan na bralca, s ključem za pisanje dobi `403`).
- **Uporabnik zapusti skupino ali je odstranjen**: ključ za to skupino dobi `404`, za druge skupine deluje naprej; ob ponovnem članstvu ključ za skupino spet deluje, če je še aktiven.
- **Skupina izbrisana**: ključ zanjo dobi `404`; če ključ ne velja za nobeno drugo skupino, je na seznamu označen »brez veljavnih skupin«.
- **Vrednost ključa v zahtevi na napačnem mestu** (npr. v naslovu URL): zahteva se zavrne z `401`, ključ se ne zabeleži v dnevnike.
- **Ključ se pojavi v dnevnikih strežnika ali napakah**: nikoli; beleži se samo prepoznavni del (predpona), ne celoten ključ.
- **Dvojna zahteva za ustvarjanje kontakta** (ponovitev po prekinjeni povezavi): nastaneta dva kontakta, kot v spletni aplikaciji; dvojnike razreši 011.
- **Uporabnik preklice ključ med tekočo zahtevo**: tekoča zahteva se izvede do konca; vsaka naslednja dobi `401`.

## Requirements *(mandatory)*

### Functional Requirements

**Upravljanje ključev** (v *Mojem računu*, zavihek *API ključi*)

- **FR-019-01**: Sistem MORA prijavljenemu uporabniku omogočiti ustvarjanje API ključa z imenom (1–50 znakov), izbiro skupin, za katere velja (ena ali več skupin, katerih član je, ali »vse moje skupine«, tudi prihodnje), pravico (*samo branje* – privzeto – ali *branje in pisanje*) in rokom veljavnosti (30, 90 – privzeto –, 365 dni ali brez roka); največ 10 aktivnih ključev na uporabnika (`409 API_KEY_LIMIT`). Ključ se pokaže samo enkrat; sistem ga hrani samo v obliki, iz katere ga ni mogoče razbrati. *(najnižja vloga: — (vezano na uporabnika); skupine samo tiste, katerih je član)*
- **FR-019-02**: Sistem MORA na seznamu ključev prikazati ime, prepoznavni začetek ključa, skupine, pravico, čas nastanka, rok veljavnosti, čas zadnje uporabe in stanje (aktiven, potekel, preklican), nikoli celotne vrednosti. *(—)*
- **FR-019-03**: Sistem MORA uporabniku omogočiti preklic lastnega ključa s potrditvenim dialogom (feature-map §2.8); preklican ključ takoj neha delovati (`401`), drugi ostanejo. Ključa ni mogoče spremeniti (ime, skupine, pravica, rok) – za drugačne nastavitve uporabnik ustvari novega. *(—)*
- **FR-019-04**: Sistem MORA ključ po izteku roka veljavnosti zavrniti z `401` in ga na seznamu prikazati kot potekel; 7 dni pred iztekom ga na seznamu označi kot »kmalu poteče«. *(—)*
- **FR-019-05**: Izbris računa (012) MORA preklicati vse ključe uporabnika; izvoz lastnih podatkov (012) MORA vključiti imena, skupine, pravice in čase ključev, ne pa vrednosti ali prepoznavnega začetka. *(—)*

**Programski vmesnik**

- **FR-019-06**: Sistem MORA klicatelju z veljavnim ključem vrniti seznam skupin, za katere ključ velja in katerih član je uporabnik (tudi arhivirane), s podatki skupine in uporabnikovo vlogo. *(najnižja vloga: VIEWER)*
- **FR-019-07**: Sistem MORA klicatelju z veljavnim ključem omogočiti branje kontaktov skupine (paginiran seznam z iskanjem, filtri in razvrščanjem po 008) in posameznega kontakta z verzijo; rezultat je za isti uporabnik in isto skupino enak kot v spletni aplikaciji. *(najnižja vloga: VIEWER; dovoljeno v arhivirani skupini)*
- **FR-019-08**: Branje prek API MORA biti dovoljeno tudi v arhivirani skupini in se ne beleži v revizijski sledi (feature-map §2.7). *(VIEWER)*
- **FR-019-09**: Sistem MORA članstvo, vlogo in stanje skupine preveriti ob **vsaki** zahtevi; ključ nikoli ne da več pravic, kot jih ima uporabnik v tistem trenutku. *(—)*
- **FR-019-10**: Sistem MORA klicatelju s ključem za pisanje omogočiti ustvarjanje, spremembo in izbris kontakta z enakimi pravili kot spletna aplikacija (004, 013, 016: preverjanje, normalizacija, kanonični zapis ključev in značk, kode napak). *(najnižja vloga: EDITOR; v arhivirani skupini `409 GROUP_ARCHIVED`)*
- **FR-019-11**: Sprememba in izbris kontakta prek API MORATA zahtevati verzijo kontakta; ob neujemanju `409 VERSION_CONFLICT` in nič se ne spremeni (feature-map §2.3). *(EDITOR)*
- **FR-019-12**: Vsaka sprememba kontakta prek API MORA ustvariti vnos v revizijski sledi skupine z uporabnikom kot izvajalcem in imenom ključa; pregled sledi (005, 015) prikaže oznako »prek API«, filter po uporabniku jo vključuje. *(—)*
- **FR-019-13**: Ključ *samo za branje* MORA vsako pisanje zavrniti s `403` ne glede na vlogo uporabnika. *(—)*
- **FR-019-16**: Sistem MORA omejiti pogostost zahtev na 120 na minuto na ključ; preseženo → `429 RATE_LIMITED` s časom do ponovnega poskusa. Omejitev ne vpliva na druge ključe in spletno aplikacijo. *(—)*
- **FR-019-17**: Operacije API MORAJO sprejemati samo API ključ; Firebase žeton in seja spletne aplikacije tam ne veljata, API ključ pa ne velja na endpointih spletne aplikacije in CardDAV. *(—)*
- **FR-019-18**: Ključe je mogoče ustvariti, pregledati in preklicati samo v prijavljeni spletni aplikaciji, ne prek API. *(—)*
- **FR-019-19**: Vmesnik MORA biti označen z različico; nezdružljiva sprememba (odstranjeno ali preimenovano polje, spremenjen pomen) pomeni novo različico, obstoječa pa ostane nespremenjena. Dodajanje novih neobveznih polj ni nezdružljivo. *(—)*

**Statistika uporabe**

- **FR-019-20**: Sistem MORA za vsak ključ uporabnika šteti zahteve po dnevih in izidu (uspešne branje, uspešno pisanje, napaka klicatelja, zavrnitev zaradi omejitve pogostosti) in jih uporabniku v *Mojem računu* prikazati: na seznamu število v zadnjih 24 urah, v statistiki ključa obdobje 7 ali 30 dni kot graf z enakovredno tabelo (design.md) in skupna števila. Zahteve z neveljavnim, preklicanim ali poteklim ključem se ne štejejo (ključa ni mogoče zanesljivo pripisati). Šteje se samo število, ne vsebina zahtev ali podatki kontaktov. *(najnižja vloga: — (vezano na uporabnika))*
- **FR-019-21**: Sistem MORA dnevne povzetke hraniti 90 dni; preklican ali potekel ključ ostane s statistiko na seznamu 90 dni od preklica ali poteka in se nato odstrani. Izbris računa (012) izbriše statistiko, izvoz lastnih podatkov (012) jo vključi kot dnevne povzetke po ključih. *(—)*

**Stran API**

- **FR-019-14**: Sistem MORA ponuditi stran *API*, dostopno brez prijave in povezano iz *API ključev* in noge aplikacije, ki v sl in en razloži: namen, varnostna priporočila (ključ hraniti kot geslo, najmanjše potrebne pravice, preklic ob sumu zlorabe), ustvarjanje in pošiljanje ključa, vse operacije z najnižjo vlogo in pravico ključa, primere zahtev in odgovorov, paginacijo, kode napak, omejitve pogostosti in različice. Primeri kode imajo gumb *Kopiraj*; stran sledi design.md in WCAG 2.1 AA. *(—)*
- **FR-019-15**: Stran *API* MORA ponuditi prenos strojno berljivega opisa vmesnika, ki se samodejno ujema z dejanskimi operacijami API. *(—)*

### Key Entities

- **API ključ**: pripada enemu uporabniku; ime, nerazberljiva oblika ključa, prepoznavni začetek, skupine (seznam ali »vse moje skupine«), pravica (branje / branje in pisanje), čas nastanka, rok veljavnosti, čas zadnje uporabe, stanje (aktiven / preklican; potekel izhaja iz roka).
- **Dnevni povzetek uporabe ključa**: ključ, dan, števila po izidu (uspešna branja, uspešna pisanja, napake klicatelja, zavrnitve zaradi omejitve); hrani se 90 dni.
- **Vnos revizijske sledi** (obstoječ, 005): dobi neobvezen podatek o ključu (ime), prek katerega je bila sprememba narejena.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Razvijalec integracije od odprtja strani *API* do prvega uspešnega branja kontaktov s svojim ključem potrebuje manj kot 10 minut.
- **SC-002**: Za vsako operacijo API je rezultat (podatki, vrstni red, koda napake) za istega uporabnika in iste vhodne podatke enak rezultatu enakovredne operacije v spletni aplikaciji.
- **SC-003**: Nobena zahteva API ne vrne ali spremeni podatkov skupine, za katero ključ ne velja ali katere uporabnik ni član (matrika izolacije brez izjem).
- **SC-004**: Preklican ali potekel ključ ne dobi nobenih podatkov – že pri prvi naslednji zahtevi.
- **SC-005**: Vrednost ključa se po prvem prikazu ne pojavi nikjer več: ne v vmesniku, ne v izvozu podatkov, ne v dnevnikih.
- **SC-007**: Statistika ključa se ujema s številom dejansko poslanih zahtev tega ključa (brez izgub in brez štetja drugih ključev) in je vidna najpozneje 1 minuto po zahtevi.
- **SC-006**: 100 % operacij API je opisanih na strani *API* in v strojno berljivem opisu.

## Assumptions

- **Velikost in tveganje**: nov tip klicatelja in nova poverilnica → *tvegana funkcionalnost* (konstitucija §2.1); varnostne odločitve potrdi razvijalec, `plan.md` se pred nalogami pokaže razvijalcu; zapis odločitve v `docs/decisions/` (nova poverilnica, §2.6).
- **Enake storitve**: operacije API so ločeni endpointi, ki uporabljajo iste storitve (poslovno logiko, preverjanje, revizijo) kot endpointi spletne aplikacije; razlikujeta se samo prijava in oblika vhoda v vmesnik. Zato API ne podvaja pravil 004, 008, 013, 016.
- **Obseg prve različice**: skupine (branje), kontakti (branje, iskanje, ustvarjanje, sprememba, izbris). Člani, povabila, revizijska sled, množične operacije, uvoz, izvoz v Excel/vCard, dvojniki in upravljanje skupin niso del API; dodajo se kasneje kot nove operacije iste različice.
- **Model ključa** sledi geslom za aplikacijo (014): vezan na uporabnika, viden enkrat, hranjen nerazberljivo, omejen na 10 aktivnih. Ključ ima prepoznavno predpono, da ga orodja za iskanje skrivnosti (gitleaks) prepoznajo.
- **Omejitev pogostosti** 120 zahtev na minuto na ključ je razumen privzetek za integracije; ugibanje ključa preprečuje njegova dolžina (naključnost), zato ni ločene omejitve neuspelih poskusov kot pri CardDAV.
- **Stran API** je javna, ker ne vsebuje podatkov uporabnikov; ustvarjanje ključa zahteva prijavo.
- **Odvisnosti**: 001 (prijava, *Moj račun*), 002–004 (skupine, kontakti), 005/015 (sled), 008 (iskanje), 012 (izbris računa, izvoz), 013/016 (normalizacija). Ni odvisnosti od 017 in 018.
- **Skupna pravila**: nove kode `API_KEY_LIMIT` (409) in `RATE_LIMITED` (429), novi tip klicatelja v §2.2, oznaka »prek API« v §2.7 in vrstica 019 v §1 se v istem PR prenesejo v `feature-map.md`.
