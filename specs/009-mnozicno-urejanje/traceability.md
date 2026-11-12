# Sledljivost: 009 Izbor in množično urejanje kontaktov

Stanje: `./verify.sh full` zelen (2026-11-12): 779 FE testov, vsi integracijski in varnostni testi BE, 345 E2E testov (360/768/1280 px, axe).

## Pregled testov

Pregledovalec: podagent `pregled-testov` (vsak krog nov primerek).

| Krog | Izid | Blokirajoče ugotovitve | Popravek |
|---|---|---|---|
| 1 | ZAVRNJENO | FE iskanje po golem besedilu (2×); test dvojnega klika brez trdne asercije; manjka FR-009-02 (velikost strani, odjava); besedila izven plan.md | selektorji po vlogah; asercija `aria-disabled`; novi testi; plan.md + D-74 |
| 2 | ZAVRNJENO | FE: meja 10 000 pri ročnem izboru in »Izberi vse na strani« ni preizkušena v vmesniku | dva nova FE testa |
| 3 | ZAVRNJENO | BE: `selection-check` preizkušen samo z eno poizvedbo | test z dvema poizvedbama; odločitev o `key` pri predefiniranem polju (D-75) |
| 4 | **SPREJETO** | – | – |

Po krogu 3 je razvijalec izrecno odobril krog 4 (workflow §0.2 b) in zavrnitev `key` pri `address`/`email`/`phone` (D-75).

Neblokirajoča priporočila kroga 4, preložena na implementacijo: tipkovniška potrditev izbrisa v E2E, asercija števila izbranih pri *Posodobi izbor* nad mejo, fokus po *Počisti izbor* (test je ožji od plana).

Okolje: integracijski testi BE zagnani na Dockerju (Testcontainers); pad z `501` oziroma `UnsupportedOperationException`; primeri 401/404 v matriki so zeleni že ob ogrodju (T020).

## Sledljivost

| FR-ID / merilo | Testi (datoteka) | Stanje |
|---|---|---|
| FR-009-01 | ContactSelection.test.tsx; mnozicno-urejanje.spec.ts; selection.test.ts | zelen |
| FR-009-02 | ContactSelection.test.tsx; mnozicno-urejanje.spec.ts; selection.test.ts | zelen |
| FR-009-03 | BulkIsolationMatrixSecurityIT.java; ContactIdsIT.java; SelectionActionBar.test.tsx; mnozicno-urejanje.spec.ts; selection.test.ts | zelen |
| FR-009-04 | BulkInputParserTest.java; BulkPerformanceIT.java; BulkRequestValidationIT.java; BulkUpdateValidationIT.java; ContactIdsIT.java; ContactSelection.test.tsx; SelectionActionBar.test.tsx; SelectionCheckIT.java; selection.test.ts | zelen |
| FR-009-05 | SelectionActionBar.test.tsx; mnozicno-urejanje.spec.ts | zelen |
| FR-009-06 | BulkEditDialog.test.tsx; BulkInputParserTest.java; BulkLogIT.java; BulkRequestValidationIT.java; BulkUpdateIT.java; BulkUpdateValidationIT.java; mnozicno-urejanje.spec.ts | zelen |
| FR-009-07 | BulkEditDialog.test.tsx; BulkEditTest.java; BulkInputParserTest.java; BulkRequestValidationIT.java; BulkUpdateIT.java; BulkUpdateValidationIT.java; mnozicno-urejanje.spec.ts | zelen |
| FR-009-08 | BulkEditDialog.test.tsx; BulkEditTest.java; BulkInputParserTest.java; BulkRequestValidationIT.java; BulkUpdateIT.java | zelen |
| FR-009-09 | BulkEditDialog.test.tsx; BulkEditTest.java; BulkInputParserTest.java; BulkPerformanceIT.java; BulkSelectionChangedIT.java; BulkUpdateValidationIT.java; mnozicno-urejanje.spec.ts | zelen |
| FR-009-10 | BulkDeleteDialog.test.tsx; BulkSelectionChangedIT.java; SelectionCheck.test.tsx; SelectionCheckIT.java; mnozicno-urejanje.spec.ts | zelen |
| FR-009-11 | BulkIsolationMatrixSecurityIT.java; BulkSelectionChangedIT.java | zelen |
| FR-009-12 | BulkEditDialog.test.tsx; BulkUpdateIT.java; mnozicno-urejanje.spec.ts | zelen |
| FR-009-13 | BulkDeleteDialog.test.tsx; BulkDeleteIT.java; BulkRequestValidationIT.java; SelectionCheck.test.tsx; mnozicno-urejanje.spec.ts | zelen |
| FR-009-14 | BulkAuditIT.java; mnozicno-urejanje.spec.ts | zelen |
| FR-009-15 | BulkArchivedIT.java; BulkEditDialog.test.tsx; BulkIsolationMatrixSecurityIT.java; SelectionActionBar.test.tsx; mnozicno-urejanje.spec.ts | zelen |
| FR-009-16 | BulkConcurrencyIT.java; BulkEditTest.java; BulkUpdateIT.java | zelen |
| FR-009-17 | BulkDeleteDialog.test.tsx; BulkEditDialog.test.tsx; BulkUpdateValidationIT.java; SelectionActionBar.test.tsx; SelectionCheck.test.tsx; mnozicno-urejanje.spec.ts | zelen |
| FR-009-18 | BulkInputParserTest.java; BulkIsolationMatrixSecurityIT.java; BulkRequestValidationIT.java; SelectionCheck.test.tsx; SelectionCheckIT.java; mnozicno-urejanje.spec.ts; selection.test.ts | zelen |
| SC-001 | mnozicno-urejanje.spec.ts | zelen |
| SC-002 | BulkPerformanceIT.java | zelen |
| SC-003 | BulkArchivedIT.java; BulkUpdateValidationIT.java | zelen |
| SC-004 | BulkAuditIT.java | zelen |
| SC-005 | mnozicno-urejanje.spec.ts | zelen |


Testi nosijo FR-ID v `@Tag` (JUnit) oziroma v imenu testa (Vitest, Playwright); imena testov: glej datoteke v `backend/src/test/java/si/contactmanager/contact/` (`Bulk*`, `ContactIdsIT`, `SelectionCheckIT`), `frontend/src/features/contacts/selection/` in `e2e/tests/mnozicno-urejanje.spec.ts`.

## Meritve

- **SC-001** (300 kontaktov: filter, izbor vseh zadetkov, dodajanje značke, < 30 s od prvega klika): E2E `mnozicno-urejanje.spec.ts` trdi mejo 30 s; test zelen pri 360, 768 in 1280 px.
- **SC-002** (`BulkPerformanceIT`, 10 000 kontaktov, 3 značke + 3 atributi, Testcontainers v Dockerju na razvijalčevem računalniku; 20 merjenih `bulk-update`, p95 po najbližjem rangu < 15 s):
  - po D-80 (večvrstični `unnest` stavki): p50 3,7–3,8 s, p95 3,9–4,0 s, največ 4,0–4,1 s; pet zavrnitev po 0,17–0,21 s; `bulk-delete` 10 000: 1,5 s (`verify.sh full` in samostojen zagon);
  - pred D-80 (stavek na vrstico): v mirnem okolju p50 6,8 s / p95 7,4 s, pod obremenitvijo p50 19,2 s / p95 21,7 s (padel) – zato D-80.
- **SC-003** (nič spremenjeno ob zavrnitvi): `assertUnchanged` (verzije, vrednosti, število vnosov sledi) v `BulkUpdateValidationIT`, `BulkSelectionChangedIT`, `BulkArchivedIT`, `BulkIsolationMatrixSecurityIT`.
- **SC-005** (tipkovnica, 320/360 px, axe): E2E in axe v FE testih; akcijska vrstica pod 640 px `fixed` ob dnu, višina kot CSS spremenljivka (popravek po prvem E2E zagonu).

## Odstopanja in odločitve

D-72 (akcijska vrstica proti `design.md` 8.8, za razvijalca), D-73 – D-75 (analiza, besedila, `key` pri predefiniranem polju), D-76 – D-79 (popravki sprejetih testov), D-80 (zmogljivost), D-81 (kavelj pre-commit na Windowsu). Odprto: uskladitev spec 010 (FR-010-01, FR-010-02, FR-010-11).
