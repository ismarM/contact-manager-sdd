# Feature Specification: Tipizirani atributi, normalizacija in zemljevid naslovov

**Feature Branch**: `tipizirani-atributi` (no number; the directory is `docs/specs/016-tipizirani-atributi/`)

**Created**: 2026-11-16

**Input**: User description: "tipizirani atributi (email, phone, naslov, ...), normalizacija atributov (glede na tip in izbrano shemo/standard - shemo si uporabnik izbere v nastavitvah, spremeni le prikaz v brskalniku, strežnik uporablja le eno shemo), integracija zemljevida za naslove (vsi atributi tipa naslov naj imajo gumb, ki odpre vgrajen zemljevid, ki prikaže to lokacijo)"

## Clarifications

### Session 2026-11-16

- Q: Ali je tip lastnost ključa v skupini ali posameznega atributa? → A: Ključa v skupini: vsi atributi z istim ključem (brez razlike velikosti črk, 004) imajo isti tip; sprememba tipa ključa atomarno pretvori vse vrednosti tega ključa v skupini in ne uspe, če katera ni veljavna za nov tip.
- Q: Kateri storitvi zemljevida se sme posredovati besedilo naslova in kdaj? → A: Javni kartografski storitvi (OpenStreetMap), samo na izrecno zahtevo uporabnika (gumb zemljevida, samodokončanje naslova med vpisom), vedno prek našega strežnika; koordinate se ne shranjujejo.
- Q: Ali naslov ostane prosto besedilo ali postane strukturiran? → A: Strukturiran (ulica in hišna številka, dodatna vrstica, poštna številka, kraj, regija, država); obstoječi naslovi se ne pretvorijo samodejno.
- Dopolnitev razvijalca: samodokončanje naslovov med vpisom; tip *Drugo* za vse, kar ne sodi v podprt tip (privzet tip); tip *Opombe* – golo besedilo brez oblikovanja in normalizacije, sicer kot *Drugo*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tip ključa atributa v skupini (Priority: P1)

Urednik ob prvi uporabi novega ključa izbere njegov tip: *Drugo* (privzeto), *Opombe*, *E-naslov*, *Telefon*, *Naslov*, *Spletni naslov* ali *Datum*. Vsi atributi s tem ključem v skupini imajo odslej ta tip: vnosno polje, preverjanje in prikaz se mu prilagodijo. Predefinirana polja *E-naslov*, *Telefon* in *Naslov* imajo stalen tip istega imena.

**Why this priority**: brez tipa so vse vrednosti golo besedilo – dodatni telefoni in e-naslovi (`Službeni telefon`, `Zasebni e-naslov`) niso preverjeni, niso povezave in jih ni mogoče normalizirati; tip ključa je osnova za US2–US6 in zagotavlja, da je isti ključ v skupini vedno enak podatek (filtri, izvoz, uvoz).

**Independent Test**: urednik doda nov ključ `Službeni telefon` tipa *Telefon*; na drugem kontaktu izbere predlog tega ključa in tip je že nastavljen; neveljavna vrednost je zavrnjena ob polju; pogled pokaže povezavo za klic.

**Acceptance Scenarios**:

1. **[FR-016-01]** **Given** urednik v obrazcu kontakta vpiše ključ, ki ga skupina še nima, **When** odpre izbiro tipa, **Then** so na voljo *Drugo*, *Opombe*, *E-naslov*, *Telefon*, *Naslov*, *Spletni naslov* in *Datum*; privzet je *Drugo*.
2. **[FR-016-01]** **Given** v skupini obstaja ključ `Službeni telefon` tipa *Telefon*, **When** urednik pri drugem kontaktu izbere ta ključ (s predlogom ali vpisom v poljubni velikosti črk), **Then** je tip prikazan ob ključu in ga ni mogoče izbrati drugače; vnosno polje je polje za telefon.
3. **[FR-016-02]** **Given** atribut tipa *E-naslov*, *Telefon*, *Spletni naslov* ali *Datum*, **When** urednik vpiše vrednost, ki za ta tip ni veljavna (»janez@«, »01 234 abc«, »ni url«, »31. 2. 2026«), in shrani, **Then** je shranjevanje zavrnjeno z napako ob vrednosti tega atributa in kontakt ostane nespremenjen.
4. **[FR-016-03]** **Given** kontakt z atributi vseh tipov, **When** ga bralec odpre, **Then** je e-naslov povezava `mailto:`, telefon povezava `tel:`, spletni naslov povezava v novem zavihku z dostopnim imenom, ki to pove, datum in telefon zapisana po izbrani shemi (US4), naslov po shemi z gumbom *Pokaži na zemljevidu* (US5), *Opombe* kot večvrstično besedilo z ohranjenimi prelomi vrstic in *Drugo* kot besedilo, brez povezav.
5. **[FR-016-04]** **Given** skupina s kontakti, ustvarjenimi pred 016, **When** član odpre kontakt ali urednik spremeni drugo polje in shrani, **Then** so vsi obstoječi ključi tipa *Drugo*, vrednosti in verzije kontaktov se ne spremenijo, v sledi je samo dejanska sprememba.
6. **[FR-016-05]** **Given** v skupini ima ključ `Mobitel` tipa *Drugo* vrednosti pri 40 kontaktih, vse veljavne telefonske številke, **When** urednik v *Atributi skupine* spremeni tip ključa v *Telefon* in potrdi v dialogu, ki pove število prizadetih kontaktov, **Then** se vseh 40 vrednosti v eni atomarni operaciji normalizira (US2), ključ ima tip *Telefon* in nastane en vnos v sledi.
7. **[FR-016-05]** **Given** med 40 vrednostmi ključa `Mobitel` sta dve neveljavni (»ne kliči«, »041 12«), **When** urednik spremeni tip v *Telefon*, **Then** se nič ne spremeni, vmesnik pokaže oba kontakta z vrednostma in povezavama na kontakt, da ju urednik popravi ali odstrani, in ponudi ponovni poskus.
8. **[FR-016-06]** **Given** množično urejanje (009) nastavlja atribut, **When** urednik izbere obstoječ ključ, **Then** velja tip ključa; pri novem ključu izbere tip; preverjanje in normalizacija sta enaka kot v obrazcu, operacija ostane atomarna in nastane en vnos v sledi.
9. **[FR-016-07]** **Given** atribut tipa *Opombe* z vrednostjo »  Kliči po 16h.\n\n  Ne ob petkih.  «, **When** urednik shrani, **Then** je vrednost shranjena in prikazana točno tako, kot je vpisana (presledki in prazne vrstice ohranjeni), brez povezav in oblikovanja; atribut tipa *Drugo* se samo obreže kot pred 016.

---

### User Story 2 - Normalizacija vrednosti na strežniku (Priority: P1)

Strežnik vsako vrednost tipiziranega atributa ali predefiniranega polja shrani v eni kanonični obliki ne glede na to, kako jo je uporabnik vpisal: »041 123-456«, »+386 41 123 456« in »00386 41 123456« so isti telefon. Iskanje, filtri, dvojniki in izvozi zato delujejo zanesljivo.

**Why this priority**: zahteva »strežnik uporablja le eno shemo«; brez enotne oblike prikazna shema (US4) ni mogoča in isti podatek je zapisan na več načinov.

**Independent Test**: urednik vpiše isti telefon v treh oblikah pri treh kontaktih; vsi trije so shranjeni enako, iskanje po »041 123« najde vse tri, iskanje dvojnikov po telefonu jih združi v eno skupino.

**Acceptance Scenarios**:

1. **[FR-016-08]** **Given** kontakt brez države ali z državo `SI`, **When** urednik vpiše telefon »041 123-456«, »+386 41 123 456« ali »00386 41 123456« (v predefinirano polje ali atribut tipa *Telefon*), **Then** strežnik shrani `+38641123456`; pri kontaktu z državo `AT` se »0664 1234567« shrani kot `+436641234567`.
2. **[FR-016-08]** **Given** vrednost »Janez.Novak@Example.COM «, **When** je shranjena kot e-naslov, **Then** strežnik shrani `Janez.Novak@example.com` (obrezano, domena z malimi črkami); primerjava e-naslovov (iskanje, dvojniki) je brez razlike velikosti črk.
3. **[FR-016-08]** **Given** spletni naslov »Example.com/o-nas«, **When** je shranjen, **Then** strežnik shrani `https://example.com/o-nas`; naslov s shemo, ki ni `http` ali `https` (npr. `javascript:`), je zavrnjen.
4. **[FR-016-08]** **Given** datum, vpisan v izbirniku ali poslan prek API, **When** je shranjen, **Then** strežnik hrani koledarski datum v obliki `2026-11-16`; API sprejema in vrača samo to obliko.
5. **[FR-016-09]** **Given** kontakt z obstoječim telefonom »01/234 56 78« iz časa pred 016, **When** urednik spremeni samo priimek in shrani, **Then** telefon ostane dobesedno nespremenjen; normaliziran je šele, ko ga urednik spremeni.
6. **[FR-016-10]** **Given** iskanje (008), **When** član vpiše »041 123«, »041123« ali »+38641«, **Then** so med zadetki kontakti s telefonom `+38641123456` (v polju ali atributu tipa *Telefon*), ne glede na obliko vpisa.
7. **[FR-016-11]** **Given** dva kontakta s telefonom, ki je bil vpisan v različnih oblikah, **When** urednik išče dvojnike po kategoriji *Telefon* (011), **Then** sta v isti skupini dvojnikov; enako za e-naslova, ki se razlikujeta samo po velikosti črk.

---

### User Story 3 - Strukturiran naslov s samodokončanjem (Priority: P2)

Naslov – predefinirano polje *Naslov* in vsak atribut tipa *Naslov* – je sestavljen iz delov: ulica in hišna številka, dodatna vrstica, poštna številka, kraj, regija in država. Med vpisom ulice ali kraja polje predlaga ujemajoče naslove; izbira predloga izpolni vse dele. Obstoječi naslovi, vpisani kot prosto besedilo, ostanejo, dokler jih uporabnik ne razčleni.

**Why this priority**: strukturiran naslov omogoča prikaz po pravilih države, natančno lokacijo na zemljevidu in čisto preslikavo v vCard; samodokončanje skrajša vnos in zmanjša napake.

**Independent Test**: urednik v polje ulice vpiše »slovenska 1 lju«, izbere predlog »Slovenska cesta 1, 1000 Ljubljana, Slovenija«, vsi deli so izpolnjeni; pri kontaktu s starim naslovom izbere *Razčleni naslov* in potrdi predlagane dele.

**Acceptance Scenarios**:

1. **[FR-016-12]** **Given** urednik ureja naslov, **When** izpolni ulico »Slovenska cesta 1«, poštno številko »1000«, kraj »Ljubljana« in državo »Slovenija« (izbirni seznam 013) in shrani, **Then** je naslov shranjen po delih, država kot koda `SI`; naslov brez ulice in brez kraja je zavrnjen z napako ob polju.
2. **[FR-016-13]** **Given** polje ulice ali kraja, **When** urednik vpiše vsaj 3 znake, **Then** se v kombiniranem polju (design.md 8.4) prikaže do 5 predlogov naslovov iz kartografske storitve, najprej v državi kontakta; izbira predloga s tipkovnico ali dotikom izpolni vse dele, ki jih urednik lahko še spremeni.
3. **[FR-016-13]** **Given** storitev predlogov ni dosegljiva, je počasna ali nima zadetkov, **When** urednik vpisuje naslov, **Then** deli naslova delujejo kot navadna besedilna polja, obrazec se shrani in napaka zaradi predlogov ni prikazana (kot 013 FR-013-17).
4. **[FR-016-14]** **Given** kontakt s predefiniranim naslovom »Slovenska cesta 1\n1000 Ljubljana« iz časa pred 016, **When** ga član odpre, **Then** je naslov prikazan kot prej (nerazčlenjen), z gumbom za zemljevid; **When** ga urednik ureja in izbere *Razčleni naslov*, **Then** vmesnik predlaga dele (ulica, poštna številka, kraj), ki jih urednik potrdi ali popravi; dokler ne shrani, se na strežniku nič ne spremeni; brez razčlenitve se kontakt shrani z nespremenjenim naslovom.
5. **[FR-016-15]** **Given** kontakt z državo `AT`, **When** urednik doda nov naslov, **Then** je država naslova predizpolnjena z `AT`; poštna številka se shrani obrezana in z velikimi črkami.

---

### User Story 4 - Izbira prikazne sheme v nastavitvah (Priority: P2)

Uporabnik v *Mojem računu* izbere, kako želi videti telefone, datume in naslove. Izbira spremeni samo prikaz v njegovem vmesniku; shranjeni podatki, izvozi in drugi uporabniki ostanejo nespremenjeni.

**Why this priority**: zahteva uporabnika; vrednost je v berljivosti, a funkcionalnost deluje tudi s privzeto shemo.

**Independent Test**: uporabnik zamenja shemo telefona v *Nacionalno*; pogled kontakta, seznam in sled prikazujejo »041 123 456«; drug uporabnik v isti skupini še vedno vidi »+386 41 123 456«, izvoz vsebuje `+38641123456`.

**Acceptance Scenarios**:

1. **[FR-016-16]** **Given** *Moj račun*, razdelek *Oblika zapisa*, **When** uporabnik izbere shemo za telefon (*Mednarodno* – privzeto, *Nacionalno*, *E.164*), datum (*Po jeziku vmesnika* – privzeto, *ISO 8601*, *Dolga oblika*) in naslov (*Po pravilih države* – privzeto, *Enovrstično*), **Then** se prikaz takoj spremeni povsod, kjer so te vrednosti prikazane (seznam, pogled kontakta, primerjava dvojnikov, revizijska sled, zgodovina kontakta, zemljevid), brez ponovnega nalaganja.
2. **[FR-016-16]** **Given** shema telefona *Nacionalno*, **When** uporabnik vidi telefon `+436641234567` (avstrijska številka), **Then** je prikazan v nacionalni obliki države številke (»0664 1234567«); vrednost, ki je ni mogoče oblikovati, je prikazana v kanonični obliki.
3. **[FR-016-16]** **Given** shema naslova *Po pravilih države*, **When** uporabnik vidi slovenski in ameriški naslov, **Then** je vsak prikazan v vrstnem redu delov, ki velja v državi naslova (»1000 Ljubljana« oz. »Springfield, IL 62701«).
4. **[FR-016-17]** **Given** izbrana shema, **When** se uporabnik prijavi na drugi napravi ali po odjavi, **Then** velja ista izbira, enako kot jezik in tema (001).
5. **[FR-016-18]** **Given** uporabnik s shemo *Nacionalno*, **When** izvozi kontakte v Excel ali vCard ali jih bere prek CardDAV (010, 014), **Then** izvoz vsebuje kanonične vrednosti ne glede na shemo; drugi člani skupine vidijo vrednosti po svoji shemi.
6. **[FR-016-19]** **Given** obrazec za urejanje, **When** urednik vpiše vrednost v kateri koli prepoznani obliki, **Then** je vnos sprejet in po zapustitvi polja prikazan v njegovi shemi; shema ne omejuje oblike vnosa.

---

### User Story 5 - Zemljevid za naslove (Priority: P2)

Vsak naslov – predefinirano polje *Naslov* in vsak atribut tipa *Naslov*, razčlenjen ali ne – ima v pogledu kontakta gumb *Pokaži na zemljevidu*, ki odpre vgrajen zemljevid z označeno lokacijo, brez zapuščanja aplikacije.

**Why this priority**: zahteva uporabnika; pogost primer (pot do stranke), a ni pogoj za tipe in normalizacijo.

**Independent Test**: bralec odpre kontakt z naslovom »Slovenska cesta 1, 1000 Ljubljana«, izbere *Pokaži na zemljevidu*, vidi zemljevid z oznako na tej lokaciji in ga zapre s tipko *Esc*; fokus se vrne na gumb.

**Acceptance Scenarios**:

1. **[FR-016-20]** **Given** kontakt s predefiniranim naslovom in atributom `Dostava` tipa *Naslov*, **When** ga član (tudi bralec, tudi v arhivirani skupini) odpre, **Then** ima vsak naslov svoj gumb *Pokaži na zemljevidu* z dostopnim imenom, ki vsebuje ime naslova (»Pokaži na zemljevidu: Dostava«); atributi drugih tipov gumba nimajo.
2. **[FR-016-21]** **Given** gumb *Pokaži na zemljevidu*, **When** ga član izbere, **Then** se odpre dialog (design.md 8.11) z vgrajenim zemljevidom, oznako na lokaciji naslova, besedilom naslova v izbrani shemi in povezavo za odprtje lokacije v zunanji aplikaciji zemljevidov; zemljevid je mogoče premikati in povečevati s tipkovnico; *Esc* dialog zapre in fokus se vrne na gumb.
3. **[FR-016-22]** **Given** naslov, ki ga ni mogoče najti (»Neznana ulica 999, Nikjer«), ali samo kraj (»Maribor«), **When** član odpre zemljevid, **Then** dialog pove »Naslova ni bilo mogoče najti na zemljevidu.« oziroma pokaže najverjetnejšo lokacijo z opozorilom, da je približna, in ponudi povezavo za iskanje v zunanji aplikaciji; ni tehnične napake.
4. **[FR-016-22]** **Given** kartografska storitev ni dosegljiva ali ni povezave, **When** član odpre zemljevid, **Then** dialog pokaže trajno sporočilo z gumbom *Poskusi znova* (design.md 8.13), podatki kontakta ostanejo dostopni.
5. **[FR-016-23]** **Given** član odpre zemljevid ali vpisuje naslov s samodokončanjem, **When** sistem poišče lokacijo ali predloge, **Then** gre zahteva samo prek našega strežnika (brskalnik ne kliče tuje storitve, tudi ne za slikovne podlage zemljevida), kartografska storitev prejme samo besedilo naslova – nobenega drugega podatka kontakta ali uporabnika – in koordinate se ne shranijo.
6. **[FR-016-27]** **Given** uporabnik tipkovnice ali bralnika zaslona pri 360, 768 in 1280 px, **When** izbere tip ključa, vpiše naslov s samodokončanjem, spremeni shemo v *Obliki zapisa* in odpre ter zapre dialog zemljevida, **Then** je vse mogoče brez miške, besedila so v sl/en in na zaslonih ni kršitev WCAG 2.1 A in AA.

---

### User Story 6 - Tipi v uvozu, izvozu, sledi in drugih funkcionalnostih (Priority: P2)

Tip, struktura naslova in normalizacija veljajo povsod, kjer nastajajo ali se berejo atributi: uvoz, izvoz, CardDAV, združevanje dvojnikov, revizijska sled, rollback in obnova kontakta.

**Why this priority**: konstitucija V (celovitost podatkov); brez tega bi uvoz obšel preverjanje, sled pa ne bi pokazala spremembe tipa.

**Independent Test**: uvoz Excela s stolpcem telefonov v različnih oblikah; predogled pokaže normalizirane vrednosti in vrstice z neveljavnimi; po uvozu sled pokaže spremembe; rollback vrne tip ključa in vrednosti.

**Acceptance Scenarios**:

1. **[FR-016-24]** **Given** uvoz (014) s stolpcem, preslikanim v nov dodatni atribut, **When** urednik v preslikavi izbere tip ključa, **Then** predogled pokaže normalizirane vrednosti, vrstice z vrednostmi, neveljavnimi za tip, pa označi kot napake po pravilih 014; pri obstoječem ključu velja njegov tip. Stolpci, preslikani v dele naslova, sestavijo strukturiran naslov; en stolpec, preslikan v celoten naslov, se uvozi kot nerazčlenjen naslov. vCard `TEL`, `EMAIL`, `ADR` (po delih), `URL`, `BDAY` in `NOTE` se preslikajo v ustrezne tipe.
2. **[FR-016-25]** **Given** izvoz v Excel ali vCard in CardDAV, **When** se ustvari, **Then** vsebuje kanonične vrednosti; naslov je v Excelu en stolpec v obliki po pravilih države, v vCard lastnost `ADR` po delih; dodatni atributi tipov *E-naslov*, *Telefon*, *Naslov*, *Spletni naslov*, *Datum* in *Opombe* so zapisani kot ustrezne lastnosti z oznako ključa, *Drugo* kot doslej.
3. **[FR-016-26]** **Given** urednik spremeni tip ključa ali vrednost tipiziranega atributa, **When** član odpre vnos v sledi ali zgodovino kontakta (005, 015), **Then** vidi spremembo tipa (»Drugo → Telefon«) in vrednosti, prikazane po svoji shemi; rollback skupine na točko pred spremembo tipa ključa vrne prejšnji tip in vrednosti dobesedno.
4. **[FR-016-26]** **Given** obnova enega kontakta (015) na različico, katere vrednost ni veljavna za trenutni tip ključa, **When** urednik potrdi obnovo, **Then** je obnova zavrnjena z napako ob atributu (015 FR-015-12) in nič se ne spremeni.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-016-01, FR-016-06 | unauthenticated (no/invalid/expired token) | ustvarjanje, urejanje ali množično urejanje kontakta s tipiziranimi atributi | 401, nič se ne spremeni |
| FR-016-01, FR-016-06 | authenticated non-member | ustvarjanje, urejanje ali množično urejanje | 404, obstoj skupine ni razkrit |
| FR-016-01, FR-016-06 | member with role VIEWER | ustvarjanje, urejanje ali množično urejanje | 403, nič se ne spremeni |
| FR-016-01, FR-016-06 | member of an archived group | ustvarjanje, urejanje ali množično urejanje | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-016-01 | EDITOR+ | zastarela verzija kontakta | 409 VERSION_CONFLICT, nič se ne spremeni |
| FR-016-02, FR-016-12 | EDITOR+ | vrednost, neveljavna za tip (e-naslov, telefon, spletni naslov, datum, naslov brez ulice in kraja), neznan tip ali tip, ki se razlikuje od tipa obstoječega ključa | 400 VALIDATION_FAILED s kodo INVALID_VALUE ob atributu, nič se ne spremeni |
| FR-016-05 | unauthenticated | branje seznama ključev s tipi ali sprememba tipa ključa | 401, nič se ne spremeni |
| FR-016-05 | authenticated non-member | branje ali sprememba tipa ključa | 404, obstoj skupine ni razkrit |
| FR-016-05 | member with role VIEWER | sprememba tipa ključa | 403, nič se ne spremeni |
| FR-016-05 | VIEWER | branje seznama ključev s tipi | 200 |
| FR-016-05 | EDITOR+ of an archived group | sprememba tipa ključa | 409 GROUP_ARCHIVED, nič se ne spremeni |
| FR-016-05 | EDITOR+ | sprememba tipa, pri kateri je vsaj ena vrednost ključa neveljavna za nov tip | 409 ATTRIBUTE_TYPE_CONFLICT s seznamom prizadetih kontaktov, nič se ne spremeni |
| FR-016-05 | EDITOR+ | sprememba tipa, medtem ko se je tip ključa že spremenil | 409 VERSION_CONFLICT, nič se ne spremeni |
| FR-016-21, FR-016-23 | unauthenticated | zahteva lokacije naslova ali predlogov naslova | 401, besedilo naslova ni posredovano nikamor |
| FR-016-21 | authenticated non-member | zahteva lokacije naslova kontakta skupine | 404, obstoj ni razkrit, naslov ni posredovan |
| FR-016-21 | VIEWER, tudi v arhivirani skupini | zahteva lokacije naslova | 200 – samo branje |
| FR-016-21 | member of group A | zahteva lokacije za kontakt ali atribut skupine B | 404, naslov ni posredovan |
| FR-016-16, FR-016-17 | unauthenticated | branje ali sprememba prikazne sheme | 401, nič se ne spremeni |

### Edge Cases

- Telefon brez mednarodne predpone pri kontaktu brez države: obravnava se kot slovenska številka; številka, ki ni veljavna niti kot slovenska niti z mednarodno predpono, je zavrnjena.
- Telefon s pripono (»+386 1 234 56 78 int. 12«): pripona se ohrani v kanonični obliki in prikaže v vseh shemah.
- Kratke in posebne številke (112, 1970): veljavne, če jih standard številčenja pozna; prikazane brez preoblikovanja.
- Sprememba države kontakta ne spremeni že shranjenih telefonov (že so v mednarodni obliki) in ne držav obstoječih naslovov.
- Spletni naslov z mednarodno domeno ali potjo s šumniki (»šola.si/učitelji«) je sprejet in prikazan berljivo.
- Datum pred letom 1900 ali po 2100 je veljaven (zgodovinski kontakti); datum brez leta (rojstni dan »16. 11.«) ni podprt v 016 – vnese se kot *Drugo*.
- Sprememba tipa ključa v *Drugo* ali *Opombe* uspe vedno; vrednosti ostanejo v dosedanji (kanonični) obliki. Sprememba tipa ključa *Naslov* v drug tip: razčlenjen naslov se pretvori v besedilo v obliki po pravilih države.
- Sprememba tipa ključa *Drugo* v *Naslov*: vrednosti postanejo nerazčlenjeni naslovi (kot stari naslovi, US3 sc. 4); razčleni jih uporabnik.
- Ključ, ki obstaja v skupini v več zapisih velikosti črk (013, `Mobitel` in `mobitel`), ima en tip.
- Ključ, ki ga noben kontakt več ne uporablja, ni na seznamu ključev; ob ponovni uporabi se tip izbere znova.
- Dva sočasna zapisa, ki istočasno ustvarita nov ključ z različnima tipoma: uspe prvi, drugi je zavrnjen z napako ob atributu (tip se razlikuje od obstoječega ključa), urednik ga ponovi s pravim tipom.
- Sprememba tipa ključa in sočasno urejanje kontakta s tem ključem: uspe ena; druga je zavrnjena z `409 VERSION_CONFLICT`.
- Rollback (005) na točko pred 016: ključi dobijo tip *Drugo*, vrednosti in nerazčlenjeni naslovi se obnovijo dobesedno, brez normalizacije in brez preverjanja tipa.
- Samodokončanje naslova: veljajo samo odgovori na zadnji vpis; zastarel odgovor ne prepiše predlogov; pogostost zahtev je omejena (zakasnitev med tipkanjem, omejitev na uporabnika), ob omejitvi predlogi izostanejo brez napake.
- Več zaporednih odprtij zemljevida za isti naslov v isti seji ne povzroči ponovnih poizvedb pri kartografski storitvi.
- *Razčleni naslov* za naslov, ki ga predlagani deli ne pokrijejo v celoti: neprepoznani del ostane v dodatni vrstici, uporabnik ga premakne ali odstrani.
- Uporabnik, ki ni izbral sheme, ali shranjena neznana vrednost sheme: velja privzeta, brez napake.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-016-01**: Sistem MORA vsakemu ključu dodatnih atributov v skupini dodeliti natanko en tip iz nabora *Drugo*, *Opombe*, *E-naslov*, *Telefon*, *Naslov*, *Spletni naslov*, *Datum*; identiteta ključa je brez razlike velikosti črk (004). Tip izbere urednik ob prvi uporabi ključa v skupini (privzeto *Drugo*); vsi atributi z istim ključem imajo ta tip, ki je v obrazcu prikazan ob ključu in ga tam ni mogoče spremeniti. Predlogi ključev (013 FR-013-09) prikažejo tip ob ključu. API vrača tip pri vsakem atributu in seznam ključev skupine s tipi. Predefinirana polja *E-naslov*, *Telefon* in *Naslov* imajo stalen tip istega imena. *(najnižja vloga: EDITOR; ogled VIEWER)*
- **FR-016-02**: Sistem MORA vrednost na strežniku preveriti po pravilih tipa: *Drugo* 1–500 znakov po obrezu (kot 004); *Opombe* 1–500 znakov, ne prazna; *E-naslov* veljavna oblika do 254 znakov; *Telefon* veljavna številka po mednarodnem standardu številčenja; *Spletni naslov* absoluten naslov s shemo `http` ali `https`, do 500 znakov; *Datum* veljaven koledarski datum; *Naslov* po FR-016-12. Neveljavna vrednost, neznan tip ali tip, ki se razlikuje od tipa obstoječega ključa, se zavrne z `400 VALIDATION_FAILED` in kodo `INVALID_VALUE` ob atributu; nič se ne shrani. Ostala pravila atributov (edinstvenost ključa, rezervirana imena, kanonični zapis ključa, največ 50 atributov) ostanejo po 004 in 013. *(najnižja vloga: EDITOR)*
- **FR-016-03**: Sistem MORA vrednosti prikazati glede na tip: *E-naslov* kot povezavo `mailto:`, *Telefon* kot povezavo `tel:`, *Spletni naslov* kot povezavo, ki se odpre v novem zavihku (dostopno ime to pove), *Datum*, *Telefon* in *Naslov* po izbrani shemi (FR-016-16), *Naslov* z gumbom za zemljevid (FR-016-20), *Opombe* kot golo večvrstično besedilo z ohranjenimi presledki in prelomi, *Drugo* kot besedilo; obrazec za vsak tip ponudi ustrezno vnosno polje (tipkovnica za e-pošto, telefon in URL na mobilnih napravah, izbirnik datuma, večvrstično polje za *Opombe*, polja delov za *Naslov*). *(najnižja vloga: VIEWER)*
- **FR-016-04**: Sistem NE SME samodejno spreminjati obstoječih podatkov: vsi ključi iz časa pred 016 dobijo tip *Drugo*, obstoječi predefinirani naslovi postanejo nerazčlenjeni naslovi z dobesedno ohranjenim besedilom, vrednosti in verzije kontaktov ostanejo nespremenjene; posnetki revizijske sledi iz časa pred 016 se berejo kot atributi tipa *Drugo* in nerazčlenjeni naslovi. *(najnižja vloga: —)*
- **FR-016-05**: Sistem MORA v skupini ponuditi pregled *Atributi skupine* (seznam ključev s tipom in številom kontaktov) in uredniku omogočiti spremembo tipa ključa po potrditvi v dialogu (design.md 8.11), ki pove število prizadetih kontaktov. Sprememba je atomarna nad vsemi atributi tega ključa v skupini: vse vrednosti se preverijo in normalizirajo po novem tipu (FR-016-08); če je katera neveljavna, se nič ne spremeni in zahteva se zavrne z `409 ATTRIBUTE_TYPE_CONFLICT` (nova koda v feature-map §2.10) s seznamom prizadetih kontaktov, ki jih vmesnik pokaže s povezavami. Uspešna sprememba poveča verzije prizadetih kontaktov in ustvari en vnos v sledi; sočasna sprememba tipa ali urejanje prizadetega kontakta povzroči `409 VERSION_CONFLICT`. *(najnižja vloga: EDITOR; ogled VIEWER)*
- **FR-016-06**: Sistem MORA v množičnem urejanju (009) pri nastavljanju atributa uporabiti tip obstoječega ključa oziroma omogočiti izbiro tipa novega ključa ter uporabiti enako preverjanje in normalizacijo kot obrazec; ena neveljavna vrednost zavrne celotno operacijo (atomarnost). *(najnižja vloga: EDITOR)*
- **FR-016-07**: Sistem MORA vrednost tipa *Opombe* shraniti in vrniti točno tako, kot je vpisana (brez obreza, normalizacije ali oblikovanja), in jo prikazati kot golo besedilo brez samodejnih povezav. *(najnižja vloga: EDITOR)*
- **FR-016-08**: Sistem MORA vsako novo ali spremenjeno vrednost tipa *E-naslov*, *Telefon*, *Spletni naslov*, *Datum* in *Naslov* (dodatni atribut ali predefinirano polje) na strežniku shraniti v eni kanonični obliki: telefon v obliki E.164 (`+38641123456`, s pripono, kjer obstaja), številka brez mednarodne predpone se razlaga po državi kontakta (013), brez države kot slovenska; e-naslov obrezan, z domeno v malih črkah; spletni naslov s shemo (privzeto `https://`), shemo in domeno v malih črkah; datum v obliki ISO 8601 (`LLLL-MM-DD`); naslov po FR-016-15. Normalizacija je enaka za obrazec, množično urejanje, spremembo tipa ključa, uvoz, združevanje in API. *(najnižja vloga: EDITOR)*
- **FR-016-09**: Sistem MORA vrednost, ki je uporabnik ne spremeni, ohraniti dobesedno (tudi nenormalizirano vrednost ali nerazčlenjen naslov iz časa pred 016); normalizira se samo nova ali spremenjena vrednost in vrednosti ključa ob spremembi tipa (FR-016-05). Druge samodejne ali množične normalizacije obstoječih podatkov ni. *(najnižja vloga: EDITOR)*
- **FR-016-10**: Sistem MORA v iskanju po besedilu (008) telefone primerjati po števkah ne glede na presledke, ločila in obliko predpone (»041 123«, »041123«, »+38641« najdejo `+38641123456`), e-naslove brez razlike velikosti črk, naslove pa po vseh delih (ulica, poštna številka, kraj, regija, ime države v sl/en); velja za predefinirana polja in atribute ustreznih tipov. *(najnižja vloga: VIEWER)*
- **FR-016-11**: Sistem MORA v iskanju dvojnikov (011) v kategorijah *E-naslov* in *Telefon* primerjati normalizirane vrednosti (stare, nenormalizirane vrednosti se normalizirajo samo za primerjavo, brez spremembe podatkov). *(najnižja vloga: EDITOR)*
- **FR-016-12**: Sistem MORA naslov (predefinirano polje *Naslov* in atribut tipa *Naslov*) hraniti po delih: ulica in hišna številka (do 200 znakov), dodatna vrstica (do 200), poštna številka (do 20), kraj (do 100), regija (do 100), država (koda ISO 3166-1 alpha-2 po 013 FR-013-13); obvezna je vsaj ulica ali kraj, ostali deli so neobvezni. Nerazčlenjen naslov iz časa pred 016 (do 300 znakov besedila) ostane veljaven in se ob shranjevanju kontakta ne spremeni; nov nerazčlenjen naslov prek obrazca ni mogoč, prek uvoza po FR-016-24. *(najnižja vloga: EDITOR)*
- **FR-016-13**: Sistem MORA ob poljih ulice in kraja ponuditi samodokončanje naslova kot kombinirano polje po design.md 8.4: po vsaj 3 vpisanih znakih do 5 predlogov kartografske storitve, prednostno v državi naslova oziroma kontakta, v jeziku vmesnika; izbira predloga izpolni vse dele, ki ostanejo urejljivi. Napaka, počasen odgovor, omejitev pogostosti ali odsotnost predlogov nikoli ne ovira vnosa in ne prikaže napake; zastareli odgovori ne prepišejo novejših; tipkovnica in bralnik zaslona kot 013 FR-013-18. Predlogi so na voljo samo prijavljenemu uporabniku. *(najnižja vloga: EDITOR)*
- **FR-016-14**: Sistem MORA urejevalcu ob nerazčlenjenem naslovu ponuditi *Razčleni naslov*: vmesnik predlaga dele (prek samodokončanja ali preproste razčlenitve besedila), uporabnik jih potrdi ali popravi; neprepoznani del ostane v dodatni vrstici. Razčlenitev je samo sprememba obrazca, dokler uporabnik ne shrani, nato navadno urejanje z vnosom v sledi. Množične ali samodejne razčlenitve ni. *(najnižja vloga: EDITOR)*
- **FR-016-15**: Sistem MORA dele naslova normalizirati: obrez in strnitev presledkov v vsakem delu, poštna številka z velikimi črkami, država kot koda; pri novem naslovu je država predizpolnjena z državo kontakta. *(najnižja vloga: EDITOR)*
- **FR-016-16**: Sistem MORA uporabniku v *Mojem računu* (razdelek *Oblika zapisa*) omogočiti izbiro prikazne sheme za telefon (*Mednarodno* »+386 41 123 456« – privzeto; *Nacionalno* »041 123 456« v obliki države številke; *E.164* »+38641123456«), datum (*Po jeziku vmesnika* – privzeto; *ISO 8601* »2026-11-16«; *Dolga oblika* »16. november 2026«) in naslov (*Po pravilih države* – vrstni red delov, kot velja v državi naslova, privzeto; *Enovrstično*). Shema velja samo za prikaz v vmesniku tega uporabnika, povsod, kjer so vrednosti prikazane (seznam, pogled, primerjava dvojnikov, revizijska sled, zgodovina, zemljevid), takoj po izbiri; vrednost, ki je v shemi ni mogoče prikazati, je prikazana kanonično; nerazčlenjen naslov je prikazan dobesedno. *(najnižja vloga: —, prijavljen uporabnik)*
- **FR-016-17**: Sistem MORA prikazno shemo shraniti kot nastavitev uporabnika enako kot jezik in temo (001: v profil in na napravo, velja na vseh napravah); vključena je v izvoz mojih podatkov (012) in se izbriše z računom. *(najnižja vloga: —, prijavljen uporabnik)*
- **FR-016-18**: Sistem NE SME uporabiti prikazne sheme pri shranjevanju, izvozu (010, 014 vCard), CardDAV ali v odgovorih API: strežnik vedno uporablja kanonično obliko (FR-016-08). *(najnižja vloga: —)*
- **FR-016-19**: Sistem MORA v obrazcu sprejeti vnos v kateri koli obliki, ki jo normalizacija prepozna (ne samo v izbrani shemi), in po zapustitvi polja prikazati vrednost v shemi uporabnika ali napako ob polju (004 FR-004-03). *(najnižja vloga: EDITOR)*
- **FR-016-20**: Sistem MORA ob vsakem nepraznem naslovu (predefinirano polje *Naslov* in vsak atribut tipa *Naslov*, razčlenjen ali ne) v pogledu kontakta izrisati gumb *Pokaži na zemljevidu* z dostopnim imenom, ki vsebuje ime naslova; gumb je na voljo vsem članom, tudi v arhivirani skupini. *(najnižja vloga: VIEWER)*
- **FR-016-21**: Sistem MORA ob izbiri gumba odpreti dialog z vgrajenim zemljevidom, oznako na lokaciji naslova, besedilom naslova v shemi uporabnika in povezavo za odprtje v zunanji aplikaciji zemljevidov; zemljevid je upravljiv s tipkovnico (premik, povečava), dialog izpolnjuje design.md 8.11 (fokus, *Esc*, vrnitev fokusa), odziven od 320 px in brez kršitev WCAG 2.1 A in AA; lokacija je opisana tudi z besedilom, ne samo z grafiko. Zahteva lokacije naslova kontakta je omejena na skupino iz poti po vrstnem redu preverjanj feature-map §2.2; kontakt ali atribut druge skupine je enako kot neobstoječ (`404`); branje je dovoljeno tudi v arhivirani skupini. *(najnižja vloga: VIEWER)*
- **FR-016-22**: Sistem MORA nenajden naslov, približen zadetek in nedosegljivo kartografsko storitev prikazati kot razumljivo sporočilo v dialogu (v sl/en, brez tehničnih kod; pri nedosegljivosti z gumbom *Poskusi znova*); neuspeh zemljevida nikoli ne ovira dela s kontaktom. *(najnižja vloga: VIEWER)*
- **FR-016-23**: Sistem MORA iskanje lokacije, predlogov naslova in slikovne podlage zemljevida pridobivati od javne kartografske storitve (OpenStreetMap) samo prek lastnega strežnika: brskalnik ne kliče tuje storitve; besedilo naslova se posreduje samo na izrecno zahtevo uporabnika (gumb zemljevida, vpis v polje naslova s samodokončanjem, *Razčleni naslov*); storitev ne prejme nobenega drugega podatka kontakta ali identitete uporabnika; koordinate in odgovori se ne shranjujejo trajno (dovoljen je kratkotrajen predpomnilnik za ponovljene zahteve); pogostost zahtev je omejena v okviru pogojev uporabe storitve. *(najnižja vloga: VIEWER; samodokončanje EDITOR)*
- **FR-016-24**: Sistem MORA v uvozu (014) uporabiti tip obstoječega ključa oziroma omogočiti izbiro tipa novega ključa v preslikavi stolpca, vrednosti v predogledu normalizirati po FR-016-08 in vrednosti, neveljavne za tip, prikazati kot napake vrstic po pravilih 014; stolpci, preslikani v dele naslova, sestavijo strukturiran naslov, en stolpec, preslikan v celoten naslov, ustvari nerazčlenjen naslov; lastnosti vCard `TEL`, `EMAIL`, `ADR` (po delih), `URL`, `BDAY` in `NOTE`, ki ne gredo v predefinirano polje, se uvozijo kot atributi ustreznega tipa. *(najnižja vloga: EDITOR)*
- **FR-016-25**: Sistem MORA v izvozih (Excel 010, vCard in CardDAV 014) zapisati kanonične vrednosti: naslov v Excelu kot en stolpec v obliki po pravilih države, v vCard kot `ADR` po delih (nerazčlenjen naslov v delu ulice); dodatni atributi tipov *E-naslov*, *Telefon*, *Naslov*, *Spletni naslov*, *Datum* in *Opombe* se v vCard zapišejo kot ustrezne lastnosti z oznako ključa, *Drugo* kot doslej. *(najnižja vloga: VIEWER)*
- **FR-016-26**: Sistem MORA tip ključa in dele naslova vključiti v revizijsko sled (005), zgodovino in primerjavo različic (015) ter združevanje dvojnikov (011): sprememba tipa ključa je en vnos sledi z vsemi prizadetimi kontakti (»Drugo → Telefon«), vrednosti so prikazane po shemi uporabnika; rollback (005) obnovi tip ključa in vrednosti dobesedno, brez normalizacije; obnova enega kontakta (015) zapiše vrednosti, ki morajo biti veljavne za trenutni tip ključa (sicer `400 VALIDATION_FAILED` po FR-015-12). *(najnižja vloga: VIEWER za ogled; po 005, 011, 015 za pisanje)*
- **FR-016-27**: Sistem MORA vse nove elemente vmesnika (izbira tipa, polja po tipih, deli naslova s samodokončanjem, *Atributi skupine*, razdelek *Oblika zapisa*, gumb in dialog zemljevida) izdelati po design.md, v sl/en, odzivno pri 360, 768 in 1280 px, brez kršitev WCAG 2.1 A in AA in s polno dostopnostjo s tipkovnico. *(najnižja vloga: VIEWER)*

### Key Entities *(include if feature involves data)*

- **Ključ atributa skupine (nov)**: normaliziran ključ (brez razlike velikosti črk) s tipom in verzijo; obstaja, dokler ga uporablja vsaj en kontakt skupine; ni nadomestilo kanoničnega zapisa ključa iz 013.
- **Dodatni atribut (razširitev 004)**: ključ in vrednost; tip izhaja iz ključa skupine; vrednost tipa *Naslov* je naslov po delih ali nerazčlenjen.
- **Naslov (razširitev 004)**: deli ulica in hišna številka, dodatna vrstica, poštna številka, kraj, regija, država (koda ISO) – ali nerazčlenjeno besedilo iz časa pred 016 oziroma iz uvoza.
- **Kanonična oblika vrednosti**: edina oblika, ki jo hrani in vrača strežnik, določena s tipom (FR-016-08).
- **Prikazna shema**: nastavitev uporabnika (telefon, datum, naslov), ki določa samo prikaz v vmesniku; shranjena kot jezik in tema.
- **Lokacija naslova**: izid iskanja naslova (koordinate, natančnost: natančna, približna, ni najdena); se ne shranjuje.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: V 100 % preizkusov je isti telefon, vpisan v vsaj petih različnih oblikah (s presledki, ločili, `00` ali `+` predpono, nacionalno), shranjen v isti kanonični obliki; enako za e-naslove, ki se razlikujejo samo po velikosti črk domene.
- **SC-002**: Iskanje po delu telefonske številke v kateri koli obliki najde 100 % kontaktov s to številko (polje ali atribut tipa *Telefon*) pri skupini z 10.000 kontakti v manj kot 1 sekundi v 95 % iskanj.
- **SC-003**: Sprememba prikazne sheme se odrazi na vseh zaslonih z vrednostmi brez ponovnega nalaganja; v 100 % preizkusov izvozi in odgovori API vsebujejo kanonične vrednosti ne glede na shemo.
- **SC-004**: Sprememba tipa ključa s 1.000 vrednostmi uspe v celoti ali se nič ne spremeni v 100 % preizkusov (tudi ob eni neveljavni vrednosti ali sočasnem urejanju).
- **SC-005**: Urednik vnese poln naslov s samodokončanjem v manj kot 15 sekundah samo s tipkovnico; član odpre lokacijo naslova z enim klikom in zemljevid z oznako se prikaže v manj kot 3 sekundah v 95 % odpiranj pri delujoči storitvi.
- **SC-006**: V 100 % preizkusov brskalnik med uporabo zemljevida in samodokončanja ne pošlje nobene zahteve tuji storitvi, kartografska storitev pa ne prejme drugega kot besedilo naslova.
- **SC-007**: 100 % obstoječih kontaktov, atributov in naslovov se po uvedbi odpre in shrani brez spremembe vrednosti ali verzije; obstoječi testi 004–015 prehajajo brez oslabitve asercij (spremenjeni testi so našteti v opisu PR).
- **SC-008**: 100 % primerov matrike izolacije za nove in spremenjene končne točke vrne pričakovan odgovor; novi zasloni in dialogi nimajo kršitev WCAG 2.1 A in AA pri 360, 768 in 1280 px.

## Assumptions

- Odvisnost od **004-kontakti** (atributi, pravila polj), **013-pametni-atributi** (država, seznam držav, predlogi ključev, kanonični zapis ključev), **001-prijava** (nastavitve uporabnika), **005/015** (sled, rollback, obnova), **008**, **009**, **010**, **011**, **012** in **014**.
- Nabor tipov je zaprt (sedem tipov); *Število*, *Izbira s seznama*, datum brez leta in uporabniško določeni tipi niso del 016. *Drugo* je dosedanje vedenje atributov (004); *Opombe* se od njega razlikuje le po tem, da vrednost ohrani dobesedno in je večvrstična.
- Predefinirana polja ohranijo dosedanje omejitve dolžine (feature-map §2.6), razen naslova, ki postane strukturiran (FR-016-12); telefon v predefiniranem polju se od 016 preverja po standardu številčenja namesto samo po dovoljenih znakih. Obe spremembi se zapišeta v feature-map §2.6 v istem PR, nova koda `ATTRIBUTE_TYPE_CONFLICT` v §2.10.
- Privzeta država za telefone brez mednarodne predpone je država kontakta, sicer Slovenija; nastavitev privzete države po skupini ni del 016.
- Prikazna shema je osebna nastavitev kot jezik in tema; konstitucija VI (hranjeni podatki) se v istem PR dopolni z »obliko zapisa«.
- Kartografska storitev je zunanja storitev po konstituciji §2.1 (tvegana funkcionalnost): `plan.md` se pred nalogami pokaže razvijalcu; izjema od konstitucije VI (brez klicev na tuje storitve iz brskalnika ostane, strežnik pa kliče OpenStreetMap) se zapiše kot odločitev v `docs/architecture-decisions.md` in v konstitucijo v istem PR. V testih se storitev nadomesti (MSW v FE, nadomestni strežnik v zaledju), brez pravih klicev.
- Filtri po razponu datumov, razvrščanje po tipiziranih atributih in filtri po delih naslova (npr. samo kraj) niso del 016.
- Vsa besedila v sl/en po feature-map §2.9.
