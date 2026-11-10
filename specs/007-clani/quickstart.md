# Quickstart: Upravljanje članov skupine (007)

## Predpogoji

- Docker (Compose v2), JDK 21+, Node.js ≥ 22.22; funkcionalnosti 001–006 so združene.
- Štirje uporabniki Auth Emulatorja (npr. »Pia Kos« – lastnica, »Ana Novak«, »Boštjan Zupan«, »Cene Kralj«), vsi vsaj enkrat prijavljeni.
  Člani z različnimi vlogami nastanejo s povabili (006) ali neposredno v bazi.

## Zagon

```bash
docker compose up --build        # vmesnik na http://localhost:8080
```

Stanja, ki jih vmesnik (še) ne ustvari, pripraviš v bazi:

```sql
INSERT INTO group_member (group_id, user_id, role) VALUES ('<uuid skupine>', <app_user.id>, 'ADMIN');
UPDATE contact_group SET archived_at = now() WHERE id = '<uuid skupine>';                    -- arhivirana (003)
DELETE FROM group_member WHERE group_id = '<uuid>' AND role = 'OWNER';                        -- + archived_at: trajno arhivirana (012)
```

## Preverjanje

```bash
./verify.sh quick   # unit BE (MemberRulesTest, MemberInputParserTest), FE funkcionalni z MSW in axe
./verify.sh full    # + integracijski, varnostni in sočasnostni BE, E2E clani.spec.ts (360/768/1280 px)
```

## Ročni scenariji

| # | Koraki | Pričakovano | FR |
|---|---|---|---|
| 1 | Bralec: *Nastavitve* → *Člani* | vsi člani po vlogi in imenu, »(ti)« pri sebi, brez menijev | FR-007-01, -02 |
| 2 | Pia: *Spremeni vlogo* na bralcu → *Admin* → potrdi | fokus na *Prekliči*; »Vloga člana … je spremenjena v Admin.« | FR-007-03 |
| 3 | Admin: meni samo ob urednikih in bralcih; poskusi *Admin* | dialog ponuja samo *Urednik*, *Bralec* | FR-007-02, -03 |
| 4 | Dva zavihka: Pia in admin odpreta dialog za istega urednika; admin ga zniža, Pia potrdi | opozorilo s kdo/kdaj, *Uporabi trenutno različico* / *Shrani moje spremembe* | FR-007-04 |
| 5 | Admin: *Odstrani iz skupine* → *Odstrani člana*; odstranjeni osveži | seznam brez njega; odstranjeni: stran »Te strani ni« | FR-007-05 |
| 6 | Urednik: *Zapusti skupino* → potrdi | seznam skupin z »Zapustil(a) si skupino …« | FR-007-06 |
| 7 | Lastnik: *Nastavitve* | namesto *Zapusti skupino* razlaga o prenosu | FR-007-07 |
| 8 | Trajno arhivirana skupina z enim članom | razlaga namesto *Zapusti skupino*; z dvema članoma eden lahko odide | FR-007-08 |
| 9 | Pia: *Prenesi lastništvo* → član → napačen naslov → pravilen naslov | napaka ob polju; nato Ana je lastnica, Pia admin | FR-007-09 |
| 10 | Arhivirana skupina: lastnik/admin | akcij ni; strežnik vrne 409 `GROUP_ARCHIVED` | FR-007-10, -11 |
| 11 | Revizijska sled po vseh operacijah; odstranjen urednik, ki je urejal kontakte | brez novih vnosov; stari vnosi z njegovim imenom | FR-007-12 |
| 12 | Tipkovnica, bralnik zaslona (design.md §10), 320 px | meni dejanj in dialogi ujamejo fokus, Esc zapre; brez vodoravnega drsenja | SC-006 |

Endpointi: [contracts/openapi.yaml](contracts/openapi.yaml) · podatki: [data-model.md](data-model.md) · odločitve: [research.md](research.md).
