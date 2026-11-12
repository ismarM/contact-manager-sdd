# Sledljivost: 010 Izvoz izbranih kontaktov v Excel

## Pregled testov

Neodvisni agent `pregled-testov` (workflow.md §4.2, naloga T025).

| Krog | Izid | Ugotovitve |
|---|---|---|
| 1 | ZAVRNJENO | (1) ogrodje `ExportButton` mora izrisati `null`; (2) `ExportIT` mora iz datoteke brati tudi tabulator, CR in » =1«; (3, 4) FE in E2E veja *Nadaljuj z obstoječim izborom* pri novih zadetkih z dobesednimi obvestili, toastom in prenosom; (5) E2E primerja imena vseh vrstic; (6) matrika izolacije: nečlan ali neobstoječa skupina z neveljavnim telesom → `404`, ne `400` |
| 2 | SPREJETO | vse ugotovitve odpravljene; priporočili (FE test *Posodobi izbor* naj preveri 13 identitet v ponovnem izvozu, `ExportPerformanceIT` ne preverja vsebinsko FR-010-13) ne vplivata na izid |

Test 009 `SelectionActionBar.test.tsx` je spremenjen z D-91 (`sprememba-testa`).

## Sledljivost zahtev

| FR / SC | Testi | Stanje |
|---|---|---|
| FR-010-01 | `ExportButton.test`, `SelectionActionBar.test` (D-91), `izvoz-excel.spec` | zeleno |
| FR-010-02 | `ExportIT`, `ExportIsolationMatrixSecurityIT`, `ExportButton.test`, `izvoz-excel.spec` | zeleno |
| FR-010-03 … 06 | `ExportLabelsTest`, `ExportIT`, `izvoz-excel.spec` | zeleno |
| FR-010-07 | `ExportRequestParserTest`, `ExportIT`, `ExportButton.test`, `izvoz-excel.spec` | zeleno |
| FR-010-08, 09 | `CellTextTest`, `ExportIT`, `izvoz-excel.spec` | zeleno |
| FR-010-10 | `exportFileName.test`, `ExportButton.test`, `izvoz-excel.spec` | zeleno |
| FR-010-11 | `ExportSkippedIT`, `ExportButton.test` | zeleno |
| FR-010-12 | `ExportIsolationMatrixSecurityIT` | zeleno |
| FR-010-13 | `ExportRequestParserTest`, `ExportValidationIT`, `ExportButton.test` | zeleno |
| FR-010-14 | `ExportReadOnlyIT`, `izvoz-excel.spec` | zeleno |
| FR-010-15 | `ExportButton.test`, `izvoz-excel.spec` | zeleno |
| FR-010-16 | `ExportArchivedIT`, `ExportButton.test`, `izvoz-excel.spec` | zeleno |
| SC-001 … 006 | kot zgoraj; SC-002 `ExportPerformanceIT` | zeleno |

## Matrika izolacije `POST /api/groups/{groupId}/contacts/export`

| Primer | Izid |
|---|---|
| brez, neveljaven, potekel žeton | 401 |
| nečlan, neobstoječa skupina (tudi z neveljavnim telesom) | 404, prazno telo |
| tuja ali izmišljena identiteta | 404, prazno telo |
| VIEWER, EDITOR, ADMIN, OWNER; arhivirana in trajno arhivirana | 200 (nikoli 403/409 GROUP_ARCHIVED) |

## Meritve

SC-002 (`ExportPerformanceIT`, 10 000 kontaktov, 5 atributov, 3 značke, strežnik, brez omrežja): p50 ≈ 285 ms, p95 ≈ 360–380 ms, največ ≈ 380 ms (cilj p95 < 10 s). Okolje: Testcontainers `postgres:18-alpine`, lokalni razvijalski računalnik.

## Rezultat `./verify.sh full`

Zelen (1128 s) po popravku avtorizacije prenosa (`authFetchBlob`) in E2E testov (D-92).
