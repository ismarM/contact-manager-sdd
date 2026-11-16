# Kartografska storitev OpenStreetMap samo prek zaledja

- **Datum:** 2026-11-16
- **Avtor:** osnutek (izvajalec 016); potrdi razvijalec ob pregledu plan.md
- **Nadomešča:** –

## Kontekst
016 doda zemljevid naslovov in samodokončanje naslova (spec Clarifications Q2). Konstitucija VI ne dovoljuje klicev na tuje
storitve iz brskalnika; besedilo naslova kontakta je osebni podatek.

## Odločitev
- Zaledje (paket `maps`) je edini odjemalec: lokacija – Nominatim, predlogi – Photon (podatki OSM; Nominatim samodokončanja
  ne dovoljuje), ploščice – `tile.openstreetmap.org`. URL-ji nastavljivi (`MAPS_*`).
- Posreduje se samo besedilo naslova na izrecno zahtevo (gumb zemljevida, vpis s samodokončanjem, *Razčleni naslov*);
  `User-Agent: ContactManager/<različica> (+https://github.com/ismarM/contact-manager-sdd)`, brez e-naslova, piškotkov in
  podatkov uporabnika; besedilo naslova se ne beleži.
- Omejevanje: Nominatim 1 zahteva/s globalno; Photon 5/s globalno in 2/s na uporabnika; ploščice 20/s globalno in 60/10 s
  na uporabnika. Predpomnilnik samo v pomnilniku (lokacije 24 h, predlogi 1 h, ploščice do 7 dni / 50 MB); koordinate se ne
  shranjujejo.
- Napaka storitve nikoli ne ovira dela s kontaktom (503 `MAP_SERVICE_UNAVAILABLE`, prazni predlogi).
- Testi brez pravih klicev: nadomestni strežnik v zaledju, MSW v FE, `osm-stub` v E2E.

## Posledice
- Konstitucija VI se dopolni z izjemo za strežniške klice OSM in z »obliko zapisa« med hranjenimi podatki.
- En primerek zaledja (omejevalnik v pomnilniku); več primerkov bi potrebovalo skupen omejevalnik.
- Zavrnjeno: klici iz brskalnika (FR-016-23), komercialni ponudnik (ključi, pogodba), statična slika (ni premikanja).
