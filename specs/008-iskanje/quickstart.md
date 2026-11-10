# Quickstart: Iskanje, filtri in razvrščanje kontaktov

Pogoj: Docker (Testcontainers `postgres:18-alpine`, Firebase Auth Emulator), JDK 21, Node ≥ 22.22. Brez ključev.

## Samodejno preverjanje

```bash
scripts/feature.sh iskanje
./verify.sh quick      # format, lint, tipi, utišanja, unit in FE testi (po vsaki nalogi)
./verify.sh full       # + integracijski, varnostni, E2E pri 360/768/1280 px (pred PR)
```

## Ročni potek (docker compose)

1. `docker compose up --build`, prijava z emulatorjem; ustvari skupino in kontakte: »Janez Novak« (janez@feri.si, `kompetenca=web dev`, znački `vip`, `konferenca2025`), »Mojca Kralj«, »Bojan Čeh«, »Cene Zupan«, »Eva Žagar«.
2. Vpiši `feri` v *Iskanje po kontaktih* → po kratkem premoru samo Janez Novak, »Najdenih 1 kontakt« (FR-008-01, FR-008-10). `ZUPANC`/`zupanč` najde priimek z in brez strešic (FR-008-02); `web dev` ne najde nič (FR-008-01).
3. *Filtri* → Atribut `kompetenca`, vrednost `web` → *Uporabi filtre*; v naslovu je `?f=x.kompetenca:web`; gumb *Filtri (1)* (FR-008-03, FR-008-11). V skupini *Značke* vpiši v »Poišči značko« `kon` (seznam se zoži, »Značke: prikazanih N od M«), izberi znački `vip` in `konferenca2025` – izbrani ostaneta vidni tudi ob novem iskanju; zadetek je samo kontakt z obema (FR-008-04, FR-008-05, FR-008-06).
4. Odstrani oznako »Značka: vip« (fokus ostane v orodni vrstici), nato *Počisti filtre* (FR-008-11, FR-008-12). Brez zadetkov: »Ni kontaktov, ki ustrezajo filtrom.« (FR-008-13).
5. *Razvrsti* → Priimek: Cene, Čeh, … Zupan, Žagar – Č za C, Ž za Z, tudi pri angleškem vmesniku (D-63, FR-008-07). Podjetje padajoče: kontakti brez vrednosti na koncu. Klik na glavo *E-naslov* obrne smer (`aria-sort`).
6. Kopiraj naslov, odpri ga v drugem zavihku in pri drugem članu skupine: enak prikaz in vrstni red (FR-008-09). Osvežitev in *Nazaj* po odprtju kontakta ohranita stanje.
7. Ročno spremeni naslov na `?f=x.skrivno:a` ali `?q=` z 201 znaki → »Filtri niso veljavni.« + *Počisti filtre* (FR-008-14). Ustavi zaledje → napaka z *Poskusi znova*, prejšnji seznam ostane (FR-008-17).
8. Arhiviraj skupino (003): iskanje, filtri in razvrščanje delujejo enako (FR-008-15).

## Hitra preverba REST (z žetonom emulatorja)

```bash
curl -H "Authorization: Bearer $TOKEN" "$API/groups/$G/contacts?q=zupanc&f=x.kompetenca:web&tag=vip&sort=email&dir=desc&size=50"
curl -H "Authorization: Bearer $TOKEN" "$API/groups/$G/contact-filters"
```

## Pogodba

REST: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md) · plan: [plan.md](plan.md).
