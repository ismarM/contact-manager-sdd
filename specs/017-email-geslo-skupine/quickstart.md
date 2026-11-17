# Quickstart – 017

Predpogoji: Docker, Node, JDK 21. Ročno v pravem Firebase projektu (razvijalec): Email/Password omogočen, *password policy* min. 8 znakov, zaščita pred naštevanjem **vključena**.

1. `./verify.sh quick` – enote in FE testi (obrazci, gateway, iskanje, dialog lastnika).
2. `./verify.sh backend` – `EmailVerifiedSecurityIT`, `AccountDeletionReauthIT`, `GroupSearchIT`, razširjena matrika izolacije skupin.
3. `./verify.sh e2e` – `prijava-geslo.spec.ts` (registracija → koda iz emulatorja → vstop; napačno geslo; pozabljeno geslo; dodajanje gesla Google uporabniku; izbris računa z ponovno avtentikacijo), `skupine-iskanje.spec.ts`, lastnik *Zapusti skupino*.
4. Ročno (razvijalec): prava potrditvena sporočila in dodajanje gesla v pravem projektu; bralnik zaslona (design.md §10).

Pričakovano: nepotrjen račun ne dobi nobenega odgovora API (403 `EMAIL_NOT_VERIFIED`), po potrditvi vstopi brez ponovne prijave; isti UID po dodajanju gesla.

## Varen preizkus z ločenim Firebase testnim projektom (ročno, ne v CI)
Emulator zaščite pred naštevanjem ne posnema, zato povezovanje gesla ob vključeni EEP preveri razvijalec ročno: ločen Firebase projekt (ne produkcijski) z vključeno EEP in password policy ≥ 8, testni račun Google; `VITE_FIREBASE_*` vrednosti samo v lokalnem `.env` (ni v Gitu). Koraki: prijava z Googlom → *Mojem računu* → *Dodaj geslo* → odjava → prijava z geslom. Pričakovano: isti UID (Firebase Console → Users), iste skupine, `email_verified=true` ali zaslon *Potrdite e-naslov*; ob poskusu `accounts:update` z `curl` ob EEP napaka (dokaz, da je `signUp` res potreben).
