# Quickstart: Izbor in množično urejanje kontaktov

Pogoj: Docker (Testcontainers `postgres:18-alpine`, Firebase Auth Emulator), JDK 21, Node ≥ 22.22. Brez ključev.

## Samodejno preverjanje

```bash
scripts/feature.sh mnozicno-urejanje
./verify.sh quick      # format, lint, tipi, utišanja, unit in FE testi (po vsaki nalogi)
./verify.sh full       # + integracijski, varnostni (matrika izolacije), E2E pri 360/768/1280 px, BulkPerformanceIT (pred PR)
```

## Ročni potek (docker compose)

1. `docker compose up --build`, prijava z emulatorjem kot urednik; skupina s ≥ 60 kontakti (npr. 30 z značko `konferenca2025`, »Mojca Kralj« s 30 značkami, nekaj z atributom `podjetje`). Drugi uporabnik je član z vlogo bralec.
2. Označi »Izberi Janez Novak« → akcijska vrstica »Izbran: 1« (bralnik zaslona jo prebere). Označi še dva na strani 1, pojdi na stran 2, izberi dva, spremeni razvrstitev in filter → »Izbranih: 5«; ob vrnitvi so prvi trije še označeni (FR-009-01, FR-009-02).
3. Na strani z delno izbranimi kontakti je »Izberi vse na strani« v mešanem stanju; klik izbere vso stran, ponovni klik jo odznači (FR-009-01).
4. Filter značke `konferenca2025` → *Izberi vse zadetke (30)* doda vse zadetke (FR-009-03). Skupina z > 10 000 zadetki ali unija nad mejo → »Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.«, izbor ostane (FR-009-04).
5. *Uredi izbrane* → *Dodaj značke* `nova`, *Odstrani značke* `staro`, *Nastavi atribut* Dodatni atribut `podjetje` = `FERI` → »Uporabi za N kontaktov« → »Posodobljenih N kontaktov.«, izbor ostane (FR-009-06, FR-009-07, FR-009-12). V revizijski sledi en vnos »uredil(a) N kontaktov« (FR-009-14).
6. Izberi tudi »Mojca Kralj« in dodaj novo značko → v dialogu napaka s kontaktom in razlogom, nič se ne spremeni (FR-009-09, FR-009-17).
7. V drugem zavihku kot drug urednik izbriši enega izbranih in dodaj značko `konferenca2025` dvema neizbranima kontaktoma; nato v prvem zavihku *Uporabi* → obvestilo »Izbor se je spremenil: 2 nova zadetka, 1 kontakt ne obstaja več.« s *Posodobi izbor* / *Nadaljuj z obstoječim izborom* (FR-009-18). Sprememba telefona izbranega kontakta obvestila ne sproži.
8. *Izbriši* → »Izbrišem N kontaktov?« s fokusom na *Prekliči*; *Esc* ne izbriše ničesar; potrditev → »Izbrisanih N kontaktov.«, izbor prazen, en vnos *odstranjevanje* (FR-009-13, FR-009-14).
9. Kot bralec: akcijska vrstica brez *Uredi izbrane* in *Izbriši*. Arhiviraj skupino (lastnik): izbor deluje, akcij pisanja ni (FR-009-05, FR-009-15).
10. Pri 320 px: akcijska vrstica prilepljena na spodnji rob, vse samo s tipkovnico (SC-005).

## Hitra preverba REST (z žetonom emulatorja)

```bash
curl -H "Authorization: Bearer $TOKEN" "$API/groups/$G/contact-ids?tag=konferenca2025"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"contactIds":["…"],"queries":[{"tag":["konferenca2025"],"contactIds":["…"],"excludedIds":[]}]}' "$API/groups/$G/contacts/selection-check"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"contactIds":["…"],"addTags":["nova"]}' "$API/groups/$G/contacts/bulk-update"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"contactIds":["…"]}' "$API/groups/$G/contacts/bulk-delete"
```

## Pogodba

REST: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md) · plan: [plan.md](plan.md).
