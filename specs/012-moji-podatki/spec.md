# Feature Specification: Moji podatki – izvoz podatkov in izbris računa

**Feature Branch**: `moji-podatki` (no number; the directory is `specs/012-moji-podatki/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Izvoz svojih podatkov v obliki JSON (članstva v skupinah, povabila, osebni podatki, skupine, katerih lastnik je uporabnik – ostali podatki so od uporabnika neodvisni) in izbris računa (uporabnikove informacije in povabila se izbrišejo; ni dovoljen, dokler je uporabnik lastnik katerekoli nearhivirane skupine; v arhiviranih skupinah, katerih lastnik je uporabnik, se kot lastnik prikaže »izbrisan uporabnik«, skupina pa ostane trajno arhivirana; tudi v revizijskih sledeh in povsod drugje se njegovo ime prikaže kot »izbrisan uporabnik«; arhivirane skupine, katerih edini član je uporabnik, se izbrišejo)."

## Clarifications

### Session 2026-11-04

- Q: Ali izvoz vključuje izbiro jezika in teme, ki jo 001 po D-19 hrani v profilu uporabnika? → A: Da; izbira jezika in teme je del osebnih podatkov v izvozu (FR-012-02 (a)), nastavitve, shranjene samo v brskalniku, niso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Izvoz mojih podatkov v JSON (Priority: P1)

Prijavljen uporabnik v *Mojem računu* v razdelku *Moji podatki* prebere, kaj izvoz vsebuje, in s klikom na *Prenesi moje podatke (JSON)* prenese datoteko z vsemi podatki, ki so vezani nanj: osebni podatki, članstva v skupinah, prejeta in poslana čakajoča povabila ter skupine, katerih lastnik je. Podatki, ki so od uporabnika neodvisni (kontakti, revizijske sledi, podatki drugih članov), niso del izvoza.

**Why this priority**: pravica do prenosljivosti podatkov (GDPR, konstitucija VI) je samostojna vrednost in ne spreminja nobenih podatkov, zato je najvarnejši prvi korak; hkrati uporabniku omogoči, da si podatke shrani pred izbrisom računa.

**Independent Test**: uporabnik z znanimi članstvi, povabili in skupinami v lasti prenese datoteko; vsebina se primerja s pričakovanimi podatki in preveri, da ne vsebuje tujih podatkov.

**Acceptance Scenarios**:

1. **[FR-012-01]** **Given** prijavljen uporabnik na strani *Moj račun*, **When** si ogleda razdelek *Moji podatki*, **Then** vidi razlago, da izvoz vsebuje članstva, povabila, osebne podatke in skupine v lasti, ter gumb *Prenesi moje podatke (JSON)*.
2. **[FR-012-02]** **Given** uporabnik je 2. 11. 2026 član treh skupin (lastnik ene aktivne, urednik v arhivirani, bralec v trajno arhivirani) in ima dve prejeti povabili, **When** klikne *Prenesi moje podatke (JSON)*, **Then** se prenese datoteka »moji-podatki-2026-11-02.json«, ki vsebuje njegovo ime, e-naslov, datum registracije in v profilu shranjeno izbiro jezika in teme, vsa tri članstva (naslov skupine, vloga, datum včlanitve, stanje arhivirana / trajno arhivirana), obe prejeti povabili (naslov skupine, ponujena vloga, pošiljatelj, datum), eno poslano čakajoče povabilo (naslov skupine, ponujena vloga, e-naslov povabljenega, datum) in skupino, ki jo ima v lasti (naslov, opis, barva, stanje arhiviranja, datum ustvarjanja).
3. **[FR-012-02]** **Given** uporabnik ima prejeto povabilo, katerega pošiljatelj je medtem izbrisal račun, **When** prenese svoje podatke, **Then** je pri tem povabilu kot pošiljatelj zapisano »izbrisan uporabnik«.
4. **[FR-012-02]** **Given** nov uporabnik brez članstev in povabil, **When** prenese svoje podatke, **Then** datoteka vsebuje osebne podatke ter prazne sezname članstev, prejetih povabil, poslanih povabil in skupin v lasti.
5. **[FR-012-03]** **Given** uporabnik je lastnik skupine s kontakti, revizijsko sledjo in drugimi člani, **When** prenese svoje podatke, **Then** datoteka ne vsebuje nobenega kontakta, vnosa revizijske sledi, imena ali e-naslova drugega člana.
6. **[FR-012-02]** **Given** uporabnik ima v profilu izbrano *English* in *Temna*, drug uporabnik pa izbire v profilu nima (*Sistemska*, jezik ni izbran), **When** vsak prenese svoje podatke, **Then** datoteka prvega vsebuje jezik `en` in temo `dark`, datoteka drugega pa jezik in temo brez vrednosti.
7. **[FR-012-04]** **Given** strežnik izvoza ne more pripraviti (npr. ni povezave), **When** uporabnik klikne *Prenesi moje podatke (JSON)*, **Then** se nobena datoteka ne prenese, na mestu akcije pa je vidno sporočilo o napaki z gumbom *Poskusi znova*.

---

### User Story 2 - Izbris računa, ko uporabnik nima aktivnih skupin v lasti (Priority: P1)

Uporabnik, ki ni lastnik nobene nearhivirane skupine, v razdelku *Izbris računa* prebere posledice, potrdi izbris z vpisom svojega e-naslova in s tem trajno izbriše svoj račun. Sistem izbriše njegove osebne podatke in prejeta povabila, ga odstrani iz vseh skupin, arhivirane skupine v njegovi lasti spremeni v trajno arhivirane (ali jih izbriše, če je edini član), povsod pa se namesto njega prikaže »izbrisan uporabnik«. Uporabnik je nato odjavljen.

**Why this priority**: pravica do izbrisa (GDPR) je izrecna zahteva; posledice za skupine in prikaz »izbrisan uporabnik« so pogoj za stanje »trajno arhivirana« (003).

**Independent Test**: uporabnik z znanimi članstvi (tudi lastnik arhiviranih skupin z in brez drugih članov) izbriše račun; nato se preveri stanje vseh skupin, povabil, revizijskih sledi in da se z istim Google računom ustvari nov prazen račun.

**Acceptance Scenarios**:

1. **[FR-012-05]** **Given** prijavljen uporabnik na strani *Moj račun*, **When** si ogleda razdelek *Izbris računa*, **Then** vidi razlago posledic: osebni podatki in prejeta povabila se izbrišejo, iz vseh skupin bo odstranjen, v arhiviranih skupinah v njegovi lasti in v revizijskih sledeh bo prikazan »izbrisan uporabnik«, arhivirane skupine, v katerih je edini član, se izbrišejo, izbris je nepovraten.
2. **[FR-012-07]** **Given** uporabnik ni lastnik nobene nearhivirane skupine, **When** klikne *Izbriši račun*, **Then** se odpre potrditveni dialog (design.md 8.11) z vprašanjem o izbrisu računa, razlago posledic, poljem za vpis e-naslova in fokusom na *Prekliči*.
3. **[FR-012-07]** **Given** odprt potrditveni dialog, **When** uporabnik vpiše e-naslov, ki se ne ujema z njegovim, in klikne gumb za izbris, **Then** se ob polju prikaže napaka, dialog ostane odprt in nič se ne izbriše.
4. **[FR-012-07]** **Given** odprt potrditveni dialog, **When** uporabnik klikne *Prekliči* ali pritisne *Esc*, **Then** se dialog zapre, fokus se vrne na *Izbriši račun* in nič se ne izbriše.
5. **[FR-012-08]** **Given** uporabnik je urednik v aktivni skupini A in ima dve prejeti povabili, **When** potrdi izbris računa s pravilnim e-naslovom, **Then** ni več član skupine A, njegovi prejeti povabili ne obstajata več, njegovi osebni podatki (ime, e-naslov, nastavitve) niso več shranjeni, skupina A in njeni kontakti pa ostanejo nespremenjeni.
6. **[FR-012-09]** **Given** uporabnik je lastnik arhivirane skupine B z dvema drugima članoma, **When** izbriše račun, **Then** je skupina B trajno arhivirana, nima lastnika, kot lastnik je prikazan »izbrisan uporabnik«, ostala člana pa ostaneta njena člana z nespremenjenima vlogama.
7. **[FR-012-09]** **Given** uporabnik je lastnik arhivirane skupine C in njen edini član, **When** izbriše račun, **Then** skupina C skupaj s kontakti in revizijsko sledjo ne obstaja več.
8. **[FR-012-10]** **Given** uporabnik je edini preostali član trajno arhivirane skupine D (ni lastnik), **When** izbriše račun, **Then** skupina D skupaj s svojimi podatki ne obstaja več.
9. **[FR-012-11]** **Given** uporabnik je kot admin skupine E poslal povabilo uporabniku X, ki še ni odgovoril, **When** izbriše račun, **Then** povabilo ostane veljavno, X ga lahko sprejme ali zavrne, kot pošiljatelj pa je prikazano »izbrisan uporabnik«.
10. **[FR-012-12]** **Given** uporabnik je v skupini F spreminjal kontakte, **When** izbriše račun in drug član odpre revizijsko sled skupine F, **Then** je pri vseh njegovih vnosih kot izvajalec prikazano »izbrisan uporabnik« / "deleted user", njegovo ime ali e-naslov pa ni nikjer prikazan.
11. **[FR-012-14]** **Given** uporabnik je potrdil izbris računa, **When** se izbris zaključi, **Then** je odjavljen, vidi stran za prijavo s potrditvijo »Tvoj račun je izbrisan.«, njegova identiteta pri ponudniku prijave pa je izbrisana.
12. **[FR-012-14]** **Given** uporabnik je izbrisal račun, **When** se znova prijavi z istim Google računom, **Then** se ustvari nov račun brez članstev, povabil in skupin, prejšnji vnosi revizijskih sledi pa ostanejo prikazani kot »izbrisan uporabnik«.
13. **[FR-012-15]** **Given** uporabnik je izbrisal račun na eni napravi, **When** z drugo napravo, kjer je bil še prijavljen, pošlje katerikoli zahtevek, **Then** je zavrnjen kot neprijavljen in naprava prikaže stran za prijavo.
14. **[FR-012-16]** **Given** prijavljena uporabnika A in B, **When** A poskusi izvoziti podatke ali izbrisati račun uporabnika B z navedbo njegovega identifikatorja, **Then** takšne operacije ni (404), izvoz vedno vrne samo podatke uporabnika A in račun B ostane nespremenjen.

---

### User Story 3 - Izbris računa je blokiran, dokler je uporabnik lastnik aktivne skupine (Priority: P2)

Uporabnik, ki je lastnik vsaj ene nearhivirane skupine, računa ne more izbrisati. Namesto gumba *Izbriši račun* vidi seznam teh skupin s povezavami in navodilo »Prenesi lastništvo ali arhiviraj te skupine«. Zaledje izbris zavrne tudi, če ga kdo sproži mimo vmesnika ali če uporabnik medtem postane lastnik aktivne skupine.

**Why this priority**: preprečuje skupine brez lastnika, ki bi ostale aktivne; brez tega pravila izbris (zgodba 2) ni varen, a zgodba 2 je za uporabnike brez aktivnih skupin v lasti uporabna tudi sama.

**Independent Test**: lastnik aktivne skupine odpre *Moj račun* in sproži izbris neposredno prek zaledja; nato se lastništvo med odprtim dialogom prenese nanj.

**Acceptance Scenarios**:

1. **[FR-012-06]** **Given** uporabnik je lastnik aktivnih skupin »Projekt FERI« in »Klub«, **When** odpre razdelek *Izbris računa*, **Then** gumba *Izbriši račun* ni, prikazan pa je seznam obeh skupin s povezavama na njune strani in navodilo »Prenesi lastništvo ali arhiviraj te skupine«.
2. **[FR-012-06]** **Given** uporabnik je lastnik aktivne skupine, **When** zahtevek za izbris računa pošlje mimo vmesnika, **Then** je zavrnjen s `409 OWNS_ACTIVE_GROUPS` in nič se ne spremeni.
3. **[FR-012-06]** **Given** uporabnik je arhiviral vse skupine v svoji lasti, **When** znova odpre razdelek *Izbris računa*, **Then** vidi gumb *Izbriši račun*.
4. **[FR-012-13]** **Given** uporabnik ima odprt potrditveni dialog za izbris računa in medtem nanj nekdo prenese lastništvo aktivne skupine, **When** potrdi izbris, **Then** je izbris zavrnjen s `409 OWNS_ACTIVE_GROUPS`, nič se ne izbriše, vmesnik pa pokaže razumljivo sporočilo in posodobljen seznam skupin z navodilom.
5. **[FR-012-13]** **Given** izbris računa in prenos lastništva na tega uporabnika se izvedeta hkrati, **When** se obe operaciji zaključita, **Then** velja natanko eno: bodisi je izbris zavrnjen in uporabnik je lastnik, bodisi je račun izbrisan in prenos zavrnjen – nikoli ne obstaja nearhivirana skupina brez lastnika.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-012-02, FR-012-03 | unauthenticated (no/invalid/expired token) | prenos mojih podatkov | 401, ni datoteke |
| FR-012-02, FR-012-03 | prijavljen uporabnik | poskus pridobiti podatke drugega uporabnika (npr. z identifikatorjem drugega uporabnika) | takšne operacije ni – 404; vedno se vrnejo samo lastni podatki |
| FR-012-08 – FR-012-12 | unauthenticated (no/invalid/expired token) | izbris računa | 401, nič se ne spremeni |
| FR-012-08 – FR-012-12 | prijavljen uporabnik | poskus izbrisati račun drugega uporabnika | takšne operacije ni – 404, nič se ne spremeni |
| FR-012-06, FR-012-13 | lastnik vsaj ene nearhivirane skupine (tudi če je to postal med potrjevanjem) | izbris računa | 409 OWNS_ACTIVE_GROUPS, nič se ne spremeni |
| FR-012-07 | prijavljen uporabnik v potrditvenem dialogu | vpiše napačen ali prazen e-naslov | napaka ob polju, zahtevek se ne pošlje, nič se ne spremeni |
| FR-012-07 | prijavljen uporabnik | zahtevek za izbris mimo vmesnika brez e-naslova ali z napačnim e-naslovom | 400 VALIDATION_FAILED, nič se ne spremeni |
| FR-012-15 | izbrisan uporabnik s še veljavnim žetonom (druga naprava, drug zavihek) | katerikoli zahtevek (tudi ponovni izbris ali izvoz) | 401 |
| FR-012-11 | prejemnik povabila izbrisanega pošiljatelja | sprejem povabila v arhivirani skupini | po pravilih 006 (sprejem uspe, FR-006-09); izbris pošiljatelja tega ne spremeni |

### Edge Cases

- Uporabnik je lastnik arhivirane in aktivne skupine hkrati → izbris je blokiran (FR-012-06); arhivirane skupine ostanejo nespremenjene.
- Uporabnik je član (ne lastnik) arhivirane skupine, ki ima lastnika → je le odstranjen; skupina ostane arhivirana z istim lastnikom.
- Uporabnik je eden od več članov trajno arhivirane skupine → je le odstranjen; skupina ostane trajno arhivirana.
- Arhivirana skupina v lasti uporabnika, katere drugi člani so medtem vsi odšli → v trenutku izbrisa je uporabnik edini član, zato se skupina izbriše (FR-012-09).
- Uporabnik je edini član nearhivirane skupine → je nujno njen lastnik, zato je izbris blokiran (FR-012-06).
- Uporabnik je poslal povabilo v skupino, ki se ob izbrisu računa izbriše (edini član) → s skupino se izbrišejo tudi njena povabila (003).
- Uporabnik je poslal povabilo v skupino, ki postane trajno arhivirana → povabilo ostane, sprejem pa sledi pravilom 006 za arhivirane skupine.
- Uporabnik potrdi izbris v dveh zavihkih hkrati → izbris se izvede enkrat; drugi zahtevek dobi 401.
- E-naslov v potrditvi se primerja brez upoštevanja velikosti črk in presledkov na začetku in koncu.
- Kontakt v neki skupini ima ime ali e-naslov izbrisanega uporabnika kot podatek kontakta → to so podatki skupine, ne uporabnika; ostanejo nespremenjeni.
- Izvoz med izbrisom računa v drugem zavihku → izvoz vrne bodisi popolne podatke pred izbrisom bodisi 401, nikoli delnih.
- Izvoz med povezavo z napako ali brez povezave (PWA) → vidna napaka (FR-012-04), datoteka se ne ustvari.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-012-01**: Sistem MORA na strani *Moj račun* prikazati razdelek *Moji podatki* z razlago, kaj izvoz vsebuje (osebni podatki, članstva, prejeta in poslana povabila, skupine v lasti), in gumbom *Prenesi moje podatke (JSON)* (design.md 9.9, točka 3). *(najnižja vloga: —)*
- **FR-012-02**: Sistem MORA prijavljenemu uporabniku ob kliku na *Prenesi moje podatke (JSON)* prenesti datoteko »moji-podatki-‹YYYY-MM-DD›.json« (datum izvoza), ki vsebuje samo njegove podatke: (a) osebni podatki – ime, e-naslov, datum registracije, v profilu shranjena izbira jezika in teme (brez vrednosti, če je ni; 001, FR-001-19); (b) vsa članstva – naslov skupine, vloga, datum včlanitve, ali je skupina arhivirana oziroma trajno arhivirana; (c) vsa prejeta čakajoča povabila – naslov skupine, ponujena vloga, pošiljatelj (ime ali »izbrisan uporabnik«), datum; (d) vsa poslana čakajoča povabila (006) – naslov skupine, ponujena vloga, e-naslov povabljenega, datum, tudi če uporabnik v skupini ni več član ali ni več ADMIN+; drugih podatkov povabljenega izvoz ne vsebuje; (e) skupine, katerih lastnik je – naslov, opis, barva, stanje arhiviranja, datum ustvarjanja. Seznami brez vnosov so v datoteki prazni. *(najnižja vloga: —)*
- **FR-012-03**: Sistem MORA iz izvoza izpustiti vse podatke, ki niso vezani na uporabnika: kontakte, vnose revizijskih sledi, imena, e-naslove in vloge drugih članov. Kopija nastavitev videza v brskalniku ni podatek strežnika in ni del izvoza. *(najnižja vloga: —)*
- **FR-012-04**: Sistem MORA ob neuspelem izvozu prikazati vidno sporočilo o napaki na mestu akcije z gumbom *Poskusi znova* (design.md 8.13) in ne sme prenesti delne datoteke. *(najnižja vloga: —)*
- **FR-012-05**: Sistem MORA na strani *Moj račun* prikazati razdelek *Izbris računa* z razlago posledic izbrisa (izbris osebnih podatkov in prejetih povabil, odstranitev iz vseh skupin, prikaz »izbrisan uporabnik« v arhiviranih skupinah v lasti in revizijskih sledeh, izbris arhiviranih skupin, v katerih je uporabnik edini član, nepovratnost) (design.md 9.9, točka 4). *(najnižja vloga: —)*
- **FR-012-06**: Sistem MORA izbris računa zavrniti z `409 OWNS_ACTIVE_GROUPS`, dokler je uporabnik lastnik vsaj ene nearhivirane skupine; vmesnik MORA v tem primeru namesto gumba *Izbriši račun* prikazati seznam teh skupin s povezavami na njihove strani in navodilo »Prenesi lastništvo ali arhiviraj te skupine«. *(najnižja vloga: —)*
- **FR-012-07**: Sistem MORA pred izbrisom računa zahtevati potrditev v potrditvenem dialogu (design.md 8.11) s fokusom na *Prekliči* in z vpisom lastnega e-naslova; ob neujemanju (brez upoštevanja velikosti črk in presledkov na robovih) dialog ostane odprt, ob polju se prikaže napaka in nič se ne izbriše. Zaledje MORA zahtevek za izbris brez ujemajočega se e-naslova zavrniti z `400 VALIDATION_FAILED`. *(najnižja vloga: —)*
- **FR-012-08**: Sistem MORA ob izbrisu računa izbrisati uporabnikov profil in vse osebne podatke (ime, e-naslov, shranjene nastavitve), izbrisati vsa povabila, ki jih je uporabnik prejel, in ga odstraniti iz vseh skupin, katerih član je. *(najnižja vloga: —)*
- **FR-012-09**: Sistem MORA ob izbrisu računa vsako arhivirano skupino, katere lastnik je uporabnik, spremeniti v trajno arhivirano skupino brez lastnika (feature-map §2.4), razen če je uporabnik v trenutku izbrisa njen edini član – takrat MORA skupino izbrisati skupaj z vsemi njenimi podatki (kontakti, revizijska sled, povabila). *(najnižja vloga: —)*
- **FR-012-10**: Sistem MORA ob izbrisu računa izbrisati vsako arhivirano ali trajno arhivirano skupino, katere edini član je uporabnik, skupaj z vsemi njenimi podatki. *(najnižja vloga: —)*
- **FR-012-11**: Sistem MORA povabila, ki jih je izbrisani uporabnik poslal, ohraniti veljavna (prejemnik jih lahko sprejme ali zavrne po pravilih 006); kot pošiljatelj MORA biti prikazano »izbrisan uporabnik«. *(najnižja vloga: —)*
- **FR-012-12**: Sistem MORA po izbrisu računa povsod, kjer bi bil prikazan izbrisani uporabnik (izvajalec v revizijskih sledeh, lastnik trajno arhivirane skupine, pošiljatelj povabila, izvoz podatkov drugih uporabnikov in vsa druga mesta), prikazati »izbrisan uporabnik« / "deleted user" in ne sme več hraniti njegovega imena ali e-naslova (feature-map §2.5). *(najnižja vloga: —)*
- **FR-012-13**: Sistem MORA izbris računa izvesti atomarno – vse posledice (FR-012-08 do FR-012-12) se zgodijo v celoti ali pa nobena – in pogoj iz FR-012-06 preveriti v trenutku izbrisa, tako da sočasna operacija (npr. prenos lastništva aktivne skupine na uporabnika, odarhiviranje) ne more pustiti nearhivirane skupine brez lastnika. *(najnižja vloga: —)*
- **FR-012-14**: Sistem MORA po uspešnem izbrisu izbrisati tudi uporabnikovo identiteto pri ponudniku prijave, uporabnika odjaviti in prikazati stran za prijavo s potrdilom »Tvoj račun je izbrisan.« / "Your account has been deleted."; ponovna prijava z istim Google računom MORA ustvariti nov račun brez kakršne koli povezave s prejšnjim. *(najnižja vloga: —)*
- **FR-012-15**: Sistem MORA vsak zahtevek z žetonom izbrisanega uporabnika (tudi z drugih naprav in zavihkov) zavrniti s `401`. *(najnižja vloga: —)*
- **FR-012-16**: Sistem NE SME ponujati nobene operacije, s katero bi uporabnik izvozil podatke drugega uporabnika ali izbrisal račun drugega uporabnika; izvoz in izbris veljata vedno samo za prijavljenega uporabnika (poskus z identifikatorjem drugega uporabnika → `404`). *(najnižja vloga: —)*

### Key Entities *(include if feature involves data)*

- **Izvoz mojih podatkov**: enkraten posnetek uporabnikovih podatkov v trenutku izvoza; vsebuje osebne podatke, seznam članstev, seznam prejetih povabil, seznam poslanih povabil in seznam skupin v lasti; ne hrani se na strežniku.
- **Uporabnik (račun)**: ime, e-naslov, datum registracije, nastavitve; ob izbrisu se odstrani v celoti, vse reference nanj (revizijska sled, lastnik, pošiljatelj povabila) pa kažejo na »izbrisan uporabnik«.
- **Članstvo**: povezava uporabnik–skupina z vlogo in datumom včlanitve; ob izbrisu računa se odstrani.
- **Povabilo**: prejeto (izbriše se z računom) ali poslano (ostane, pošiljatelj postane »izbrisan uporabnik«).
- **Trajno arhivirana skupina**: arhivirana skupina, katere lastnik je izbrisal račun; nima lastnika (pravila v 003).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uporabnik s 100 članstvi in 50 povabili prenese svoje podatke v največ 5 sekundah od klika.
- **SC-002**: V 100 % preizkušenih izvozov datoteka vsebuje vse uporabnikove podatke iz FR-012-02 in nobenega podatka iz FR-012-03.
- **SC-003**: Uporabnik brez aktivnih skupin v lasti izbriše račun v manj kot 1 minuti od odprtja *Mojega računa*.
- **SC-004**: Po izbrisu računa iskanje imena in e-naslova izbrisanega uporabnika po vseh podatkih sistema, ki niso podatki kontaktov, ne najde nobenega zadetka.
- **SC-005**: Na vseh mestih, kjer je bil uporabnik prikazan (revizijska sled, lastnik, pošiljatelj povabila), je v 100 % primerov prikazano »izbrisan uporabnik«.
- **SC-006**: V 100 ponovitvah sočasnega izbrisa računa in prenosa lastništva na istega uporabnika ne nastane nobena nearhivirana skupina brez lastnika in nobeno delno izbrisano stanje.
- **SC-007**: Uporabnik, ki je lastnik aktivne skupine, iz razdelka *Izbris računa* v enem kliku pride do vsake skupine, ki mu izbris preprečuje.

## Assumptions

- **Obseg izvoza** (odločitev): izvoz vsebuje samo podatke iz FR-012-02; kontakti, revizijske sledi in podatki drugih članov so podatki skupine, ne uporabnika, in niso v izvozu. Izbira jezika in teme, ki jo 001 hrani v profilu (konstitucija VI 1.1.0, D-19), je del osebnih podatkov v izvozu; kopija v brskalniku ni.
- **Oblika izvoza** (odločitev): datoteka je strojno berljiva, z ustaljeno strukturo, neodvisno od jezika vmesnika (vloge in stanja kot kode, npr. `OWNER`, datumi v mednarodnem zapisu z uro in časovnim pasom); datum v imenu datoteke je datum izvoza po lokalnem času uporabnika. Natančna struktura je stvar `plan.md` / `contracts/`.
- **Prejeta in poslana povabila v izvozu** so povabila, ki v trenutku izvoza obstajajo (čakajoča); sprejeta, zavrnjena in umaknjena povabila po 006 prenehajo obstajati in niso v izvozu. Pri poslanih povabilih je e-naslov povabljenega edini podatek drugega uporabnika v izvozu – uporabnik ga je sam vpisal ob vabljenju (006, Clarifications 2026-11-08).
- **Datum registracije** shranjuje 001 ob prvi prijavi; **datum včlanitve** shranjujeta 002 (ustvarjalec) in 006 (sprejem povabila).
- **Identiteta pri ponudniku prijave** (odločitev, GDPR): ob izbrisu se izbriše tudi identiteta v Firebase Authentication. Brisanje podatkov aplikacije je atomarna enota (FR-012-13); če brisanje identitete pri ponudniku začasno ne uspe, se ponavlja, dokler ne uspe – zaradi FR-012-15 in FR-012-14 izbrisan račun v nobenem primeru ne more ponovno pridobiti dostopa do starih podatkov.
- **Potrditev z e-naslovom** (odločitev): preverja jo vmesnik in tudi zaledje (FR-012-07), kot dodatna zaščita pred nenamernim izbrisom.
- **Koda poslovnega pravila**: `OWNS_ACTIVE_GROUPS` (409); odgovor vsebuje seznam skupin, ki preprečujejo izbris, da ga vmesnik lahko prikaže (FR-012-06, FR-012-13).
- **Povabila v skupine, ki se ob izbrisu izbrišejo**, se izbrišejo skupaj s skupino (pravila izbrisa skupine v 003).
- Podatki kontaktov, ki slučajno vsebujejo ime ali e-naslov izbrisanega uporabnika, so podatki skupine in se ne spreminjajo; vnosi revizijske sledi ohranijo stanje kontaktov prej/potem, anonimizira se samo izvajalec.
- Odvisnosti: 001-prijava (stran *Moj račun*, prijava/odjava, registracija ob prvi prijavi, stran za prijavo), 002-skupine (skupine, vloge), 003-arhiviranje (arhivirane in trajno arhivirane skupine, izbris skupine, pasica »trajno arhivirana«), 005-revizijska-sled (prikaz izvajalca), 006-povabila (povabila, prikaz pošiljatelja), 007-clani (prenos lastništva, ki mora upoštevati FR-012-13 – prenos na izbrisanega uporabnika se zavrne). Prikaz »izbrisan uporabnik« na posameznih zaslonih izvedejo funkcionalnosti, ki so lastnice zaslonov, po feature-map §2.5; 012 zagotovi, da so reference na uporabnika anonimizirane.
- Izbris računa se ne beleži v revizijski sledi skupin (ni sprememba kontaktov, feature-map §2.7).

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
