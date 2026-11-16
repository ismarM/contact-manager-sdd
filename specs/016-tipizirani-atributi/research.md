# Research: Tipizirani atributi, normalizacija in zemljevid naslovov

## R-01 Tip ključa v skupini (FR-016-01, -05)

- **Odločitev:** nova tabela `attribute_key (group_id, key_norm, type, version)`; tip atributa se pri branju izpelje iz nje (stik prek `contact.group_id`). V13 vstavi vrstico `OTHER`/verzija 0 za vsak obstoječ ključ v skupini (kontakti se ne dotaknejo).
- **Življenjski cikel:** vrstica je »prosta«, če je noben kontakt skupine ne uporablja (ključ ni na seznamu, ob ponovni uporabi se tip izbere znova: vrstica se prepiše, `version + 1`). Vrstice se ne brišejo (ne motijo; brisanje bi zahtevalo zaklepe ob vsakem izbrisu kontakta).
- **Pisanje kontakta** (obrazec, množično, uvoz, združevanje, obnova): za vse ključe zahtevka v urejenem vrstnem redu (`key_norm`) `INSERT … ON CONFLICT DO NOTHING`, nato `SELECT … FOR SHARE`; ključ v uporabi z drugim tipom → `400 INVALID_VALUE` na `attributes[i].type`; prost ključ dobi poslani tip (privzeto `OTHER`). `type` v zahtevku je neobvezen: manjka → tip obstoječega ključa oz. `OTHER` (obstoječi odjemalci in testi ostanejo veljavni).
- **Sprememba tipa** (`POST …/attribute-keys/change-type`): `SELECT … FOR UPDATE` vrstice ključa, primerjava `version` (sicer `409 VERSION_CONFLICT`), zaklep vseh kontaktov s tem ključem (`FOR UPDATE`, urejeno po id), preverba in normalizacija vseh vrednosti (R-02…R-07, telefon po državi posameznega kontakta), ob neveljavnih `409 ATTRIBUTE_TYPE_CONFLICT` s seznamom (do 100 kontaktov + skupno število), sicer posodobitev vrednosti, `contact.version + 1`, ključ `version + 1`, en vnos sledi `ATTRIBUTE_TYPE`. Arhiv se preveri pod zaklepom skupine (kot 009).
- **Sočasnost:** urejanje kontakta drži `FOR SHARE` na ključu, sprememba tipa `FOR UPDATE` → serializirano. Če zmaga sprememba tipa, urejanje pade na verziji kontakta (`409 VERSION_CONFLICT`); če zmaga urejanje, sprememba tipa preveri že posodobljene vrednosti (verzija ključa se z urejanjem ne spremeni). Dva sočasna nova ključa z različnima tipoma: drugi dobi `400 INVALID_VALUE` (spec Edge Cases).
- **Zavrnjeno:** tip v vsaki vrstici `contact_attribute` (nevarnost razhajanja, ni točke za zaklep in verzijo); brisanje prostih vrstic.

## R-02 Telefon (FR-016-08, Edge Cases)

- **Knjižnica:** `com.googlecode.libphonenumber:libphonenumber` **9.0.42** (2026-10-23, Apache-2.0, brez odvisnosti).
- **Postopek:** obrez → odcep pripone z `(?i)\s*(?:int\.?|interna|ext\.?|x|#|;ext=)\s*(\d{1,9})$` → preostanek mora ustrezati `^[0-9+\-()/. ]+$` (črke se ne pretvarjajo v števke) → `00` na začetku = `+` → `parse(…, regija)` z regijo = država kontakta, sicer `SI` → `isValidNumber` → kanonično `E164` + `;ext=NNN`. Kratke številke (`ShortNumberInfo.isValidShortNumberForRegion`): shranijo se kot števke (`112`). Sicer `INVALID_VALUE`. Največ 30 znakov (meja predefiniranega polja velja tudi za atribut).
- **Stare vrednosti:** nespremenjena vrednost (enaka shranjeni) se ne preverja in ne normalizira (FR-016-09) – primerjava s trenutno vrednostjo v `ContactService` pred normalizacijo.
- **Dvojniki (011):** ključ kategorije *Telefon* = kanonična oblika; stara vrednost se normalizira samo za primerjavo (neuspeh → dosedanji ključ iz števk).
- **Frontend:** `libphonenumber-js` **1.13.15** (2026-10-08, MIT), metapodatki `max`, nalaganje z `import()` v poljih in prikazu; samo prikaz po shemi in opozorilo ob zapustitvi polja – odloča strežnik.

## R-03 E-naslov, spletni naslov, datum, opombe (FR-016-02, -07, -08)

- **E-naslov:** obstoječi vzorec `ContactInputParser.EMAIL`, do 254; kanonično: obrez, del za `@` z `toLowerCase(Locale.ROOT)`. Iskanje in dvojniki že primerjajo brez razlike velikosti črk.
- **Spletni naslov:** brez sheme → `https://`; `java.net.URI`; shema samo `http`/`https` (sicer `INVALID_VALUE`, tudi `javascript:`); gostitelj obvezen, s piko, `IDN.toASCII` mora uspeti; shema in gostitelj v malih črkah, gostitelj shranjen v Unicode (`IDN.toUnicode`, berljiv prikaz šumnikov), pot nespremenjena; do 500.
- **Datum:** `LocalDate.parse` (strogo, `uuuu-MM-dd`, leta 0001–9999); API sprejema in vrača samo to obliko.
- **Opombe:** vrednost se ne obreže; 1–500 kodnih točk, vsaj en nepresledni znak; prikaz `white-space: pre-wrap`, brez samodejnih povezav.
- **Drugo:** dosedanje vedenje 004 (obrez, 1–500).
- **Sprememba tipa v *Drugo*/*Opombe*:** vedno uspe, vrednost ostane; iz *Naslov*: razčlenjen naslov → besedilo po pravilih države (R-04), daljše od 500 → konflikt za ta kontakt.

## R-04 Strukturiran naslov (FR-016-12, -14, -15)

- **Shramba:** `jsonb` z deli `street, extra, postalCode, city, region, country` (prazni deli izpuščeni) v `contact.address_parts` in `contact_attribute.parts`. Nerazčlenjen naslov ostane besedilo v `contact.address` oz. `contact_attribute.value`. Natanko eno od obeh (CHECK).
- **API:** predefinirano polje `address` (besedilo, nerazčlenjeno) in `addressParts` (objekt); atribut `value` ali `parts`. API še sprejme besedilo `address` (združljivost 004/014 in obstoječih testov, uvoz); obrazec novega nerazčlenjenega naslova ne pošlje (*Razčleni naslov* ga zamenja z deli).
- **Normalizacija:** obrez in strnitev presledkov v vsakem delu, poštna številka z velikimi črkami, država koda ISO (013 `CountryNames`); obvezen `street` ali `city`; meje 200/200/20/100/100.
- **Oblika po pravilih države:** tabela `fmt` za države iz podatkov Google libaddressinput (Apache-2.0; npr. `SI` `%A%n%Z %C`, `US` `%A%n%C, %S %Z`, privzeto `%A%n%Z %C`), ena datoteka JSON v zaledju (`resources/address-formats.json`) in kopija v frontendu; test FE preveri enakost. Zaledje jo potrebuje za Excel in pretvorbo naslova v besedilo, frontend za prikaz. Brez nove knjižnice.
- **Razčleni naslov (FE):** najprej predlogi samodokončanja za celotno besedilo (R-08), sicer preprosta razčlenitev (vrstica z `^\S{3,10}\s+\S` → poštna številka in kraj, prva vrstica → ulica, ostalo → dodatna vrstica).

## R-05 Prikazne sheme (FR-016-16 … -19)

- **Shramba:** stolpci `app_user.phone_format` (`INTERNATIONAL|NATIONAL|E164`), `date_format` (`LOCALE|ISO|LONG`), `address_format` (`COUNTRY|SINGLE_LINE`), `NULL` = privzeto; neznana vrednost se ob branju prebere kot privzeta.
- **API:** `PUT /api/me/preferences` in `PUT /api/me` sprejmeta neobvezna polja `phoneFormat`, `dateFormat`, `addressFormat` (manjka = nespremenjeno; `null` = privzeto; neveljavna vrednost `400 INVALID_VALUE`); `language`/`theme` ostaneta obvezna. Naprava: kopija v `localStorage` kot jezik in tema (001), ob prvi prijavi `COALESCE` (profil ima prednost). Izvoz 012 (`MyData.preferences`) jih vsebuje, izbris računa jih izbriše z vrstico.
- **Frontend:** kontekst `DisplayFormats` (iz profila, takoj po izbiri) in čisti oblikovalniki `formatPhone`, `formatDate`, `formatAddress`; vsi prikazi (seznam, pogled, dvojniki, sled, zgodovina, zemljevid) gredo prek njih. *Po jeziku vmesnika* = `Intl.DateTimeFormat(locale, {day:'numeric', month:'numeric', year:'numeric'})`, *Dolga oblika* = `dateStyle: 'long'`.

## R-06 Iskanje (FR-016-10, SC-002)

- Prosto besedilo (`q`) poleg dosedanjih stolpcev:
  - telefon (predefiniran in atributi tipa `PHONE`): števke iskane besede (vsaj 3) brez vodilnih `00` oz. ene vodilne `0` kot podniz `regexp_replace(phone, '\D', '', 'g')` – »041 123« → `41123` ⊂ `38641123456`;
  - e-naslov in naslovi (deli `jsonb`, besedilo starih) z `search_fold` kot doslej; država naslova po kodi in imenih sl/en (`CountryNames.matching`);
  - atributi tipov `EMAIL`, `PHONE`, `ADDRESS` (stik z `attribute_key`).
- Brez novih indeksov: 10 000 kontaktov je zaporedni pregled v ms; meri se v IT z 10 000 kontakti.

## R-07 Revizijska sled, rollback, obnova (FR-016-04, -26)

- `Attribute` v `ContactState` (jsonb) dobi `type` in `parts`; star posnetek brez `type` → `OTHER`, besedilo naslova → nerazčlenjeno. `ChangeDiff` primerja tip, vrednost in dele; sprememba tipa se pokaže kot sprememba atributa s tipom prej/potem.
- Nova vrsta vnosa `ATTRIBUTE_TYPE` (CHECK v V13) s stolpci `attribute_key`, `type_before`, `type_after` v `audit_entry`; spremembe = vsi prizadeti kontakti (`contact_count = N`). Filter sledi dobi vrednost *Sprememba tipa atributa*.
- **Rollback:** po obnovi stanj iz posnetkov se tipi ključev obnovljenih kontaktov nastavijo iz posnetkov (`version + 1`), brez preverjanja in normalizacije (dobesedno). Ker sprememba tipa zajame vse kontakte s ključem, so obnovljeni posnetki med seboj skladni.
- **Obnova enega kontakta (015):** vrednosti iz posnetka se preverijo proti trenutnemu tipu ključa (neveljavna → `400 VALIDATION_FAILED`, FR-015-12); prost ključ prevzame tip iz posnetka.

## R-08 Kartografski posrednik (FR-016-13, -21 … -23, SC-005, SC-006)

- **Storitve (privzete, nastavljive):** iskanje lokacije **Nominatim** (`nominatim.openstreetmap.org/search`, strukturirana poizvedba za razčlenjen naslov, `q` za nerazčlenjenega, `format=jsonv2&addressdetails=1&limit=1`); samodokončanje **Photon** (`photon.komoot.io/api`, podatki OSM) – pogoji Nominatim samodokončanja ne dovoljujejo (glej vprašanje v plan.md); podlage `tile.openstreetmap.org/{z}/{x}/{y}.png`.
- **Odjemalec:** Spring `RestClient` (JDK `HttpClient`), povezava 2 s, branje 2,5 s; `User-Agent: ContactManager/<različica> (+https://github.com/ismarM/contact-manager-sdd)` – brez osebnega e-naslova; brez piškotkov, `Referer` in podatkov uporabnika. Poslano je samo besedilo naslova (in `accept-language`).
- **Omejevanje (en primerek zaledja, v pomnilniku):** Nominatim globalno 1 zahteva/s (čakanje na žeton ≤ 1 s, sicer 503); Photon globalno 5/s in 2/s na uporabnika (presežek → prazen seznam); podlage 60 na 10 s na uporabnika in 20/s globalno (presežek → 503 za ploščico). Odjemalec: zakasnitev 300 ms med tipkanjem, upošteva se samo zadnji odgovor (`AbortController`).
- **Predpomnilnik (samo v pomnilniku, LRU, nič trajno):** lokacije 1 000 vnosov / 24 h, predlogi 2 000 / 1 h (ključ = normalizirano besedilo + država + jezik), podlage do 50 MB, `max-age` po odgovoru OSM (največ 7 dni). Ponovno odprtje istega naslova ne kliče storitve. Lastni razred `BoundedCache`, brez nove knjižnice.
- **Napake:** časovna omejitev, 5xx, 429, omejitev ali izklop → lokacija `503 MAP_SERVICE_UNAVAILABLE` (nova koda), predlogi `200 []`, ploščica `503`. Nenajden naslov `200 {status: NOT_FOUND}`; zadetek brez hišne številke ali z `place_rank < 26` → `APPROXIMATE`. Besedilo naslova se ne beleži v dnevnik.
- **Testi:** zaledje – nadomestni strežnik `com.sun.net.httpserver.HttpServer` (JDK, brez odvisnosti) v `MapsFakeServer`; FE – MSW samo za naše `/api` (`onUnhandledRequest: 'error'`); E2E – storitev `osm-stub` (Node, `e2e/osm-stub/server.mjs`) v `compose.verify.yaml`, zaledje kaže nanjo; test E2E preveri, da gredo vse zahteve brskalnika na izvor aplikacije (SC-006).

## R-09 Zemljevid v brskalniku (FR-016-20 … -22, -27)

- **Knjižnica:** `leaflet` **1.9.4** (BSD-2), `@types/leaflet` **1.9.22** (dev). CSS in ikone v paketu (Vite), brez CDN.
- **Podlage prek našega strežnika z žetonom:** lastni `GridLayer.createTile` naloži `/api/map-tiles/{z}/{x}/{y}.png` z `authFetch` → `blob:` URL (sproščen ob odstranitvi ploščice).
- **Dostopnost:** zemljevid v dialogu design.md 8.10 (fokus, *Esc*, vrnitev fokusa); vsebnik zemljevida fokusiran, puščice premikajo, `+`/`−` povečujeta (Leaflet keyboard); oznaka `divIcon` z ikono Tabler in barvo iz žetonov; besedilni opis lokacije in naslov v shemi uporabnika ob zemljevidu; pripis »© OpenStreetMap« (pogoj licence ODbL). Povezava *Odpri v zunanji aplikaciji* na `openstreetmap.org` (le navigacija na klik uporabnika, ne zahteva v ozadju).

## R-10 Uvoz, izvoz, vCard (FR-016-24, -25)

- **Uvoz Excel:** cilji preslikave dobijo dele naslova (`address.street` … `address.country`, enako za nov atribut tipa *Naslov*) in izbiro tipa novega ključa; en stolpec v *Naslov* → nerazčlenjen. Predogled in potrditev uporabita isti `ContactInputParser` (tip, normalizacija) – napake vrstic po 014.
- **vCard (uvoz in izvoz):** `ADR` po delih (`;;ulica;kraj;regija;poštna;država`, `X-CM-CC`); nerazčlenjen naslov v delu ulice. Dodatni tipizirani atributi: `attrN.TEL|EMAIL|ADR|URL|BDAY|NOTE` + `attrN.X-ABLabel:‹ključ›` + `attrN.X-CM-KEY:‹ključ›` (krožna pot); *Drugo* kot doslej (`X-CM-KEY`/`X-CM-VALUE`). Neoznačeni dodatni `TEL`/`EMAIL`/`ADR` → `Telefon 2`… s tipom; `BDAY`, `URL`, `NOTE` → ključi 014 s tipi *Datum*, *Spletni naslov*, *Opombe*.
- **Excel izvoz (010):** kanonične vrednosti; naslov en stolpec po pravilih države (R-04).
