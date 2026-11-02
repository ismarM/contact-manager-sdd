# Feature Specification: Ogrodje projekta

**Feature Branch**: `ogrodje` (no number; the directory is `specs/000-ogrodje/`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Ogrodje projekta: struktura backend (Spring Boot), frontend (React, TypeScript, Vite, Tailwind CSS v4 z žetoni Kartoteke, i18n sl/en, PWA ogrodje) in e2e (Playwright); Docker Compose (PostgreSQL, Firebase Auth Emulator, backend, frontend za nginx); verify.sh quick/full z zgoščenim izpisom in .verify/last.log; CI, ki požene ./verify.sh full; pre-commit z gitleaks; preverjanje utišanj; en preprost test na vsaki ravni testov; odločitev o shadcn/ui v DECISIONS.md; ročni samopreizkus verify.sh."

> **Akterji** te funkcionalnosti so razvijalca, agent (Claude Code) in CI – ne končni uporabniki aplikacije.
> Funkcionalnost **je** tehnični temelj projekta, zato zahteve izrecno imenujejo orodja iz konstitucije
> (razdelek *Tehnološki sklad in omejitve*) in `workflow.md` §3. Ogrodje ne vsebuje poslovnih funkcij in
> ne dostopa do podatkov skupin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zagon celotnega sistema z enim ukazom (Priority: P1)

Razvijalec na čisti kopiji repozitorija z enim ukazom zažene vse storitve (PostgreSQL, Firebase Auth Emulator,
backend, frontend za nginx) in v brskalniku odpre začetno stran aplikacije. Ni mu treba ročno nameščati baze,
ustvarjati pravih ključev ali urejati konfiguracije.

**Why this priority**: brez delujočega okolja ni mogoče razvijati ali testirati nobene druge funkcionalnosti
(vse so odvisne od 000).

**Independent Test**: na čisti kopiji repozitorija zaženi `docker compose up`; ko so storitve pripravljene,
začetna stran vrne vsebino ogrodja, preverjanje zdravja zaledja pa poroča »pripravljeno«.

**Acceptance Scenarios**:

1. **[FR-000-01]** **Given** čista kopija repozitorija in nameščen Docker, **When** razvijalec zažene `docker compose up`, **Then** se zaženejo PostgreSQL, Firebase Auth Emulator, backend in frontend (nginx), frontend je dosegljiv v brskalniku na dokumentiranem naslovu in zahtevki z njega na API dosežejo backend.
2. **[FR-000-02]** **Given** zagnan sistem, **When** se pokliče preverjanje zdravja zaledja brez prijave, **Then** vrne uspeh in stanje »pripravljeno« šele, ko je vzpostavljena povezava z bazo; odgovor ne razkrije notranjih podrobnosti (različic, poti, gesel).
3. **[FR-000-02]** **Given** zagnan sistem z ustavljeno bazo, **When** se pokliče preverjanje zdravja, **Then** vrne neuspeh (stanje »ni pripravljeno«).
4. **[FR-000-03]** **Given** prazna baza, **When** se backend zažene, **Then** samodejno uveljavi vse migracije sheme; ob ponovnem zagonu se že uveljavljene migracije ne izvedejo znova.
5. **[FR-000-04]** **Given** čista kopija repozitorija brez kakršnihkoli pravih ključev, **When** se sistem zažene, **Then** deluje s Firebase Auth Emulatorjem in vrednostmi iz primera konfiguracije (`.env.example` ali enakovredno), ki ne vsebuje skrivnosti.

---

### User Story 2 - En ukaz za preverjanje z zgoščenim izpisom (Priority: P1)

Razvijalec ali agent z enim ukazom požene vsa preverjanja na izbrani ravni (`quick` ali `full`). Ob uspehu dobi
eno vrstico, ob neuspehu ime koraka in kratek seznam napak; celoten izpis je v `.verify/last.log`.

**Why this priority**: konstitucija VII – vsa vrata kakovosti tečejo prek enega ukaza; zgoščen izpis
varčuje s kontekstom agenta in časom razvijalcev.

**Independent Test**: požene se `./verify.sh quick` na zelenem repozitoriju (ena vrstica, izhod 0), nato z eno
namerno napako (izhod ≠ 0, največ 20 vrstic, `.verify/last.log` vsebuje celoten izpis).

**Acceptance Scenarios**:

1. **[FR-000-05]** **Given** repozitorij brez napak, **When** se zažene `./verify.sh quick`, **Then** se izvedejo formatiranje (preverjanje, brez popravljanja), lint, preverjanje tipov, preverjanje utišanj, preverjanje popolnosti prevodov, unit testi BE in FE ter funkcionalni testi FE, izhodna koda je `0`.
2. **[FR-000-06]** **Given** repozitorij brez napak in delujoč Docker, **When** se zažene `./verify.sh full`, **Then** se izvede vse iz `quick`, nato integracijski in varnostni testi BE, zagon sistema in E2E testi pri treh širinah; izhodna koda je `0`.
3. **[FR-000-07]** **Given** katerikoli korak pade, **When** se `verify.sh` konča, **Then** je izhodna koda različna od `0`; **Given** neznan ali manjkajoč argument, **When** se zažene `./verify.sh foo`, **Then** izpiše navodilo za uporabo in vrne izhodno kodo različno od `0`.
4. **[FR-000-08]** **Given** uspešen zagon, **When** se `verify.sh` konča, **Then** izpiše natanko eno vrstico z ravnjo in trajanjem (npr. `✓ quick OK (48 s)`).
5. **[FR-000-08]** **Given** neuspešen zagon, **When** se `verify.sh` konča, **Then** izpiše ime padlega koraka in največ 20 vrstic v obliki `datoteka:vrstica  pravilo  sporočilo` oziroma imena padlih testov s kratkim razlogom; če je napak več, zadnja vrstica pove, koliko jih ni prikazanih.
6. **[FR-000-09]** **Given** kateregakoli zagona, **When** se `verify.sh` konča, **Then** je celoten izpis vseh korakov v `.verify/last.log`, ki nadomesti izpis prejšnjega zagona; mapa `.verify/` je izključena iz Gita.

---

### User Story 3 - Delujoča veriga na vsaki ravni testov (Priority: P1)

Na vsaki ravni testov obstaja en preprost test, ki dokaže, da orodja, emulator, Testcontainers, MSW in axe delujejo
in da `verify.sh` teste res poganja in poroča o njih.

**Why this priority**: vse nadaljnje funkcionalnosti pišejo teste pred kodo (konstitucija II); veriga mora
delovati, preden se nanjo zanesejo.

**Independent Test**: vsak primer testa se pojavi v `.verify/last.log` kot izveden in uspešen; ko se njegova
asercija namerno obrne, `verify.sh` pade in ga imenuje.

**Acceptance Scenarios**:

1. **[FR-000-10]** **Given** ogrodje, **When** se zažene `./verify.sh full`, **Then** se izvedejo in uspejo po en primer testa na ravneh: unit BE, integracijski BE (PostgreSQL prek Testcontainers in Firebase Auth Emulator), varnostni BE, unit FE, funkcionalni FE (RTL, MSW, `vitest-axe` brez kršitev) in E2E (Playwright z axe pri 360, 768 in 1280 px); vsak nosi FR-ID te funkcionalnosti (`@Tag` oziroma ime testa).
2. **[FR-000-10]** **Given** primer varnostnega testa, **When** se pokliče katerakoli pot API-ja razen preverjanja zdravja brez žetona, **Then** zaledje vrne `401` (privzeta zavrnitev).

---

### User Story 4 - CI kot vrata za združitev (Priority: P2)

Ob vsakem pushu in pull requestu CI požene `./verify.sh full`; združitev v `main` je mogoča samo ob zelenem rezultatu.

**Why this priority**: zagotovi, da se v `main` ne znajde nepreverjena koda, tudi če kdo lokalno pozabi na `full`.

**Independent Test**: pull request z namerno padajočim testom ima rdeč status in gumba za združitev ni mogoče
uporabiti; po popravku je status zelen.

**Acceptance Scenarios**:

1. **[FR-000-11]** **Given** push na katerokoli vejo ali odprt pull request, **When** se sproži CI, **Then** požene `./verify.sh full` na čistem okolju in rezultat (uspeh/neuspeh) prikaže kot status commita; ob neuspehu je `.verify/last.log` na voljo kot priloga zagona.
2. **[FR-000-11]** **Given** pull request z rdečim statusom CI, **When** razvijalec poskusi združiti v `main`, **Then** združitev ni dovoljena.

---

### User Story 5 - Ogrodje vmesnika s Kartoteko, dvojezičnostjo in PWA (Priority: P2)

Frontend izriše začasno začetno stran (besedni znak *Kontakti*) samo z žetoni Kartoteke, z lokalno gostovanima
pisavama, v svetli ali temni shemi po nastavitvi sistema, z infrastrukturo za preklop jezika sl/en in kot namestljiva PWA.

**Why this priority**: vse strani naslednjih funkcionalnosti gradijo na teh temeljih (konstitucija IV, design.md 13).

**Independent Test**: odpri začetno stran pri 360, 768 in 1280 px v svetli in temni shemi sistema; axe nima kršitev,
ni zahtevkov na tuje strežnike, brskalnik ponudi namestitev; FE test preklopi jezik in preveri besedila in `lang`.

**Acceptance Scenarios**:

1. **[FR-000-12]** **Given** zagnan frontend, **When** se naloži začetna stran, **Then** uporablja samo barve, pisave, zaobljenosti in senco iz `design.md` (4.1, 5, 6), privzeta paleta in sence Tailwinda niso na voljo (razred privzete palete, npr. `bg-zinc-500`, ne ustvari sloga), stran nima vodoravnega drsenja pri 320 px in axe ne najde kršitev.
2. **[FR-000-12]** **Given** nalaganje začetne strani, **When** se spremljajo omrežni zahtevki, **Then** so vse pisave in drugi viri naloženi z istega izvora; ni zahtevkov na tuje CDN-je ali Google Fonts.
3. **[FR-000-13]** **Given** sistemska nastavitev temne sheme, **When** se naloži stran, **Then** so uporabljene temne vrednosti žetonov; ob svetli shemi svetle; atribut `data-theme="light|dark"` na `<html>` (design.md 4.3) shemo preglasi.
4. **[FR-000-14]** **Given** brskalnik z jezikom `sl-SI`, **When** se naloži stran, **Then** so besedila v slovenščini in `<html lang="sl">`; **Given** jezik `de`, **Then** v angleščini in `<html lang="en">`.
5. **[FR-000-14]** **Given** naložena stran, **When** se jezik preklopi prek i18n infrastrukture, **Then** se besedila in `<html lang>` zamenjajo brez ponovnega nalaganja strani.
6. **[FR-000-14]** **Given** ključ prevoda, ki obstaja samo v enem jeziku, **When** se zažene `./verify.sh quick`, **Then** pade in imenuje manjkajoči ključ in jezik.
7. **[FR-000-15]** **Given** zagnan frontend, **When** ga odpre brskalnik, ki podpira PWA, **Then** je aplikacija namestljiva z imenom, barvami in ikonami po `design.md` 12.
8. **[FR-000-15]** **Given** enkrat naložena aplikacija, **When** je povezava prekinjena in se stran osveži, **Then** se ogrodje (HTML, CSS, JS, pisavi, ikone) naloži iz predpomnilnika, odgovori API-ja pa niso nikoli predpomnjeni.

---

### User Story 6 - Odločitve in ročni samopreizkus (Priority: P2)

Razvijalca v `DECISIONS.md` zapišeta, katera orodja in knjižnice uvaja ogrodje in za katere vzorce se uporabi
shadcn/ui, ter ročno preverita, da `verify.sh` pade ob vsaki namerni napaki iz `workflow.md` §3.6.

**Why this priority**: brez samopreizkusa ni dokaza, da vrata res ustavijo napake (lažno zelen `verify.sh` je
hujši od nobenega).

**Independent Test**: pregled `DECISIONS.md`: vnos o shadcn/ui pokriva vsak vzorec iz `design.md` 13.4; vnos o
samopreizkusu navaja vseh 10 primerov z izidom.

**Acceptance Scenarios**:

1. **[FR-000-16]** **Given** zaključeno ogrodje, **When** razvijalca pregledata `DECISIONS.md`, **Then** ta vsebuje vnos z izbiro *nativni element* ali *shadcn/ui* za vsak vzorec iz tabele `design.md` 13.4 (brez mešanja) in vnose za vsa orodja in knjižnice, ki jih uvaja ogrodje.
2. **[FR-000-17]** **Given** ogrodje, **When** razvijalca drug za drugim uvedeta vsako namerno napako iz `workflow.md` §3.6, **Then** `verify.sh` pri vsaki pade z izpisom največ 20 vrstic, ki imenuje napako (gitleaks prepreči commit), izid vseh primerov pa je zapisan v `DECISIONS.md`.

---

### User Story 7 - Prepoved utišanja opozoril brez odobritve (Priority: P3)

`verify.sh quick` pade, če koda vsebuje utišanje opozoril brez veljavnega sklica na odobren vnos v `DECISIONS.md`.

**Why this priority**: agent bi sicer lahko napake »popravil« z utišanjem; pomembno, a se pokaže šele z rastjo kode.

**Independent Test**: dodaj `// eslint-disable-next-line` brez sklica → `quick` pade; dodaj sklic na obstoječ vnos
vrste `utišanje` → `quick` uspe.

**Acceptance Scenarios**:

1. **[FR-000-18]** **Given** datoteka z `@SuppressWarnings`, `eslint-disable*`, `@ts-ignore`, `@ts-expect-error` ali tipom `any` brez komentarja s sklicem `DECISIONS D-NN`, **When** se zažene `./verify.sh quick`, **Then** pade z izpisom `datoteka:vrstica` in vrste utišanja.
2. **[FR-000-18]** **Given** sklic `DECISIONS D-NN`, kjer vnos `D-NN` ne obstaja ali ni vrste `utišanje`, **When** se zažene `./verify.sh quick`, **Then** pade in navede neveljaven sklic.
3. **[FR-000-18]** **Given** utišanje s sklicem na obstoječ vnos vrste `utišanje`, **When** se zažene `./verify.sh quick`, **Then** preverjanje utišanj uspe.

---

### User Story 8 - Skrivnosti ne pridejo v Git (Priority: P3)

Pre-commit kavelj z gitleaks prepreči commit, ki v staged datotekah vsebuje skrivnost.

**Why this priority**: konstitucija VI; dokler ni pravih ključev, je tveganje majhno, a kavelj mora obstajati pred
prvim pravim ključem.

**Independent Test**: v staged datoteko dodaj lažen zasebni ključ in poskusi commit.

**Acceptance Scenarios**:

1. **[FR-000-19]** **Given** nameščen kavelj in staged datoteka z lažno skrivnostjo (npr. zasebni ključ ali žeton v znani obliki), **When** razvijalec poskusi commit, **Then** commit ni ustvarjen, izpis pa navede datoteko, vrstico in vrsto skrivnosti (brez izpisa cele vrednosti).
2. **[FR-000-19]** **Given** čista kopija repozitorija, **When** razvijalec zažene en dokumentiran ukaz za namestitev kavljev, **Then** je kavelj aktiven za vse nadaljnje commite.

---

### Negative Scenarios *(mandatory when the feature touches group data)*

Funkcionalnost ne dostopa do podatkov skupin. Negativni scenariji so zato zapisani kot **stanje, ki ne ustreza
pravilom → pričakovan rezultat preverjanja** (stolpec *Actor / state* opisuje napačno stanje, *Action* ukaz).

| FR-ID | Actor / state | Action | Expected result |
|---|---|---|---|
| FR-000-01 | Docker ni zagnan ali je vrata zasedla druga storitev | `docker compose up` | zagon se ustavi z razumljivim sporočilom o vzroku; nobena storitev ne poroča »pripravljeno« |
| FR-000-02 | baza ni dosegljiva | preverjanje zdravja | neuspeh (»ni pripravljeno«), brez notranjih podrobnosti |
| FR-000-03 | migracija z napako | zagon backenda | backend se ne zažene, preverjanje zdravja ne poroča »pripravljeno«, shema ostane v zadnjem veljavnem stanju |
| FR-000-04, FR-000-19 | prava skrivnost ali ključ v datoteki, ki je pod Gitom | commit | gitleaks commit prepreči |
| FR-000-05 | napačno formatirana datoteka BE ali FE | `./verify.sh quick` | izhod ≠ 0, korak *format*, `datoteka:vrstica` |
| FR-000-05 | kršitev ESLint `jsx-a11y` (npr. slika brez `alt`) | `./verify.sh quick` | izhod ≠ 0, korak *lint*, pravilo in `datoteka:vrstica` |
| FR-000-05 | napaka tipov v TS | `./verify.sh quick` | izhod ≠ 0, korak *tipi*, `datoteka:vrstica` |
| FR-000-05, FR-000-10 | padajoč unit test BE ali FE | `./verify.sh quick` | izhod ≠ 0, ime testa in kratek razlog |
| FR-000-05, FR-000-10 | FE test s kršitvijo axe | `./verify.sh quick` | izhod ≠ 0, ime testa in pravilo axe |
| FR-000-06, FR-000-10 | padajoč integracijski test (Testcontainers + emulator) | `./verify.sh full` | izhod ≠ 0, ime testa; `quick` tega testa ne poganja |
| FR-000-06 | Docker ni na voljo | `./verify.sh full` | izhod ≠ 0, sporočilo, da `full` potrebuje Docker; ne poroča lažnega uspeha |
| FR-000-06, FR-000-10 | padajoč E2E test pri eni od širin | `./verify.sh full` | izhod ≠ 0, ime testa in širina |
| FR-000-07 | manjka orodje (npr. Java ali Node) | `./verify.sh quick` | izhod ≠ 0, ime manjkajočega orodja |
| FR-000-07 | neznan ali manjkajoč argument | `./verify.sh foo` | izhod ≠ 0, navodilo za uporabo |
| FR-000-08 | več kot 20 napak | `./verify.sh quick` | izpis največ 20 vrstic, zadnja pove število neprikazanih napak |
| FR-000-10 | zahtevek na API brez žetona (razen zdravja) | klic API | `401`, nič se ne spremeni |
| FR-000-11 | pull request z rdečim CI | združitev v `main` | zavrnjena |
| FR-000-12 | barva zunaj žetonov (privzeta paleta, arbitrarna barva `bg-[#…]`) | `./verify.sh quick` | izhod ≠ 0 (lint ali gradnja) oziroma razred ne ustvari sloga |
| FR-000-14 | ključ prevoda samo v enem jeziku | `./verify.sh quick` | izhod ≠ 0, ključ in manjkajoči jezik |
| FR-000-15 | aplikacija brez povezave | zahtevek na API | ni odgovora iz predpomnilnika; zahtevek ne uspe |
| FR-000-18 | `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@SuppressWarnings` ali `any` brez sklica | `./verify.sh quick` | izhod ≠ 0, `datoteka:vrstica` in vrsta utišanja |
| FR-000-18 | sklic na neobstoječ `D-NN` ali vnos, ki ni vrste `utišanje` | `./verify.sh quick` | izhod ≠ 0, neveljaven sklic |
| FR-000-19 | lažna skrivnost v staged datoteki | `git commit` | commit ni ustvarjen |

### Edge Cases

- `verify.sh` zagnan iz podmape: deluje enako kot iz korena repozitorija (sam najde koren).
- Zagon na Windows prek Git Bash: skripte imajo konce vrstic LF ne glede na nastavitev Gita (`.gitattributes`), sicer bi padle z nerazumljivo napako.
- Emulator ali baza se v `full` ne zaženeta v razumnem času: korak pade po časovni omejitvi z imenom storitve, ne visi neomejeno.
- Po `full` storitve, ki jih je zagnal `verify.sh`, ostanejo ustavljene oziroma počiščene, tudi ob neuspehu; drugi zagon ne pade zaradi ostankov prvega.
- Dva zaporedna zagona: `.verify/last.log` vsebuje samo izpis zadnjega.
- Beseda `any` v komentarju, nizu ali imenu (npr. `company`) ni utišanje; šteje samo uporaba tipa `any`.
- Lažno pozitiven zadetek gitleaks: izjema se doda samo v nastavitve gitleaks z vnosom v `DECISIONS.md`, ne z obvodom kavlja.
- Commit z `--no-verify` obide lokalni kavelj; CI skrivnosti ne preverja ponovno – sprejeto tveganje (Assumptions).
- Nova različica service workerja: ob naslednjem obisku nadomesti staro ogrodje; uporabnik ne ostane trajno na zastareli različici.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-000-01**: Sistem MORA imeti repozitorij razdeljen na `backend/` (Spring Boot, Java 21), `frontend/` (React, TypeScript strict, Vite, Tailwind CSS v4) in `e2e/` (Playwright) ter se MORA z enim ukazom (`docker compose up`) zagnati v celoti: PostgreSQL, Firebase Auth Emulator, backend in frontend, ki ga streže nginx in ki zahtevke na API posreduje backendu. *(najnižja vloga: —; akterji so razvijalci)*
- **FR-000-02**: Backend MORA ponujati javno preverjanje zdravja, ki vrne uspeh in stanje »pripravljeno« samo, ko je dosegljiva baza, in ne razkrije notranjih podrobnosti; Docker Compose in `verify.sh` ga uporabljata za čakanje na pripravljenost. *(najnižja vloga: javno)*
- **FR-000-03**: Backend MORA shemo baze upravljati z različicami migracij, ki se ob zagonu samodejno uveljavijo nad prazno ali starejšo bazo; neuspešna migracija prepreči zagon.
- **FR-000-04**: Sistem MORA v razvoju, testih in CI delovati brez pravih ključev zunanjih storitev (Firebase Auth Emulator z demo projektom); konfiguracija je prek okoljskih spremenljivk, repozitorij vsebuje samo primer konfiguracije brez skrivnosti.
- **FR-000-05**: `./verify.sh quick` MORA zaporedno izvesti: preverjanje formatiranja (Spotless, Prettier s `prettier-plugin-tailwindcss`; samo preverjanje), lint (ESLint z `jsx-a11y`), preverjanje tipov (`tsc --noEmit`, strict), preverjanje utišanj (FR-000-18), preverjanje popolnosti prevodov (FR-000-14), unit teste BE (JUnit 5) in FE (Vitest) ter funkcionalne teste FE (React Testing Library, MSW, `vitest-axe`).
- **FR-000-06**: `./verify.sh full` MORA izvesti vse korake `quick`, nato integracijske teste BE (Testcontainers, Firebase Auth Emulator), varnostne teste BE (matrika izolacije), zagnati sistem prek Docker Compose in izvesti E2E teste (Playwright, `@axe-core/playwright` s pravili WCAG 2.1 A in AA, širine 360, 768 in 1280 px).
- **FR-000-07**: `verify.sh` MORA vrniti izhodno kodo `0` samo, če so uspeli vsi koraki izbrane ravni, sicer kodo različno od `0`; neznan ali manjkajoč argument in manjkajoče orodje MORATA vrniti kodo različno od `0` z navodilom oziroma imenom manjkajočega orodja.
- **FR-000-08**: `verify.sh` MORA ob uspehu izpisati natanko eno vrstico z ravnjo in trajanjem, ob neuspehu pa ime padlega koraka in največ 20 vrstic (`datoteka:vrstica  pravilo  sporočilo` oziroma ime padlega testa s kratkim razlogom; zadnja vrstica pove število neprikazanih napak, če jih je več).
- **FR-000-09**: `verify.sh` MORA celoten izpis vsakega zagona zapisati v `.verify/last.log` (nadomesti prejšnjega); `.verify/` MORA biti izključena iz Gita.
- **FR-000-10**: Ogrodje MORA vsebovati po en preprost, uspešen test na vsaki ravni – unit BE, integracijski BE, varnostni BE (zahtevek na katerokoli pot API-ja razen preverjanja zdravja brez žetona vrne `401`), unit FE, funkcionalni FE (z `vitest-axe`), E2E (z axe pri treh širinah) –, vsak označen s FR-ID te funkcionalnosti (JUnit `@Tag`, Vitest/Playwright v imenu testa), in backend MORA privzeto zavrniti vsak zahtevek na API brez žetona z `401`. *(najnižja vloga: —)*
- **FR-000-11**: CI (GitHub Actions) MORA ob vsakem pushu in pull requestu na čistem okolju pognati `./verify.sh full`, rezultat prikazati kot status commita in ob neuspehu priložiti `.verify/last.log`; združitev v `main` MORA biti dovoljena samo ob zelenem statusu.
- **FR-000-12**: Frontend MORA izrisati začasno začetno stran (besedni znak *Kontakti*, design.md 13.5), oblikovano izključno z žetoni Kartoteke iz `design.md` 13.2 (privzeta paleta in sence Tailwinda izključene, arbitrarne barve prepovedane) in s pisavama Atkinson Hyperlegible Next in Mono, gostovanima na istem izvoru (design.md 5); stran ne sme nalagati virov s tujih strežnikov, nima vodoravnega drsenja od 320 px naprej in je brez kršitev axe. *(najnižja vloga: javno)*
- **FR-000-13**: Frontend MORA barvno shemo privzeto prevzeti od sistema (`color-scheme: light dark`, `light-dark()`) in podpirati preglasitev z atributom `data-theme="light|dark"` na `<html>`, ki ga nastavi vrinjen skript pred izrisom (design.md 4.3); upoštevati MORA `prefers-reduced-motion` in način vsiljenih barv.
- **FR-000-14**: Frontend MORA imeti i18n infrastrukturo za slovenščino in angleščino: vsa besedila (tudi dostopna imena) prek ključev; privzeti jezik po jeziku brskalnika (`sl` → slovenščina, sicer angleščina); preklop jezika med delovanjem brez ponovnega nalaganja, ki posodobi tudi `<html lang>`; `verify.sh quick` MORA pasti, če ključ ne obstaja v obeh jezikih.
- **FR-000-15**: Frontend MORA biti namestljiva PWA z identiteto po `design.md` 12 (ime, `standalone`, barve, ikone 192, 512 in *maskable*); service worker MORA predpomniti samo ogrodje (HTML, CSS, JS, pisavi, ikone) in NE SME predpomniti odgovorov API-ja.
- **FR-000-16**: `DECISIONS.md` MORA vsebovati vnos z odločitvijo o shadcn/ui, ki za vsak vzorec iz tabele `design.md` 13.4 izbere natanko en način (nativni element ali shadcn/ui), in vnose za vsa orodja in knjižnice, ki jih uvaja ogrodje; če se shadcn/ui uporabi, MORA biti nameščen po `design.md` 13.4 (komponente v `frontend/src/shared/ui/`, prilagoditve 1–8).
- **FR-000-17**: Razvijalca MORATA opraviti ročni samopreizkus po `workflow.md` §3.6 (10 namernih napak: formatiranje BE, formatiranje FE, `jsx-a11y`, tipi TS, unit test BE, unit test FE, axe v FE testu, integracijski test, neodobren `eslint-disable`, lažna skrivnost) in izid vsakega primera zapisati v `DECISIONS.md`; samopreizkus se ponovi ob vsaki večji spremembi `verify.sh`.
- **FR-000-18**: `verify.sh quick` MORA pasti ob vsakem `@SuppressWarnings`, `eslint-disable*`, `@ts-ignore`, `@ts-expect-error` ali uporabi tipa `any`, ki nima v isti ali predhodni vrstici komentarja s sklicem `DECISIONS D-NN` na obstoječ vnos vrste `utišanje` v `DECISIONS.md`.
- **FR-000-19**: Repozitorij MORA vsebovati pre-commit kavelj z gitleaks, ki prepreči commit s skrivnostjo v staged datotekah, in en dokumentiran ukaz, ki kavelj namesti na čisti kopiji.

### Key Entities *(include if feature involves data)*

- **Raven preverjanja**: `quick` ali `full`; urejen seznam korakov, izhodna koda, trajanje.
- **Korak preverjanja**: ime (npr. *format*, *lint*, *tipi*, *utišanja*, *prevodi*, *unit BE*, *integracijski*, *E2E*), izid, seznam napak (`datoteka:vrstica`, pravilo, sporočilo).
- **Zapis zadnjega zagona** (`.verify/last.log`): celoten izpis vseh korakov zadnjega zagona.
- **Vnos v `DECISIONS.md`**: `D-NN`, datum, avtor, vrsta (`odločitev`, `sprememba-testa`, `utišanje`, `sprememba-specifikacije`), utemeljitev; vnos vrste `utišanje` je pogoj za veljaven sklic v kodi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na čisti kopiji repozitorija je sistem z **enim ukazom** pripravljen (vse štiri storitve, preverjanje zdravja »pripravljeno«) v največ 10 minutah ob prvem zagonu (vključno z gradnjo) in v največ 2 minutah ob ponovnem zagonu.
- **SC-002**: Na čisti kopiji repozitorija `./verify.sh full` z **enim ukazom** uspe (izhod `0`) – lokalno in v CI.
- **SC-003**: `./verify.sh quick` se na razvijalskem računalniku z nameščenimi odvisnostmi izvede v največ 3 minutah.
- **SC-004**: Ob uspehu `verify.sh` izpiše natanko 1 vrstico; v vseh 10 primerih samopreizkusa (FR-000-17) pade z izhodom ≠ 0 in izpisom največ 20 vrstic, ki imenuje napako (gitleaks prepreči commit).
- **SC-005**: 100 % pushov in pull requestov ima status CI; 0 združitev v `main` z rdečim statusom.
- **SC-006**: Začetna stran pri 360, 768 in 1280 px v svetli in temni shemi: 0 kršitev axe, 0 zahtevkov na tuje izvore, 0 vodoravnega drsenja pri 320 px.
- **SC-007**: 100 % ključev prevodov obstaja v obeh jezikih (preverja `quick`).
- **SC-008**: Po enem obisku se ogrodje aplikacije brez povezave naloži v 100 % poskusov, 0 odgovorov API-ja je v predpomnilniku.

## Assumptions

- Funkcionalnost 000 nima odvisnosti in je pogoj za vse ostale (`feature-map.md` §1).
- Akterji so razvijalca, agent in CI; končnih uporabnikov in podatkov skupin ni, zato negativni scenariji opisujejo stanja, ob katerih mora preverjanje pasti.
- Preverjanje zdravja je javna pot zaledja (natančno pot določi `plan.md`); je edina izjema od privzete zavrnitve z `401` (FR-000-10). Preverjanje veljavnosti žetonov Firebase (neveljaven, potekel), registracijo in profil uporabnika določa **001-prijava**.
- Začetna stran ogrodja je začasna; ogrodje aplikacije (zgornja vrstica, meni računa, *Preskoči na vsebino*), stran *Te strani ni*, izbira jezika in teme v *Mojem računu* in njuno shranjevanje so v **001-prijava**. Ogrodje zagotovi le infrastrukturo (i18n, `data-theme`, žetoni).
- Pravilo zaščite veje `main` (obvezen zelen status) razvijalca nastavita ročno v nastavitvah repozitorija GitHub; CI sam tega ne more vsiliti.
- Gitleaks teče samo v pre-commit kavlju (konstitucija VI, `workflow.md` §3.3); ponovnega pregleda skrivnosti v CI ogrodje ne zahteva.
- Prepoved arbitrarnih barv in razreda `dark:` v lastni kodi (design.md 13.1) se preverja z lintom ali gradnjo; konkretno pravilo izbere `plan.md`.
- Ciljni časi (SC-001, SC-003) veljajo za običajen razvijalski prenosnik (4+ jedra, 16 GB RAM, SSD) z že prenesenimi odvisnostmi oziroma slikami, kjer je navedeno.
- Natančna razporeditev map znotraj `backend/`, `frontend/` in `e2e/`, imena slik in vrata določi `plan.md`.

## Changes *(living spec – change requests)*

| CR | Date | Affected FR-IDs | Summary | DECISIONS |
|---|---|---|---|---|
| – | – | – | Ni sprememb | – |
