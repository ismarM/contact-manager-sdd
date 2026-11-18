# Implementation Plan: Prenova vmesnika (Kartoteka v2)

**Branch**: `prenova-vmesnika` (worktree veja `claude/clever-sagan-oqz2j9`) | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-prenova-vmesnika/spec.md`

## Summary

Prenova je **samo vmesnik**: novi žetoni, lupina/navigacija in vsi zasloni po Kartoteki v2. Platno in oblikovni sistem sta
vodilo, ne vir resnice (spec *Clarifications*): kar aplikacija ne podpira, se izpusti (razvrščanje skupin, gostota
preglednice, revizija na strani kontakta, polje *Ime*). Edina sprememba zaledja je `GET /api/groups`: namesto razdelkov po
vlogah vrne en paginiran seznam z vlogo na elementu; števci navigacije uporabljajo obstoječe endpointe. Podatkovnih
sprememb in migracije ni. `design.md` se zamenja z v2 (odobreno), `RevertedBadge` se odstrani, FR-005-19 je popravljen.
Odločitve: [research.md](research.md).

## Technical Context

**Language/Version**: Java 21 (Spring Boot 4.1) · TypeScript (strict) + React 19

**Primary Dependencies**: obstoječe; **brez nove odvisnosti** (pisavi `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 in `@fontsource/atkinson-hyperlegible-mono` 5.3.0 sta že lokalni, ikone Tabler 3.50.0). Ilustracije so lastne SVG komponente. Če bi izvedba dodala paket, dobi točno različico in zapis v `docs/decisions/`.

**Storage**: brez sprememb (PostgreSQL; **brez migracije**)

**Testing**: JUnit 5, Testcontainers, Firebase Auth Emulator · Vitest, RTL, MSW, vitest-axe · Playwright + axe (360, 1280; @w768 za ogrodje)

**Target Platform**: Docker Compose (nginx), evergreen brskalniki, PWA

**Project Type**: web application (pretežno frontend + e2e; zaledje samo `GET /api/groups`)

**Performance Goals**: SC-007: brez novih zahtev na prvi izris razen dveh števcev (`size=1`); pisave se ne dodajajo; ilustracije vgrajene (SVG, brez omrežja)

**Constraints**: WCAG 2.1 AA, sl/en, odzivno od 320 px, žetoni edini vir videza (SC-003, preverja `quick`), brez tujih storitev (VI)

**Scale/Scope**: 25 zaslonov + 16 dialogov; ~7 rezin v enem PR (rollout: ena veja, zgodbe kot ločene faze in commiti)

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-020-01 … 28; odločitve R-01 … R-09; FR-005-19 in `design.md` popravljena v istem PR; `feature-map.md` ob PR |
| II. Tests are mandatory | enota: kontrast žetonov, URL stanje zbirke; IT: `GET /api/groups` + matrika; FE (MSW + axe): vsak zaslon in dialog; E2E: ogrodje (@w768), skupine, prijava, kontakti, izgled (teme, vsiljene barve, zmanjšano gibanje) |
| III. Group isolation and roles | spremenjeni `GET /api/groups` in vsi uporabljeni endpointi v matriki (spodaj); akcije, ki jih vloga/stanje ne dovoljuje, niso izrisane (FE test po vlogah) |
| IV. Accessible, bilingual, responsive UI | design.md (v2) §4–§9, §10; sl/en vsa besedila in dostopna imena; 320–1440 px |
| V. Data integrity | brez sprememb pisanja; paginacija ohranjena (enotna) |
| VI. Privacy and GDPR | brez novih osebnih podatkov; pisave in ilustracije lokalne |
| VII. One verification path | `quick` po vsaki fazi; ciljani IT v izvedbi, `backend` v konvergenci; E2E celoten (spremembe `shared/**`, `app/**`, `e2e/tests/support/**`) |

## Public Interfaces *(mandatory)*

### REST endpoints

Lowest role: `—` = vezano na uporabnika. Vse vrstice razen prve so **nespremenjene** in jih FE samo uporabi; vseeno imajo
nalogo testa matrike (obstoječi vnos preveriti ali dopolniti). Podrobnosti prve vrstice: [contracts/openapi.yaml](contracts/openapi.yaml).

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups | — (samo lastne nearhivirane skupine) | n/a (arhivirane niso v seznamu) | 200 `GroupPage` (**spremenjeno**) | FR-020-10, FR-020-11, FR-020-05 |
| GET | /api/groups/archived | — | n/a | 200 `ArchivedGroups` (nespremenjeno; števec in zaslon) | FR-020-13, FR-020-05 |
| GET | /api/invitations/count | — | n/a | 200 `{count}` (nespremenjeno; števec) | FR-020-05 |
| GET | /api/groups/{groupId} | VIEWER | allowed | 200 (preklopnik, glava; tuja skupina 404) | FR-020-06, FR-020-08 |
| PUT | /api/groups/{groupId}/contacts/{contactId} | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 (kartica: akcije skrite brez pravice) | FR-020-19 |
| DELETE | /api/groups/{groupId}/contacts/{contactId} | EDITOR | rejected (409 GROUP_ARCHIVED) | 204 | FR-020-19 |
| GET | /api/groups/{groupId}/audit?contact={contactId} | VIEWER | allowed | 200 (povezava s kartice kontakta) | FR-020-19 |

`POST /api/groups` (*Nova skupina*) je nespremenjen; vnos 401 ostane v `GroupIsolationMatrixSecurityIT` (FR-020-12).

### Pages and routes

Poti se **ne spremenijo** (nobene nove). Spremenijo se postavitve in navigacija.

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Prijava, Nov račun, Pozabljeno geslo, Potrdi e-naslov | /login, /register, /forgot-password, /verify-email | public | FR-020-14, -15, -16 |
| Dokumentacija API | /api-docs | public | FR-020-22 |
| Skupine (zbirka kartic) | /groups (/) | — | FR-020-10, -11, -12 |
| Arhivirane skupine | /groups/archived | — | FR-020-13 |
| Povabila | /invitations | — | FR-020-05, -22 |
| Moj račun, statistika API ključa | /account, /account/api-keys/:keyId | — | FR-020-09, -22 |
| Kontakti skupine, kartica, obrazec, uvoz | /groups/:groupId/contacts[/…] | VIEWER (urejanje EDITOR) | FR-020-17 … -21, -22 |
| Dvojniki, primerjava, revizija, atributi, nastavitve, člani, zgodovina | /groups/:groupId/* (obstoječi zavihki) | kot 004–019 | FR-020-08, -22 |
| Te strani ni | * | — | FR-020-16, -24 |

## Project Structure

### Documentation (this feature)

```text
specs/020-prenova-vmesnika/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
└── contracts/openapi.yaml   # samo spremenjeni GET /api/groups
```

### Source Code (repository root)

```text
backend/src/main/java/si/contactmanager/group/   # GroupController, GroupService, GroupRepository, GroupPage (nov), GroupSection(s) (odstranjena)
backend/src/test/java/si/contactmanager/**       # GroupListIT, GroupSearchIT, GroupIsolationMatrixSecurityIT + IT, ki berejo sections

frontend/src/styles/app.css                      # žetoni v2 (@theme), vsiljene barve, zmanjšano gibanje
frontend/src/shared/ui/**                        # styles.ts, dialog, dropdown, sonner, novi: Badge, Chip, Callout, Monogram, Skeleton, illustrations/
frontend/src/shared/layout/**, app/**            # AppShell, Sidebar, BottomBar, CurrentGroupCard, GroupSwitcher
frontend/src/features/**                         # vsi zasloni in dialogi
frontend/src/i18n/{sl,en}.json                   # nova besedila
frontend/src/test/**                             # MSW, groupsApi.ts, skupni pomočnik imen (names.ts)
e2e/tests/**, e2e/tests/support/**               # posodobitev + izgled.spec.ts
.specify/memory/design.md, feature-map.md        # v2; širša pravila
specs/002-skupine/{spec.md,contracts/openapi.yaml}, specs/005-revizijska-sled/spec.md
```

**Structure Decision**: obstoječa struktura; nove datoteke samo v `shared/ui` (primitivi, ilustracije) in `shared/layout`
(spodnja vrstica, kartica *Trenutna skupina*). Uvajanje po rezinah (konstitucija §2.5) kot ločene faze v tasks.md:
temelji → ogrodje → zasloni.

## Complexity Tracking

Brez kršitev. Odstop od §2.5 (en PR namesto PR na rezino) je odločitev nadzornika (rollout: ena veja, vrstni red faz ohranjen).
