# Quickstart: preverjanje 014

1. `./verify.sh quick`, nato `./verify.sh backend` (migracija V11, uvoz, vCard, CardDAV, matrika izolacije) in `./verify.sh e2e`.
2. Ročno (compose, urednik in bralec v isti skupini):
   - **Excel**: izvozi 3 kontakte (010) → *Uvozi → Iz Excela* v prazni skupini → preslikava samodejna → predogled brez napak → *Uvozi 3 kontakte* → sled ima en vnos *Uvoz*; ponoven uvoz iste datoteke: vse vrstice *Preskoči*.
   - Datoteka z »Kongo« in »Atlantida« v stolpcu *Država*: potrditev onemogočena, dokler obe vrednosti nista razrešeni.
   - **vCard**: izberi 3 kontakte → *Izvozi v vCard (.vcf)*; datoteko odpri v aplikaciji Imenik (iOS), Google Contacts in Thunderbird: ime, e-naslov, telefon, naslov, podjetje v pravih poljih, značke kot kategorije. Uvozi jo v drugo skupino in primerjaj kontakte.
   - **Koda QR**: pogled kontakta → *Deli s kodo QR* → poskeniraj s kamero iOS in Android (ponudi dodajanje kontakta); *Prenesi sliko* → v drugi skupini *Dodaj s kodo QR* → *Izberi sliko* → predizpolnjen obrazec. Z zavrnjenim dostopom do kamere se pokaže izbira slike; po zaprtju okna je indikator kamere ugasnjen.
3. **CardDAV** (zahteva HTTPS na javnem naslovu za iOS; za DAVx5 zadošča `http://` v lokalnem omrežju):
   - *Moj račun → Gesla za aplikacijo → Novo geslo* (»Telefon«), kopiraj geslo.
   - **DAVx5** (Android): *Prijava z URL in uporabniškim imenom* → `https://‹strežnik›/` (odkrije `/.well-known/carddav`), e-naslov, geslo → izberi imenike → sinhroniziraj.
   - **iOS/macOS**: *Nastavitve → Stiki → Računi → Dodaj račun → Drugo → Dodaj račun CardDAV* → strežnik `‹strežnik›`, e-naslov, geslo.
   - **Thunderbird**: *Imenik → Nov → Dodaj imenik CardDAV* → `https://‹strežnik›/dav/`, e-naslov, geslo.
   - Preveri: vidne so natanko skupine uporabnika (tudi arhivirane); sprememba kontakta v aplikaciji je vidna po naslednji sinhronizaciji; urejanje v odjemalcu je zavrnjeno; po preklicu gesla odjemalec javi napako prijave.
   - Ukazna vrstica: `curl -u ‹e-naslov›:‹geslo› -X PROPFIND -H "Depth: 1" https://‹strežnik›/dav/addressbooks/` → `207`.
