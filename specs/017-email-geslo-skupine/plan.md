# Implementation Plan: Prijava z e-pošto in geslom, iskanje skupin, zapustitev skupine za lastnika

**Branch**: `email-geslo-skupine` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-email-geslo-skupine/spec.md`

## Summary

Tvegana funkcionalnost (avtentikacija, §2.1): **plan se pokaže razvijalcu pred `tasks`**.

1. **Zaledje**: en nov filter za vse `/api/**` (razen `/api/health`), ki po preverjenem žetonu zavrne `email_verified != true` s `403 EMAIL_NOT_VERIFIED` (profil se ne ustvari: `PUT /api/me` je tudi za filtrom). `POST /api/me/deletion` dodatno zahteva `auth_time` ≤ 300 s (`403 REAUTHENTICATION_REQUIRED`). Brez migracije, brez novih tabel: `app_user` že ima `UNIQUE(firebase_uid)` in `UNIQUE(lower(email))` (V2) – to je jamstvo proti podvojenim profilom. Gesel zaledje nikoli ne vidi. Edina nova koda poleg teh dveh je `409 ACCOUNT_CONFLICT` pri trku e-naslova med dvema UID (danes neobravnavan `500`).
2. **Frontend (prijava)**: `AuthGateway` dobi registracijo, prijavo z geslom, ponastavitev, pošiljanje in osvežitev potrditve, ponovno avtentikacijo, dodajanje gesla in dodajanje Googla. Nove strani `/register`, `/verify-email`, `/forgot-password`, razširjena `/login`; razdelek *Prijavne metode* v *Mojem računu*; ponovna avtentikacija v dialogu izbrisa računa.
3. **Povezovanje**: izrecno, brez združevanja UID. Pri vključeni zaščiti pred naštevanjem (EEP) je dokumentirani postopek za dodajanje gesla obstoječemu računu REST `accounts:signUp` z `idToken`, `email` in `password` (`accounts:update` in `linkWithCredential` z `EmailAuthCredential` sta ob EEP blokirana); Google računu z geslom se Google doda prek `linkWithPopup`. Po povezovanju gateway isti uporabnik znova prijavi z `signInWithEmailAndPassword` in preveri nespremenjen UID ter `email_verified` (research R-02 … R-04).
4. **Skupine**: obstoječa `GET /api/groups` in `GET /api/groups/archived` dobita neobvezen `q` (arhivirani še `role`); filtriranje po vlogah je v vmesniku (razdelki so že po vlogah). Filter *Stanje* prepleta obstoječa pogleda.
5. **Zapusti skupino**: samo vmesnik (dialog za lastnika); zaledje (`OWNER_CANNOT_LEAVE`) se ne spremeni.

## Technical Context

**Language/Version**: Java 21 (Spring Boot 3.x) · TypeScript (strict) + React

**Primary Dependencies**: brez novih (Firebase JS SDK `firebase/auth` že v uporabi; REST klic z `fetch`)

**Storage**: PostgreSQL; **brez migracije** (izogib trčenju V13 z 016)

**Testing**: JUnit 5, Testcontainers, Firebase Auth Emulator · Vitest, RTL, MSW, vitest-axe · Playwright + axe (360/1280 px)

**Target Platform**: Docker Compose, nginx/Vite posreduje `identitytoolkit.googleapis.com` in `securetoken.googleapis.com` na emulator (obstoječe)

**Project Type**: web application

**Performance Goals**: iskanje skupin p95 < 300 ms pri 100 skupinah uporabnika (SC-005 zahteva < 3 s od vnosa do prikaza)

**Constraints**: WCAG 2.1 AA, sl/en, brez izklopa zaščite pred naštevanjem, brez spremembe UID, brez posega v `features/contacts` in paket `contact` (016)

**Scale/Scope**: do ~100 skupin na uporabnika

## Constitution Check

| Principle (constitution) | How this plan complies |
|---|---|
| I. Specification guides the work | FR-017-01 … 23; naloge navedejo FR-ID. **Konflikt §5** (»samo Google«): spremembo §5 in vrstico 017 v `feature-map.md` predlaga PR, potrdita jo oba razvijalca (§7); do potrditve konstitucija ostane nespremenjena |
| II. Tests are mandatory | enota: filter `email_verified`, `auth_time`, normalizacija iskanja; IT: filter na vseh vrstah klicev, brez profila pred potrditvijo, izbris s starim `auth_time`, iskanje čez strani; FE: obrazci, gateway z lažnim SDK, MSW; E2E: registracija → potrditev (koda iz emulatorja) → vstop; dodajanje gesla Google uporabniku; iskanje; lastnik zapusti |
| III. Group isolation and roles | `q`/`role` ostaneta v obstoječih poizvedbah z `m.user_id`; nova vnosa v matriki izolacije za `GET /api/groups` in `/archived` (401, nečlan ne vidi tuje skupine); `leave` ostane v matriki 007 |
| IV. Accessible, bilingual, responsive UI | design.md 8.1–8.3 (obrazci, napake), 8.11 (dialog), 8.13, 8.15, 9.1, 9.2, 10; napake prek `aria-describedby`, `role=alert`; sl/en |
| V. Data integrity | brez sprememb urejanja; unikatnost UID/e-naslova na bazi ostane; paginacija ostane strežniška |
| VI. Privacy and GDPR | gesla samo v Firebase; hrani se isti nabor podatkov (ime, e-naslov); izbris računa in izvoz (012) nespremenjena |
| VII. One verification path | `quick` med delom; `backend` (filter, IT) in `e2e` (tok prijave) pred PR |

## Public Interfaces *(mandatory)*

### REST endpoints

Endpointov ni novih. Spremembe obstoječih (podrobnosti: [contracts/openapi.yaml](contracts/openapi.yaml)):

| Method | Path | Lowest role | In archived group | Success | FR-ID |
|---|---|---|---|---|---|
| (vsi) | /api/** razen GET /api/health | — | — | 403 `EMAIL_NOT_VERIFIED`, če `email_verified != true` | FR-017-02, -04 |
| GET | /api/groups | — (uporabnik) | n/a (le nearhivirane) | 200; nov neobvezen `q` | FR-017-14, -15, -18 |
| GET | /api/groups/archived | — (uporabnik) | n/a (le arhivirane) | 200; nova neobvezna `q`, `role` (ponovljiv) | FR-017-14, -15, -16, -18 |
| PUT | /api/me | — | — | nov 409 `ACCOUNT_CONFLICT` (e-naslov že pri drugem UID) | FR-017-11 |
| POST | /api/me/deletion | — | — | 204/202; nov 403 `REAUTHENTICATION_REQUIRED`, če `auth_time` > 300 s | FR-017-12 |
| POST | /api/groups/{groupId}/leave *(obstoječ, 007; pot po kodi)* | VIEWER | allowed | 2xx; OWNER 409 `OWNER_CANNOT_LEAVE` – brez spremembe | FR-017-19 |

Klici, ki gredo neposredno na Firebase (ne prek našega API; v testih na emulator): `accounts:signUp` / `signInWithPassword` / `sendOobCode` (VERIFY_EMAIL, PASSWORD_RESET) prek SDK, **`accounts:signUp` z `idToken`** za dodajanje gesla (research R-03).

### Pages and routes

| Page | Route | Lowest role | FR-ID |
|---|---|---|---|
| Prijava (razširjena: geslo, Google, povezave) | /login | public | FR-017-05, -06, -08 |
| Registracija | /register | public | FR-017-01 |
| Pozabljeno geslo | /forgot-password | public | FR-017-07 |
| Potrdite e-naslov | /verify-email | prijavljen, nepotrjen | FR-017-02, -03, -13 |
| Skupine (iskanje, filtri) | / (obstoječ `GroupsPage`; stanje v URL: `q`, `role`, `state`) | — | FR-017-14 … 18 |
| Moj račun – *Prijavne metode* | /account (obstoječ razdelek) | — | FR-017-09, -12 |
| Dialog *Zapusti skupino* | obstoječ v zavihku *Člani* | VIEWER | FR-017-19, -20 |

## Project Structure

### Documentation (this feature)

```text
specs/017-email-geslo-skupine/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/openapi.yaml
└── tasks.md   # /speckit-tasks (po potrditvi plana)
```

### Source Code (repository root)

```text
backend/
├── src/main/java/si/contactmanager/shared/security/   # EmailVerifiedFilter, FreshAuthentication, SecurityConfig
├── src/main/java/si/contactmanager/shared/error/      # EmailNotVerified, ReauthenticationRequired v ApiExceptionHandler
├── src/main/java/si/contactmanager/account/           # AccountDeletionController (auth_time)
├── src/main/java/si/contactmanager/group/             # GroupController/Service/Repository: q, role
└── src/test/java/…/  (security, group, account)

frontend/
├── src/features/auth/        # AuthGateway, firebaseGateway, Login/Register/Verify/Forgot, RequireAuth
├── src/features/account/     # SignInMethodsSection, DeleteAccountDialog (reauth)
├── src/features/groups/      # GroupsPage (iskanje, filtri), api.ts
├── src/features/members/     # LeaveGroupDialog (lastnik); features/groups/GroupManagementSection (gumb tudi za lastnika)
└── src/i18n/{sl,en}.json     # skupna datoteka s 016 – dodajanje samo novih ključev pod `auth.*`, `groups.search.*`, `members.leave.owner.*`

e2e/tests/  # prijava-geslo.spec.ts, skupine-iskanje.spec.ts, support/auth.ts (pomočnik za geslo)
```

**Structure Decision**: spremembe so v obstoječih mapah; nova koda v `features/auth` in `shared/security`. Z 016 ni skupnih datotek razen `sl.json`/`en.json` (ločeni ključi → konflikt zgolj tekstovni).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Konstitucija §5 (samo Google) | funkcionalnost uvaja drugega ponudnika | brez spremembe ni mogoča. **Odobritev 2026-11-16**: razvijalec 017 je razširitev sprejel in blokado odstranil; predlog spremembe §5 (v. 3.3.0) je v istem PR; odstopanje od §7 (Patrikova potrditev ni zabeležena) je zapisano v PR, ki se ne združi samodejno |
