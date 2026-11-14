# Quickstart: Arhiviranje in izbris skupine (003)

## Predpogoji

- Docker (Compose v2), JDK 21+, Node.js ≥ 22.22; funkcionalnost 002 (skupine) je združena.

## Zagon

```bash
docker compose up --build        # vmesnik na http://localhost:8080
```

Druge vloge in trajno arhivirano skupino (nastane šele z 012) pripraviš neposredno v bazi:

```sql
INSERT INTO group_member (group_id, user_id, role) VALUES ('<uuid skupine>', <app_user.id>, 'EDITOR');
-- trajno arhivirana: arhiviraj in odstrani lastnika
UPDATE contact_group SET archived_at = now() WHERE id = '<uuid skupine>';
DELETE FROM group_member WHERE group_id = '<uuid skupine>' AND role = 'OWNER';
```

## Preverjanje

```bash
./verify.sh quick   # unit BE/FE, funkcionalni FE (seznam arhiviranih, pasica, upravljanje, dialoga)
./verify.sh full    # + integracijski in varnostni BE (matrika izolacije), E2E arhiviranje.spec.ts (360/768/1280 px)
```

## Ročni scenariji

| # | Koraki | Pričakovano | FR |
|---|---|---|---|
| 1 | Lastnik: *Nastavitve → Upravljanje skupine → Arhiviraj skupino* | dialog »Arhiviram skupino …?«, fokus na *Prekliči* | FR-003-01 |
| 2 | V dialogu *Arhiviraj skupino* | obvestilo »Skupina je arhivirana.«, pasica pod glavo, oznaka *Arhivirano*, obrazec podatkov izgine | FR-003-01, -04, -05 |
| 3 | Odpri `/` in stranski pas | skupine ni med razdelki; povezava *Arhivirane skupine* | FR-003-02 |
| 4 | *Arhivirane skupine* | vrstica s skupino in vlogo, oznaka *Arhivirano* | FR-003-07 |
| 5 | Kot urednik odpri arhivirano skupino | pasica brez *Odarhiviraj skupino* | FR-003-05 |
| 6 | Kot lastnik *Odarhiviraj skupino* (pasica) | obvestilo, skupina nazaj v razdelku *Lastnik* | FR-003-06 |
| 7 | Lastnik z več člani: *Upravljanje skupine* | brez *Izbriši skupino*, razlaga »Skupino lahko izbrišeš, ko si njen edini član.« | FR-003-10 |
| 8 | Edini član: *Izbriši skupino* → napačen naslov | napaka ob polju, skupina ostane | FR-003-10 |
| 9 | … natančen naslov → *Izbriši skupino* | preusmeritev na `/`, obvestilo; stara povezava »Te strani ni« | FR-003-09, -11 |
| 10 | Trajno arhivirana skupina (SQL zgoraj) | pasica »…trajno arhivirana…«, brez odarhiviranja, na seznamu »lastnik: izbrisan uporabnik« | FR-003-08 |
| 11 | Ročni preizkus s tipkovnico in bralnikom zaslona (design.md §10) | dialoga ujameta fokus, Esc zapre, imena kontrol prebrana pravilno | SC-006 |

Endpointi in oblike odgovorov: [contracts/openapi.yaml](contracts/openapi.yaml); podatki: [data-model.md](data-model.md).
