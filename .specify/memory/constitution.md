# Contact Manager – pravila projekta

Contact Manager je večnajemniški sistem za vodenje kontaktov v skupinah. Ta dokument je **edini
dokument s pravili**: načela, potek dela, pravila testov in preverjanja. Dopolnjujeta ga
[`feature-map.md`](feature-map.md) (skupna pravila izdelka: vloge, vrstni red preverjanj, kode
napak, slovar podatkov) in [`design.md`](design.md) (videz in vedenje vmesnika).

Projekt se razvija po metodi Spec-Driven Development z **GitHub Spec Kit**: funkcionalnost gre skozi
cikel `specify → clarify → plan → tasks → analyze → implement → converge` (§2). Prva različica
(funkcionalnosti 000–012) je zaključena; od tu naprej je cikel **vitek**: brez vrat pred kodo, brez
dnevnika sprememb testov in brez dokumentov, ki jih Spec Kit sam ne pozna.

## 1. Načela

### I. Specifikacija vodi delo, koda in testi ga dokazujejo

- Vsaka funkcionalnost ima mapo `specs/NNN-ime/` z artefakti Spec Kit. `spec.md` določa *kaj* in
  *zakaj*, `plan.md` javne vmesnike (endpointi, poti) in podatkovni model, `tasks.md` delo.
- Zahteve imajo ID `FR-NNN-XX` in vsaj en scenarij *Given/When/Then*; zahteve nad podatki skupine
  imajo negativne scenarije (neprijavljen, nečlan, nezadostna vloga, arhivirana skupina).
- Kadar se specifikacija in koda v `main` razhajata, velja vedenje, ki ga varujejo testi; razhajanje
  se odpravi v naslednjem PR, ki se funkcionalnosti dotakne (`/speckit-converge` ga pokaže).
- Skupna pravila, ki veljajo čez več funkcionalnosti, so v `feature-map.md` in se posodobijo v istem
  PR kot koda, ki jih spremeni.
- Agent ne ugiba pri odločitvah, ki spremenijo vedenje za uporabnika, varnost ali podatkovni model
  in jih specifikacija ne določa: vpraša (§2.4).

### II. Testi so obvezni

- Vsaka sprememba vedenja ima teste na ravni, kjer je napaka najceneje ulovljena (unit,
  integracijski, FE, E2E). Testi se pišejo **skupaj s kodo**, v istem commitu ali PR; vrstni red
  (najprej test ali najprej koda) izbere avtor.
- Test preverja vedenje (statusna koda, telo, koda napake, vidno besedilo, stanje v bazi), ne
  podrobnosti izvedbe. Brez praznih ali vedno resničnih asercij.
- **Asercije se ne oslabi zato, da bi prestala napačna koda.** Test se spremeni, kadar se spremeni
  zahtevano vedenje ali vmesnik (besedilo, postavitev, navigacija) ali kadar je test sam napačen
  ali nestabilen; razlog je v opisu commita ali PR. Obvodi v produkcijski kodi, ki služijo le
  prestajanju testa, so prepovedani.
- Brez pravih zunanjih storitev: Firebase Auth Emulator, PostgreSQL prek Testcontainers, MSW v FE.
- Podrobna pravila testov so v §3.

### III. Izolacija skupin in vloge

- Zaledje je dostopno samo prek zavarovanega REST vmesnika. Firebase Authentication (ponudnik
  Google) zagotavlja **samo identiteto**; avtorizacija je lastna, po vlogah v skupini
  `VIEWER < EDITOR < ADMIN < OWNER`, in se vedno preverja na zaledju.
- Kontakti, revizijska sled in člani so strogo izolirani med skupinami.
- Matrika izolacije: neprijavljen `401`; nečlan `404` (obstoj skupine ali vira se ne razkrije);
  član z vlogo pod najnižjo dovoljeno `403`; najnižja dovoljena vloga in višje `2xx`.
- Pisanje v arhivirani skupini se zavrne z `409 GROUP_ARCHIVED`; vrstni red preverjanj je v
  `feature-map.md` §2.2.
- Vmesnik ne izriše akcij, ki jih vloga ali stanje skupine ne dovoljujeta – to je udobje, ne zaščita.

### IV. Dostopen, dvojezičen, odziven vmesnik

- WCAG 2.1 AA je pogoj za zaključek vsake spremembe vmesnika (tipkovnica, bralnik zaslona,
  kontrast, način vsiljenih barv, povečava do 400 %).
- Vsa besedila, tudi dostopna imena in sporočila napak, so v slovenščini in angleščini prek i18n.
- Vmesnik je odziven od 320 px naprej in deluje kot nameščena PWA (predpomni se samo ogrodje,
  ne podatki API).
- Videz in vedenje sledita `design.md`; barve, pisave, zaobljenosti in sence so samo žetoni.
- Vsak uspeh in neuspeh je uporabniku viden; nevarne operacije zahtevajo potrditev.
- Neobstoječa pot ali nedostopen vir prikaže stran »Te strani ni«.

### V. Celovitost podatkov

- Urejanje kontaktov, članstev in podatkov skupine uporablja optimistično zaklepanje: zastarela
  sprememba se zavrne (`409 VERSION_CONFLICT`) in nič se ne prepiše tiho.
- Množične operacije so atomarne – uspejo v celoti ali se nič ne spremeni.
- Vsaka sprememba kontaktov skupine se zabeleži v revizijski sledi skupine z izvajalcem, časom ter
  stanjem prej in potem.
- Vsi seznami so paginirani.

### VI. Zasebnost in GDPR

- Uporabnik lahko izvozi svoje podatke (JSON) in izbriše račun; posledice izbrisa so opisane v
  `feature-map.md` §2.4–2.5 in izbrisan uporabnik je povsod prikazan kot »izbrisan uporabnik«.
- Hranijo se samo osebni podatki, ki jih aplikacija potrebuje (ime in e-naslov iz Google računa) in
  uporabnikovi nastavitvi: izbira jezika in teme ter *oblika zapisa* (telefon, datum, naslov); veljata
  na vseh njegovih napravah, kopija v brskalniku velja tudi pred prijavo in po odjavi. Oboje je v
  izvozu podatkov in se izbriše z računom.
- Edina izjema od prepovedi klicev na tuje storitve je kartografska storitev OpenStreetMap (Nominatim,
  Photon, ploščice; `docs/decisions/2026-11-16-kartografska-storitev-osm.md`): kliče jo samo zaledje,
  samo na izrecno zahtevo uporabnika (gumb zemljevida, samodokončanje naslova, *Razčleni naslov*),
  pošlje samo besedilo naslova brez podatkov uporabnika in kontakta, nič se ne shrani (predpomnilnik
  samo v pomnilniku, koordinate se ne hranijo) in besedilo naslova se ne beleži. Brskalnik ne kliče
  nobene tuje storitve.
- Skrivnosti niso v Gitu (gitleaks v pre-commit); pisave in drugi viri se gostijo lokalno, brez
  klicev na tuje CDN-je.

### VII. Ena pot preverjanja

- Vsa preverjanja tečejo prek `./verify.sh` (§4), enako za razvijalca, agenta in CI. Združitev v
  `main` samo ob zelenem CI.
- Utišanje opozoril (`@SuppressWarnings`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
  `any`) in izklop testa (`.skip`, `.fixme`, `@Disabled`) sta dovoljena samo s komentarjem
  `utišanje: <razlog>` v isti ali predhodni vrstici. `.only` ni dovoljen nikoli.

## 2. Potek dela

### 2.1 Velikost spremembe določa postopek

| Velikost | Primeri | Postopek |
|---|---|---|
| **Majhna** | popravek napake, sprememba besedila ali videza, manjša dopolnitev obstoječega zaslona ali endpointa | veja → koda in testi → `./verify.sh quick` → PR. Brez artefaktov Spec Kit; če sprememba spremeni zahtevo iz obstoječega `spec.md`, se ta popravi v istem PR. |
| **Funkcionalnost** | nova funkcionalnost ali opazna sprememba obstoječe | celoten cikel Spec Kit (§2.3) v mapi `specs/NNN-ime/` |
| **Tvegana funkcionalnost** | avtentikacija in avtorizacija, nov tip klicatelja (npr. API ključi), migracija obstoječih podatkov, zunanje storitve, osebni podatki | celoten cikel; vprašanja o varnosti in podatkih vedno odloči razvijalec, `plan.md` se pred nalogami pokaže razvijalcu |

V dvomu izberi manjšo velikost; če se med delom izkaže, da sprememba posega v varnost ali
podatkovni model, jo povišaj.

### 2.2 Dokumenti funkcionalnosti

- Mapa je `specs/NNN-ime/` (zaporedna številka, ki jo dodeli `/speckit-specify`), veja je `ime`
  brez številke. `scripts/feature.sh ime` ustvari ali preklopi vejo in, če mapa že obstaja, nastavi
  kazalec `.specify/feature.json`.
- Nastajajo **samo artefakti Spec Kit**: `spec.md`, `checklists/requirements.md`, `plan.md`,
  `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, `tasks.md`. Predloge so v
  `.specify/templates/overrides/` (spec, plan, tasks).
- **Ne nastajajo:** `traceability.md`, `DECISIONS.md` in oznake `[CR-NN]`. Zahteva se spremeni neposredno v `spec.md`, v istem PR kot koda; zgodovino
  hrani Git.
- Artefakti so kratki: odločitve in dejstva, ki jih izvedba potrebuje. Dostopna imena elementov
  niso predpisana v `plan.md`; njihov vir so prevodi (§3.3).
- Mapa funkcionalnosti ostane v repozitoriju po združitvi. Pravila, ki veljajo širše od ene
  funkcionalnosti (nova koda napake, novo pravilo vlog, nov podatek v slovarju), se prenesejo v
  `feature-map.md`.

### 2.3 Cikel funkcionalnosti

| # | Korak | Rezultat | Pogoj za naprej |
|---|---|---|---|
| 1 | `/speckit-specify` | `spec.md` (zgodbe, FR-ID, scenariji, negativni scenariji) | – |
| 2 | `/speckit-clarify` | nejasnosti razrešene, odgovori v `spec.md` (*Clarifications*) | ni več `[NEEDS CLARIFICATION]`; **edina načrtovana točka z razvijalcem** |
| 3 | `/speckit-plan` | `plan.md` z javnimi vmesniki, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` | – |
| 4 | `/speckit-tasks` | `tasks.md`: naloge po zgodbah, testi so del vsake zgodbe | – |
| 5 | `/speckit-analyze` | poročilo o skladnosti spec/plan/tasks | agent odpravi ugotovitve CRITICAL in HIGH v artefaktih; **en krog** |
| 6 | `/speckit-implement` | koda in testi, **v enem prehodu** čez cel `tasks.md` | `./verify.sh quick` zelen, vse naloge `[x]` |
| 7 | `/speckit-converge` | primerjava kode s spec/plan/tasks; manjkajoče doda kot naloge | »Converged«; sicer ponovi 6–7, **največ dvakrat** |
| 8 | pregled | podagent `pregled-testov` nad končano razliko, svetovalno, **enkrat** | utemeljene ugotovitve odpravljene v enem krogu, preostale v opisu PR |
| 9 | pull request | opis: kaj se je spremenilo, predpostavke, spremenjeni obstoječi testi z razlogom, odprte ugotovitve | zelen CI (`quick`, `backend`, `e2e`) |

- **En prehod:** koda in testi nastajajo skupaj, zgodba za zgodbo. Ni ločene faze testov, ni
  pregleda testov pred kodo in ni ločenega commita samo s testi.
- Koraki 3–9 tečejo brez čakanja na razvijalca; agent se ustavi samo v primerih iz §2.4.
- Razvijalca pregledata PR in pri spremembah vmesnika opravita ročni preizkus dostopnosti
  (`design.md` §10). Združujeta razvijalca; izjema je samodejno uvajanje (§2.8), kjer PR ob zelenem
  CI združi nadzornik.

### 2.4 Kdaj se agent ustavi

Agent dela sam od naloge do PR. Ustavi se in vpraša samo, če:

- bi moral sprejeti odločitev o vedenju, varnosti ali podatkovnem modelu, ki je naloga ali
  `spec.md` ne določa;
- `verify.sh` pade zaradi okolja (izhod `3`: manjka orodje ali Docker), ne zaradi kode;
- bi moral narediti nekaj nepovratnega zunaj veje (združitev, brisanje vej, `push --force`) –
  razen združitve, ki jo §2.8 dovoljuje nadzorniku.

### 2.5 Uvajanje sprememb

- Majhni PR-ji, ki jih je mogoče pregledati v enem branju; ena veja na funkcionalnost ali rezino.
- Kontrolnik brez delujočega zaledja se ne objavi: element vmesnika pride v `main` skupaj s
  funkcionalnostjo, ki ga poganja.
- Sprememba, ki seže čez ves vmesnik, gre v zaporedju **temelji → ogrodje aplikacije → posamezni
  zasloni**; vsak korak je svoj PR in pusti `main` zelen. Korak, ki namenoma lomi veliko testov
  (npr. nova navigacija), se naredi enkrat in skupaj s skupnimi pomočniki za teste (§3.3).
- Razvijalca si delo razdelita po mapah (`frontend/src/features/*`, paketi zaledja), da se veje ne
  prekrivajo; delo samo na zaledju lahko teče vzporedno s spremembami vmesnika.
- Migracije baze so samo naprej (nova datoteka `V<n>__ime.sql`); obstoječe se ne spreminjajo.

### 2.6 Odločitve

- Zapiše se samo **arhitekturna odločitev**, ki je iz kode in `plan.md` ni mogoče razbrati: nova
  knjižnica ali zunanja storitev, sprememba avtentikacije, pomembna odločitev o shemi, odstop od
  teh pravil.
- Ena datoteka na odločitev v `docs/decisions/LLLL-MM-DD-kratko-ime.md` (predloga v
  `docs/decisions/README.md`). Brez skupnega številčenja, zato ni konfliktov med vejami.
- Dnevnik `DECISIONS.md` prve različice (`D-01` … `D-104`) je odstranjen in ostaja v zgodovini Gita
  (§6); dnevnika odločitev, sprememb testov in utišanj ni več.
- Vse drugo (spremembe testov, predpostavke, manjše izbire) sodi v opis commita ali PR.

### 2.7 Seje z agentom in `ai-log/`

- Ena seja za eno rezino dela. Podagenti dobijo kratek, samostojen opis naloge; ne dedujejo celotnega
  pogovora, razen ko je to nujno.
- V kontekst se nalaga samo, kar naloga potrebuje: ta dokument, po potrebi ustrezni razdelek
  `feature-map.md` ali `design.md`, in `spec.md` trenutne funkcionalnosti.
- Lokalno se poganja `quick` in prizadeti testi; `full` teče v CI.
- `ai-log/` ostaja: za vsako sejo kratek vnos v `ai-log/<ime>.md` (datum, veja, kaj je bilo
  naročeno in narejeno, težave) in vrstice s porabo v `ai-log/token-report-<ime>.md`. Številke
  izpiše `node scripts/token-report.mjs` iz dnevnikov seje (glavna seja in vsak podagent); ne
  ocenjujejo se in ne računa jih model. Vnosi v `ai-log/` se commitajo **neposredno v `main`**, nikoli
  prek ločene veje ali PR.

### 2.8 Samodejno uvajanje (`/rollout`)

Ukaz `/rollout <funkcionalnosti>` (`.claude/skills/rollout/SKILL.md`) izpelje eno ali več
funkcionalnosti od naročila do združenega PR. Zanj veljajo vsa pravila tega dokumenta in še:

- **Nadzornik** (glavna seja) ne piše kode: delavce vodi skozi cikel iz §2.3 – korak za korakom,
  tako kot sta to prej ročno počela razvijalca –, preverja dokaze, odloča o preprostih vprašanjih
  in usklajuje vrstni red. **Delavci** (podagent `izvajalec`) delajo vsak v svojem worktreeju in
  veji, eno fazo naenkrat, in vračajo kratka poročila.
- Z razvijalcem se nadzornik posvetuje **enkrat**, v koraku razjasnitve: pokaže načrt (valovi,
  vrstni red združevanja, pričakovani konflikti) in vpraša samo, kar je arhitekturno pomembno
  (vedenje za uporabnika, vloge, podatkovni model, nove odvisnosti, osebni podatki). Kasneje se
  obrne nanj le v primerih, ki jih našteva ukaz.
- Zagon ukaza je dovoljenje, da delavci potiskajo veje in odpirajo PR-je ter da nadzornik PR
  **združi, ko so vsi posli CI zeleni**. Neodvisni pregled (`pregled-testov`) zažene nadzornik;
  človeškega pregleda pred združitvijo v tem načinu ni, zato opis PR navaja sprejete predpostavke
  in neodpravljene ugotovitve. Zaščite veje se ne obide.
- Konflikte razrešijo delavci po vsaki združitvi; nadzornik pričakovane konflikte sporoči vnaprej.
- Vnos v `ai-log/` (celoten *Seja N* in vrstice porabe) napiše nadzornik po združitvi, neposredno v
  `main`; delavci v `ai-log/` ne pišejo. Vsako fazo izvede nov, kratkoživ delavec (Sonnet; Opus le
  za plan tvegane funkcionalnosti in zgodbe z avtentikacijo ali avtorizacijo).

## 3. Pravila testov

### 3.1 Matrika izolacije

Za **vsak** endpoint, ki dostopa do podatkov skupine, obstaja parametriziran varnostni test čez vse
akterje:

| Akter | Pričakovan rezultat |
|---|---|
| Neprijavljen (ni žetona, neveljaven ali potečen žeton) | `401` |
| Prijavljen, ni član skupine | `404` |
| Član z **vsako** vlogo pod najnižjo dovoljeno | `403` |
| Član z najnižjo dovoljeno vlogo in vsemi višjimi | `2xx` |
| Pisanje v arhivirani skupini | `409 GROUP_ARCHIVED` |

Endpointi, vezani na uporabnika (povabila, izvoz podatkov, izbris računa): `401` neprijavljen, `404`
za tuj vir. Endpoint skupine brez vnosa v matriki pomeni, da sprememba ni zaključena.

### 3.2 Zunanje storitve

Firebase Authentication vedno prek emulatorja, PostgreSQL vedno prek Testcontainers, v FE testih API
nadomesti MSW. Testi ne potrebujejo pravih ključev in so neodvisni od vrstnega reda izvajanja.

### 3.3 Testi vmesnika

- Elementi se iščejo z `getByRole` (z `name`) in `getByLabel`; brez CSS selektorjev, `data-testid`
  in iskanja po golem besedilu.
- Dostopna imena niso predpisana v dokumentih; njihov vir so prevodi (`frontend/src/i18n/*.json`).
  V novih in spremenjenih testih se ime ne podvaja kot niz po datotekah: zbere se v skupnem
  pomočniku (`frontend/src/test/`, `e2e/tests/support/`) ali prebere iz prevodov, da sprememba
  besedila ali postavitve pomeni en popravek. Obstoječi testi se uskladijo, ko se jih sprememba
  dotakne.
- axe brez kršitev: `vitest-axe` na vsaki izrisani strani v FE testih, `@axe-core/playwright`
  (WCAG 2.1 A in AA) na vsaki obiskani strani v E2E.
- E2E teče v celoti pri **360 in 1280 px**. Pri **768 px** tečejo dimni testi ogrodja
  (`ogrodje.spec.ts`) in testi z oznako `@w768` – oznako dobi scenarij, katerega postavitev je pri
  tej širini drugačna kot pri obeh drugih.
- Izvoz v Excel se v E2E prenese in prebere nazaj.

## 4. Preverjanje

### 4.1 Ravni `verify.sh`

| Raven | Koraki | Potrebuje |
|---|---|---|
| `./verify.sh quick` | format, lint, tipi, utišanja, prevodi, testi orodij, unit BE in FE, funkcionalni FE | JDK 21, Node |
| `./verify.sh backend` | prevajanje, integracijski in varnostni testi zaledja, test kavlja pre-commit | JDK 21, Node, Docker |
| `./verify.sh e2e` | sistem v Docker Compose in E2E (Playwright, axe) | Node, Docker |
| `./verify.sh full` | vse našteto v enem zagonu | vse |

Izhod `0` uspeh, `1` padec, `2` napačna uporaba, `3` manjka orodje. Uspeh je ena vrstica, neuspeh
največ 20 vrstic; celoten izpis zadnjega zagona je v `.verify/last.log`.

### 4.2 Kdaj kaj

- **Med delom in pred PR:** `quick` ter testi, ki jih sprememba zadeva (`backend` ob spremembi
  zaledja, `e2e` ob spremembi poteka v vmesniku – ali samo posamezen razred oziroma datoteka).
- **CI** ob vsakem pushu in pull requestu požene `quick`, `backend` in `e2e` kot tri vzporedne
  posle; ob neuspehu priloži `.verify/last.log`. Vsi trije so pogoj za združitev v `main`.
- `full` je namenjen preverjanju na čisti kopiji repozitorija in pred izdajo.

## 5. Tehnološki sklad

- **Frontend:** React, TypeScript (strict), i18n (sl/en), Vite, Tailwind CSS v4 (žetoni iz
  `design.md`, privzeta paleta in sence izključene), shadcn/ui neobvezno (po `design.md` 13.4),
  Tabler Icons, pisavi Atkinson Hyperlegible Next/Mono, PWA; streže ga nginx.
- **Backend:** Spring Boot (Java 21), REST, preverjanje Firebase ID žetonov.
- **Podatkovna baza:** PostgreSQL z migracijami.
- **Avtentikacija:** Firebase Authentication, samo ponudnik Google; registracija ob prvi prijavi.
- **Izvajanje:** Docker Compose (PostgreSQL, Firebase Auth Emulator za razvoj in teste, backend,
  frontend za nginx).
- **Orodja:** Spotless, JUnit 5, Testcontainers · Prettier, ESLint (`jsx-a11y`), Vitest, React
  Testing Library, MSW, `vitest-axe` · Playwright, `@axe-core/playwright` · gitleaks · GitHub
  Actions · GitHub Spec Kit 1.2.6 (`specify`, `clarify`, `plan`, `tasks`, `analyze`, `implement`, `converge`).

Nova knjižnica se uvede s točno različico in omembo v opisu PR; zapis v `docs/decisions/` dobi, če
gre za arhitekturno odločitev (§2.6).

## 6. Prva različica in arhiv

- Specifikacije 000–012 ostajajo v `specs/` kot zapis prve različice in vzorec za nove. Vzdržujejo
  se po §1 I: popravijo se, ko se njihova funkcionalnost spremeni.
- `DECISIONS.md`, datoteke `traceability.md` in dokument `workflow.md` so odstranjeni; ostajajo v
  zgodovini Gita (`git show 2365b23:DECISIONS.md`, `git show 2365b23:.specify/memory/workflow.md`).
- Prvotni dokumenti v `original_documentation/` so zgodovinski arhiv in se ne spreminjajo.
- Oznake v komentarjih kode in imenih testov (`FR-NNN-XX`, `SC-NNN`, `D-NN`, `R-NN`, `T0NN`) kažejo
  v `specs/NNN-ime/`. Oznake `D-NN` ter sklici na `DECISIONS.md`, `traceability.md` in `workflow.md`
  so zgodovinski in kažejo v zgodovino Gita.

## 7. Upravljanje

- Prednost pri navzkrižju: **ta dokument → `feature-map.md` in `design.md` → `spec.md` → `plan.md`
  → `tasks.md`**. Veščine Spec Kit se uporabljajo nespremenjene; kjer se razhajajo s tem dokumentom
  (npr. `analyze` samo poroča, tu pa agent ugotovitve tudi odpravi), velja ta dokument.
- Ta dokument, `feature-map.md`, `design.md`, `CLAUDE.md` in predloge v
  `.specify/templates/overrides/` se spreminjajo s pull requestom, ki ga potrdita oba razvijalca.
- `CLAUDE.md` je kratek kazalec na ta dokument (do ~25 vrstic) in se vzdržuje ročno.

**Version**: 3.2.0 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-16
