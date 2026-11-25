# Quickstart: Revizijska sled skupine

Pogoj: Docker (Testcontainers, Firebase Auth Emulator), JDK 21, Node ≥ 22.22. Brez ključev.

## Samodejno preverjanje

```bash
scripts/feature.sh revizijska-sled
./verify.sh quick      # format, lint, tipi, utišanja, unit (ChangeDiffTest) in FE testi (po vsaki nalogi)
./verify.sh full       # + integracijski (Audit*IT), varnostni (AuditIsolationMatrixSecurityIT), E2E revizijska-sled.spec.ts
```

Pričakovano: zelen izpis v eni vrstici; celoten izpis v `.verify/last.log`. Merila SC-003 (rollback 1.000 od 10.000 kontaktov
< 10 s) in SC-005 (prva stran s 100.000 vnosi < 2 s) preverita `AuditRollbackIT` in `AuditReadIT` na Testcontainers.

## Ročni potek (docker compose)

1. `docker compose up --build`, odpri http://localhost:8080 (vrata po `compose.yaml`), prijavi se z emulatorjem kot lastnik.
2. Ustvari skupino in odpri razdelek *Revizijska sled* → »V revizijski sledi še ni vnosov.«; točke *Začetno stanje* ni (FR-005-10, FR-005-20).
3. V *Kontakti* ustvari »Janez Novak«, ga uredi (telefon, atribut `kompetenca` = »web dev«, odstrani značko) in izbriši.
   V sledi so trije vnosi, najnovejši zgoraj: »izbrisal(a) …«, »uredil(a) …«, »dodal(a) kontakt Janez Novak« (FR-005-01, FR-005-07).
4. Pri vnosu urejanja odpri *Podrobnosti* → seznam s kontaktom Janez Novak; ob razkritju kontakta preglednica *Polje · Prej · Potem*
   samo s spremenjenimi polji (FR-005-02, FR-005-08).
5. Shrani kontakt brez spremembe ali z zastarelo verzijo → nov vnos ne nastane (FR-005-01).
6. Filter *Filtri* → *odstranjevanje* → *Uporabi filtre*: samo vnosi izbrisa; osveži stran – filter ostane v naslovu (FR-005-09).
7. Pri najnovejšem vnosu gumba »Povrni skupino na to točko« ni; pri vnosu dodajanja ga izberi → dialog
   »Povrnem skupino na stanje ‹čas›?«, fokus na *Prekliči*; potrdi z *Povrni skupino* → obvestilo, nov vnos *rollback* na vrhu,
   Janez Novak je obnovljen z istim identifikatorjem in oznako *Povrnjeno* (FR-005-11, FR-005-12, FR-005-16, FR-005-19).
8. V pogledu kontakta razkrij *Povrnjeno*: čas T s povezavo na vnos, povezava na vnos rollbacka, izvajalec; zadnja sprememba kaže
   izvajalca in čas iz T. Povezava »Spremembe tega kontakta v revizijski sledi« odpre sled, filtrirano po kontaktu (FR-005-09, FR-005-19).
9. V dveh zavihkih (dva admina) odpri sled; v prvem izvedi rollback, v drugem potrdi rollback → »Revizijska sled se je medtem
   spremenila.« in osvežen seznam (FR-005-14). Enako, če ima drugi zavihek vključen filter po drugem kontaktu (Clarifications).
10. Na zadnji strani nefiltrirane sledi izvedi rollback na *Začetno stanje* → kontakti, ustvarjeni v sledi, so odstranjeni (FR-005-20).
11. Kot urednik ali bralec ter v arhivirani skupini (003) je sled berljiva, gumbov za rollback ni (FR-005-07, FR-005-17).

## Pogodba

REST: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md).
