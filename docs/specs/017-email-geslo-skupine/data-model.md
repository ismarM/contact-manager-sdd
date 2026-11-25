# Data Model – 017

Brez sprememb sheme in brez migracije.

| Podatek | Pravilo |
|---|---|
| `app_user.firebase_uid` | UNIQUE (V2); en profil na Firebase račun; ob povezovanju metod se UID ne spremeni |
| `app_user.email` | UNIQUE `lower(email)` (V2); posodobi se samo iz žetona s `email_verified=true` (nepotrjen žeton do profila sploh ne pride, R-01) |
| Prijavne metode | samo v Firebase (`providerUserInfo`: `google.com`, `password`); PostgreSQL ne hrani gesel ali metod |
| Žeton | zahtevani zahtevki: `sub`, `email`, `email_verified=true`; `auth_time` za izbris računa |

Konflikt UID: danes `PUT /api/me` ob trku `lower(email)` pri **drugem** UID po enem ponovnem poskusu vrže `DuplicateKeyException` (neobravnavano → `500`). Plan: ujame ga `ProfileRepository` in vrne `409 ACCOUNT_CONFLICT` (nova koda v registru `feature-map.md` §2.10); profil drugega UID ostane nespremenjen. IT: dva UID z istim e-naslovom → drugi dobi 409, prvi profil (ime, članstva) nespremenjen (FR-017-11).

Po povezovanju gesla ostane `firebase_uid` isti; `app_user` se ne spremeni (preverja IT in E2E).
