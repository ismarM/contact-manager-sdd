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
