# Knjižnice za telefonske številke in zemljevid

- **Datum:** 2026-11-16
- **Avtor:** razvijalec (potrjeno ob pregledu plan.md, 2026-11-16)
- **Nadomešča:** –

## Kontekst
016 normalizira telefone po mednarodnem standardu številčenja (E.164, nacionalni prikaz po državi številke) in prikaže
interaktiven zemljevid, upravljiv s tipkovnico.

## Odločitev
- Zaledje: `com.googlecode.libphonenumber:libphonenumber` 9.0.42 (Apache-2.0) – preverjanje, E.164, kratke številke.
- Frontend: `libphonenumber-js` 1.13.15 (MIT, metapodatki `max`, nalaganje z `import()`) – prikaz po shemi in opozorilo
  ob polju; odloča strežnik.
- Frontend: `leaflet` 1.9.4 (BSD-2) in `@types/leaflet` 1.9.22 (dev) – zemljevid; ploščice z žetonom prek `/api/map-tiles`,
  CSS in ikone v paketu.
- Oblike naslovov po državah: lastna tabela JSON iz podatkov Google libaddressinput (Apache-2.0), v zaledju in frontendu,
  test enakosti; brez knjižnice.

## Posledice
- Metapodatki številčenja se posodabljajo z novimi različicami obeh knjižnic; razlika med njima vpliva le na opozorilo v FE.
- Zavrnjeno: lastna pravila za telefone (nepopolna), MapLibre (vektorske ploščice, WebGL, večji paket).
