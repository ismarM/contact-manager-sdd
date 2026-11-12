# Quickstart: Iskanje in združevanje podvojenih kontaktov

Pogoj: Docker (Testcontainers `postgres:18-alpine`, Firebase Auth Emulator), JDK 21, Node ≥ 22.22. Brez ključev.

## Samodejno preverjanje

```bash
scripts/feature.sh dvojniki
./verify.sh quick      # format, lint, tipi, utišanja, unit in FE testi (po vsaki nalogi)
./verify.sh full       # + integracijski, varnostni (matrika izolacije), E2E pri 360/768/1280 px, DuplicatePerformanceIT (pred PR)
```

## Ročni potek (docker compose)

1. `docker compose up --build`, prijava z emulatorjem kot urednik. Skupina s kontakti: »Janez Novak« (`janez@primer.si`, telefon `+386 41 123 456`, znački `vip`, `konferenca2025`, atribut `Kompetenca=web dev`), »janez  novak« (`JANEZ@primer.si`, telefon `00386 41-123-456`, znački `VIP`, `alumni`, atribut `kompetenca=java`), »Janez Nóvak«, »Ana Kos« ter 14 kontaktov z istim e-naslovom `skupina@primer.si`. Drugi uporabnik je bralec.
2. Zavihek *Dvojniki* je viden uredniku (FR-011-01). Kot bralec: zavihka ni; neposredna pot `/groups/<id>/duplicates` pokaže »Dvojnike lahko išče in združuje urednik ali višja vloga.« brez obrazca. Arhiviraj skupino: zavihka ni, pot pokaže »Skupina je arhivirana – iskanje dvojnikov ni na voljo.«
3. Kategorija »E-naslov« → *Poišči dvojnike*: kartica »Enak e-naslov: janez@primer.si« z dvema kontaktoma; naslov strani vsebuje `category=email`; osvežitev in *Nazaj* ohranita rezultat (FR-011-02 … FR-011-04). Kategorija »Ime in priimek«: vsi trije »Janez Novak« v isti skupini, »Novak Janez« ne (FR-011-03). »Telefon«: prva dva sta dvojnika, `(041) 123 456` ne (FR-011-05).
4. Skupina s 14 kontakti: kartica prikaže prvih 10 in `Še 4 kontakti`; *Primerjaj in združi* odpre primerjavo z natanko prvimi 10 po času ustvaritve in id ter razlago »Prikazanih je prvih 10 od 14 kontaktov.« (FR-011-21, D-93).
5. *Primerjaj in združi* na kartici z dvema kontaktoma: vrstice Ime, Priimek, Naslov, E-naslov, Telefon, `Kompetenca`, Značke; enaka polja pod »Enaka polja (N)«; privzeta izbira je prva neprazna vrednost; značke `vip`, `konferenca2025`, `alumni` obkljukane (FR-011-08 … FR-011-10). Spremeni izbire → predogled se sproti posodobi (FR-011-12).
6. Pri treh kontaktih *Izloči iz združevanja* na tretjem; pri dveh gumba ni, razlaga »Združiti je treba vsaj 2 kontakta.« (FR-011-11). Izberi »(prazno)« pri Imenu in Priimku → *Združi kontakte* pokaže napako ob vrstici, dialog se ne odpre (FR-011-13).
7. *Združi kontakte* → »Združim 2 kontakta?« s fokusom na *Prekliči*; potrditev → obvestilo »Združenih kontaktov: 2. Ostal je kontakt Janez Novak.«, vrnitev na rezultate iste kategorije brez te skupine (FR-011-14, FR-011-15, FR-011-18). Povezava na izbrisani kontakt → »Te strani ni«.
8. Revizijska sled: natanko en nov vnos »združil(a) 2 kontakta« s stanjem prej in potem (FR-011-17). Kot admin: *Povrni skupino na to točko* pri vnosu tik pred združitvijo obnovi oba kontakta z istima identifikatorjema (SC-005, 005). Pozor: rollback vrne stanje **celotne skupine** v tisti točki, torej se prekrijejo tudi poznejše spremembe drugih kontaktov; ostanejo v sledi in jih razveljavi rollback na vnos tik pred novim vnosom *rollback* (FR-005-12).
9. Konflikt: v drugem zavihku kot drug urednik spremeni enega od kontaktov, nato v prvem *Združi kontakte* potrdi → opozorilo »Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.« (FR-011-16). Če drug urednik kontakta združi prej: »Te skupine dvojnikov ni več.« na osveženih rezultatih.
10. Pri 320–360 px: primerjava je zaporedje polj (`fieldset` na polje), brez vodoravnega drsenja strani; vse samo s tipkovnico (Tab, puščice med izbirnimi gumbi, Enter, Esc); bralnik zaslona prebere imena polj in vrednosti.

## Hitra preverba REST (z žetonom emulatorja)

```bash
curl -H "Authorization: Bearer $TOKEN" "$API/groups/$G/duplicates?category=email&size=25"
curl -H "Authorization: Bearer $TOKEN" "$API/groups/$G/duplicates/compare?ids=$A,$B"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"contacts":[{"id":"…","version":0},{"id":"…","version":0}],"result":{"firstName":"Janez","lastName":"Novak","email":"janez@primer.si","attributes":[],"tags":["vip"]}}' \
  "$API/groups/$G/duplicates/merge"
```

Pričakovano: več kot 10 kontaktov v `compare` ali `merge` → `400 VALIDATION_FAILED`; bralec `403`; arhivirana skupina `409 GROUP_ARCHIVED`; kontakt druge skupine `404`; zastarela verzija `409 VERSION_CONFLICT`.

## Pogodba

REST: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md) · plan: [plan.md](plan.md).
