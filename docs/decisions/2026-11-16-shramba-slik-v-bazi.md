# Shramba slik v PostgreSQL za vmesnikom `ImageStore`

- **Datum:** 2026-11-16
- **Avtor:** Ismar (potrditev plana 018), izvedba Claude
- **Nadomešča:** –

## Kontekst
Funkcionalnost 018 uvaja tri vrste slik (profil, skupina, kontakt). Slike so po obdelavi majhne (96, 256 in 512 točk, 3–80 KB skupaj), pripadajo skupini ali uporabniku in jih je treba skupaj z lastnikom tudi trajno izbrisati (izbris skupine, računa, združitev dvojnikov). Odločiti je bilo treba, kje jih hraniti.

## Odločitev
Slike so v PostgreSQL: tabeli `image` (metapodatki, `revision`, lastnik) in `image_variant` (`bytea` po velikosti), ena slika na lastnika (delni `UNIQUE` indeksi). Aplikacija jih vedno bere in piše prek vmesnika `ImageStore` (`put`, `get`, `revision`, `delete`, `contactRevisions`, `mergeInto`, `reassign`); samo `PostgresImageStore` pozna SQL. Slika kontakta nima tujega ključa na `contact` (kontakt je lahko izbrisan in obnovljen z istim id): sprožilca `AFTER DELETE/INSERT` na `contact` nastavita in odstranita `detached_at`. Tuji ključi z `ON DELETE CASCADE` izbrišejo slike ob izbrisu skupine ali računa. Migracija: `V15__slike.sql` (začasna številka, glej plan 018, naloga T093).

Pogodba vmesnika je preverjena z nizom `ImageStoreContract`, ki ga prestaneta PostgreSQL (`ImageStoreIT`) in pomnilniška implementacija (`ImageStorePortabilityTest`); druga shramba mora prestati isti niz.

## Posledice
- Transakcijsko brisanje, ena varnostna kopija in brez nove storitve v Composeu in testih; API, vmesnik in podatki skupin so neodvisni od shrambe.
- Zavrnjeno: Firebase Storage (po avtorjevem vedenju plačljiv plan, preveriti pri Googlu; pravila varnosti bi podvajala avtorizacijo), S3/MinIO (nova storitev in usklajevanje brisanja s skupinami), lokalni disk (varnostne kopije, več primerkov).
- **Prehod na S3 (ali drugo shrambo):** (1) nova implementacija `ImageStore` (ključ `slike/<kind>/<lastnik>/<velikost>`, `revision` v metapodatkih ali v tabeli `image`, ki ostane); (2) pogodbeni testi `ImageStoreContract` morajo biti zeleni; (3) enkratna kopija iz `image_variant` v novo shrambo, nato preklop `@Primary` implementacije; (4) brisanje ob izbrisu skupine in računa, ki ga zdaj opravijo tuji ključi, je treba nadomestiti z izrecnim klicem `delete` (kaskada v shrambi ne obstaja); (5) API, `ETag` (`<revision>-<velikost>`) in vmesnik se ne spremenijo.
- Omejitev nalaganj (`UploadRateLimiter`) je v pomnilniku enega primerka; pri več primerkih je potrebna skupna shramba (predpostavka v research R-09).
