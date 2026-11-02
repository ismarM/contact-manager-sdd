# DECISIONS – dnevnik odločitev

Vrste vnosov (`workflow.md` §4.3): `odločitev`, `sprememba-testa`, `utišanje`, `sprememba-specifikacije`.
Vnosi so oštevilčeni `D-NN` in se ne brišejo; preklicana odločitev dobi nov vnos, ki se sklicuje na starega.

| ID | Datum | Avtor | Vrsta | Odločitev in utemeljitev |
|---|---|---|---|---|
| D-01 | 2026-11-02 | razvijalca + Claude Code | odločitev | Spec Kit 1.2.6 (`specify init --here --integration claude --script sh --extension git`). Prvotni dokumenti so premaknjeni v `original_documentation/` in ostanejo nespremenjeni kot zgodovinski arhiv; živi dokumenti so v `.specify/memory/` (`constitution.md`, `workflow.md`, `feature-map.md`, `design.md`). |
| D-02 | 2026-11-02 | razvijalca + Claude Code | odločitev | Veje funkcionalnosti so **brez številk** (`kontakti`), mape ostanejo oštevilčene (`specs/004-kontakti/`), ker je številka del FR-ID. Kavelj `before_specify` (`speckit.git.feature`) je v `.specify/extensions.yml` izklopljen, ker vedno ustvari oštevilčeno vejo; vejo in `.specify/feature.json` nastavi `scripts/feature.sh`. |
| D-03 | 2026-11-02 | razvijalca + Claude Code | odločitev | Prilagojene predloge `spec-template.md`, `plan-template.md`, `tasks-template.md` v `.specify/templates/overrides/` (FR-ID, negativni scenariji, *Public Interfaces*, obvezni testi s pregledom). Vsebina dokumentov Spec Kit je v slovenščini, naslovi razdelkov ostanejo angleški, da jih ukazi Spec Kit najdejo. |
| D-04 | 2026-11-02 | razvijalca + Claude Code | odločitev | Razdelitev zahtev na funkcionalnosti 000–012 in skupna pravila (vrstni red preverjanj, `409 GROUP_ARCHIVED`, `409 VERSION_CONFLICT`, `400 VALIDATION_FAILED`, slovar podatkov) sta v `feature-map.md`. Specifikacije vseh funkcionalnosti so ustvarjene z `/speckit-specify` na veji `main`; nadaljnje faze tečejo na vejah posameznih funkcionalnosti. |
