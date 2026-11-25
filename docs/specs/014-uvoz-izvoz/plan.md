# Implementation Plan: Uvoz in izvoz kontaktov (Excel, vCard, koda QR, CardDAV)

**Branch**: `uvoz-izvoz` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/docs/specs/014-uvoz-izvoz/spec.md`

## Summary

Uvoz iz `.xlsx` in `.vcf` teče v treh korakih brez stanja na strežniku: **razčleni** (datoteka → glave in vrstice oz. kandidati), **predogled** (preverjanje 004/013, kanonizacija, prepoznava držav, dvojniki 011) in **potrdi** (atomarno, en vnos sledi `IMPORT`); preslikava stolpcev teče v brskalniku. Izvoz vCard 3.0 (izbor po pravilih 010 in en kontakt) z ez-vcard; ista preslikava kontakt ↔ vCard velja za datoteko, CardDAV in kodo QR. Kodo QR sestavi in prebere brskalnik (`qrcode`, `barcode-detector` z lokalno gostovanim WASM), slike ne zapustijo naprave. CardDAV je ročno izveden strežnik samo za branje pod `/dav/` z lastno verigo Spring Security (HTTP Basic z gesli za aplikacijo, SHA-256, zaklep v bazi); sinhronizacija uporablja zaporedje revizijske sledi kot `sync-token`. Migracija V12: vrsta vnosa `IMPORT`, tabeli `app_password` in `dav_login_state`.

## Technical Context

**Language/Version**: Java 21 (Spring Boot 4.1) · TypeScript (strict) + React 19

**Primary Dependencies**: obstoječe + `org.dhatim:fastexcel-reader` 0.20.2 (test → compile), `com.googlecode.ez-vcard:ez-vcard` 0.12.1 (brez jackson-core, jsoup) · `qrcode` 1.5.4, `@types/qrcode` 1.5.6 (dev), `barcode-detector` 3.2.3 (`zxing-wasm` 3.1.6) – research R-01, R-02, R-06, R-07

**Storage**: PostgreSQL; `V12__uvoz_izvoz.sql` (CHECK `audit_entry.action` + `IMPORT`, `app_password`, `dav_login_state`)

**Testing**: JUnit 5, Testcontainers, MockMvc (tudi metode WebDAV) · Vitest, RTL, MSW, vitest-axe · Playwright + axe (360/1280)

**Target Platform**: Docker Compose (nginx: `/api`, `/dav`, `/.well-known/carddav`), evergreen brskalniki, PWA; odjemalci CardDAV DAVx5, iOS/macOS, Thunderbird

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: predogled 10 000 vrstic < 10 s, potrditev 10 000 < 30 s (SC-002, paketni vstavki); branje QR s kamero < 3 s (SC-004)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin (tudi CardDAV), atomarnost uvoza, brez tujih CDN (WASM lokalno), datoteke in slike se ne hranijo, zaščita pred zip-bombo in XXE

**Scale/Scope**: do 10 000 kontaktov na uvoz/izvoz, datoteka do 10 MB, do 10 gesel na uporabnika

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-014-01 … 27 (tabela vmesnikov); odločitve v research R-01 … R-10 |
| II. Tests are mandatory | enota: `XlsxGuard`, preslikava glav, `VcardReader/Writer`, gesla, zaklep, XML; IT: uvoz (atomarnost, sled, rollback), izvoz vCard, gesla, CardDAV (PROPFIND/REPORT/GET/403/401/404, sync); FE: uvoz, preslikava, predogled, QR (pisanje/branje vCard, MECARD), gesla – MSW + axe; E2E: Excel in vCard krožna pot, QR iz slike, gesla |
| III. Group isolation and roles | vsi endpointi skupine v matriki (uvoz EDITOR + 409; izvoz vCard VIEWER, arhivirana dovoljena); gesla: 401 / 404 tuje; CardDAV: lastna matrika 401 / 404 / 403 (zapis) – `contracts/carddav.md` |
| IV. Accessible, bilingual, responsive UI | design.md 8.10 (pogovorna okna QR, skeniranje, novo geslo), 8.11 (preklic gesla), 8.6 in 8.9 (tabela predogleda, paginacija), 8.16 (meni *Uvozi*), 8.12 (fokus), 8.13 (obvestila), 8.15 (brez povezave); `role="status"`/`alert`; koda QR z besedilno alternativo; sl/en |
| V. Data integrity | uvoz atomaren (ena transakcija, ponovna preverba arhiva), en vnos sledi `IMPORT`, rollback 005; nove verzije kontaktov = 0; predogled paginiran (25); seznam gesel ≤ 10 |
| VI. Privacy and GDPR | datoteke in slike QR se ne hranijo; gesla samo kot SHA-256; izvoz »moji podatki« dobi imena in čase gesel; izbris računa kaskadno izbriše gesla in zaklep. Nove shranjene podatke o uporabniku (ime gesla, SHA-256, čas nastanka in zadnje uporabe, števec neuspelih prijav) aplikacija potrebuje za prijavo CardDAV (Clarifications Q3) – so v izvozu in se izbrišejo z računom; koda QR opozori, da so podatki vidni; WASM lokalno |
| VII. One verification path | `quick` po vsaki zgodbi; `backend` (migracija, IT, CardDAV); `e2e` v CI |

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| POST | /api/groups/{groupId}/imports/parse | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 | FR-014-02, -06, -08, -13 |
| POST | /api/groups/{groupId}/imports/preview | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 | FR-014-03, -04, -07, -09 |
| POST | /api/groups/{groupId}/imports | EDITOR | rejected (409 GROUP_ARCHIVED) | 201 | FR-014-05, -07, -08 |
| POST | /api/groups/{groupId}/contacts/export/vcard | VIEWER | allowed | 200 | FR-014-10, -11 |
| GET | /api/groups/{groupId}/contacts/{contactId}/vcard | VIEWER | allowed | 200 | FR-014-10, -11 |
| GET | /api/me/app-passwords | — | n/a | 200 | FR-014-21 |
| POST | /api/me/app-passwords | — | n/a | 201 | FR-014-21 |
| DELETE | /api/me/app-passwords/{passwordId} | — | n/a | 204 | FR-014-25 |
| GET | /api/me/export | — | n/a | 200 | FR-014-25 (doda `appPasswords`) |
| GET | /api/groups/{groupId}/audit?action=IMPORT | VIEWER | allowed | 200 | FR-014-05 (nova vrednost filtra) |

### CardDAV endpoints (HTTP Basic, geslo za aplikacijo – `contracts/carddav.md`)

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET, PROPFIND | /.well-known/carddav | public | n/a | 301 → /dav/ | FR-014-22 |
| OPTIONS, PROPFIND | /dav/, /dav/principals/me/, /dav/addressbooks/ | — (geslo za aplikacijo) | n/a | 200 / 207 | FR-014-22 |
| PROPFIND, REPORT | /dav/addressbooks/{groupId}/ | VIEWER | allowed | 207 | FR-014-22, -23 |
| GET, HEAD | /dav/addressbooks/{groupId}/{contactId}.vcf | VIEWER | allowed | 200 / 304 | FR-014-22 |
| PUT, DELETE, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, POST | /dav/** | — | — | 403 | FR-014-24 |

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Uvoz kontaktov (izbira datoteke, preslikava, predogled, potrditev) | /groups/:groupId/contacts/import?source=xlsx\|vcf | EDITOR (VIEWER ali arhivirana skupina → »Te strani ni«) | FR-014-01 … -09, -13 |
| Seznam kontaktov: meni *Uvozi*, *Dodaj s kodo QR* (okno), *Izvozi v vCard* v akcijski vrstici | /groups/:groupId/contacts | VIEWER (akcije uvoza EDITOR) | FR-014-01, -10, -17 |
| Pogled kontakta: *Prenesi vizitko (.vcf)*, *Deli s kodo QR* (okno) | /groups/:groupId/contacts/:contactId | VIEWER | FR-014-10, -14 … -16 |
| Nov kontakt, predizpolnjen iz kode QR (stanje usmerjevalnika) | /groups/:groupId/contacts/new | EDITOR | FR-014-18 |
| Moj račun: razdelek *Gesla za aplikacijo* in navodilo CardDAV | /account | — | FR-014-21, -25, -27 |

## Project Structure

### Documentation (this feature)

```text
docs/specs/014-uvoz-izvoz/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/openapi.yaml, contracts/carddav.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── pom.xml                                        # fastexcel-reader compile, ez-vcard
├── src/main/resources/application.yml             # multipart 10 MB
├── src/main/resources/db/migration/V12__uvoz_izvoz.sql
├── src/main/java/si/contactmanager/
│   ├── contact/              # uvoz: ImportController, ImportService, ImportInputParser, XlsxGuard, XlsxSheetReader, HeaderMapping
│   │                         # vCard: VcardWriter, VcardReader, VcardMapping (R-03), VcardExportController (v paketu contact,
│   │                         # ker uporabljajo paketno zasebne ContactInputParser, CanonicalForms, DuplicateKeys, ExportService)
│   ├── audit/AuditAction     # + IMPORT
│   ├── account/              # ExportAssembler/MyData (+ appPasswords); AppPasswordController, AppPasswordRepository,
│   │                         # AppPasswords (generator, SHA-256), AppPasswordAuthenticator (prijava CardDAV, zaklep)
│   ├── carddav/              # DavController (vse metode, sync, ETag/ctag), DavRepository, DavXml (varen bralnik)
│   └── shared/security/      # DavSecurityConfig (@Order(1), Basic, firewall za metode WebDAV)
└── src/test/java/si/contactmanager/…   # unit, IT, matrika izolacije (REST in CardDAV)

frontend/
├── nginx.conf, vite.config.ts                     # /dav, /.well-known, 25 MB za uvoz; wasm v precache
├── src/features/import/      # ImportPage, FileStep, MappingStep, PreviewTable, CountryResolver, mapping.ts, api.ts
├── src/features/contacts/    # ContactToolbar (Uvozi, Dodaj s kodo QR), ContactsPage (pot import), ContactView, ContactFormPage (predizpolnitev)
│   ├── export/               # vCard izvoz (api, exportFileName .vcf)
│   ├── selection/            # SelectionActionBar: Izvozi v vCard
│   └── qr/                   # QrShareDialog, QrScanDialog, vcardWrite.ts, vcardRead.ts, mecard.ts, qrFit.ts, scanner.ts
├── src/features/account/     # AppPasswordsSection, CreateAppPasswordDialog, RevokeAppPasswordDialog, CardDavHelp
├── src/features/audit/types.ts                    # AUDIT_ACTIONS + IMPORT
├── src/i18n/{sl,en}.json
└── src/test/                 # skupni pomočniki (imena iz prevodov)

e2e/tests/uvoz-izvoz.spec.ts, e2e/tests/support/importExport.ts
docs/architecture-decisions.md#2026-11-15-gesla-za-aplikacijo-carddav, …-uvoz-izvoz-knjiznice.md
```

**Structure Decision**: uvoz in vCard sta podpaketa `contact` (uporabljata paketno zasebne `ContactInputParser`, `CanonicalForms`, `DuplicateKeys`, `ExportService`); gesla za aplikacijo in CardDAV sta nova paketa, ker uvajata nov tip klicatelja. Na frontendu je uvoz svoja mapa `features/import` (stran s koraki), QR je pod `features/contacts/qr`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Druga varnostna veriga (HTTP Basic) poleg Firebase | odjemalci CardDAV ne podpirajo prijave z Googlom (spec Assumptions) | CardDAV pod `/api` z JWT ni mogoč; OAuth za CardDAV podpira le malo odjemalcev |
| Novi shranjeni podatki o uporabniku (konstitucija VI) | gesla za aplikacijo in zaklep prijave CardDAV | brez shranjenega preverljivega gesla prijava CardDAV ni mogoča; hrani se le SHA-256, izvoz in izbris po 012 |
| Spremembe zunaj map funkcionalnosti: `nginx.conf`, `vite.config.ts`, `application.yml`, `features/audit/types.ts`, `audit/AuditAction` | proxy `/dav`, večje telo uvoza, WASM v precache, nova vrsta vnosa sledi | brez njih CardDAV in branje QR brez povezave ne delujeta, sled ne bi imela vnosa *Uvoz* |
