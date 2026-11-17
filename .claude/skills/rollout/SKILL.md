---
name: "rollout"
description: "Samodejno uvajanje ene ali več funkcionalnosti: nadzornik vodi delavce (podagent izvajalec, vsak v svojem worktreeju) skozi cikel Spec Kit – specify, clarify, plan, tasks, analyze, implement, converge –, se z razvijalcem posvetuje enkrat, nato vodi delo do združenih PR-jev. Uporabi, ko razvijalec naroči /rollout ali želi funkcionalnosti izpeljati samodejno oziroma vzporedno."
argument-hint: "Funkcionalnosti, ločene s podpičjem ali v alinejah (kratek opis vsake)"
user-invocable: true
disable-model-invocation: true
---

# /rollout – nadzorovano samodejno uvajanje

## Vhod

```text
$ARGUMENTS
```

Vsaka navedena funkcionalnost dobi svojega delavca. Če vhod ni jasen seznam funkcionalnosti, vprašaj
razvijalca, preden karkoli začneš.

## Tvoja vloga: nadzornik

Ti si **nadzornik**. Zagon tega ukaza je razvijalčevo dovoljenje, da delavci commitajo, potiskajo
veje in odpirajo PR-je ter da ti PR **združiš, ko je CI zelen** (konstitucija §2.8).

- **Ne pišeš kode in je ne bereš.** Delo opravijo delavci. Ti jih vodiš skozi cikel Spec Kit
  (konstitucija §2.3) tako, kot sta to prej ročno počela razvijalca: poveš, kateri korak je na
  vrsti, preveriš dokaz, da je res opravljen, in šele nato pošlješ naslednjega. Odločaš o
  preprostih vprašanjih in usklajuješ vrstni red.
- **Verjameš dokazom, ne trditvam:** obstoj datoteke, `git log`/`git diff --stat`, številka PR,
  izid CI (`gh pr checks`). Vrat `verify.sh` ne poganjaš sam – dokaz je CI.
- **Kontekst ostane majhen:** bereš samo poročila delavcev (do 15 vrstic), `--stat` in enovrstične
  izide. Razlik, dnevnikov in datotek kode ne odpiraš; če jih kdo mora prebrati, je to delavec.
  Padle posle CI bereš samo s `scripts/ci-failures.sh <run>` (ali `--pr <n>`).
- **Kratko z razvijalcem:** ob prehodu faze največ 5 vrstic (kaj je končano, dokaz, kaj sledi);
  podrobnosti ostanejo v stanju in opisu PR. Artefaktov ne bereš v celoti: plan preveriš s
  kontrolnim seznamom (korak 3, faza NAČRT).
- **Delavci so kratkoživi:** vsako fazo (pri IZVEDBI vsak paket zgodb) izvede **nov** delavec z
  navodilom po predlogi; prejšnjega ne nadaljuješ s `SendMessage`, razen da mu v isti fazi pošlješ
  popravek oblike. Kontekst nosijo artefakti v `specs/NNN-ime/` in veja – tako se kontekst
  delavcev ne kopiči (poraba je število klicev × velikost konteksta).
- **Ne ugibaš in ne napoveduješ izidov:** dokler delavec ali CI ne poroča, je faza odprta. Ne
  povprašuješ v zanki; na delavce in CI čakaš z obvestili (`run_in_background`).
- **Stanje je na disku:** `.rollout/state.md` (ni v Gitu). Posodobi ga ob vsakem prehodu faze.
  Če ob zagonu že obstaja, **nadaljuj** od tam (prekinitev zaradi omejitve porabe ali zgoščevanja
  konteksta ne sme izgubiti načrta).

Nikoli: `push --force`, potisk neposredno v `main`, združitev ob rdečem ali nedokončanem CI,
združitev mimo zaščite veje, brisanje tujih vej.

## Stanje (`.rollout/state.md`)

```markdown
# Rollout <datum> – seja <id>
Razvijalec (ai-log): <ime>
## Načrt
- vrstni red združevanja: A → B → C
- valovi: 1: A, B · 2: C (po planu A)
- dodeljeno: mape A=specs/013-…, B=specs/014-… · migracije A=V9, B=V10 · skupne datoteke: App.tsx (A, B), sl.json/en.json (vsi)
## Funkcionalnosti
| Ime | Velikost | Delavec (id) | Worktree | Veja | Mapa specs | Faza | PR | Krogi CI |
## Odločitve nadzornika
- <funkcionalnost>: <vprašanje> → <odločitev> (razlog)
## Odprta vprašanja za razvijalca
- …
```

## Potek

### 0. Sprejem

1. `git status --short` (delovno drevo mora biti čisto), `git fetch origin`, `git switch main`,
   `git pull --ff-only`.
2. **Pripravljenost okolja** (pred vsem drugim delom; kar manjka, sporoči razvijalcu takoj, ne
   sredi faze): `docker info --format "{{.ServerVersion}}"` (Docker za `backend` in E2E),
   `gh auth status`, `git config core.longpaths true` (Windows: dolge poti v worktreejih). Pri
   funkcionalnosti z več kot tremi zgodbami ali tvegani funkcionalnosti v posvetu omeni, da bo
   uvajanje dolgo in porabilo veliko žetonov.
3. `gh pr list --state open --json number,title,headRefName,files --jq '.[] | {number, title, headRefName, files: [.files[].path]}'`
   in `git branch -r` – delo sodelavca, ki se prekriva z naročenimi funkcionalnostmi, je konflikt,
   ki ga sporočiš v posvetu (korak 2).
4. Vsako funkcionalnost razvrsti po konstituciji §2.1 (majhna / funkcionalnost / tvegana) in ji
   določi ime (`[a-z][a-z0-9-]*`). Funkcionalnostim po vrsti dodeli **številke map**
   (`ls specs | tail -n 1` → naslednje proste), da jih vzporedni delavci ne izberejo enakih; delavec
   jo poda `/speckit-specify` kot `SPECIFY_FEATURE_DIRECTORY=specs/NNN-ime`. Majhna sprememba nima
   mape in preskoči fazi SPEC in NAČRT.
5. Ime razvijalca za `ai-log/<ime>.md` določi iz obstoječih datotek v `ai-log/` in
   `git config user.name`; če ni očitno, ga vprašaj v posvetu.
6. Za vsako funkcionalnost ustvari worktree in vejo, ki ju uporabljajo vsi njeni delavci:
   `git worktree add .claude/worktrees/<ime> -b <ime> main` (oziroma obstoječo vejo brez `-b`).

### 1. Analiza združljivosti

Zaženi **enega** podagenta `Explore` (samo bere; model `haiku` ali `sonnet`) z vsemi
funkcionalnostmi hkrati. Vrne naj samo tabelo, brez izpisov datotek:

- za vsako funkcionalnost: mape vmesnika (`frontend/src/features/*`), paketi zaledja, ali potrebuje
  migracijo, katere **skupne datoteke** bo verjetno spremenila (`frontend/src/app/App.tsx`,
  `frontend/src/shared/**`, `frontend/src/i18n/*.json`, `frontend/src/test/**`,
  `e2e/tests/support/**`, `.specify/memory/feature-map.md`), in odvisnosti od drugih naročenih
  funkcionalnosti;
- zadnjo številko migracije v `backend/src/main/resources/db/migration/`;
- obstoječe specifikacije (`specs/NNN-ime/`), v katere funkcionalnost posega.

Vsak par funkcionalnosti razvrsti:

| Razmerje | Pomen | Ukrep |
|---|---|---|
| neodvisni | ločene mape, brez skupnih datotek razen prevodov in `ai-log/` | vzporedno, isti val |
| skupne točke | ista skupna datoteka ali obe z migracijo | vzporedno; dodeli številke migracij in vrstni red združevanja, drugi se uskladi po prvi združitvi |
| odvisni | B potrebuje model ali endpointe A | A najprej do konca faze NAČRT, nato B začne svojo fazo NAČRT s potjo do `plan.md`, `data-model.md` in `contracts/` funkcionalnosti A; A se združi pred B |
| prekrivajoči | isti zaslon, ista tabela ali iste datoteke v jedru | **ne vzporedno**: zaporedna valova ali združitev v eno funkcionalnost |

Omejitve števila funkcionalnosti ni; število valov določi ta analiza. Prevodi (`sl.json`,
`en.json`) in `ai-log/` so vedno skupna točka – konflikt je pričakovan in ga razreši delavec v
fazi USKLADITEV.

### 2. Specifikacije in razjasnitev (edina načrtovana točka z razvijalcem)

1. Za vsako funkcionalnost zaženi delavca: orodje `Agent`, `subagent_type: "izvajalec"` (privzeto
   Sonnet), `run_in_background`, **brez** `isolation` (delavec dela v worktreeju iz koraka 0.6, pot je
   v navodilu), navodilo po predlogi spodaj, faza **SPEC**. **Model:** Sonnet za vse faze in zgodbe;
   `model: "opus"` samo za NAČRT tvegane funkcionalnosti in za zgodbe IZVEDBE, ki uvajajo
   avtentikacijo, avtorizacijo ali nov tip klicatelja (zgodbo navedeš v stanju). Zunanja storitev,
   nova knjižnica ali obsežna zgodba sami po sebi **niso** razlog za Opus (Opus hitreje doseže
   5-urno omejitev porabe in prekine delavca sredi zgodbe). Vse delavce zaženi v enem koraku – tudi tiste iz
   kasnejših valov, ker specifikacija ne potrebuje plana predhodnice.
2. Ko poročila prispejo, preveri dokaz (`git -C <worktree> log --oneline -2`, obstoj
   `specs/NNN-ime/spec.md`) in **razvrsti vprašanja** razjasnitve (spodaj).
3. **Posvet:** razvijalcu v enem sporočilu pokaži
   - načrt: valovi, vrstni red združevanja, dodeljene številke map in migracij;
   - pričakovane konflikte (med funkcionalnostmi in z odprtim delom sodelavca) in kako bodo rešeni;
   - odločitve, ki si jih sprejel sam (ena vrstica vsaka);
   - vprašanja, ki jih mora odločiti on – z `AskUserQuestion` (do 4 na klic; več klicev, če je treba),
     vsako s tvojim priporočilom kot prvo možnostjo.
4. Odgovore (svoje in razvijalčeve) zapiši v stanje; delavec jih dobi z naslednjo fazo in jih vpiše
   v `spec.md`. Od tu naprej razvijalca ne sprašuješ, razen v primerih iz razdelka *Kdaj se obrneš
   na razvijalca*.

### 3. Cikel do združitve (za vsako funkcionalnost; funkcionalnosti istega vala vzporedno)

Vsako fazo (pri IZVEDBI vsak paket zgodb) izvede **nov** delavec v istem worktreeju in veji (glej
*Delavci so kratkoživi*). Vsaka vrstica je ena faza; naslednje **ne** pošlješ, dokler vrata
niso izpolnjena.

| Faza | Koraki Spec Kit | Vrata, preden greš naprej |
|---|---|---|
| **NAČRT** (delavec) | odgovori razjasnitve v `spec.md` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` z enim krogom popravkov | v mapi obstajata `plan.md` in `tasks.md`; `grep -c "NEEDS CLARIFICATION" spec.md` je 0; poročilo navaja izid analize brez odprtih CRITICAL. Kontrolni seznam nadzornika (z `grep`, brez branja celote): `plan.md` ima tabele *Public Interfaces*; `tasks.md` ima za vsako vrstico teh tabel nalogo testa matrike izolacije (predloga nalog); `data-model.md` navede migracijo; nove odvisnosti imajo različico in zapis v `docs/decisions/`; zgodbe v `tasks.md` so ločene faze; **združljivost testnih podatkov**: če funkcionalnost zaostri preverjanje ali spremeni kanonično obliko obstoječih podatkov (npr. telefon, naslov, obvezno polje), ima Foundational nalogo, ki z `grep` najde in posodobi fixture zaledja, pomočnike in podatke E2E (`e2e/tests/support/**`, `e2e/tests/*.spec.ts`) ter pričakovane vrednosti obstoječih testov – v eni nalogi, ne po zgodbah. Pri **tvegani** funkcionalnosti povzetek javnih vmesnikov in podatkovnega modela iz poročila pokaži razvijalcu, preden pošlješ IZVEDBO |
| **IZVEDBA** (nov delavec za vsak paket zgodb: Setup + Foundational, US1, US2 … – glej *Paketi zgodb*) | `/speckit-implement` za naloge paketa → `./verify.sh quick` in **ciljani** IT zaledja (`./mvnw -q -B verify -Dit.test=<razredi>`: novi in spremenjeni `*IT`/`*SecurityIT` ter IT paketov, ki jih paket spremeni); commit po zgodbi | poročilo z `✓ quick OK` in izidom ciljanih IT; naloge paketa `[x]`; `git -C <worktree> status --short` prazen. Naslednji paket pošlješ šele po vratih prejšnjega |
| **KONVERGENCA** (nov delavec) | `/speckit-converge` (največ dve ponovitvi) → na koncu **celoten** `./verify.sh backend` (prvi celoten tek po izvedbi) | poročilo z izidom converge in `✓ backend OK`; `grep -c "^- \[ \]" tasks.md` je 0; `git -C <worktree> status --short` prazen; `git -C <worktree> diff main...HEAD --stat \| tail -n 1` kaže spremembe v pričakovanih mapah |
| **Pregled** (ti) | svež podagent `pregled-testov` (`model: "sonnet"`) z vejo in mapo `specs/NNN-ime/` | zažene se **enkrat**; ugotovitve posreduješ delavcu dobesedno |
| **POPRAVKI** (delavec) | odprava utemeljenih ugotovitev | poročilo KONČANO; neodpravljene ugotovitve so naštete (gredo v opis PR) |
| **PR** (nov delavec) | uskladitev z `main` (merge `origin/main`, preverba številke migracije) → `quick` na združeni kodi; `backend` znova le, če je merge prinesel spremembe ali so POPRAVKI spremenili zaledje → lokalni E2E: **celoten** `./verify.sh e2e`, kadar funkcionalnost spremeni skupne datoteke (`frontend/src/shared/**`, `frontend/src/app/**`, obrazec kontakta, `e2e/tests/support/**`) ali preverjanje oziroma prikaz obstoječih podatkov; sicer datoteke E2E funkcionalnosti (w360, w1280) → `feature-map.md` → `push`, `gh pr create`; **brez** `ai-log/` | številka PR; `gh pr view <n> --json state,mergeable,headRefName` |
| **CI** (ti) | `gh pr checks <n> --watch` v ozadju (brez `--fail-fast`, da se počaka konec vseh poslov) | vsi posli (`quick`, `backend`, `e2e`) uspešni. Ob padcu novemu delavcu pošlji izpis `scripts/ci-failures.sh --pr <n>` in fazo POPRAVKI; največ **3** krogi, nato se obrneš na razvijalca |
| **Združitev** (ti) | po vrstnem redu iz načrta | CI zelen **in** `mergeable == MERGEABLE` → `gh pr merge <n> --merge --delete-branch` |
| **USKLADITEV** (delavci vseh še odprtih vej) | takoj po vsaki združitvi | poročilo KONČANO, nato znova faza CI |

- **Paketi zgodb:** po vratih NAČRT razdeli faze `tasks.md` v pakete in jih zapiši v stanje.
  Majhne sosednje zgodbe (vsaka do ~5 nalog, skupaj do ~12) v ločenih mapah ali paketih združi v
  en paket – manj hladnih zagonov delavcev in manj tekov `quick`; zgodbo z več kot ~12 nalogami
  razdeli na dva paketa (npr. zaledje / vmesnik in E2E). Commit ostane po zgodbi.
- Majhna sprememba začne pri fazi IZVEDBA (brez veščin Spec Kit) in nima pregleda.
- Odvisna funkcionalnost dobi fazo NAČRT šele, ko jo je predhodnica končala; v navodilu ji podaš
  pot do artefaktov predhodnice. Fazo IZVEDBA lahko začne, ko je predhodnica združena ali ko
  njen plan jasno določa vmesnik, na katerega se naslanja.
- Če `gh pr merge` zavrne združitev zaradi zaščite veje ali zahtevanega pregleda, tega ne obidi:
  sporoči razvijalcu in nadaljuj z drugimi funkcionalnostmi.
- Če delavec poroča *Datoteke zunaj obsega*, preveri, ali jih ureja tudi drug delavec; če da, določi
  vrstni red in drugemu to sporoči pred njegovo naslednjo fazo.
- Delavec koraka ne sme preskočiti: če poročilo ne navaja izida koraka (analiza, converge), fazo
  vrni z navedbo, kaj manjka.

### 4. Zaključek

1. Ko so vsi PR-ji združeni (ali predani razvijalcu): `git switch main && git pull --ff-only`.
2. **ai-log (po združitvi, neposredno v `main`, nikoli prek PR):** `node scripts/token-report.mjs`
   (zadnja seja = ta; vsebuje tudi vse podagente) → vrstice seje v `ai-log/token-report-<ime>.md`
   (oblika obstoječih vrstic, skupni seštevek); vnos *Seja N* v `ai-log/<ime>.md` v obliki prejšnjih
   sej – vse faze od specifikacije do združitve (tabela korakov in *Povzetek seje N*), iz stanja in
   poročil delavcev. Commit `docs(ai-log): seja N – <funkcionalnosti>`, `git push origin main`. To
   je edina sprememba, ki jo narediš sam.
3. Worktreeje odstrani (`git worktree remove --force .claude/worktrees/<ime>`; ob napaki dolgih poti
   mapo izbriši in `git worktree prune`), lokalne veje funkcionalnosti izbriši; `.rollout/state.md` izbriši.
4. Razvijalcu poročaj v nekaj vrsticah: združeni PR-ji, odločitve, ki si jih sprejel sam,
   neodpravljene ugotovitve pregledov, kar je ostalo odprto, in skupna poraba.

## Navodilo delavcu (predloga)

Kratko in samostojno – delavec ne vidi tega pogovora:

```text
Funkcionalnost: <ime> – <opis v 1–3 stavkih>
Velikost: <majhna | funkcionalnost | tvegana>
Faza: <SPEC | NAČRT | IZVEDBA – paket <npr. Setup+Foundational, US1, US4+US5, US6 (zaledje)> | KONVERGENCA | POPRAVKI | PR | USKLADITEV>
Worktree: .claude/worktrees/<ime> (cd vanj; veja <ime>) · stanje veje: <git log --oneline main..HEAD | head -5>
Mapa: specs/<NNN>-<ime> (SPECIFY_FEATURE_DIRECTORY za /speckit-specify)
Obseg datotek: <mape in paketi iz analize>
Skupne datoteke, ki jih smeš spremeniti: <seznam>
Dodeljeno: migracija V<n> (preveri glede na main v fazi PR) · vrstni red združevanja: <mesto>
Odgovori razjasnitve in odločitve iz posveta: <alineje ali "ni">
Vhod te faze: <npr. ugotovitve pregleda dobesedno; padli posli CI; pot do artefaktov predhodnice>
Vrni poročilo v obliki iz svojih navodil.
```

## Razvrščanje vprašanj

**Odločiš sam** (in zapišeš v stanje ter v opis PR kot predpostavko): poimenovanje, besedila in
prevodi, razporeditev znotraj obstoječih vzorcev `design.md`, izbira med enakovrednima izvedbama,
privzete vrednosti, ki sledijo `feature-map.md` §2, obseg testov, vse, kar je mogoče brez škode
spremeniti v naslednjem PR.

**Posreduješ razvijalcu:** vedenje za uporabnika, ki ga naročilo ne določa in ni razvidno iz
obstoječih pravil; vloge in dovoljenja; podatkovni model in migracija obstoječih podatkov; nova
knjižnica ali zunanja storitev; osebni podatki; odstop od konstitucije ali `design.md`; karkoli,
kar spremeni vedenje **druge** funkcionalnosti.

V dvomu posreduj. Vprašanja zbiraj: delavec medtem dela na delih, ki od odgovora niso odvisni.

## Kdaj se obrneš na razvijalca (po posvetu)

- vprašanje iz skupine *Posreduješ razvijalcu*, ki se pojavi šele med izvedbo;
- CI pade po treh krogih popravkov ali delavec dvakrat vrne NEUSPEH pri isti fazi;
- konflikt pri uskladitvi, katerega razrešitev spremeni vedenje ene od funkcionalnosti;
- združitev je zavrnjena (zaščita veje, zahtevan pregled) ali `mergeable` ostane `CONFLICTING`;
- `verify.sh` pri delavcu vrne izhod `3` (manjka orodje ali Docker).

Druge funkcionalnosti medtem tečejo naprej.

## Odpornost

- **Delavec ne odgovori v obliki ali je zašel iz faze:** enkrat ga popravi s kratkim sporočilom
  (kaj manjka). Če se ponovi, zaženi novega delavca na **isti veji in worktreeju** z navodilom, ki
  vsebuje pot do mape `specs/NNN-ime/`, stanje veje (`git log --oneline main..HEAD`) in preostanek
  faze – artefakti Spec Kit nosijo ves kontekst, ki ga novi delavec potrebuje.
- **Delavec presega fazo** (npr. v SPEC že piše kodo): ne zavrzi dela; zabeleži in nadaljuj z vrati
  naslednje faze.
- **Prekinitev seje:** ob ponovnem zagonu preberi `.rollout/state.md`, preveri resnično stanje
  (`git worktree list`, `gh pr list --state open`) in nadaljuj pri prvi nedokončani fazi vsake
  funkcionalnosti. Delavcev, ki jih ni več mogoče nadaljevati, nadomesti kot zgoraj.
- **Okolje lokalno:** `verify.sh` z izhodom `3` ali Docker, ki ne teče → takoj razvijalcu (ne
  ponavljaj faze). Padec `quick` samo zaradi časovne omejitve testa, ki ga veja ni spremenila → enkrat
  ponovi; drugi takšen padec je okolje, ne krog popravkov.
- **Omejitev porabe:** delavca, ki ga ustavi omejitev, ne nadaljuješ – po ponastavitvi zaženeš
  novega na isti veji za preostanek faze (commiti po zgodbah ohranijo delo).
- **Nestabilen test v CI** (pade posel, ki s spremembo ni povezan): en ponovni zagon
  (`gh run rerun <id> --failed`) ne šteje kot krog popravkov; drugi padec šteje.
