# Implementation Plan: API ključi, statistika uporabe in stran API

**Branch**: `api-kljuci` (worktree veja `claude/serene-wright-31jliy`) | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/docs/specs/019-api-kljuci/spec.md`

## Summary

Nov tip klicatelja: program z API ključem. Ključ je `cmk_` + podpisan JWT (lastnik, `jti`, obseg, rok), ki se ne
hrani; vrstica `api_key` po `jti` nosi ime, preklic, prikaz in statistiko. Operacije so v ločenem imenskem prostoru
`/v1/**` z lastno varnostno verigo in kličejo **iste storitve** (`ContactService`, `GroupService`) prek
`ApiGroupAccess`, ki doda obseg ključa in učinkovito vlogo min(ključ, vloga). Upravljanje ključev in statistika sta
pod `/api/me/api-keys` (Firebase, brez sveže prijave). Javna stran `/api-docs` z ročno vzdrževanim opisom
`/v1/openapi.json`, ki ga test primerja z dejanskimi preslikavami. Odločitve: [research.md](research.md),
`docs/architecture-decisions.md#2026-11-16-api-kljuc-jwt`.

## Technical Context

**Language/Version**: Java 21 (Spring Boot 4.1) · TypeScript (strict) + React 19

**Primary Dependencies**: obstoječe; JWT z Nimbus JOSE + JWT iz `spring-boot-starter-security-oauth2-resource-server` (**brez nove odvisnosti**); graf brez knjižnice (SVG/CSS)

**Storage**: PostgreSQL – migracija `V14__api_kljuci.sql` ([data-model.md](data-model.md))

**Testing**: JUnit 5, Testcontainers, Firebase Auth Emulator · Vitest, RTL, MSW, vitest-axe · Playwright + axe (360, 1280)

**Target Platform**: Docker Compose (nginx posreduje `/api/`, `/dav/` in **nov `/v1/`**)

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: preverjanje ključa = preverjanje podpisa + 1 poizvedba po PK; štetje = 1 upsert na zahtevo; 120 zahtev/min/ključ

**Constraints**: WCAG 2.1 AA, sl/en, optimistično zaklepanje (kot web), paginirani seznami, izolacija skupin, brez CORS na `/v1`, ključ se nikoli ne beleži

**Scale/Scope**: ≤ 10 aktivnih ključev/uporabnika, ≤ 50 izbranih skupin/ključ, statistika 90 dni po urah

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-019-01 … 21 v tabelah vmesnikov; odločitve R-01 … R-10; nove kode in pravila v `feature-map.md` v istem PR |
| II. Tests are mandatory | enota: žeton (podpis, predpona, rok, ponaredba), omejevalnik, razvrstitev izida; IT: upravljanje, branje/pisanje enakovredno web, sled, statistika, čiščenje, izvoz/izbris, opis ↔ preslikave; FE (MSW + axe): razdelek, dialogi, statistika, stran API; E2E: quickstart |
| III. Group isolation and roles | vsak `/v1` endpoint v matriki (`ApiV1IsolationMatrixSecurityIT`): 401 (brez/neveljaven/preklican/potekel ključ, izbrisan račun, Firebase žeton), 404 nečlan in izven obsega, 403 vloga ali ključ samo za branje, 2xx, 409 arhivirana; upravljanje: 401, 404 tuj, API ključ na `/api` 401 |
| IV. Accessible, bilingual, responsive UI | design.md 8.1 (gumbi, *Kopiraj*), 8.2 (obrazec), 8.5 (oznake stanj), 8.10–8.11 (dialog, potrditev preklica), 8.13 (obvestila), 8.15 (prazna stanja), 9.9 (Moj račun), 9.1 (povezava s prijave), 10; sl/en; graf z enakovredno tabelo |
| V. Data integrity | pisanje prek istih storitev (verzija, `409 VERSION_CONFLICT`, sled z `api_key_name`); seznami `/v1/groups` in kontakti paginirani |
| VI. Privacy and GDPR | nova podatka uporabnika (ključi, statistika) sta v izvozu 012 in se izbrišeta z računom (CASCADE); ime ključa v sledi se ob izbrisu računa počisti; ključ se ne hrani in ne beleži |
| VII. One verification path | `quick` po vsaki zgodbi; ciljani IT pri izvedbi, `backend` v konvergenci; E2E: celoten (spremembe `App.tsx`, `AccountPage`, `e2e/tests/support/**`) |

## Public Interfaces *(mandatory)*

### REST endpoints

Upravljanje (Firebase žeton; vezano na uporabnika):

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/me/api-keys | — | n/a | 200 `ApiKey[]` | FR-019-02, -04, -20, -21 |
| POST | /api/me/api-keys | — (skupine: član, katerakoli vloga) | allowed (izbira arhivirane skupine) | 201 `ApiKeyCreated`; 404 nečlan; 409 `API_KEY_LIMIT` | FR-019-01 |
| DELETE | /api/me/api-keys/{keyId} | — | n/a | 204; 404 tuj | FR-019-03 |
| GET | /api/me/api-keys/{keyId}/usage?days=7\|30 | — | n/a | 200 `ApiKeyUsage`; 404 tuj | FR-019-20 |
| GET | /api/me/export | — | n/a | 200 (+ `apiKeys` z `usage`) | FR-019-05, -21 |
| GET | /api/groups/{groupId}/audit, …/audit/{entryId}; …/contacts/{contactId}/history | VIEWER | allowed | 200 (+ `apiKeyName`) | FR-019-12 |

Programski vmesnik (API ključ `Authorization: Bearer cmk_…`; veriga `/v1/**`):

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /v1/openapi.json | public | n/a | 200 OpenAPI 3.1 | FR-019-15 |
| GET | /v1/groups?page=&size= | VIEWER (vsaka članska vloga, skupine v obsegu) | allowed | 200 `ApiGroupPage` | FR-019-06 |
| GET | /v1/groups/{groupId}/contacts?(parametri 008) | VIEWER + ključ READ | allowed | 200 `ContactPage` | FR-019-07, -08 |
| GET | /v1/groups/{groupId}/contacts/{contactId} | VIEWER + ključ READ | allowed | 200 `ContactDetail` | FR-019-07, -08 |
| POST | /v1/groups/{groupId}/contacts | EDITOR + ključ WRITE | rejected (409 GROUP_ARCHIVED) | 201 `ContactDetail` | FR-019-10, -12, -13 |
| PUT | /v1/groups/{groupId}/contacts/{contactId} | EDITOR + ključ WRITE | rejected (409 GROUP_ARCHIVED) | 200 `ContactDetail`; 409 `VERSION_CONFLICT` | FR-019-10 … -13 |
| DELETE | /v1/groups/{groupId}/contacts/{contactId}?version= | EDITOR + ključ WRITE | rejected (409 GROUP_ARCHIVED) | 204; 409 `VERSION_CONFLICT` | FR-019-10 … -13 |

Vsi `/v1` (razen `openapi.json`): 401 `UNAUTHENTICATED` (FR-019-17), 429 `RATE_LIMITED` + `Retry-After` (FR-019-16).
Vrstni red: 401 → 429 → 404 (nečlan) → 404 (izven obsega) → 403 (učinkovita vloga) → 409 arhivirana → 409 verzija →
400. Telesa in parametri kontaktov so enaki kot v `/api` (008, 016); razlika je samo prijava.

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Moj račun – razdelek *API ključi* (seznam s stanji, *Ustvari ključ* z dialogom, enkraten prikaz s *Kopiraj*, *Prekliči* s potrditvijo 8.11, povezava na stran API) | /account | — | FR-019-01 … -04, -20 |
| Statistika ključa (obdobje 7/30 dni, graf + tabela, skupna števila; neobstoječ/tuj → »Te strani ni«) | /account/api-keys/:keyId | — | FR-019-20 |
| Stran API (javna; razlaga, operacije, primeri s *Kopiraj*, kode napak, omejitve, različice, *Prenesi opis vmesnika*) | /api-docs | public | FR-019-14, -15, -19 |
| Prijava – povezava na stran API | /login | public | FR-019-14 |
| Revizijska sled in zgodovina kontakta – oznaka »prek API ključa »ime«« | /groups/:groupId/audit, /groups/:groupId/contacts/:contactId/history | VIEWER | FR-019-12 |

## Project Structure

### Documentation (this feature)

```text
docs/specs/019-api-kljuci/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
backend/src/main/java/si/contactmanager/
├── apikey/                      # NOVO: ApiKeyController (/api/me/api-keys), ApiKeyService, ApiKeyRepository,
│                                #   ApiKeyTokens, ApiKeyProperties, ApiSecurityConfig (@Order(2), /v1/**),
│                                #   ApiKeyAuthenticationFilter, ApiRateLimiter, ApiRateLimitFilter, ApiUsageFilter,
│                                #   ApiUsageRepository, ApiKeyPurgeJob, ApiGroupAccess, ApiDescriptionController
├── contact/ApiContactController.java   # NOVO: /v1/groups/{groupId}/contacts…
├── group/ApiGroupController.java       # NOVO: /v1/groups; GroupService/GroupRepository: seznam za API
├── group/GroupAccess.java              # + membership(userId, groupId)
├── audit/AuditRepository, AuditEntry, HistoryViews  # + api_key_name
├── account/MyData, MyDataRepository, ExportAssembler # + apiKeys
├── shared/security/ApiKeyPrincipal.java            # NOVO (skupno): principal + current()
└── shared/error/ApiKeyLimitException.java, ApiExceptionHandler.java  # 409 API_KEY_LIMIT
backend/src/main/resources/
├── db/migration/V14__api_kljuci.sql
├── api/openapi-v1.json
└── application.yaml             # api-keys.*
backend/src/test/java/si/contactmanager/apikey/ … (unit, IT, SecurityIT)

frontend/src/features/apikeys/   # NOVO: ApiKeysSection, CreateApiKeyDialog, ApiKeyCreatedDialog, RevokeApiKeyDialog,
                                 #   ApiKeyUsagePage, UsageChart, api.ts, types.ts, testi
frontend/src/features/api-docs/  # NOVO: ApiDocsPage, CodeBlock, apiOperations.ts, testi
frontend/src/features/audit/AuditEntryItem.tsx, history/HistoryTimeline.tsx  # oznaka »prek API«
frontend/src/i18n/{sl,en}.json
e2e/tests/api-kljuci.spec.ts, e2e/tests/support/apiKeys.ts
```

**Skupne datoteke, ki jih izvedba spremeni** (pričakovani konflikti z 017 – PR #24 se združi prej):
`backend/.../shared/security/SecurityConfig.java` (samo javadoc o verigi `/v1`; veriga sama v `apikey`),
`shared/security/ApiKeyPrincipal.java` (nov), `shared/error/ApiExceptionHandler.java` (+ `API_KEY_LIMIT`; 017 doda
svoje kode), `group/GroupAccess.java`, `group/GroupRepository.java` in `GroupService.java` (017 jih spreminja –
konflikt), `audit/*`, `account/MyData*` + `ExportAssembler`, `application.yaml`, `compose.yaml` in `.env.example`
(`API_KEY_SIGNING_SECRET`), `verify.sh` in `.github/workflows/ci.yml` (začasna naključna skrivnost za E2E, če ni
nastavljena), `backend/src/test/.../support/*` (generirana skrivnost, pomočnik za ključ),
`frontend/nginx.conf`, `frontend/vite.config.ts`, `frontend/src/app/App.tsx` (poti `/api-docs`,
`/account/api-keys/:keyId`; 017 doda poti), `features/account/AccountPage.tsx` (razdelek; 017 doda razdelek),
`features/auth/LoginPage.tsx` (povezava; 017 ga prenovi – konflikt), `frontend/src/i18n/sl.json`, `en.json`,
`frontend/src/test/` (MSW), `e2e/tests/support/**` (nov `apiKeys.ts`), `.specify/memory/feature-map.md`
(§1 vrstica 019, §2.2 tip klicatelja, §2.7 oznaka »prek API«, §2.10 `API_KEY_LIMIT`, `RATE_LIMITED`, §2.6 slovar),
`.gitleaks.toml` (pravilo za `cmk_`, če obstoječa ne zadoščajo).

**Structure Decision**: zaledje v novem paketu `apikey`; kontrolerji `/v1` v paketih domene zaradi paketno zasebnih
storitev. Vmesnik v `features/apikeys` in `features/api-docs`.

## Complexity Tracking

Ni kršitev.
