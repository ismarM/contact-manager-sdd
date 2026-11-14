# Data Model: Povabila v skupino (006)

Nova migracija `V6__povabila.sql` (research R-01 – R-03). Druge tabele se ne spremenijo.

## Tabela `invitation`

```sql
CREATE TABLE invitation (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    group_id   uuid        NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    invitee_id bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    inviter_id bigint      REFERENCES app_user (id) ON DELETE SET NULL,
    role       varchar(6)  NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invitation_one_pending UNIQUE (group_id, invitee_id)
);

CREATE INDEX invitation_invitee_created ON invitation (invitee_id, created_at DESC, id DESC);
CREATE INDEX invitation_inviter ON invitation (inviter_id);
```

| Stolpec | Pomen | Pravila |
|---|---|---|
| `id` | identifikator povabila v API (`invitationId`) | uuid v7; neveljaven zapis v poti → `404` |
| `group_id` | skupina | `ON DELETE CASCADE` – izbris skupine izbriše povabila (003, FR-006-12) |
| `invitee_id` | povabljeni (registriran uporabnik) | `ON DELETE CASCADE` – izbris računa povabljenega izbriše njegova povabila (012) |
| `inviter_id` | povabitelj | `NULL` = izbrisan uporabnik (§2.5); znižanje ali odstranitev iz skupine ga ne spremeni |
| `role` | ponujena vloga | nikoli `OWNER` (§2.1); strogo nižja od povabiteljeve ob pošiljanju |
| `created_at` | datum povabila | razvrščanje seznamov padajoče (nato `id` padajoče) |

- Unikatni ključ `(group_id, invitee_id)` služi tudi seznamu povabil skupine (vodilni stolpec `group_id`); seznam skupine se razvrsti v
  pomnilniku baze po `created_at` (največ toliko vrstic, kolikor je čakajočih povabil skupine).
- `invitation_inviter` podpira izvoz poslanih povabil (012) in `ON DELETE SET NULL` ob izbrisu računa.

## Življenjski cikel

| Stanje | Prehod | Kdo | Učinek |
|---|---|---|---|
| (ni) → čakajoče | pošiljanje (FR-006-02) | ADMIN+ nearhivirane skupine | `INSERT` pod zaklepom vrstice skupine |
| čakajoče → (ni) | sprejem (FR-006-08, FR-006-09) | povabljeni; tudi v arhivirani skupini | `DELETE … RETURNING role` + `INSERT INTO group_member … ON CONFLICT DO NOTHING` v isti transakciji pod zaklepom skupine |
| čakajoče → (ni) | zavrnitev (FR-006-10) | povabljeni; tudi v arhivirani skupini | `DELETE … WHERE id AND invitee_id` |
| čakajoče → (ni) | umik (FR-006-14) | OWNER; ADMIN samo pri `role <> 'ADMIN'`; tudi v arhivirani skupini | `DELETE … WHERE id AND group_id` |
| čakajoče → (ni) | izbris skupine (003) ali računa povabljenega (012) | sistem | kaskada |
| čakajoče → čakajoče (povabitelj `NULL`) | izbris računa povabitelja (012) | sistem | `SET NULL` |

## Pravila pošiljanja (pod zaklepom skupine, vrstni red po §2.2)

1. `GroupAccess.require(ADMIN, write = false)` → 401 / 404 / 403.
2. `role` je znana vloga in ni strogo nižja od klicateljeve → `403` (R-07).
3. skupina je arhivirana (ponovno pod `SELECT … FOR UPDATE`) → `409 GROUP_ARCHIVED`.
4. napake polj → `400 VALIDATION_FAILED`.
5. `lower(trim(email)) = lower(klicatelj.email)` → `409 CANNOT_INVITE_SELF`.
6. ni `app_user` z `lower(email)` → `409 INVITEE_NOT_REGISTERED`.
7. obstaja `group_member (group_id, invitee_id)` → `409 ALREADY_MEMBER`.
8. obstaja `invitation (group_id, invitee_id)` (ali kršitev `invitation_one_pending`) → `409 INVITATION_ALREADY_PENDING`.
9. `INSERT` → `201`.

## Sprejem v arhivirano skupino

Članstvo nastane z vlogo iz povabila (`group_member.role = invitation.role`, `version = 0`, `created_at = now()` – datum včlanitve za 012).
Efektivne pravice bralca v arhivirani skupini zagotovi obstoječe pravilo `GroupAccess` (`write` v arhivirani skupini → 409); po
odarhiviranju (003) velja shranjena vloga. Skupina se pokaže na seznamu *Arhivirane skupine* (003), ker ta bere `group_member`.

## Odgovori (contracts/openapi.yaml)

```json
// OutgoingInvitation – seznam skupine in odgovor na POST
{ "id": "0190…", "inviteeEmail": "ana@primer.si", "role": "EDITOR",
  "invitedBy": { "name": "Pia Kos", "email": "pia@primer.si" }, "createdAt": "2026-11-08T10:15:00Z", "canWithdraw": true }

// ReceivedInvitation – seznam prejetih
{ "id": "0190…", "group": { "id": "0190…", "title": "Projekt FERI", "color": "mah", "archived": false },
  "role": "EDITOR", "invitedBy": null, "createdAt": "2026-11-08T10:15:00Z" }

// AcceptedInvitation
{ "groupId": "0190…", "title": "Projekt FERI", "role": "EDITOR", "archived": false }
```

- `invitedBy`: oblika `UserRef` iz 002 (`name` je lahko `null`); `null` = izbrisan uporabnik.
- `group.title` in `group.color` sta vedno trenutna (spec *Edge Cases*).

## Uporaba v drugih funkcionalnostih

- **012 (izvoz):** prejeta povabila – `WHERE invitee_id = :user`; poslana – `WHERE inviter_id = :user` z `app_user.email` povabljenega
  (FR-012-02 (c), (d)). **012 (izbris računa):** brez dodatne kode – kaskada in `SET NULL`.
- **007 (člani):** ponovno vabljenje bivšega člana deluje, ker povabilo ni vezano na prejšnje članstvo.
