# Data Model: Prijava, ogrodje aplikacije in Moj račun (001)

## Tabela `app_user` (migracija `V2__uporabnik.sql`)

| Stolpec | Tip | Pravila | Vir |
|---|---|---|---|
| `id` | `bigint generated always as identity` | primarni ključ; notranji, nikoli v API-ju | – |
| `firebase_uid` | `varchar(128)` | `not null`, `unique`; `sub` iz žetona Firebase | FR-001-02, -07 |
| `name` | `text` | lahko `null` (Googlov račun brez imena); posodobi se ob vsaki sinhronizaciji | FR-001-02, -03 |
| `email` | `varchar(254)` | `not null`; edinstven ne glede na velikost črk (`unique index on lower(email)`); posodobi se ob vsaki sinhronizaciji | FR-001-02, -03 |
| `language` | `varchar(2)` | `null` ali `check (language in ('sl','en'))`; `null` = ni izbire | FR-001-15, -19 |
| `theme` | `varchar(5)` | `null` ali `check (theme in ('light','dark'))`; `null` = *Sistemska* | FR-001-17, -19 |
| `created_at` | `timestamptz` | `not null default now()`; datum registracije (izvoz 012) | FR-001-02 |
| `updated_at` | `timestamptz` | `not null default now()`; nastavi se ob vsaki spremembi | – |

### Pravila in prehodi

- **Sinhronizacija ob prijavi** (`PUT /api/me`): `INSERT … ON CONFLICT (firebase_uid) DO UPDATE` –
  `name`, `email` vedno iz žetona; `language = COALESCE(app_user.language, <izbira naprave>)`,
  `theme = COALESCE(app_user.theme, <izbira naprave>)`. Prva sinhronizacija ustvari profil (`201`), vsaka naslednja ga
  posodobi (`200`). Sočasni sinhronizaciji istega UID-ja ustvarita natanko en profil.
- **Sprememba izbire** (`PUT /api/me/preferences`): nastavi obe vrednosti, kot sta poslani (`null` izbriše izbiro);
  če profila še ni, ga najprej ustvari iz žetona (isti stavek kot sinhronizacija).
- Profil se ne briše v 001 (izbris računa je 012; `FR-012-08` izbriše tudi `language` in `theme`).
- Edinstvenost e-naslova je predpostavka spec (en Google račun = en e-naslov); kršitev indeksa je napaka strežnika
  (`500`) in se ne pričakuje.

## Odgovor `Profile` (contracts/openapi.yaml)

```json
{ "name": "Ana Novak", "email": "ana@primer.si", "language": "en", "theme": null }
```

- `name` je lahko `null`; vmesnik tedaj prikaže e-naslov (spec, *Edge Cases*).
- Identifikatorji (`id`, `firebase_uid`) niso del odgovora (FR-001-08).

## Stanje v brskalniku

| Ključ `localStorage` | Vrednosti | Pomen |
|---|---|---|
| `language` | `sl`, `en` | izrecna izbira jezika; ni ključa = jezik brskalnika (FR-001-16) |
| `theme` | `light`, `dark` | izrecna izbira teme; ni ključa = *Sistemska* (design.md 4.3) |

Neznana vrednost se prezre (kot da ključa ni). Seja Firebase je v IndexedDB SDK-ja (ni del podatkovnega modela
aplikacije). Profil prijavljenega uporabnika je samo v pomnilniku in se ob odjavi ali izgubi seje izbriše.
