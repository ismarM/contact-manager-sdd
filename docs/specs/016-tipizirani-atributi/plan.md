# Implementation Plan: Tipizirani atributi, normalizacija in zemljevid naslovov

**Branch**: `tipizirani-atributi` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/docs/specs/016-tipizirani-atributi/spec.md`

> Tvegana funkcionalnost (zunanja storitev, konstitucija §2.1): plan je razvijalec pregledal 2026-11-16; odločitvi v *Open Questions*.

## Summary

Tip je lastnost ključa v skupini (nova tabela `attribute_key` s tipom in verzijo; obstoječi ključi `OTHER`). En razred `TypedValues` v zaledju preveri in normalizira vrednost po tipu (telefon z libphonenumber v E.164 po državi kontakta, e-naslov, URL, datum ISO, opombe dobesedno, naslov po delih) in ga uporabljajo obrazec, množično urejanje, sprememba tipa, uvoz, združevanje, obnova; nespremenjena vrednost se ne dotakne. Naslov je `jsonb` z deli (predefiniran in atribut); stari naslovi ostanejo nerazčlenjeno besedilo. Prikazne sheme so stolpci `app_user` in kontekst v frontendu (libphonenumber-js, `Intl`, tabela oblik naslovov). Zemljevid (Leaflet) in samodokončanje gresta samo prek posrednika v zaledju (Nominatim, Photon, ploščice OSM) z omejevanjem, kratkotrajnim predpomnilnikom v pomnilniku in brez shranjevanja koordinat. Migracija V13.

## Technical Context

**Language/Version**: Java 21 (Spring Boot 4.1) · TypeScript (strict) + React 19

**Primary Dependencies**: obstoječe + `com.googlecode.libphonenumber:libphonenumber` 9.0.42 · `libphonenumber-js` 1.13.15, `leaflet` 1.9.4, `@types/leaflet` 1.9.22 (dev) – research R-02, R-09; HTTP odjemalec Spring `RestClient` (obstoječ), predpomnilnik in omejevalnik lastna razreda (brez knjižnice)

**Storage**: PostgreSQL; `V13__tipizirani_atributi.sql` (data-model.md)

**Testing**: JUnit 5, Testcontainers, MockMvc, nadomestni strežnik OSM (`com.sun.net.httpserver`) · Vitest, RTL, MSW, vitest-axe · Playwright + axe (360/1280, `@w768` za dialog zemljevida), `osm-stub` v `compose.verify.yaml`

**Target Platform**: Docker Compose (nginx `/api`), evergreen brskalniki, PWA; zaledje kliče `nominatim.openstreetmap.org`, `photon.komoot.io`, `tile.openstreetmap.org` (nastavljivo: `MAPS_*`)

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: iskanje telefona v 10 000 kontaktih < 1 s (SC-002); sprememba tipa 1 000 vrednosti v eni transakciji (SC-004); zemljevid < 3 s (SC-005: čakanje na žeton ≤ 1 s + zahteva ≤ 2,5 s)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, atomarnost, brez zahtev brskalnika na tuje strežnike, pogoji uporabe Nominatim (1 zahteva/s, User-Agent, predpomnjenje), pripis © OpenStreetMap

**Scale/Scope**: 7 tipov, 50 atributov/kontakt, en primerek zaledja (omejevalnik in predpomnilnik v pomnilniku)

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-016-01 … 27 v tabeli vmesnikov; odločitve research R-01 … R-10 |
| II. Tests are mandatory | enota: normalizatorji po tipih, oblike naslovov, predpomnilnik, omejevalnik; IT: tipi v obrazcu/množičnem/uvozu/združevanju/obnovi, sprememba tipa (atomarnost, sočasnost), migracija, iskanje, rollback, posrednik z nadomestnim strežnikom; FE (MSW + axe): izbira tipa, polja, sheme, *Atributi skupine*, zemljevid; E2E: quickstart 9 |
| III. Group isolation and roles | vsi novi in spremenjeni endpointi skupine v matriki (`TypedAttributesSecurityIT`): ključi VIEWER, sprememba tipa EDITOR + 409, lokacija VIEWER (tudi arhivirana; kontakt/atribut druge skupine 404, brez klica OSM), predlogi EDITOR; ploščice in nastavitve: 401 |
| IV. Accessible, bilingual, responsive UI | design.md 8.2 (polja po tipih, deli naslova), 8.3 (atributi s tipom), 8.4/013 `ComboListbox` (samodokončanje), 8.6 in 8.9 (*Atributi skupine*), 8.10 (dialog zemljevida), 8.11 (potrditev spremembe tipa), 8.13 (napake, *Poskusi znova*), 8.12 (fokus); sl/en; zemljevid s tipkovnico in besedilnim opisom |
| V. Data integrity | verzija ključa in kontaktov, zaklepi (R-01), sprememba tipa in množično urejanje atomarna, en vnos sledi `ATTRIBUTE_TYPE`, rollback dobesedno, seznam ključev paginiran |
| VI. Privacy and GDPR | **odstop**: zaledje pošlje besedilo naslova javni storitvi OSM (samo na izrecno zahtevo, brez drugih podatkov, nič trajno) – odločitev v `docs/architecture-decisions.md#2026-11-16-kartografska-storitev-osm` in dopolnitev konstitucije VI v istem PR; nov shranjen podatek uporabnika: *oblika zapisa* (izvoz 012, izbris z računom) – dopolnitev VI |
| VII. One verification path | `quick` po vsaki zgodbi; `backend` (migracija, IT, posrednik); E2E datoteke funkcionalnosti pred PR |

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/attribute-keys?q=&page=&size= | VIEWER | allowed | 200 `AttributeKeyPage` | FR-016-01, -05 |
| POST | /api/groups/{groupId}/attribute-keys/change-type | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 `AttributeKey`; 409 `ATTRIBUTE_TYPE_CONFLICT` / `VERSION_CONFLICT` | FR-016-05, -08, -26 |
| GET | /api/groups/{groupId}/contacts/{contactId}/address-location?key=&language= | VIEWER | allowed | 200 `AddressLocation`; 503 `MAP_SERVICE_UNAVAILABLE` | FR-016-20 … -23 |
| GET | /api/groups/{groupId}/address-suggestions?q=&country=&language= | EDITOR | allowed (kot 013 predlogi) | 200 `{items}` (≤ 5, napaka → []) | FR-016-13, -14, -23 |
| GET | /api/map-tiles/{z}/{x}/{y}.png | — (prijavljen) | n/a | 200 image/png; 503 | FR-016-21, -23 |
| PUT | /api/me/preferences, /api/me | — | n/a | 200/201 `Profile` (+ `phoneFormat`, `dateFormat`, `addressFormat`) | FR-016-16, -17 |
| GET | /api/me/export | — | n/a | 200 (`preferences` + oblike zapisa) | FR-016-17 |
| POST, PUT | /api/groups/{groupId}/contacts, …/contacts/{contactId} | EDITOR | rejected (409 GROUP_ARCHIVED) | 201/200 (`Attribute.type`, `parts`, `addressParts`; normalizacija) | FR-016-01, -02, -07 … -09, -12, -15 |
| GET | /api/groups/{groupId}/contacts?q=, …/contacts/{contactId} | VIEWER | allowed | 200 (tipi v odgovoru; iskanje telefona po števkah, naslovov po delih) | FR-016-01, -03, -10 |
| GET | /api/groups/{groupId}/suggestions?type=key | EDITOR | allowed | 200 (+ `attributeType`) | FR-016-01 |
| POST | /api/groups/{groupId}/contacts/bulk-update | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 (`type`, `parts` pri nastavitvi atributa) | FR-016-06 |
| GET | /api/groups/{groupId}/duplicates, …/duplicates/compare | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 (normalizirana primerjava, tipi) | FR-016-11, -26 |
| POST | /api/groups/{groupId}/duplicates/merge | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 (preverjanje po tipu) | FR-016-08, -26 |
| POST | /api/groups/{groupId}/imports/parse, …/imports/preview, …/imports | EDITOR | rejected (409 GROUP_ARCHIVED) | 200/201 (tipi, deli naslova, normalizacija) | FR-016-24 |
| POST | /api/groups/{groupId}/contacts/export, …/contacts/export/vcard; GET …/contacts/{contactId}/vcard | VIEWER | allowed | 200 (kanonično; naslov po pravilih države / `ADR` po delih) | FR-016-18, -25 |
| PROPFIND, REPORT, GET | /dav/addressbooks/{groupId}/… | VIEWER | allowed | 207/200 (kot vCard) | FR-016-18, -25 |
| GET | /api/groups/{groupId}/audit?action=ATTRIBUTE_TYPE, …/audit/{entryId}, …/changes | VIEWER | allowed | 200 (`attributeKey`, `typeBefore`, `typeAfter`) | FR-016-26 |
| POST | /api/groups/{groupId}/audit/{entryId}/rollback, …/initial-state/rollback | ADMIN | rejected (409 GROUP_ARCHIVED) | 201 (obnovi tipe ključev) | FR-016-26 |
| GET | /api/groups/{groupId}/contacts/{contactId}/history, …/versions/{ref}, …/compare | VIEWER | allowed | 200 (tipi, deli naslova) | FR-016-26 |
| POST | /api/groups/{groupId}/contacts/{contactId}/restore | EDITOR | rejected (409 GROUP_ARCHIVED) | 201 (veljavnost za trenutni tip, sicer 400) | FR-016-26 |

Nove kode (feature-map §2.10): `ATTRIBUTE_TYPE_CONFLICT` (409), `MAP_SERVICE_UNAVAILABLE` (503). Podrobnosti v `contracts/openapi.yaml`. Matrika: lokacija in predlogi ne pokličejo OSM, preden prestanejo 401 → 404 → 403 → 400.

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Atributi skupine (seznam ključev s tipi in številom, *Spremeni tip* z dialogom 8.11, seznam konfliktov s povezavami, *Poskusi znova*) – nov razdelek skupine | /groups/:groupId/attributes | VIEWER (sprememba EDITOR v nearhivirani skupini) | FR-016-05 |
| Nov / uredi kontakt: izbira tipa ob novem ključu, polja po tipih, deli naslova s samodokončanjem, *Razčleni naslov* | /groups/:groupId/contacts/new, /groups/:groupId/contacts/:contactId/edit | EDITOR | FR-016-01 … -03, -07, -12 … -15, -19 |
| Pogled kontakta: prikaz po tipu in shemi, *Pokaži na zemljevidu* in dialog zemljevida | /groups/:groupId/contacts/:contactId | VIEWER | FR-016-03, -20 … -22 |
| Seznam, dvojniki, sled, zgodovina: prikaz po shemi; množično urejanje s tipom | /groups/:groupId/contacts, …/duplicates, …/audit, …/contacts/:contactId/history | VIEWER (urejanje EDITOR) | FR-016-06, -16, -26 |
| Uvoz: tip novega ključa in deli naslova v preslikavi | /groups/:groupId/contacts/import | EDITOR | FR-016-24 |
| Moj račun: razdelek *Oblika zapisa* | /account | — | FR-016-16, -17 |

## Project Structure

### Documentation (this feature)

```text
docs/specs/016-tipizirani-atributi/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── pom.xml                                         # libphonenumber 9.0.42
├── src/main/resources/application.yaml             # maps.* (URL-ji, user-agent, omejitve, predpomnilnik)
├── src/main/resources/address-formats.json         # oblike naslovov po državah (R-04)
├── src/main/resources/db/migration/V13__tipizirani_atributi.sql
├── src/main/java/si/contactmanager/
│   ├── contact/      # AttributeType, Address, TypedValues (+ PhoneNormalizer, UrlNormalizer), AddressFormats,
│   │                 # AttributeKeyController/Repository/Service (seznam, sprememba tipa), ContactInputParser, ContactService,
│   │                 # ContactRepository, ContactSearch, BulkService, ImportService, VcardMapping/Reader/Writer,
│   │                 # ExportWriter, DuplicateKeys, MergeInputParser, ContactSnapshots, SuggestionRepository
│   ├── maps/         # nov: MapsController (lokacija, predlogi, ploščice), NominatimClient, PhotonClient, TileClient,
│   │                 # MapsProperties, RateLimiter, BoundedCache
│   ├── audit/        # AuditAction + ATTRIBUTE_TYPE, AuditEntry, ChangeDiff, RollbackService (tipi ključev), RestoreService
│   ├── account/      # Preferences, PreferencesParser, ProfileRepository, Profile, MyData, DisplayFormat enumi
│   └── shared/error/ # MAP_SERVICE_UNAVAILABLE (503)
└── src/test/java/si/contactmanager/…   # unit, IT, TypedAttributesSecurityIT, maps/MapsFakeServer

frontend/
├── package.json                                    # libphonenumber-js, leaflet, @types/leaflet
├── src/features/contacts/typed/   # TypeSelect, TypedValueInput, TypedValueView, AddressFields (samodokončanje), splitAddress.ts
├── src/features/contacts/         # ContactForm, ContactView, AttributeTransfer, types.ts, api.ts, selection (množično), export
├── src/features/formats/          # DisplayFormatsProvider, formatPhone/Date/Address, addressFormats.json (kopija, test enakosti)
├── src/features/map/              # ShowOnMapButton, MapDialog, authTileLayer.ts, api.ts
├── src/features/attributes/       # GroupAttributesPage, ChangeTypeDialog, TypeConflictList, api.ts
├── src/features/account/          # DisplayFormatSection, preferences.ts (naprava)
├── src/features/groups/GroupLayout.tsx            # razdelek attributes
├── src/features/{audit,history,duplicates,import}/ # prikaz po shemi, ATTRIBUTE_TYPE, preslikava tipov in delov naslova
├── src/i18n/{sl,en}.json
└── src/test/                       # skupni pomočniki (imena tipov in shem iz prevodov), MSW za /api/maps poti

e2e/tests/tipizirani-atributi.spec.ts, e2e/tests/support/typedAttributes.ts, e2e/osm-stub/server.mjs
compose.verify.yaml                                 # storitev osm-stub, MAPS_* zaledja nanjo
docs/architecture-decisions.md#2026-11-16-kartografska-storitev-osm, 2026-11-16-tipizirani-atributi-knjiznice.md
.specify/memory/feature-map.md (§2.6, §2.7, §2.10), constitution.md (VI)
```

**Structure Decision**: tipi in normalizacija so v paketu `contact` (uporabljajo paketno zasebne `ContactInputParser`, `CanonicalForms`, `ContactSnapshots`); posrednik OSM je nov paket `maps`, ker uvaja zunanjo storitev in ne dostopa do podatkov skupine sam (naslov mu preda `contact` po preverjanju dostopa). Na frontendu so oblikovalniki shem skupni (`features/formats`), ker jih uporabljajo seznam, pogled, dvojniki, sled in zgodovina.

## Open Questions

Razrešeno: razvijalec je 2026-11-16 potrdil oba predloga.

1. **Samodokončanje: Photon (komoot) za predloge, Nominatim samo za lokacijo na zemljevidu** – odločeno. Pogoji uporabe Nominatim samodokončanja izrecno prepovedujejo. URL-ja nastavljiva (`MAPS_PHOTON_URL`, `MAPS_NOMINATIM_URL`), tako da je mogoč lasten strežnik. Zapisano v R-08 in `docs/architecture-decisions.md#2026-11-16-kartografska-storitev-osm`.
2. **Ploščice: `tile.openstreetmap.org` prek posrednika v zaledju** – odločeno, URL nastavljiv (`MAPS_TILE_URL`); dovoljeno za majhen promet z User-Agent in predpomnjenjem; ob rasti prehod na ponudnika ploščic (nov ADR). Zapisano v R-08 in odločitvi OSM.

Odprtih vprašanj ni.

### Besedilo dopolnitve konstitucije VI (vnese se v `constitution.md` v istem PR)

> - Hranijo se samo osebni podatki, ki jih aplikacija potrebuje (ime in e-naslov iz Google računa) in uporabnikovi nastavitvi: izbira jezika in teme ter *oblika zapisa* (telefon, datum, naslov); veljata na vseh njegovih napravah, kopija v brskalniku velja tudi pred prijavo in po odjavi. Oboje je v izvozu podatkov in se izbriše z računom.
> - Edina izjema od prepovedi klicev na tuje storitve je kartografska storitev OpenStreetMap (Nominatim, Photon, ploščice; `docs/architecture-decisions.md#2026-11-16-kartografska-storitev-osm`): kliče jo samo zaledje, samo na izrecno zahtevo uporabnika (gumb zemljevida, samodokončanje naslova, *Razčleni naslov*), pošlje samo besedilo naslova brez podatkov uporabnika in kontakta, nič se ne shrani (predpomnilnik samo v pomnilniku, koordinate se ne hranijo) in besedilo naslova se ne beleži. Brskalnik ne kliče nobene tuje storitve.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Zunanja storitev (OSM) in odstop od konstitucije VI | zemljevid in samodokončanje (spec Clarifications Q2) | lastni geokoder/ploščice so preobsežni; neposredni klici iz brskalnika krši FR-016-23 |
| Nov paket `maps`, lastni omejevalnik in predpomnilnik v pomnilniku | pogoji uporabe (1 zahteva/s, predpomnjenje), brez trajne hrambe | knjižnica (Caffeine/Bucket4j) za ~2 majhna razreda ni potrebna; Redis je nova infrastruktura |
| Spremembe zunaj map funkcionalnosti: `compose.verify.yaml`, `application.yaml`, `GroupLayout`, `audit`, `account`, `feature-map.md`, `constitution.md` | nadomestni OSM za E2E, nastavitve, nov razdelek skupine, nova vrsta vnosa, nastavitev uporabnika, nova pravila | brez njih E2E kliče pravi OSM, sled nima vnosa spremembe tipa |
