# Sledljivost: 010 Izvoz izbranih kontaktov v Excel

## Pregled testov

Neodvisni agent `pregled-testov` (workflow.md §4.2, naloga T025).

| Krog | Izid | Ugotovitve |
|---|---|---|
| 1 | ZAVRNJENO | (1) ogrodje `ExportButton` mora izrisati `null`; (2) `ExportIT` mora iz datoteke brati tudi tabulator, CR in » =1«; (3, 4) FE in E2E veja *Nadaljuj z obstoječim izborom* pri novih zadetkih z dobesednimi obvestili, toastom in prenosom; (5) E2E primerja imena vseh vrstic; (6) matrika izolacije: nečlan ali neobstoječa skupina z neveljavnim telesom → `404`, ne `400` |
| 2 | SPREJETO | vse ugotovitve odpravljene; priporočili (FE test *Posodobi izbor* naj preveri 13 identitet v ponovnem izvozu, `ExportPerformanceIT` ne preverja vsebinsko FR-010-13) ne vplivata na izid |

Test 009 `SelectionActionBar.test.tsx` je spremenjen z D-91 (`sprememba-testa`).
