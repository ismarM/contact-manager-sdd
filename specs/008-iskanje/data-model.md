# Data Model: Iskanje, filtri in razvrščanje kontaktov

**Migracija**: `backend/src/main/resources/db/migration/V8__iskanje.sql` (R-01, R-02, R-03). Nobene nove tabele; V4 se ne spreminja. 008 ničesar ne zapisuje (samo branje), zato revizijska sled (005) ni prizadeta.

## Spremembe sheme

| Objekt | Sprememba | Zakaj |
|---|---|---|
| kolacija `sort_sl` | `CREATE COLLATION sort_sl (provider = icu, locale = 'sl-u-ks-level2', deterministic = false)` | slovenska abeceda, brez razlike velikosti črk (D-63, R-01) |
| kolacija `search_fold` | `CREATE COLLATION search_fold (provider = icu, locale = 'und-u-ks-level1', deterministic = false)` | iskanje in pogoji brez razlike velikosti črk in strešic (R-03) |
| `contact.sort_last`, `contact.sort_first` | `ALTER COLUMN … TYPE text COLLATE sort_sl` (prej `COLLATE "C"`) | privzeto in izbrano razvrščanje po priimku/imenu po D-63; indeks `contact_group_sort` se obnovi |
| indeks `contact_attribute_key` | `ON contact_attribute (key_norm, contact_id)` | pogoji in razvrščanje po dodatnem ključu, preverjanje obstoja ključa, seznam ključev |

Vrednosti `sort_last`/`sort_first` se ne spremenijo (male črke priimka in imena, `NULL` za prazno); pisanje v 004 (`ContactRepository`, `ContactSnapshots`) in testni pomočniki ostanejo.

## Poizvedba seznama kontaktov (`ContactQuery`, v kodi in v URL)

Nepremenljiv objekt, ki ga razčleni `ContactQueryParser` (R-06) in uporabijo `ContactSearch` (gradnik `WHERE`/`ORDER BY`), `ContactRepository` ter kasneje 009 in 010.

| Lastnost | Tip | Pravila | FR-ID |
|---|---|---|---|
| `words` | seznam besed | iz `q`: obrez, zaporedni presledki → eden, razdelitev na besede; prazen seznam = brez iskanja; `q` do 200 znakov | FR-008-01, FR-008-02, FR-008-14 |
| `conditions` | seznam `Condition(field, value)` | največ 10; `field` = predefinirano polje ali dodatni ključ (obstaja v skupini); `value` 1–500 znakov po obrezu; primerjava »vsebuje« | FR-008-03, FR-008-14 |
| `tags` | seznam normaliziranih značk | največ 30 različnih; 1–50 znakov; vse morajo biti pri kontaktu | FR-008-04, FR-008-14 |
| `sort` | `SortField` | `LAST_NAME` (privzeto), `FIRST_NAME`, `ADDRESS`, `EMAIL`, `PHONE`, `ATTRIBUTE(keyNorm)` | FR-008-07 |
| `direction` | `ASC` (privzeto), `DESC` | | FR-008-07 |
| `page` | celo število ≥ 0 | API 0-osno, URL 1-osno | FR-008-08 |
| `size` | 25, 50, 100 (privzeto 25) | | FR-008-08 |

`Condition.field`: `FIRST_NAME`, `LAST_NAME`, `ADDRESS`, `EMAIL`, `PHONE` ali `ATTRIBUTE(keyNorm)`; `keyNorm` = `ContactInputParser.normalize(key)`.

## Preslikava v SQL (zaprta, brez vnosa v besedilu SQL – R-13)

| Element | Izraz |
|---|---|
| iskana beseda `w` | `(strpos(coalesce(c.first_name,'') COLLATE search_fold, :w) > 0 OR … last_name … address … email … phone)`; besede povezane z `AND` |
| pogoj predefiniranega polja | `strpos(coalesce(c.<stolpec>,'') COLLATE search_fold, :v) > 0` |
| pogoj dodatnega ključa | `EXISTS (SELECT 1 FROM contact_attribute a WHERE a.contact_id = c.id AND a.key_norm = :k AND strpos(a.value COLLATE search_fold, :v) > 0)` |
| značka | `EXISTS (SELECT 1 FROM contact_tag t WHERE t.contact_id = c.id AND t.tag_norm = :t)` |
| skupina | `c.group_id = :g` (vedno prvi pogoj) |
| razvrščanje | glej R-05 (tabela); vedno zaključeno z `sort_last ASC NULLS LAST, sort_first ASC NULLS LAST, created_at, id` brez podvajanja izbranega polja |
| stran | `LIMIT :size OFFSET :offset` (`offset = page × size`, `long`) |

## Odgovor seznama

Obstoječi `ContactPage { total, page, size, items: ContactSummary[] }` (004) ostane enak; `total` je število zadetkov celotne poizvedbe. Zahtevana stran onkraj zadnje vrne prazen `items` in pravilen `total`.

## Možnosti filtrov (`ContactFilterOptions`)

Izpeljano iz kontaktov 004 (ni samostojno urejano), samo za zahtevano skupino.

| Polje | Tip | Pravila |
|---|---|---|
| `keys` | `string[]` | različni dodatni ključi kontaktov skupine (po `key_norm`), v obliki najstarejšega kontakta; razvrščeno po `sort_sl` na `key_norm` |
| `tags` | `string[]` | različne značke kontaktov skupine (po `tag_norm`), v obliki najstarejšega kontakta; razvrščeno po `sort_sl` na `tag_norm` |

Poizvedbi (podizbira, ker mora `DISTINCT ON` ujemati začetek `ORDER BY`): notranja `SELECT DISTINCT ON (a.key_norm) a.key_norm, a.key FROM contact_attribute a JOIN contact c ON c.id = a.contact_id WHERE c.group_id = :g ORDER BY a.key_norm, c.created_at, c.id`, zunanja `SELECT key FROM (…) s ORDER BY key_norm COLLATE sort_sl`; enako za `contact_tag` (`tag_norm`, `tag`).

## Stanje v vmesniku (`ContactQuery` v TypeScript)

| Lastnost | Tip | Naslov |
|---|---|---|
| `q` | `string` | `q` |
| `conditions` | `{ field: FieldRef; value: string }[]` | `f=‹polje›:‹vrednost›` (ponovljiv) |
| `tags` | `string[]` | `tag=‹značka›` (ponovljiv) |
| `sort` | `FieldRef` (privzeto `lastName`) | `sort` |
| `dir` | `'asc' \| 'desc'` (privzeto `asc`) | `dir` |
| `page` | celo število ≥ 1 (privzeto 1) | `page` (1-osno) |
| `size` | 25, 50, 100 (privzeto 25) | `size` |

`FieldRef` = `firstName | lastName | address | email | phone | { attribute: string }`; zapis v naslovu `firstName` … ali `x.‹ključ›` (R-07). Privzete vrednosti se v naslov ne zapišejo.

## Validacija (strežnik)

Napake `400 VALIDATION_FAILED` po poljih (`FieldError(field, code)`): glej tabelo v R-06. Strežnik je vir resnice; vmesnik uporablja iste meje, da ne pošlje očitno neveljavnih zahtev (npr. 11. pogoj ni mogoč). Znak U+0000 v `q`, `f` ali `tag` je `MALFORMED` (R-06).

## Prehodi stanj

Ni (samo branje). Rezultat je odvisen od trenutnega stanja kontaktov; sočasne spremembe med listanjem lahko kontakt na sosednji strani ponovijo ali izpustijo (spec – Edge Cases).
