# Implementation Plan: Moji podatki – izvoz podatkov in izbris računa

**Branch**: `moji-podatki` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-moji-podatki/spec.md`

## Summary

Zaledje dobi tri endpointe, vezane na prijavljenega uporabnika (brez identifikatorja uporabnika v poti): `GET /api/me/export` (JSON posnetek uporabnikovih podatkov), `GET /api/me/deletion-blockers`
(nearhivirane skupine v lasti) in `POST /api/me/deletion` (izbris računa z vpisom e-naslova). Izbris je **saga brez skupne transakcije** (R-01): ena transakcija PostgreSQL zaklene vse skupine uporabnika po naraščajočem `id`,
presodi na ponovno prebranem stanju (`409 OWNS_ACTIVE_GROUPS`, izbris arhiviranih skupin, v katerih je edini član), izbriše `app_user` (obstoječe `ON DELETE` kaskade iz V3–V7 že izvedejo izbris članstev in prejetih povabil
ter »izbrisan uporabnik« v sledi, povabilih in zadnjih izvajalcih) in zapiše **nadgrobnik** `deleted_identity` z Firebase UID (R-02, R-05). Šele po potrditvi sledi klic Firebase `accounts:delete` (R-06);
neuspeh ostane trajno zapisan in ga ponavlja opravilo `IdentityDeletionJob` (R-07), zato zrušitev ali izpad Firebase ne pusti nobenega stanja, ki bi ga bilo treba popravljati ročno.
**Odgovor ima dve uspešni stanji (CR-03, R-16):** `204` = lokalni račun in identiteta pri Firebase izbrisana; `202 Accepted` (`IDENTITY_DELETION_PENDING`) = lokalni izbris zaključen, brisanje identitete čaka na ponavljanje; vmesnik v obeh primerih odjavi uporabnika, ob `202` pa na strani za prijavo pove, da se z istim Google računom nekaj časa morda ni mogoče znova registrirati. Nadgrobnik se po uspehu in 2 urah izbriše (R-16), ponavljanje in čiščenje preživita ponovni zagon.
Ker ID žetona ni mogoče razveljaviti, dekoder žetonov zavrne UID iz nadgrobnika (401 na vseh napravah, FR-012-15; R-08), odloženi sprožilec na `app_user` pa prepreči, da bi sočasna prijava račun znova ustvarila (R-03).
Migracija `V9__moji_podatki.sql` doda nadgrobnik, sprožilec in štiri indekse za `ON DELETE SET NULL` (ne spreminja obstoječih tabel). Vmesnik dobi razdelka *Moji podatki* in *Izbris računa* v `AccountPage`, dialog z vpisom
e-naslova in stran za prijavo s potrdilom o izbrisu. Odločitve: [research.md](research.md) (D-72, D-73, D-74 – potrjene).

## Technical Context

**Language/Version**: Java 21 · Spring Boot 4.1.2 · TypeScript 6.0 (strict) · React 19.3 · Node.js ≥ 22.22

**Primary Dependencies**: obstoječe (zaledje: Web MVC, Security, JDBC `JdbcClient`, Flyway, `java.net.http`; vmesnik: `react-router`, `radix-ui` Dialog, `sonner`, `@tabler/icons-react`, `react-i18next`, `firebase`).
**Ena nova knjižnica (D-73, potrjena z D-74):** `com.google.auth:google-auth-library-oauth2-http` samo za OAuth2 žeton storitvenega računa v produkciji (R-06); emulator in testi je ne potrebujejo.

**Storage**: PostgreSQL 18; migracija `V9__moji_podatki.sql` (1 tabela, 1 sprožilec, 4 indeksi; [data-model.md](data-model.md))

**Testing**: JUnit 5 + Testcontainers + Firebase Auth Emulator (integracijski, matrika izolacije, sočasnost, izpad Firebase z `docker pause`) · Vitest + RTL + MSW + `vitest-axe` · Playwright + axe (360/768/1280 px, sl in en)

**Target Platform**: Docker Compose (nginx + backend), evergreen brskalniki, PWA (izvoz brez povezave → vidna napaka, FR-012-04)

**Project Type**: web application (backend + frontend + e2e)

**Performance Goals**: izvoz: 5 poizvedb v enem posnetku, SC-001 (100 članstev + 50 povabil) ≤ 5 s; izbris: 1 transakcija (zaklep skupin, ponovno branje, ≤ 4 `DELETE`/`INSERT`); dekoder: +1 poizvedba po PK na zahtevek

**Constraints**: WCAG 2.1 AA, sl/en, brez pravih zunanjih storitev v testih (emulator), barve samo iz žetonov, izbris se ne zapiše v sled (§2.7), brez sprememb obstoječih tabel in pogodb 001–008,
brez AI dnevnikov, skrivnosti (poverilnice storitvenega računa) izven Gita

**Scale/Scope**: 18 FR (FR-012-01 … FR-012-18), 9 SC, 3 endpointi, 0 novih poti (razdelka v `/account`), 1 migracija, 1 novo ozadnje opravilo

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification is the contract | Pokriti vsi FR-012-01 … FR-012-18 in SC-001 … SC-009 (tabela pokritosti spodaj); *Public Interfaces* določajo endpointe, poti in dostopna imena; `OWNS_ACTIVE_GROUPS` je že v feature-map §2.10 (nove kode ni); nova koda polja pri 400: `email: MISMATCH`. Specifikacija se ne spreminja. |
| II. Test-first | BE: unit (`ExportAssemblerTest`, `DeleteAccountInputParserTest`, `IdentityRetryBackoffTest`, `FirebaseIdentityProviderTest` (lažen transport in vir žetona), `ConfigurationSecurityTest`, `MigrationVersionsUniqueTest`), integracijski (`MyDataExportIT`, `DeletionBlockersIT`, `AccountDeletionIT`, `AccountDeletionGroupsIT`, `AccountDeletionConcurrencyIT`, `AccountDeletionLockingIT`, `AccountDeletionAtomicityIT`, `MyDataExportConcurrencyIT`, `IdentityDeletionIT` (izpad, ponovitev, odmik, čiščenje), `IdentityDeletionRestartIT` (ponavljanje in čiščenje po ponovnem zagonu), `FirebaseIdentityProviderIT`, `AccountDeletionMigrationIT`, `AccountDeletionAuditIT`), varnostni (`MyDataIsolationMatrixSecurityIT`, `DeletedIdentityTokenSecurityIT`, `DeletedUserLeakSecurityIT`, `ReRegistrationGuardSecurityIT`). FE: funkcionalni z MSW in `vitest-axe`. E2E `moji-podatki.spec.ts`. Pregled testov opravi agent `pregled-testov` pred kodo (workflow §4.2). |
| III. Group isolation and roles | Vsi trije endpointi so v matriki izolacije za uporabniško vezane vire (workflow 2.5): 401 (brez, neveljaven, potekel žeton, žeton izbrisanega uporabnika), 404 za tuj identifikator (poti ne obstajajo). Izbris pod zaklepi skupin ne more pustiti nearhivirane skupine brez lastnika (SC-006). Avtorizacija ostaja na zaledju (`OWNS_ACTIVE_GROUPS` presoja strežnik, vmesnik le skrije gumb). |
| IV. Accessible, bilingual, responsive UI | design.md 8.11 (dialog z vpisom), 8.13 (napaka s *Poskusi znova*), 9.9 (točki 3 in 4); fokus na *Prekliči*, Esc, vrnitev fokusa; sl/en (`account.data.*`, `account.delete.*`, `login.accountDeleted`); axe v FE testih in E2E; 320 px; gumbi ≥ 44 px. |
| V. Data integrity | Lokalni izbris je atomaren (ena kratka transakcija; test atomarnosti); odločitev pod zaklepom (R-04); izbris ni skupna transakcija z Firebase, zunanji klic teče zunaj podatkovne transakcije, vmesna stanja so trajno zapisana in idempotentna (R-01, R-07); sled ostane nespremenljiva (R-05). Izvoz je `REPEATABLE READ` posnetek. **Odstopanje od »vsi seznami so paginirani«:** izvoz je celovit posnetek v datoteko, seznam blokad pa je omejen na lastne nearhivirane skupine (R-15, *Complexity Tracking*). |
| VI. Privacy and GDPR | Izvoz in izbris sta jedro te funkcionalnosti. **Odstopanje (D-72, R-15):** Firebase UID izbrisanega uporabnika ostane v `deleted_identity` do uspešnega brisanja pri ponudniku in še 2 uri (razveljavitev žetona); ni ime ali e-naslov (SC-004), isti stolpec že obstaja kot `app_user.firebase_uid`. Potrditev drugega razvijalca v pregledu PR (kot D-19). Brez novih osebnih podatkov. Poverilnice storitvenega računa niso v Gitu. |
| VII. One verification path | Novi testi tečejo v obstoječih korakih `verify.sh`. Nova knjižnica ima vnos D-73 (potrjena z D-74). Brez utišanj (`@SuppressWarnings`, `eslint-disable`). |

**Rezultat (pred raziskavo):** PASS. **Ponovno preverjanje po fazi 1:** PASS. Opombe: (1) VI: odstopanje z vnosom D-72 in potrditvijo obeh razvijalcev (R-15); V: nepaginiran izvoz utemeljen v R-15; (2) VII zahteva vnos za novo knjižnico → D-73, potrjen z D-74 (razvijalec); (3) migracijska številka V9 ni zagotovo prosta (R-14).

## Public Interfaces *(mandatory)*

### REST endpoints

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| GET | /api/me/export | — | ni vezano na skupino | 200; telo `MyData` (JSON), glave `Content-Disposition`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` | FR-012-01, FR-012-02, FR-012-03, FR-012-16 |
| GET | /api/me/deletion-blockers | — | ni vezano na skupino | 200; telo `{"groups":[{"id","title"}]}` | FR-012-06 |
| POST | /api/me/deletion | — | ni vezano na skupino (arhivirane skupine ne blokirajo) | 204 (lokalni račun in identiteta izbrisana) ali 202 `{"code":"IDENTITY_DELETION_PENDING"}` (lokalni izbris zaključen, brisanje identitete čaka) | FR-012-06 … FR-012-18 |

- `GET /api/me/export`: 401 (neprijavljen, neveljaven, potekel žeton, žeton izbrisanega uporabnika; tudi če uporabnika v posnetku ni več). Vsebina po FR-012-02: `formatVersion`, `exportedAt`, `profile`, `memberships`, `receivedInvitations`,
  `sentInvitations`, `ownedGroups`; seznami brez vnosov so prazni (`[]`). Brez kontaktov, sledi, imen in e-naslovov drugih članov (izjema: ime pošiljatelja prejetega povabila, `inviteeEmail` poslanega).
  Ime datoteke s strežnika (UTC): `moji-podatki-YYYY-MM-DD.json`; vmesnik datoteko poimenuje po lokalnem datumu (R-09).
- `GET /api/me/deletion-blockers`: 401; sicer 200 s seznamom nearhiviranih skupin v lasti (lahko prazen).
- `POST /api/me/deletion` telo `{"email": "…"}`. Vrstni red: **401** (neprijavljen, žeton izbrisanega, uporabnik ne obstaja več) → **400 `VALIDATION_FAILED`** (`email`: `REQUIRED`, `MISMATCH`; neznano polje `UNKNOWN_FIELD`;
  neveljaven JSON `body: MALFORMED`) → **409 `OWNS_ACTIVE_GROUPS`** s telesom `{"code","groups":[{"id","title"}]}` (preverjeno pod zaklepi, FR-012-13) → **204** ali **202**. Primerjava e-naslova: obrez, brez velikosti črk, z e-naslovom v bazi.
  **204** – takojšen poskus brisanja identitete (omejen na 5 s) je uspel ali identiteta ni več obstajala. **202** – podatki aplikacije so v celoti izbrisani, brisanje identitete pa ni uspelo (nedosegljiv, `5xx`, `429`, `401/403` poverilnic) in se ponavlja do uspeha; ponovitev zahtevka ni mogoča (uporabnika ni več, žeton → 401) in ni potrebna. V obeh stanjih je žeton neuporaben (401); ob `202` se uporabnik z istim Google računom morda še ne more znova registrirati (prijava 401, dokler brisanje pri Firebase ne uspe).
- **Ne obstajajo** (FR-012-16): `/api/users/{id}/export`, `/api/users/{id}`, `/api/me/{id}/export` → `404`; `DELETE /api/me` → `405` (pot obstaja samo za `PUT`); testirano po poti.
- Napake: `401 {"code":"UNAUTHENTICATED"}`; `400 {"code":"VALIDATION_FAILED","errors":[{"field","code"}]}`; `409 {"code":"OWNS_ACTIVE_GROUPS","groups":[…]}`. Podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml).
- Posledice ob dokončanem izbrisu za druge funkcionalnosti (brez sprememb njihovih pogodb): `GET …/audit` in `GET …/members`, `GET /api/groups/archived`, `GET /api/invitations` in `GET …/invitations` že prikazujejo
  `null` / `deletedOwner` kot »izbrisan uporabnik« (D-55, 005, 007).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Moj račun (+ razdelka *Moji podatki*, *Izbris računa*) (001) | /account | — | FR-012-01 … FR-012-07, FR-012-13 … FR-012-14 |
| Prijava (001) – potrdilo po izbrisu (`/login?reason=account-deleted` ob `204`, `/login?reason=account-deleted-pending` ob `202`) | /login | javno | FR-012-14, FR-012-17 |
| Skupina (002) – cilj povezav blokirnih skupin | /groups/:groupId | — | FR-012-06 |

- Nove poti ni. Po uspešnem izbrisu vmesnik uporabnika odjavi (lokalno iz Firebase JS SDK), počisti sejo in preusmeri na `/login?reason=account-deleted`.

### Key elements and accessible names

<!-- Tests use only getByRole(name) / getByLabel with these names. -->

| Page | ARIA role | Accessible name (sl / en) | Purpose | FR-ID |
|---|---|---|---|---|
| Moj račun | region + heading (level 2) | »Moji podatki« / "My data" | razdelek | FR-012-01 |
| Moji podatki | text | »Izvoz vsebuje tvoje osebne podatke, članstva v skupinah, prejeta in poslana povabila ter skupine, katerih lastnik si. Kontaktov in revizijskih sledi ne vsebuje.« / "The export contains your personal data, group memberships, received and sent invitations and the groups you own. It does not contain contacts or audit trails." | razlaga vsebine | FR-012-01, FR-012-03 |
| Moji podatki | button | »Prenesi moje podatke (JSON)« / "Download my data (JSON)" | sproži izvoz (`aria-busy` med klicem) | FR-012-01, FR-012-02 |
| Moji podatki | alert + button | »Podatkov ni bilo mogoče pripraviti. Poskusi znova.« / "Your data could not be prepared. Please try again." + »Poskusi znova« / "Try again" | napaka izvoza; datoteke ni | FR-012-04 |
| Moji podatki | status | »Podatki so preneseni.« / "Your data has been downloaded." | uspeh | FR-012-02 |
| Moj račun | region + heading (level 2) | »Izbris računa« / "Delete account" | razdelek | FR-012-05 |
| Izbris računa | text | »Izbris je nepovraten. Tvoji osebni podatki in prejeta povabila se izbrišejo, odstranjen boš iz vseh skupin, v arhiviranih skupinah, katerih lastnik si, in v revizijskih sledeh bo namesto tebe prikazan »izbrisan uporabnik«. Arhivirane skupine, v katerih si edini član, se izbrišejo.« / "Deletion is permanent. Your personal data and received invitations will be deleted, you will be removed from all groups, and "deleted user" will be shown instead of you in archived groups you own and in audit trails. Archived groups in which you are the only member will be deleted." | razlaga posledic | FR-012-05 |
| Izbris računa | button | »Izbriši račun« / "Delete account" (nevarni) | odpre dialog; ni izrisan, dokler je uporabnik lastnik nearhivirane skupine | FR-012-06, FR-012-07 |
| Izbris računa | list + link | »Skupine, ki preprečujejo izbris računa« / "Groups that prevent account deletion"; povezave z naslovi skupin; navodilo »Prenesi lastništvo ali arhiviraj te skupine« / "Transfer ownership or archive these groups" | blokada (namesto gumba) | FR-012-06 |
| Izbris računa | status, alert + button | »Nalagam…« / "Loading…"; »Skupin, ki preprečujejo izbris, ni bilo mogoče naložiti. Poskusi znova.« / "Groups that prevent deletion could not be loaded. Please try again." + »Poskusi znova« | nalaganje, napaka seznama | FR-012-06 |
| Dialog izbrisa | dialog | »Izbrišem račun?« / "Delete account?" | potrditev; fokus ob odprtju na »Prekliči« | FR-012-07 |
| Dialog izbrisa | text, textbox | razlaga posledic (enaka kot v razdelku); »Za potrditev vpiši svoj e-naslov« / "Type your email address to confirm" | vpis e-naslova | FR-012-07 |
| Dialog izbrisa | text (`aria-describedby`, polje `aria-invalid`) | »Vpisani e-naslov se ne ujema z tvojim.« / "The email address you typed does not match yours." | napaka ob neujemanju (tudi 400 `MISMATCH`); zahtevek se ne pošlje | FR-012-07 |
| Dialog izbrisa | button | »Prekliči« / "Cancel"; »Izbriši račun« / "Delete account" (nevarni, `aria-busy` med klicem) | gumba | FR-012-07 |
| Dialog izbrisa | alert | »Računa ni bilo mogoče izbrisati. Poskusi znova.« / "Your account could not be deleted. Please try again." | napaka omrežja ali strežnika; dialog ostane odprt, nič se ni izbrisalo | FR-012-07 |
| Izbris računa | alert | »Račun ne more biti izbrisan, ker si medtem postal lastnik nearhivirane skupine. Prenesi lastništvo ali arhiviraj te skupine.« / "Your account cannot be deleted because you have become the owner of an active group. Transfer ownership or archive these groups." | 409 `OWNS_ACTIVE_GROUPS` (dialog se zapre, seznam se osveži iz telesa) | FR-012-13 |
| Prijava | status | »Tvoj račun je izbrisan.« / "Your account has been deleted." | potrdilo po izbrisu (`204`) | FR-012-14, FR-012-17 |
| Prijava | status | »Tvoj račun je izbrisan. Brisanje povezave z Google računom še poteka, zato se z istim Google računom nekaj časa morda ne boš mogel znova registrirati. Poskusi znova čez nekaj minut.« / "Your account has been deleted. Removing the link to your Google account is still in progress, so you may not be able to register again with the same Google account for a while. Please try again in a few minutes." | potrdilo ob `202` (stanje čakanja) | FR-012-17 |

- Razdelka sta v `/account` v vrstnem redu design.md 9.9: *Profil* → *Videz* → **Moji podatki** → **Izbris računa** → *Odjava*.
- Po uspešnem izbrisu fokus preide na naslov strani za prijavo (obstoječe obnašanje `LoginPage`); stanje seje je počiščeno **pred** preusmeritvijo, da se ne sproži sporočilo o poteku seje (FR-001-10).
- Po `409` vmesnik zapre dialog, osveži seznam blokirnih skupin iz telesa in premakne fokus na naslov razdelka *Izbris računa* (element z fokusom je izginil).
- Izvoz: odgovor se shrani z `Blob` in `<a download="moji-podatki-YYYY-MM-DD.json">` z lokalnim datumom; med klicem je gumb `aria-busy` in onemogočen; ob uspehu `status`, ob napaki `alert` in *Poskusi znova*.

### Pokritost zahtev po ravneh testov

| FR-ID | BE integracijski / varnostni / sočasnostni | FE funkcionalni | E2E |
|---|---|---|---|
| FR-012-01 | – | `MyDataSection.test` | `moji-podatki.spec` |
| FR-012-02 | `MyDataExportIT` (vsa polja, prazni seznami, izbrisan pošiljatelj, jezik/tema, glave, ime datoteke), `ExportAssemblerTest`, `MyDataExportConcurrencyIT` (izvoz med izbrisom: popoln ali 401), `MyDataIsolationMatrixSecurityIT` | `MyDataSection.test` (ime datoteke po lokalnem datumu) | `moji-podatki.spec` (prenos in branje nazaj) |
| FR-012-03 | `MyDataExportIT` (kanarčki v kontaktih, sledi, drugih članih; bela lista: ime pošiljatelja, e-naslov povabljenega – CR-04), `MyDataIsolationMatrixSecurityIT` | – | `moji-podatki.spec` |
| FR-012-04 | – | `MyDataSection.test` (MSW 500, brez povezave) | `moji-podatki.spec` (`page.route` abort) |
| FR-012-05 | – | `DeleteAccountSection.test` | `moji-podatki.spec` |
| FR-012-06 | `DeletionBlockersIT`, `AccountDeletionIT` (409), `AccountDeletionGroupsIT`, `MyDataIsolationMatrixSecurityIT` | `DeleteAccountSection.test` (seznam, povezave, brez gumba, po arhiviranju gumb) | `moji-podatki.spec` |
| FR-012-07 | `AccountDeletionIT` (400 `REQUIRED`/`MISMATCH`, obrez, velikost črk), `DeleteAccountInputParserTest` | `DeleteAccountDialog.test` (fokus, Esc, napačen vpis) | `moji-podatki.spec` |
| FR-012-08 | `AccountDeletionIT` (osebni podatki, članstva, prejeta povabila; skupina in kontakti nespremenjeni), `DeletedUserLeakSecurityIT` (SC-004) | – | `moji-podatki.spec` |
| FR-012-09 | `AccountDeletionGroupsIT` (arhivirana z drugimi člani → trajno arhivirana; edini član → izbrisana), `AccountDeletionLockingIT` (odarhiviranje med izbrisom) | – | `moji-podatki.spec` |
| FR-012-10 | `AccountDeletionGroupsIT` (edini član trajno arhivirane → izbrisana; eden od več → ostane) | – | – |
| FR-012-11 | `AccountDeletionIT` (poslano povabilo ostane, pošiljatelj izbrisan; sprejem po 006) | – | `moji-podatki.spec` |
| FR-012-12 | `AccountDeletionAuditIT`, `DeletedUserLeakSecurityIT`, `AccountDeletionMigrationIT` (`SET NULL` brez kopije imena; indeksi) | – | `moji-podatki.spec` (sled) |
| FR-012-13 | `AccountDeletionConcurrencyIT` (100 ponovitev, SC-006), `AccountDeletionLockingIT`, `AccountDeletionAtomicityIT` (vsiljena napaka sredi izbrisa: nič se ne spremeni) | `DeleteAccountSection.test` (409 po odprtem dialogu) | – |
| FR-012-14 | `IdentityDeletionIT` (identiteta v emulatorju izbrisana; ponovna prijava = nov UID, prazen račun), `ReRegistrationGuardSecurityIT`, `FirebaseIdentityProviderIT`, `FirebaseIdentityProviderTest` | `AuthProvider.test` (`accountDeleted`), `LoginPage.test` | `moji-podatki.spec` (ponovna prijava) |
| FR-012-15 | `DeletedIdentityTokenSecurityIT` (vsi endpointi 401, `PUT /api/me` 401), `AccountDeletionLockingIT` (dvojni zahtevek, tudi brez skupin: 204 ali 202 + 401) | – | `moji-podatki.spec` (druga naprava) |
| FR-012-16 | `MyDataIsolationMatrixSecurityIT` (`/api/users/{id}/…` in `/api/me/{id}/…` → 404, `DELETE /api/me` → 405; izvoz samo lastni) | – | – |
| FR-012-17 | `AccountDeletionIT` (204; 202 ob `docker pause`; v obeh stanjih brez lokalnih podatkov), `IdentityDeletionIT` (`USER_NOT_FOUND` = uspeh; `401/403` → 202 z `last_error`), `FirebaseIdentityProviderTest` (preslikava 401/403/429/5xx/časovna omejitev) | `DeleteAccountDialog.test` (204 in 202 → `accountDeleted(pending)`), `LoginPage.test` (obe sporočili) | `moji-podatki.spec` (202 prek `page.route`) |
| FR-012-18 | `IdentityDeletionIT` (odmik, zakup, hramba do 2 h, odstranitev po 2 h, nikoli odprtega), `IdentityDeletionRestartIT` (ponovni zagon: dokončanje in čiščenje), `DeletedIdentityTokenSecurityIT`, `ReRegistrationGuardSecurityIT` (tekma prijava/izbris, prijava med čakanjem → 401, po uspehu nov račun), `AccountDeletionMigrationIT`, `IdentityRetryBackoffTest`, `ConfigurationSecurityTest` | – | `moji-podatki.spec` (ponovna prijava) |

Dodatno (R-01, R-06, R-07, R-13, R-16): `IdentityDeletionIT` – izpad Firebase med brisanjem (`docker pause` samo v izoliranem IT, vedno z `unpause` v `finally`), ponovitev nedokončanega brisanja, idempotentnost (`USER_NOT_FOUND` = uspeh), odmik, zakup; `IdentityDeletionRestartIT` –
ponavljanje in čiščenje po ponovnem zagonu aplikacije (drugi kontekst nad isto bazo); `FirebaseIdentityProviderIT` – dejanska izmenjava z emulatorjem (vključno s pastjo napačnega projekta, R-06); `FirebaseIdentityProviderTest` – produkcijski in emulatorski zahtevek ter preslikava napak z lažnim transportom (R-06); `ConfigurationSecurityTest` –
brez skrivnosti v kodi in konfiguraciji (gitleaks v pre-commit je že vrata), zavrnitev `tombstone-retention` < 70 min; `MigrationVersionsUniqueTest` – brez podvojenih različic migracij (R-14). Pristnost produkcijskega OAuth dostopa ni avtomatski test, ampak **ročna vrata pred združitvijo** (quickstart, T-naloga).
Merljiva merila: SC-001 – `MyDataExportIT` (100 članstev + 50 povabil, ≤ 5 s); SC-002 – `MyDataExportIT`, `MyDataIsolationMatrixSecurityIT`; SC-003 – `moji-podatki.spec` (izbris < 1 min);
SC-004 – `DeletedUserLeakSecurityIT`; SC-005 – `AccountDeletionAuditIT`, `AccountDeletionIT`, `moji-podatki.spec`; SC-006 – `AccountDeletionConcurrencyIT`; SC-007 – `DeleteAccountSection.test`, `moji-podatki.spec`; SC-008 – `AccountDeletionIT`, `IdentityDeletionIT`, `IdentityDeletionRestartIT`; SC-009 – `IdentityDeletionIT`, `IdentityDeletionRestartIT`, `DeletedIdentityTokenSecurityIT`.
Regresija 000–008: `./verify.sh full` (obstoječi testi se ne spreminjajo; dotaknjeni so le `ApiTest` – ena lastnost –, `AccountPage.test.tsx`, `AuthProvider.test.tsx`, `LoginPage.test.tsx` – nove `describe` – in `frontend/src/test/msw.ts` – privzeti rokovalnik `GET /api/me/deletion-blockers`, D-76).

## Project Structure

### Documentation (this feature)

```text
specs/012-moji-podatki/
├── spec.md
├── plan.md              # ta datoteka
├── research.md · data-model.md · quickstart.md · contracts/openapi.yaml
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── traceability.md      # po pregledu testov
```

### Source Code (repository root)

```text
backend/src/main/resources/db/migration/V9__moji_podatki.sql        # številka se preveri (R-14)
backend/src/main/java/si/contactmanager/
├── account/
│   ├── MyDataController.java            # NOVO: GET /api/me/export, GET /api/me/deletion-blockers
│   ├── MyDataRepository.java            # NOVO: JdbcClient, posnetek REPEATABLE READ (profil, članstva, povabila, skupine v lasti)
│   ├── MyData.java                      # NOVO: zapisi odgovora (contracts MyData)
│   ├── AccountDeletionController.java   # NOVO: POST /api/me/deletion
│   ├── AccountDeletionService.java      # NOVO: brez transakcije: predpreverjanje e-naslova → LocalAccountDeletion → takojšen IdentityProvider.delete → markDeleted/markFailed (R-01, R-07)
│   ├── LocalAccountDeletion.java        # NOVO: @Transactional execute(user, email): zaklep skupin, ponovno branje, 409, izbris skupin in uporabnika (0 vrstic → 401), nadgrobnik z zakupom (R-04, R-05)
│   ├── AccountDeletionRepository.java   # NOVO: zaklep skupin, stanje, izbris skupin, izbris uporabnika, blockingGroups
│   ├── ExportAssembler.java             # NOVO: čista funkcija vrstice → MyData (unit test); kliče jo MyDataController prek MyDataRepository
│   ├── AccountExceptionHandler.java     # NOVO: @RestControllerAdvice: 409 OWNS_ACTIVE_GROUPS s telesom, 401 (UnauthenticatedException, SQLSTATE CM401); ApiExceptionHandler se ne spreminja (R-14)
│   ├── DeleteAccountInputParser.java    # NOVO: telo { "email" }; napake po poljih (kot 007)
│   ├── DeletedIdentities.java           # NOVO: nadgrobniki: insert (ON CONFLICT DO NOTHING), contains, lease(n) (en UPDATE … SKIP LOCKED … RETURNING), markDeleted, markFailed, purge; vsaka metoda svoja kratka transakcija
│   ├── IdentityProvider.java            # NOVO: vmesnik delete(uid) → izid {DELETED, NOT_FOUND, RETRY, MISCONFIGURED}; DELETED/NOT_FOUND → 204, ostalo → 202
│   ├── FirebaseIdentityProvider.java    # NOVO: REST accounts:delete prek injektiranega HttpClient in AccessTokenSource (R-06)
│   ├── AccessTokenSource.java           # NOVO: vmesnik; EmulatorAccessTokenSource (»owner«) in GoogleAccessTokenSource (OAuth 2.0, ADC) v istem paketu
│   ├── IdentityDeletionProperties.java  # NOVO: identity-deletion.* (interval, lease, timeouti, tombstone-retention ≥ 70 min)
│   ├── IdentityDeletionConfig.java      # NOVO: @EnableScheduling samo ob scheduler-enabled=true
│   ├── IdentityDeletionJob.java         # NOVO: @Scheduled + ApplicationReadyEvent; purge, lease(5), klic zunaj transakcije, markDeleted/markFailed (R-07); runOnce() za teste
│   └── IdentityRetryBackoff.java        # NOVO: čista funkcija odmika (unit test)
├── shared/security/
│   ├── DeletedIdentityJwtDecoder.java   # NOVO: ovije FirebaseJwtDecoder, zavrne UID iz nadgrobnika (R-08)
│   └── SecurityConfig.java              # SPREMEMBA: ovitje dekoderja (3 vrstice)
└── shared/error/{OwnsActiveGroupsException, UnauthenticatedException}.java   # ApiExceptionHandler NI spremenjen (obravnava v account/AccountExceptionHandler)
backend/src/main/resources/application.yaml                          # SPREMEMBA: identity-deletion.* (interval 30 s, request-timeout 5 s, tombstone-retention 2 h – min. 70 min, scheduler-enabled); brez skrivnosti
backend/pom.xml                                                      # SPREMEMBA: google-auth-library-oauth2-http (D-73, potrjeno z D-74)
backend/src/test/java/si/contactmanager/account/
├── {MyDataExportIT, DeletionBlockersIT, AccountDeletionIT, AccountDeletionGroupsIT, AccountDeletionConcurrencyIT, AccountDeletionLockingIT}.java
├── {AccountDeletionAuditIT, AccountDeletionMigrationIT, AccountDeletionAtomicityIT, MyDataExportConcurrencyIT, IdentityDeletionIT, IdentityDeletionRestartIT, FirebaseIdentityProviderIT}.java
├── {MyDataIsolationMatrixSecurityIT, DeletedIdentityTokenSecurityIT, DeletedUserLeakSecurityIT, ReRegistrationGuardSecurityIT}.java
├── {ExportAssemblerTest, DeleteAccountInputParserTest, IdentityRetryBackoffTest, FirebaseIdentityProviderTest, ConfigurationSecurityTest}.java
backend/src/test/java/si/contactmanager/MigrationVersionsUniqueTest.java   # NOVO: unit, brez baze (R-14)
└── support/AccountFixtures.java         # deleteViaApi, tombstone(uid), isIdentityInEmulator, reRegister(sameGoogleId), dumpTextExceptContacts
backend/src/test/java/si/contactmanager/support/{ApiTest, FirebaseEmulatorContainer}.java   # SPREMEMBA: scheduler-enabled=false; `paused(() -> …)` (pause v try/finally, unpause tudi v @AfterEach), lookup, signInWithIdp z istim sub

frontend/src/features/account/
├── api.ts, types.ts                     # NOVO: createMyDataApi: exportData, deletionBlockers, deleteAccount (authFetch); `deleteAccount` loči `204` (undefined) od `202` (telo s kodo) – apiFetch ostane nespremenjen
├── MyDataSection.tsx                    # NOVO
├── DeleteAccountSection.tsx             # NOVO: seznam blokad ali gumb
├── DeleteAccountDialog.tsx              # NOVO: po vzoru DeleteGroupDialog (vpis e-naslova)
├── downloadJson.ts                      # NOVO: Blob + <a download>, ime po lokalnem datumu
├── accountMessages.ts                   # NOVO: koda napake → sporočilo
├── AccountPage.tsx                      # SPREMEMBA: dva razdelka med Videz in Odjavo
└── *.test.tsx (MyDataSection, DeleteAccountSection, DeleteAccountDialog; AccountPage.test – nova describe)
frontend/src/features/auth/{AuthProvider.tsx, authContext.ts, LoginPage.tsx}   # SPREMEMBA: accountDeleted(pending), reason=account-deleted | account-deleted-pending
frontend/src/i18n/{sl,en}.json           # ključi account.data.*, account.delete.*, login.accountDeleted, login.accountDeletedPending (ločen blok)
frontend/src/test/myDataApi.ts           # NOVO: MSW rokovalniki

e2e/tests/moji-podatki.spec.ts, e2e/tests/support/{myData.ts}   # NOVO (pomožni SQL: povabila, arhiviranje, trajno arhivirana skupina; nadgrobniki); napake z `page.route`, brez ustavljanja Compose storitev
```

**Structure Decision**: obstoječa struktura iz 000–008. Funkcionalnost je vezana na uporabnika, ne na skupino, zato koda živi v obstoječem paketu `account` (kjer sta že `MeController`, `UserDirectory`) in
`features/account`, ne v novem paketu. Dostop do skupin za izbris je neposredna poizvedba (kot `InvitationRepository`) in ne prek `GroupAccess` (ta je za skupino vezane endpointe z vlogo). Firebase je za vmesnikom
`IdentityProvider`, da zamenjava izvedbe (R-06) ne zadene ostale kode. Odjemalec izvoza ne spreminja `shared/api` (uporablja `authFetch`).

## Potrjene odločitve (D-74)

| # | Odločitev | Izid |
|---|---|---|
| 1 | **D-73:** REST `accounts:delete` + `google-auth-library-oauth2-http` (samo za produkcijski OAuth 2.0 dostop); brez `firebase-admin`, razen če `FirebaseIdentityProviderIT` pokaže, da REST ni zanesljiv | **potrjeno**; klic je bil pred načrtom preverjen proti emulatorju (R-06, tabela) |
| 2 | **D-72:** `deleted_identity` hrani samo Firebase UID do uspešnega brisanja pri Firebase + 2 uri; preprečuje stare žetone in ponovno ustvarjanje računa; po izteku se dejansko odstrani | **potrjeno**; FR-012-18 |
| 3 | `204` = lokalni račun in identiteta izbrisana; `202 Accepted` (`IDENTITY_DELETION_PENDING`) = lokalni izbris zaključen, identiteta čaka; jasno sporočilo v vmesniku | **potrjeno**; CR-03, FR-012-17, R-16 |

Skrivnosti: poverilnice storitvenega računa samo prek okoljske spremenljivke (`GOOGLE_APPLICATION_CREDENTIALS`), nikoli v kodi, `application.yaml` ali Gitu; ID žeton uporabnika se nikoli ne uporabi kot administrativno pooblastilo.

## Vzporedni razvoj s 009

Podrobnosti: research R-14.

- **Migracija:** `V9__moji_podatki.sql`; številka se preveri ob začetku implementacije in tik pred PR (`ls db/migration` po `git fetch`); ob trku se preštevilči naša. Posamično zeleni veji s trkom se pokažeta šele po združitvi: drugi PR mora imeti posodobljen `main`, `MigrationVersionsUniqueTest`
  v `verify quick` pa trk ujame takoj po rebase. Podatkovnih volumnov se ne briše; preštevilčena migracija se preizkusi na ločenem Compose projektu (`-p contact-manager-012`) ali Testcontainers bazi.
- **`DECISIONS.md`:** D-72 … D-75 in `CR-03`, `CR-04` so zadnji vnosi; ob trku s Patrikovimi se preštevilčijo.
- **Skupne datoteke:** `ApiExceptionHandler` **ne spreminjamo** (naši obravnavi sta v `AccountExceptionHandler`; 009 bo dodal `SELECTION_CHANGED`). Spremenjene: `SecurityConfig` (3 vrstice), `AccountPage.tsx`, `AuthProvider.tsx` + `authContext.ts`, `LoginPage.tsx`,
  `i18n/sl.json` + `en.json` (sklenjen blok), `ApiTest` (ena lastnost). 009 običajno spreminja samo i18n. Datoteke `feature-map.md`, workflow, konstitucija se ne spreminjajo.
- **Zaklepanje:** 009 naj pri množičnih operacijah najprej zaklene skupino, nato piše vrstice s sklicem na uporabnika (D-58 R-01); sicer deluje obramba (zaznava mrtvega objema z enim ponovnim poskusom).
- Patrikove veje 009 ne dotikam; delo je samo na `moji-podatki` (iz `origin/main` `f557382`, 008 je združena).

## Complexity Tracking

| Odstopanje | Zakaj je potrebno | Zavrnjena enostavnejša možnost |
|---|---|---|
| Nova tabela `deleted_identity` + sprožilec; hramba Firebase UID (konstitucija VI) | ID žetona se ne da razveljaviti; FR-012-15 zahteva 401 na vseh napravah, FR-012-14 prepoved ponovne povezave; UID je neprosojen, v bazi že obstaja (`app_user.firebase_uid`), hramba je časovno omejena (do uspeha + 2 uri); potrditev obeh razvijalcev (R-15) | zanašanje na odsotnost vrstice `app_user` (404 namesto 401, `PUT /api/me` bi znova ustvaril račun) |
| Nepaginiran izvoz in seznam blokad (konstitucija V) | izvoz je celovit posnetek v datoteko (FR-012-02), seznam blokad obsega samo lastne nearhivirane skupine in ga mora uporabnik videti v celoti (SC-007) | paginacija izvoza: večkratni klici, nedosleden posnetek |
| Ena nova knjižnica (D-73, potrjena z D-74) | produkcijski OAuth 2.0 žeton za Identity Toolkit | lastna izvedba OAuth2 JWT bearer z `nimbus-jose-jwt` (ročna varnostna koda, brez podpore za metapodatkovni strežnik) |
| Ozadnje opravilo (`@Scheduled`) z zakupom | brisanje identitete ob izpadu Firebase se mora zanesljivo dokončati po zrušitvi, brez zunanjih klicev znotraj transakcije | ročno brisanje (spec zahteva ponavljanje »dokler ne uspe«) |
| Poseben `AccountExceptionHandler` | zmanjša konflikte s Patrikovo 009 (`ApiExceptionHandler`) | razširitev `ApiExceptionHandler` (verjeten trk pri združitvi) |
