# Implementation Plan: Pametni atributi in značke

**Branch**: `pametni-atributi` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-pametni-atributi/spec.md`

## Summary

Kontakt dobi stolpca `company` (besedilo ≤ 200) in `country` (koda ISO 3166-1 alpha-2); polji pridejo v iskanje, filtre, izvoz, množično urejanje, primerjavo dvojnikov, posnetke sledi in rollback. Predlogi ključev, vrednosti, podjetij, držav (po pogostosti) in značk pridejo iz **ene** nove končne točke `GET …/suggestions` (nadomesti `GET …/tags`); en skupen kombiniran vnos na frontendu nadomesti ločeno logiko značk. Strežnik pri vsakem pisanju kanonizira ključe in značke (pogostejša različica v skupini), ne da bi spreminjal obstoječe podatke. Rezervirana imena `država/country/podjetje/company` veljajo samo za nove ali spremenjene ključe (obstoječi atributi ostanejo; v obrazcu je ročni prenos v polje). Skupno prepoznavanje države (`CountryNames`) je javna Java enota za 014 in za prenos (FE ga kliče prek `POST /api/countries/resolve`).

## Technical Context

**Language/Version**: Java 21 (Spring Boot 3.x) · TypeScript (strict) + React

**Primary Dependencies**: brez novih (imena držav iz JDK: `Locale`, CLDR; na frontendu `Intl.DisplayNames`)

**Storage**: PostgreSQL; ena migracija `V10__pametni_atributi.sql` (samo dodajanje stolpcev)

**Testing**: JUnit 5, Testcontainers · Vitest, RTL, MSW, vitest-axe · Playwright + axe

**Target Platform**: Docker Compose, evergreen brskalniki, PWA

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: predlogi < 300 ms (95. percentil) pri 10.000 kontaktih (SC-003)

**Constraints**: WCAG 2.1 AA, sl/en, izolacija skupin, optimistično zaklepanje, brez sprememb obstoječih podatkov

**Scale/Scope**: do 10.000 kontaktov na skupino (009), do 50 atributov in 30 značk na kontakt

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-013-01 … 20 (tabela spodaj); vse spremembe iz spec.md |
| II. Tests are mandatory | enota: parser, `CountryNames`, kanonizacija; IT: kontakti, množično, združevanje, izvoz, iskanje, rollback, predlogi; FE: komponente z MSW; E2E: obrazec, predlogi, prenos |
| III. Group isolation and roles | `GET …/suggestions` ima vnos v matriki izolacije (401/404/403/200 arhivirana); vsa poizvedba ima `group_id`; `POST /api/countries/resolve` ne bere podatkov skupine (samo prijava, 401) |
| IV. Accessible, bilingual, responsive UI | design.md 8.3 in 8.4 (kombinirana polja po ARIA 1.2), 10; sl/en prevodi |
| V. Data integrity | migracija samo dodaja nullable stolpca; verzije in sled nespremenjene; rollback obnovi posnetke dobesedno |
| VI. Privacy and GDPR | država in podjetje sta podatka kontakta v skupini; izvoz »moji podatki« (012) ne vsebuje kontaktov skupin (preverjeno v `ExportAssembler`), zato se ne spremeni; predlogi ne vračajo identifikatorjev; izbris skupine in računa ostane po kaskadah |
| VII. One verification path | `./verify.sh quick` po vsaki rezini; `backend` in `e2e` zaradi API, migracije in UI |

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/groups/{groupId}/suggestions?type=key\|value\|company\|tag\|country&q=&key= | EDITOR | allowed | 200 | FR-013-09, -11, -12, -14, -16 |
| POST | /api/countries/resolve | — (prijavljen uporabnik) | n/a | 200 | FR-013-19, -20 |
| POST | /api/groups/{groupId}/contacts | EDITOR | rejected (409 GROUP_ARCHIVED) | 201 | FR-013-01, -08, -10, -13 (nova polja `company`, `country`, kanonizacija) |
| PUT | /api/groups/{groupId}/contacts/{contactId} | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 | FR-013-01, -08, -10, -13 |
| GET | /api/groups/{groupId}/contacts?f=company:…&f=country:… | VIEWER | allowed | 200 | FR-013-03 (nov filter; `q` išče tudi po obeh poljih) |
| POST | /api/groups/{groupId}/contacts/bulk-update | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 | FR-013-05, -08, -10, -15 |
| POST | /api/groups/{groupId}/duplicates/merge | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 | FR-013-06, -08, -10 |
| GET | /api/groups/{groupId}/duplicates/compare | EDITOR | allowed | 200 | FR-013-06 |
| POST | /api/groups/{groupId}/contacts/export | VIEWER | allowed | 200 | FR-013-04 |
| ~~GET~~ | ~~/api/groups/{groupId}/tags~~ | – | – | **odstranjena** (nadomesti `type=tag`) | FR-013-14 |

`GET /contacts/{id}`, `GET /audit/…/changes` in `contact-filters` ostanejo; dobijo samo nova polja v odgovoru (`company`, `country`; vrednosti `COMPANY`/`COUNTRY` v `ChangeField.field`).

### Pages and routes

Nobena nova stran. Spremembe: obrazec kontakta (nov/urejanje), pogled kontakta, filtri v seznamu, množično urejanje, primerjava dvojnikov, podrobnosti sledi – vse na obstoječih poteh.

## Project Structure

### Documentation (this feature)

```text
specs/013-pametni-atributi/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/openapi.yaml
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/main/resources/db/migration/V10__pametni_atributi.sql
├── src/main/java/si/contactmanager/contact/
│   ├── CountryNames.java            # javna: ISO seznam, imena sl/en, iskanje, prepoznavanje (FR-013-03, -19)
│   ├── CountryController.java       # POST /api/countries/resolve
│   ├── SuggestionController/Service # GET …/suggestions (zamenja /tags, TagSuggestions)
│   ├── AttributeKeys.java           # rezervirana imena (stara + 4 nova), kanonizacija ključev in značk
│   └── ContactInput/Parser/State/Detail/Repository/Snapshots/Search/QueryParser/Bulk*/Merge*/Export*/Compare*  # polji company, country
├── src/main/java/si/contactmanager/audit/ChangeDiff, ChangeField, RollbackService
└── src/test/java/si/contactmanager/…   # unit, IT, matrika izolacije

frontend/
├── src/features/contacts/    # SuggestInput, CountryField, countries.ts, api (suggestions), ContactForm, ContactView, TagInput, FilterPanel, BulkEditDialog, validation
├── src/features/duplicates/  # compare/merge: polji
├── src/features/audit/       # ChangeTable (država z imenom), types
├── src/i18n/{sl,en}.json
└── src/**/*.test.tsx

e2e/tests/pametni-atributi.spec.ts
```

**Structure Decision**: razširitev paketov `contact` in `audit` ter `features/contacts`; nobenega novega modula. Predlogi so en endpoint in en hook, da značke, ključi, vrednosti in podjetje ne podvajajo kode.

## Complexity Tracking

Ni kršitev. Odstranitev `GET …/tags` je namerna (en vir predlogov); spremenjeni obstoječi testi gredo v opis PR.
