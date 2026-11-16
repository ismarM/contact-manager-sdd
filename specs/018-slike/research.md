# Research: Slike (018)

Odločitve v obliki: odločitev · razlog · zavrnjene alternative.

## R-01 Shramba
**Odločitev**: PostgreSQL, tabeli `image` (metapodatki) in `image_variant` (`bytea`), za vmesnikom `ImageStore` (`put`, `get`, `delete`, `reassign`). **Razlog**: izolacija skupin in brisanje sta transakcijska (tuji ključi, `ON DELETE CASCADE`), varnostne kopije so ena, brez nove storitve v Composeu in testih; slike so po obdelavi majhne (3–80 KB). **Zavrnjeno**: Firebase Storage (po vedenju avtorja zahteva plačljiv plan – pred uporabo preveriti pri Googlu; lastna pravila varnosti podvajajo našo avtorizacijo), S3/MinIO (nov servis, sinhronizacija brisanja s skupinami), lokalni disk (varnostne kopije, več primerkov). Prehod: implementacija `ImageStore` za S3 in enkratna kopija; API in vmesnik se ne spremenita.

## R-02 Obdelava slik in WebP
**Odločitev**: samo `javax.imageio`. Strežnik sprejme JPEG in PNG (preveri magične bajte, nato bralnik za ta zapis), izhod JPEG kakovosti 0,85, PNG samo pri prosojnosti. WebP razreši brskalnik: obrezovalnik sliko vedno nariše na `<canvas>` in izvozi JPEG (PNG pri prosojnem viru), zato brskalnik prebere tudi WebP. **Razlog**: Java ImageIO nima WebP bralnika ne pisalca; knjižnice za WebP so izvorne (JNI) ali zunanje in v alpine JRE tvegane. **Zavrnjeno**: `webp-imageio` / TwelveMonkeys (nova odvisnost, izvorna koda), izhod WebP.

## R-03 Preverjanje vsebine in poraba pomnilnika
1. Branje telesa z mejo 5 MB + 1 bajt (več = `FILE_TOO_LARGE`), pred tem meja `max-file-size` v Springu.
2. Magični bajti: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`; sicer `INVALID_IMAGE`. Tip, ki ga pošlje brskalnik, in končnica se ne uporabita.
3. `ImageReader` za zaznani zapis; širina in višina iz **glave** (`reader.getWidth/getHeight`) pred dekodiranjem; > 4096 na stranico ali > 16,8 Mpx = `IMAGE_TOO_LARGE`.
4. Dekodiranje z `setSourceSubsampling` tako, da daljša stranica ne preseže 2048 točk (največ ~16 MB na dekodiranje), v semaforju z 2 dovoljenjema in čakanjem do 5 s (sicer `429 RATE_LIMITED`). `ImageIO.setUseCache(false)`: brez začasnih datotek.
5. Vsak izjemni primer dekodiranja (poškodovana, okrnjena, CMYK, nepodprt zapis) = `INVALID_IMAGE`; nič ni zapisano.
6. SVG, GIF, WebP, ICO, PDF: zavrnjeni z magičnimi bajti, zato ni izvedbe skriptov ali zunanjih virov.
**Omejitev, ki se izve ob testu**: v `eclipse-temurin:21-jre-alpine` mora ImageIO delovati brez sistemskih knjižnic za pisave; pokrije jo E2E z JPEG in PNG v pravem vsebniku (prva naloga implementacije).

## R-04 Orientacija in metapodatki
**Odločitev**: ImageIO orientacije EXIF ne upošteva. Razčlenjevalnik `ExifOrientation` prebere samo oznako 0x0112 iz segmenta APP1 prvih 64 KB JPEG-a (obe vrstni redi bajtov; vse neveljavno = 1); strežnik sliko ustrezno obrne/prezrcali. Ker se slika **ponovno kodira** iz `BufferedImage`, metapodatkov (EXIF, GPS, ICC, komentarji, XMP) izhod ne vsebuje; izvirnik se ne hrani. Obrezovalnik v brskalniku že uporabi orientacijo iz EXIF (`createImageBitmap` z `imageOrientation: 'from-image'`), strežnik pa jo ponovi za neposredne klice API. **Zavrnjeno**: `metadata-extractor` (nova odvisnost za eno oznako).

## R-05 Prikaz zasebnih slik v Reactu
`<img src="/api/…">` ne more poslati glave `Authorization`; piškotkov Firebase ne uporablja. Možnosti: (a) podpisani URL – naslov postane dovoljenje, zavrnjeno (zahteva 5); (b) piškotek – nova površina CSRF; (c) **prenos z `authFetchBlob` in `URL.createObjectURL`**. **Odločitev (c)**:
- Hook `useProtectedImage(path, revision, size)` prenese sliko z ID žetonom, odjemalec jo hrani v pomnilniku po ključu `pot + revision` (LRU 200 vnosov, `revokeObjectURL` ob izrivu), prikazuje se samo ob vidnosti (`IntersectionObserver`).
- Odgovor strežnika: `Cache-Control: private, no-cache`, `ETag` (`"<revision>-<size>"`), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, `Content-Disposition: inline`. `no-cache` pomeni, da brskalnik pred uporabo vedno vpraša strežnik (preverjanje članstva), `304` je poceni.
- `?v=revision` v naslovu je samo ključ predpomnilnika, strežnik ga prezre; brez prijave in članstva je odgovor vedno `401`/`404`.
- Service worker ne predpomni `/api` (obstoječa konfiguracija PWA, konstitucija IV). Če bo kdaj dodana CSP, mora vsebovati `img-src 'self' blob:`.
- Brez slike (`photoRevision == null`) vmesnik zahtevka sploh ne pošlje.

## R-06 Slika Google računa in SSRF
Naslov **ne prihaja od odjemalca**: `POST /api/me/photo/google` nima telesa; strežnik prebere `picture` iz že preverjenega `Jwt` trenutne zahteve. Obramba po plasteh (`UrlGuard`, `GooglePhotoSource`):
1. shema `https`, brez uporabniških podatkov v naslovu, vrata 443, gostitelj ujema `^lh[0-9]+\.googleusercontent\.com$` (nastavljivo `images.google.allowed-hosts`);
2. razrešitev DNS in zavrnitev vsakega naslova: zanke, lokalnega, zasebnega (10/8, 172.16/12, 192.168/16, fc00::/7), link-local (169.254/16, vključno z metapodatki oblaka), CGNAT (100.64/10), večpredvajanja, `0.0.0.0`;
3. `HttpClient` brez sledenja preusmeritvam (3xx = napaka), z overjanjem strežniškega potrdila za gostitelja (preprečuje DNS rebinding na notranji naslov, ker napadalec ne more predložiti veljavnega potrdila za `googleusercontent.com`);
4. povezovalni čas 3 s, celoten zahtevek 5 s, branje toka z mejo 5 MB, `Content-Type` `image/jpeg` ali `image/png`;
5. telo gre skozi isti `ImageProcessor` (R-03, R-04);
6. pri naslovih z `=sNN-c` se velikost nadomesti z `=s512-c`.
Napaka katerekoli plasti = `409 GOOGLE_PHOTO_UNAVAILABLE`, nič shranjeno, razlog samo v dnevniku brez naslova. Emulator in prijava z e-naslovom nimata `picture`: gumb se ne izriše (vmesnik uporabi samo boolean iz Firebase uporabnika, naslova ne nalaga). **Testi**: `UrlGuard` enotno (tabela naslovov), IT z nadomestnim virom (brez omrežja).

## R-07 Slike kontakta, sled, obnova (Q5)
- Tabela `image` za kontakt nima tujega ključa na `contact` (kot `audit_change`): kontakt je lahko izbrisan in obnovljen z istim id. Pripada skupini (`group_id`, `ON DELETE CASCADE`).
- **Sprožilec `AFTER DELETE ON contact`** označi sliko kot odklopljeno (`detached_at = now()`), **`AFTER INSERT ON contact`** jo ponovno priklopi (`detached_at = NULL`). Pokrije izbris (tudi množični), rollback, obnovo kontakta in izbris skupine brez sprememb obstoječe kode. Vsi trije poti vedno uporabljajo `contact`, zato ni pozabljenih vej.
- Sprememba slike: ena transakcija = zamenjava vrstice, `contact.version + 1`, vnos `UPDATE` v sledi z `photo_change` (`ADDED`/`REPLACED`/`REMOVED`) in nespremenjenim stanjem polj. Obstoječa primerjava posnetkov (015) zato obnovo in rollback na tak vnos obravnava kot »ni sprememb« (`RESTORE_NO_CHANGES`, `ROLLBACK_NO_CHANGES`), trenutna slika se ne spremeni.
- Odklopljene slike hrani sistem, dokler obstaja skupina (kot besedilni podatki v sledi 005; ločenega »trajnega izbrisa« kontakta ni). Ob izbrisu skupine kaskada odstrani vse.
- Združevanje: en klic v `DuplicateService.merge` pred izbrisom izgubljenih kontaktov (ista transakcija): če preživeli nima slike, prevzame sliko prvega izgubljenega, ki jo ima (po starosti); slike ostalih se izbrišejo.

## R-08 Izvoz in izbris računa (012)
`image` ima `user_id … ON DELETE CASCADE`, zato je izbris računa že pokrit (preveri IT). Izvoz *Moji podatki*: polje `photo` s `contentType` in `base64` različice 512.

## R-09 Omejevanje zlorab
Ni obstoječega omejevanja hitrosti; zadostuje `UploadRateLimiter` v pomnilniku (drsno okno 10 na minuto na uporabnika, vključno z Google prevzemom). Enoprimerkovna omejitev je navedena kot predpostavka; pri več primerkih bi bila potrebna skupna shramba.

## R-10 nginx
`/api/` ima `client_max_body_size 2m`; strežnik dovoljuje 5 MB. Dodajo se tri lokacije za poti nalaganja (6 MB). Obrezovalnik v brskalniku pošlje ≤ 1024 točk (~100–300 KB), zato običajno nalaganje velja že pod 2 MB.

## R-11 UX (obrezovanje, avatar)
- Obrezovalnik: dialog (design.md 8.10), `<canvas>` z okroglim (uporabnik, kontakt) ali kvadratnim (skupina) okvirjem; premik s povleko in puščicami, povečava z drsnikom in `+`/`−`; tipkovnica popolna; `aria-live` za napredek; gumba *Shrani sliko* in *Prekliči*; napake trajno z *Poskusi znova* (8.13).
- Avatar brez slike: začetnice (največ 2) v barvi iz osmih barv skupine (4.2, samo besedilo in rob 1 px na ozadju `surface`), da ostane kontrast AA; barva po id-ju (uporabnik, kontakt) ali barva skupine. Velikosti: 24, 32, 40, 64, 128 px.
- Prenova dizajna: ena komponenta `Avatar` z lastnostjo `size`, vse uporabe prek nje.
