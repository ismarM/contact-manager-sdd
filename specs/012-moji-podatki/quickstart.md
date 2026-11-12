# Quickstart: Moji podatki (012)

## Predpogoji

- Docker (Compose v2), JDK 21+, Node.js ≥ 22.22; funkcionalnosti 001–008 so v `main`.
- Trije uporabniki Auth Emulatorja (npr. »Pia Kos«, »Ana Novak«, »Boštjan Zupan«), vsi vsaj enkrat prijavljeni.
- **Pred začetkom dela in pred PR** (R-14): `git fetch && ls backend/src/main/resources/db/migration` – če je `V9__*` že zasedena, se `V9__moji_podatki.sql` preimenuje v naslednjo prosto. **Podatkovnih volumnov se ne briše** (`docker compose down -v` ni dovoljen brez izrecne potrditve): preštevilčeno migracijo preizkusi na ločenem Compose projektu z lastnim volumnom (`docker compose -p contact-manager-012 up --build`) ali s Testcontainers testi.

## Zagon

```bash
docker compose up --build        # vmesnik na http://localhost:8080 (zaledje v načinu emulatorja)
```

Stanja, ki jih vmesnik ne ustvari, pripraviš v bazi (`docker compose exec -T db psql -U contacts contacts`):

```sql
INSERT INTO group_member (group_id, user_id, role) VALUES ('<uuid skupine>', <app_user.id>, 'EDITOR');
UPDATE contact_group SET archived_at = now() WHERE id = '<uuid skupine>';                      -- arhivirana (003)
DELETE FROM group_member WHERE group_id = '<uuid>' AND role = 'OWNER';                          -- + archived_at: trajno arhivirana
SELECT firebase_uid, provider_deleted_at, attempts, last_error FROM deleted_identity;           -- stanje nadgrobnikov
```

## Preverjanje

```bash
./verify.sh quick   # unit BE (npr. ExportAssemblerTest, DeleteAccountInputParserTest, BackoffTest), FE funkcionalni z MSW in axe
./verify.sh full    # + integracijski, varnostni, sočasnostni BE (Testcontainers + Firebase Auth Emulator), E2E moji-podatki.spec.ts (360/768/1280 px)
```

## Ročni scenariji

| # | Koraki | Pričakovano | FR |
|---|---|---|---|
| 1 | *Moj račun* → razdelek *Moji podatki* | razlaga vsebine izvoza in gumb *Prenesi moje podatke (JSON)* | FR-012-01 |
| 2 | Klik na *Prenesi …* (Pia: tri članstva, dve prejeti, ena poslana povabila, ena skupina v lasti) | prenos `moji-podatki-<današnji datum>.json` z vsemi odseki iz [contracts/openapi.yaml](contracts/openapi.yaml), brez kontaktov, sledi in tujih e-naslovov | FR-012-02, -03 |
| 3 | Isto z novim uporabnikom | osebni podatki + štirje prazni seznami | FR-012-02 |
| 4 | Zaustavi zaledje (`docker compose stop backend`), klik *Prenesi …* | datoteke ni; `alert` in *Poskusi znova*; po `start` deluje | FR-012-04 |
| 5 | Pia je lastnica nearhivirane skupine: razdelek *Izbris računa* | seznam skupin s povezavami in navodilo; gumba *Izbriši račun* ni | FR-012-06 |
| 6 | Pia arhivira ali prenese lastništvo vseh skupin; znova odpre *Moj račun* | gumb *Izbriši račun* | FR-012-06 |
| 7 | *Izbriši račun* → napačen e-naslov → *Izbriši račun* v dialogu | napaka ob polju; nič se ne izbriše; *Prekliči* / Esc vrne fokus na gumb | FR-012-07 |
| 8 | Pravilen e-naslov (tudi z drugačnimi velikimi črkami) | odjava, stran za prijavo: »Tvoj račun je izbrisan.« | FR-012-14 |
| 9 | Pia je bila lastnica arhivirane skupine B z dvema članoma in edina članica arhivirane C; drug član odpre B in revizijsko sled | B: »izbrisan uporabnik« kot lastnik, trajno arhivirana, člani nespremenjeni; C ne obstaja; sled kaže »izbrisan uporabnik« | FR-012-09, -12 |
| 10 | Admin je poslal povabilo X pred izbrisom; X odpre povabila | povabilo veljavno, pošiljatelj »izbrisan uporabnik« | FR-012-11 |
| 11 | Dva zavihka: potrdi izbris v obeh | en uspe (204 ali 202), drugi 401 → prijava | FR-012-15 |
| 12 | Druga naprava (drug brskalnik) z isto sejo po izbrisu | prvi zahtevek 401 → prijava | FR-012-15 |
| 13 | Ponovna prijava z istim Google računom | nov prazen račun brez skupin in povabil | FR-012-14 |
| 14 | *Samo lokalni razvojni Compose, ne `verify`/E2E:* izpad Firebase: `docker compose pause auth`, izbris računa (traja do ~7 s), `unpause auth`, počakaj ≤ 1 min | API vrne **202**, vmesnik odjavi in na prijavi pove, da brisanje povezave z Google računom še poteka; po `unpause` se `deleted_identity.provider_deleted_at` nastavi; do takrat prijava istega Google računa: neuspešna (401); potem: nov prazen račun | FR-012-17, -18 |
| 15 | Ponovni zagon med čakanjem: ponovi 14, vendar pred `unpause` naredi `docker compose restart backend` | po zagonu in `unpause` brisanje dokončano brez novega zahtevka | FR-012-18, SC-008 |
| 16 | Čiščenje: `UPDATE deleted_identity SET provider_deleted_at = now() - interval '3 hours'`, počakaj ≤ 30 s (ali `restart backend`) | vrstica odstranjena; vrstica z `provider_deleted_at` 1 h ostane | FR-012-18, SC-009 |
| 17 | Tipkovnica, bralnik zaslona (design.md §10), 320 px | dialog ujame fokus, Esc zapre; brez vodoravnega drsenja | design.md §10 |

## Produkcija – ročna vrata pred združitvijo (ni avtomatski test, R-06)

Emulator in unit testi z lažnim transportom ne dokazujejo produkcijske konfiguracije; zato ta koraka opravi razvijalec na pravem (testnem) Firebase projektu in rezultat zapiše v `traceability.md`:

1. Poverilnice storitvenega računa (vloga *Firebase Authentication Admin*) so **samo** okoljska spremenljivka `GOOGLE_APPLICATION_CREDENTIALS` oziroma mount izven repozitorija (konstitucija VI; gitleaks v pre-commit); `FIREBASE_PROJECT_ID` je isti projekt, ki ga zahteva preverjanje žetonov.
2. Z izbrisom testnega računa mora `deleted_identity.provider_deleted_at` dobiti vrednost, `last_error` mora ostati `NULL`, odgovor je `204`, identiteta v konzoli Firebase pa ne sme več obstajati. `last_error` z `HTTP_401`/`HTTP_403` pomeni napačne poverilnice ali vlogo (odgovor je `202`, v dnevniku `ERROR`).
3. Poskus z začasno neveljavnimi poverilnicami mora dati `202` in `ERROR` brez uhajanja poverilnic ali UID-ja v dnevnik; po popravku poverilnic se vrstica sama dokonča.

Endpointi: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md).
