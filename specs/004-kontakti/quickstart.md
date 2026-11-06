# Quickstart: Kontakti skupine

Pogoj: Docker (Testcontainers, Firebase Auth Emulator), JDK 21, Node ≥ 22.22. Brez ključev.

## Samodejno preverjanje

```bash
scripts/feature.sh kontakti
./verify.sh quick      # format, lint, tipi, utišanja, unit in FE testi (po vsaki nalogi)
./verify.sh full       # + integracijski, varnostni, E2E pri 360/768/1280 px (pred PR)
```

## Ročni potek (docker compose)

1. `docker compose up --build`, odpri http://localhost:8080 (vrata po `compose.yaml`), prijavi se z emulatorjem.
2. Ustvari skupino. Odpre se zavihek *Kontakti* s praznim stanjem »Ta skupina še nima kontaktov.«
3. *Nov kontakt* → ime »Janez«, priimek »Novak«, atribut `kompetenca` = »web dev«, znački `ne_obveščaj` in `konferenca2025` → *Shrani kontakt*. Obvestilo »Kontakt Janez Novak je shranjen.« in pogled kontakta (FR-004-01).
4. Pusti ime in priimek prazna → »Vpiši vsaj ime ali priimek.« (FR-004-02); vpiši »janez@« → napaka ob zapustitvi polja (FR-004-03).
5. Odpri isti kontakt v dveh zavihkih (dva urednika), v prvem shrani, v drugem shrani → opozorilo o konfliktu s tremi možnostmi (FR-004-11).
6. V zavihku z bralcem ni gumbov *Nov kontakt*, *Uredi kontakt*, *Izbriši kontakt*; pot `/contacts/new` pokaže razlago (FR-004-17).
7. Arhiviraj skupino (003): seznam in pogled delujeta, spreminjanje ne (FR-004-15, FR-004-17).
8. Pri 1280 px se podrobnosti odprejo v panelu ob seznamu in ostanejo izbrane ob osvežitvi (FR-004-09).

## Pogodba

REST: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md).
