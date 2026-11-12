# Sledljivost: 011-dvojniki

Stanje po fazi *Testi* (test-first, workflow §4.2; pregled: **ROČNO ODOBRENO – izjema D-98**): testi T008–T032 so napisani, implementacije (T034 …) še ni, zato testi s pričakovanim vedenjem **padajo zaradi pravega razloga** (`501`, `UnsupportedOperationException`, `not implemented`, manjkajoča pot ali zavihek). Zaščitni primeri 401/403/404/405/409 so zeleni že ob ogrodju. Stanje stolpca *Stanje* se po implementaciji posodobi v »zelen«.

Pot do testov: BE `backend/src/test/java/si/contactmanager/contact/…` (`*Test` unit, `*IT` integracijski, `*SecurityIT` varnostni), FE `frontend/src/features/duplicates/…`, E2E `e2e/tests/dvojniki.spec.ts`.

| FR-ID | Scenarij | Testi (datoteka) | Stanje |
|---|---|---|---|
| FR-011-01 | zavihek, razlaga za bralca in arhivirano skupino | DuplicatesPage.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-02 | izbira kategorije, naslov strani | DuplicateSearchIT; DuplicatesPage.test; DuplicateResults.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-03 | ime in priimek, normalizacija | DuplicateKeysTest; DuplicateSearchIT | napisan, pada (ni implementacije) |
| FR-011-04 | e-naslov | DuplicateKeysTest; DuplicateSearchIT; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-05 | telefon | DuplicateKeysTest; DuplicateSearchIT | napisan, pada (ni implementacije) |
| FR-011-06 | prazne vrednosti | DuplicateKeysTest; DuplicateSearchIT | napisan, pada (ni implementacije) |
| FR-011-07 | skupine, razlog, strani, prazno stanje | DuplicateGroupsTest; DuplicateSearchIT; DuplicatePerformanceIT; DuplicateResults.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-08 | tabela razlik | DuplicateCompareIT; ComparePage.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-09 | izbira vrednosti, enaka polja | mergeModel.test; ComparePage.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-10 | značke | mergeModel.test; ComparePage.test | napisan, pada (ni implementacije) |
| FR-011-11 | izločitev, ohranjeni kontakt | MergeIT; mergeModel.test; ComparePage.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-12 | predogled | ComparePage.test; CompareA11y.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-13 | validacija rezultata | MergeInputParserTest; MergeValidationIT; mergeModel.test; MergeFlow.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-14 | potrditveni dialog | MergeFlow.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-15 | atomarna združitev | MergeIT; MergeAtomicityIT; MergeConcurrencyIT; MergeLargeGroupIT; MergeFlow.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-16 | konflikt verzij | MergeVersionConflictIT; MergeConcurrencyIT; MergeFlow.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-17 | en vnos MERGE, rollback 005 | MergeAuditIT; MergeRollbackIT; MergeFlow.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-18 | obvestilo in napake | MergeFlow.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-19 | vloge, arhivirana skupina | DuplicateArchivedIT; DuplicateIsolationMatrixSecurityIT; DuplicatesPage.test; dvojniki.spec | napisan, pada (ni implementacije) |
| FR-011-20 | kontakti druge skupine | DuplicateCompareIT; DuplicateIsolationMatrixSecurityIT | napisan, pada (ni implementacije) |
| FR-011-21 | največ 10 kontaktov | DuplicateGroupsTest; MergeInputParserTest; DuplicateCompareIT; MergeValidationIT; MergeLargeGroupIT; DuplicateIsolationMatrixSecurityIT; DuplicateResults.test; ComparePage.test; CompareA11y.test; dvojniki.spec | napisan, pada (ni implementacije) |

| SC | Testi | Stanje |
|---|---|---|
| SC-001 | dvojniki.spec | napisan, pada (ni implementacije) |
| SC-002 | DuplicatePerformanceIT | napisan, pada (ni implementacije) |
| SC-003 | MergeIT; MergeAuditIT; MergeLargeGroupIT; dvojniki.spec | napisan, pada (ni implementacije) |
| SC-004 | MergeVersionConflictIT; MergeConcurrencyIT | napisan, pada (ni implementacije) |
| SC-005 | MergeRollbackIT; MergeLargeGroupIT; dvojniki.spec | napisan, pada (ni implementacije) |
| SC-006 | DuplicateIsolationMatrixSecurityIT; dvojniki.spec | napisan, pada (ni implementacije) |

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

### Neblokirajoča priporočila 4. kroga, ki niso izvedena

- **T030 ostaja odprt (nepokrito):** `CompareA11y.test.tsx` nima preverjanja paritete DOM po vlogah pri 360 in 1280 px prek `matchMedia` ter dosegljivosti »Ostane« in »Izloči iz združevanja« v obeh. Zahteva ni neposredno v spec; 360 px pokriva E2E. Naloga ni označena kot opravljena.
- `DuplicateIsolationMatrixSecurityIT` (11 identitet s tujim kontaktom): test sprejme `400` ali `404`; pravilo (R-07, D-97) se ne zaostruje.
- Test poti `…/duplicates/xyz` (»Te strani ni«) je zelen že ob ogrodju kot regresijski varovalec.

## Meritve

Še ne izmerjeno (SC-002 `DuplicatePerformanceIT` teče šele z implementacijo v `./verify.sh full`).
