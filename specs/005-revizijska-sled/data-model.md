# Data Model: Revizijska sled skupine

**Migracija**: `backend/src/main/resources/db/migration/V5__revizijska_sled.sql` (research R-01, R-02, R-07). Nove tabele so v
`ON DELETE CASCADE` verigi iz `contact_group` (izbris skupine izbriše sled, FR-005-05, 003 FR-003-11). Obstoječi kontakti
ob migraciji nimajo vnosov; njihovo izhodišče je stanje *prej* njihove prve zabeležene spremembe (R-04).

## audit_entry

En vnos na uspešno operacijo nad kontakti (FR-005-01, FR-005-03). Nespremenljiv: sprožilec `audit_entry_immutable`
(`BEFORE UPDATE`) zavrne vsako posodobitev (R-07).

| Stolpec | Tip | Pravila |
|---|---|---|
| `id` | `uuid` PK, `DEFAULT uuidv7()` | identifikator vnosa v API in poti `/audit/:entryId` |
| `group_id` | `uuid NOT NULL` → `contact_group(id) ON DELETE CASCADE` | vnos pripada natanko eni skupini (izolacija, FR-005-08) |
| `seq` | `bigint NOT NULL`, `UNIQUE (group_id, seq)` | zaporedna številka v skupini (1, 2, …) iz `audit_head` (R-02); edini vrstni red sledi |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | strežniški čas, samo za prikaz (FR-005-02) |
| `actor_id` | `bigint` → `app_user(id) ON DELETE SET NULL` | izvajalec; `NULL` = »izbrisan uporabnik« (FR-005-02, feature-map §2.5) |
| `action` | `text NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE','MERGE','ROLLBACK'))` | vrsta dejanja (FR-005-03): dodajanje, urejanje, odstranjevanje, združevanje, rollback |
| `contact_count` | `integer NOT NULL CHECK (contact_count >= 1)` | število prizadetih kontaktov (stavek »uredil(a) 12 kontaktov«, R-08) |
| `contact_name` | `text` | prikazno ime ob času vnosa, kadar je `contact_count = 1`; sicer `NULL` |
| `target_entry_id` | `uuid` → `audit_entry(id)` | samo pri `ROLLBACK` na vnos: ciljni vnos T (FR-005-12) |
| `target_initial` | `boolean NOT NULL DEFAULT false` | samo pri `ROLLBACK` na *Začetno stanje* (FR-005-20) |

- `CHECK`: `action = 'ROLLBACK'` ⇔ (`target_entry_id IS NOT NULL` XOR `target_initial`); pri drugih vrstah sta `target_entry_id IS NULL` in `NOT target_initial`.
- Indeksa: `audit_entry_group_seq (group_id, seq DESC)`, `audit_entry_group_action (group_id, action, seq DESC)` (R-08).

## audit_change

En prizadeti kontakt v vnosu (FR-005-02, FR-005-04). Nespremenljiv (sprožilec `audit_change_immutable`, R-07).

| Stolpec | Tip | Pravila |
|---|---|---|
| `entry_id` | `uuid NOT NULL` → `audit_entry(id) ON DELETE CASCADE` | |
| `position` | `integer NOT NULL` | vrstni red v vnosu (0, 1, …); PK `(entry_id, position)` |
| `contact_id` | `uuid NOT NULL` | identifikator kontakta – **brez** tujega ključa, ker je kontakt lahko izbrisan in pozneje obnovljen z istim `id` (FR-005-11) |
| `display_name` | `text NOT NULL` | prikazno ime ob času vnosa (ime iz `after`, pri odstranjevanju iz `before`); poznejše preimenovanje ga ne spremeni (Edge Cases) |
| `before` | `jsonb` | `ContactState` pred operacijo; `NULL` pri dodajanju in obnovitvi |
| `after` | `jsonb` | `ContactState` po operaciji; `NULL` pri odstranjevanju |

- `CHECK (before IS NOT NULL OR after IS NOT NULL)`; `UNIQUE (entry_id, contact_id)` (kontakt je v vnosu največ enkrat).
- Indeks: `audit_change_contact (contact_id, entry_id)` – filter po kontaktu (FR-005-09) in največja verzija kontakta (FR-005-13).

## audit_head

Glava sledi skupine: zaklep za zapis vnosa in najnovejši vnos celotne sledi (R-02; Clarifications 2026-11-08).

| Stolpec | Tip | Pravila |
|---|---|---|
| `group_id` | `uuid` PK → `contact_group(id) ON DELETE CASCADE` | vrstica nastane ob prvem vnosu skupine (`INSERT … ON CONFLICT DO UPDATE`) |
| `last_seq` | `bigint NOT NULL` | `seq` zadnjega vnosa |
| `last_entry_id` | `uuid NOT NULL` → `audit_entry(id)` (`DEFERRABLE INITIALLY DEFERRED`) | najnovejši vnos; vrne se kot `latestEntryId` (FR-005-14, FR-005-15) |

Skupina brez vrstice v `audit_head` ima prazno sled (`latestEntryId = null`).

## contact (sprememba iz 004)

| Stolpec | Tip | Pravila |
|---|---|---|
| `reverted_entry_id` *(nov)* | `uuid` → `audit_entry(id) ON DELETE SET NULL` | vnos `ROLLBACK`, ki je kontakt nazadnje spremenil ali obnovil; `NULL` = ni oznake *Povrnjeno* (FR-005-19) |

- Nastavi ga samo rollback (za vsak kontakt, ki ga spremeni ali obnovi); vsaka druga uspešna operacija nad kontaktom (urejanje
  004, množično urejanje 009, združevanje 011) ga nastavi na `NULL`. Ob izbrisu kontakta izgine z vrstico.
- Po rollbacku `updated_by` in `updated_at` dobita vrednosti iz ciljnega stanja (`updatedById`, `updatedAt`); če uporabnik iz
  stanja ne obstaja več, je `updated_by = NULL` (»izbrisan uporabnik«). `created_at` obnovljenega kontakta je iz stanja (FR-005-19).
- `version` po rollbacku: `max(trenutna, največja v stanjih sledi tega kontakta) + 1` (FR-005-13, R-04).

## ContactState (JSON v `before` / `after`)

Celotno stanje kontakta (R-01). Oblika (ključi v camelCase):

```json
{
  "firstName": "Janez", "lastName": "Novak", "address": null, "email": "janez@example.com", "phone": "031 123 456",
  "attributes": [{ "key": "kompetenca", "value": "web dev" }],
  "tags": ["vip", "konferenca2025"],
  "version": 3, "createdAt": "2026-10-12T12:30:00Z", "updatedAt": "2026-10-12T12:32:00Z", "updatedById": 17
}
```

- Vsebina (primerja se pri rollbacku, R-04; iz nje se izpelje seznam spremenjenih polj, R-03): `firstName`, `lastName`,
  `address`, `email`, `phone`, `attributes` (vrstni red vnosa), `tags` (vrstni red vnosa).
- Metapodatki (ne štejejo kot sprememba, se pa obnovijo): `version`, `createdAt`, `updatedAt`, `updatedById` (`NULL`, če je
  izvajalec takrat že izbrisal račun). Hrani se samo identifikator uporabnika, nobeni osebni podatki (konstitucija VI); po
  izbrisu računa (012) identifikator ostane brez pomena in se prikaže kot »izbrisan uporabnik« (research R-01).

## Izpeljani pojmi

- **Najnovejši vnos** (`latestEntryId`): `audit_head.last_entry_id` – vedno celotne sledi, ne glede na filtre (FR-005-14).
- **Stanje skupine v točki T** (`seq = t`): za vsak kontakt, ki ga je spremenil vnos s `seq > t`, je to `before` njegove prve
  spremembe s `seq > t`; drugi kontakti so v trenutnem stanju (R-04). *Začetno stanje* je `t = 0` (FR-005-20).
- **Spremenjena polja** (`ChangeField`): izpeljana iz `before`/`after` po R-03 (ključ atributa primerjan točno; značke kot seznam).
- **Stavek dejanja** (FR-005-07): iz `action`, `contact_count`, `contact_name` in pri `ROLLBACK` iz časa ciljnega vnosa ali
  `target_initial`.

## Prehodi stanja

- Vnos: nastane (v isti transakciji kot operacija) → nespremenljiv → izbrisan samo s skupino. Ni drugih prehodov.
- Kontakt (dopolnitev 004): obstaja → (rollback ga spremeni) obstaja + *Povrnjeno* → (urejanje, 009, 011) obstaja brez oznake;
  obstaja → (izbris ali rollback) ne obstaja → (rollback) obstaja z istim `id` + *Povrnjeno*.
- Glava sledi: ni vrstice (prazna sled) → `last_seq = 1` → `last_seq + 1` ob vsakem vnosu.
