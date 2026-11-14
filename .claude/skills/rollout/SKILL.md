---
name: "rollout"
description: "Samodejno uvajanje ene ali več funkcionalnosti: nadzornik razdeli delo delavcem (podagent izvajalec, vsak v svojem worktreeju), se z razvijalcem posvetuje enkrat, nato vodi delo do združenih PR-jev. Uporabi, ko razvijalec naroči /rollout ali želi funkcionalnosti izpeljati samodejno oziroma vzporedno."
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

- **Ne pišeš kode in je ne bereš.** Delo opravijo delavci. Ti deliš faze, preverjaš dokaze,
  odločaš o preprostih vprašanjih in usklajuješ vrstni red.
- **Verjameš dokazom, ne trditvam:** obstoj datoteke, `git log`/`git diff --stat`, številka PR,
  izid CI (`gh pr checks`). Vrat `verify.sh` ne poganjaš sam – dokaz je CI.
- **Kontekst ostane majhen:** bereš samo poročila delavcev (do 15 vrstic), `--stat` in enovrstične
  izide. Razlik, dnevnikov in datotek kode ne odpiraš; če jih kdo mora prebrati, je to delavec.
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
- dodeljeno: migracije A=V9, B=V10 · skupne datoteke: App.tsx (A, B), sl.json/en.json (vsi)
## Funkcionalnosti
| Ime | Velikost | Delavec (id) | Worktree | Veja | Faza | PR | Krogi CI |
## Odločitve nadzornika
- <funkcionalnost>: <vprašanje> → <odločitev> (razlog)
## Odprta vprašanja za razvijalca
- …
```

## Potek

### 0. Sprejem

1. `git status --short` (delovno drevo mora biti čisto), `git fetch origin`, `git switch main`,
   `git pull --ff-only`.
2. `gh pr list --state open --json number,title,headRefName,files --jq '.[] | {number, title, headRefName, files: [.files[].path]}'`
   in `git branch -r` – delo sodelavca, ki se prekriva z naročenimi funkcionalnostmi, je konflikt,
   ki ga sporočiš v posvetu (korak 2).
3. Vsako funkcionalnost razvrsti po konstituciji §2.1 (majhna / običajna / tvegana) in ji določi
   ime (`[a-z][a-z0-9-]*`). Majhna sprememba gre skozi iste faze brez `spec.md`.
4. Ime razvijalca za `ai-log/<ime>.md` določi iz obstoječih datotek v `ai-log/` in
   `git config user.name`; če ni očitno, ga vprašaj v posvetu.

### 1. Analiza združljivosti

Zaženi **enega** podagenta `Explore` (samo bere; model `haiku` ali `sonnet`) z vsemi
funkcionalnostmi hkrati. Vrne naj samo tabelo, brez izpisov datotek:

- za vsako funkcionalnost: mape vmesnika (`frontend/src/features/*`), paketi zaledja, ali potrebuje
  migracijo, katere **skupne datoteke** bo verjetno spremenila (`frontend/src/app/App.tsx`,
  `frontend/src/shared/**`, `frontend/src/i18n/*.json`, `frontend/src/test/**`,
  `e2e/tests/support/**`, `.specify/memory/feature-map.md`), in odvisnosti od drugih naročenih
  funkcionalnosti;
- zadnjo številko migracije v `backend/src/main/resources/db/migration/`.

Vsak par funkcionalnosti razvrsti:

| Razmerje | Pomen | Ukrep |
|---|---|---|
| neodvisni | ločene mape, brez skupnih datotek razen prevodov in `ai-log/` | vzporedno, isti val |
| skupne točke | ista skupna datoteka ali obe z migracijo | vzporedno; dodeli številke migracij in vrstni red združevanja, drugi se uskladi po prvi združitvi |
| odvisni | B potrebuje model ali endpointe A | A najprej do konca faze SPEC (s `plan.md`), nato B začne s planom A kot vhodom; A se združi pred B |
| prekrivajoči | isti zaslon, ista tabela ali iste datoteke v jedru | **ne vzporedno**: zaporedna valova ali združitev v eno funkcionalnost |

Omejitve števila funkcionalnosti ni; število valov določi ta analiza. Prevodi (`sl.json`,
`en.json`) in `ai-log/` so vedno skupna točka – konflikt je pričakovan in ga razreši delavec v
fazi USKLADITEV.

### 2. Specifikacije in posvet (edina načrtovana točka z razvijalcem)

1. Za vsako funkcionalnost prvega vala zaženi delavca: orodje `Agent`, `subagent_type: "izvajalec"`,
   `isolation: "worktree"`, `run_in_background`, navodilo po predlogi spodaj, faza **SPEC**. Pri
   tvegani funkcionalnosti dodaj `model: "opus"`. Vse delavce vala zaženi v enem koraku.
2. Ko poročila prispejo, preveri dokaz (`git -C <worktree> log --oneline -3`, obstoj `spec.md`) in
   **razvrsti vprašanja** (spodaj).
3. **Posvet:** razvijalcu v enem sporočilu pokaži
   - načrt: valovi, vrstni red združevanja, dodeljene številke migracij;
   - pričakovane konflikte (med funkcionalnostmi in z odprtim delom sodelavca) in kako bodo rešeni;
   - odločitve, ki si jih sprejel sam (ena vrstica vsaka);
   - vprašanja, ki jih mora odločiti on – z `AskUserQuestion` (do 4 na klic; več klicev, če je treba),
     vsako s tvojim priporočilom kot prvo možnostjo.
4. Odgovore zapiši v stanje in jih pošlji delavcem skupaj z naslednjo fazo. Od tu naprej razvijalca
   ne sprašuješ, razen v primerih iz razdelka *Kdaj se obrneš na razvijalca*.

### 3. Izvedba (za vsako funkcionalnost; funkcionalnosti istega vala vzporedno)

Istega delavca nadaljuješ s `SendMessage` (ohrani kontekst funkcionalnosti); novega zaženeš le, če
delavec odpove (glej *Odpornost*).

| Korak | Kdo | Vrata, preden greš naprej |
|---|---|---|
| **IZVEDBA** | delavec | poročilo KONČANO z `✓ quick OK`; `git -C <worktree> status --short` prazen; `git -C <worktree> diff main...HEAD --stat \| tail -n 1` kaže spremembe v pričakovanih mapah |
| **Pregled** (običajna, tvegana) | ti zaženeš podagenta `pregled-testov` (svež, `model: "sonnet"`) z vejo in mapo `specs/<ime>/` | pregled se zažene **enkrat**; ugotovitve posreduješ delavcu dobesedno |
| **POPRAVKI** | delavec | poročilo KONČANO; neodpravljene ugotovitve so naštete (gredo v opis PR) |
| **PR** | delavec | številka PR; `gh pr view <n> --json state,mergeable,headRefName` |
| **CI** | ti: `gh pr checks <n> --watch --fail-fast` v ozadju | vsi posli (`quick`, `backend`, `e2e`) uspešni. Ob padcu delavcu pošlji imena padlih poslov in fazo POPRAVKI; največ **3** krogi, nato se obrneš na razvijalca |
| **Združitev** | ti, po vrstnem redu iz načrta | CI zelen **in** `mergeable == MERGEABLE` → `gh pr merge <n> --merge --delete-branch` |
| **USKLADITEV** | delavci vseh še odprtih PR-jev, takoj po vsaki združitvi | poročilo KONČANO, nato znova korak CI |

- Funkcionalnost naslednjega vala začne z `git fetch` po združitvi tistih, od katerih je odvisna;
  odvisna funkcionalnost dobi v navodilu pot do `plan.md` predhodnice.
- Če `gh pr merge` zavrne združitev zaradi zaščite veje ali zahtevanega pregleda, tega ne obidi:
  sporoči razvijalcu in nadaljuj z drugimi funkcionalnostmi.
- Če delavec poroča *Datoteke zunaj obsega*, preveri, ali jih ureja tudi drug delavec; če da, določi
  vrstni red in drugemu to sporoči pred njegovo naslednjo fazo.

### 4. Zaključek

1. Ko so vsi PR-ji združeni (ali predani razvijalcu): `git switch main && git pull --ff-only`.
2. **Poraba:** `node scripts/token-report.mjs` (zadnja seja = ta; vsebuje tudi vse podagente). Vrstice
   dodaj v `ai-log/token-report-<ime>.md` na veji `ai-log-<datum>`, commit `docs(ai-log): poraba
   /rollout <datum>`, PR, združitev ob zelenem CI. To je edina sprememba, ki jo narediš sam.
3. Delavci, katerih worktree ni več potreben, so končali; `.rollout/state.md` izbriši.
4. Razvijalcu poročaj v nekaj vrsticah: združeni PR-ji, odločitve, ki si jih sprejel sam,
   neodpravljene ugotovitve pregledov, kar je ostalo odprto, in skupna poraba.

## Navodilo delavcu (predloga)

Kratko in samostojno – delavec ne vidi tega pogovora:

```text
Funkcionalnost: <ime> – <opis v 1–3 stavkih>
Velikost: <majhna | običajna | tvegana>
Faza: <SPEC | IZVEDBA | POPRAVKI | PR | USKLADITEV>
Obseg datotek: <mape in paketi iz analize>
Skupne datoteke, ki jih smeš spremeniti: <seznam>
Dodeljeno: migracija V<n> · vrstni red združevanja: <mesto> · ime za ai-log: <ime>
Odločitve iz posveta: <alineje ali "ni">
Vhod te faze: <npr. ugotovitve pregleda dobesedno; padli posli CI; pot do plan.md predhodnice>
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
  vsebuje `spec.md`, stanje veje (`git log --oneline main..HEAD`) in preostanek faze.
- **Delavec presega fazo** (npr. v SPEC že piše kodo): ne zavrzi dela; zabeleži in nadaljuj z vrati
  naslednje faze.
- **Prekinitev seje:** ob ponovnem zagonu preberi `.rollout/state.md`, preveri resnično stanje
  (`git worktree list`, `gh pr list --state open`) in nadaljuj pri prvi nedokončani fazi vsake
  funkcionalnosti. Delavcev, ki jih ni več mogoče nadaljevati, nadomesti kot zgoraj.
- **Nestabilen test v CI** (pade posel, ki s spremembo ni povezan): en ponovni zagon
  (`gh run rerun <id> --failed`) ne šteje kot krog popravkov; drugi padec šteje.
