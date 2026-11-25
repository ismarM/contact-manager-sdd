# Quickstart: preverjanje 013

1. `./verify.sh quick`, nato `./verify.sh backend` in `./verify.sh e2e`.
2. Ročno (compose, dva uporabnika v isti skupini):
   - Nov kontakt: izberi državo »Avs« → Avstrija (`AT`), vpiši podjetje; pogled kaže ime v jeziku vmesnika; preklopi jezik na en.
   - Atribut: v skupini obstaja `Kompetenca`; vpiši `kompetenca` → polje se po zapustitvi popravi v `Kompetenca`; shrani, preveri v pogledu.
   - Vrednosti: izberi ključ `Kompetenca` → predlogi vrednosti; podjetje in značke ob fokusu pokažejo najpogostejše.
   - Prenos: kontakt s starim atributom `Država` = »Slovenija« → *Premakni v polje Država* → `SI`; »Korea« zahteva izbiro.
   - Iskanje: »austria«, »avstrija«, »at« najdejo isti kontakt; filter po državi; izvoz vsebuje *Država* (ime) in *Podjetje*.
   - Sled: razlika države z imenom; rollback jo povrne.
3. Obstoječi podatki: brez migracije (stolpca sta prazna), stari posnetki sledi se berejo.
