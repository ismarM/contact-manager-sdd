# Knjižnice za uvoz, vCard in kodo QR (014)

- **Datum:** 2026-11-15
- **Avtor:** razvijalec (predlog nadzornika `/rollout`), specs/014-uvoz-izvoz/research.md R-01, R-02, R-06, R-07
- **Nadomešča:** –

## Kontekst
Funkcionalnost 014 bere preglednice `.xlsx` in vizitke vCard 2.1–4.0, piše vCard 3.0 ter izdela in bere kode QR v
brskalniku (tudi brez povezave).

## Odločitev
- **`org.dhatim:fastexcel-reader` 0.20.2** (Apache-2.0): obstoječa odvisnost testov 010 preide v `compile`, ista
  različica kot pisalnik. Nima zaščite pred zip-bombo, zato jo ima aplikacija (`XlsxGuard`: največ 500 vnosov, ≤ 100 MB
  razširjeno, razmerje stiskanja, datoteka ≤ 10 MB, ≤ 10 000 vrstic).
- **`com.googlecode.ez-vcard:ez-vcard` 0.12.1** (BSD-2) brez opcijskih `jackson-core` in `jsoup`. Knjižnica je stabilna,
  zadnja izdaja je iz leta 2023 (avgust); vzdrževanje je redko, zato je uporaba zaprta v `VcardReader` in `VcardWriter`.
- **`qrcode` 1.5.4** (MIT, z `@types/qrcode` 1.5.6): koda QR (SVG za prikaz, PNG za prenos) v brskalniku.
- **`barcode-detector` 3.2.3** (MIT, `zxing-wasm` 3.1.6): polyfill `BarcodeDetector`; `zxing_reader.wasm` se gosti
  lokalno (`?url`, precache PWA), ne s CDN (konstitucija VI).

## Posledice
Večji sveženj frontenda le ob odprtju okna za branje kode (dinamični uvoz). Zavrnjeno: Apache POI (velikost, pretekle
ranljivosti), SheetJS (licenca), `html5-qrcode`/`jsQR` (slabše branje), ročni razčlenjevalnik vCard na zaledju.
