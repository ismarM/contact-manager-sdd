# Project Brief – Contact Manager SDD

**Projekt:** Večnajemniški sistem za vodenje kontaktnih podatkov (delovno ime: **Contact Manager**)  
**Ekipa:** 2 razvijalca (Ismar in Patrik)  
**Mentor:** Luka  
**Predvideno trajanje:** 3 tedne; cilj prve predstavitve približno **18. 11. 2026**  
**Razvojni pristop:** Spec-Driven Development (SDD)  
**Status dokumenta:** Verzija 1.0 – zaključeno začetno izhodišče za pripravo SDD specifikacij  

> **O izvoru odločitev:** Razdelek »Obvezne zahteve« povzema mentorjev opis. Vse dodatne odločitve v tem dokumentu so **izbrane projektne predpostavke ekipe** za prvo različico, ne dodatne mentorjeve zahteve. Če mentor poda drugačna navodila, jih zabeležimo in posodobimo specifikacije.

## 1. Namen projekta

Razviti in namestiti preprosto spletno aplikacijo za upravljanje kontaktov po projektih oziroma podjetjih. Uporabniki sami ustvarjajo skupine in v njih vodijo kontakte. Kontakti so vidni samo uporabnikom, ki imajo ustrezno članstvo v posamezni skupini. Osrednja prednost aplikacije pred kompleksnimi CRM-sistemi je **enostavna uporaba**.

Poleg delujočega izdelka želimo prikazati **sledljiv razvojni postopek z AI agenti po metodologiji SDD**. Mentor mora imeti vpogled v podane zahteve in pozive, nastale specifikacije, načrt, izvedbene naloge, kodo, teste ter posege razvijalcev v delo agentov. Druga ekipa razvija primerljivo rešitev s klasičnim TDD; rezultatov ne obravnavamo kot tekmovanje.

## 2. Obvezne zahteve mentorja

Aplikacija mora omogočati:

1. **Upravljanje uporabnikov in prijavo** s Firebase Authentication.
2. **Ustvarjanje skupin kontaktov** za projekt ali podjetje (za skupino zadostuje naziv).
3. **Izolacijo podatkov med skupinami:** nepooblaščeni uporabniki ne smejo videti ali spreminjati kontaktov drugih skupin.
4. **Dodajanje, pregled, spreminjanje in brisanje kontaktov.**
5. **Vnaprej določena polja kontaktov**, kot so ime, priimek, naslov, država, e-pošta in podjetje.
6. **Poljubna dodatna polja ključ–vrednost**, npr. `kompetenca=Java`.
7. **Poljubne značke** za kategorizacijo kontaktov, npr. `neObvescaj`, `udelezenec2025`.
8. **Pregled, iskanje in filtriranje** kontaktov.
9. **Revizijsko sled in verzioniranje** sprememb kontaktov.
10. **Odkrivanje in združevanje podvojenih kontaktov.**
11. **Izvoz izbranih kontaktov v Microsoft Excel** (`.xlsx`).
12. **Ustrezno zavarovan REST API** za dostop do zalednega sistema.
13. **Namestitev delujoče aplikacije** za demonstracijo.

**Predpisan tehnološki sklad:**

| Področje | Tehnologija |
|---|---|
| Backend | Spring Boot |
| Frontend | React |
| Podatkovna baza | PostgreSQL |
| Avtentikacija | Firebase Authentication |
| Avtorizacija | Lastna implementacija pravil pravic |
| Izvoz podatkov | Microsoft Excel (`.xlsx`) |

Referenčna rešitev mentorja: <https://github.com/anzo26/SCM>. Uporabimo jo kot primer funkcionalnosti, ne kot osnovo za kopiranje implementacije.

## 3. Potrjen začetni funkcionalni obseg

### 3.1 Uporabniki, skupine in pravice

- Uporabnik se registrira ali prijavi prek Firebase Authentication (za prvo različico zadostuje prijava z e-pošto in geslom).
- Ob prvi uspešni prijavi aplikacija ustvari oziroma sinhronizira lokalni zapis uporabnika na podlagi Firebase UID.
- Vsak prijavljen uporabnik lahko ustvari novo skupino z **nazivom** (npr. `Projekt FERI` ali `Podjetje ABC`).
- Uporabnik lahko pripada **več skupinam** in preklaplja med njimi.
- Posamezen kontakt pripada **točno eni skupini**.
- Ustvarjalec skupine samodejno dobi vlogo **OWNER**.
- Vloge sta samo **OWNER** in **MEMBER**. Vloga samo za branje ni del prve različice.
- **OWNER:** pregleduje in ureja kontakte ter upravlja naziv skupine in njene člane.
- **MEMBER:** pregleduje, ustvarja, spreminja, označuje, združuje in izvaža kontakte ter vidi zgodovino sprememb; članstva drugih ne upravlja.
- OWNER lahko v skupino doda **že registriranega uporabnika po njegovem e-poštnem naslovu**. Če e-pošta še ni registrirana, aplikacija to jasno sporoči; vabil po e-pošti v prvi različici ne pošilja.
- Noben uporabnik ne more dostopati do podatkov skupine, v kateri ni član, tudi če pozna ID skupine ali kontakta.

### 3.2 Kontakti

- Kontakt vsebuje standardna polja: **ime, priimek, e-pošta, telefon, naslov, država in podjetje**.
- Ob ustvarjanju mora biti izpolnjeno **vsaj ime ali priimek**. Ostala polja so neobvezna. Podatke preverjamo in po potrebi normaliziramo (npr. e-pošta).
- Uporabniki lahko kontakt dodajo, odprejo, spremenijo ali izbrišejo.
- **Brisanje je mehko (soft delete):** kontakt ni več v običajnem seznamu in izvozu, njegova revizijska zgodovina pa ostane ohranjena.
- Dodatni atributi so poljubni pari **ključ–vrednost** (besedilna ključa in vrednosti), npr. `kompetenca=Java`, `oddelek=Marketing`. Znotraj posameznega kontakta je ključ enoličen.
- Značke so vezane na skupino. Uporabnik lahko ustvarja in dodeljuje več značk enemu kontaktu; ista značka se lahko uporabi pri več kontaktih.

### 3.3 Pregled, iskanje in filtriranje

- Uporabniški vmesnik vsebuje **izbiro skupine**, preglednico kontaktov in obrazec za dodajanje/urejanje.
- Privzeto se prikazujejo samo aktivni kontakti iz **trenutno izbrane skupine**.
- Iskanje deluje vsaj po imenu, priimku, e-pošti, telefonu in podjetju, neobčutljivo na velike/male črke, kjer je smiselno.
- Filtriranje deluje vsaj po eni ali več značkah; podprt je tudi izbor kontaktov s potrditvenimi polji.
- Vmesnik mora biti preprost, razumljiv in prilagojen uporabi na računalniku; zahtevnejša CRM-analitika ni del obsega.

### 3.4 Revizijska sled in verzioniranje

- Vsak kontakt ima številko verzije, ki se ob vsaki vsebinski spremembi poveča.
- Pri **ustvarjanju, spremembi, spremembi značk ali dodatnih polj, mehkem brisanju in združitvi** se ustvari revizijski zapis.
- Revizijski zapis vsebuje **ID kontakta, vrsto dogodka, čas, Firebase UID oziroma lokalni ID izvajalca, številko verzije in posnetek relevantnega stanja**.
- Revizijskih zapisov uporabniki aplikacije ne morejo urejati ali izbrisati.
- V uporabniškem vmesniku je na voljo **pregled zgodovine in verzij** posameznega kontakta. Samodejna obnovitev stare verzije ni zahtevana.
- Pri sočasnem urejanju uporabimo preverjanje verzije (*optimistic locking*); namesto tihega prepisa vrnemo konflikt, ki ga uporabnik lahko razreši.

### 3.5 Iskanje in združevanje dvojnikov

- Potencialne dvojnike iščemo **samo znotraj iste skupine**.
- Za prvo različico sta kriterija **enak normaliziran e-poštni naslov** ali **enaka normalizirana telefonska številka**. Manjkajoče vrednosti niso ujemanje.
- Sistem prikaže predloge dvojnikov, vendar **ne združuje samodejno**.
- Uporabnik ročno potrdi združitev in izbere, katere vrednosti posameznih standardnih ter dodatnih polj se ohranijo.
- Značke obeh kontaktov se združijo brez podvajanja.
- Eden od kontaktov ostane aktiven; drugi se označi kot združen in ni več prikazan med aktivnimi kontakti.
- Revizijska sled **obeh izvornih kontaktov** ostane ohranjena, povezava med združenima zapisoma pa je sledljiva.
- Združevanje kontaktov iz različnih skupin **ni dovoljeno**.

### 3.6 Excel izvoz

- Uporabnik v preglednici označi kontakte iz trenutno izbrane skupine in izbere **Izvozi v Excel**.
- Aplikacija ustvari datoteko `.xlsx` samo z izbranimi, aktivnimi in dovoljenimi kontakti.
- Izvoz vsebuje **standardna polja, značke in poljubna dodatna polja**. Dodatne ključe lahko predstavimo kot ločene stolpce.
- Backend pred izvozom ponovno preveri članstvo v skupini in pripadnost vsakega izbranega kontakta.
- Vrednosti pri izvozu obravnavamo kot podatke, ne kot izvedljive Excel formule.
- Uvoz iz Excela ni del prve različice.

## 4. Arhitekturne in tehnične odločitve ekipe

Te odločitve veljajo za prvo različico, razen če se med SDD načrtovanjem pojavi utemeljena potreba po spremembi.

| Področje | Odločitev | Razlog |
|---|---|---|
| Arhitektura | En React frontend + en modularni Spring Boot backend | Manj kompleksnosti za dva razvijalca |
| Backend jezik | Java 21 | Stabilna izbira za Spring Boot |
| Frontend | React + TypeScript + Vite | Pregleden razvoj in preverjanje tipov |
| Relacijski model | PostgreSQL | Predpisana tehnologija; primerna za članstva in revizije |
| Poljubna polja | PostgreSQL `JSONB` | Enostavno shranjevanje različnih atributov kontaktov |
| Migracije baze | Flyway | Ponovljive spremembe strukture baze |
| Varnost | Firebase ID token + Spring Security + lastna pravila članstva | Ločitev identitete in pravic |
| Excel | Apache POI | Generiranje datotek `.xlsx` v Javi |
| Lokalni zagon | Docker Compose | Enoten in ponovljiv razvojni zagon |
| Končna namestitev | Linux VPS oziroma VM z Docker Compose, HTTPS in dostopnim spletnim naslovom | Jasna demonstracija nameščenega sistema |
| Backend testi | JUnit 5 + Spring Boot Test + Testcontainers | Preverjanje poslovne logike in dejanske baze |
| Frontend testi | Vitest + React Testing Library | Preverjanje ključnih uporabniških interakcij |

### Meja zaupanja in avtorizacija

- Frontend pridobi Firebase ID token; backend preveri veljavnost podpisa in identiteto uporabnika.
- Podatki o članstvu in vlogah so v PostgreSQL in jih preverja **backend** za vsako zaščiteno operacijo.
- Vsi zahtevki za branje, spreminjanje, revizije, iskanje, združevanje in izvoz so omejeni na skupino, do katere ima uporabnik pravice.
- Filtriranje podatkov samo na frontendu **ni** varnostni ukrep.
- Skrivnosti, servisni ključi in gesla se ne shranjujejo v Git.
- Namestitev je javno dosegljiva prek HTTPS; podatkovna baza ni neposredno javno izpostavljena.

### Predvideni osnovni podatkovni objekti

`users`, `groups` (tenants), `group_members`, `contacts`, `tags`, `contact_tags`, `contact_revisions`.

Podroben podatkovni model in REST endpointi bodo določeni v Spec Kit tehničnem načrtu (`plan.md`) in lahko utemeljeno odstopajo od tega osnutka.

## 5. SDD pristop in delo z AI agenti

- **SDD ogrodje:** GitHub Spec Kit.
- **Primarni agent:** Codex – priprava začetnih SDD artefaktov in implementacija.
- **Sekundarni agent:** Claude Code – neodvisni pregled specifikacij, kode in testov; po potrebi izvedba jasno ločenih nalog.
- **Modeli:** pri prvem zagonu določimo in zapišemo **natančno ime in različico modela** za vsakega agenta ter utemeljimo izbiro glede na zmožnosti, stroške in razpoložljivost. Poznejše spremembe modelov evidentiramo.
- **Enoten vir zahtev:** ta `project-brief.md`, skupne Spec Kit specifikacije in Git zgodovina.
- **Spec Kit in agenta niso avtomatski koordinatorji večagentnega dela.** Vidva razdelita naloge in določita, kateri agent sme spreminjati posamezne datoteke.
- **Brez hkratnega urejanja istih datotek** z dvema agentoma: uporabljamo ločene Git veje oziroma worktreeje in pregled sprememb pred združitvijo.

### Predvideni SDD koraki

1. **Project brief:** dogovorjene začetne zahteve (ta dokument).
2. **Constitution:** stalna projektna pravila o varnosti, kakovosti, testih, sledljivosti in pregledu AI dela.
3. **Specification (`spec.md`):** uporabniški scenariji, funkcionalne zahteve, robni primeri in kriteriji sprejema za posamezen sklop.
4. **Plan (`plan.md`):** arhitektura, podatkovni model, REST vmesnik in tehnične odločitve.
5. **Tasks (`tasks.md`):** majhne, preverljive implementacijske naloge.
6. **Implementation + verification:** agent implementira, razvijalca pregledata spremembe, izvedeta teste in preverita skladnost s specifikacijo.

Specifikacije, načrte in naloge potrdita razvijalca **pred** implementacijo posameznega sklopa. Ob spremembi zahtev najprej posodobita pripadajočo specifikacijo.

## 6. Obvezno beleženje AI razvoja

Ker mentor želi videti dejanske vhode agentom in ker bo pozneje primerjava s skupino TDD, vodimo **`docs/ai-development-log.md`**. Natančne daljše pozive in pomembne odgovore hranimo tudi v `docs/ai-prompts/` ali kot povezave do preverljivih izvozov sej.

Za vsako pomembnejšo interakcijo ali razvojno nalogo zapišemo:

1. Datum, izvajalca in nalogo oziroma ID naloge iz `tasks.md`.
2. Agenta, natančen model in različico ter uporabljeno orodje.
3. **Točen vhodni poziv** in sklice na uporabljene specifikacije.
4. Kaj je agent ustvaril ali spremenil (datoteke oziroma Git commit).
5. Kako je bil rezultat preverjen (testi, ročni pregled, neuspešni testi).
6. **Napake agenta**, ločene od **nejasnih ali napačno podanih navodil**.
7. **Popravke navodil oziroma dodatne pozive**, s katerimi sva morala usmeriti agenta.
8. Končni rezultat, odprte težave in po potrebi porabo oziroma strošek.

Pri primerjavi bomo lahko opisali število popravkov, vrste napak, ponovno delo, zahtevnost pregleda in dejanski rezultat. Ne bomo trdili, da so vsi neuspehi posledica modela, če so bili vzrok nejasni zahtevki.

## 7. Testiranje in merila sprejema

Prva različica je sprejemljiva, ko:

- Prijavljen uporabnik ustvari skupino in vanjo doda člana.
- V skupini ustvari, poišče, filtrira, uredi in mehko izbriše kontakt.
- Kontaktu doda poljubna polja in značke.
- Pregleda revizijsko zgodovino in verzije sprememb.
- Sistem predlaga dvojnik na podlagi e-pošte ali telefona in omogoči ročno združitev brez izgube zgodovine.
- Izbrane kontakte uspešno izvozi v `.xlsx` s standardnimi in dodatnimi podatki.
- Uporabnik druge skupine ne more dostopati do tujih podatkov **niti neposredno prek REST API-ja**.
- Obstajajo avtomatizirani testi ključnih primerov, posebej za avtorizacijo, revizije, združevanje in izvoz.
- Sistem je dostopen na pripravljeni namestitvi prek HTTPS in ima navodila za zagon.
- SDD dokumenti, Git zgodovina in evidenca AI razvoja omogočajo obnovitev razvojnega postopka.

### Obvezni negativni varnostni primeri

- Neprijavljen uporabnik ne more dostopati do zaščitenih endpointov.
- Član skupine A z neposrednim ID-jem ne more prebrati, spremeniti ali izvoziti kontakta skupine B.
- Član brez vloge OWNER ne more upravljati članstva skupine.
- Združevanje dveh kontaktov iz različnih skupin je zavrnjeno.
- Zahtevek s staro verzijo kontakta ne sme tiho prepisati novejše spremembe.

## 8. Načrt izvedbe v treh tednih

| Obdobje | Glavni rezultat |
|---|---|
| **1. teden** | Project brief, constitution, prva specifikacija in načrt; osnova Spring Boot/React/PostgreSQL; Firebase, skupine, osnovni CRUD in izolacija podatkov |
| **2. teden** | Značke, dodatna polja, iskanje, filtriranje, revizijska sled, verzioniranje, odkrivanje in združevanje dvojnikov, Excel izvoz |
| **3. teden** | Integracija, varnostni in uporabniški testi, popravki, HTTPS namestitev, dokumentacija in demonstracija mentorju |

Razvoj izvajamo v manjših vertikalnih sklopih, ki vključujejo backend, frontend in teste. Ni cilj, da najprej v celoti nastane backend in šele nato frontend.

### Prvi delujoči sklop

1. Uporabnik A se prijavi prek Firebase.
2. Ustvari skupino **Projekt FERI**.
3. Vanjo doda kontakt **Janez Novak** in ga nato uredi.
4. Uporabnik B, ki ni član skupine, kontakta ne vidi in do njega ne dostopa prek REST API-ja.
5. Za ta scenarij obstajajo avtomatizirani testi, Git commit in zapis uporabe AI agenta.

## 9. Kaj izrecno ni vključeno v prvo različico

- Masovno pošiljanje e-poštnih sporočil, CRM prodajni lijaki in napredna analitika.
- Avtomatsko združevanje kontaktov brez potrditve uporabnika.
- Strojno učenje za podobnost imen ali drugih podatkov.
- Uvoz kontaktov iz Excela oziroma drugih CRM sistemov.
- Vabila neregistriranim uporabnikom in kompleksna administracija organizacij.
- Dodatne uporabniške vloge in podrobne pravice za vsako polje.
- Samodejna obnovitev poljubne stare verzije kontakta.
- Mobilna aplikacija in mikrostoritvena arhitektura.

---

**Pravilo projekta:** Pomembnih odločitev in AI napak ne skrivamo oziroma ne popravljamo brez sledi. Zabeležimo, kaj je agent naredil, kaj sva spremenila in zakaj.
