# Arhitekturne odločitve

Tu so zapisane samo odločitve, ki jih iz kode ni mogoče razbrati (pravila: `.specify/memory/constitution.md` §2.6):
nova knjižnica ali zunanja storitev, sprememba avtentikacije, pomembna odločitev o shemi, odstop od pravil projekta.
Spremembe testov, predpostavke in manjše izbire sodijo v opis commita ali PR.

- Ena datoteka na odločitev: `LLLL-MM-DD-kratko-ime.md`. Brez številčenja.
- Odločitev se ne popravlja za nazaj; če jo nova nadomesti, nova datoteka to pove v vrstici *Nadomešča*.
- Odločitve prve različice (`D-01` … `D-104`) so v zgodovini Gita: `git show 2365b23:DECISIONS.md`.

## Predloga

```markdown
# Kratek naslov odločitve

- **Datum:** LLLL-MM-DD
- **Avtor:** kdo je odločil
- **Nadomešča:** – (ali ime datoteke)

## Kontekst
Kaj je bilo treba odločiti in zakaj.

## Odločitev
Kaj velja od zdaj naprej.

## Posledice
Kaj to pomeni za kodo, teste ali uporabnike; kaj smo zavrnili.
```
