# AI Development Log – Contact Manager

Namen: sproti beležiti, katere naloge sta izvajala AI agenta, kakšna navodila sta prejela, kaj je delovalo, kaj ni, in koliko človeških popravkov je bilo potrebnih. Ta dnevnik je osnova za predstavitev in primerjavo razvojnih pristopov.

## Dogovorjena pravila beleženja

- Vsako pomembno SDD fazo (constitution, specify, plan, tasks, implement, converge) in vsak večji popravek zabeleživa.
- Shraniva **točen prompt**, ne naknadno olepšanega povzetka. Daljše prompte hraniva kot `docs/ai-prompts/001.md`, `002.md` itd. in v dnevnik dodava pot.
- Zabeleživa tudi **uspešne naloge**, ne le napak. Tako je primerjava poštena.
- Napako ločiva od spremembe zahteve: `agent-error`, `unclear-requirement`, `human-decision`, `tool-or-environment` ali `none`.
- Zabeleživa, kako sva rezultat preverila (test, pregled kode, demonstracija), ne samo agentove trditve, da je naloga končana.
- Ne objavljava skrivnih ključev, zasebnih podatkov, celih avtentikacijskih tokenov ali občutljivih delov sej.
- Če drugi agent samo pregleda rezultat, to izrecno označiva kot **review**, ne kot neodvisno implementacijo.

---

## Seja 001 — [kratek opis]

- **Datum:** YYYY-MM-DD
- **Razvijalec:** [član ekipe]
- **Faza SDD:** [constitution / specify / clarify / plan / tasks / implement / converge / review]
- **Agent:** [Codex CLI / Claude Code]
- **Model (točna različica, če je prikazana):** [model]
- **Git veja / commit:** [veja, commit ali PR povezava]
- **Naloga / cilj:** [kaj sva želela doseči]
- **Vhodni dokumenti:** [npr. `docs/project-brief.md`, `spec.md`]
- **Točen prompt:** [prilepi besedilo ali poveži `docs/ai-prompts/001.md`]
- **Rezultat / spremenjene datoteke:** [kaj je agent izdelal]
- **Preverjanje:** [kaj sva zagnala in dejanski rezultat]
- **Težava:** [brez / natančen opis]
- **Kategorija težave:** [none / agent-error / unclear-requirement / human-decision / tool-or-environment]
- **Popravljeno navodilo:** [točen dodaten prompt ali povezava, če je bilo potrebno]
- **Število dodatnih pozivov:** [0, 1, 2 ...]
- **Končni status:** [accepted / needs-fix / rejected]
- **Opombe:** [kaj sva se naučila]

---

## Kratek povzetek za končno predstavitev

| Metrika | Rezultat |
|---|---|
| Skupno število zabeleženih nalog | [ ] |
| Naloge uspešne brez dodatnega poziva | [ ] |
| Naloge z vsaj enim popravkom navodil | [ ] |
| Potrjene napake agenta | [ ] |
| Nejasne ali spremenjene zahteve | [ ] |
| Napake, odkrite z drugim agentom | [ ] |
| Naloge s preverjenimi testi | [ ] |

*Opomba: številke so opisne in niso same po sebi dokaz, da je en razvojni pristop boljši od drugega.*
