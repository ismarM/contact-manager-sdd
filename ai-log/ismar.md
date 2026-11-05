# AI Development Log – Ismar

Pravila beleženja: `docs/ai-development-log.md` (v zgodovini Gita, commit `b71c0c2`). Poraba žetonov:
[token-report-ismar.md](token-report-ismar.md). Vsak razdelek *Seja N* ustreza vrstici *N* v poročilu o žetonih.

## Pregled

| Seja (`token-report-ismar.md`) | Seja Claude Code | Datum, čas | Funkcionalnost | Opomba |
|---|---|---|---|---|
| 1 | `00793e9d` (T3 Code, Claude Code) | 2026-11-05, od 20:37 (CET) | `002-skupine` – clarify, plan, pregled plana, uskladitev odločitev | menjava modela med sejo (Sonnet 5.5 → Opus 5.5); brez podagentov |

**Stolpci tabel interakcij**

- **#:** vrstni red v seji; podvrstice (npr. 4a) so koraki, ki jih je agent izvedel sam na podlagi istega sporočila.
- **Vrsta:** *sporočilo*, *dialog*, *gumb*, *ukaz*, *agent*, *podagent*.
- **Kategorija težave:** `none`, `agent-error`, `spec-ambiguity`, `tool-or-environment`, `human-decision`.
- **Status:** `accepted`, `partial`, `rejected`.

---

## Seja 1 — 002-skupine

- **Datum:** 2026-11-05, od 20:37 (CET; konec seje ob pisanju še ni znan)
- **Razvijalec:** Ismar
- **Agent / model:** Claude Code v T3 Code; `claude-sonnet-5-5` (#1–#4: preverjanje okolja, clarify, plan), `claude-opus-5-5`
  (#5–#6: pregled plana, uskladitev odločitev in commiti; model zamenjal razvijalec z `/model`). Oba modela potrjuje lokalni
  dnevnik seje. Podagenti: ni.
- **Veja / commiti:** `skupine` – `f7689fe` (clarify), `b1ecc5c` (D-25 … D-28), `8cbf543` (plan), commit tega dnevnika; brez `git push`
- **Poraba žetonov:** ni podatka (`token-report-ismar.md` še ni izpolnjen)

| # | Vrsta | Točen prompt / odgovor | Faza SDD | Rezultat / spremenjene datoteke | Preverjanje | Težava (kategorija) | Status |
|---|---|---|---|---|---|---|---|
| 1 | sporočilo | »Preveri, v kateri mapi in na kateri Git veji dejansko teče ta seja. Izvedi: pwd / git branch --show-current / scripts/feature.sh. Ničesar ne spreminjaj.« | dokumentacija | mapa `contact-manager-sdd`, veja `skupine`, funkcionalnost `specs/002-skupine` | izpis ukazov | none | accepted |
| 2 | ukaz | `/speckit-clarify` (brez argumentov) | clarify | pregled spec; 1 vprašanje: ali nespremenjeno shranjevanje podatkov skupine poveča verzijo ter posodobi izvajalca in čas | `checklists/requirements.md` ponovno preverjen, stanje nespremenjeno (vse `[x]`) | `check-prerequisites.sh` brez izvršilne pravice, zagnan z `bash` (tool-or-environment) | accepted |
| 2a | dialog | `A` | clarify | `spec.md`: razdelek *Clarifications* (seja 2026-11-05), dopolnjen robni primer »nespremenjeni podatki« in FR-002-12 | samo specifikacija | none | accepted |
| 2b | agent | zapis v dnevnik | dokumentacija | dnevnik zapisan v `ai-log/ismar.md` | – | navodilo (`CLAUDE.local.md`) navaja `ai-logs/`, mapa je `ai-log/` (tool-or-environment); zapis je bil kot predloga z dvema »Seja 2« (agent-error, popravljeno v #6) | partial |
| 3 | ukaz | `/speckit-plan` (brez argumentov) | plan | `plan.md`, `research.md` (R-01 … R-13), `data-model.md`, `contracts/openapi.yaml`, `quickstart.md` | Constitution Check PASS pred in po fazi 1; testi in `verify.sh` niso bili zagnani | `setup-plan.sh` zagnan z `bash` (tool-or-environment); napake agenta, odkrite pozneje (#4, #6): različni imeni istega testa (`GroupInputValidatorTest`/`GroupInputParserTest`), nepreverjena trditev o ICU v sliki `postgres:18-alpine`, v R-13 sklic na konstitucijo V namesto II, nejasna priprava podatkov za E2E (agent-error) | partial |
| 4 | sporočilo | pregled zaključenega plana (prompt v prilogi A) | review | razlaga arhitekture in povezave z 001; seznam odprtih odločitev (403 `FORBIDDEN`, ime paginacije v design.md 8.9, vpliv na 003/007/012, priprava podatkov za E2E); predlog commitov; pregled dnevnika | samo branje, brez sprememb | odkrite nedoslednosti plana in dnevnika (glej #3, #2b) | accepted |
| 5 | sporočilo | potrditev odločitev, uskladitev dokumentov, dnevnik in commiti (prompt v prilogi B) | dokumentacija | glej #6 | – | – (human-decision) | accepted |
| 6 | agent | izvedba #5 | dokumentacija | `DECISIONS.md` D-25 … D-28; `feature-map.md` §2.2 in §2.10 (`FORBIDDEN`); `design.md` 8.9 (ime paginacije); `plan.md`, `research.md` (R-12, R-13, sklici D-NN, ICU označen kot nepreverjen), `data-model.md`, `contracts/openapi.yaml` usklajeni; popravljeni napake iz #3; ta dnevnik preurejen v eno sejo | `git diff` pregledan pred commiti; gitleaks (pre-commit) brez najdb; testi niso bili zagnani (samo dokumentacija) | ukaz `ls -t` v lupini je alias za drugo orodje (tool-or-environment) | accepted |

**Potrjene odločitve razvijalca (#5)**

1. `403` s kodo `FORBIDDEN`; nečlan ostane `404`; vrstni red §2.2 nespremenjen → D-25.
2. Paginacija z opisnimi imeni (»Strani rezultatov: Lastnik«) → D-26.
3. `archived_at` je vir stanja arhiviranosti; 002 bere, 003 piše → D-27.
4. `group_member.version` ostane za optimistično zaklepanje → D-27.
5. Skupni `GroupAccess` za članstvo, vloge in dostop → D-27.
6. Testni podatki za vloge neposredno v testni bazi, brez produkcijskih endpointov za teste → D-27.
7. ICU razvrščanje po jeziku vmesnika, preverjeno z integracijskim testom na dejanski sliki PostgreSQL → D-28.

D-25, D-26 in D-27 spreminjajo skupne dokumente ali vplivajo na druge funkcionalnosti; drugi razvijalec (Patrik) jih potrdi ob pregledu PR 002.

**Povzetek seje 1**

| Metrika | Rezultat |
|---|---|
| Sporočila razvijalca / odgovori v dialogu / gumbi / ukazi | 3 / 1 / 0 / 2 (+ `/model`) |
| Interakcije uspešne brez dodatnega poziva | #1, #2, #2a, #4 |
| Dodatni pozivi ali popravki navodil | #5 (potrditev odločitev in uskladitev) |
| Potrjene napake agenta | 5 (#2b dnevnik; #3 ime testa, trditev o ICU, sklic na konstitucijo, nejasna priprava E2E) – vse popravljene v #6 |
| Nejasne ali spremenjene zahteve | 1 (verzija pri nespremenjenem shranjevanju, #2a) |
| Napake, odkrite z drugim agentom | 0 |
| Preverjanje s testi | ni izvedeno (faze clarify in plan, samo dokumentacija) |

### Priloga A – prompt #4

```text
Pred nadaljevanjem na `/speckit-tasks` želim pregledati zaključeni načrt.

1. Na kratko mi razloži arhitekturo 002-skupine in kako bo povezana z 001-prijava.
2. Preveri, ali obstajajo odprte odločitve, ki jih morava s Patrikom potrditi pred implementacijo, predvsem R-12 (403 FORBIDDEN).
3. Preveri `git status` in povej, katere spremembe iz clarify in plan še niso commitane.
4. Predlagaj ustrezne commite po najinem workflow.md.
5. Preveri, da je `ai-log/ismar.md` posodobljen.

Za zdaj ne spreminjaj datotek in ne izvajaj commitov. Ne začenjaj še tasks ali implementacije.
```

### Priloga B – prompt #5 (skrajšano: ohranjeni naslovi in potrjene odločitve, izpuščena podrobna navodila za poročilo)

```text
Nadaljujva z razvojem funkcionalnosti **002-skupine** po našem SDD postopku. […]

### 1. Potrjene tehnične odločitve
Kot odgovorni razvijalec za 002 potrjujem:
1. **HTTP 403 – FORBIDDEN:** Dodaj strojno berljivo kodo `FORBIDDEN` v register napak. Uporabnik, ki ni član skupine, mora še
   vedno prejeti 404, da ne razkrivamo obstoja tujih skupin. Ohrani vrstni red preverjanj iz `feature-map.md` §2.2.
2. **Dostopnost paginacije:** Uporabi opisna dostopna imena, npr. »Strani rezultatov: Lastnik«, […]
3. **Arhiviranje skupin:** Uporabi `archived_at` kot vir stanja arhiviranosti. Funkcionalnost 002 to stanje samo bere, spreminjanje
   pa pripada funkcionalnosti 003.
4. **Verzioniranje članstev:** Obdrži `group_member.version` za optimistično zaklepanje.
5. **Avtorizacija:** Uporabi skupni `GroupAccess`, […]
6. **E2E testni podatki:** Za skupine z različnimi vlogami uporabi namensko pripravo podatkov neposredno v testni bazi. Ne dodajaj
   produkcijskih endpointov samo za testiranje.
7. **ICU kolacije:** Obdrži razvrščanje glede na jezik vmesnika, vendar preveri podporo in pravilnost delovanja na dejanski
   PostgreSQL konfiguraciji z integracijskim testom.

### 2. Uskladitev SDD dokumentacije […]
### 3. AI Development Log […]
### 4. Git commiti […] Ne vključuj nepovezanih sprememb in ne izvajaj `git push` brez mojega navodila.
### 5. Končno poročilo […]
**Pomembno:** Ne izvajaj še `/speckit-tasks`, `/speckit-implement` ali `/speckit-converge`. […]
```
