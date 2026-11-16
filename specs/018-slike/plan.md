# Implementation Plan: Slike (018)

**Branch**: `slike` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-slike/spec.md`

## Summary

Tri vrste slik (uporabnik, skupina, kontakt) delijo en mehanizem: nalaganje (obrezano v brskalniku) → strežniška obdelava (preverjanje vsebine, omejen pomnilnik, orientacija, brez metapodatkov, 3 velikosti) → shramba v PostgreSQL za vmesnikom `ImageStore` → streženje samo prek preverjenega API-ja → prikaz v Reactu z zahtevkom z ID žetonom in `blob:` naslovom. Plan je **tvegana funkcionalnost** (osebni podatki, zunanji vir slike Google): pokaže se razvijalcu pred nalogami (konstitucija §2.1).

Ključne odločitve (podrobnosti v [research.md](research.md)):

1. **Shramba**: tabeli `image` + `image_variant` (`bytea`), nova migracija. Brez nove Maven ali npm knjižnice.
2. **Obdelava**: samo `javax.imageio`; strežnik sprejme JPEG in PNG, izhod JPEG (PNG pri prosojnosti). WebP preoblikuje brskalnik (ImageIO ga ne bere in ne piše). Orientacijo EXIF prebere majhen lasten razčlenjevalnik.
3. **Sled in obnova**: slika ni del posnetka kontakta. Stolpec `audit_entry.photo_change` beleži dejstvo. Pri izbrisu in obnovi kontakta slika sledi kontaktu prek **sprožilcev na tabeli `contact`** (odklop in ponovni priklop), zato posegi v obstoječo kodo kontaktov ostanejo minimalni.
4. **Zasebnost prikaza**: `GET` slike zahteva ID žeton in preverja članstvo; `<img src>` brez glave ne bi deloval, zato React slike prenese z `authFetchBlob` in pokaže prek `URL.createObjectURL`. Odgovor je `private, no-cache` z `ETag`.
5. **Google slika**: strežnik prebere naslov izključno iz `picture` v preverjenem ID žetonu, HTTPS, seznam dovoljenih gostiteljev, brez preusmeritev, preverjanje IP, omejitev časa in velikosti.

## Technical Context

**Language/Version**: Java 21 (Spring Boot) · TypeScript (strict) + React

**Primary Dependencies**: obstoječe; **brez novih** (ImageIO iz JDK, `java.net.http.HttpClient`; obrezovanje z lastno komponento na `<canvas>`)

**Storage**: PostgreSQL (`bytea`), migracija `V14__slike.sql` (začasna številka, glej Razmerje do 016 in 017)

**Testing**: JUnit 5 + Testcontainers (IT, matrika izolacije), enotni testi procesorja (slike v `src/test/resources`), Vitest + MSW + vitest-axe, Playwright + axe (360, 1280, `@w768` za obrezovanje)

**Target Platform**: Docker Compose (nginx + backend JRE 21 alpine)

**Performance Goals**: seznam 100 kontaktov z avatarji brez opaznega zamika (nalaga se samo vidne vrstice, 96 px različica 3–15 KB)

**Constraints**: WCAG 2.1 AA, sl/en, 5 MB / 4096 × 4096, največ 2 hkratni obdelavi, 10 nalaganj/min/uporabnika

**Scale/Scope**: ena slika na lastnika (~25–80 KB skupaj v treh velikostih)

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-018-01 do FR-018-23 pokriti spodaj; odločitve v Clarifications |
| II. Tests are mandatory | unit (procesor, EXIF, UrlGuard), IT (shramba, sprožilci, sled, brisanje), matrika izolacije, FE (MSW), E2E (nalaganje JPEG in PNG v pravem vsebniku) |
| III. Group isolation and roles | vsi endpointi skupine v matriki (401/404/403/2xx, 409); slike kontaktov in članov vedno z `group_id` v pogoju |
| IV. Accessible, bilingual, responsive UI | komponenta `Avatar`, `ImageUploadDialog` (design.md 8.10, 8.11, 8.13); obrezovanje s tipkovnico |
| V. Data integrity | optimistično zaklepanje (verzija skupine/kontakta), vnos v sledi v isti transakciji, atomarno nalaganje |
| VI. Privacy and GDPR | slika je osebni podatek; brisanje prek tujih ključev in sprožilcev; izvoz *Moji podatki*; brez tujih CDN-jev ali klicev brskalnika na Google |
| VII. One verification path | `quick` (unit, FE), `backend` (IT, matrika), `e2e` (nalaganje v vsebniku) |

Vrata: brez kršitev; nove knjižnice ni.

## Public Interfaces *(mandatory)*

### REST endpoints

Slike se vedno vrnejo kot `image/jpeg` ali `image/png`; neobstoječa slika je `404`. Parameter `size` je `96`, `256` ali `512` (privzeto 256). Nalaganje je `multipart/form-data` z delom `file` in, kjer je navedeno, `version` (verzija skupine ali kontakta, ki jo je uporabnik videl).

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/me/photo | — | n/a | 200 | FR-018-01, 22 |
| PUT | /api/me/photo | — | n/a | 200 (`PhotoResult`) | FR-018-01, 14–16 |
| DELETE | /api/me/photo | — | n/a | 204 | FR-018-02 |
| POST | /api/me/photo/google | — | n/a | 200 (`PhotoResult`) | FR-018-20, 23 |
| GET | /api/groups/{groupId}/members/{memberId}/photo | VIEWER | allowed | 200 | FR-018-03, 22 |
| GET | /api/groups/{groupId}/photo | VIEWER | allowed | 200 | FR-018-05, 07, 22 |
| PUT | /api/groups/{groupId}/photo | ADMIN | rejected (409 GROUP_ARCHIVED) | 200 (`PhotoResult`) | FR-018-05, 06, 08 |
| DELETE | /api/groups/{groupId}/photo?version=N | ADMIN | rejected (409 GROUP_ARCHIVED) | 200 (`PhotoResult`) | FR-018-06, 08 |
| GET | /api/groups/{groupId}/contacts/{contactId}/photo | VIEWER | allowed | 200 | FR-018-09, 22 |
| PUT | /api/groups/{groupId}/contacts/{contactId}/photo | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 (`PhotoResult`) | FR-018-09, 10 |
| DELETE | /api/groups/{groupId}/contacts/{contactId}/photo?version=N | EDITOR | rejected (409 GROUP_ARCHIVED) | 200 (`PhotoResult`) | FR-018-10 |

`PhotoResult` = `{ photoRevision: number|null, version: number }` (`version` skupine ali kontakta po spremembi, pri `/api/me` je izpuščen).

**Dodatna polja obstoječih odgovorov** (samo dodajanje, `null` = brez slike): `photoRevision` v `Profile`, `GroupSummary`, `GroupDetail`, `ArchivedGroupSummary`, `ContactSummary`, `ContactDetail`, `Member`. Vmesnik na podlagi tega ve, ali slika obstaja, in kdaj jo mora znova prenesti.

Vrstni red preverjanj in odgovori sledijo feature-map §2.2; napaka datoteke (`400`) pride po `409`. Nove kode: `409 GOOGLE_PHOTO_UNAVAILABLE`, `429 RATE_LIMITED` (v feature-map §2.10 se dodata ob implementaciji). Kode polja `file` pod `VALIDATION_FAILED`: `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `FILE_TOO_LARGE`, `REQUIRED`.

Preostala obstoječa dejanja se spremenijo brez novih poti: izbris, obnova in rollback kontakta (sprožilci), združevanje (en klic v `DuplicateService`), izbris računa in skupine (tuji ključi), izvoz *Moji podatki* (polje `photo`).

Odločitev o obsegu: **avatarji uporabnikov se prikažejo v meniju računa, *Mojem računu* in seznamu članov**. V revizijski sledi, povabilih in `updatedBy` (kjer vmesnik pozna samo `UserRef`: ime in e-naslov) ostanejo začetnice; zaradi tega FR-018-03 v spec.md velja samo za naštete zaslone. Razširitev bi zahtevala id uporabnika v vseh odgovorih in bi se prekrivala s 017.

### Pages and routes

Nove poti ni; spremembe obstoječih zaslonov.

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Moj račun (razdelek *Profilna slika*, gumb za Google) | /account | — | FR-018-01, 02, 20 |
| Meni računa (avatar) | vsi zasloni | — | FR-018-03 |
| Skupine, arhivirane skupine, preklopnik, glava | /groups, /groups/archived, /groups/:groupId/* | VIEWER | FR-018-05, 08 |
| Nastavitve skupine (razdelek *Slika skupine*) | /groups/:groupId/settings | ADMIN (spreminjanje) | FR-018-05, 06 |
| Člani (avatar) | /groups/:groupId/members | VIEWER | FR-018-03 |
| Seznam, panel, pogled, obrazec kontakta | /groups/:groupId/contacts… | VIEWER (obrazec: EDITOR) | FR-018-09, 10 |
| Dvojniki (avatar v primerjavi) | /groups/:groupId/duplicates | EDITOR | FR-018-09, 11 |

## Project Structure

### Documentation (this feature)

```text
specs/018-slike/
├── spec.md
├── plan.md              # ta datoteka
├── research.md          # odločitve in alternative, varnostne presoje
├── data-model.md        # tabele, sprožilci, življenjski cikel
├── quickstart.md        # preverjanje
├── contracts/openapi.yaml
└── tasks.md             # /speckit-tasks (še ne)
```

### Source Code (repository root)

```text
backend/src/main/java/si/contactmanager/image/    # NOVO: ImageController(+Me/Group/Contact), ImageService, ImageStore,
│                                                  # PostgresImageStore, ImageProcessor, ExifOrientation, UploadGuard,
│                                                  # GooglePhotoSource, UrlGuard, UploadRateLimiter
backend/src/main/java/si/contactmanager/{account,group,contact,member}/   # samo polje photoRevision (+ 1 klic v DuplicateService.merge)
backend/src/main/java/si/contactmanager/audit/    # photo_change v AuditEntry in vmesnik sledi
backend/src/main/resources/db/migration/V14__slike.sql
backend/src/test/java/si/contactmanager/image/    # unit + IT + matrika izolacije
frontend/src/shared/images/                       # Avatar, useProtectedImage, ImageUploadDialog, CropCanvas, imageApi
frontend/src/features/{account,groups,members,contacts,audit}/
frontend/src/i18n/{sl,en}.json
frontend/nginx.conf                               # večja meja velikosti telesa samo za poti slik
e2e/tests/slike.spec.ts
docs/decisions/2026-11-16-shramba-slik-v-bazi.md
```

**Structure Decision**: nov paket `image` hrani ves nov strežniški kod; obstoječi paketi dobijo samo dodatno polje. Skupna FE komponenta `Avatar` je pripravljena na prihodnjo prenovo dizajna (en vir velikosti in videza).

## Razmerje do 016 in 017

| Tema | Stanje | Ukrep |
|---|---|---|
| Migracije | 017: brez migracije (plan 017); 016: pričakuje `V13` (komentar v planu 017). 018 začasno `V14`. | Ob združitvi vzeti naslednjo prosto številko po `origin/main`; Flyway privzeto zavrne migracijo z nižjo številko od že uporabljene, zato se zaporedje ne sme prekriti na skupni bazi. Preveriti pred PR in po vsaki združitvi. |
| Datoteke skupin (`GroupSummary`, `GroupRepository`, `GroupsPage`, `ArchivedGroupsPage`, `sl.json`, `en.json`) | 017 jih močno spreminja | 018 združiti **po 017**; dodatek je polje `photoRevision` in JSX avatarja. |
| `ContactState`, obrazec in pogled kontakta, primerjava dvojnikov | 016 | slika ni v `ContactState`; v obrazec in pogled gre ločen razdelek; ob združitvi po 016 se samo ročno uskladi postavitev. |
| `feature-map.md`, `constitution.md` | 017 ima neobjavljene spremembe | 018 doda samo vrstico funkcionalnosti, kode napak in pravila slik (§2.6); spremembe potrdita razvijalca (konstitucija §7). |
| Dve `016-*` številki (main in `prijava-email-geslo`) | obstaja | ni vpliva na 018, FR-ID-ji so `FR-018-*`. |

## Complexity Tracking

Brez kršitev konstitucije. Odstopanja od poenostavitve: lasten razčlenjevalnik EXIF (~50 vrstic) namesto knjižnice, lastno obrezovanje na `<canvas>` namesto knjižnice (manj odvisnosti, nadzor nad dostopnostjo).
