# Gesla za aplikacijo in strežnik CardDAV samo za branje (014)

- **Datum:** 2026-11-15
- **Avtor:** razvijalec (Clarifications Q3, posvet `/rollout`), specs/014-uvoz-izvoz/research.md R-08, R-09
- **Nadomešča:** –

## Kontekst
Odjemalci CardDAV (iOS, DAVx5, Thunderbird) ne podpirajo prijave z Googlom, ki je edini način prijave v aplikacijo.
Za CardDAV je potreben nov tip klicatelja in nov način prijave.

## Odločitev
- Contact Manager je strežnik CardDAV pod `/dav/` (ročna izvedba na Spring MVC), vsaka skupina uporabnika je imenik
  **samo za branje**; vsako pisanje vrne `403`.
- Ločena veriga Spring Security (`@Order(1)`, `/dav/**`, `/.well-known/carddav`): stateless, brez CSRF, samo HTTP
  Basic z e-naslovom računa in **geslom za aplikacijo**; Firebase JWT na teh poteh ne velja, Basic na `/api` ne velja.
- Geslo: 28 naključnih znakov base32 (140 bit), prikazano enkrat; hrani se samo SHA-256 (primerjava v konstantnem
  času), največ 10 na uporabnika, preklic izbriše vrstico, izbris računa vsa gesla.
- Zaklep: 10 zaporednih neuspehov v 15 minutah zaklene prijavo CardDAV za 15 minut (stanje v bazi `dav_login_state`).
- **HTTPS:** Basic pošilja geslo v vsakem zahtevku, zato je CardDAV v produkciji dosegljiv samo prek HTTPS (TLS pred
  nginx). Strežnik HTTP sam ne zavrača (lokalni compose teče brez TLS) – odločitev razvijalca.

## Posledice
Nov tip poverilnice v podatkovnem modelu (V11) in v izvozu »moji podatki«. Zavrnjeno: knjižnica WebDAV (licenca,
teža), bcrypt (počasno ob vsakem zahtevku sinhronizacije), stanje zaklepa v pomnilniku.
