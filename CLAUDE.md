# CLAUDE.md – Contact Manager

## Dokumenti
- Pravila in potek dela: .specify/memory/constitution.md (edini dokument s pravili)
- Skupna pravila izdelka (vloge, vrstni red preverjanj, kode napak, slovar podatkov): .specify/memory/feature-map.md
- Oblikovanje: .specify/memory/design.md · arhitekturne odločitve: docs/decisions/
- Zahteve funkcionalnosti: specs/NNN-ime/ (artefakti Spec Kit) · original_documentation/ je zgodovinski arhiv – ne spreminjaj ga
- Trenutna funkcionalnost: .specify/feature.json (veja `ime` brez številke; `scripts/feature.sh ime`)

## Preverjanje
- ./verify.sh quick – format, lint, tipi, utišanja, unit in FE testi; pred zaključkom vsake naloge
- ./verify.sh backend | e2e – integracijski in varnostni testi zaledja | sistem in E2E; ko sprememba to zadeva
- CI požene quick, backend in e2e vzporedno; `full` (vse skupaj) lokalno ni potreben
- Celoten izpis: .verify/last.log (odpri le, če kratek izpis ne zadošča)

## Pravila
- Majhna sprememba: brez artefaktov Spec Kit. Funkcionalnost: cikel specify → clarify → plan → tasks → analyze → implement → converge (konstitucija §2.3).
- Implement teče v enem prehodu: koda in testi skupaj; brez ločene faze, pregleda ali commita testov. Od plana do PR delaj sam; ustavi se le v primerih iz §2.4. Združita razvijalca (izjema: /rollout).
- Analyze: ugotovitve CRITICAL in HIGH odpravi v artefaktih, en krog. Converge: do »Converged«, največ dve ponovitvi.
- Pred PR enkrat zaženi podagent `pregled-testov` nad končano razliko funkcionalnosti; pregled je svetovalen, en krog popravkov.
- Asercije nikoli ne oslabi, da bi prestala napačna koda; spremenjene obstoječe teste z razlogom navedi v opisu PR.
- Vsak endpoint skupine ima vnos v matriki izolacije (401/404/403/2xx, arhivirana 409). Endpointi in poti samo iz tabel Public Interfaces v plan.md.
- UI testi samo getByRole/getByLabel, imena iz prevodov ali skupnih pomočnikov; axe brez kršitev.
- V testih samo Firebase Auth Emulator, Testcontainers in MSW.
- Utišanje ali izklop testa samo s komentarjem `utišanje: <razlog>`; brez skrivnosti v Gitu; barve samo iz žetonov design.md.
- Samodejno uvajanje ene ali več funkcionalnosti: `/rollout` (§2.8) – nadzornik vodi delavce `izvajalec` skozi cikel, se posvetuje enkrat in ob zelenem CI združi PR.
- Poraba žetonov za ai-log: `node scripts/token-report.mjs` (ne ocenjuj).
- Ne ustvarjaj traceability.md, DECISIONS.md in oznak [CR-NN]; stari sklici D-NN kažejo v zgodovino Gita (`2365b23`).
