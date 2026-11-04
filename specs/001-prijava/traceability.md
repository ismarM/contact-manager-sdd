# Traceability: Prijava, ogrodje aplikacije in Moj račun (001)

Stanje se posodobi pred sprejemom (workflow.md §4.4). *zelen* = test prestane lokalno (BE `mvnw clean verify`, FE Vitest, E2E Playwright proti Docker Compose pri 360/768/1280 px); CI požene `./verify.sh full`.

| FR-ID | Scenarij | Testi (datoteka › test) | Stanje |
|---|---|---|---|
| FR-001-01 | kartica z edinim gumbom »Prijava z Googlom« | LoginPage.test.tsx › FR-001-01 (×2); prijava.spec.ts › FR-001-01 … | zelen |
| FR-001-02 | prva prijava ustvari profil | ProfileIT › firstSignInCreatesExactlyOneProfileFromGoogleAccount, accountWithoutNameHasNullName; LoginPage.test.tsx › FR-001-02; prijava.spec.ts › FR-001-01 FR-001-02 FR-001-14 | zelen |
| FR-001-03 | posodobitev imena/e-naslova; en profil ob sočasnih prijavah | ProfileIT › laterSignInUpdatesTheSameProfile, changedNameAndEmailInGoogleAreTakenOverOnNextSignIn, concurrentFirstSignInsCreateExactlyOneProfile; AuthProvider.test.tsx › FR-001-03 | zelen |
| FR-001-04 | napaka prijave v kartici, ponoven poskus | LoginPage.test.tsx › FR-001-04 (×5); signInErrorCode.test.ts › FR-001-04; prijava.spec.ts › FR-001-04 | zelen |
| FR-001-05 | prijavljen na /login → začetna stran ali `next` | LoginPage.test.tsx › FR-001-05 (×2) | zelen |
| FR-001-06 | zaščitene poti, vrnitev na pot s parametri, tuj izvor | safeNextPath.test.ts; routes.test.tsx › FR-001-06 (×4); prijava.spec.ts › FR-001-06 (×2) | zelen |
| FR-001-07 | 401 za neveljavne žetone; uporabnik samo iz žetona | FirebaseJwtDecoderTest (Production, Emulator); AuthenticationSecurityIT; ProfileIT › userIsTakenOnlyFromTokenNeverFromBody; FirebaseEmulatorIT; authFetch.test.ts › FR-001-07 | zelen |
| FR-001-08 | branje samo lastnega profila | ProfileIT › firstSignInCreatesExactlyOneProfileFromGoogleAccount, userIsTakenOnlyFromTokenNeverFromBody; AuthenticationSecurityIT | zelen |
| FR-001-09 | odjava; *Nazaj* in prej obiskana pot | routes.test.tsx › FR-001-09; AccountPage.test.tsx › FR-001-09; prijava.spec.ts › FR-001-09 | zelen |
| FR-001-10 | potek seje, 401, odjava v drugem zavihku | authFetch.test.ts › FR-001-10 (×3); routes.test.tsx › FR-001-10 (×4); prijava.spec.ts › FR-001-10 | zelen |
| FR-001-11 [CR-01] | ogrodje, *Preskoči na vsebino*, gumb menija z ikono | AppShell.test.tsx › FR-001-11 (×4; D-24); prijava.spec.ts › FR-001-11 FR-001-12, FR-001-11 (320 px) | zelen |
| FR-001-12 | meni računa, tipkovnica, klik drugam, jezik | AppShell.test.tsx › FR-001-12 (×5); prijava.spec.ts › FR-001-11 FR-001-12 | zelen |
| FR-001-13 | »Te strani ni«; komponenta za druge funkcionalnosti | NotFoundPage.test.tsx › FR-001-13 (×4); routes.test.tsx › FR-001-06 (neobstoječa pot); prijava.spec.ts › FR-001-13 FR-001-18 | zelen |
| FR-001-14 | Profil samo za branje | AccountPage.test.tsx › FR-001-14 (×4); prijava.spec.ts › FR-001-01 FR-001-02 FR-001-14 | zelen |
| FR-001-15 | jezik v Mojem računu in na prijavi | preferences.test.ts › FR-001-15; LoginPage.test.tsx › FR-001-15; AccountPage.test.tsx › FR-001-15; PreferencesIT › savesLanguageAndTheme, invalidPreferences…; prijava.spec.ts › FR-001-15 (×2) | zelen |
| FR-001-16 | jezik brskalnika brez shranjene izbire | preferences.test.ts › FR-001-16 (×6); ogrodje.spec.ts (000) › FR-000-14 | zelen |
| FR-001-17 | tema, brez bliska, Sistemska izbriše | preferences.test.ts › FR-001-17; AccountPage.test.tsx › FR-001-17; PreferencesIT › nullClearsTheChoice; prijava.spec.ts › FR-001-15 FR-001-17 FR-001-19 | zelen |
| FR-001-18 | edinstveni naslovi sl/en | LoginPage.test.tsx › FR-001-18; AccountPage.test.tsx › FR-001-18; NotFoundPage.test.tsx › FR-001-18; prijava.spec.ts › FR-001-18 SC-006 (×4) | zelen |
| FR-001-19 | izbira v profilu, prednost profila, druga naprava, neuspelo shranjevanje | PreferencesIT (×7); AuthenticationSecurityIT; AuthProvider.test.tsx › FR-001-19 (×2); AccountPage.test.tsx › FR-001-19 (×2); AppShell.test.tsx › FR-001-19 (×2); authFetch.test.ts › FR-001-19; prijava.spec.ts › FR-001-15 FR-001-17 FR-001-19 | zelen |

## Pregled testov

Neodvisen podagent `pregled-testov` (`.claude/agents/pregled-testov.md`), vsak krog nov primerek, dobil je samo mapo
`specs/001-prijava/` in seznam testnih datotek. Ker vrsta agenta v seji ni bila naložena, je bil zagnan splošni agent z
navodilom, naj prebere in natančno sledi `.claude/agents/pregled-testov.md`.

| Krog | Izid | Ugotovitve | Odprava |
|---|---|---|---|
| 1 | ZAVRNJENO | (1) *Nazaj* po odjavi v FE testu vedno resničen (zgodovina brez zaščitenega vnosa); (2) isto v E2E, prej obiskana zaščitena pot ni preverjena; (3) »klik drugam« zapre meni ni preverjen; (4) puščice v meniju preverjajo le izgubo fokusa; (5) prva interakcija po odjavi v drugem zavihku ne preveri `next` in vrnitve | zgodovina z navigacijo v aplikaciji (`/` → `/account`), čakanje na `next=/`, odprtje `/account` po odjavi (FE, E2E); test klika drugam (FE, E2E); fokus na `Slovenščina`/`English`/`Odjava` in nazaj; `next` in vrnitev. Priporočila: test nepodaljšljivega žetona v `routes.test.tsx`, preverjanje priprave v `PreferencesIT`, axe za *Te strani ni* v ogrodju, preverjanje `data-theme` ob `domcontentloaded` |
| 2 | ZAVRNJENO | (1) neuspelo shranjevanje izbire ne preveri, da ni ponovnega poskusa, in ne pokrije primera brez povezave; (2) `authFetch` ne preveri, da omrežna napaka ne pomeni izgube seje; (3) preslikava dejanskih napak Firebase v sporočila ni preverjena | MSW `network-error`, natanko en `PUT /api/me/preferences`, uporabnik ostane na strani (FE ×2); test omrežne napake v `authFetch`; ločen modul `signInErrorCode.ts` z unit testom in E2E zaprtega okna emulatorja. Priporočila: brez `PUT /api/me` ob neuspeli prijavi, prijavljen na `/login?next=/account`, edini gumb za prijavo, status druge naprave, `400` za `PUT /api/me` z neveljavno vrednostjo, brez sporočila ob lokalni odjavi |
| 3 | **SPREJETO** | ni | – |

**Priporočila kroga 3 (niso pogoj; testi po pregledu se spreminjajo samo z vnosom v DECISIONS.md):** primera `iat` v
prihodnosti in prazen `sub` tudi v načinu emulatorja (`FirebaseJwtDecoderTest`); E2E prijave in odjave samo s
tipkovnico (SC-006 – ostane ročni preizkus razvijalcev, quickstart #10); E2E dejanja v drugem zavihku pred sinhronizacijo
SDK (pokrito v FE); manj krhka primerjava gumbov na prijavi; velikost začetnice; `reason=session-expired` tudi pri `401`
in axe za obvestilo o poteku seje; čakanje 300 ms pri preverjanju »brez ponovnega poskusa«; vrsta napake pri omrežni
napaki v `authFetch`; testi 000 `ogrodje.spec.ts` po 001 tečejo na strani za prijavo (naslov »Kontakti« je v kartici);
brisanje ključa ob `null` iz profila v `AuthProvider.test.tsx`.

Commit s testi: `test(001)` (glej `git log`).

## Spremembe po pregledu testov

- **[CR-01] / D-23, D-24:** gumb menija računa z ikono namesto začetnic (WCAG 2.5.3). Spremenjena testa v
  `AppShell.test.tsx` (gumb brez vidnega besedila; račun brez imena → e-naslov na vrhu menija).

## Preverjanje

- Lokalno (Windows): BE `mvnw clean verify` zelen (unit, integracijski, varnostni); FE 111/111; E2E 99/99 (000 + 001).
- `./verify.sh quick` lokalno pade samo v koraku `orodja` (samotest 000 ustvarja simbolne povezave, Windows brez
  *Developer Mode* vrne `EPERM`) – ni povezano z 001; merodajen je CI (Linux).
