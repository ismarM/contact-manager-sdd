# Quickstart: Povabila v skupino (006)

## Predpogoji

- Docker (Compose v2), JDK 21+, Node.js ≥ 22.22; funkcionalnosti 001–005 so združene.
- Dva uporabnika Auth Emulatorja (npr. »Pia Kos« – lastnica, »Ana Novak« – povabljena); oba se vsaj enkrat prijavita (povabiti je mogoče
  samo registriranega uporabnika).

## Zagon

```bash
docker compose up --build        # vmesnik na http://localhost:8080
```

Stanja, ki jih vmesnik (še) ne ustvari, pripraviš neposredno v bazi:

```sql
-- admin v skupini (sicer nastane s sprejemom povabila)
INSERT INTO group_member (group_id, user_id, role) VALUES ('<uuid skupine>', <app_user.id>, 'ADMIN');
-- arhivirana skupina (003)
UPDATE contact_group SET archived_at = now() WHERE id = '<uuid skupine>';
-- izbrisan povabitelj (učinek 012 na povabilo)
UPDATE invitation SET inviter_id = NULL WHERE id = '<uuid povabila>';
```

## Preverjanje

```bash
./verify.sh quick   # unit BE (InvitationInputParserTest), FE funkcionalni z MSW in axe
./verify.sh full    # + integracijski in varnostni BE (matrika izolacije, sočasnost, revizijska sled), E2E povabila.spec.ts (360/768/1280 px)
```

## Ročni scenariji

| # | Koraki | Pričakovano | FR |
|---|---|---|---|
| 1 | Pia (lastnica): *Nastavitve* skupine | razdelka *Povabi člana* (vloge *Admin*, *Urednik*, *Bralec*) in *Čakajoča povabila* | FR-006-01, -13 |
| 2 | Pošlji povabilo na ` Ana@Primer.si `, *Urednik* | »Povabilo je poslano.«, obrazec prazen, vrstica v *Čakajočih povabilih* | FR-006-02, -04 |
| 3 | Znova povabi Ano; povabi sebe; povabi neregistriran e-naslov | napake ob polju (že ima povabilo; sebe ne moreš; ni registriran) | FR-006-03 |
| 4 | Ana: zgornja vrstica | »Povabila (1)«, bralnik prebere »Povabila, 1 novo« | FR-006-06 |
| 5 | Ana: *Povabila* | jeziček in naslov skupine, »Povabil(a): Pia Kos«, »Urednik«, datum | FR-006-05 |
| 6 | Ana: *Sprejmi povabilo* → *Odpri skupino* | obvestilo s povezavo; skupina v razdelku *Urednik*; število izgine | FR-006-08 |
| 7 | Pia: novo povabilo z vlogo *Admin*; tretjega uporabnika (Boštjan) dodaj v SQL kot admina; Boštjan odpre *Nastavitve* | pri povabilu z vlogo *Admin* ni *Umakni povabilo* | FR-006-14 |
| 8 | Pia: *Umakni povabilo* → potrdi | dialog s fokusom na *Prekliči*; »Povabilo je umaknjeno.«; povabljeni ga ne vidi več | FR-006-14, -15 |
| 9 | Pošlji povabilo, nato arhiviraj skupino (003); povabljeni odpre *Povabila* | oznaka *Arhivirano* z razlago; sprejem uspe, skupina v *Arhiviranih skupinah* | FR-006-07, -09 |
| 10 | Povabljeni: *Zavrni* → *Zavrni povabilo* | »Povabilo je zavrnjeno.«; povabila ni več | FR-006-10 |
| 11 | Povabilo odpri v dveh zavihkih; v prvem sprejmi, v drugem zavrni | drugi zavihek: »Povabilo ni več na voljo.«, seznam osvežen | FR-006-11 |
| 12 | Ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10), 320 px | dialoga ujameta fokus, Esc zapre; imena gumbov vsebujejo skupino oz. e-naslov; brez vodoravnega drsenja | SC-006 |

Endpointi in oblike odgovorov: [contracts/openapi.yaml](contracts/openapi.yaml); podatki: [data-model.md](data-model.md); odločitve: [research.md](research.md).
