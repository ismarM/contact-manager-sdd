# AI Development Log – Ismar

Pravila beleženja: `docs/ai-development-log.md` (v zgodovini Gita, commit `b71c0c2`). Poraba žetonov:
[token-report-ismar.md](token-report-ismar.md). Vsak razdelek *Seja N* ustreza vrstici *N* v poročilu o žetonih.

<!--
  NAVODILO ZA AGENTA (izbriši ob prvem vpisu):
  - En razdelek »Seja N« na pogovor (sejo) s Claude Code, 1:1 z vrstico N v token-report-ismar.md.
  - Polja, ki veljajo za celo sejo (datum, razvijalec, agent, model, veja, žetoni), samo enkrat v glavi seje.
  - Vsako interakcijo zapiši kot vrstico tabele v kronološkem vrstnem redu: sporočila razvijalca, odgovore v dialogih,
    klike gumbov, ukaze in korake, ki jih je agent izvedel sam na podlagi istega sporočila (podvrstice 3a, 3b …),
    ter podagente.
  - Točen prompt dobesedno; zelo dolg prompt v prilogo na koncu seje in v tabeli povezava nanjo.
  - Kategorije težav: none, agent-error, spec-ambiguity, tool-or-environment, human-decision.
  - Status: accepted, partial, rejected (»–« za interakcije brez rezultata, npr. ukaz).
  - Primer izpolnjenega dnevnika: patrik.md.
-->

## Pregled

| Seja (`token-report-ismar.md`) | Seja Claude Code | Čas (‹datum›) | Funkcionalnost | Opomba |
|---|---|---|---|---|
| 1 | `‹ID seje›` (‹CLI / namizna aplikacija›) | ‹od–do› | `‹NNN-ime›` | ‹npr. samodejno zgoščanje konteksta, podagenti› |

**Stolpci tabel interakcij**

- **#:** vrstni red v seji; podvrstice (npr. 4a) so koraki, ki jih je agent izvedel sam na podlagi istega sporočila.
- **Vrsta:** *sporočilo*, *dialog*, *gumb*, *ukaz*, *agent*, *podagent*.
- **Kategorija težave:** `none`, `agent-error`, `spec-ambiguity`, `tool-or-environment`, `human-decision`.
- **Status:** `accepted`, `partial`, `rejected`.

---

## Seja 1 — ‹NNN-ime›

- **Datum:** ‹YYYY-MM-DD, od–do›
- **Razvijalec:** Ismar
- **Agent / model:** ‹Claude Code (CLI / namizna aplikacija)›, ‹točna različica modela›; ‹podagenti, če so bili›
- **Veja / commiti:** `‹veja›` – ‹commiti, PR›
- **Poraba žetonov:** ‹skupaj› (`token-report-ismar.md`, seja 1)

| # | Vrsta | Točen prompt / odgovor | Faza SDD | Rezultat / spremenjene datoteke | Preverjanje | Težava (kategorija) | Status |
|---|---|---|---|---|---|---|---|
| 1 | sporočilo | `‹točen prompt›` | ‹specify / clarify / plan / tasks / analyze / implement / review / converge / dokumentacija› | ‹kaj je nastalo, katere datoteke› | ‹testi, verify.sh, pregled› | ‹opis› (‹kategorija›) | ‹status› |
| 1a | dialog | ‹odgovor na vprašanje agenta› | | | | | |
| 2 | agent | ‹korak, ki ga je agent izvedel sam› | | | | | |

**Povzetek seje 1**

| Metrika | Rezultat |
|---|---|
| Sporočila razvijalca / odgovori v dialogu / gumbi / ukazi | |
| Interakcije uspešne brez dodatnega poziva | |
| Dodatni pozivi ali popravki navodil | |
| Potrjene napake agenta | |
| Nejasne ali spremenjene zahteve | |
| Napake, odkrite z drugim agentom | |
| Preverjanje s testi | |
