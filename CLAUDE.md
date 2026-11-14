# CLAUDE.md – Contact Manager

## Dokumenti
- Pravila in potek dela: .specify/memory/constitution.md (edini dokument s pravili)
- Skupna pravila izdelka (vloge, vrstni red preverjanj, kode napak, slovar podatkov): .specify/memory/feature-map.md
- Oblikovanje: .specify/memory/design.md · arhitekturne odločitve: docs/decisions/
- Resnica o vedenju sta koda in testi; arhiv prve različice (specs 000–012, DECISIONS.md) je v zgodovini Gita (`2365b23`); original_documentation/ je zgodovinski arhiv – ne spreminjaj ga
- Trenutna funkcionalnost: `scripts/feature.sh ime` (veja `ime`, mapa `specs/ime/`)

## Preverjanje
- ./verify.sh quick – format, lint, tipi, utišanja, unit in FE testi; pred zaključkom vsake naloge
- ./verify.sh backend | e2e – integracijski in varnostni testi zaledja | sistem in E2E; ko sprememba to zadeva
- CI požene quick, backend in e2e vzporedno; `full` (vse skupaj) lokalno ni potreben
- Celoten izpis: .verify/last.log (odpri le, če kratek izpis ne zadošča)

## Pravila
- Velikost spremembe določa postopek (konstitucija §2.1): majhna – brez dokumentov; običajna – kratek spec.md; tvegana – še plan.md in tasks.md.
- Koda in testi nastajajo skupaj, v enem prehodu; brez ločene faze ali commita testov. Od naloge do PR delaj sam; ustavi se le v primerih iz §2.4. Združita razvijalca (izjema: /rollout).
- Pri običajnih in tveganih spremembah pred PR enkrat zaženi podagent `pregled-testov` nad končano razliko; pregled je svetovalen, en krog popravkov.
- Asercije nikoli ne oslabi, da bi prestala napačna koda; spremenjene obstoječe teste z razlogom navedi v opisu PR.
- Vsak endpoint skupine ima vnos v matriki izolacije (401/404/403/2xx, arhivirana 409).
- UI testi samo getByRole/getByLabel, imena iz prevodov ali skupnih pomočnikov; axe brez kršitev.
- V testih samo Firebase Auth Emulator, Testcontainers in MSW.
- Utišanje ali izklop testa samo s komentarjem `utišanje: <razlog>`; brez skrivnosti v Gitu; barve samo iz žetonov design.md.
- Samodejno uvajanje ene ali več funkcionalnosti: `/rollout` (§2.8) – nadzornik vodi delavce `izvajalec`, se posvetuje enkrat in ob zelenem CI združi PR.
- Poraba žetonov za ai-log: `node scripts/token-report.mjs` (ne ocenjuj).
- Ne ustvarjaj research.md, data-model.md, quickstart.md, contracts/, checklists/, traceability.md.
