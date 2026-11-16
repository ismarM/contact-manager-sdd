---

description: "Tasks for 019-api-kljuci (po zgodbah, testi znotraj vsake naloge/zgodbe)"
---

# Tasks: API ključi, statistika uporabe in stran API

**Input**: `specs/019-api-kljuci/` – spec.md (Clarifications 2026-11-16), plan.md (*Public Interfaces*), research.md (R-01 … R-10), data-model.md, contracts/openapi.yaml, quickstart.md, `docs/decisions/2026-11-16-api-kljuc-jwt.md`

**Tests**: obvezni, pisani skupaj s kodo iste naloge (konstitucija II); brez ločene faze testov.

**Organization**: Setup → Foundational → US1 … US6 (koda + testi) → Polish. Vsaka zgodba je ločena faza in samostojno preverljiva.

## Format: `[ID] [P?] [Story] FR-IDs – Description`

- Endpointi in poti samo iz tabel *Public Interfaces* v plan.md; oblike iz `contracts/openapi.yaml`.
- Vrstni red na `/v1` (plan.md): 401 → 429 → 404 nečlan → 404 izven obsega → 403 učinkovita vloga (min(ključ, vloga)) → 409 `GROUP_ARCHIVED` → 409 `VERSION_CONFLICT` → 400.
- **Matrika `/v1`** (`ApiV1IsolationMatrixSecurityIT`, naloge istega razreda niso [P]) – akterji za vsako vrstico: **401**: brez glave, ključ brez predpone `cmk_`, ponarejen podpis, napačen `aud`/`iss`, potekel, preklican, ključ izbrisanega računa, Firebase ID žeton (emulator), ključ v poizvedbi namesto glave; **404**: nečlan, neobstoječa skupina, neveljaven id, skupina izven obsega ključa, kontakt druge skupine; **403**: učinkovita vloga pod najnižjo (VIEWER s ključem WRITE; EDITOR/ADMIN/OWNER s ključem READ pri pisanju); **2xx**: najnižja dovoljena in vse višje vloge (VIEWER, EDITOR, ADMIN, OWNER) s ključem za izbrano skupino in s ključem »vse moje skupine«; **arhivirana in trajno arhivirana** skupina: branje 2xx, pisanje 409 `GROUP_ARCHIVED`. Telo napak `{"code":…}`; 404 ne razkrije obstoja.
- **Matrika upravljanja** (`ApiKeyManagementSecurityIT`): 401 (brez/neveljaven/potekel Firebase žeton **in** veljaven API ključ), 404 tuj ali neobstoječ ključ, 2xx lastnik; brez sveže prijave (017).
- Migracija samo naprej: `V14__api_kljuci.sql` (dodeljena; v fazi PR preveri glede na `main`). `V1`–`V13` se ne dotikamo.
- Ključ (celoten žeton) se nikoli ne zapiše v dnevnik, napako ali bazo – vsak test, ki ustvari ključ, preveri tudi, da ga ni v zajetem dnevniku (`OutputCaptureExtension`) tam, kjer zahteva pade.
- UI testi samo `getByRole`/`getByLabel`, imena iz prevodov ali skupnih pomočnikov; vitest-axe in @axe-core/playwright brez kršitev; barve samo iz žetonov design.md.
- Brez nove odvisnosti (Nimbus je že v projektu). Brez sprememb obstoječih asercij; razširitve obstoječih testov z razlogom v opisu PR.

## Phase 1: Setup

- [x] T001 — FR-019-01, -16, -20 – Konfiguracija `api-keys.*` v `backend/src/main/resources/application.yaml` (`API_KEY_SIGNING_SECRET` brez privzete vrednosti, `rate-limit` 120, `stats-zone` `Europe/Ljubljana`, `purge-interval` 1h); `ApiKeyProperties` (`si.contactmanager.apikey`) s preverjanjem ob zagonu (base64, ≥ 32 bajtov, sicer zagon pade) in unit `ApiKeyPropertiesTest`; `compose.yaml` in `.env.example` (spremenljivka brez vrednosti, navodilo `openssl rand -base64 32`); testna podpora generira naključno skrivnost (`backend/src/test/java/si/contactmanager/support/`); `compose.yaml` zahteva vrednost (`${API_KEY_SIGNING_SECRET:?}`), `verify.sh` (ravni `e2e`/`full`) in CI ob manjkajoči vrednosti ustvarita naključno začasno skrivnost (`openssl rand -base64 32`), da E2E drugih funkcionalnosti ne pade
- [x] T002 [P] — FR-019-14 – nginx `location /v1/` → zaledje (`frontend/nginx.conf`, brez glav CORS) in Vite proxy `/v1` (`frontend/vite.config.ts`)
- [x] T003 [P] — FR-019-01 … -04, -12, -14, -16, -20 – i18n sl/en (`frontend/src/i18n/sl.json`, `en.json`): razdelek *API ključi*, obrazec, enkraten prikaz, preklic (8.11), stanja (aktiven, potekel, preklican, kmalu poteče, brez veljavnih skupin, še ni uporabljen), statistika (graf, tabela, obdobja), stran API (vsa besedila), oznaka »prek API ključa »{{name}}««, napaki `API_KEY_LIMIT`, `RATE_LIMITED`; test pariteta ključev sl/en

## Phase 2: Foundational (blokira vse zgodbe)

- [x] T004 — FR-019-01, -12, -20, -21 – `backend/src/main/resources/db/migration/V14__api_kljuci.sql` po data-model.md (`api_key`, `api_key_group`, `api_key_usage`, `audit_entry.api_key_name`, nadomestna `audit_entry_immutable()`); `ApiKeyMigrationIT`: CHECK omejitve (ime 1–50, `hint` 6, `all_groups` ↔ `all_groups_permission`, števci ≥ 0), kaskade (izbris uporabnika → ključi, skupine in statistika; izbris skupine → `api_key_group`), sled: posodobitev `api_key_name` zavrnjena, izbris računa izvajalca nastavi `actor_id` in `api_key_name` na `NULL`, druge posodobitve še vedno zavrnjene
- [x] T005 [P] — FR-019-01, -04, -17 – `ApiKeyTokens` (`apikey`): izdaja `cmk_` + JWT HS256 (`NimbusJwtEncoder`, `ImmutableSecret`) s trditvami iz data-model.md in preverjanje (`NimbusJwtDecoder.withSecretKey`, `iss`, `aud`, `exp` neobvezen, oblika `scp`); **ni** bean tipa `JwtDecoder`; unit `ApiKeyTokensTest` (krožna pot, brez `exp`, potekel, ponarejen podpis, drug podpisni ključ, manjkajoča/napačna predpona, `alg=none`, napačen `aud`/`iss`, neveljaven `scp`, Firebase žeton → zavrnjen)
- [x] T006 — FR-019-09, -17 – `shared/security/ApiKeyPrincipal` (userId, keyId, keyName, obseg; `current()` iz `SecurityContextHolder`); `apikey/ApiSecurityConfig` (`@Order(2)`, `securityMatcher("/v1/**")`, STATELESS, brez CSRF/CORS/Basic/form, `GET /v1/openapi.json` javno) in `ApiKeyAuthenticationFilter` (samo `Authorization: Bearer cmk_…`; podpis → vrstica po `jti`: obstaja, isti `sub`, ni preklicana → principal; sicer `401 {"code":"UNAUTHENTICATED"}`, v dnevnik samo `jti`); javadoc `SecurityConfig` omeni verigo `/v1`; `ApiKeyAuthenticationIT` (vsi 401 akterji iz matrike na `/v1/groups` – 401 nastane pred krmilnikom, zato test ne potrebuje US2; API ključ na `/api/groups` → 401, `/dav` nespremenjen, ključ ni v dnevniku)
- [x] T007 — FR-019-07, -09, -13 – `GroupAccess.membership(long userId, String groupId)` (404 brez preverjanja vloge) in `apikey/ApiGroupAccess.require(principal, groupId, lowest, write)` po research R-03 (vrne `Membership` z učinkovito vlogo); unit `ApiGroupAccessTest` (vrstni red 404 → 404 izven obsega → 403 → 409; »vse moje skupine«; kapica READ → VIEWER; vloga znižana po ustvarjanju ključa)
- [x] T008 [P] — — – Testni pomočniki: zaledje `support/ApiKeys.java` (ustvari ključ prek `/api/me/api-keys` ali neposredno prek `ApiKeyTokens` + vrstica; potekel/preklican ključ; ključ z drugim podpisnim ključem); FE MSW `frontend/src/test/apiKeysApi.ts`; E2E `e2e/tests/support/apiKeys.ts` (imena iz prevodov, klic `/v1` z `request`)

**Checkpoint**: shema, žeton, veriga `/v1` in dostop do skupine pripravljeni.

## Phase 3: User Story 1 – Ustvarjanje in preklic API ključa (P1) 🎯 MVP

**Goal**: uporabnik v *Mojem računu* ustvari ključ (prikazan enkrat), ga vidi na seznamu in prekliče.

**Independent Test**: ustvari ključ, preveri enkraten prikaz in seznam brez vrednosti; `GET /v1/groups` 200; preklic → 401.

- [x] T009 [US1] FR-019-01 … -04 – `ApiKeyRepository`, `ApiKeyService`, `ApiKeyController` (`/api/me/api-keys` GET, POST, DELETE `{keyId}`), `shared/error/ApiKeyLimitException` + `ApiExceptionHandler` (409 `API_KEY_LIMIT`): preverjanje (ime 1–50 po obrezovanju, 1–50 skupin brez podvojenih ali `allGroups` z eno pravico, pravica `READ`/`WRITE`, `expiresInDays` 30/90/365/`null`, privzeto 90 in READ), 404 za skupino, katere ni član (nič ne nastane), meja 10 aktivnih pod zaklepom `app_user` (preklicani in potekli se ne štejejo), `hint`, stanje, `expiringSoon` (≤ 7 dni), seznam skrije preklicane/potekle starejše od 90 dni, preklic idempotenten; `ApiKeyManagementIT` (enkratni žeton se ne pojavi v seznamu, 11. ključ 409 in nič ne nastane, sočasno ustvarjanje dveh pri 9 → največ 10, preklican → naslednji `/v1` 401 in drugi ključ deluje, potekel 401 in stanje `EXPIRED`, izbrisana skupina → »brez veljavnih skupin«, ustvarjanje brez sveže prijave)
- [x] T010 [US1] FR-019-01, -18 – Matrika `ApiKeyManagementSecurityIT`: `GET /api/me/api-keys` (401 brez/neveljaven/potekel žeton, 401 z API ključem, 200 lastnik – samo lastni ključi)
- [x] T011 [US1] FR-019-01, -18 – Matrika `ApiKeyManagementSecurityIT`: `POST /api/me/api-keys` (401 ×3, 401 z API ključem, 404 skupina nečlana/neobstoječa/neveljaven id, 201 član z vlogo VIEWER, EDITOR, ADMIN, OWNER, 201 arhivirana in trajno arhivirana skupina)
- [x] T012 [US1] FR-019-03, -18 – Matrika `ApiKeyManagementSecurityIT`: `DELETE /api/me/api-keys/{keyId}` (401 ×3, 401 z API ključem, 404 tuj – tuj ključ ostane veljaven, 404 neobstoječ/neveljaven id, 204 lastnik)
- [ ] T013 [US1] FR-019-05, -21 – Izvoz in izbris računa: `MyData.apiKeys` (`account/MyData`, `MyDataRepository`, `ExportAssembler`) brez žetona in `hint`, z `usage` po dnevih; razširi `MyDataExportIT` in `AccountDeletionIT` (po izbrisu računa ključ → 401, vrstice `api_key*` izbrisane); matrika `GET /api/me/export` ostane v `MyDataIsolationMatrixSecurityIT` (401, 200 samo lastni ključi)
- [ ] T014 [P] [US1] FR-019-01 … -04 – FE `frontend/src/features/apikeys/`: `api.ts`, `types.ts`, `ApiKeysSection` (seznam: ime, `hint`, skupine s pravico ali »vse moje skupine«, ustvarjen, rok, zadnja uporaba ali »še ni uporabljen«, stanje 8.5, »kmalu poteče«, povezava na statistiko in stran API), `CreateApiKeyDialog` (8.10; izbira skupin iz `GET /api/groups` in `/api/groups/archived`, pravica po skupini ali »vse moje skupine«, rok, napake polj, `API_KEY_LIMIT` z navodilom), `ApiKeyCreatedDialog` (ključ enkrat, *Kopiraj*, opozorilo), `RevokeApiKeyDialog` (8.11); vključitev v `features/account/AccountPage.tsx`; testi RTL + MSW + vitest-axe (`ApiKeysSection.test.tsx`, `CreateApiKeyDialog.test.tsx`)
- [ ] T015 [US1] FR-019-01, -03 – E2E `e2e/tests/api-kljuci.spec.ts`: ustvari ključ, kopiraj, zapri → na seznamu brez vrednosti; `GET /v1/groups` 200; prekliči s potrditvijo → 401; axe na *Mojem računu* (360, 1280)

**Checkpoint**: US1 deluje od konca do konca; `./verify.sh quick` zelen.

## Phase 4: User Story 2 – Branje skupin in kontaktov prek API (P1)

**Goal**: program s ključem bere skupine v obsegu in kontakte (paginirano, iskanje 008), enako kot spletna aplikacija.

**Independent Test**: ključ za Klub → `/v1/groups` samo Klub; seznam kontaktov z `q`, značko in `size=50` enak `/api`; en kontakt z verzijo.

- [ ] T016 [US2] FR-019-06 – `group/ApiGroupController` (`GET /v1/groups?page=&size=`, privzeto 25, največ 100, 400 `VALIDATION_FAILED`) in metoda v `GroupService`/`GroupRepository` (vse skupine uporabnika z vlogo, tudi arhivirane, filtrirane po obsegu ključa, razvrščene po naslovu); `ApiGroupIT` (obseg, »vse moje skupine« vključi pozneje ustvarjeno skupino, odstranjen član → skupine ni, paginacija)
- [ ] T017 [US2] FR-019-07, -08 – `contact/ApiContactController` GET seznam in en kontakt prek `ApiGroupAccess` in istega `ContactService`/`ContactQueryParser`; `ApiContactReadIT`: za iste parametre (`q`, filter značke, razvrščanje, `size=50`, stran 2) je telo enako kot `GET /api/groups/{groupId}/contacts` za istega uporabnika; en kontakt enak `/api` (tipi 016, verzija); arhivirana skupina 200; branje ne ustvari vnosa sledi
- [ ] T018 [US2] FR-019-06, -17 – Matrika `ApiV1IsolationMatrixSecurityIT`: `GET /v1/groups` (vsi 401 akterji; 200 za vsako vlogo; izven obsega skupina ni v seznamu; ključ »vse moje skupine«; arhivirana in trajno arhivirana v seznamu)
- [ ] T019 [US2] FR-019-07, -08, -09 – Matrika `ApiV1IsolationMatrixSecurityIT`: `GET /v1/groups/{groupId}/contacts` (401 ×vsi; 404 nečlan, neobstoječa, neveljaven id, izven obsega, odstranjen član (po ponovnem članstvu spet 200); 200 VIEWER … OWNER s ključem READ in WRITE; 200 arhivirana in trajno arhivirana)
- [ ] T020 [US2] FR-019-07, -08, -09 – Matrika `ApiV1IsolationMatrixSecurityIT`: `GET /v1/groups/{groupId}/contacts/{contactId}` (401 ×vsi; 404 nečlan, izven obsega, kontakt druge skupine, neobstoječ kontakt; 200 VIEWER … OWNER; 200 arhivirana in trajno arhivirana)

**Checkpoint**: US2 samostojno preverljiva s ključem iz US1 ali `support/ApiKeys`.

## Phase 5: User Story 3 – Pisanje kontaktov prek API (P2)

**Goal**: ključ WRITE ustvari, spremeni, izbriše kontakt z istimi pravili in vnosom v sled z imenom ključa.

**Independent Test**: ustvari, spremeni z verzijo in izbriše; trije vnosi sledi z oznako ključa.

- [ ] T021 [US3] FR-019-10, -11, -12 – `ApiContactController` POST, PUT, DELETE (`?version=`) prek `ApiGroupAccess` in istih `ContactInputParser`/`ContactService.requireWritable`/`create`/`update`/`delete`; `AuditRepository.insert` zapiše `api_key_name` iz `ApiKeyPrincipal.current()`; `AuditEntry` in pogledi zgodovine (`HistoryViews`) vrnejo `apiKeyName`; `ApiContactWriteIT`: normalizacija enaka obrazcu (telefon E.164), 400 `VALIDATION_FAILED` enako kot `/api` in nič se ne spremeni, 409 `VERSION_CONFLICT` pri PUT in DELETE, sled CREATE/UPDATE/DELETE z `apiKeyName`, filter sledi po uporabniku vključi vnose prek API, izbris računa → »izbrisan uporabnik« in `apiKeyName` `null`, sprememba iz spletne aplikacije ima `apiKeyName` `null`
- [ ] T022 [US3] FR-019-10, -13 – Matrika `ApiV1IsolationMatrixSecurityIT`: `POST /v1/groups/{groupId}/contacts` (401 ×vsi; 404 nečlan, izven obsega; 403 VIEWER s ključem WRITE, EDITOR/ADMIN/OWNER s ključem READ, ključ »vse moje skupine« READ; 201 EDITOR, ADMIN, OWNER s WRITE; 409 `GROUP_ARCHIVED` arhivirana in trajno arhivirana; nič ne nastane pri zavrnitvi)
- [ ] T023 [US3] FR-019-10, -11, -13 – Matrika `ApiV1IsolationMatrixSecurityIT`: `PUT /v1/groups/{groupId}/contacts/{contactId}` (401 ×vsi; 404 nečlan, izven obsega, kontakt druge skupine; 403 kot T022; 200 EDITOR … OWNER s WRITE; 409 `GROUP_ARCHIVED` arhivirana in trajno arhivirana; nič se ne spremeni)
- [ ] T024 [US3] FR-019-10, -11, -13 – Matrika `ApiV1IsolationMatrixSecurityIT`: `DELETE /v1/groups/{groupId}/contacts/{contactId}?version=` (401 ×vsi; 404 nečlan, izven obsega, kontakt druge skupine; 403 kot T022; 204 EDITOR … OWNER s WRITE; 409 `GROUP_ARCHIVED` arhivirana in trajno arhivirana; kontakt ostane)
- [ ] T025 [US3] FR-019-12 – Matrika sledi: razširi `AuditIsolationMatrixSecurityIT` in `AuditHistoryIsolationMatrixSecurityIT` (vrstica `GET …/audit`, `…/audit/{entryId}`, `…/contacts/{contactId}/history`: obstoječi akterji 401/404/2xx nespremenjeni, arhivirana 2xx) z asercijo `apiKeyName` v 2xx; API ključ na teh poteh → 401
- [ ] T026 [P] [US3] FR-019-12 – FE oznaka »prek API ključa »ime«« (ali »prek API« brez imena) v `frontend/src/features/audit/AuditEntryItem.tsx` in `frontend/src/features/history/HistoryTimeline.tsx` + tipi; testi RTL + vitest-axe
- [ ] T027 [US3] FR-019-10, -12 – E2E v `e2e/tests/api-kljuci.spec.ts`: ključ WRITE → `POST`/`PUT`/`DELETE` prek `request`; revizijska sled pokaže tri vnose z oznako ključa (axe)

**Checkpoint**: US3 deluje; `./verify.sh quick` zelen.

## Phase 6: User Story 4 – Stran z razlago in uporabo API (P2)

**Goal**: javna stran `/api-docs` in strojno berljiv opis, ki se ujema z dejanskim vmesnikom.

**Independent Test**: neprijavljen odpre stran, prenese opis, po primeru prebere kontakte.

- [ ] T028 [US4] FR-019-15, -19 – `backend/src/main/resources/api/openapi-v1.json` (OpenAPI 3.1, `info.version` `1`, varnostna shema `cmk_`, vse operacije `/v1` s parametri, telesi, odgovori in kodami napak, vključno 401/429) in `apikey/ApiDescriptionController` (`GET /v1/openapi.json`, `application/json`); `ApiDescriptionIT`: množica (metoda, pot) iz opisa = preslikave `RequestMappingHandlerMapping` pod `/v1` (v obe smeri)
- [ ] T029 [US4] FR-019-15 – Matrika `ApiV1IsolationMatrixSecurityIT`: `GET /v1/openapi.json` (200 brez ključa, z neveljavnim ključem in s Firebase žetonom; brez glav CORS; ne šteje se v statistiko)
- [ ] T030 [P] [US4] FR-019-14, -15, -19 – FE `frontend/src/features/api-docs/`: `ApiDocsPage` (javna pot `/api-docs` v `frontend/src/app/App.tsx` zunaj `RequireAuth`; razdelki po FR-019-14: namen, varnost, bralec vidi vse, lastnik ne nadzira, brez CORS, ustvarjanje (povezava na *Moj račun* → prijava, če neprijavljen), pošiljanje, operacije z vlogo in pravico ključa, primeri `curl` in odgovori, paginacija, kode napak, omejitve, različica in spremembe, *Prenesi opis vmesnika*), `CodeBlock` s *Kopiraj* (brez vodoravnega drsenja pri 320 px), `apiOperations.ts`; povezava s `features/auth/LoginPage.tsx`; testi: `ApiDocsPage.test.tsx` (RTL + vitest-axe, sl/en, *Kopiraj*), `apiOperations.test.ts` (seznam = operacije v `backend/src/main/resources/api/openapi-v1.json`)
- [ ] T031 [US4] FR-019-14, -15 – E2E v `e2e/tests/api-kljuci.spec.ts`: neprijavljen odpre `/api-docs` s prijave, prenese opis (JSON z `/v1/groups`), tipkovnica do *Kopiraj*, brez vodoravnega drsenja, axe (360, 1280)

**Checkpoint**: US4 deluje brez prijave.

## Phase 7: User Story 5 – Statistika uporabe ključa (P2)

**Goal**: števila zahtev po izidu, zadnjih 24 ur na seznamu, graf + tabela za 7/30 dni.

**Independent Test**: uspešne, neveljavne zahteve → točna števila po dnevih in izidu, ločeno po ključih.

- [ ] T032 [US5] FR-019-20 – `apikey/ApiUsageFilter` + `ApiUsageRepository` (upsert po uri v ločeni kratki transakciji po odgovoru; `last_used_at`; razvrstitev po R-06; 401 se ne šteje; napaka štetja ne spremeni odgovora) in `requestsLast24h` v seznamu ključev; unit `UsageOutcomeTest`; `ApiUsageIT` (40 branj + 5 pisanj + 3 napake → točna števila, dva ključa ločena, neveljaven/preklican ključ ne šteje, vidno takoj po zahtevi, 24 ur čez polnoč)
- [ ] T033 [US5] FR-019-20 – `GET /api/me/api-keys/{keyId}/usage?days=7|30` v `ApiKeyController` (dnevi po `stats-zone`, manjkajoči dnevi 0, skupna števila, 400 za drugo obdobje); IT v `ApiUsageIT`
- [ ] T034 [US5] FR-019-20 – Matrika `ApiKeyManagementSecurityIT`: `GET /api/me/api-keys/{keyId}/usage` (401 ×3, 401 z API ključem – tudi lastnim, 404 tuj/neobstoječ/neveljaven id, 200 lastnik, 200 preklican in potekel ključ ≤ 90 dni)
- [ ] T035 [US5] FR-019-21 – `apikey/ApiKeyPurgeJob` (`@Scheduled`, R-07) z `Clock`; `ApiKeyPurgeIT` (preklican/potekel > 90 dni izbrisan s statistiko, ≤ 90 dni ostane, ura starejša od 90 dni izbrisana, aktiven ključ ostane)
- [ ] T036 [P] [US5] FR-019-20 – FE `ApiKeyUsagePage` (pot `/account/api-keys/:keyId` v `App.tsx`; 404 → »Te strani ni«), `UsageChart` (SVG/CSS stolpci iz žetonov, `aria-hidden` z enakovredno tabelo: dan, uspešne, napake, zavrnitve), izbira obdobja 7/30, skupna števila; število 24 ur na seznamu; testi RTL + MSW + vitest-axe
- [ ] T037 [US5] FR-019-20 – E2E v `e2e/tests/api-kljuci.spec.ts`: nekaj zahtev s ključem → statistika (tabela) pokaže števila; axe (360, 1280)

**Checkpoint**: US5 deluje; `./verify.sh quick` zelen.

## Phase 8: User Story 6 – Zaščita pred zlorabo (P3)

**Goal**: 120 zahtev/min na ključ, nato `429` z `Retry-After`; drugi ključi in spletna aplikacija neprizadeti.

**Independent Test**: 121 zahtev → zadnja 429; drug ključ istega uporabnika 200; `/api` 200.

- [ ] T038 [US6] FR-019-16, -20 – `apikey/ApiRateLimiter` (fiksno okno 60 s na `jti`, `Clock`, čiščenje starih oken) in `ApiRateLimitFilter` za `ApiUsageFilter` (`429 {"code":"RATE_LIMITED"}`, `Retry-After` v sekundah); unit `ApiRateLimiterTest` (meja, novo okno, `Retry-After`, ločeni ključi, sočasnost); `ApiRateLimitIT` (`api-keys.rate-limit` znižan v testu: N+1 → 429 z glavo, drug ključ 200, `/api` 200, 429 šteje kot `rate_limited` v statistiki, po oknu spet 200); `ApiExceptionHandler` / FE prevod `RATE_LIMITED`

**Checkpoint**: vse zgodbe delujejo.

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T039 — FR-019-17 – `.gitleaks.toml`: pravilo za `cmk_eyJ…` (če obstoječa pravila ključa ne zaznajo); preveri z vzorcem v testu `scripts/verify` ali ročno v opisu PR
- [ ] T040 — — – `.specify/memory/feature-map.md`: §1 vrstica 019, §2.2 nov tip klicatelja (API ključ, `/v1`, vrstni red 401 → 429 → 404 → 404 obseg → 403 → 409), §2.6 slovar (API ključ, statistika), §2.7 oznaka »prek API« in branje prek API se ne beleži, §2.10 `API_KEY_LIMIT` (409) in `RATE_LIMITED` (429)
- [ ] T041 — FR-019-01, -17 – Po uskladitvi z `main` (017 združen; faza PR): `ApiKeyManagementSecurityIT` – `POST /api/me/api-keys` z nepotrjenim e-naslovom → 403 `EMAIL_NOT_VERIFIED`, ustvarjanje brez sveže prijave (brez `REAUTHENTICATION_REQUIRED`); `ApiKeyAuthenticationIT` – ključ uporabnika z nepotrjenim e-naslovom na `/v1` ni zavrnjen z `EMAIL_NOT_VERIFIED` (`EmailVerifiedFilter` velja samo za `/api/**`)
- [ ] T042 — — – Quickstart (quickstart.md) ročno ali z E2E; `./verify.sh quick`; ciljani IT `Api*IT`, `*ApiKey*IT`, `MyData*IT`, `AccountDeletion*IT`, `Audit*IT`; E2E celoten (spremenjeni `App.tsx`, `AccountPage`, `LoginPage`, `e2e/tests/support/**`)

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T008) → US1 (T009–T015) → US2 (T016–T020) → US3 (T021–T027) → US4 (T028–T031) → US5 (T032–T037) → US6 (T038) → Polish (T039–T042).
- US2 potrebuje samo Foundational (ključ iz `support/ApiKeys`); US3 potrebuje US2 (`ApiContactController`); US4 opis (T028) potrebuje vse `/v1` operacije (US2, US3); US5 T032 potrebuje veriga iz T006; US6 T038 test štetja 429 potrebuje T032.
- Naloge matrike istega razreda (`ApiV1IsolationMatrixSecurityIT`, `ApiKeyManagementSecurityIT`) niso [P].
- [P]: T002/T003; T005/T008; FE naloge (T014, T026, T030, T036) vzporedno z zaledjem iste zgodbe (opirajo se na `contracts/openapi.yaml`).

## Implementation Strategy

- MVP = Setup + Foundational + US1 + US2 (ključ in branje). Paketi izvedbe: Setup + Foundational · US1 · US2 + US3 · US4 + US5 · US6 + Polish.
- Pričakovani konflikti z 017 (združen prej): `GroupRepository`/`GroupService`, `ApiExceptionHandler`, `SecurityConfig`, `App.tsx`, `AccountPage.tsx`, `LoginPage.tsx`, `sl.json`/`en.json`, `e2e/tests/support/auth.ts`.

## Notes

- Asercij se ne oslabi; razširitve obstoječih testov (`MyDataExportIT`, `AccountDeletionIT`, matrike sledi) z razlogom v opisu PR.
- Utišanja samo s komentarjem `utišanje: <razlog>`.
- `./verify.sh quick` pred zaključkom vsake zgodbe.
