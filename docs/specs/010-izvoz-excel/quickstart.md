# Quickstart: Izvoz izbranih kontaktov v Excel

Pogoji: Docker (Testcontainers `postgres:18-alpine`, Firebase Auth Emulator), JDK 21, Node ≥ 22.22. Ključi niso potrebni.

## Samodejno preverjanje

```bash
scripts/feature.sh izvoz-excel
./verify.sh quick      # format, lint, tipi, utišanja, orodja (D-89), unit (CellText, ExportLabels, exportFileName) in FE testi
./verify.sh full       # + integracijski, varnostni (matrika izolacije export), ExportPerformanceIT, E2E 360/768/1280 px s prenosom in branjem datoteke
```

## Ročni potek (docker compose)

1. `docker compose up --build`. Prijavi se z emulatorjem kot urednik skupine »Projekt FERI« s ≥ 30 kontakti, od katerih jih ima 12 značko `konferenca2025`. Kontakt A ima `kompetenca=web dev` in `Oddelek=IT`, B ima `podjetje=FERI`, en kontakt pa ima ime `=HYPERLINK("http://x","klik")` in telefon `+386 41 123 456`. Drug uporabnik je član z vlogo bralec.
2. Kot bralec izberi Ano Kos (stran 1) in Bora Zupana (stran 2). Akcijska vrstica pokaže *Izvozi v Excel*, brez izbora pa gumba ni (FR-010-01).
3. *Izvozi v Excel*. Gumb za kratek čas pokaže »Pripravljam izvoz…«, nato se prenese `Projekt-FERI-kontakti-‹danes›.xlsx` in prikaže se »Izvoženih kontaktov: 2.« Izbor ostane (FR-010-02, FR-010-10, FR-010-14, FR-010-15).
4. Odpri datoteko. Pričakuješ en list »Kontakti«, glavo `Ime | Priimek | Naslov | E-naslov | Telefon | … | Značke` in 2 vrstici. Vse celice so besedilo, formul ni (FR-010-03 … FR-010-08).
5. Izberi A, B in kontakt s `=HYPERLINK…` ter izvozi. Stolpci po *Telefon* morajo biti `kompetenca`, `Oddelek`, `podjetje`. Celice so `'=HYPERLINK("http://x","klik")` in `'+386 41 123 456` (FR-010-05, FR-010-09).
6. Preklopi v angleščino in izvozi. Pričakuješ list "Contacts", glavo "First name" … "Tags" in ime `Projekt-FERI-contacts-‹danes›.xlsx` (FR-010-04).
7. Razvrsti seznam po e-naslovu padajoče, izberi tri kontakte in izvozi. Vrstice morajo biti v enakem vrstnem redu kot na seznamu (FR-010-07).
8. Filtriraj `Značka: konferenca2025`, nato *Izberi vse zadetke (12)* in izvozi: 12 vrstic. V drugem zavihku kot urednik dodaj značko trinajstemu kontaktu in znova izvozi. Pokaže se obvestilo »Izbor se je spremenil: 1 nov zadetek.«, ki ponudi *Posodobi izbor* (13 vrstic po ponovnem izvozu) ali *Nadaljuj z obstoječim izborom* (12 vrstic) (FR-010-02, FR-009-18).
9. Kot lastnik arhiviraj skupino. Bralec in urednik vidita *Izberi vse zadetke (N)*, *Izvozi v Excel* in *Počisti izbor* (ne pa *Uredi izbrane* in *Izbriši*), izvoz pa uspe (FR-010-01, FR-010-16).
10. Brez povezave (DevTools → Offline) gumb ostane viden. Ob kliku se pokaže sporočilo napake z *Poskusi znova*, prenosa ni in izbor ostane (FR-010-15).
11. Pri 320 px je akcijska vrstica prilepljena spodaj. Izvoz deluje samo s tipkovnico, bralnik zaslona pa prebere »Pripravljam izvoz…« in obvestilo o uspehu.

## Hitra preverba REST (z žetonom emulatorja)

```bash
curl -s -D - -o kontakti.xlsx -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"contactIds":["…","…"],"sort":"email","dir":"desc","language":"sl"}' \
  "$API/groups/$G/contacts/export"            # 200, X-Export-Count, X-Export-Skipped
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"contactIds":[],"language":"sl"}' "$API/groups/$G/contacts/export"   # 400 contactIds REQUIRED
```

Pogodba: [contracts/openapi.yaml](contracts/openapi.yaml) · modeli: [data-model.md](data-model.md).
