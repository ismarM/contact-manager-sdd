# Data Model: Upravljanje članov skupine (007)

Nova migracija `V7__clani.sql` (research R-04, R-06). Tabela `group_member` iz V3 se razširi; druge tabele se ne spremenijo.

```sql
-- 007 clani: opaken identifikator člana v API in sled zadnje spremembe vloge (specs/007-clani/data-model.md; D-58).
ALTER TABLE group_member
    ADD COLUMN id         uuid        NOT NULL DEFAULT uuidv7(),
    ADD COLUMN updated_at timestamptz,
    ADD COLUMN updated_by bigint      REFERENCES app_user (id) ON DELETE SET NULL;

ALTER TABLE group_member ADD CONSTRAINT group_member_id_key UNIQUE (id);
```

| Stolpec | Pomen | Pravila |
|---|---|---|
| `group_id`, `user_id`, `role`, `version`, `created_at` | kot V3 | primarni ključ `(group_id, user_id)`; indeks `group_member_one_owner` (največ en OWNER) ostane |
| `id` (**novo**) | `memberId` v API | uuid v7; obstoječim vrsticam dodeljen ob migraciji; neveljaven zapis v poti ali ne v tej skupini → `404` |
| `version` | optimistično zaklepanje spremembe vloge | `+1` ob spremembi vloge (FR-007-03) in ob prenosu lastništva obeh udeležencev (FR-007-09) |
| `updated_at`, `updated_by` (**novo**) | kdo in kdaj je zadnjič spremenil vlogo | `NULL` do prve spremembe; `updated_by NULL` ob izbrisu računa = »izbrisan uporabnik« (§2.5); beležita se pri spremembi vloge in prenosu (izvajalec = lastnik) |

## Življenjski cikel članstva

| Prehod | Kdo | FR | SQL pod zaklepom vrstice skupine |
|---|---|---|---|
| (ni) → član | ustvarjanje skupine (002), sprejem povabila (006) | – | obstoječe poti |
| vloga A → vloga B | OWNER/ADMIN nad strogo nižjim; B strogo nižja od klicateljeve in ≠ OWNER | FR-007-03, 04 | `UPDATE … SET role, version = version + 1, updated_at, updated_by WHERE group_id AND id AND version = :n` |
| član → (ni) | OWNER/ADMIN nad strogo nižjim; nearhivirana skupina | FR-007-05 | `DELETE … WHERE group_id AND id` |
| član → (ni) | član, ki ni OWNER; ni zadnji član trajno arhivirane skupine | FR-007-06 … 08 | `DELETE … WHERE group_id AND user_id` |
| OWNER → ADMIN, član → OWNER | OWNER nearhivirane skupine | FR-007-09 | dva `UPDATE` v tem vrstnem redu: prejšnji lastnik → ADMIN, nato cilj → OWNER (R-03) |
| član → (ni) | izbris skupine (003), izbris računa (012) | – | kaskada |

## Izpeljana stanja (brez novih stolpcev)

- **Trajno arhivirana skupina:** `archived_at IS NOT NULL` in ni vrstice `role = 'OWNER'` (003, D-35).
- **Zadnji član:** `count(*) FROM group_member WHERE group_id = :g` je 1 (prebrano pod zaklepom, R-01).
- **Vrstica »izbrisan uporabnik«:** ni zapis; `deletedOwner` v odgovoru seznama članov = trajno arhivirana skupina.

## Invariante (preverjajo jih sočasnostni testi)

1. Nearhivirana skupina ima natanko eno vrstico OWNER; trajno arhivirana nobene (SC-003).
2. Skupina z vsaj enim članom ne postane skupina brez članov z zapuščanjem, če je trajno arhivirana (FR-007-08).
3. Ena sama sprememba vloge z isto verzijo uspe, druga dobi `VERSION_CONFLICT` (SC-002).
4. `audit_entry` skupine se zaradi operacij 007 ne spremeni (FR-007-12).
