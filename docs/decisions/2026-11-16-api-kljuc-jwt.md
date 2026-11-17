# API ključ kot podpisan JWT in ločen imenski prostor `/v1` (019)

- **Datum:** 2026-11-16
- **Avtor:** razvijalec (posvet `/rollout`, specs/019-api-kljuci/spec.md *Clarifications*), research R-01 … R-04
- **Nadomešča:** –

## Kontekst
Programi in skripte uporabnikov potrebujejo dostop do kontaktov brez prijave z Googlom/Firebase. Potrebna sta nov tip
klicatelja in nova poverilnica. Razvijalec je zahteval najpreprostejši mehanizem, ki ne hrani skrivnosti v bazi.

## Odločitev
- **Poverilnica:** API ključ je `cmk_` + kompaktni JWT, podpisan s HS256 (Nimbus JOSE + JWT, ki je že v projektu prek
  `spring-boot-starter-security-oauth2-resource-server`; brez nove odvisnosti). Trditve: `iss` `contact-manager`,
  `aud` `contact-manager-api`, `sub` (id uporabnika), `jti` (id vrstice `api_key`), `iat`, neobvezen `exp` (brez roka
  ga ni) in `scp` (obseg: `{"all":"READ|WRITE"}` ali `{"groups":{"<groupId>":"READ|WRITE",…}}`).
- **Preverjanje ob vsaki zahtevi:** predpona → podpis, `iss`, `aud`, `exp` → vrstica `api_key` po `jti` (obstaja, isti
  uporabnik, `revoked_at IS NULL`). Izbris računa kaskadno izbriše vrstice, zato ključ izbrisanega računa vrne `401`.
- **Hramba:** žeton in njegova zgoščena vrednost se ne hranita. Vrstica hrani ime, prepoznavni del (zadnjih 6 znakov),
  prikazni obseg, čase, preklic in statistiko.
- **Podpisni ključ:** `API_KEY_SIGNING_SECRET` (≥ 32 bajtov, base64) iz okolja; brez vrednosti se zaledje ne zažene.
  V testih se generira naključno; v Gitu ni nobene vrednosti.
- **Imenski prostor:** operacije API so pod `/v1/**` v ločeni verigi Spring Security (`@Order(2)`): stateless, brez
  CSRF, brez CORS, samo `Authorization: Bearer cmk_…`. Firebase žeton na `/v1` in API ključ na `/api` vrneta `401`.
  `EmailVerifiedFilter` (017) velja samo za `/api/**`.

## Posledice
- Zamenjava podpisnega ključa okolja razveljavi vse API ključe (uporabniki jih ustvarijo znova) – sprejemljivo.
- Preklic deluje takoj, ker se vrstica preveri ob vsaki zahtevi; JWT sam ne zadošča.
- Obseg je v podpisanem žetonu, vrstica `api_key_group` je samo za prikaz; oba nastaneta hkrati in se ne spreminjata.
- Zavrnjeno: naključna skrivnost + SHA-256 (kot gesla 014) – razvijalec je izbral JWT; RS256/ES256 (ni potrebe po
  javnem ključu, ker preverja samo zaledje); OAuth 2 odjemalci (preobsežno za prvo različico).
