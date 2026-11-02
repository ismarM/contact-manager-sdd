# Potek razvoja (workflow) – Contact Manager

**Contact Manager** – večnajemniški sistem za vodenje kontaktov, razvit po metodi Spec-Driven Development z **GitHub Spec Kit** (`specify-cli` 1.2.x) in **Claude Code**.

> Ta dokument določa, **kako** se razvija, testira in zaključuje delo. **Kaj** se razvija, določajo `specs/*/spec.md` (vir resnice za zahteve) in [`feature-map.md`](feature-map.md) (razdelitev in skupna pravila). Vmesnik sledi [`design.md`](design.md).
>
> Prednost pri navzkrižju: **constitution → ta dokument → `spec.md` → `plan.md` → `tasks.md`**.
>
> Prvotni dokumenti (`original_documentation/`) so zgodovinski in se ne spreminjajo; vsebina je prenesena v `.specify/memory/` in `specs/`.
>
> To je poenostavljena različica prvotnega okvira: ni orkestratorja, subagentov, zaklepanja testov in vrat 0–3. Teste pred implementacijo pregledata razvijalca.

---

## 0. Potek dela s Spec Kit

### 0.1 Enkratna vzpostavitev *(opravljeno)*

| Korak | Ukaz / dejanje | Rezultat |
|---|---|---|
| 1 | `uv tool install specify-cli` | CLI `specify` (1.2.6) |
| 2 | `specify init --here --force --integration claude --script sh --extension git` | `.specify/` (predloge, skripte, `memory/`) in veščine v `.claude/skills/speckit-*/` |
| 3 | V `.specify/extensions.yml` je kavelj `before_specify` (`speckit.git.feature`) izklopljen | veje **brez številk** (0.3) |
| 4 | Prilagojene predloge v `.specify/templates/overrides/` (1.5) | Predloge s FR-ID, scenariji in javnimi vmesniki |
| 5 | `/speckit-constitution` (vsebina po 5.1) | `.specify/memory/constitution.md` |
| 6 | `CLAUDE.md` (5.2), `DECISIONS.md`, `feature-map.md`, `design.md`, ta dokument | Navodila agentu, dnevnik odločitev, skupni dokumenti |
| 7 | `/speckit-specify` za vse funkcionalnosti iz `feature-map.md` | `specs/000-ogrodje/` … `specs/012-moji-podatki/` s `spec.md` in `checklists/requirements.md` |

- V Claude Code se ukazi Spec Kit kličejo kot veščine: `/speckit-specify`, `/speckit-plan` … (dokumentacija Spec Kit uporablja zapis `/speckit.specify`; gre za isti ukaz).
- `--script sh`, ker sta `verify.sh` in CI v bashu (na Windows prek Git Bash).
- Razširitve `agent-context` **ne** nameščamo: `CLAUDE.md` vzdržujeva ročno, da ostane kratek.
- Da prilagojene predloge res veljajo, preveriva z `specify artifact info spec-template --kind template --json` (sloj `project` mora biti aktiven in prvi v skladu).
- Razširitev git ostane nameščena zaradi neobveznih kavljev za commit (`/speckit-git-commit`); samodejni commiti so izklopljeni (`.specify/extensions/git/git-config.yml`).

### 0.2 Cikel posamezne funkcionalnosti

Vsaka funkcionalnost ima mapo `specs/NNN-ime/` in vejo `ime` (brez številke).

| # | Ukaz | Kdo | Rezultat | Pogoj za naprej |
|---|---|---|---|---|
| 0 | `scripts/feature.sh ime` | razvijalca | veja `ime`, `.specify/feature.json` kaže na `specs/NNN-ime` | – |
| 1 | `/speckit-specify` *(za obstoječe funkcionalnosti že opravljeno)* | razvijalca + agent | `spec.md`: zgodbe, FR-ID, scenariji (1.1–1.3) | potrditev razvijalcev |
| 2 | `/speckit-clarify` | razvijalca + agent | nejasnosti razrešene v `spec.md` | ni več `[NEEDS CLARIFICATION]` |
| 3 | `/speckit-plan` | razvijalca + agent | `plan.md` z javnimi vmesniki (1.4), `data-model.md`, `contracts/` | potrditev |
| 4 | `/speckit-checklist` *(neobvezno)* | razvijalca | kontrolni seznam kakovosti zahtev (npr. varnost, dostopnost) | vse točke `[x]` |
| 5 | `/speckit-tasks` | agent | `tasks.md` po 1.6 | potrditev |
| 6 | `/speckit-analyze` | agent | poročilo o skladnosti spec/plan/tasks | brez odprtih neskladij |
| 7 | `/speckit-implement` – **samo testne naloge** | agent | testi, ki padejo zaradi pravega razloga (2.1) | **pregled testov** razvijalcev (4.2) |
| 8 | `/speckit-implement` – implementacijske naloge | agent | koda; `./verify.sh quick` zelen | – |
| 9 | `/speckit-converge` | agent | primerjava kode s spec/plan/tasks; manjkajoče doda kot naloge | ponavljanje 8–9 do »Converged« |
| 10 | `./verify.sh full`, `traceability.md` | agent + razvijalca | zelena vrata, posodobljena sledljivost (4.4) | sprejem, združitev v `main` |

### 0.3 Veje brez številk in trenutna funkcionalnost

Ukazi Spec Kit (`/speckit-plan`, `/speckit-tasks`, …) trenutno funkcionalnost najdejo v `.specify/feature.json` (lokalna datoteka, v `.gitignore`), ne v imenu veje. Zato:

```bash
scripts/feature.sh kontakti        # ustvari ali preklopi na vejo "kontakti" in nastavi feature.json na specs/004-kontakti
scripts/feature.sh                 # izpiše trenutno funkcionalnost in vejo
```

- **Nova funkcionalnost** (ki je še ni v `feature-map.md`): najprej vrstica v `feature-map.md`, nato `/speckit-specify` z izrecno mapo, npr. `SPECIFY_FEATURE_DIRECTORY=specs/013-ime`, nato `scripts/feature.sh ime`.
- Kavelj `speckit.git.feature` je izklopljen, ker vedno ustvari oštevilčeno vejo.

---

## 1. Specifikacija in plan

### 1.1 ID zahtev

Vsaka funkcionalna zahteva v `spec.md` ima ID **`FR-NNN-XX`**, kjer je `NNN` številka funkcionalnosti (mapa `specs/NNN-ime/`), `XX` pa zaporedna številka zahteve (npr. `FR-004-07`). ID se nikoli ne uporabi znova; odstranjena zahteva ostane v specifikaciji z oznako `REMOVED [CR-NN]`.

### 1.2 Sprejemni scenariji

Vsaka zahteva ima **vsaj en** scenarij *Given / When / Then*, ki se sklicuje na njen FR-ID. Zahteva, iz katere ni mogoče izpeljati testa, se vrne v `/speckit-clarify`.

### 1.3 Negativni scenariji

Vsaka zahteva, ki vključuje podatke skupine, ima tudi negativne scenarije:

- **neprijavljen uporabnik** (ni žetona, neveljaven ali potečen žeton);
- **tuja skupina** (prijavljen uporabnik, ki ni član skupine);
- **nezadostna vloga** (član z vlogo pod najnižjo dovoljeno; hierarhija `VIEWER < EDITOR < ADMIN < OWNER`).

Kjer je smiselno, še **arhivirana skupina** (vsi člani imajo efektivno pravice bralca) in pravila »le nižjim od sebe« pri upravljanju članov.

### 1.4 Javni vmesniki v `plan.md`

`plan.md` vsake funkcionalnosti vsebuje tri tabele, na katere se testi sklicujejo, zato jih agent ne sme izmisliti med implementacijo:

```markdown
## Javni vmesniki

### Endpointi (REST)
| Metoda | Pot | Najnižja vloga | V arhivirani skupini | Uspeh | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/contacts | EDITOR | zavrnjeno | 201 | FR-004-01 |

### Strani in poti
| Stran | Pot | Najnižja vloga | FR-ID |
|---|---|---|---|
| Kontakti skupine | /groups/:groupId/contacts | VIEWER | FR-005-01 |

### Ključni elementi in dostopna imena
| Stran | Vloga (ARIA role) | Dostopno ime (sl / en) | Namen | FR-ID |
|---|---|---|---|---|
| Kontakti skupine | button | »Nov kontakt« / "New contact" | odpre obrazec | FR-004-01 |
```

- *Najnižja vloga* je `—` za endpointe, ki niso vezani na skupino (npr. povabila, moj račun), in `javno` za neprijavljene strani.
- Podrobna oblika zahtevkov in odgovorov je v `contracts/` (OpenAPI).

### 1.5 Prilagojene predloge

Predloge so v `.specify/templates/overrides/` (najvišja prednost v skladu predlog Spec Kit). Vsaka je kopija jedrne predloge iz `.specify/templates/` z dopolnitvami; ohraniti je treba vse ograde, ki jih uporabljajo ukazi (npr. `$ARGUMENTS`, `__SPECKIT_COMMAND_TASKS__`).

| Datoteka | Sprememba glede na jedrno predlogo |
|---|---|
| `spec-template.md` | FR-ID `FR-NNN-XX` namesto `FR-001` (1.1); vsak scenarij navaja FR-ID (1.2); obvezen razdelek *Negativni scenariji* (1.3); razdelek *Spremembe* za oznake `[CR-NN]` (4.5) |
| `plan-template.md` | Razdelek *Javni vmesniki* s tremi tabelami (1.4) |
| `tasks-template.md` | Testi so **obvezni** (ne »OPTIONAL«); naloge navajajo FR-ID-je; faza testov pred implementacijo in kontrolna točka pregleda (1.6) |

Predloge se spreminjajo samo z odločitvijo obeh razvijalcev, zapisano v `DECISIONS.md`.

### 1.6 Naloge v `tasks.md`

- Vsaka naloga navaja **FR-ID-je**, ki jih pokriva, in datoteke, ki jih ustvari ali spremeni, npr. `- [ ] T012 [P] [US2] FR-004-03 … v backend/src/…`.
- Vrstni red faz: **Setup → Foundational → Testi → Pregled testov → implementacija po zgodbah → Polish**.
  - Faza *Testi* vsebuje vse testne naloge funkcionalnosti (unit, funkcionalni, integracijski, varnostni, E2E).
  - *Pregled testov* je ena človeška naloga (`T0xx Pregled testov – razvijalca`), ki jo označita razvijalca.
- Naloge, označene z `[P]`, nimajo skupnih datotek.

---

## 2. Testi

### 2.1 Najprej testi, nato koda

Testi se napišejo pred implementacijo in morajo pred njo **pasti zaradi pravega razloga**: manjka vedenje (neuspela asercija, `404`/`501` namesto pričakovanega odgovora, prazna stran), ne pa napaka pri prevajanju, napaka v testu ali manjkajoča odvisnost. Da se testi prevedejo, smejo testne naloge ustvariti minimalno ogrodje: DTO-je, prazne kontrolerje, ki vrnejo `501`, in prazne komponente strani.

### 2.2 Testi se spreminjajo samo zaradi specifikacije

Test se sme spremeniti **samo**, da se uskladi s specifikacijo (`spec.md`, `plan.md`, `contracts/`), **nikoli** zato, da bi ustrezal kodi. Vsaka sprememba testa po pregledu (4.2) dobi vnos v `DECISIONS.md` (`D-NN`: test, FR-ID, razlog, citat specifikacije). Obvodi v produkcijski kodi, ki služijo le temu, da test prestane, so prepovedani. Če je napačna specifikacija, se spremeni po 4.5.

### 2.3 Sledljivost

Vsak test, ki preverja zahtevo, nosi njen FR-ID:

- **JUnit 5:** `@Tag("FR-004-03")` (lahko več oznak);
- **Vitest in Playwright:** v imenu testa, `"FR-004-03: urednik ustvari kontakt z dodatnim atributom"`.

### 2.4 Brez pravih zunanjih storitev

- Firebase Authentication **vedno prek Firebase Auth Emulatorja**;
- PostgreSQL **vedno prek Testcontainers**;
- v FE testih API nadomesti **MSW**.

Testi ne potrebujejo pravih ključev, so ponovljivi in neodvisni od vrstnega reda izvajanja.

### 2.5 Matrika izolacije

Za **vsak** endpoint, ki dostopa do podatkov skupine, obstaja parametriziran varnostni test čez vse akterje:

| Akter | Pričakovan rezultat |
|---|---|
| Neprijavljen (ni žetona, neveljaven ali potečen žeton) | `401` |
| Prijavljen, ni član skupine | `404` (ne razkrije obstoja skupine ali kontakta) |
| Član z **vsako** vlogo pod najnižjo dovoljeno | `403` |
| Član z najnižjo dovoljeno vlogo in vsemi višjimi | `2xx` |

- Endpointi, vezani na uporabnika (povabila, izvoz podatkov, izbris računa): `401` neprijavljen, `404` za tuj vir (npr. tuje povabilo).
- Pisanje v arhivirani skupini se preveri posebej; statusno kodo določi `spec.md`.
- Endpoint brez vnosa v matriki pomeni, da funkcionalnost ni zaključena.

### 2.6 UI testi po vlogah in dostopnih imenih

V testih RTL in Playwright se elementi iščejo **izključno** z `getByRole` (z `name`) in `getByLabel`, z imeni iz tabele v `plan.md` (1.4). Brez CSS selektorjev, `data-testid` in iskanja po besedilu brez vloge.

### 2.7 axe na vsaki strani

- **FE testi:** na vsaki izrisani strani `vitest-axe`, brez kršitev.
- **E2E:** na vsaki obiskani strani `@axe-core/playwright` s pravili WCAG 2.1 A in AA, brez kršitev.

### 2.8 Trije viewporti v E2E

Vsak E2E scenarij teče pri širinah **360, 768 in 1280 px** (projekti v `playwright.config.ts`).

### 2.9 Izvoz v Excel

E2E test izvoza datoteko `.xlsx` **prenese in prebere nazaj** ter preveri vsebino: izbrani kontakti, stolpci predefiniranih in dodatnih atributov ter značk.

---

## 3. Preverjanje in orodja

### 3.1 `verify.sh`

Vsa preverjanja se poganjajo prek enega ukaza, enako za razvijalca, agenta in CI:

| Raven | Koraki | Kdaj |
|---|---|---|
| `./verify.sh quick` | formatiranje (Spotless, Prettier – preverjanje), lint (ESLint z `jsx-a11y`), tipi (`tsc --noEmit`, strict), preverjanje utišanj (3.4), unit testi BE in FE, funkcionalni testi FE (RTL, MSW, `vitest-axe`) | pred zaključkom vsake naloge |
| `./verify.sh full` | `quick` + integracijski testi BE (Testcontainers, Firebase Auth Emulator), varnostni testi (matrika izolacije), `docker compose up` in E2E (Playwright, axe, 3 viewporti) | pred združitvijo v `main`; v CI |

Izhodna koda `0` = uspeh, drugo = neuspeh.

### 3.2 Zgoščen izpis

- **Uspeh:** ena vrstica, npr. `✓ quick OK (48 s)`.
- **Neuspeh:** ime koraka in **največ 20 vrstic** v obliki `datoteka:vrstica  pravilo  sporočilo` oziroma imena padlih testov s kratkim razlogom.
- Celoten izpis zadnjega zagona je v `.verify/last.log` (v `.gitignore`); agent ga odpre samo, če zgoščen izpis ne zadošča.

### 3.3 Orodja

| Področje | Orodja |
|---|---|
| Backend | Spotless, JUnit 5, Testcontainers (PostgreSQL), Firebase Auth Emulator |
| Frontend | Tailwind CSS v4, shadcn/ui *(neobvezno, po `design.md` 13.4)*, Prettier (+ `prettier-plugin-tailwindcss`), ESLint (`jsx-a11y`), `tsc` strict, Vitest, React Testing Library, MSW, `vitest-axe` |
| E2E | Playwright, `@axe-core/playwright` |
| Repozitorij | gitleaks v pre-commit hooku |

Dodatno orodje se uvede samo z vnosom v `DECISIONS.md`.

### 3.4 Prepoved utišanja opozoril

`@SuppressWarnings`, `// eslint-disable*`, `@ts-ignore`, `@ts-expect-error` in tip `any` so dovoljeni samo z odobritvijo v `DECISIONS.md`. V kodi je ob oznaki komentar s sklicem, npr. `// DECISIONS D-07: …`. `verify.sh quick` pade ob oznaki brez veljavnega sklica.

### 3.5 CI

GitHub Actions ob vsakem pushu in pull requestu požene `./verify.sh full`. Združitev v `main` je dovoljena samo ob zelenem CI.

### 3.6 Ročni mini samopreizkus

V funkcionalnosti 000 razvijalca preverita, da `verify.sh` **pade** ob vsaki namerni napaki in ob tem izpiše največ 20 vrstic:

- napačno formatirana datoteka BE in FE;
- kršitev ESLint `jsx-a11y` (npr. slika brez `alt`);
- napaka tipov v TS;
- padajoč unit test BE in FE;
- padajoč FE test zaradi kršitve axe;
- padajoč integracijski test (Testcontainers + emulator);
- neodobren `eslint-disable`;
- lažna skrivnost v staged datoteki (pre-commit z gitleaks).

Izid se zapiše v `DECISIONS.md`. Samopreizkus se ponovi ob vsaki večji spremembi `verify.sh`.

### 3.7 Lighthouse *(neobvezno)*

Enkrat ob koncu projekta se Lighthouse požene nad aplikacijo v Docker Compose. Rezultat je samo poročilo (`docs/lighthouse/`), ne pogoj za združitev. Najdbe dostopnosti se odpravijo ali utemeljeno zavrnejo v `DECISIONS.md`.

---

## 4. Potek in beleženje

### 4.1 Funkcionalnost 000: ogrodje projekta

Ogrodje se razvije po **običajnem ciklu Spec Kit** (0.2) kot `specs/000-ogrodje/` na veji `ogrodje`. Specifikacija je že ustvarjena (mapa je bila podana izrecno, ker `/speckit-specify` sicer začne z `001`).

Obseg funkcionalnosti 000:

- struktura `backend/` (Spring Boot), `frontend/` (React, TypeScript, Vite, Tailwind CSS v4 z žetoni iz `design.md` 13.2, i18n sl/en, PWA ogrodje), `e2e/` (Playwright);
- `scripts/feature.sh` že obstaja (0.3);
- odločitev, ali in za katere vzorce se uporabi shadcn/ui (`design.md` 13.4), zapisana v `DECISIONS.md`;
- `docker-compose.yml`: PostgreSQL, Firebase Auth Emulator, backend, frontend za nginx;
- konfiguracije orodij (3.3), `verify.sh` (3.1–3.2), pre-commit z gitleaks, CI (3.5);
- en preprost testni primer na vsaki ravni testov, ki dokaže, da veriga deluje;
- ročni samopreizkus (3.6).

### 4.2 Implementacija v dveh korakih

1. **Testi:** `/speckit-implement` samo za fazi *Setup/Foundational* in *Testi*. Agent poroča, da testi padejo zaradi pravega razloga.
2. **Pregled testov:** razvijalca pregledata teste glede na `spec.md` in `plan.md`:
   - vsak FR-ID ima test;
   - negativni scenariji in matrika izolacije so pokriti;
   - selektorji so po vlogah;
   - asercije so smiselne.
   Popravke zahtevata od agenta. Ko testi ustrezajo, označita nalogo *Pregled testov* in naredita commit `test(NNN): …`.
3. **Koda:** `/speckit-implement` za preostale faze, nato `/speckit-converge`, dokler ne vrne »Converged«. Od tu naprej veljajo pravila iz 2.2.

### 4.3 `DECISIONS.md`

En dnevnik v korenu repozitorija. Vnosi `D-NN`, vsak z datumom, avtorjem, vrsto in utemeljitvijo:

| Vrsta | Primer |
|---|---|
| `odločitev` | izbira knjižnice, statusna koda za arhivirano skupino, sprememba predloge |
| `sprememba-testa` | test, FR-ID, razlog, citat specifikacije (2.2) |
| `utišanje` | datoteka, oznaka, razlog (3.4) |
| `sprememba-specifikacije` | sklic na `[CR-NN]` in prizadete FR-ID-je (4.5) |

### 4.4 `traceability.md`

Vsaka funkcionalnost ima `specs/NNN-ime/traceability.md`:

```markdown
| FR-ID | Scenarij | Testi (datoteka › ime testa) | Stanje |
|---|---|---|---|
| FR-004-03 | Urednik doda atribut | ContactApiIT › createWithCustomAttribute; contacts.spec.ts › FR-004-03: … | zelen |
```

Ustvari se po pregledu testov (4.2) in posodobi pred sprejemom. FR-ID brez testa pomeni, da funkcionalnost ni zaključena.

### 4.5 Spremembe specifikacije

Ko se že potrjena zahteva spremeni:

1. V `spec.md` se spremenjena ali nova zahteva označi z **`[CR-NN]`** (številčenje enotno za projekt); odstranjena se označi z `REMOVED [CR-NN]`, ne izbriše.
2. Vnos v `DECISIONS.md` (razlog, prizadeti FR-ID-ji in funkcionalnosti).
3. Po potrebi `plan.md`, `contracts/`, `tasks.md` (`/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`).
4. **Najprej testi, nato koda** (4.2).
5. `./verify.sh full` nad **celotnim sistemom**, da se ujamejo regresije v drugih funkcionalnostih.

Specifikacije so »žive« (model *living spec* v Spec Kit): `spec.md` ostaja pogodba in se posodablja, ne podvaja v novo mapo.

### 4.6 Merila zaključka projekta

- vse funkcionalnosti in spremembe specifikacije so zaključene, vsak FR-ID ima test (`traceability.md`);
- na **čisti kopiji repozitorija** uspeta `docker compose up` in `./verify.sh full`;
- CI je zelen na `main`;
- `README.md` je posodobljen (namestitev, zagon, uporaba, povezave na dokumente).

---

## 5. Razdelitev za agenta

### 5.1 Konstitucija (`.specify/memory/constitution.md`)

Vsebuje stalna pravila, po katerih `/speckit-plan`, `/speckit-analyze` in `/speckit-converge` presojajo delo:

- **Nefunkcionalne zahteve** (iz prvotnega seznama zahtev):
  - zavarovan REST vmesnik;
  - WCAG 2.1 AA;
  - odziven vmesnik;
  - PWA;
  - izolacija kontaktov med skupinami;
  - prikaz uspehov in napak na UI;
  - GDPR (izvoz podatkov, izbris računa);
  - vmesnik v slovenščini in angleščini;
  - optimistično zaklepanje pri urejanju kontaktov in članov;
  - paginacija.
- **Tehnološki sklad:**
  - React, TypeScript, i18n, nginx;
  - Tailwind CSS v4 (žetoni iz `design.md`; privzeta paleta izključena), shadcn/ui neobvezno;
  - Spring Boot;
  - PostgreSQL;
  - Firebase Authentication (samo identiteta, ponudnik Google).

  Avtorizacija je lastna, po vlogah v skupini.
- **Pravila testov:**
  - najprej testi, nato koda (2.1);
  - testi se spreminjajo samo zaradi specifikacije (2.2);
  - brez pravih zunanjih storitev (2.4);
  - matrika izolacije (2.5);
  - UI testi po vlogah (2.6);
  - axe (2.7);
  - trije viewporti (2.8);
  - branje izvoza Excel (2.9).

  Testi so obvezni za vsako funkcionalnost; to je nujno, ker jedrni `/speckit-tasks` testnih nalog brez zahteve ne ustvari.
- **Prepoved utišanja opozoril** brez vnosa v `DECISIONS.md` (3.4).

### 5.2 `CLAUDE.md` (~20 vrstic)

`CLAUDE.md` v korenu repozitorija je kratek kazalec na te dokumente in povzetek pravil iz 2–3. Vzdržujeva ga ročno (razširitve `agent-context` ne uporabljava); daljši od ~25 vrstic ne sme biti.
