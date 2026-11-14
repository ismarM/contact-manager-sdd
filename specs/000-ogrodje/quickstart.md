# Quickstart: Ogrodje projekta (000)

Vodnik za preverjanje, da ogrodje deluje od začetka do konca. Oblika ukazov in izpisa je v
[contracts/verify-cli.md](contracts/verify-cli.md), API v [contracts/openapi.yaml](contracts/openapi.yaml).

## Predpogoji

- Git, Docker (z Compose v2), JDK ≥ 21, Node.js ≥ 22.12 z npm. Maven ni potreben (`mvnw`).
- Windows: Git Bash; `.gitattributes` zagotovi konce vrstic LF.

## 1. Kavlji (enkrat po kloniranju) – FR-000-19

```bash
scripts/install-hooks.sh
```

Preizkus: v staged datoteko dodaj lažen zasebni ključ (`-----BEGIN RSA PRIVATE KEY-----` …) → `git commit` se ne izvede,
izpis navede datoteko, vrstico in pravilo, vrednost je skrita.

## 2. Zagon sistema – FR-000-01 … FR-000-04

```bash
docker compose up --build        # brez .env; privzete vrednosti so v compose.yaml (.env.example jih opisuje)
```

| Preverjanje | Pričakovano |
|---|---|
| `curl -i http://localhost:8080/api/health` | `200`, `{"status":"UP"}`, glava `X-Request-Id` |
| `curl -i http://localhost:8080/api/karkoli` | `401`, `{"code":"UNAUTHENTICATED"}` |
| `docker compose stop db`, nato `/api/health` | `503`, `{"status":"DOWN"}` |
| brskalnik `http://localhost:8080` | naslov »Kontakti« (ob jeziku `sl`) ali "Contacts" |
| `docker compose logs backend` | vsaka vrstica zahtevka ima ID; ni žetonov ali nizov poizvedbe |

Ponovni zagon: `docker compose up` (≤ 2 min, SC-001); migracija V1 se ne izvede znova.

## 3. Vrata kakovosti – FR-000-05 … FR-000-10

```bash
./verify.sh quick                # ✓ quick OK (… s), ≤ 3 min (SC-003)
./verify.sh full                 # ✓ full OK (… s); teče tudi ob prižganem razvojnem sistemu
./verify.sh foo; echo $?         # navodilo za uporabo, koda 2
```

Po `full`: `docker compose -p contact-manager-verify ps` je prazen, razvojni sistem iz koraka 2 še teče.

## 4. Ročni samopreizkus – FR-000-17

Za vsak primer uvedi napako, poženi navedeno raven, preveri izhod ≠ 0 in ≤ 20 vrstic z imenom napake, nato napako odstrani.
Izid vseh primerov zapiši v `DECISIONS.md`.

| # | Namerna napaka | Ukaz | Pričakovan korak |
|---|---|---|---|
| 1 | odvečen presledek v datoteki Java | `quick` | `format` |
| 2 | odvečen presledek v datoteki TSX | `quick` | `format` |
| 3 | `<img src="x.png">` brez `alt` | `quick` | `lint` (`jsx-a11y/alt-text`) |
| 4 | `const n: string = 1` | `quick` | `tipi` |
| 5 | obrnjena asercija v `RequestIdFilterTest` | `quick` | `unit BE` |
| 6 | obrnjena asercija v `client.test.ts` | `quick` | `unit FE` |
| 7 | gumb brez dostopnega imena v `StartPage` | `quick` | `funkcionalni FE` (axe) |
| 8 | obrnjena asercija v `HealthAndMigrationIT` | `full` | `integracijski BE` |
| 9 | `// eslint-disable-next-line` brez sklica | `quick` | `utišanja` |
| 10 | lažna skrivnost v staged datoteki | `git commit` | kavelj gitleaks |

## 5. CI – FR-000-11

1. Push veje → v GitHubu status `verify` (zelen).
2. Pull request z namerno padajočim testom → status rdeč, priloga `verify-log` vsebuje `.verify/last.log`.
3. Enkrat ročno: *Settings → Branches → Branch protection rules* za `main`: *Require status checks to pass* → `verify`.
   Brez tega pravila FR-000-11 ni izpolnjena (spec, Assumptions).

## 6. Vmesnik – FR-000-12 … FR-000-15 (pokrije E2E, ročno po želji)

- DevTools → *Network*: vsi zahtevki na `localhost:8080`, pisavi `.woff2` z istega izvora.
- *Rendering → prefers-color-scheme: dark* → temne vrednosti; `document.documentElement.dataset.theme = 'light'` preglasi.
- *Application → Manifest*: ime »Kontakti«, `standalone`, ikone 192/512/maskable; *Service workers*: aktiven.
- *Network → Offline* + osvežitev: stran se naloži; `fetch('/api/health')` v konzoli ne uspe.
