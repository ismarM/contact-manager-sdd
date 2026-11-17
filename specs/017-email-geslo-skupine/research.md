# Research – 017

## R-01 Potrditev e-naslova na zaledju
- **Decision**: `OncePerRequestFilter` za `BearerTokenAuthenticationFilter` v `SecurityConfig`: če je `Authentication` s `Jwt` in `email_verified` ni `true` → `403 {code: EMAIL_NOT_VERIFIED}` (ne 401, da `AuthProvider` ne šteje za izgubo seje). Izjema: `GET /api/health`. `/dav/**` (014) ima svoj `DavSecurityConfig` in ga ne zadeva.
- **Rationale**: ena točka za vse poti; `PUT /api/me` je tudi za njo, torej profil ne nastane pred potrditvijo. Google žetoni imajo `email_verified=true`; emulator Googla enako (`FirebaseEmulatorContainer`, vrstica `email_verified=true`), zato obstoječi testi ostanejo zeleni.
- **Alternatives**: validator JWT (daje 401); preverjanje v vsakem kontrolerju (pozabljivo).

## R-02 Zaščita pred naštevanjem e-naslovov (EEP) – uradno ([Identity Platform](https://docs.cloud.google.com/identity-platform/docs/admin/email-enumeration-protection))
- Z EEP: seznam načinov prijave po e-naslovu se ne vrača (`fetchSignInMethodsForEmail`/`createAuthUri`); neuspešna prijava vrne `INVALID_LOGIN_CREDENTIALS`; ponastavitev gesla pošlje sporočilo samo, če račun obstaja, brez razlikovalne napake; neveljavna registracija še vedno vrne `EMAIL_EXISTS` (sprejeto, sporočilo ostane nevtralno; dokument priporoča registracijo samo s potrditvenim tokom – imamo ga, FR-017-02).
- **Povezovanje gesla (EEP vključen)**: `setAccountInfo`/`accounts:update` ne sme več dodati ponudnika Email/Password obstoječemu računu, `linkWithCredential` z `EmailAuthCredential` je blokiran. Dokumentirana zamenjava: REST **`accounts:signUp` z `idToken`, `email` in `password`**.
- **Sprememba e-naslova** z `update`/`updateEmail` je blokirana; dovoljen je `verifyBeforeUpdateEmail`. Sprememba e-naslova ni del 017: obrazec za geslo uporabi **e-naslov računa kot samo za branje** (Firebase ne sme dobiti drugega e-naslova), zato povezovanje ne spremeni e-naslova.
- Dokument ne omenja `emailVerified`; zato po povezovanju vedenje preverimo (R-04) in se nanj ne zanašamo.

## R-03 Dodajanje gesla obstoječemu računu (popravljeno po uradni dokumentaciji EEP)
- **Razlika med načinoma**: (a) brez EEP – *Link with email/password* v REST referenci: `accounts:update` z `idToken`, `email`, `password`; (b) **z EEP (naš primer, EEP ostane vključen)** – `accounts:signUp` z `idToken`, `email`, `password`. Referenčni REST dokument `signUp` brez `idToken` ustvari novega uporabnika; z `idToken` (po dokumentu EEP) poveže ponudnika z uporabnikovim računom. Prvotni plan (`accounts:update`) je bil napačen za ta projekt in je odstranjen.
- **Klic**: `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=API_KEY`, telo `{idToken, email, password, returnSecureToken: true}`; `idToken` je svež (ponovna avtentikacija, R-05), `email` je e-naslov računa (samo za branje). Emulator: prek `window.location.origin` (nginx/Vite že posreduje).
- **Isti UID**: gateway pred klicem zapomni `uid`; po klicu primerja `localId` odgovora z `uid` in po sinhronizaciji (R-04) še `auth.currentUser.uid`. Ob neujemanju: odjava, napaka brez nadaljevanja (UID se nikoli ne spremeni, noben profil ne nastane).
- **`email_verified`**: ne predpostavljamo. Po povezovanju gateway prebere stanje (`emailVerified` na osveženem uporabniku in v novem ID žetonu). Google uporabnik ima potrjen e-naslov in pričakujemo, da ostane `true`; če je `false`, ga vmesnik vodi na zaslon *Potrdite e-naslov* (pošlje potrditveno sporočilo), zaledje pa ga do potrditve zavrača (R-01). Ponovnega preverjanja nikoli ne preskočimo.
- **Dodajanje Googla računu z geslom**: `linkWithPopup(user, GoogleAuthProvider)` (OAuth poverilnice EEP ne omejuje). Če je poverilnica že pri drugem računu: `auth/credential-already-in-use` → jasno sporočilo, brez združevanja.
- **Alternatives**: `accounts:update`/`linkWithCredential(EmailAuthProvider…)` – pri EEP blokirano; izklop EEP – prepovedano; lasten endpoint za geslo – gesla ne gredo prek našega zaledja.
- **Testi (R-03a)**: (1) FE enota: lažni `fetch` in lažni SDK – klic `accounts:signUp` ima `idToken`, `email`, `password`, ne `accounts:update`; neujemanje UID → odjava; (2) zaledni IT z emulatorjem (`FirebaseEmulatorContainer`): uporabnik prek prijave Google (UID U) → `signUp` z `idToken` → `signInWithPassword` vrne isti `localId` U, `PUT /api/me` vrne isti profil in članstva, brez drugega vrstice `app_user`; (3) E2E: Google uporabnik doda geslo v *Mojem računu*, se odjavi in vstopi z geslom – iste skupine. **Omejitev**: Auth Emulator EEP ne posnema; zato testi dokazujejo UID in sinhronizacijo, ne zavrnitve `accounts:update` ob EEP. **Varen integracijski preizkus** (ročen, ne v CI, brez skrivnosti v Gitu): ločen Firebase testni projekt z vključeno EEP in testnim računom Google; ključ API in e-naslov iz lokalnih okoljskih spremenljivk; postopek v `quickstart.md`. Avtomatiziran test proti pravemu Firebaseu ni dovoljen (konstitucija §1 II, §3.2).

## R-04 Osvežitev po potrditvi in po povezovanju (SDK in žetoni)
- **Potrditev e-naslova**: po `sendEmailVerification` in kliku povezave (v emulatorju koda OOB prek `/emulator/v1/projects/{p}/oobCodes`) *Potrdil sem* naredi `user.reload()` → `emailVerified`; če `true`: `getIdToken(true)`, šele nato `PUT /api/me`. `AuthUser` dobi `emailVerified`. `onAuthStateChanged` se po `reload()` ne sproži, zato gateway po osvežitvi izrecno obvesti poslušalce.
- **Po REST povezovanju**: JS SDK nima javnega vmesnika za uvoz žetonov iz REST odgovora, žeton SDK pa je pred povezovanjem nastal brez ponudnika `password`. Odločitev: po uspešnem `signUp` gateway pokliče **`signInWithEmailAndPassword(auth, email, password)`** z geslom, ki ga je uporabnik pravkar vpisal (v pomnilniku, takoj pozabljeno): isti UID, svež ID žeton in `auth_time`, `providerData` vsebuje `password` in `google.com`, `onAuthStateChanged` se sproži. Rezervna pot, če prijava ne uspe: `user.reload()` + `getIdToken(true)`; če tudi to ne uspe, odjava s sporočilom »Prijavite se z novim geslom«. REST odgovorovega `idToken`/`refreshToken` ne shranjujemo.
- Preverba v izvedbi: `auth.currentUser.uid` pred in po je enak; `getIdToken()` po povezovanju vsebuje `email_verified` in `firebase.identities.password`.

## R-05 Ponovna avtentikacija in `auth_time`
- Žeton Firebase vsebuje `auth_time` (čas zadnje prijave z geslom/Googlom; ne osveži se z obnovo žetona). Zaledje za `POST /api/me/deletion` zahteva `now − auth_time ≤ 300 s` → sicer `403 REAUTHENTICATION_REQUIRED`. Vmesnik pred izbrisom pokliče ponovno avtentikacijo (geslo ali Google popup), nato `getIdToken(true)`.
- Preveriti v emulatorju, da žeton nosi `auth_time` (če ne: test s podpisanim claimom; vedenje produkcije je dokumentirano).
- Dodajanje metode: preveri Firebase (R-03), zaledje ni vpleteno.

## R-06 Geslo ≥ 8 znakov
- REST dokument navaja minimum 6 (WEAK_PASSWORD). Zahteva 8: pravilo v vmesniku (obrazec) **in** Firebase *password policy* (Console → Authentication → Settings; min. dolžina 8) – razvijalec jo uredi v Console (ročni predpogoj, zapisan v quickstartu); test pokrije vmesnik, emulator pravila lahko ne uveljavlja.

## R-07 Iskanje skupin
- Strežniško: `AND <norm>(g.title) LIKE :q ESCAPE '\'` v obstoječih poizvedbah (`pageByRole`, `countByRole`, `pageArchived`, `countArchived`); `q` obrezan, ≤ 100 znakov (sicer `400 INVALID_VALUE`), `%`, `_`, `\` ubežani. Brez razlike velikosti črk in diakritik: `<norm>` = `translate(lower(x), 'čćšžđáàâäãåéèêëíìîïóòôöõúùûüñç', 'ccszdaaaaaaeeeeiiiiooooouuuunc')` na stolpcu, enako preslikavo naredi Java na `q` (brez razširitve `unaccent` in brez migracije).
- Skupine, ki še niso naložene, najde, ker poizvedba filtrira v bazi pred `LIMIT/OFFSET`; število v naslovu razdelka je število zadetkov.
- Vloge: razdelki so že po vlogah; vmesnik prikaže samo izbrane. Pri `/archived` je `role` ponovljiv parameter (seznam je ploski).
- Stanje (`q`, `role`, `state=archived`) je v URL (`useSearchParams`), kot pri 008.
- **Alternatives**: odjemalčevo filtriranje (ne najde nenaloženih); nov endpoint za iskanje (prepovedano z naročilom).

## R-08 Zapusti skupino za lastnika
- Stanje: `GroupManagementSection` (`canLeave = !isOwner && …`) lastniku gumba ne izriše, kaže le besedilo `members.leave.ownerInfo`; zaledje zavrne z `409 OWNER_CANNOT_LEAVE` (`MemberService.leave`) in to ostane.
- Odločitev: gumb *Zapusti skupino* se izriše tudi lastniku. `LeaveGroupDialog` za lastnika prikaže pojasnilo, da je treba najprej prenesti lastništvo, in akcijo *Prenesi lastništvo* (obstoječi `TransferOwnershipDialog`; kjer prenos ni možen, ker je lastnik edini član ali je skupina arhivirana, samo pojasnilo); za edinega člana (lastnik) povezavo do obstoječega *Izbriši skupino* (ne izvede brisanja). Potrditvenega gumba za zapustitev lastnik ne dobi. Ne-lastniki: nespremenjeno.

## R-09 Združljivost z 016
- 016 posega v `features/contacts`, paket `contact`, verjetno migracijo V13. 017: brez migracije; i18n ključi z lastnimi predponami; `feature-map.md`: samo vrstica 017 in nove kode v registru (konflikt zgolj vrstica v tabeli).
