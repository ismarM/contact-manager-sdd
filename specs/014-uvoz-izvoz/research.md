# Research: Uvoz in izvoz kontaktov (Excel, vCard, koda QR, CardDAV)

Različice nove odvisnosti so preverjene 2026-11-15 (vse starejše od dveh tednov). Vsaka nova knjižnica dobi zapis v `docs/decisions/` (naloga v `tasks.md`).

## R-01 Branje Excela: `org.dhatim:fastexcel-reader` 0.20.2

- **Odločitev**: obstoječa odvisnost (doslej `test`, za preverjanje izvoza 010) preide v `compile`; ista različica kot pisalnik `fastexcel` (en `${fastexcel.version}`). Pretočni bralnik (StAX), majhna poraba pomnilnika, brez Apache POI.
- **Zaščita (ni vgrajena)**: pred branjem `XlsxGuard` pregleda arhiv z `ZipInputStream`: največ 500 vnosov, vsota dejansko razširjenih bajtov ≤ 100 MB (štetje med branjem, ne zaupa glavi), razmerje stiskanja posameznega vnosa ≤ 100 : 1 nad 1 MB. Nato branje samo prvega lista: največ 10 001 vrstic (glava + 10 000), največ 16 384 stolpcev (enako kot izvoz 010, `ExportService.MAX_COLUMNS`), prekinitev ob preseganju. Velikost nalaganja 10 MB (`spring.servlet.multipart.max-file-size`); kršitve → `400 VALIDATION_FAILED` s kodo na polju `file` (`FILE_TOO_LARGE`, `TOO_MANY_ROWS`, `NOT_XLSX`, `NO_HEADER`).
- **Vrednosti**: celica se bere kot prikazano besedilo, ki ga hrani datoteka (`Cell.getText()` / `getRawValue()` za niz); formula se ne izračuna, uporabi se shranjena vrednost; brez shranjene vrednosti je celica prazna. Števila brez izgube (`41123456`, ne `4.1123456E7`); datum ostane v zapisu datoteke (serijsko število → ISO `YYYY-MM-DD`, če je celica oblikovana kot datum).
- **FR-014-06**: en vodilni `'` se odstrani, če mu sledi `=`, `+`, `-`, `@`, tabulator ali CR (obratno od `CellText` 010); vse ostalo dobesedno.
- **Zavrnjeno**: Apache POI (velik, več CVE v preteklosti, večja poraba pomnilnika); branje v brskalniku (SheetJS – licenca in velikost svežnja, pravila glav bi se podvojila).

## R-02 vCard: `com.googlecode.ez-vcard:ez-vcard` 0.12.1

- **Odločitev**: branje 2.1/3.0/4.0 (vključno `QUOTED-PRINTABLE`, `CHARSET=`, zložene vrstice) in pisanje 3.0. Licenca BSD-2. Knjižnica je stabilna, zadnja izdaja 2023-08 (0.12.1); brez znanih ranljivosti; vzdrževanje je redko, zato je uporaba zaprta v dva razreda (`VcardReader`, `VcardWriter` v paketu `contact.vcard`), ki ju je mogoče zamenjati.
- **Odvisnosti**: izključeni opcijski `com.fasterxml.jackson.core:jackson-core` (jCard) in `org.jsoup:jsoup` (hCard) v `pom.xml` (`<exclusions>`); uporabljamo samo besedilni zapis.
- **Zavrnjeno**: `ical4j-vcard` (manj zrel, več odvisnosti); ročni razčlenjevalnik na zaledju (kodiranja 2.1 in zlaganje vrstic so pogost vir napak).

## R-03 Preslikava kontakt ↔ vCard 3.0 (FR-014-11, -12, -13)

| Kontakt | vCard 3.0 (izvoz) | Uvoz (2.1–4.0) |
|---|---|---|
| ime, priimek | `N:priimek;ime;;;` in `FN:ime priimek` | `N`; brez `N` iz `FN` (zadnja beseda = priimek) |
| naslov + država | `ADR;TYPE=WORK;X-CM-CC=AT:;;‹naslov›;;;;‹ime države›` (naslov v ulici, `\n` ohranjen) | prednostni (`PREF`/`TYPE=pref`), sicer prvi `ADR`: ulica, kraj, poštna št. in regija v *Naslov* (vrstice); država iz `X-CM-CC` (veljavna koda), sicer `CountryNames.resolve` (predogled); naslednji `ADR` → `Naslov 2` … |
| e-naslov | `EMAIL;TYPE=INTERNET:` | prednostni, sicer prvi; ostali `E-naslov 2` … |
| telefon | `TEL;TYPE=VOICE:` | prednostni, sicer prvi; ostali `Telefon 2` … |
| podjetje | `ORG:` | prva komponenta `ORG` |
| značke | `CATEGORIES:a,b` | vse `CATEGORIES`; presledki → `-` |
| dodatni atribut | `attrN.X-CM-KEY:‹ključ›` + `attrN.X-CM-VALUE:‹vrednost›` (skupina vCard drži par) | par po skupini; drugi programi lastnosti `X-` prezrejo |
| — | `UID:urn:uuid:‹id›`, `REV:‹updated_at›` (samo CardDAV in datoteka) | prezrto |
| — | — | `BDAY`, `URL`, `NOTE` → `Rojstni dan`/`Birthday`, `Spletna stran`/`Website`, `Opomba`/`Note` po jeziku vmesnika; `PHOTO` in drugo se ne uvozi |

- Ime države v `ADR` je v jeziku zahtevka (datoteka: jezik vmesnika; CardDAV: shranjeni jezik uporabnika, privzeto `sl`), da ga prikažejo aplikacije imenikov; `X-CM-CC` zagotovi točen krožni prenos (FR-014-12).
- Isto preslikavo uporabljajo datoteka `.vcf`, CardDAV (zaledje) in koda QR (frontend, R-06). **Skupne testne vizitke** so v eni mapi `backend/src/test/resources/vcard/` in jih berejo testi obeh strani: `cases/*.vcf` z `*.json` (pričakovan kandidat) za oba bralnika; `contact-full.json` s pričakovanim izpisom vsakega pisalnika (`written-backend.vcf`, `written-frontend.vcf`); vsaka stran preveri, da njen pisalnik da svoj vzorec in da njen bralnik iz vzorca druge strani vrne `contact-full.json` (krožna pot čez obe izvedbi).

## R-04 Potek uvoza: razčleni → predogled → potrdi (FR-014-02 … -09)

- **Razčlenitev** (`POST …/imports/parse`, multipart): datoteka se prebere v pomnilniku in zavrže (ne hrani se). Excel vrne glave, predlagano preslikavo (glave 010 v sl in en, `ExportLabels`, brez razlike velikosti črk; rezervirano ime → predlog predefiniranega polja) in vrstice kot nize (prazne vrstice izpuščene, številka vrstice v datoteki ohranjena), opozorilo, če ima datoteka več listov. vCard vrne že preslikane kandidate (R-03).
- **Predogled** (`POST …/imports/preview`, JSON kandidatov): zaledje za vsakega kandidata vrne napake po poljih (`ContactInputParser`, pravila 004/013), kanonične ključe in značke (`CanonicalForms`, FR-014-07), prepoznavo države po različnih vrednostih (`CountryNames.resolve`: FOUND / AMBIGUOUS + kandidati / UNKNOWN) in možne dvojnike (`DuplicateKeys` 011 proti obstoječim kontaktom skupine in med vrsticami datoteke; prva vrstica je navadna). Preslikava stolpcev se uporabi v brskalniku (`mapping.ts`), zato sprememba preslikave pošlje le nov predogled, ne nove datoteke.
- **Potrditev** (`POST …/imports`): brskalnik pošlje samo vrstice za ustvarjanje (veljavne, ne preskočene, države razrešene v kode). Zaledje **nikoli ne zaupa izidu predogleda**: znova izvede celotno preverjanje – pravila 004/013 (`ContactInputParser`), država samo kot veljavna koda ISO ali prazna (besedilo države se zavrne z `INVALID_VALUE`), rezervirana imena (`AttributeKeys`), meje (1–10 000 kontaktov, dolžine, 50 atributov, 30 značk), arhiv skupine pod zaklepom; vsaka neveljavna vrstica → `400 VALIDATION_FAILED` s polji `contacts[i].‹polje›`, nič ne nastane. Nato kanonizira (FR-014-07), v **eni transakciji** ustvari kontakte (paketni vstavki) in en vnos sledi `IMPORT` s spremembami *po* za vsak kontakt (`contact_count = N`). Dvojnikov ne preverja znova (uporabnik je izbral *Ustvari*). Rollback (005) obravnava `IMPORT` kot vsak vnos z množico sprememb.
- **Arhivirana skupina**: vsi trije koraki so del pisanja → `409 GROUP_ARCHIVED` (vrstni red feature-map §2.2); potrditev to preveri znova v transakciji (zaklep vrstice skupine kot pri 009).
- **Meje**: datoteka 10 MB; kandidatov 10 000 na zahtevek (predogled in potrditev); telo JSON do 25 MB (nginx, R-09).
- **Zavrnjeno**: stanje predogleda na strežniku (seja ali tabela – brisanje, varnost, več strežnikov); celotna razčlenitev v brskalniku (pravila 004/013 in dvojniki bi se podvojili).

## R-05 Izvoz vCard (FR-014-10)

- `POST …/contacts/export/vcard` uporabi `ExportRequestParser` in `ExportService.prepare` (izbor, vrstni red, izpuščeni, `EXPORT_EMPTY`, meja, `404` za tuj id) – enaka pravila kot 010; odgovor `text/vcard; charset=utf-8`, glave `X-Export-Count`, `X-Export-Skipped`, `Content-Disposition: attachment`, `Cache-Control: no-store`. Ime datoteke sestavi frontend (`exportFileName.ts`, pravilo FR-010-10, končnica `.vcf`).
- `GET …/contacts/{contactId}/vcard?language=sl|en` za en kontakt (VIEWER, arhivirana dovoljena).

## R-06 Koda QR na frontendu: `qrcode` 1.5.4 (MIT) in `@types/qrcode` 1.5.6

- Vizitko za kodo sestavi brskalnik (`qr/vcardWrite.ts`, ista preslikava kot R-03) iz že naloženega kontakta – deluje brez povezave (Edge Cases). Koda: `QRCode.toCanvas`/`toDataURL`, popravljanje napak `M`, največ različica 25 (≈ 990 bajtov UTF-8, zanesljivo branje z zaslona in papirja). Če ne gre: izpusti dodatne atribute, nato značke, nato naslov (FR-014-16); ime, priimek, e-naslov, telefon, podjetje, država vedno. Prenos PNG: `toDataURL` → `‹ime-priimek›-qr.png`. Brez `X-CM-*` v kodi ni potrebe po krožnem prenosu atributov, vendar so vključeni, kadar gredo.
- Koda je slika z `role="img"` in `aria-label` (besedilna alternativa iz prevodov). Barve kode: žetona za besedilo in ozadje (`design.md`), vedno temno na svetlem tudi v temni temi (berljivost).
- **Zavrnjeno**: generiranje na strežniku (ne deluje brez povezave); `qrcode.react` (dodatna ovojnica brez koristi).

## R-07 Branje kode QR: `barcode-detector` 3.2.3 (polyfill `BarcodeDetector`, `zxing-wasm` 3.1.6)

- Uporabi se izvorni `BarcodeDetector`, kjer obstaja, sicer polyfill (`barcode-detector/ponyfill`). Datoteka `zxing_reader.wasm` se gosti lokalno: uvoz `zxing-wasm/reader/zxing_reader.wasm?url` (Vite) in `setZXingModuleOverrides({ locateFile })`; v `vite.config.ts` `globPatterns` dobi `wasm` (precache, deluje brez povezave) – **brez jsDelivr** (konstitucija VI). Modul se naloži leno (dinamični `import()`) šele ob odprtju okna.
- Kamera: `getUserMedia({ video: { facingMode: 'environment' } })` takoj ob odprtju okna – odprtje sproži dotik *Dodaj s kodo QR*, kar zadošča zahtevi iOS po uporabnikovem dejanju (FR-014-17: brskalnik zaprosi za dostop ob izbiri akcije); `<video playsinline muted autoplay>` (iOS); zanka `detect()` na ~ 250 ms; po prvi kodi s kontaktom, ob zaprtju okna ali odhodu s strani se vsi `MediaStreamTrack` ustavijo (`stop()`, FR-014-20). Napaka ali zavrnitev → besedilo in *Izberi sliko*. Slika: `<input type="file" accept="image/png,image/jpeg">`, ≤ 10 MB, `createImageBitmap` → `detect()`; nič se ne pošlje na strežnik.
- Vsebina: vCard 2.1–4.0 (`qr/vcardRead.ts`: zlaganje vrstic, `QUOTED-PRINTABLE`, `CHARSET`, ubežni znaki) ali MECARD (`qr/mecard.ts`: `MECARD:N:Kos,Ana;TEL:…;EMAIL:…;ADR:…;ORG:…;NOTE:…;;`, ubežni `\`) → kandidat po R-03 → obrazec 004 predizpolnjen; država prek `countries.ts` (natančno ujemanje = izbrana, sicer predlog). Več kod s kontakti → sporočilo »več kod« (Edge Cases).
- **Zavrnjeno**: `html5-qrcode`/`jsQR` (slabše branje, neaktivno vzdrževanje); nalaganje WASM s CDN.

## R-08 CardDAV: ročna izvedba na Spring MVC (FR-014-22 … -24)

- **Poti**: `/.well-known/carddav` → `301 /dav/`; `/dav/` (koren), `/dav/principals/me/` (principal), `/dav/addressbooks/` (addressbook-home-set), `/dav/addressbooks/{groupId}/` (imenik), `/dav/addressbooks/{groupId}/{contactId}.vcf` (vizitka).
- **Metode**: `OPTIONS` (`DAV: 1, 3, addressbook`, `Allow`), `PROPFIND` (Depth 0/1; `infinity` → `403` s `propfind-finite-depth`), `REPORT` (`addressbook-multiget`, `addressbook-query` – filtri se ne uporabijo, vrne vse z zahtevanimi lastnostmi, `sync-collection`), `GET`/`HEAD` (vizitka, `ETag`, `If-None-Match` → `304`). `PUT`, `DELETE`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `POST` → `403` (`DAV:need-privileges`) po preverjanju prijave in vidnosti vira (FR-014-24).
- **Lastnosti**: `current-user-principal`, `principal-URL`, `addressbook-home-set`, `displayname` (naslov skupine), `resourcetype` (`collection` + `CARD:addressbook`), `getctag` (CalendarServer), `sync-token`, `supported-report-set`, `current-user-privilege-set` (samo `read`), `supported-address-data` (3.0), `getetag`, `getcontenttype` (`text/vcard; charset=utf-8`), `address-data`. Neznane lastnosti → `404` v `propstat`.
- **Žetoni**: vizitka vsebuje ime države v jeziku uporabnika, zato je jezik del vseh žetonov. `sync-token` = `urn:contactmanager:sync:‹jezik›:‹audit_head.last_seq›` (0 brez sledi); žeton z drugim jezikom je neveljaven (odjemalec ponovi polno sinhronizacijo). `getctag` = `‹jezik›-‹last_seq›-‹contact_group.version›` – spremeni se tudi ob spremembi naslova skupine (`displayname`). Spremembe od žetona: `audit_change` ⨝ `audit_entry` za skupino s `seq > n` → za vsak `contact_id`: obstaja → spremenjen (`getetag`), ne obstaja → `404` v odgovoru (izbrisan). Neveljaven ali prihodnji žeton → `403` `valid-sync-token`. Ker vsaka sprememba kontaktov ustvari vnos sledi (feature-map §2.7) in je sled nespremenljiva, nova tabela ni potrebna.
- **ETag**: `"‹version›-‹updated_at v ms›-‹jezik›"` (obnovljen kontakt z istim id po rollbacku dobi nov `updated_at`; sprememba jezika uporabnika spremeni vse ETag).
- **Indeksi**: spremembe od žetona berejo `audit_entry` po `(group_id, seq)` – obstoječi indeks `audit_entry_group_seq (group_id, seq DESC)` – in `audit_change` po `entry_id` – predpona primarnega ključa `(entry_id, position)`; nov indeks v migraciji 014 (V12) ni potreben.
- **Usmerjanje**: krmilnik `@RequestMapping({"/dav", "/dav/**"})` brez omejitve metode (`FrameworkServlet` posreduje tudi nestandardne metode); `StrictHttpFirewall` (Spring Security) privzeto zavrne `PROPFIND`/`REPORT`/… → `WebSecurityCustomizer` doda te metode na seznam dovoljenih.
- **XML**: `DocumentBuilderFactory` z izklopljenimi DTD in zunanjimi entitetami (`disallow-doctype-decl`, `FEATURE_SECURE_PROCESSING`, `XMLConstants.ACCESS_EXTERNAL_*=""`), telo do 1 MB; odgovor `207 Multi-Status` z `StAX` pisalnikom.
- **Združljivost**: DAVx5 (Android), iOS/macOS Contacts in Thunderbird (CardBook / vgrajeni) – postopki v `quickstart.md`. iOS pri ročni nastavitvi zahteva HTTPS na vratih 443 in sledi `/.well-known/carddav`.
- **Revizijska sled**: branje se ne beleži (FR-014-27).
- **Zavrnjeno**: knjižnica (Milton – AGPL/komercialno in težka; SabreDAV je PHP); CardDAV prek obstoječega `/api` (Firebase JWT ni na voljo odjemalcem).

## R-09 Prijava CardDAV in gesla za aplikacijo (FR-014-21, -25, -26)

- **Varnostna veriga**: ločen `SecurityFilterChain` z `@Order(1)` in `securityMatcher("/dav/**", "/.well-known/carddav")`: stateless, CSRF izklopljen, brez `oauth2ResourceServer` (Firebase JWT na tej poti ni veljaven → `401`), lasten `AppPasswordAuthenticationProvider` za HTTP Basic, `401` z `WWW-Authenticate: Basic realm="Contact Manager", charset="UTF-8"`. `/.well-known/carddav` je dovoljen brez prijave (samo preusmeritev). Obstoječa veriga `/api/**` ostane nespremenjena.
- **Geslo**: 28 naključnih znakov iz abecede base32 brez dvoumnih znakov (`SecureRandom`, 140 bit), prikazano v skupinah po 4 z `-`; ob prijavi se odstranijo `-` in presledki, črke se pretvorijo v male. Hrani se `SHA-256` normaliziranega gesla (`bytea`, 32 B) – visoka entropija naredi počasno zgoščevanje nepotrebno; preverjanje primerja z vsemi (≤ 10) gesli uporabnika z `MessageDigest.isEqual` (konstanten čas). Uporabniško ime = e-naslov računa (brez razlike velikosti črk, `app_user_email_lower_key`).
- **Prenos**: HTTP Basic pošilja geslo v vsakem zahtevku, zato je v produkciji CardDAV dosegljiv samo prek HTTPS (TLS pred nginx; navedeno v zapisu odločitve in navodilu FR-014-27). Strežnik HTTP ne zavrača sam, ker lokalni compose teče brez TLS; geslo velja samo za branje CardDAV in ga je mogoče kadarkoli preklicati.
- **Zadnja uporaba**: `last_used_at` se posodobi ob uspešni prijavi, največ enkrat na minuto na geslo (manj pisanja pri množici zahtevkov sinhronizacije).
- **Zaklep (FR-014-26)**: tabela `dav_login_state` po uporabniku: `failed_count`, `window_started_at`, `locked_until`. Neuspeh: če je okno starejše od 15 min, se začne novo; 10. neuspeh v oknu nastavi `locked_until = now + 15 min`. Med zaklepom vsak poskus → `401` brez preverjanja gesla. Uspeh ponastavi števec. Neobstoječ e-naslov → `401` brez stanja; izračuna se SHA-256 in primerja z lažno vrednostjo, da čas odgovora ne razkrije obstoja računa. Spletna prijava (Firebase) se ne dotika tega stanja.
- **Preklic**: izbris vrstice (preklicano geslo ne obstaja več → `401`). Izbris računa: `ON DELETE CASCADE` iz `app_user`. Izvoz »moji podatki« (012): `appPasswords: [{name, createdAt, lastUsedAt}]`.
- **Zavrnjeno**: bcrypt/argon2 (počasno ob vsakem zahtevku sinhronizacije, entropija že zadošča); Bucket4j za zaklep (nova odvisnost, stanje v pomnilniku ne preživi ponovnega zagona).

## R-10 Infrastruktura (zunaj paketov funkcionalnosti)

- `frontend/nginx.conf`: `location /dav/` in `location = /.well-known/carddav` → zaledje (z `proxy_set_header Host` in `X-Forwarded-Proto`); `location ~ ^/api/groups/[^/]+/imports` z `client_max_body_size 25m` (ostali `/api/` ostanejo 2 MB).
- `frontend/vite.config.ts`: `navigateFallbackDenylist` dobi `/^\/dav\//` in `/^\/\.well-known\//`; `globPatterns` dobi `wasm`.
- `application.yml`: `spring.servlet.multipart.max-file-size: 10MB`, `max-request-size: 11MB`; `MaxUploadSizeExceededException` → `400 VALIDATION_FAILED` (`file: FILE_TOO_LARGE`).
