# CLAUDE.md – Contact Manager

## Dokumenti
- Zahteve (vir resnice): specs/NNN-ime/spec.md · razdelitev in skupna pravila: .specify/memory/feature-map.md
- Konstitucija: .specify/memory/constitution.md · potek: .specify/memory/workflow.md · oblikovanje: .specify/memory/design.md
- Odločitve: DECISIONS.md · original_documentation/ je zgodovinski arhiv – ne spreminjaj ga
- Trenutna funkcionalnost: .specify/feature.json (nastavi `scripts/feature.sh ime`); veje so brez številk

## Preverjanje
- ./verify.sh quick – format, lint, tipi, utišanja, unit in FE testi; pred zaključkom vsake naloge
- ./verify.sh full – + integracijski, varnostni, E2E; pred združitvijo v main
- Celoten izpis: .verify/last.log (odpri le, če kratek izpis ne zadošča)

## Pravila
- Najprej testi (padejo zaradi pravega razloga), nato koda; pred kodo teste pregleda nov podagent `pregled-testov` (workflow §4.2) – koda šele po SPREJETO; testi v ločenem commitu `test(NNN)`.
- Od plana do PR delaj sam, brez čakanja; ustavi se le v primerih iz workflow §0.2 (pod tabelo). Združita razvijalca.
- Testa nikoli ne spremeni, da bi ustrezal kodi; vsaka sprememba testa → vnos v DECISIONS.md.
- Testi nosijo FR-ID (@Tag / ime testa); UI testi samo getByRole/getByLabel; axe brez kršitev.
- Vsak endpoint skupine ima vnos v matriki izolacije (401/404/403/2xx, arhivirana 409).
- Endpointi, poti in dostopna imena samo iz tabel Public Interfaces v plan.md.
- V testih samo Firebase Auth Emulator, Testcontainers in MSW.
- Brez utišanja opozoril brez D-NN v DECISIONS.md; brez skrivnosti v Gitu; barve samo iz žetonov design.md.
