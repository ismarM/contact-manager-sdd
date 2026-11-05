# Quickstart: Skupine kontaktov (002)

## Predpogoji

- Docker (Compose v2), JDK 21+, Node.js ≥ 22.22; brez pravih ključev (projekt Firebase `demo-contact-manager`, Auth Emulator).
- Funkcionalnost 001 (prijava) je združena.

## Zagon

```bash
docker compose up --build
```

Vmesnik je na `http://localhost:8080`. Prijava z Googlom odpre okno emulatorja (*Add new account*).
Druge vloge (Admin, Urednik, Bralec) do 006/007 ni mogoče dodeliti iz vmesnika; v lokalnem razvoju jih nastaviš neposredno v bazi:

```sql
INSERT INTO group_member (group_id, user_id, role) VALUES ('<uuid skupine>', <app_user.id>, 'EDITOR');
UPDATE contact_group SET archived_at = now() WHERE id = '<uuid skupine>';   -- arhivirana skupina (do 003)
```

## Preverjanje

```bash
./verify.sh quick   # unit BE/FE, funkcionalni FE (zaslon, stranski pas, meni, dialog, glava, nastavitve, konflikt)
./verify.sh full    # + integracijski in varnostni BE (matrika izolacije), E2E skupine.spec.ts (360/768/1280 px)
```

## Ročni scenariji

| # | Koraki | Pričakovano | FR |
|---|---|---|---|
| 1 | Nov uporabnik odpre `/` | »Nimaš še nobene skupine.« in gumb *Nova skupina* | FR-002-05 |
| 2 | *Nova skupina* → naslov »Projekt FERI«, barva *Mah* → *Ustvari skupino* | skupina se odpre, obvestilo »Skupina je ustvarjena.«, glava z oznako »Lastnik« | FR-002-01, -03, -07 |
| 3 | *Nova skupina* → prazen naslov → *Ustvari skupino* | dialog ostane odprt, napaka ob polju *Naslov* | FR-002-02 |
| 4 | Širina ≥ 1024 px: poglej stranski pas | razdelek *Lastnik* s skupino, trenutna označena | FR-002-06 |
| 5 | Širina < 1024 px: *Preklopi skupino* | meni z istimi razdelki | FR-002-06 |
| 6 | Odpri `/groups/<tuj uuid>` | »Te strani ni« in naslov »Te strani ni – Kontakti« | FR-002-08, -09 |
| 7 | Nastavitve: spremeni naslov → *Shrani spremembe* | obvestilo »Podatki skupine so shranjeni.«, nov naslov v glavi in stranskem pasu | FR-002-11 |
| 8 | V bazi nastavi vlogo `VIEWER` in osveži *Nastavitve* | podatki brez obrazca | FR-002-10 |
| 9 | Dva zavihka: v obeh odpri *Nastavitve*, shrani v prvem, nato v drugem | opozorilo »Skupino je medtem spremenil(a) …«, tri možnosti | FR-002-12 |
| 10 | V bazi arhiviraj skupino | skupine ni na seznamu; glava ima oznako »Arhivirano«, obrazca ni | FR-002-04, -07 |
| 11 | Ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10) | vse izvedljivo s tipkovnico; imena kontrol prebrana pravilno | SC-005, SC-006 |

Endpointi in oblike odgovorov: [contracts/openapi.yaml](contracts/openapi.yaml); podatki: [data-model.md](data-model.md).
