# CLAUDE.md – Contact Manager

Večnajemniški sistem za kontakte (Spring Boot + React/TS + PostgreSQL, Firebase samo za prijavo), razvit po SDD z GitHub Spec Kit. Claude Code je edini AI agent.

## Dokumenti (preberi po potrebi)
- `docs/project-brief.md` – obseg, odločitve, pravila testiranja (§5, §7)
- `docs/design.md` – oblikovni jezik »Jasno« (tokeni, komponente, dostopnost)
- `docs/ai-development-log.md` – dnevnik AI dela; točni pozivi v `docs/ai-prompts/NNN.md`
- Spec Kit: constitution in `specs/NNN-ime/` (`spec.md`, `plan.md`, `tasks.md`)

## Preverjanje
- `./verify.sh fast` – formatiranje, lint, tipi, unit testi; pred zaključkom vsake naloge
- `./verify.sh full` – + integracijski, varnostni in E2E testi; pred združitvijo v `main`
- Celoten izpis zadnjega zagona: `.verify/last.log` (odpri le, če kratek izpis ne zadošča)

## Pravila
- Avtorizacija je vedno v backendu na podlagi članstva v skupini (OWNER/MEMBER, samo znotraj skupine). Firebase daje samo identiteto.
- Zahteve imajo ID `FR-NNN-XX`; testi nosijo ID zahteve (`@Tag("FR-…")` oz. `"FR-…: "` v imenu).
- Vsak endpoint s podatki skupine ima vnos v matriki izolacije (401 / 404 / 403 / 2xx, brief §7.3).
- UI testi uporabljajo samo `getByRole` / `getByLabel`; axe brez kršitev.
- Testi se spreminjajo samo zaradi specifikacije, nikoli zato, da ustrežejo kodi.
- Brez `@SuppressWarnings`, `eslint-disable`, `@ts-ignore`, `any` brez pisne utemeljitve v kodi.
- V testih samo Firebase Auth Emulator in Testcontainers, nikoli pravi servisi ali ključi.
- Brez skrivnosti v Gitu.
- Spremembe zahtev najprej v specifikacijo, nato v kodo.
