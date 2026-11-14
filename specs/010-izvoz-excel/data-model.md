# Data Model: Izvoz izbranih kontaktov v Excel (010)

**Brez migracije in brez novih tabel.** Izvoz samo bere obstoječe tabele `contact`, `contact_attribute` in `contact_tag` (004, V4/V8; kolacija `sort_sl`) ter `audit_entry`/`audit_change` (005, samo za razlikovanje »izbrisan« / »nikoli ni bil kontakt«, 009 R-02). Datoteka se ne shrani (spec – Key Entities). Novi so samo nepremenljivi modeli zahtevka in datoteke.

## Zaledje

### ExportRequest (`POST /api/groups/{groupId}/contacts/export`)

| Polje | Tip | Pravila | Napaka (400 `VALIDATION_FAILED`) |
|---|---|---|---|
| `contactIds` | UUID[] | 1–10 000 po zlitju podvojenih (FR-010-13, FR-009-04) | `contactIds` `REQUIRED` / `TOO_MANY`; `contactIds[i]` `INVALID_VALUE` |
| `sort` | niz, neobvezen | zapis parametra `sort` iz 008: `firstName`, `lastName`, `address`, `email`, `phone`, `attr:‹ključ›`; privzeto `lastName` | `sort` `INVALID_VALUE` / `MALFORMED`; ključ, ki ga v skupini nima noben kontakt, ni napaka (vrstice po priimku in imenu, D-90) |
| `dir` | `asc` \| `desc`, neobvezen | privzeto `asc` | `dir` `INVALID_VALUE` |
| `language` | `sl` \| `en` | obvezno; glava in ime lista | `language` `REQUIRED` / `INVALID_VALUE` |
| (drugo) | – | neznana polja niso dovoljena | `‹polje›` `UNKNOWN_FIELD` |
| (telo) | – | veljaven JSON objekt | `body` `MALFORMED` |

Razvrstitev identitet ob obdelavi (research R-05; vedno z `group_id` iz `Membership`):

| Razred | Pogoj | Izid |
|---|---|---|
| obstoječ | vrstica v `contact` te skupine | vrstica datoteke |
| izbrisan ali združen | ni v `contact`, je v `audit_change` vnosa te skupine | izpuščen, šteje se v `X-Export-Skipped` (FR-010-11) |
| tuj ali neobstoječ | ni ne v `contact` ne v sledi te skupine | `404`, celoten izvoz zavrnjen (FR-010-12) |
| (ne ostane noben obstoječ) | – | `409 EXPORT_EMPTY` |

### ExportSheet (v pomnilniku, nato tok v odgovor)

| Del | Vsebina | Pravilo |
|---|---|---|
| Ime lista | »Kontakti« / "Contacts" | FR-010-03, `ExportLabels` |
| Vrstica 1 | `Ime`, `Priimek`, `Naslov`, `E-naslov`, `Telefon`, ‹ključi›, `Značke` (en: `First name`, `Last name`, `Address`, `Email`, `Phone`, ‹ključi›, `Tags`) | FR-010-04 |
| ‹ključi› | različni `key_norm` izvoženih kontaktov, `ORDER BY key_norm COLLATE sort_sl, key_norm`; besedilo = `key` iz prve vrstice datoteke s tem ključem | FR-010-05, D-63 |
| Vrstice 2 … N+1 | en obstoječ kontakt na vrstico, vrstni red `ContactSearch.orderBy(sort, dir)` | FR-010-07 |
| Celica atributa | `value` kontakta za ta `key_norm` ali prazna | FR-010-05 |
| Celica značk | značke kontakta `ORDER BY tag_norm COLLATE sort_sl, tag_norm`, združene z `", "`; brez značk prazna | FR-010-06 |
| Vsaka celica | `CellText.of(value)`: prazno → brez celice; prvi znak `= + - @ \t \r` → predpona `'`; tip besedilo (deljen niz), slog `@` | FR-010-08, FR-010-09 |
| Meja | `6 + ključi ≤ 16 384` stolpcev (≤ 16 378 ključev) | sicer `400` `contactIds` `TOO_MANY_COLUMNS` (FR-010-13, research R-09) |

### ExportResult (odgovor 200)

| Del | Vrednost |
|---|---|
| telo | datoteka `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) |
| `X-Export-Count` | število vrstic kontaktov (≥ 1) |
| `X-Export-Skipped` | število izpuščenih izbrisanih ali združenih (≥ 0) |
| `Content-Disposition` | `attachment; filename="contacts.xlsx"` (rezerva; ime določi odjemalec, R-03) |
| `Cache-Control` | `no-store` |

**Branje brez stranskih učinkov (FR-010-14):** ena transakcija `readOnly`, `REPEATABLE READ`, brez zaklepov, brez spremembe `version` in brez vnosa v revizijsko sled.

## Vmesnik

### Stanje izvoza (`useExport` v `ExportButton`)

| Stanje | Gumb | Sporočilo |
|---|---|---|
| mirovanje | »Izvozi v Excel«, aktiven | – |
| preverjanje ali priprava | »Pripravljam izvoz…«, `aria-disabled="true"` (ponoven klik prezrt) | `role="status"`: »Pripravljam izvoz…« |
| spremenjen izbor | »Izvozi v Excel« | obvestilo FR-009-18 (`SelectionChangedNotice`) z *Posodobi izbor* / *Nadaljuj z obstoječim izborom* |
| uspeh | »Izvozi v Excel« | prenos `exportFileName(...)` + toast »Izvoženih kontaktov: N.« [+ stavek o izpuščenih] |
| napaka | »Izvozi v Excel« | `role="alert"` nad seznamom + *Poskusi znova* |

Izbor se ob nobenem prehodu ne spremeni, razen pri *Posodobi izbor* ali *Nadaljuj z obstoječim izborom* (009).

### Ime datoteke (čista funkcija, research R-03)

`exportFileName(title, language, now)` = `fileNameTitle(title, language) + '-' + (sl ? 'kontakti' : 'contacts') + '-' + localDateStamp(now) + '.xlsx'`

| Korak `fileNameTitle` | Primer »Šola: 2./3. letnik?« |
|---|---|
| NFD + odstranitev znakov `\p{M}` | »Sola: 2./3. letnik?« |
| `[^A-Za-z0-9._]+` → `-` | »Sola-2.-3.-letnik-« |
| obrez vodilnih in končnih `-` in `.` | »Sola-2.-3.-letnik« |
| prazno → `skupina` / `group` | (`???` → `skupina`) |
