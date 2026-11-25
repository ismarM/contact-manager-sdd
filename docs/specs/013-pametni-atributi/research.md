# Research: Pametni atributi in značke

## R-01 Skladnost odločitve Q1 (država = koda ISO) z modelom in uvozom 014

- **Odločitev**: stolpec `contact.country text` s `CHECK (country ~ '^[A-Z]{2}$')`; veljavnost kode (uradno dodeljena) preveri aplikacija po seznamu JDK `Locale.getISOCountries()` (249 kod; `XK` ni uradna koda ISO in ni na seznamu).
- **Skladnost z modelom**: stolpec je nullable, brez privzete vrednosti: obstoječe vrstice ostanejo `NULL`. Posnetki sledi so jsonb (`ContactState`): manjkajoči polji se berejo kot `null`, zato stari vnosi in rollback delujejo brez migracije posnetkov. Iskanje, ujemanje dvojnikov in razvrščanje ne uporabljajo države, zato druge poizvedbe ostanejo nespremenjene.
- **Skladnost s 014**: uvoz bere besedilo iz Excela in ga preslika z isto Java enoto `CountryNames.resolve` (FR-013-19): `Slovenija`, `Slovenia`, `SI`, `SVN` → `SI`; delno ujemanje in neznano ni nikoli samodejno (dvoumno z kandidati ali neprepoznano), zato 014 lahko zahteva uporabnikovo odločitev na predogledu. Ker je enota javna, 014 ne potrebuje nove odvisnosti in ne podvaja pravil.
- **Zavrnjeno**: prosto besedilo (uvoz bi prepisoval različne zapise; filter po državi bi bil nezanesljiv); lastna tabela držav (vzdrževanje, brez koristi za 013).

## R-02 Imena držav

- Backend: `new Locale("", code).getDisplayCountry(Locale.forLanguageTag("sl"|"en"))` (CLDR v JDK 21) za izvoz, iskanje in prepoznavanje.
- Frontend: statični seznam 249 kod (`countries.ts`) in `Intl.DisplayNames([lang], {type: 'region'})` za prikaz; deluje brez omrežja (FR-013-17). Test zagotovi, da ima vsaka koda ime v sl in en in da je število kod 249 (enako kot IT zaledja).
- Možna razlika v besedilu imena med JDK in brskalnikom (npr. različica CLDR) vpliva samo na iskanje po prostem besedilu v hitrem iskanju; izbirnik držav v obrazcu in filtru pošilja kodo, zato je izid enak.

## R-03 Iskanje po državi (FR-013-03)

- `CountryNames.matching(text)` vrne kode, katerih koda je enaka besedilu ali katerih ime v sl ali en vsebuje besedilo (brez razlike velikosti črk in strešic). Hitro iskanje doda za vsako besedo `OR c.country = ANY(:codes)`; filter `f=country:<besedilo>` uporabi isti `matching`. Prazna množica kod ne ujame nič.

## R-04 Predlogi: en endpoint

- `GET …/suggestions?type=…` vrne `{items:[{text,count}]}`, največ 10, fiksno. Ujemanje `q`: `strpos(x COLLATE search_fold, :q)` (V8, brez razlike velikosti črk in strešic); vrstni red: predpona (`strpos = 1`) pred ujemanjem v sredini, nato `count` padajoče, nato besedilo. Brez `q`: samo po `count`.
- `type=key`: ključi iz `contact_attribute` po `key_norm` (število kontaktov), izpis v kanonični obliki; rezervirana imena (vseh 15) so izločena. `type=value`: zahteva `key` (manjka → `400 REQUIRED` na `key`), vrednosti tega `key_norm`; neznan ključ → prazen seznam. `type=company`: vrednosti `company`. `type=tag`: iz `contact_tag` (kanonična oblika, število kontaktov). `type=country`: kode po številu (`q` se ne uporablja; neprazen `q` → `400 INVALID_VALUE`). `q` do 100 znakov (`TOO_LONG`).
- Pravica EDITOR, arhivirana skupina dovoljena (kot `/tags` doslej); brez `contactId` in brez drugih podatkov kontakta (FR-013-16).
- Obstoječi indeks `contact_attribute_key (key_norm, contact_id)` in `contact_tag_norm` zadoščata; zmogljivost se preveri z IT na 10.000 kontaktih (SC-003). Dodatni indeksi samo, če meritev pade pod cilj.

## R-05 Kanonizacija (FR-013-10)

- Kanonična oblika za `key_norm`/`tag_norm` v skupini: različica z največ kontakti; pri enakem številu različica najstarejšega kontakta (`created_at`, `id`). Ena poizvedba za množico normaliziranih imen.
- Pri pisanju (ustvarjanje, urejanje, množično urejanje, združevanje): vsak ključ/značka, ki ni dobesedno že shranjen pri tem kontaktu (pri združevanju: pri kateremkoli vključenem), se zamenja s kanonično, če za njegov normaliziran zapis ta obstaja. Nespremenjen zapis ostane. Rollback in uvoz iz sledi ne kanonizirata.
- Sočasna dva zapisa istega novega ključa lahko ustvarita dve različici (brez zaklepa); dopustno, naslednji zapisi uporabijo kanonično.
- Kanonizacija teče **po** preverjanju pravil (RESERVED_KEY, DUPLICATE v kontaktu); po njej dve vnosni vrstici s ključema, ki se razlikujeta po velikosti, še vedno javita `DUPLICATE` (parser ju že loči pred kanonizacijo).

## R-06 Rezervirana imena in obstoječi atributi (Q2)

- `ContactInputParser.RESERVED_KEYS` (11 imen) ostane za predefinirana polja, ki so že bila rezervirana in jih obstoječi podatki ne smejo imeti. Novi štirje (`država`, `country`, `podjetje`, `company`) se preverjajo v storitvi (`AttributeKeys`), ker potrebujejo stanje kontakta: nov ali spremenjen ključ → `RESERVED_KEY`; ključ, ki ga kontakt že ima (po normalizaciji), je dovoljen. Pri združevanju je dovoljen ključ, ki ga ima kateri koli vključeni kontakt. Pri množičnem urejanju (`BulkInputParser`, ki pozna vrednost vrstice) je nastavitev z rezerviranim imenom in neprazno vrednostjo zavrnjena (`RESERVED_KEY`, tudi pri kontaktu, ki atribut že ima; popravilo starega atributa gre prek obrazca), prazna vrednost (odstranitev) je dovoljena; preverba je tam, ne v storitvi.
- Vrstni red preverjanj ostane (§2.2): pri `PUT` se `RESERVED_KEY` javi šele po koraku 5 (verzija), skupaj z drugimi napakami 400.
- Prenos v polje (FR-013-20) je v celoti vmesnik (stanje obrazca) + `POST /api/countries/resolve`; strežnik ne dobi novega pisalnega endpointa, prenos je navaden `PUT`.

## R-07 Prepoznavanje države (FR-013-19)

- `CountryNames.resolve(text)`: normalizacija (NFD brez kombinirnih znakov, male črke, strnjeni presledki, obrez). Natanko eno ujemanje s kodo alpha-2, alpha-3, imenom sl/en ali alias → `FOUND(code)`. Alias: kratek zaprt seznam v kodi (UK, USA, Czech Republic, Macedonia, Severna Makedonija, Holland …). Sicer ujemanja kot vsebovanje (≥ 3 znaki) → `AMBIGUOUS(candidates ≤ 10)`, tudi če je kandidat en sam (brez samodejne popravke tipkarskih napak); brez ujemanja → `UNKNOWN`.
- `POST /api/countries/resolve` sprejme do 50 vrednosti in vrne izid na vrednost; ne bere skupine.

## R-08 Frontend

- `SuggestInput` (kombinirano polje po ARIA 1.2, razširjen vzorec iz `TagInput`): predlogi ob fokusu in vpisu (zamik 150 ms, `AbortController`, napaka se ne pokaže), izbira s puščicama/Enter, `Esc`. Uporabljen za ključ, vrednost, podjetje (in značke prek `TagInput`, ki ga uporablja za predloge).
- Kanonični prikaz: ob zapustitvi polja ključa in ob dodajanju značke vmesnik zamenja vpis z predlogom iste normalizirane oblike.
- `CountryField`: izbirni seznam (combobox brez prostega besedila) nad `countries.ts`, najprej države iz `type=country`; iskanje po imenu (v jeziku vmesnika) in kodi.
- Filter in množično urejanje uporabljata `CountryField`; sled in primerjava prikazujeta ime iz kode (`countryName(code, lang)`).
- Prenos (FR-013-20): v `AttributeFields` pri obstoječem atributu z rezerviranim imenom opomba in gumb; podjetje: neposredno ali pogovorno okno za konflikt; država: klic `resolve`, nato polje s predizpolnitvijo ali izbiro iz kandidatov.

## R-09 Obstoječi testi, ki se spremenijo (v opis PR)

- Test predlogov značk (`ContactTagSuggestionsIT`, `ContactTags.test.tsx`, MSW za `/tags`) preide na `GET …/suggestions?type=tag`.
- Testi izvoza (glave in indeksi stolpcev), sledi (`ChangeDiff`), primerjave dvojnikov in `ContactState` dobijo novi polji.
- Nobena trditev se ne oslabi; spremembe so dodatki ali sledijo premiku endpointa.
