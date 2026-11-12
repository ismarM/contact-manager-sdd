# Sledljivost: 009 Izbor in množično urejanje kontaktov

*Tabela FR-ID → testi → stanje se izpolni v T052. Stanje po pregledu testov: vsi testi T008–T029 pišejo in padejo zaradi manjkajočega vedenja.*

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
