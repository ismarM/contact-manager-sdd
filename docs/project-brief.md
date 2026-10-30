# Project Brief – Contact Manager SDD

**Projekt:** Večnajemniški sistem za vodenje kontaktnih podatkov (delovno ime: **Contact Manager**)  
**Ekipa:** 2 razvijalca (Ismar in Patrik)  
**Mentor:** Luka  
**Predvideno trajanje:** 3 tedne; cilj prve predstavitve približno **18. 11. 2026**  
**Razvojni pristop:** Spec-Driven Development (SDD)  
**AI agent:** Claude Code (edini agent na projektu)  
**Status dokumenta:** Verzija 1.2 – izhodišče za pripravo SDD specifikacij (spremembe glej v razdelku 10)  

> **O izvoru odločitev:** Razdelek »Obvezne zahteve« povzema mentorjev opis. Vse dodatne odločitve v tem dokumentu so **izbrane projektne predpostavke ekipe** za prvo različico, ne dodatne mentorjeve zahteve. Če mentor poda drugačna navodila, jih zabeležimo in posodobimo specifikacije.

## 1. Namen projekta

Razviti in namestiti preprosto spletno aplikacijo za upravljanje kontaktov po projektih oziroma podjetjih. Uporabniki sami ustvarjajo skupine in v njih vodijo kontakte. Kontakti so vidni samo uporabnikom, ki imajo ustrezno članstvo v posamezni skupini. Osrednja prednost aplikacije pred kompleksnimi CRM-sistemi je **enostavna uporaba** – na računalniku in na mobilnem telefonu.

Poleg delujočega izdelka želimo prikazati **sledljiv razvojni postopek z AI agentom po metodologiji SDD**. Mentor mora imeti vpogled v podane zahteve in pozive, nastale specifikacije, načrt, izvedbene naloge, kodo, teste ter posege razvijalcev v delo agenta. Druga ekipa razvija primerljivo rešitev s klasičnim TDD; rezultatov ne obravnavamo kot tekmovanje.

## 2. Obvezne zahteve mentorja

Aplikacija mora omogočati:

1. **Prijavo uporabnikov** s Firebase Authentication.
2. **Ustvarjanje skupin kontaktov** za projekt ali podjetje (za skupino zadostuje naziv).
3. **Izolacijo podatkov med skupinami:** nepooblaščeni uporabniki ne smejo videti ali spreminjati kontaktov drugih skupin.
4. **Dodajanje, pregled, spreminjanje in brisanje kontaktov.**
5. **Vnaprej določena polja kontaktov**, kot so ime, priimek, naslov, država, e-pošta in podjetje.
6. **Poljubna dodatna polja ključ–vrednost**, npr. `kompetenca=Java`.
7. **Poljubne značke** za kategorizacijo kontaktov, npr. `neObvescaj`, `udelezenec2025`.
8. **Pregled, iskanje in filtriranje** kontaktov.
9. **Revizijsko sled in verzioniranje** sprememb kontaktov.
10. **Odkrivanje in združevanje podvojenih kontaktov** (mentor jih navaja kot primer naprednih funkcionalnosti, »ipd.«).
11. **Izvoz označenih kontaktov v Microsoft Excel** (`.xlsx`).
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
| Integracija | Microsoft Excel (`.xlsx`) |

Referenčna rešitev mentorja: <https://github.com/anzo26/SCM>. Uporabimo jo kot primer funkcionalnosti, ne kot osnovo za kopiranje implementacije.

## 3. Potrjen začetni funkcionalni obseg

### 3.1 Uporabniki, skupine in pravice

**Firebase samo za avtentikacijo.** Firebase Authentication uporabljamo **izključno za preverjanje identitete** (registracija, prijava, odjava, ponastavitev gesla). Vse ostale podatke in vso avtorizacijo vodi naša aplikacija v PostgreSQL:

- Firebase nam posreduje samo identiteto: Firebase UID in e-poštni naslov iz preverjenega ID tokena.
- Uporabniški profil, skupine, članstva, vloge, kontakti, značke in revizije so shranjeni **samo v naši bazi**.
- Ne uporabljamo Firestore, Realtime Database, Firebase custom claims ali drugih Firebase storitev za shranjevanje podatkov ali odločanje o pravicah.

**Uporabniki:**

- Uporabnik se registrira ali prijavi prek Firebase Authentication (za prvo različico zadostuje prijava z e-pošto in geslom).
- Ob prvi uspešni prijavi aplikacija ustvari lokalni zapis uporabnika na podlagi Firebase UID; ob naslednjih prijavah ga sinhronizira (npr. e-pošto).
- Na nivoju aplikacije **ni globalnih vlog** (ni sistemskega administratorja). Vse pravice izhajajo iz članstva v posamezni skupini.

**Skupine in vloge (vloga velja samo znotraj posamezne skupine):**

- Vsak prijavljen uporabnik lahko ustvari novo skupino z **nazivom** (npr. `Projekt FERI` ali `Podjetje ABC`).
- Uporabnik lahko pripada **več skupinam** in preklaplja med njimi. V vsaki skupini ima lahko drugačno vlogo, npr. je OWNER skupine `Projekt FERI` in MEMBER skupine `Podjetje ABC`.
- Posamezen kontakt pripada **točno eni skupini**.
- Vloge sta samo **OWNER** in **MEMBER**. Vloga samo za branje ni del prve različice.
- **OWNER** je **ustvarjalec skupine**. Vsaka skupina ima natanko enega OWNER-ja, ki to vlogo dobi samodejno ob ustvarjanju. Prenos lastništva ni del prve različice.
- **MEMBER** je vsak uporabnik, ki ga OWNER **naknadno doda** v skupino.
- OWNER lahko vse, kar lahko MEMBER, in poleg tega spreminja naziv skupine ter dodaja in odstranjuje člane.
- **MEMBER** pregleduje, ustvarja, spreminja, briše, označuje, združuje in izvaža kontakte ter vidi zgodovino sprememb; članstva drugih ne upravlja.
- OWNER doda člana **po e-poštnem naslovu uporabnika, ki že ima račun v aplikaciji** (se je vsaj enkrat prijavil). Iskanje poteka v naši bazi uporabnikov, ne v Firebase. Če uporabnik s tem e-naslovom ne obstaja, aplikacija to jasno sporoči; vabil po e-pošti v prvi različici ne pošilja.
- Noben uporabnik ne more dostopati do podatkov skupine, v kateri ni član, tudi če pozna ID skupine ali kontakta.

### 3.2 Kontakti

- Kontakt vsebuje standardna polja: **ime, priimek, e-pošta, telefon, naslov, država in podjetje**.
- Ob ustvarjanju mora biti izpolnjeno **vsaj ime ali priimek**. Ostala polja so neobvezna. Podatke preverjamo in po potrebi normaliziramo (npr. e-pošta).
- Uporabniki lahko kontakt dodajo, odprejo, spremenijo ali izbrišejo.
- **Brisanje je mehko (soft delete):** kontakt ni več v običajnem seznamu in izvozu, njegova revizijska zgodovina pa ostane ohranjena.
- Dodatni atributi so poljubni pari **ključ–vrednost** (besedilna ključa in vrednosti), npr. `kompetenca=Java`, `oddelek=Marketing`. Znotraj posameznega kontakta je ključ enoličen.
- Značke so vezane na skupino. Uporabnik lahko ustvarja in dodeljuje več značk enemu kontaktu; ista značka se lahko uporabi pri več kontaktih.

### 3.3 Pregled, iskanje in filtriranje

- Uporabniški vmesnik vsebuje **izbiro skupine**, seznam oziroma preglednico kontaktov in obrazec za dodajanje/urejanje.
- Privzeto se prikazujejo samo aktivni kontakti iz **trenutno izbrane skupine**.
- Iskanje deluje vsaj po imenu, priimku, e-pošti, telefonu in podjetju, neobčutljivo na velike/male črke, kjer je smiselno.
- Filtriranje deluje vsaj po eni ali več značkah; podprt je tudi izbor kontaktov s potrditvenimi polji.
- Vmesnik mora biti preprost in razumljiv; zahtevnejša CRM-analitika ni del obsega.

### 3.4 Uporabniški vmesnik: odzivnost, PWA in dostopnost

- **Odziven vmesnik (responsive)** za namizne računalnike, tablice in mobilne telefone, od širine zaslona **320 px** naprej, brez vodoravnega drsenja. Vse funkcije (tudi izbor, združevanje in izvoz) so na voljo na vseh velikostih zaslona; na ozkih zaslonih se preglednica prikaže kot seznam kartic.
- **PWA (Progressive Web App):** aplikacijo je mogoče namestiti na začetni zaslon (web app manifest, ikone, service worker). Ogrodje aplikacije (app shell) se predpomni, zato se aplikacija hitro naloži; brez povezave prikaže jasno sporočilo, da podatki niso na voljo.
  - Odgovorov API-ja s kontaktnimi podatki service worker v prvi različici **ne predpomni** (zasebnost na deljenih napravah). Delo brez povezave ni del obsega.
- **Dostopnost:** cilj je skladnost s **WCAG 2.2, raven AA**:
  - celotna uporaba s tipkovnico in vidni fokus,
  - semantični HTML in pravilne oznake za bralnike zaslona,
  - zadosten kontrast v svetlem in temnem načinu,
  - dovolj veliki cilji za dotik,
  - podpora povečavi do 200 % in nastavitvi `prefers-reduced-motion`,
  - napake v obrazcih so jasno opisane in povezane s poljem.
- **Oblikovni jezik:** vmesnik sledi oblikovnemu jeziku, opisanemu v [`docs/design.md`](design.md) (osnutek; dopolnjujeva ga sproti).

### 3.5 Revizijska sled in verzioniranje

- Vsak kontakt ima številko verzije, ki se ob vsaki vsebinski spremembi poveča.
- Pri **ustvarjanju, spremembi, spremembi značk ali dodatnih polj, mehkem brisanju in združitvi** se ustvari revizijski zapis.
- Revizijski zapis vsebuje **ID kontakta, vrsto dogodka, čas, lokalni ID izvajalca (in njegov Firebase UID), številko verzije in posnetek relevantnega stanja**.
- Revizijskih zapisov uporabniki aplikacije ne morejo urejati ali izbrisati.
- V uporabniškem vmesniku je na voljo **pregled zgodovine in verzij** posameznega kontakta. Samodejna obnovitev stare verzije ni zahtevana.
- Pri sočasnem urejanju uporabimo preverjanje verzije (*optimistic locking*); namesto tihega prepisa vrnemo konflikt, ki ga uporabnik lahko razreši.

### 3.6 Iskanje in združevanje dvojnikov

- Potencialne dvojnike iščemo **samo znotraj iste skupine**.
- Za prvo različico sta kriterija **enak normaliziran e-poštni naslov** ali **enaka normalizirana telefonska številka**. Manjkajoče vrednosti niso ujemanje.
- Sistem prikaže predloge dvojnikov, vendar **ne združuje samodejno**.
- Uporabnik ročno potrdi združitev in izbere, katere vrednosti posameznih standardnih ter dodatnih polj se ohranijo.
- Značke obeh kontaktov se združijo brez podvajanja.
- Eden od kontaktov ostane aktiven; drugi se označi kot združen in ni več prikazan med aktivnimi kontakti.
- Revizijska sled **obeh izvornih kontaktov** ostane ohranjena, povezava med združenima zapisoma pa je sledljiva.
- Združevanje kontaktov iz različnih skupin **ni dovoljeno**.

### 3.7 Excel izvoz

Excel integracija pomeni **izvoz**. Uvoz iz Excela ni predviden.

- Uporabnik v seznamu označi kontakte iz trenutno izbrane skupine in izbere **Izvozi v Excel**. Na voljo je tudi izbor vseh kontaktov, ki ustrezajo trenutnemu iskanju oziroma filtru (npr. vsi z določeno značko).
- Aplikacija ustvari datoteko `.xlsx` samo z izbranimi, aktivnimi in dovoljenimi kontakti.
- Izvoz vsebuje **standardna polja, značke in poljubna dodatna polja**. Dodatne ključe lahko predstavimo kot ločene stolpce.
- Backend pred izvozom ponovno preveri članstvo v skupini in pripadnost vsakega izbranega kontakta.
- Vrednosti pri izvozu obravnavamo kot podatke, ne kot izvedljive Excel formule.
- Izvoz deluje tudi na mobilnih napravah (prenos datoteke).

## 4. Arhitekturne in tehnične odločitve ekipe

Te odločitve veljajo za prvo različico, razen če se med SDD načrtovanjem pojavi utemeljena potreba po spremembi.

| Področje | Odločitev | Razlog |
|---|---|---|
| Arhitektura | En React frontend + en modularni Spring Boot backend | Manj kompleksnosti za dva razvijalca |
| Backend jezik | Java 21 | Stabilna izbira za Spring Boot |
| Frontend | React + TypeScript + Vite | Pregleden razvoj in preverjanje tipov |
| PWA | Web app manifest + service worker (npr. `vite-plugin-pwa`) | Namestitev na napravo in hitro nalaganje |
| Oblikovanje | Lasten oblikovni jezik v `docs/design.md`, implementiran z design tokeni (CSS spremenljivke) | Dosleden, dostopen in enostaven vmesnik |
| Relacijski model | PostgreSQL | Predpisana tehnologija; primerna za članstva in revizije |
| Poljubna polja | PostgreSQL `JSONB` | Enostavno shranjevanje različnih atributov kontaktov |
| Migracije baze | Flyway | Ponovljive spremembe strukture baze |
| Avtentikacija | Firebase Authentication (samo identiteta) | Predpisana tehnologija; ne hranimo gesel |
| Avtorizacija | Spring Security + lastna pravila članstva in vlog v PostgreSQL | Ločitev identitete in pravic; pravice so v celoti pod našim nadzorom |
| Excel | Apache POI | Generiranje datotek `.xlsx` v Javi |
| Lokalni zagon | Docker Compose | Enoten in ponovljiv razvojni zagon |
| Končna namestitev | Linux VPS oziroma VM z Docker Compose, HTTPS in dostopnim spletnim naslovom | Jasna demonstracija nameščenega sistema; HTTPS je pogoj za PWA |
| Backend testi | JUnit 5 + Spring Boot Test + Testcontainers (PostgreSQL) + Firebase Auth Emulator | Preverjanje poslovne logike, dejanske baze in avtentikacije brez pravih zunanjih storitev |
| Frontend testi | Vitest + React Testing Library + `vitest-axe` | Preverjanje ključnih interakcij in osnovne dostopnosti |
| E2E testi | Playwright (viewporta 360 px in 1280 px) + `@axe-core/playwright` | Preverjanje odzivnosti in dostopnosti v pravem brskalniku |
| Kakovost kode – backend | Spotless (formatiranje); ArchUnit z enim pravilom: vsak kontroler za podatke skupine gre skozi preverjanje članstva | Enoten slog in mehanska zaščita izolacije skupin |
| Kakovost kode – frontend | Prettier, ESLint (+ `typescript-eslint`, `react-hooks`, `jsx-a11y`), `tsc --noEmit` v načinu `strict` | Enoten slog, manj napak, statična dostopnost |
| Skrivnosti | gitleaks v pre-commit hooku | Ključi in gesla ne pridejo v Git |
| Enotno preverjanje | `verify.sh` z dvema nivojema (glej §7.2) | En ukaz za razvijalca in agenta, kratek izpis |
| Poročilo kakovosti | Google Lighthouse – ročni zagon pred demonstracijo (ni pogoj za združitev) | Zmogljivost, dostopnost in dobre prakse delujoče aplikacije |

### Meja zaupanja in avtorizacija

- Frontend pridobi Firebase ID token; backend preveri veljavnost podpisa, izdajatelja in rok veljavnosti ter iz njega prebere **samo identiteto** (UID, e-pošta).
- Backend Firebase UID preslika v lokalnega uporabnika. Vse nadaljnje odločitve o pravicah sprejme **backend na podlagi podatkov v PostgreSQL** (članstvo in vloga v skupini), za vsako zaščiteno operacijo posebej.
- Vsi zahtevki za branje, spreminjanje, revizije, iskanje, združevanje in izvoz so omejeni na skupino, do katere ima uporabnik pravice.
- Filtriranje podatkov ali skrivanje gumbov samo na frontendu **ni** varnostni ukrep.
- Skrivnosti, servisni ključi in gesla se ne shranjujejo v Git.
- Namestitev je javno dosegljiva prek HTTPS; podatkovna baza ni neposredno javno izpostavljena.

### Predvideni osnovni podatkovni objekti

`users`, `groups` (tenants), `group_members` (z vlogo `OWNER`/`MEMBER`), `contacts`, `tags`, `contact_tags`, `contact_revisions`.

Podroben podatkovni model in REST endpointi bodo določeni v Spec Kit tehničnem načrtu (`plan.md`) in lahko utemeljeno odstopajo od tega osnutka.

## 5. SDD pristop in delo z AI agentom

- **SDD ogrodje:** GitHub Spec Kit z integracijo za Claude Code.
- **AI agent:** **Claude Code** je edini AI agent na projektu – za pripravo SDD artefaktov, implementacijo in pregled. Drugih agentov (npr. Codex) ne uporabljamo.
- **Modeli:** pri vsaki seji zapišemo **natančno ime in različico modela** (npr. `claude-opus-5-5`) ter utemeljimo izbiro glede na zmožnosti, stroške in razpoložljivost. Poznejše spremembe modelov evidentiramo.
- **Enoten vir zahtev:** ta `project-brief.md`, `design.md`, skupne Spec Kit specifikacije in Git zgodovina.
- **Delo dveh razvijalcev:** vsak dela v svoji seji Claude Code, na svoji Git veji oziroma worktreeju. Naloge razdelita vnaprej, da dve seji ne urejata istih datotek hkrati. Spremembe pred združitvijo pregleda drugi razvijalec.
- **Pregled z agentom:** za pregled lahko uporabimo ločeno sejo Claude Code (npr. `/speckit-analyze`, `/speckit-converge` ali pregled kode). Tak pregled v dnevniku označimo kot **review**. Ker gre za isti model, ga ne štejemo kot neodvisno preverjanje; končno potrditev da razvijalec.

### Predvideni SDD koraki

1. **Project brief in design:** dogovorjene začetne zahteve (ta dokument) in oblikovni jezik (`design.md`).
2. **Constitution** (`/speckit-constitution`): stalna projektna pravila o varnosti, kakovosti, testih, dostopnosti, sledljivosti in pregledu AI dela.
3. **Specification** (`/speckit-specify`, po potrebi `/speckit-clarify`): uporabniški scenariji, funkcionalne zahteve, robni primeri in kriteriji sprejema za posamezen sklop (`spec.md`).
4. **Plan** (`/speckit-plan`): arhitektura, podatkovni model, REST vmesnik in tehnične odločitve (`plan.md`).
5. **Tasks** (`/speckit-tasks`, nato `/speckit-analyze`): majhne, preverljive implementacijske naloge (`tasks.md`) in preverjanje skladnosti artefaktov.
6. **Implementation + verification** (`/speckit-implement`, `/speckit-converge`): agent implementira, razvijalca pregledata spremembe, izvedeta teste in preverita skladnost s specifikacijo.

Specifikacije, načrte in naloge potrdita razvijalca **pred** implementacijo posameznega sklopa. Ob spremembi zahtev najprej posodobita pripadajočo specifikacijo.

### Pravila za SDD artefakte in delo agenta

Ta pravila se prenesejo v Spec Kit constitution in veljajo za vse sklope.

- **ID zahtev:** vsaka funkcionalna zahteva v `spec.md` ima ID oblike `FR-NNN-XX` (npr. `FR-002-04`, kjer je `002` številka sklopa).
- **Sprejemni scenariji:** vsaka zahteva ima vsaj en scenarij *Given / When / Then*. Zahteva, iz katere ni mogoče izpeljati testa, se vrne v fazo *clarify*.
- **Negativna različica:** vsak scenarij, ki vključuje podatke skupine, ima tudi negativno različico (neprijavljen uporabnik, uporabnik tuje skupine, MEMBER namesto OWNER-ja).
- **Testi se spreminjajo samo zaradi specifikacije:** test se sme spremeniti le, da se uskladi s specifikacijo, nikoli zato, da bi ustrezal obstoječi kodi. Obvodi v produkcijski kodi, ki služijo samo temu, da test uspe, so prepovedani.
- **Brez utišanja opozoril:** `@SuppressWarnings`, `// eslint-disable*`, `@ts-ignore`, `@ts-expect-error` in tip `any` so dovoljeni samo s pisno utemeljitvijo v kodi; vsako tako izjemo vidita razvijalca pri pregledu.
- **`CLAUDE.md`:** kratka navodila za Claude Code v korenu repozitorija (kje so dokumenti, ukazi `verify.sh`, osnovna pravila). Dolga ostaja največ približno 30 vrstic; podrobnosti so v tem dokumentu in v constitution.

## 6. Obvezno beleženje AI razvoja

Ker mentor želi videti dejanske vhode agentu in ker bo pozneje primerjava s skupino TDD, vodimo **`docs/ai-development-log.md`**. Natančne daljše pozive in pomembne odgovore hranimo tudi v `docs/ai-prompts/` ali kot povezave do preverljivih izvozov sej.

Za vsako pomembnejšo interakcijo ali razvojno nalogo zapišemo:

1. Datum, izvajalca in nalogo oziroma ID naloge iz `tasks.md`.
2. Natančen model in različico ter različico Claude Code oziroma Spec Kit.
3. **Točen vhodni poziv** in sklice na uporabljene specifikacije.
4. Kaj je agent ustvaril ali spremenil (datoteke oziroma Git commit).
5. Kako je bil rezultat preverjen (testi, ročni pregled, neuspešni testi).
6. **Napake agenta**, ločene od **nejasnih ali napačno podanih navodil**.
7. **Popravke navodil oziroma dodatne pozive**, s katerimi sva morala usmeriti agenta.
8. Končni rezultat, odprte težave in po potrebi porabo oziroma strošek.

Pri primerjavi bomo lahko opisali število popravkov, vrste napak, ponovno delo, zahtevnost pregleda in dejanski rezultat. Ne bomo trdili, da so vsi neuspehi posledica modela, če so bili vzrok nejasni zahtevki.

## 7. Testiranje in merila sprejema

Prva različica je sprejemljiva, ko:

- Prijavljen uporabnik ustvari skupino (in postane njen OWNER) ter vanjo doda člana.
- V skupini ustvari, poišče, filtrira, uredi in mehko izbriše kontakt.
- Kontaktu doda poljubna polja in značke.
- Pregleda revizijsko zgodovino in verzije sprememb.
- Sistem predlaga dvojnik na podlagi e-pošte ali telefona in omogoči ročno združitev brez izgube zgodovine.
- Izbrane kontakte uspešno izvozi v `.xlsx` s standardnimi in dodatnimi podatki.
- Uporabnik druge skupine ne more dostopati do tujih podatkov **niti neposredno prek REST API-ja**.
- Ključni scenariji delujejo na namiznem in mobilnem zaslonu; aplikacijo je mogoče namestiti kot PWA.
- Avtomatski pregled dostopnosti (axe) ključnih zaslonov nima kritičnih napak; ključni scenariji so izvedljivi samo s tipkovnico.
- Obstajajo avtomatizirani testi ključnih primerov, posebej za avtorizacijo, revizije, združevanje in izvoz.
- Vsaka zahteva `FR-NNN-XX` ima vsaj en test, ki nosi njen ID.
- `./verify.sh full` je na `main` zelen.
- Poročilo Lighthouse za ključne strani je pred demonstracijo pregledano; najdbe dostopnosti so odpravljene ali utemeljeno zavrnjene.
- Sistem je dostopen na pripravljeni namestitvi prek HTTPS in ima navodila za zagon.
- SDD dokumenti, Git zgodovina in evidenca AI razvoja omogočajo obnovitev razvojnega postopka.

### 7.1 Pravila testiranja

- **Sledljivost:** vsak test, ki preverja zahtevo, nosi njen ID – pri JUnit z `@Tag("FR-002-04")`, pri Vitest in Playwright v imenu testa (`"FR-002-04: ..."`). Iz oznak lahko ob koncu ustvarimo tabelo *zahteva → testi*.
- **Brez pravih zunanjih storitev:** Firebase v testih vedno prek **Firebase Auth Emulatorja**, baza vedno prek **Testcontainers** (PostgreSQL). Testi ne potrebujejo pravih ključev in so ponovljivi.
- **Neodvisnost:** testi niso odvisni od vrstnega reda izvajanja ali podatkov drugih testov.
- **Smiselne asercije:** test brez asercije ali z vedno resnično asercijo ni test.
- **UI testi po vlogah in dostopnih imenih:** v testih RTL in Playwright elemente iščemo izključno z `getByRole` in `getByLabel` (npr. gumb »Shrani kontakt«), ne s CSS selektorji ali `data-testid`. Tako testi hkrati preverjajo dostopnost.
- **axe:** v testih komponent in strani teče `vitest-axe`; v E2E teče `axe` (WCAG 2.2 AA) na vsaki obiskani strani.
- **E2E:** vsak scenarij teče na viewportih **360 px** in **1280 px**. Izvoz v Excel se v testu prenese in **prebere nazaj**; preveri se vsebina datoteke.

### 7.2 Enotno preverjanje: `verify.sh`

Vsa preverjanja se poganjajo prek enega ukaza – enako za razvijalca, agenta in CI:

```
./verify.sh fast   # formatiranje (Spotless, Prettier), ESLint, tsc, unit testi BE in FE
./verify.sh full   # fast + integracijski in varnostni testi (Testcontainers, Firebase emulator) + E2E (Playwright, axe)
```

- **Uspeh:** ena vrstica, npr. `✓ fast OK`.
- **Neuspeh:** ime koraka in največ ~20 vrstic v obliki `datoteka:vrstica  pravilo  sporočilo` oziroma imena padlih testov; celoten izpis je v `.verify/last.log`.
- Izhodna koda `0` = uspeh, ne-nič = neuspeh. Agent pred zaključkom naloge požene vsaj `fast`, pred združitvijo sklopa v `main` pa `full`.

### 7.3 Matrika izolacije (varnostni testi)

Za **vsak** REST endpoint, ki dostopa do podatkov skupine, obstaja parametriziran varnostni test čez vse akterje:

| Akter | Pričakovan rezultat |
|---|---|
| Neprijavljen oziroma neveljaven / potečen token | `401` |
| Prijavljen, ni član skupine | `404` (ne razkrije obstoja skupine ali kontakta) |
| MEMBER pri akciji, ki je dovoljena samo OWNER-ju (upravljanje članov, sprememba naziva skupine) | `403` |
| Član z ustrezno vlogo | `2xx` |

Nov endpoint brez vnosa v matriki pomeni, da sklop ni zaključen.

### 7.4 Obvezni negativni varnostni primeri

- Neprijavljen uporabnik oziroma zahtevek z neveljavnim ali potečenim Firebase tokenom ne more dostopati do zaščitenih endpointov.
- Član skupine A z neposrednim ID-jem ne more prebrati, spremeniti ali izvoziti kontakta skupine B.
- MEMBER ne more upravljati članstva skupine ali spremeniti njenega naziva.
- OWNER skupine A nima nobenih pravic v skupini B, v kateri je samo MEMBER ali ni član.
- Združevanje dveh kontaktov iz različnih skupin je zavrnjeno.
- Zahtevek s staro verzijo kontakta ne sme tiho prepisati novejše spremembe.

## 8. Načrt izvedbe v treh tednih

| Obdobje | Glavni rezultat |
|---|---|
| **1. teden** | Project brief, design, constitution, prva specifikacija in načrt; osnova Spring Boot/React/PostgreSQL z orodji kakovosti, `verify.sh`, `CLAUDE.md` in Firebase Auth Emulatorjem; Firebase prijava, skupine in vloge, osnovni CRUD in izolacija podatkov (z matriko izolacije); odzivna postavitev in PWA ogrodje |
| **2. teden** | Značke, dodatna polja, iskanje, filtriranje, revizijska sled, verzioniranje, odkrivanje in združevanje dvojnikov, Excel izvoz |
| **3. teden** | Integracija, varnostni, dostopnostni in uporabniški testi (namizno in mobilno), poročilo Lighthouse in popravki najdb, HTTPS namestitev, dokumentacija in demonstracija mentorju |

Razvoj izvajamo v manjših vertikalnih sklopih, ki vključujejo backend, frontend in teste. Ni cilj, da najprej v celoti nastane backend in šele nato frontend. Odzivnost in dostopnost sta del vsakega sklopa, ne ločena faza na koncu.

### Prvi delujoči sklop

1. Uporabnik A se prijavi prek Firebase.
2. Ustvari skupino **Projekt FERI** in postane njen OWNER.
3. Vanjo doda kontakt **Janez Novak** in ga nato uredi – na namiznem in mobilnem zaslonu.
4. Uporabnik B, ki ni član skupine, kontakta ne vidi in do njega ne dostopa prek REST API-ja.
5. Za ta scenarij obstajajo avtomatizirani testi, Git commit in zapis uporabe AI agenta.

## 9. Kaj izrecno ni vključeno v prvo različico

- Masovno pošiljanje e-poštnih sporočil, CRM prodajni lijaki in napredna analitika.
- Avtomatsko združevanje kontaktov brez potrditve uporabnika.
- Strojno učenje za podobnost imen ali drugih podatkov.
- Uvoz kontaktov iz Excela oziroma drugih CRM sistemov.
- Vabila neregistriranim uporabnikom in kompleksna administracija organizacij.
- Globalne (sistemske) vloge, dodatne vloge v skupini, prenos lastništva skupine in podrobne pravice za vsako polje.
- Uporaba Firebase za karkoli drugega kot avtentikacijo (podatki, pravice, gostovanje).
- Samodejna obnovitev poljubne stare verzije kontakta.
- Delo brez povezave (offline urejanje in sinhronizacija).
- Nativna mobilna aplikacija (iOS/Android) in mikrostoritvena arhitektura; mobilno uporabo pokrivata odziven vmesnik in PWA.

## 10. Zgodovina sprememb dokumenta

| Verzija | Datum | Sprememba | Kategorija |
|---|---|---|---|
| 1.0 | 2026-10-29 | Začetno izhodišče | – |
| 1.1 | 2026-10-30 | Edini AI agent je Claude Code (Codex odstranjen). Vlogi OWNER/MEMBER veljata samo znotraj skupine; OWNER je ustvarjalec, člani so dodani naknadno. Odziven vmesnik za namizne in mobilne naprave, PWA, dostopnost WCAG 2.2 AA in oblikovni jezik v `design.md`. Firebase samo za avtentikacijo; vsi ostali podatki in avtorizacija v aplikaciji. Excel integracija je izvoz, uvoz ni predviden. | human-decision |
| 1.2 | 2026-10-30 | Iz osnutka razvojnega okvira (`RAZVOJNI-OKVIR.md`, ni bil dodan v repozitorij) prevzeto: ID zahtev `FR-NNN-XX` s scenariji Given/When/Then in negativnimi različicami; testi označeni z ID zahteve; matrika izolacije za vsak endpoint; Firebase Auth Emulator in Testcontainers v testih; UI testi po vlogah in dostopnih imenih z axe ter E2E na 360/1280 px z branjem izvoza; `verify.sh` (fast/full); izbrana orodja kakovosti in gitleaks; `CLAUDE.md`; pravilo, da se testi spreminjajo samo zaradi specifikacije, in prepoved neutemeljenega utišanja opozoril; poročilo Lighthouse pred demonstracijo. Ostalo (orkestrator, subagenti, zaklepanje testov, vrata 0–3) ni prevzeto. | human-decision |

---

**Pravilo projekta:** Pomembnih odločitev in AI napak ne skrivamo oziroma ne popravljamo brez sledi. Zabeležimo, kaj je agent naredil, kaj sva spremenila in zakaj.
