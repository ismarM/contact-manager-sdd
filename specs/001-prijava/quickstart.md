# Quickstart: Prijava, ogrodje aplikacije in Moj račun (001)

## Predpogoji

- Docker (Compose v2), JDK 21+, Node.js ≥ 22.22, Git Bash na Windows.
- Brez pravih ključev: projekt Firebase `demo-contact-manager` in Firebase Auth Emulator.

## Zagon

```bash
docker compose up --build
```

Vmesnik je na `http://localhost:8080`. Prijava z Googlom odpre okno emulatorja (*Add new account* → e-naslov in ime →
*Sign in with Google.com*).

## Preverjanje

```bash
./verify.sh quick   # unit BE/FE, funkcionalni FE (strani, ogrodje, meni, Moj račun)
./verify.sh full    # + integracijski in varnostni BE (emulator, Testcontainers), E2E prijava.spec.ts
```

## Ročni scenariji

| # | Koraki | Pričakovano | FR |
|---|---|---|---|
| 1 | Odpri `/account?x=1` neprijavljen | stran za prijavo, brez vsebine *Mojega računa* | FR-001-06 |
| 2 | Prijavi se z novim računom | vrnitev na `/account?x=1`, ime in e-naslov v *Profilu* | FR-001-02, -06, -14 |
| 3 | *Tab* na novi strani | prvi fokus je »Preskoči na vsebino« | FR-001-11 |
| 4 | Meni računa → *English*, *Esc* | vmesnik v angleščini, meni zaprt, fokus na gumbu | FR-001-12, -15 |
| 5 | *Moj račun* → *Temna*; osveži | temna shema brez bliska | FR-001-17 |
| 6 | V drugem brskalniku (zasebno okno) se prijavi z istim računom | takoj angleščina in temna shema | FR-001-19 |
| 7 | Dva zavihka; v enem *Odjava* | drugi zavihek na prijavi s sporočilom o poteku seje | FR-001-10 |
| 8 | *Odjava*, nato *Nazaj* | stran za prijavo, brez zaščitene vsebine | FR-001-09 |
| 9 | Odpri `/ne-obstaja` | »Te strani ni«, naslov »Te strani ni – Kontakti« | FR-001-13, -18 |
| 10 | Ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10) | vse izvedljivo s tipkovnico; imena kontrol prebrana pravilno | SC-006 |

Endpointi in oblike odgovorov: [contracts/openapi.yaml](contracts/openapi.yaml); podatki: [data-model.md](data-model.md).
