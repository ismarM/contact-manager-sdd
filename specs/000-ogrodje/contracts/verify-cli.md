# Contract: `verify.sh`

Pogodba ukazne vrstice za vrata kakovosti (FR-000-05 … FR-000-09, FR-000-18, Clarifications 2026-11-04).

## Uporaba

```text
./verify.sh quick | full
```

- Deluje iz katerekoli mape repozitorija (poišče svoj koren).
- Brez argumenta, z več argumenti ali neznanim argumentom: izpiše `Uporaba: ./verify.sh quick|full` in vrne `2`.
- `VERIFY_LIST_STEPS=1 ./verify.sh <raven>` izpiše imena korakov ravni (eno na vrstico) in konča s kodo `0`, ne da bi kaj izvedel.

## Izhodne kode

| Koda | Pomen |
|---|---|
| `0` | vsi koraki ravni so uspeli |
| `1` | vsaj en korak je padel |
| `2` | napačna uporaba (argument) |
| `3` | manjka orodje (Java ≥ 21, Node ≥ 22.12, npm; za `full` Docker) – izpiše ime orodja in najnižjo različico |

## Koraki in vrstni red

| # | Korak | Skupina | Raven | Orodje |
|---|---|---|---|---|
| 1 | `format` | statični | quick | Spotless `check`, Prettier `--check` (frontend, e2e) |
| 2 | `lint` | statični | quick | ESLint `--max-warnings 0` (`jsx-a11y`, `better-tailwindcss`, `typescript-eslint`) |
| 3 | `tipi` | statični | quick | `tsc --noEmit` (frontend, e2e); prevajanje BE z `-Xlint:all,-processing -Werror` |
| 4 | `utišanja` | statični | quick | `scripts/verify/suppressions.mjs` |
| 5 | `prevodi` | statični | quick | `scripts/verify/i18n-keys.mjs` |
| 6 | `orodja` | testni | quick | `node --test 'scripts/verify/test/*.test.mjs'` – samotestni primeri orodij za preverjanje (brez Dockerja) |
| 7 | `unit BE` | testni | quick | Surefire (`*Test`) |
| 8 | `unit FE` | testni | quick | Vitest projekt `unit` |
| 9 | `funkcionalni FE` | testni | quick | Vitest projekt `ui` |
| 10 | `integracijski BE` | testni | full | Failsafe (`*IT` razen `*SecurityIT`) |
| 11 | `varnostni BE` | testni | full | Failsafe (`*SecurityIT`) in `node --test 'scripts/verify/test-full/*.test.mjs'` (kavelj gitleaks) |
| 12 | `sistem` | testni | full | `docker compose -p contact-manager-verify … up --build --wait` |
| 13 | `E2E` | testni | full | Playwright (360, 768, 1280 px) |

**Pravilo ustavljanja:** koraki 1–5 se izvedejo vsi; če je kateri padel, se testni koraki ne izvedejo. Testni koraki se
izvajajo po vrsti in se ustavijo pri prvem padlem. Storitve koraka `sistem` se po koncu (tudi ob neuspehu ali prekinitvi)
odstranijo z `down -v --remove-orphans`.

**Opozorila:** vsako opozorilo ESLint, `javac` ali TypeScript je napaka koraka.

## Izpis

Uspeh – natanko ena vrstica:

```text
✓ quick OK (48 s)
```

Neuspeh – imena padlih korakov in skupaj največ 20 vrstic:

```text
✗ quick PADLO (31 s) – koraki: format, tipi
format  frontend/src/app/StartPage.tsx  prettier  datoteka ni formatirana
tipi    frontend/src/i18n/index.ts:12  TS2322  Type 'number' is not assignable to type 'string'.
… in še 4 (celoten izpis: .verify/last.log)
```

- Oblika napake: `korak  datoteka:vrstica  pravilo  sporočilo`; za teste `korak  ime testa  kratek razlog`
  (E2E doda ime projekta, npr. `[w768]`).
- Če je napak več, kot jih gre v 20 vrstic, zadnja vrstica pove število neprikazanih.
- `full` brez Dockerja: `✗ full – potrebuje Docker (docker info ni uspel)`, koda `3`.
- Prekoračen čas (storitev ni pripravljena v 300 s): `sistem  <storitev>  časovna omejitev`.

## `.verify/last.log`

Ob vsakem zagonu se nadomesti; vsebuje glavo in celoten izpis vsakega izvedenega koraka. Mapa `.verify/` je v `.gitignore`.

## Utišanja (korak `utišanja`)

| Zadetek | Brez sklica | S sklicem `DECISIONS D-NN` (vrsta `utišanje`) |
|---|---|---|
| `@SuppressWarnings…`, `@Disabled…` (Java) | padel | ok |
| `eslint-disable*`, `@ts-ignore`, `@ts-expect-error`, tip `any` (TS) | padel | ok |
| `.skip`, `.fixme`, `xit`, `xdescribe`, `xtest` (TS) | padel | ok |
| `.only` (TS) | padel | **padel** |
| sklic na neobstoječ `D-NN` ali vnos druge vrste | padel (`neveljaven sklic D-NN`) | – |

Izpis: `utišanja  datoteka:vrstica  <vrsta>  manjka sklic DECISIONS D-NN` oziroma `… .only ni dovoljen`.
