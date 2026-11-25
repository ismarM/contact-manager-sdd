# Data Model: Pametni atributi in značke

## Migracija `V10__pametni_atributi.sql` (samo naprej, brez posega v podatke)

```sql
ALTER TABLE contact
    ADD COLUMN company text CHECK (company IS NULL OR char_length(company) BETWEEN 1 AND 200),
    ADD COLUMN country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
```

- Obstoječe vrstice: `NULL`; `version`, `updated_at`, `sort_*` se ne spremenijo.
- Dolžina po kodnih točkah v aplikaciji (kot ostala polja); `CHECK` je varovalka.
- Ni novih tabel in ni novih indeksov (R-04).

## Spremembe zapisov

| Zapis | Sprememba |
|---|---|
| `ContactInput`, `ContactDetail`, `ContactState`, `CompareContact`, `ExportRow` | dodani `company`, `country` (po `phone`) |
| `ContactState` (jsonb v `audit_change`) | stari posnetki brez polj → `null`; novi posnetki vsebujejo polji |
| `ChangeField.Field` | dodani `COUNTRY`, `COMPANY` (po `PHONE`, pred `ATTRIBUTE`) |
| `ContactQuery.Kind`, `BulkEditInput.Field` | dodani `COMPANY`, `COUNTRY` |
| `Suggestion(text, count)`, `Suggestions(items)` | novo; nadomesti `TagSuggestions` |
| `CountryResolution(input, status, code, candidates)` | novo (izid FR-013-19) |

## Pravila

- `company`: obrezano, prazno → `NULL`, 1–200 znakov. `country`: natanko dve veliki črki, uradna koda; sicer `400 INVALID_VALUE` (po vzorcu `phone`).
- Rezervirana imena: stara 11 v parserju, nova 4 v `AttributeKeys` (R-06).
- Kanonična oblika: izpeljana (R-05), ni shranjena.
- `ChangeDiff` primerja `company` in `country` kot skalarni polji; `RollbackService.sameContent` ju primerja.
