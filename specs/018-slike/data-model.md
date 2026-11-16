# Data Model: Slike (018)

Migracija: `V14__slike.sql` (začasna številka; ob združitvi naslednja prosta po `origin/main`, glej plan). Samo naprej.

## `image`

| Stolpec | Tip | Pravila |
|---|---|---|
| `id` | `uuid` PK, `uuidv7()` | |
| `kind` | `text` | `USER`, `GROUP`, `CONTACT` |
| `user_id` | `bigint` | `USER`: `REFERENCES app_user ON DELETE CASCADE` |
| `group_id` | `uuid` | `GROUP`, `CONTACT`: `REFERENCES contact_group ON DELETE CASCADE` |
| `contact_id` | `uuid` | `CONTACT`; **brez tujega ključa** (kontakt je lahko izbrisan in obnovljen) |
| `detached_at` | `timestamptz` | izpolnjeno, dokler kontakt ne obstaja (sprožilca spodaj) |
| `revision` | `bigint` | začne pri 1, +1 ob zamenjavi; osnova za `photoRevision` in `ETag` |
| `created_at` / `updated_at` | `timestamptz` | |

Omejitve: `CHECK` glede na `kind` (obvezna natanko ustrezna stolpca); **ena slika na lastnika**: delni `UNIQUE` indeksi `(user_id) WHERE kind='USER'`, `(group_id) WHERE kind='GROUP'`, `(group_id, contact_id) WHERE kind='CONTACT'`. Zamenjava je `UPDATE` z naraščanjem `revision` in zamenjavo različic v isti transakciji.

## `image_variant`

| Stolpec | Tip | Pravila |
|---|---|---|
| `image_id` | `uuid` | `REFERENCES image ON DELETE CASCADE` |
| `size` | `smallint` | 96, 256, 512 (različica je ≤ stranica vira) |
| `content_type` | `text` | `image/jpeg` ali `image/png` |
| `data` | `bytea` | obdelana slika, brez metapodatkov |

PK `(image_id, size)`. Seznami berejo samo različico 96 (`SELECT … WHERE size = ?`), različice niso v istem branju kot metapodatki.

## `audit_entry` (sprememba)

Nov stolpec `photo_change text NULL CHECK (photo_change IN ('ADDED','REPLACED','REMOVED'))`; izpolnjen samo pri vnosih `UPDATE`, ki jih ustvari sprememba slike kontakta. `audit_change.before/after` vsebujeta polja kontakta kot običajno (brez slike). Nobenih vsebin slik v sledi.

## Sprožilci

```text
contact AFTER DELETE  → UPDATE image SET detached_at = now()
                        WHERE kind='CONTACT' AND group_id = OLD.group_id AND contact_id = OLD.id
contact AFTER INSERT  → UPDATE image SET detached_at = NULL
                        WHERE kind='CONTACT' AND group_id = NEW.group_id AND contact_id = NEW.id
```

## Življenjski cikel

| Dogodek | Posledica za sliko |
|---|---|
| nalaganje / zamenjava | ena vrstica `image`, `revision + 1`, stare različice zamenjane; stara slika ni več dostopna |
| odstranitev | vrstica izbrisana (kaskada na različice) |
| izbris kontakta | odklopljena (ostane); izbrisanega kontakta slika ni dostopna prek API |
| obnova kontakta ali rollback, ki kontakt ustvari | priklopljena, če je shranjena; sicer brez slike |
| obnova stare različice obstoječega kontakta, rollback na vnos brez razlik | slika se ne spremeni |
| združevanje | preživeli ohrani svojo ali prevzame prvo razpoložljivo, ostale izbrisane |
| izbris skupine | kaskada izbriše slike skupine in kontaktov (tudi odklopljene) |
| izbris računa | kaskada izbriše profilno sliko |
| izvoz *Moji podatki* | vsebuje različico 512 lastne slike |

## Validacije (strežnik)

JPEG/PNG po magičnih bajtih; ≤ 5 MB; ≤ 4096 × 4096 in ≤ 16,8 Mpx; dekodiranje z največ 2048 točkami; ≤ 10 nalaganj/min/uporabnika; samo `file` del z eno datoteko.
