# Sledljivost: 011-dvojniki

Stanje po implementaciji in Convergu: vseh 21 FR in 6 SC ima zelene teste (BE unit/IT/varnostni, FE funkcionalni, E2E v Compose pri 360/768/1280 px). Test-first faza: pregled testov **ROČNO ODOBRENO – izjema D-98** (podagent `pregled-testov` je v štirih krogih vrnil ZAVRNJENO, SPREJETO ni bilo vrnjeno; glej razdelek *Pregled testov*). Spremembe testov po pregledu: D-99 (BE), D-100, D-101 (FE/E2E).

Pot do testov: BE `backend/src/test/java/si/contactmanager/contact/…` (`*Test` unit, `*IT` integracijski, `*SecurityIT` varnostni), FE `frontend/src/features/duplicates/…`, E2E `e2e/tests/dvojniki.spec.ts`.

| FR-ID | Scenarij | Testi (datoteka) | Stanje |
|---|---|---|---|
| FR-011-01 | zavihek, razlaga za bralca in arhivirano skupino | DuplicatesPage.test; dvojniki.spec | zelen |
| FR-011-02 | izbira kategorije, naslov strani | DuplicateSearchIT; DuplicatesPage.test; DuplicateResults.test; dvojniki.spec | zelen |
| FR-011-03 | ime in priimek, normalizacija | DuplicateKeysTest; DuplicateSearchIT | zelen |
| FR-011-04 | e-naslov | DuplicateKeysTest; DuplicateSearchIT; dvojniki.spec | zelen |
| FR-011-05 | telefon | DuplicateKeysTest; DuplicateSearchIT | zelen |
| FR-011-06 | prazne vrednosti | DuplicateKeysTest; DuplicateSearchIT | zelen |
| FR-011-07 | skupine, razlog, strani, prazno stanje | DuplicateGroupsTest; DuplicateSearchIT; DuplicatePerformanceIT; DuplicateResults.test; dvojniki.spec | zelen |
| FR-011-08 | tabela razlik | DuplicateCompareIT; ComparePage.test; dvojniki.spec | zelen |
| FR-011-09 | izbira vrednosti, enaka polja | mergeModel.test; ComparePage.test; dvojniki.spec | zelen |
| FR-011-10 | značke | mergeModel.test; ComparePage.test | zelen |
| FR-011-11 | izločitev, ohranjeni kontakt | MergeIT; mergeModel.test; ComparePage.test; dvojniki.spec | zelen |
| FR-011-12 | predogled | ComparePage.test; CompareA11y.test; dvojniki.spec | zelen |
| FR-011-13 | validacija rezultata | MergeInputParserTest; MergeValidationIT; mergeModel.test; MergeFlow.test; dvojniki.spec | zelen |
| FR-011-14 | potrditveni dialog | MergeFlow.test; dvojniki.spec | zelen |
| FR-011-15 | atomarna združitev | MergeIT; MergeAtomicityIT; MergeConcurrencyIT; MergeLargeGroupIT; MergeFlow.test; dvojniki.spec | zelen |
| FR-011-16 | konflikt verzij | MergeVersionConflictIT; MergeConcurrencyIT; MergeFlow.test; dvojniki.spec | zelen |
| FR-011-17 | en vnos MERGE, rollback 005 | MergeAuditIT; MergeRollbackIT; MergeFlow.test; dvojniki.spec | zelen |
| FR-011-18 | obvestilo in napake | MergeFlow.test; dvojniki.spec | zelen |
| FR-011-19 | vloge, arhivirana skupina | DuplicateArchivedIT; DuplicateIsolationMatrixSecurityIT; DuplicatesPage.test; dvojniki.spec | zelen |
| FR-011-20 | kontakti druge skupine | DuplicateCompareIT; DuplicateIsolationMatrixSecurityIT | zelen |
| FR-011-21 | največ 10 kontaktov | DuplicateGroupsTest; MergeInputParserTest; DuplicateCompareIT; MergeValidationIT; MergeLargeGroupIT; DuplicateIsolationMatrixSecurityIT; DuplicateResults.test; ComparePage.test; CompareA11y.test; dvojniki.spec | zelen |

| SC | Testi | Stanje |
|---|---|---|
| SC-001 | dvojniki.spec | zelen |
| SC-002 | DuplicatePerformanceIT | zelen |
| SC-003 | MergeIT; MergeAuditIT; MergeLargeGroupIT; dvojniki.spec | zelen |
| SC-004 | MergeVersionConflictIT; MergeConcurrencyIT | zelen |
| SC-005 | MergeRollbackIT; MergeLargeGroupIT; dvojniki.spec | zelen |
| SC-006 | DuplicateIsolationMatrixSecurityIT; dvojniki.spec | zelen |

## Pregled testov

**Izid: ROČNO ODOBRENO – izjema D-98.** Podagent `pregled-testov` je v vseh štirih krogih vrnil **ZAVRNJENO**; SPREJETO ni bilo vrnjeno. Razvijalec (Ismar) je izrecno odobril ročni zaključek test-first faze in izključil peti krog.

| Krog | Izid | Glavne ugotovitve | Odprava |
|---|---|---|---|
| 1 | ZAVRNJENO | vedno resnična asercija pri SC-001; manjkajoče oznake v `MergeIT`; manjkajoči primeri (vrstica z vsemi praznimi vrednostmi, UI za več kot 50 atributov, razlaga nad prvim poljem pri 360 px) | popravljeno |
| 2 | ZAVRNJENO | iskanje po golem besedilu; napake ob vrstici ni mogoče dokazati; vedno resnična asercija v `ComparePage.test.tsx` | popravljeno, dodan E2E pri 320 px |
| 3 | ZAVRNJENO | manjka FE test za FR-011-16, scenarij 5; v planu podrobnosti položaja alertov | dodan test v `MergeFlow.test`; plan poenostavljen na »ob vrstici« |
| 4 (izjema) | ZAVRNJENO | edina blokirajoča: `DuplicateResults.test` bere `aria-label`/`textContent` namesto dostopnega imena kartice | popravljeno: `toHaveAccessibleName` po vlogi `listitem` v vrstnem redu DOM |
| ročno | ODOBRENO | pregled diffa popravkov | – |

### Popravki po 4. krogu

- `DuplicateResults.test.tsx`: imena kartic prek `getAllByRole('listitem', { name })` in `toHaveAccessibleName`, vrstni red po zaporedju v DOM.
- `dvojniki.spec.ts` (SC-001): privzeta kategorija »Ime in priimek«, štetje klikov od odprtja zavihka brez ponastavljanja po izbiri kategorije.
- `MergeFlow.test.tsx`: ime testa FR-011-13 ne trdi več, da preverja fokus (asercije za fokus ni).

### Neblokirajoča priporočila 4. kroga

- **T030 zaključen v pravem brskalniku (Converge):** `dvojniki.spec.ts` »T030« primerja `ariaSnapshot` glavne vsebine primerjave pri 360 in 1280 px (enak), preverja vidnost in dosegljivost »Ostane« in »Izloči iz združevanja« ter odsotnost vodoravnega drsenja. Umetni `matchMedia` test ni bil napisan (ne preverja dejanskega CSS).
- `DuplicateIsolationMatrixSecurityIT` (11 identitet s tujim kontaktom): test sprejme `400` ali `404`; pravilo (R-07, D-97) se ne zaostruje.
- Test poti `…/duplicates/xyz` (»Te strani ni«) je zelen že ob ogrodju kot regresijski varovalec.

## Meritve

- **SC-001:** E2E `dvojniki.spec.ts` (urednik združi dva kontakta; klike šteje poslušalec `click` od odprtja zavihka *Dvojniki*): največ 4 kliki, zelen pri 360, 768 in 1280 px (sl in en).
- **SC-002:** `DuplicatePerformanceIT`, 5000 kontaktov (1000 skupin), 2 ogrevalni + 20 merjenih iskanj po kategoriji, prva stran (25 skupin): e-naslov p50 15 ms, p95 22 ms, največ 43 ms; ime in priimek p50 21 ms, p95 29 ms, največ 47 ms; telefon p50 13 ms, p95 20 ms, največ 22 ms (meja 3000 ms). Okolje: 16 CPU, Linux, Java 21.0.13, PostgreSQL 18 (Testcontainers).
- **SC-003:** `MergeIT`, `MergeAuditIT`, `MergeLargeGroupIT` (5 krogov, vsak natanko en vnos `MERGE`), `dvojniki.spec.ts`.
- **SC-004:** `MergeVersionConflictIT`, `MergeConcurrencyIT` (prekrivajoče združitve 20 ponovitev brez zastoja, združitev + urejanje, + množično urejanje, + arhiviranje, + rollback).
- **SC-005:** `MergeRollbackIT`, `MergeLargeGroupIT` (rollback pred krogom 3), `dvojniki.spec.ts` (admin povrne skupino prek obstoječega rollbacka 005, brez nove kode).
- **SC-006:** `DuplicateIsolationMatrixSecurityIT` (83 izvedb), `dvojniki.spec.ts`.

## Končna verifikacija (Converge)

- `./verify.sh full`: **zelen** (690 s) po združitvi `origin/main` (010) v `dvojniki`. Prvi zagon je padel: (a) E2E 004 pričakuje stare razdelke skupine brez »Dvojniki« → D-102 (sprememba-testa); (b) dva testa 007 (w360) sta presegla časovno omejitev prijave (okno emulatorja se ni odprlo) – v ločenem zagonu `kontakti` + `clani` 75/75 zelenih in v drugem polnem zagonu zelena.
- Converge: vseh 21 FR in 6 SC potrjenih (testi in koda), brez odprtih ugotovitev; T030 izpolnjen v pravem brskalniku; ostajata T060 (push, PR) in T061 (pregled razvijalcev).
- Skrivnosti: `gitleaks git --log-opts origin/main..HEAD`: brez najdb.

