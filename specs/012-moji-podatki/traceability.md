# Sledljivost: 012-moji-podatki

Stanje po fazi *Testi* (test-first, workflow §4.2; pregled: ROČNO ODOBRENO – izjema D-76): testi so napisani in **pričakovano rdeči** (manjka poslovna implementacija US1–US3); ogrodje vrača `501` / `not implemented`. Stanje se po implementaciji posodobi v `zelen`.

Pot do testov: BE `backend/src/test/java/si/contactmanager/account/…` (`*Test` unit, `*IT` integracijski, `*SecurityIT` varnostni), FE `frontend/src/features/{account,auth}/…`, E2E `e2e/tests/moji-podatki.spec.ts`.

| FR-ID | Scenarij | Testi (datoteka › vsebina) | Stanje |
|---|---|---|---|
| FR-012-01 | razdelek *Moji podatki*, gumb za prenos | `MyDataSection.test` › region in gumb (sl/en); `AccountPage.test` › vrstni red razdelkov; `moji-podatki.spec` › izvoz | rdeč (pričakovano) |
| FR-012-02 | izvoz vsebuje članstva, povabila, osebne podatke, skupine v lasti | `MyDataExportIT`, `ExportAssemblerTest`, `MyDataExportConcurrencyIT`, `MyDataIsolationMatrixSecurityIT`; `MyDataSection.test` (ime datoteke po lokalnem datumu); `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-03 | izvoz brez kontaktov, sledi, tujih podatkov (izjemi: ime pošiljatelja, e-naslov povabljenega) | `MyDataExportIT` (kanarčki, bela lista), `MyDataIsolationMatrixSecurityIT`, `ExportAssemblerTest`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-04 | napaka izvoza: alert in *Poskusi znova* | `MyDataSection.test` (MSW 500, brez povezave); `moji-podatki.spec` (`page.route` abort) | rdeč (pričakovano) |
| FR-012-05 | razdelek *Izbris računa* z razlago | `DeleteAccountSection.test`; `AccountPage.test`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-06 | blokada izbrisa lastnika aktivne skupine, seznam skupin | `DeletionBlockersIT`, `AccountDeletionLockingIT`, `AccountDeletionConcurrencyIT`; `DeleteAccountSection.test`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-07 | potrditev z vpisom e-naslova, 400 | `DeleteAccountInputParserTest`, `AccountDeletionIT`; `DeleteAccountDialog.test`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-08 | izbris osebnih podatkov, članstev, prejetih povabil | `AccountDeletionIT`, `DeletedUserLeakSecurityIT`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-09 | arhivirana skupina v lasti: trajno arhivirana oziroma izbrisana | `AccountDeletionGroupsIT`, `AccountDeletionLockingIT`, `AccountDeletionConcurrencyIT`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-10 | trajno arhivirana skupina, edini član: izbrisana | `AccountDeletionGroupsIT` | rdeč (pričakovano) |
| FR-012-11 | poslana povabila ostanejo, pošiljatelj izbrisan | `AccountDeletionIT`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-12 | »izbrisan uporabnik« povsod, brez imena in e-naslova | `AccountDeletionAuditIT`, `DeletedUserLeakSecurityIT`, `AccountDeletionMigrationIT`; `moji-podatki.spec` | rdeč (pričakovano); migracijski del zelen |
| FR-012-13 | atomarnost, preverjanje pod zaklepom, sočasnost | `AccountDeletionAtomicityIT`, `AccountDeletionLockingIT`, `AccountDeletionConcurrencyIT`; `DeleteAccountSection.test`, `DeleteAccountDialog.test` (409) | rdeč (pričakovano) |
| FR-012-14 | identiteta pri Firebase izbrisana, odjava, ponovna prijava = nov račun | `IdentityDeletionIT`, `FirebaseIdentityProviderIT`, `FirebaseIdentityProviderTest`, `ReRegistrationGuardSecurityIT`; `AuthProvider.test`, `LoginPage.test`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-15 | stari žetoni izbrisanega uporabnika: 401 | `DeletedIdentityTokenSecurityIT`, `AccountDeletionLockingIT` (dvojni zahtevek), `MyDataExportConcurrencyIT`; `moji-podatki.spec` | rdeč (pričakovano) |
| FR-012-16 | brez operacij nad tujim računom (404/405 po poti) | `MyDataIsolationMatrixSecurityIT` | rdeč (pričakovano); poti brez identifikatorja so zelene (varovalo) |
| FR-012-17 | `204` / `202 IDENTITY_DELETION_PENDING`, sporočilo v vmesniku | `AccountDeletionIT`, `IdentityDeletionIT`, `FirebaseIdentityProviderTest`; `DeleteAccountDialog.test`, `LoginPage.test`, `AuthProvider.test`; `moji-podatki.spec` (202 prek `page.route`) | rdeč (pričakovano) |
| FR-012-18 | nadgrobnik: zakup, ponavljanje, čiščenje, ponovni zagon | `IdentityDeletionIT`, `IdentityDeletionRestartIT`, `IdentityRetryBackoffTest`, `ConfigurationSecurityTest`, `AccountDeletionMigrationIT`, `DeletedIdentityTokenSecurityIT`, `ReRegistrationGuardSecurityIT` | rdeč (pričakovano); migracija in varovala zeleni |

| SC | Merilo | Testi | Stanje |
|---|---|---|---|
| SC-001 | izvoz 100 članstev + 50 povabil ≤ 5 s | `MyDataExportIT` | rdeč (pričakovano) |
| SC-002 | izvoz vsebuje vse svoje podatke in nobenih tujih | `MyDataExportIT`, `MyDataIsolationMatrixSecurityIT` | rdeč (pričakovano) |
| SC-003 | izbris < 1 min | `moji-podatki.spec` | rdeč (pričakovano) |
| SC-004 | ime in e-naslov izbrisanega nista nikjer | `DeletedUserLeakSecurityIT` | rdeč (pričakovano) |
| SC-005 | povsod »izbrisan uporabnik« | `AccountDeletionAuditIT`, `AccountDeletionGroupsIT`, `AccountDeletionIT`, `moji-podatki.spec` | rdeč (pričakovano) |
| SC-006 | 100 sočasnih ponovitev brez skupine brez lastnika | `AccountDeletionConcurrencyIT` | rdeč (pričakovano) |
| SC-007 | blokirna skupina v enem kliku | `DeleteAccountSection.test`, `moji-podatki.spec` | rdeč (pričakovano) |
| SC-008 | `204`/`202` in dokončanje brisanja tudi po zagonu | `AccountDeletionIT`, `IdentityDeletionIT`, `IdentityDeletionRestartIT` | rdeč (pričakovano) |
| SC-009 | nadgrobnik odstranjen po 2 h, do takrat stari žetoni zavrnjeni | `IdentityDeletionIT`, `IdentityDeletionRestartIT`, `DeletedIdentityTokenSecurityIT` | rdeč (pričakovano) |

## Pregled testov

**Izid: ROČNO ODOBRENO – izjema D-76.** Podagent `pregled-testov` je v vseh štirih krogih vrnil **ZAVRNJENO**; SPREJETO ni bilo vrnjeno. Razvijalec (Ismar) je po prikazu popravkov faze Testi ročno odobril zaključek test-first faze (izjema po D-76: četrti krog in ročni zaključek brez petega kroga). Splošno pravilo workflow §4.2 (največ 3 krogi) se ne spreminja. Soglasje drugega razvijalca (Patrik) ni pogoj, vendar ga prosimo za izrecno potrditev izjeme v pregledu PR.

| Krog | Izid | Glavne ugotovitve | Odprava |
|---|---|---|---|
| 1 | ZAVRNJENO | manjkal neposreden test `409 OWNS_ACTIVE_GROUPS` in robni primer lastnika aktivne + arhivirane skupine; povabila (sprejem v arhivirano skupino, povabilo v trajno arhivirano, povabila izbrisane skupine); trivialna asercija v `DeletedUserLeakSecurityIT` | dodani testi v `AccountDeletionIT`, `AccountDeletionGroupsIT`; popravljen `DeletedUserLeakSecurityIT`; stabilnost `IdentityDeletionIT`; `?userId=` v matriki izolacije |
| 2 | ZAVRNJENO | 4 napake v samih testih (število članstev, klic na izbrisano vrstico, število članov, status `unarchive`); šibke asercije (datumi proti bazi, polja povabil, `audit_change`, `next_attempt_at` v 202, test vrstnega reda zaklepov brez možnosti mrtvega objema) | vse popravljeno; zaklepni test zdaj z imetnikom nižje skupine |
| 3 | ZAVRNJENO | `getByText`/`queryByText` v FE testih (workflow §2.6); manjkajoč API test »identiteta že izbrisana pri ponudniku → 204«; naraščanje odmika samo na ravni čiste funkcije; trdnejše asercije za trajno arhivirano skupino; asercija o nadgrobniku vedno resnična | BE popravljeno; FE `getByText` zamenjan z `toHaveTextContent`/`getByRole`, E2E `row.filter({ hasText })` z `getByRole('row', { name })` (D-76) |
| 4 (izjema D-76) | ZAVRNJENO | edina ugotovitev: ni testa za `MISCONFIGURED` (401/403 poverilnic) → `202`, nadgrobnik odprt z `last_error`; priporočila (izolacija nadgrobnikov, močnejša asercija, razlaga odmika) | nov test v `IdentityDeletionIT` (neveljaven vir žetona `"nonsense"`, resnični 401 emulatorja, `202`, `attempts` 1 → 2, odmik 60 s, `last_error = HTTP_401` brez osebnih podatkov, okrevanje po popravku poverilnic) in `DeletedUserLeakSecurityIT` (dnevnik brez osebnih podatkov in žetonov); `@BeforeEach` čiščenje odprtih nadgrobnikov; `isNotEmpty()`; pojasnilo odmika v `data-model.md` in T015 |
| ročno | ODOBRENO | pregled diffa popravka (nov `SwitchableAccessTokens`, testi, dokumentacija) | – |

### Odprava pripomb 4. kroga

| Pripomba | Odprava |
|---|---|
| `MISCONFIGURED → 202` brez testa | `IdentityDeletionIT.rejectedCredentialsGive202…`, `DeletedUserLeakSecurityIT.rejectedCredentialsPath…`; vir žetona preklopljiv prek `SwitchableAccessTokens` (`@TestConfiguration`, zahtevek odide pravemu emulatorju, ki zavrne `Bearer nonsense` z 401) |
| tuji odprti nadgrobniki zasedejo paket opravila | `@BeforeEach` v `IdentityDeletionIT`, `DeletedUserLeakSecurityIT`, `ReRegistrationGuardSecurityIT` |
| `containsOnlyNulls()` pri praznem seznamu | `isNotEmpty()` |
| odmik iz `attempts` ni razložen | `data-model.md`, T015: `attempts` je vrednost pred povečanjem (0 → 30 s, 1 → 60 s, 5 → 960 s) |

### Privzeti MSW rokovalnik (D-76)

`frontend/src/test/msw.ts` dobi privzet odgovor `GET /api/me/deletion-blockers` → `{ "groups": [] }`. Razlog: po implementaciji *Moj račun* ob vsakem izrisu naloži blokade izbrisa; brez privzetega odgovora bi obstoječi testi te strani (`AccountPage.test.tsx`, 001) padli z `onUnhandledFrame: 'error'`. Sprememba je samo dodatek (kot privzeti odgovori za 002, 004, 006, 007); noben obstoječi test ni spremenjen in vsak test ga lahko preglasi.

### Čiščenje testnih nadgrobnikov in sočasni testi

Trije testi (`IdentityDeletionIT`, `DeletedUserLeakSecurityIT`, `ReRegistrationGuardSecurityIT`) pred vsakim testom izbrišejo **samo odprte vrstice `deleted_identity`** (`provider_deleted_at IS NULL`). Preverjeno: (1) tabelo `deleted_identity` uporablja samo funkcionalnost 012, zato podatkov 000–008 ne zadene; (2) failsafe in JUnit nimata nastavljene vzporednosti (`forkCount`, `parallel`), razredi tečejo zaporedoma v enem JVM z enim Postgres vsebnikom, torej ni sočasnega testa, ki bi mu vrstica izginila med izvajanjem; (3) `IdentityDeletionRestartIT` ima lasten kontekst, a teče zaporedoma in sam ustvari vrstice, ki jih preveri; (4) po testu se odprte vrstice ne ohranjajo kot predpogoj nobenemu drugemu testu.

### Varovala, ki prestanejo že z ogrodjem (brez poslovne implementacije)

`MigrationVersionsUniqueTest`; `AccountDeletionMigrationIT` (3 testi); `ReRegistrationGuardSecurityIT.directInsert…`; `ConfigurationSecurityTest` (`noSecrets…`, `retentionOf70And2h…`); `MyDataIsolationMatrixSecurityIT` (13 od 16: 401 pri vseh treh endpointih × 4 vrste žetona, poti 404/405); `AccountPage.test.tsx` (vrstni red razdelkov, obstoječi razdelki); `LoginPage.test.tsx` (brez razloga statusa ni, 2 testa).

## Odprta obvezna preverjanja

- **T074 – ročna vrata pred združitvijo:** pristnost produkcijskega OAuth 2.0 dostopa (quickstart.md, *Produkcija*). Emulator in unit test z lažnim transportom tega ne dokazujeta. **Ostaja odprto.**
- Soglasje Patrika za izjemo D-76 (četrti krog in ročni zaključek) in za D-72 (hramba UID) se zahteva v pregledu PR.
- T073 – ponovna uskladitev s 009 (migracija, `D-NN`, `CR-NN`) tik pred PR.
