# Quickstart: preverjanje 015

1. `./verify.sh quick`, nato `./verify.sh backend` in `./verify.sh e2e`.
2. Ročno (compose, trije uporabniki: lastnik, urednik, bralec; en nekdanji član in en izbrisan račun):
   - Sled: izberi izvajalca (člana, nekdanjega člana, »izbrisan uporabnik«); kombiniraj z vrsto dejanja in kontaktom; naslov poti ohrani filter.
   - Kontakt → *Zgodovina kontakta*: časovnica z izvajalcem, časom, vrsto in polji; razkrij polja; odpri *Ogled stanja* in *Primerjaj*.
   - Obnova (urednik): *Obnovi to različico* → predogled sprememb → potrdi; v sledi nov vnos »obnovil(a) kontakt …«, drugi kontakti nespremenjeni; bralec gumba nima.
   - Izbris kontakta → *Izbrisani kontakti*: poišči po imenu, filter *Obnovljivi*, *Obnovi* (opozorilo o enakem e-naslovu); z združevanjem odstranjen kontakt kaže razlago brez *Obnovi*.
   - Sočasnost: dva zavihka, obnova in urejanje istega kontakta → drugi dobi »Kontakt se je medtem spremenil.«
   - Rollback skupine (admin) še vedno deluje in upošteva vnose obnove.
3. Matrika izolacije in sočasnost: `AuditHistoryIsolationMatrixSecurityIT`, `RestoreConcurrencyIT`.
4. Merilo časa: `./verify.sh backend` vključuje `HistoryPerformanceIT` (SC-003, SC-007).
