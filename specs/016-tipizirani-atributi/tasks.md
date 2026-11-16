---

description: "Tasks for 016-tipizirani-atributi (po zgodbah, testi znotraj vsake naloge/zgodbe)"
---

# Tasks: Tipizirani atributi, normalizacija in zemljevid naslovov

**Input**: `specs/016-tipizirani-atributi/` – spec.md (Clarifications 2026-11-16), plan.md (*Public Interfaces*, *Open Questions* razrešene), research.md (R-01 … R-10), data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: obvezni, pisani skupaj s kodo iste naloge/zgodbe (konstitucija II); brez ločene faze testov.

**Organization**: Setup → Foundational → US1 … US6 (koda + testi) → Polish. Frontend in zaledje iste zgodbe sta [P], kjer ne delita datotek (frontend se opira na `contracts/openapi.yaml`).

## Format: `[ID] [P?] [Story] FR-IDs – Description`

- Endpointi in poti samo iz tabel *Public Interfaces* v plan.md; oblike iz `contracts/openapi.yaml`; pravila tipov iz data-model.md.
- Vrstni red preverjanj (feature-map §2.2): 401 → 404 → 403 → 409 `GROUP_ARCHIVED` → 400 → 409 `VERSION_CONFLICT` → 409 poslovno pravilo. Lokacija in predlogi ne pokličejo OSM, preden prestanejo 401 → 404 → 403 → 400.
- Migracija samo naprej: `V13__tipizirani_atributi.sql` (dodeljena); `V1`–`V12` se ne dotikamo. Pred PR preveri, da `main` ni zasedel `V13` ali spremenil `CHECK` `audit_entry_action_check`.
- Matrika izolacije: vsaka vrstica tabele REST endpointov ima svojo nalogo v `TypedAttributesSecurityIT` (akter [brez/pokvarjen/potekel žeton, nečlan, VIEWER, EDITOR, ADMIN, OWNER] × [nearhivirana, arhivirana] + kontakt/atribut druge skupine): 401, 404 brez telesa, 403, 409 `GROUP_ARCHIVED`, 2xx kjer velja. Naloge istega razreda niso [P].
- Obstoječi testi se ne oslabijo; spremenjeni obstoječi testi z razlogom gredo v opis PR. UI testi samo `getByRole`/`getByLabel`, imena iz prevodov ali skupnih pomočnikov, axe brez kršitev; barve samo iz žetonov design.md.
- Zunanja storitev: v nobenem testu pravi klic na OSM (nadomestni strežnik, MSW, `osm-stub`).

## Phase 1: Setup

- [x] T001 — `backend/pom.xml`: `com.googlecode.libphonenumber:libphonenumber` 9.0.42; `frontend/package.json`: `libphonenumber-js` 1.13.15, `leaflet` 1.9.4, `@types/leaflet` 1.9.22 (dev); `./verify.sh quick` brez novih utišanj
- [x] T002 [P] — `backend/src/main/resources/application.yaml`: `maps.*` (`MAPS_NOMINATIM_URL`, `MAPS_PHOTON_URL`, `MAPS_TILE_URL`, user-agent, časovni omejitvi 2 s/2,5 s, omejitve in predpomnilnik po R-08, stikalo za izklop); `MapsProperties` (`si.contactmanager.maps`) s testom privzetih vrednosti
- [x] T003 [P] — i18n sl/en (`frontend/src/i18n/sl.json`, `en.json`): imena tipov, polja po tipih, deli naslova, *Atributi skupine*, dialog 8.11, *Oblika zapisa*, zemljevid in njegova sporočila, napake `ATTRIBUTE_TYPE_CONFLICT` / `MAP_SERVICE_UNAVAILABLE`; test pariteta ključev sl/en

## Phase 2: Foundational (blokira vse zgodbe)

- [x] T004 — `V13__tipizirani_atributi.sql` po data-model.md (`attribute_key`, `address_parts`, `parts`, stolpci `app_user`, stolpci `audit_entry`, `CHECK` dejanj kot unija V12 + `ATTRIBUTE_TYPE`); `TypedAttributesMigrationIT` (obstoječi ključi `OTHER`/0, naslovi in vrednosti nespremenjeni, omejitve `CHECK`, izbris skupine kaskadno); `ContactHistoryIT` in drugi testi, ki ponovno ustvarijo `CHECK`, ostanejo zeleni
- [x] T005 — zapisi zaledja: `AttributeType`, `Address`, `Attribute(key, type, value, parts)`, `AttributeKeyView`, `TypeConflict`, `AddressLocation`, `AddressSuggestion`; `addressParts` v `ContactInput/Detail/State`, `CompareContact`, `ExportRow`, `VcardContact`; stari posnetki (`type` manjka → `OTHER`, `addressParts` → `null`) – test branja starih posnetkov; kodi `ATTRIBUTE_TYPE_CONFLICT` (409) in `MAP_SERVICE_UNAVAILABLE` (503) v `shared/error`; `AuditAction.ATTRIBUTE_TYPE` in polja `AuditEntry` (`attributeKey`, `typeBefore`, `typeAfter`) z zapisom v `AuditLog` (potrebna že v T011)
- [x] T006 — `TypedValues` s `PhoneNormalizer`, `UrlNormalizer`, normalizacija e-naslova, datuma, opomb in delov naslova po data-model.md (R-02 … R-04; telefon po državi kontakta, kratke številke, `;ext=`; nespremenjena vrednost se ne preverja in ne normalizira); unit `TypedValuesTest`, `PhoneNormalizerTest`, `UrlNormalizerTest`, `AddressNormalizationTest` (tabele veljavnih/neveljavnih vrednosti po tipu, Unicode, meje 200/200/20/100/100)
- [x] T007 — `AttributeKeyRepository` (vrstica ključa ob prvi uporabi z izbranim tipom, verzija, štetje kontaktov, zaklepanje po R-01, prost ključ ob 0 kontaktih); IT `AttributeKeyRepositoryIT` (sočasno ustvarjanje istega ključa z različnima tipoma → en tip, drug zavrnjen)
- [x] T008 [P] — `maps`: `BoundedCache` (LRU, TTL, omejitev velikosti/bajtov), `RateLimiter` (globalno in na uporabnika, čakanje na žeton ≤ 1 s), `MapsFakeServer` (JDK `HttpServer`, nadzor odgovorov, zakasnitev, štetje klicev); unit `BoundedCacheTest`, `RateLimiterTest`
- [x] T009 [P] — FE: tipi in API odjemalec `frontend/src/features/attributes/{types,api}.ts`, razširitev `contacts/types.ts` (`Attribute.type`, `parts`, `addressParts`) po `contracts/openapi.yaml`; MSW pomočnik `frontend/src/test/typedAttributesApi.ts`; skupni pomočniki imen tipov iz prevodov; `GroupLayout.tsx` razdelek `attributes` (zaslon sledi v T020)

**Checkpoint**: shema, tipi, normalizatorji in infrastruktura posrednika pripravljeni.

## Phase 3: User Story 1 – Tip ključa atributa v skupini (P1) 🎯 MVP

**Independent Test**: kontakt z novim ključem tipa *Telefon*; drugi kontakt z istim ključem prevzame tip; sprememba tipa ključa atomarna, z neveljavnimi vrednostmi 409 s seznamom; množično urejanje uporabi tip.

- [x] T010 [US1] FR-016-01 FR-016-04 FR-016-05 — `AttributeKeyController/Service` `GET …/attribute-keys?q=&page=&size=` (VIEWER, arhivirana dovoljeno; paginacija 25/50/100 → 400, iskanje `search_fold`, štetje); IT `AttributeKeysIT` (obstoječi ključi `OTHER`, iskanje, strani)
- [x] T011 [US1] FR-016-01 FR-016-04 FR-016-05 FR-016-26 — `POST …/attribute-keys/change-type` (EDITOR; zaklep skupine, preveri in normalizira vse vrednosti ključa v eni transakciji, `version` ključa, kontakti dobijo novo verzijo; 409 `ATTRIBUTE_TYPE_CONFLICT` z `TypeConflict` ≤ 100 + `total`, 409 `VERSION_CONFLICT`; en vnos sledi `ATTRIBUTE_TYPE` prek T005); IT `ChangeAttributeTypeIT` (1 000 vrednosti, atomarnost ob konfliktu, sočasna sprememba, nespremenjen tip → brez vnosa, povratek transakcije)
- [x] T012 [US1] FR-016-01 FR-016-02 FR-016-04 — `ContactInputParser` in `ContactService`: tip ključa iz `attribute_key`, `type` v vnosu samo za nov ključ (sicer 400 `INVALID_VALUE` ob neskladju), `Attribute.type` v odgovorih, opombe dobesedno; `ContactRepository` bere/piše `attribute_key`; `SuggestionRepository` `type=key` vrne `attributeType`; IT `ContactTypedAttributesIT` (ustvari/uredi, nov ključ, ključ brez razlike velikosti, VERSION_CONFLICT, neznan tip)
- [x] T013 [US1] FR-016-06 — `BulkService`/`bulk-update` »nastavi atribut«: tip obstoječega ključa, `type` za nov ključ, `parts` za naslov, vsi ali nič; IT `BulkTypedAttributeIT` (neveljavna vrednost za tip → celotna operacija 400, nič se ne spremeni)
- [x] T014 [US1] FR-016-01 FR-016-05 — matrika: `TypedAttributesSecurityIT` vrstica `GET …/attribute-keys` (401, 404, VIEWER 200, arhivirana 200, ključi druge skupine niso vidni)
- [x] T015 [US1] FR-016-05 — matrika: vrstica `POST …/attribute-keys/change-type` (401, 404, VIEWER 403, arhivirana 409 `GROUP_ARCHIVED`, EDITOR 200, ključ druge skupine 404 ali brez vpliva na drugo skupino, `VERSION_CONFLICT`, `ATTRIBUTE_TYPE_CONFLICT`)
- [x] T016 [US1] FR-016-01 FR-016-02 — matrika: vrstica `POST, PUT …/contacts, …/contacts/{contactId}` (401, 404, VIEWER 403, arhivirana 409, neveljavna vrednost za tip 400, zastarela verzija 409, druga skupina 404)
- [x] T017 [US1] FR-016-01 — matrika: vrstica `GET …/suggestions?type=key` (401, 404, VIEWER 403, arhivirana 200, `attributeType`)
- [x] T018 [US1] FR-016-06 — matrika: vrstica `POST …/contacts/bulk-update` (401, 404, VIEWER 403, arhivirana 409, neveljavna vrednost 400 brez delnih sprememb)
- [x] T019 [P] [US1] FR-016-01 FR-016-03 FR-016-07 — FE `features/contacts/typed/TypeSelect.tsx`, `TypedValueInput.tsx` (polja po tipu: `email`/`tel`/`url`, datum, večvrstično za opombe; naslov v T034), `TypedValueView.tsx` (povezave `mailto:`/`tel:`/https z `rel`, opombe kot golo besedilo z ohranjenimi presledki in vrsticami), izbira tipa ob novem ključu v `ContactForm`/`AttributeTransfer`, predlog ključa prevzame tip (`attributeType`); testi `TypeSelect.test.tsx`, `TypedValueInput.test.tsx`, `TypedValueView.test.tsx` (ime tipa iz prevodov, XSS v opombah, axe)
- [x] T020 [P] [US1] FR-016-05 FR-016-27 — FE `features/attributes/GroupAttributesPage.tsx` (tabela ključ/tip/število, iskanje, paginacija, *Spremeni tip* samo EDITOR v nearhivirani skupini), `ChangeTypeDialog.tsx` (design.md 8.11, fokus na *Prekliči*), `TypeConflictList.tsx` (povezave na kontakte, ≤ 100 + »in še N«, *Poskusi znova* 8.13), pot `/groups/:groupId/attributes` v `GroupLayout` (VIEWER vidi, brez gumba); testi s skupnimi pomočniki + axe
- [x] T021 [P] [US1] FR-016-06 — FE množično urejanje (`selection`): izbira tipa novega ključa, vrednost po tipu, napake po vrednosti; test
- [x] T022 [US1] FR-016-01 FR-016-05 FR-016-27 — E2E `e2e/tests/tipizirani-atributi.spec.ts` + `e2e/tests/support/typedAttributes.ts` (quickstart: nov ključ s tipom, drugi kontakt prevzame tip, *Atributi skupine*, sprememba tipa z in brez konflikta, VIEWER brez gumba); axe pri 360 in 1280

## Phase 4: User Story 2 – Normalizacija na strežniku (P1)

**Independent Test**: vnos telefona v različnih zapisih → ena kanonična oblika; iskanje po števkah; dvojniki po normaliziranih vrednostih; nespremenjena stara vrednost ostane dobesedna.

- [x] T023 [US2] FR-016-02 FR-016-07 FR-016-08 FR-016-09 — predefinirana polja `email`/`phone` in dodatni atributi po tipu v `ContactInputParser` (normalizacija po državi kontakta, nespremenjena vrednost ostane, 400 `INVALID_VALUE` z imenom polja); IT `NormalizationIT` (E.164, e-naslov z velikimi črkami, URL brez sheme, datum, opombe dobesedno, stari nenormalizirani podatki se ob urejanju drugega polja ne dotaknejo)
- [x] T024 [US2] FR-016-10 — `ContactSearch`: iskanje telefona po števkah (R-06; predefinirani telefon in atributi `PHONE`), e-naslov in naslovi; indeks po potrebi v V13 (T004); IT `PhoneSearchIT` + merilni test 10 000 kontaktov < 1 s (SC-002)
- [x] T025 [US2] FR-016-11 FR-016-26 — `DuplicateKeys`: normalizirana primerjava e-naslovov in telefonov (stare vrednosti normalizirane samo pri primerjavi, ne v bazi); `MergeInputParser`/merge preveri vrednosti po tipu ključa; IT `DuplicateNormalizationIT`, `MergeTypedIT`
- [x] T026 [US2] FR-016-08 FR-016-10 — matrika: vrstica `GET …/contacts?q=, …/contacts/{contactId}` (401, 404, VIEWER 200, arhivirana 200, druga skupina 404, iskanje ne razkrije kontaktov druge skupine)
- [x] T027 [US2] FR-016-11 FR-016-26 — matrika: vrstica `GET …/duplicates, …/duplicates/compare` (401, 404, VIEWER 403, arhivirana 409, EDITOR 200)
- [x] T028 [US2] FR-016-08 FR-016-26 — matrika: vrstica `POST …/duplicates/merge` (401, 404, VIEWER 403, arhivirana 409, neveljavna vrednost po tipu 400, kontakt druge skupine 404)
- [x] T029 [P] [US2] FR-016-08 FR-016-19 — FE: po zapustitvi polja prikaz normalizirane vrednosti (odgovor strežnika je vir; vnos v kateri koli prepoznani obliki), napaka polja z imenom in `aria-describedby`; test `TypedValueInput` (normalizacija, napaka 400, axe)
- [x] T030 [US2] FR-016-02 FR-016-08 FR-016-10 FR-016-11 — E2E: različni zapisi telefona, iskanje »041 123«, dvojnik po normaliziranem telefonu; axe pri 360 in 1280

## Phase 5: User Story 3 – Strukturiran naslov s samodokončanjem (P2)

**Independent Test**: naslov po delih (predefiniran in atribut); stari naslov ostane besedilo; samodokončanje do 5 predlogov prek zaledja; *Razčleni naslov*.

- [x] T031 [US3] FR-016-12 FR-016-15 FR-016-04 — zaledje: `address_parts`/`parts` v `ContactRepository`, `ContactInputParser` (deli ali nerazčlenjen samo če nespremenjen/iz uvoza), `AddressFormats` (`address-formats.json`, R-04), iskanje po delih; IT `AddressPartsIT` (obstoječi naslov ostane besedilo, razčlenitev, neveljavne meje, država kot koda, sprememba tipa ključa v drug tip → besedilo)
- [x] T032 [US3] FR-016-13 FR-016-23 — `maps`: `PhotonClient`, `MapsController` `GET …/address-suggestions?q=&country=&language=` (EDITOR, arhivirana dovoljeno; ≥ 3 znaki; ≤ 5 predlogov; napaka/omejitev → `200 []`; predpomnilnik 1 h, omejevalnik 5/s in 2/s na uporabnika; besedilo naslova ni v dnevniku; User-Agent brez osebnih podatkov); IT `AddressSuggestionsIT` (`MapsFakeServer`: User-Agent in poizvedba, predpomnilnik – drugi klic brez zahteve, časovna omejitev, 5xx, 429, izklop)
- [x] T033 [US3] FR-016-13 — matrika: vrstica `GET …/address-suggestions` (401 brez klica OSM, 404 brez klica, VIEWER 403 brez klica, arhivirana 200, EDITOR 200, 400 za prekratek `q`; `MapsFakeServer` šteje 0 klicev pri zavrnitvi)
- [x] T034 [P] [US3] FR-016-12 FR-016-14 FR-016-15 FR-016-19 — FE `typed/AddressFields.tsx` (polja po državi, `ComboListbox` 8.4 za predloge, zakasnitev 300 ms, `AbortController`, izbira predloga izpolni dele), `splitAddress.ts` (R-04 preprosta razčlenitev), *Razčleni naslov* za nerazčlenjen naslov, napaka predlogov ne ovira vpisa; testi `AddressFields.test.tsx`, `splitAddress.test.ts` (MSW samo za naše `/api`), axe
- [x] T035 [US3] FR-016-12 FR-016-13 FR-016-14 — `osm-stub` (`e2e/osm-stub/server.mjs`) in `compose.verify.yaml` (storitev, `MAPS_*` zaledja nanjo; skupno z US5); E2E: vnos naslova s samodokončanjem, *Razčleni naslov*, tipkovnica; axe pri 360 in 1280

## Phase 6: User Story 4 – Izbira prikazne sheme (P2)

**Independent Test**: sprememba oblike telefona, datuma in naslova v *Mojem računu* spremeni vse prikaze takoj in na drugi napravi; podatki, izvoz in API ostanejo kanonični.

- [x] T036 [US4] FR-016-16 FR-016-17 FR-016-18 — zaledje `account`: `DisplayFormat` enumi, `Preferences`/`PreferencesParser`/`ProfileRepository`/`Profile` (`phoneFormat`, `dateFormat`, `addressFormat`; manjka = nespremenjeno, `null` = privzeto, neveljavna vrednost 400 `INVALID_VALUE`; neznana vrednost v bazi se bere kot privzeta); `MyData.preferences` v izvozu 012; izbris računa; IT `DisplayFormatsIT` (`PUT /api/me/preferences` in `PUT /api/me`, izvoz, izbris, API vedno kanoničen)
- [x] T037 [US4] FR-016-16 — matrika: vrstica `PUT /api/me/preferences, /api/me` (401, pokvarjen/potekel žeton, 400 neveljavna vrednost, 200/201; vpliv samo na lastni profil)
- [x] T038 [US4] FR-016-17 — matrika: vrstica `GET /api/me/export` (401; `preferences` vsebuje oblike zapisa samo lastnega uporabnika)
- [x] T039 [P] [US4] FR-016-16 FR-016-17 FR-016-19 — FE `features/formats/`: `DisplayFormatsProvider`, `formatPhone`, `formatDate`, `formatAddress`, `addressFormats.json` (kopija + test enakosti z zaledjem); `features/account/DisplayFormatSection.tsx`, `preferences.ts` (kopija v `localStorage`, ob prvi prijavi `COALESCE`, profil ima prednost); vsi prikazi (seznam, pogled, dvojniki, sled, zgodovina) prek oblikovalnikov; testi `formatPhone/Date/Address.test.ts` (po državah), `DisplayFormatSection.test.tsx`, axe
- [x] T040 [US4] FR-016-16 FR-016-17 FR-016-18 — E2E: sprememba sheme v *Mojem računu*, prikaz v seznamu in pogledu, ohranitev po ponovni prijavi, izvoz kanoničen; axe pri 360 in 1280

## Phase 7: User Story 5 – Zemljevid za naslove (P2)

**Independent Test**: *Pokaži na zemljevidu* za predefiniran naslov in atribut; nenajden, približen in nedosegljiv; brez zahtev brskalnika na tuje strežnike.

- [x] T041 [US5] FR-016-20 FR-016-21 FR-016-22 FR-016-23 — `maps`: `NominatimClient`, `GET …/contacts/{contactId}/address-location?key=&language=` (VIEWER, arhivirana dovoljeno; naslov iz kontakta po preverjanju dostopa; `EXACT`/`APPROXIMATE`/`NOT_FOUND`; napaka/omejitev/izklop → 503 `MAP_SERVICE_UNAVAILABLE`; predpomnilnik 24 h, 1 zahteva/s globalno); IT `AddressLocationIT` (`MapsFakeServer`: strukturirana poizvedba za dele, `q` za nerazčlenjen naslov, `place_rank < 26` → `APPROXIMATE`, koordinate niso v bazi ali dnevniku)
- [x] T042 [US5] FR-016-21 FR-016-23 — `TileClient` + `GET /api/map-tiles/{z}/{x}/{y}.png` (prijavljen, brez članstva v skupini; veljavnost `z/x/y`; 20/s globalno, 60/10 s na uporabnika → 503; predpomnilnik do 50 MB, `max-age` ≤ 7 dni); IT `MapTilesIT`
- [x] T043 [US5] FR-016-21 FR-016-23 — matrika: vrstica `GET …/contacts/{contactId}/address-location` (401 brez klica OSM, 404 nečlan in kontakt/atribut druge skupine brez klica, VIEWER 200, arhivirana 200, 400, 503; `MapsFakeServer` 0 klicev pri zavrnitvi)
- [x] T044 [US5] FR-016-21 FR-016-23 — matrika: vrstica `GET /api/map-tiles/{z}/{x}/{y}.png` (401 brez klica OSM, pokvarjen žeton, 200 image/png, neveljavne koordinate 400/404, 503 ob omejitvi)
- [x] T045 [P] [US5] FR-016-20 FR-016-21 FR-016-22 FR-016-27 — FE `features/map/`: `ShowOnMapButton` (pri vsakem nepraznem naslovu), `MapDialog` (8.10, fokus, *Esc*, vrnitev fokusa, tipkovnica, besedilni opis, pripis © OpenStreetMap, povezava v zunanjo aplikacijo, sporočila za `NOT_FOUND`/`APPROXIMATE`/503 s *Poskusi znova*), `authTileLayer.ts` (`GridLayer.createTile` z `authFetch` → `blob:`, sprostitev ob odstranitvi), `api.ts`; testi (MSW za `/api`, `onUnhandledRequest: 'error'`; noben `fetch`/`<img>` ne gre na tuj izvor) + axe
- [x] T046 [US5] FR-016-20 … FR-016-23 — E2E: zemljevid prek `osm-stub`, nenajden, približen, izklopljen stub; vse zahteve brskalnika na izvor aplikacije (SC-006); `@w768` za dialog; axe pri 360 in 1280

## Phase 8: User Story 6 – Tipi v uvozu, izvozu, sledi in drugih funkcionalnostih (P2)

**Independent Test**: uvoz s tipi in deli naslova; izvoz in vCard kanonično; sled, zgodovina, rollback in obnova z `ATTRIBUTE_TYPE`.

- [x] T047 [US6] FR-016-24 — `ImportService`: preslikava tipa novega ključa in delov naslova (`address.street` … `address.country`, tudi za nov atribut tipa *Naslov*), predogled in potrditev prek `ContactInputParser`, napake vrstic po 014; IT `ImportTypedIT` (obstoječi ključ s tipom, nov ključ, en stolpec v *Naslov* → nerazčlenjen, neveljavna vrednost → napaka vrstice)
- [x] T048 [US6] FR-016-25 FR-016-18 — `ExportWriter` (Excel: kanonične vrednosti, naslov en stolpec po pravilih države), `VcardMapping/Writer/Reader` (`ADR` po delih, `attrN.TEL|EMAIL|ADR|URL|BDAY|NOTE` + `X-ABLabel` + `X-CM-KEY`, nerazčlenjen v delu ulice, neoznačeni dodatni → `Telefon 2`…), CardDAV prek istih razredov; IT `TypedExportIT`, `VcardTypedIT` (krožna pot izvoz → uvoz), `CardDavTypedIT`
- [x] T049 [US6] FR-016-24 — matrika: vrstica `POST …/imports/parse, …/imports/preview, …/imports` (401, 404, VIEWER 403, arhivirana 409, neveljavna vrednost po tipu → napaka vrstice, druga skupina 404)
- [x] T050 [US6] FR-016-25 — matrika: vrstica `POST …/contacts/export, …/contacts/export/vcard; GET …/contacts/{contactId}/vcard` (401, 404, VIEWER 200, arhivirana 200, kontakt druge skupine 404)
- [x] T051 [US6] FR-016-25 — matrika: vrstica `PROPFIND, REPORT, GET /dav/addressbooks/{groupId}/…` (401 brez/napačno geslo aplikacije, 404 nečlan, VIEWER 207/200, arhivirana 207/200)
- [x] T052 [US6] FR-016-26 — `audit`: `ChangeDiff`/`ChangeField` za tipe in dele naslova, filter `action=ATTRIBUTE_TYPE`, `…/audit/{entryId}`, `…/changes`; IT `AuditAttributeTypeIT`; FE `auditSentence.ts` in sled (stavek spremembe tipa, deli naslova prek `formatAddress`), ključi sl/en
- [x] T053 [US6] FR-016-26 — `RollbackService`: obnova tipa ključa (celotni vnos in `initial-state/rollback`; konflikt, če vrednosti niso več veljavne → po pravilih 005), `ContactSnapshots`/`RestoreService`: veljavnost za trenutni tip ključa (sicer 400), dobesedna obnova delov naslova; IT `RollbackAttributeTypeIT`, `RestoreTypedIT`
- [x] T054 [US6] FR-016-26 — matrika: vrstica `GET …/audit?action=ATTRIBUTE_TYPE, …/audit/{entryId}, …/changes` (401, 404, VIEWER 200, arhivirana 200, vnos druge skupine 404)
- [x] T055 [US6] FR-016-26 — matrika: vrstica `POST …/audit/{entryId}/rollback, …/initial-state/rollback` (401, 404, EDITOR in VIEWER 403, arhivirana 409, ADMIN 201, vnos druge skupine 404)
- [x] T056 [US6] FR-016-26 — matrika: vrstica `GET …/contacts/{contactId}/history, …/versions/{ref}, …/compare` (401, 404, VIEWER 200, arhivirana 200, ref druge skupine 404, tipi in deli naslova v odgovoru)
- [x] T057 [US6] FR-016-26 — matrika: vrstica `POST …/contacts/{contactId}/restore` (401, 404, VIEWER 403, arhivirana 409, 400 neveljavno za trenutni tip, EDITOR 201, druga skupina 404)
- [x] T058 [P] [US6] FR-016-24 FR-016-26 — FE: uvoz (`features/import`: izbira tipa novega ključa, preslikava delov naslova, predogled), dvojniki, zgodovina in primerjava različic (`features/history`, `duplicates`: tipi, deli naslova prek oblikovalnikov), izvoz; testi s skupnimi pomočniki + axe
- [x] T059 [US6] FR-016-24 FR-016-25 FR-016-26 — E2E: uvoz Excela s tipoma, izvoz kanoničen, sled spremembe tipa, rollback tipa, zgodovina kontakta; axe pri 360 in 1280

## Phase 9: Polish

- [x] T060 [P] — `.specify/memory/feature-map.md`: §2.6 (tipi atributov, ključ s tipom, normalizacija, naslov po delih), §2.7 (oblika zapisa med nastavitvami uporabnika), §2.10 (`ATTRIBUTE_TYPE_CONFLICT`, `MAP_SERVICE_UNAVAILABLE`), vrstica 016 v §1
- [x] T061 [P] — `.specify/memory/constitution.md` VI: besedilo dopolnitve iz plan.md (*Besedilo dopolnitve konstitucije VI*); `docs/decisions/2026-11-16-kartografska-storitev-osm.md` in `…-tipizirani-atributi-knjiznice.md` dokončana (dejanske različice knjižnic, nastavljivi URL-ji, ugotovitve izvedbe), kazalo v `docs/decisions/README.md`
- [x] T062 — regresija: obstoječi testi 004, 005, 009–015 (vključno `ContactHistoryIT`, uvoz/izvoz, CardDAV) zeleni brez oslabitve; spremenjene obstoječe teste (npr. telefon po standardu, oblika `Attribute`) z razlogom zabeleži za opis PR
- [x] T063 — `quickstart.md` preveri po izvedbi; `./verify.sh quick`, `backend` in E2E datoteke funkcionalnosti (`tipizirani-atributi.spec.ts`, `--project=w360 --project=w1280`) zeleni; `git fetch`: `V13` in `audit_entry_action_check` nista v konfliktu z `main`

## Phase 10: Convergence

- [x] T064 [US1] FR-016-06 — `BulkInputParser`/`BulkEditInput.AttributeSet`/`BulkService`: pri `field=address` in `custom` s tipom *Naslov* sprejmi `parts` (po delih, enaka validacija in normalizacija kot `ContactInputParser`; `value` in `parts` hkrati sta neveljavna); FE `BulkEditDialog` brez spremembe uporabniškega vedenja, če UI `parts` ne ponuja (potem le API); IT `BulkTypedAttributeIT` dopolni (naslov po delih, neveljavni del → celotna operacija 400) per FR-016-06 (partial)

## Dependencies & Execution Order

- Setup → Foundational (T004 → T005 → T006 → T007; T008, T009 vzporedno po T005) → zgodbe.
- US1 in US2 (P1) po Foundational; US2 se opira na T012; US3: T031 pred T032–T035; US5 na T008 in T035 (`osm-stub`); US4 samo na Foundational; US6 na T012, T031; T052 pred T053–T057.
- Matrični testi (`TypedAttributesSecurityIT`) so zaporedni; FE naloge [P] znotraj zgodbe vzporedno z zaledjem.
- Polish po vseh zgodbah.
