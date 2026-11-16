# Data Model: Tipizirani atributi, normalizacija in zemljevid naslovov

## Migracija `V13__tipizirani_atributi.sql` (samo naprej, brez spremembe vrednosti in verzij)

```sql
CREATE TABLE attribute_key (
    group_id uuid   NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    key_norm text   NOT NULL,
    type     text   NOT NULL DEFAULT 'OTHER'
             CHECK (type IN ('OTHER', 'NOTES', 'EMAIL', 'PHONE', 'ADDRESS', 'URL', 'DATE')),
    version  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, key_norm)
);
INSERT INTO attribute_key (group_id, key_norm)
SELECT DISTINCT c.group_id, a.key_norm FROM contact_attribute a JOIN contact c ON c.id = a.contact_id;

ALTER TABLE contact
    ADD COLUMN address_parts jsonb CHECK (address_parts IS NULL OR jsonb_typeof(address_parts) = 'object'),
    ADD CONSTRAINT contact_address_one CHECK (address IS NULL OR address_parts IS NULL);

ALTER TABLE contact_attribute
    ADD COLUMN parts jsonb CHECK (parts IS NULL OR jsonb_typeof(parts) = 'object'),
    ALTER COLUMN value DROP NOT NULL,
    ADD CONSTRAINT contact_attribute_value_or_parts CHECK ((value IS NULL) <> (parts IS NULL));

ALTER TABLE app_user
    ADD COLUMN phone_format   varchar(13) CHECK (phone_format IN ('INTERNATIONAL', 'NATIONAL', 'E164')),
    ADD COLUMN date_format    varchar(6)  CHECK (date_format IN ('LOCALE', 'ISO', 'LONG')),
    ADD COLUMN address_format varchar(11) CHECK (address_format IN ('COUNTRY', 'SINGLE_LINE'));

ALTER TABLE audit_entry
    ADD COLUMN attribute_key text,
    ADD COLUMN type_before   text,
    ADD COLUMN type_after    text;
-- CHECK action: unija z V12 + 'ATTRIBUTE_TYPE' (kot V11/V12: DROP + ADD audit_entry_action_check);
-- CHECK audit_entry_attribute_type: (action = 'ATTRIBUTE_TYPE') = (attribute_key IS NOT NULL AND type_before IS NOT NULL AND type_after IS NOT NULL)
```

**Obstoječi podatki:** vsi ključi dobijo vrstico `OTHER`/0; `contact.address` (besedilo do 300) ostane kot **nerazčlenjen naslov**, `address_parts = NULL`; `contact_attribute.value` ostane, `parts = NULL`; telefoni in e-naslovi ostanejo dobesedno (normalizacija le ob spremembi, FR-016-09); verzije, `updated_at` in posnetki sledi se ne spremenijo. Samodejne pretvorbe ali razčlenitve ni. Novi indeksi niso potrebni (research R-06).

## Zapisi (zaledje)

| Zapis | Sprememba |
|---|---|
| `AttributeType` (nov enum) | `OTHER, NOTES, EMAIL, PHONE, ADDRESS, URL, DATE` |
| `Address` (nov) | `street, extra, postalCode, city, region, country` (vsi neobvezni, vsaj `street` ali `city`) |
| `Attribute` | `(key, type, value, parts)`: `value` za vse tipe razen razčlenjenega naslova, `parts` samo `ADDRESS` |
| `ContactInput`, `ContactDetail`, `ContactState`, `CompareContact`, `ExportRow`, `VcardContact` | + `addressParts` (po `address`); atributi s tipom; stari posnetki: `type` manjka → `OTHER`, `addressParts` → `null` |
| `ChangeField` | `ATTRIBUTE`: `before`/`after` = `{type, value \| parts}`; `ADDRESS`: besedilo ali dele |
| `AuditAction` | + `ATTRIBUTE_TYPE`; `AuditEntry` + `attributeKey`, `typeBefore`, `typeAfter` |
| `AttributeKeyView` (nov) | `key` (kanonični zapis 013), `type`, `contactCount`, `version` |
| `TypeConflict` (nov, telo 409) | `contacts: [{contactId, displayName, value}]` (≤ 100), `total` |
| `AddressLocation` (nov, ni shranjen) | `status: EXACT \| APPROXIMATE \| NOT_FOUND`, `latitude`, `longitude` |
| `AddressSuggestion` (nov, ni shranjen) | `label` + deli `Address` |
| `Preferences`, `Profile`, `MyData.preferences` | + `phoneFormat`, `dateFormat`, `addressFormat` (`null` = privzeto) |
| `Suggestion` (013, `type=key`) | + `attributeType` |
| `BulkEditInput` (nastavi atribut) | + `type` (za nov ključ), `parts` |

## Pravila po tipu (kanonična oblika, research R-02 … R-04)

| Tip | Veljavno | Shranjeno |
|---|---|---|
| `OTHER` | 1–500 po obrezu | obrezano |
| `NOTES` | 1–500, vsaj en nepresledni znak | dobesedno |
| `EMAIL` | vzorec 004, ≤ 254 | obrez, domena z malimi |
| `PHONE` | libphonenumber `isValidNumber` ali veljavna kratka številka, ≤ 30 | E.164 (+ `;ext=N`) oz. števke kratke številke |
| `URL` | `http`/`https`, gostitelj s piko, ≤ 500 | `https://` privzeto, shema in gostitelj z malimi (Unicode) |
| `DATE` | koledarski datum | `LLLL-MM-DD` |
| `ADDRESS` | deli z mejami 200/200/20/100/100, `street` ali `city`; nerazčlenjen ≤ 300 (predefiniran) oz. ≤ 500 (atribut) samo obstoječ ali iz uvoza/API | deli: obrez, strnjeni presledki, poštna z velikimi, država koda |

Predefinirana polja: `email` → `EMAIL`, `phone` → `PHONE` (od 016 po standardu, ne le po znakih), `address` → `ADDRESS`. Nespremenjena vrednost (enaka shranjeni) se ne preverja in ne normalizira.

## Stanja

- Ključ: *v uporabi* (≥ 1 kontakt) ↔ *prost* (0 kontaktov; tip se ob ponovni uporabi izbere znova).
- Naslov: *nerazčlenjen* → (*Razčleni naslov* + shrani) → *razčlenjen*; obratno samo s spremembo tipa ključa v drug tip (besedilo) ali rollbackom.
