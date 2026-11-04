# Data Model: Ogrodje projekta (000)

Ogrodje nima poslovnih podatkov in ne ustvari tabel. Opisani so podatki orodij, na katere se zanašajo testi in
`verify.sh`, ter edina migracija.

## Baza (PostgreSQL)

| Objekt | Vir | Opomba |
|---|---|---|
| `flyway_schema_history` | Flyway | zapis uveljavljenih migracij; `HealthAndMigrationIT` preveri V1 z `success = true` |
| `V1__ogrodje.sql` | `backend/src/main/resources/db/migration/` | brez tabel, samo `COMMENT ON SCHEMA public IS 'Contact Manager'`; poslovne tabele dodajo 001+ kot `V2__…` |

Pravila: migracije se nikoli ne spreminjajo po združitvi v `main` (nova sprememba = nova različica); neuspešna migracija ustavi zagon backenda (FR-000-03).

## Vnos v `DECISIONS.md`

Vrstica tabele v `DECISIONS.md` (obstoječa oblika):

```text
| D-NN | YYYY-MM-DD | avtor | vrsta | odločitev in utemeljitev |
```

| Polje | Pravilo |
|---|---|
| `ID` | `D-` + dve ali več števk, edinstveno, ne uporabi se znova |
| `Vrsta` | ena od `odločitev`, `sprememba-testa`, `utišanje`, `sprememba-specifikacije` |
| vnos vrste `utišanje` | utemeljitev navede datoteko, oznako (npr. `@SuppressWarnings("unchecked")`, `it.skip`) in razlog |

`suppressions.mjs` prebere samo vrstice, ki se začnejo z `| D-`; sklic `DECISIONS D-NN` v kodi je veljaven, če obstaja vrstica z istim ID in vrsto `utišanje`.

## Sklic na utišanje v kodi

```text
// DECISIONS D-07: razlog                       (TS/TSX/Java, ista ali predhodna vrstica)
```

| Oznaka | Jezik | Brez sklica | S sklicem na vrsto `utišanje` |
|---|---|---|---|
| `@SuppressWarnings…`, `@Disabled…` | Java | napaka | dovoljeno |
| `eslint-disable*`, `@ts-ignore`, `@ts-expect-error`, tip `any` | TS | napaka | dovoljeno |
| `.skip`, `.fixme`, `xit`, `xdescribe`, `xtest` | TS (Vitest, Playwright) | napaka | dovoljeno |
| `.only` | TS | napaka | **napaka** (vedno) |

## Viri prevodov

`frontend/src/i18n/sl.json` in `en.json`: gnezdeni objekti, listi so nizi; ključ je pot s pikami (`start.ready`).
Pravilo: množici ključev obeh datotek sta enaki (FR-000-14); interpolacija `{{ime}}` po i18next.

## Rezultat `verify.sh`

| Pojem | Oblika |
|---|---|
| Raven | `quick` \| `full` |
| Korak | ime iz [contracts/verify-cli.md](contracts/verify-cli.md), skupina `statični` ali `testni`, izid `ok`/`padel`/`ni izveden` |
| Napaka | `datoteka:vrstica  pravilo  sporočilo` ali `test  razlog` |
| `.verify/last.log` | glava vsakega koraka `=== <korak> (<ukaz>) ===`, nato celoten izpis; datoteka se ob vsakem zagonu nadomesti |

## Stanja sistema (Compose)

`db` → `healthy` (`pg_isready`) · `auth` → `healthy` (HTTP 9099) · `backend` → `healthy` (`/api/health` = 200) · `frontend` → teče.
Backend čaka na zdrava `db` in `auth`; frontend na zdrav backend.
