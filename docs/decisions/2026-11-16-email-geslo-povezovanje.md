# Prijava z e-pošto in geslom, potrjen e-naslov in povezovanje z Googlom (017)

- **Datum:** 2026-11-16
- **Avtor:** razvijalec 017 (Clarifications 2026-11-16, odobritev razširitve §5), specs/017-email-geslo-skupine/research.md R-01 … R-05
- **Nadomešča:** –

## Kontekst
Do 017 je bil edini ponudnik prijave Google (konstitucija §5), ki vedno da potrjen e-naslov. Z Email/Password lahko
kdorkoli ustvari račun s tujim e-naslovom; povabila (006) in en profil na e-naslov (`UNIQUE(lower(email))`) pa so vezani
na e-naslov. Projekt ima v Firebase vključeno zaščito pred naštevanjem e-naslovov (EEP), ki blokira
`accounts:update`/`setAccountInfo` in `linkWithCredential` z `EmailAuthCredential` za dodajanje gesla obstoječemu računu.

## Odločitev
- **Potrjen e-naslov na zaledju:** `EmailVerifiedFilter` za `BearerTokenAuthenticationFilter` zavrne vsak veljaven
  žeton brez `email_verified=true` (samo logična vrednost) s `403 EMAIL_NOT_VERIFIED`, pred kontrolerji – tudi
  `PUT /api/me`, zato profil pred potrditvijo ne nastane. Izjema je `GET /api/health`; veriga `/dav/**` (gesla za
  aplikacijo) je ločena in nespremenjena. 403 (ne 401), da odjemalec ne šteje zavrnitve za izgubo seje.
- **Vmesnik po potrditvi:** `user.reload()` → `getIdToken(true)` → izrecno obvestilo poslušalcem, šele nato
  `PUT /api/me` (`onAuthStateChanged` se po `reload()` ne sproži).
- **Dodajanje gesla obstoječemu (Google) računu:** REST `accounts:signUp` z `idToken`, `email` (e-naslov računa, samo
  za branje) in `password` – dokumentirana pot ob vključeni EEP. Pogoj je ponovna avtentikacija (svež `idToken`).
  Gateway primerja `localId` odgovora z UID pred klicem; nato `signInWithEmailAndPassword` z istim geslom (svež žeton
  in stanje SDK), preveri nespremenjen `auth.currentUser.uid` (sicer odjava in napaka), `email_verified` prebere brez
  predpostavke. REST odgovora (`idToken`, `refreshToken`) ne shranjujemo.
- **EEP ostane vključena**, UID se nikoli ne spremeni, samodejnega združevanja računov ni; Google se računu z geslom
  doda z `linkWithPopup`.
- **Sporočila so nevtralna:** neuspešna prijava (`invalid-credential`, `user-not-found`, `wrong-password`) ima eno
  sporočilo; ponastavitev gesla vedno isto potrdilo; registracija z obstoječim e-naslovom ne razkrije ponudnika.
- Geslo najmanj 8 znakov: vmesnik in Firebase *password policy* (nastavi razvijalec v Console).

## Posledice
Gesla so samo v Firebase, zaledje jih nikoli ne vidi; podatkovni model in migracije so nespremenjeni. Auth Emulator
EEP ne posnema, zato testi dokazujejo potrditev, UID in sinhronizacijo, zavrnitev `accounts:update` ob EEP pa le ročni
preizkus v ločenem testnem projektu (quickstart.md). Zavrnjeno: `accounts:update`/`linkWithCredential` (blokirano ob
EEP), izklop EEP, preverjanje potrditve v validatorju JWT (bi dalo 401) ali v vsakem kontrolerju (pozabljivo), lasten
endpoint za gesla.
