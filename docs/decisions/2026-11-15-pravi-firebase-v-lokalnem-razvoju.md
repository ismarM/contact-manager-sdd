# Pravi Firebase projekt v lokalnem razvoju, emulator za teste

- **Datum:** 2026-11-15
- **Avtor:** Ismar (izvedba: Claude Code)
- **Nadomešča:** –

## Kontekst
Projekt `contact-manager-sdd-6bd9b` ima omogočeno Google prijavo. Do zdaj je razvojni sistem vedno uporabljal Auth Emulator
(`demo-contact-manager`), pravi projekt pa ni bil nikjer povezan. Koda je že podpirala oba načina (backend: prazen
`FIREBASE_AUTH_EMULATOR_HOST` = produkcija; frontend: `VITE_FIREBASE_EMULATOR=false`; brisanje identitete 012: `GoogleAccessTokenSource`).

## Odločitev
- Nova prekrivna datoteka `compose.firebase.yaml` (ločen projekt Compose `contact-manager-firebase`, ločena baza) preklopi na pravi
  projekt; storitev `auth` dobi profil `emulator` in se ne zažene.
- Vrednosti pridejo iz `.env.firebase` (v `.gitignore`); ključ storitvenega računa je mount izven repozitorija prek
  `GOOGLE_APPLICATION_CREDENTIALS` (012, research R-06). Obvezne spremenljivke so označene z `${VAR:?}`.
- `frontend/nginx.conf` razrešuje `auth` leno (`resolver` + spremenljivka), sicer nginx ne bi zagnal brez storitve `auth`.
- Privzeto (`compose.yaml`, `verify.sh`, CI, Testcontainers) ostane emulator; testi ne potrebujejo pravih ključev (konstitucija §3.2).

## Posledice
- Brez kode zaledja ali vmesnika; spremenjeni sta nginx.conf (enako vedenje) in konfiguracija Compose.
- Prava prijava je ročno preverjanje, ne avtomatski test. Zavrnjeno: pravi projekt v CI ali testih (skrivnosti, nedeterminizem).
