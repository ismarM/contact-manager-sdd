# Sledljivost: Revizijska sled skupine (005)

Izpolnjuje se skozi implementacijo (T045). Spodaj je zapis pregleda testov (T026).

## Pregled testov (workflow.md §4.2)

Pregledovalec: podagent `pregled-testov`. Obseg: 9 testnih razredov zaledja, 8 datotek vmesnika, 1 E2E scenarij + podpora; vseh 20 FR-005.

| Krog | Izid | Ugotovitve |
|---|---|---|
| 1 | ZAVRNJENO | FR-005-06 brez preverjanja vlog/članstev; napačno štetje skupin v `AuditDetails.test`; manjkajoča menjava velikosti strani sprememb; rollback iz filtriranega pogleda brez preverbe telesa; filter po kontaktu brez MERGE/ROLLBACK; nedotaknjen sledeni kontakt; DELETE z verzijo izpred rollbacka; 404 za neobstoječ vnos in vrstni red 400 → 409 |
| 2 | SPREJETO | vse odpravljeno; FR-005-06 sprejeto z obveznostjo spodaj |

Obveznosti za druge funkcionalnosti:
- **006/007** (članstva, vloge, povabila): v svojih testih preverita, da `audit_entry` za skupino ostane nespremenjen (FR-005-06, US1 sc. 8). Zapisati v njuni `tasks.md`.
- **009/011**: uporabljata `AuditLog.record` (pogodba v `plan.md`, testirana v `AuditRecordingIT`).

Opombe: izbirnik `summaryOf` za `details/summary` je dokumentiran izjema (D-48). Tri priporočila (brez izbirnika, tri strani za *Začetno stanje*, okno `created_at`) niso bila sprejeta kot obvezna.

## Sledljivost zahtev

| FR | Zaledje (IT / enotni / varnostni) | Vmesnik | E2E | Izvedba |
|---|---|---|---|---|
| FR-005-01 | AuditRecordingIT | — | revizijska-sled.spec (1) | ContactService (record v create/update/delete), AuditLog |
| FR-005-02 | AuditRecordingIT, ChangeDiffTest | AuditDetails.test | revizijska-sled.spec (1, 2) | ChangeDiff, AuditRepository.insert/changes |
| FR-005-03 | AuditRecordingIT (AuditLog.record) | AuditPage.test (stavki) | — | AuditLog.validate, AuditEntryItem (stavki) |
| FR-005-04 | AuditAtomicityIT, AuditRecordingIT | — | — | AuditLog @Transactional(MANDATORY) |
| FR-005-05 | AuditImmutabilityIT, AuditIsolationMatrixSecurityIT | — | — | V5 sprožilca, ApiExceptionHandler (405) |
| FR-005-06 | AuditRecordingIT (006/007: obveznost) | — | — | beleženje samo v ContactService |
| FR-005-07 | AuditReadIT, AuditIsolationMatrixSecurityIT | AuditPage.test | revizijska-sled.spec (1) | AuditController, AuditService, AuditPage |
| FR-005-08 | AuditReadIT, ChangeDiffTest | AuditDetails.test | revizijska-sled.spec (2) | AuditDetails, ChangeTable |
| FR-005-09 | AuditReadIT | AuditFilters.test, ContactReverted.test | revizijska-sled.spec (3, 4) | AuditFilters, auditRouting, ContactView |
| FR-005-10 | AuditReadIT | AuditPage.test | — | AuditController (paginacija), SectionPagination |
| FR-005-11 | AuditRollbackIT, AuditAtomicityIT, matrika | AuditRollback.test | revizijska-sled.spec (5) | RollbackService, ContactSnapshots.apply |
| FR-005-12 | AuditRollbackIT | AuditRollback.test, AuditEntryPage.test | revizijska-sled.spec (5) | AuditEntryItem (povezava), AuditEntryPage |
| FR-005-13 | AuditRollbackIT, AuditRollbackConcurrencyIT | — | — | RollbackService (verzije), AuditRepository.maxVersions |
| FR-005-14 | AuditRollbackConcurrencyIT | AuditRollback.test | revizijska-sled.spec (6) | RollbackService (zaklep glave, latestEntryId) |
| FR-005-15 | AuditRollbackRulesIT | AuditRollback.test | — | RollbackNoChangesException, AuditPage (najnovejši vnos) |
| FR-005-16 | — | AuditRollback.test | revizijska-sled.spec (5) | RollbackDialog |
| FR-005-17 | AuditRollbackRulesIT, matrika | AuditPermissions.test | revizijska-sled.spec (9) | AuditController.perform, AuditPage (canRestore) |
| FR-005-18 | — | AuditPage.test, AuditRollback.test, AuditDetails.test | — | AuditPage (banner), AuditDetails, AuditEntryPage |
| FR-005-19 | AuditRollbackIT | ContactReverted.test, AuditEntryPage.test | revizijska-sled.spec (5, 7) | ContactRepository (reverted), RevertedBadge |
| FR-005-20 | AuditRollbackIT, AuditRollbackRulesIT | AuditInitialState.test | revizijska-sled.spec (8) | RollbackService (seq 0), InitialStateItem |

## Merila uspeha

| SC | Test | Stanje |
|---|---|---|
| SC-001 | AuditRecordingIT | zeleno |
| SC-002 | AuditRollbackIT (60 operacij, 5 točk) | zeleno |
| SC-003 | AuditRollbackIT (10.000 / 1.000, < 10 s) | zeleno |
| SC-004 | ContactReverted.test, revizijska-sled.spec (4) | zeleno |
| SC-005 | AuditReadIT (100.000 vnosov, < 2 s) | zeleno |
| SC-006 | AuditIsolationMatrixSecurityIT, axe v FE in E2E | zeleno |

## Preverjanje (T045)

Zaledje: vsi audit IT, varnostni IT in IT 003/004 zeleni. Vmesnik: 392 funkcionalnih in 73 enotnih testov, lint, tipi in oblika zeleni. E2E: 222 testov (360/768/1280 px, axe) zelenih. `./verify.sh quick` se ustavi pri koraku *orodja* zaradi dveh testov skripte (Windows: simbolična povezava EPERM, JAVA_HOME); preostali koraki so bili zagnani ročno.
