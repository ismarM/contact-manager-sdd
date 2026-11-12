# Data Model: Moji podatki (012)

Nova migracija `V9__moji_podatki.sql` (research R-02, R-03, R-05, R-14; **številka se pred PR preveri – R-14**). Obstoječe tabele se **ne spremenijo**; dodajo se ena tabela, en sprožilec in štirje indeksi.

```sql
-- 012 moji podatki: nadgrobnik izbrisane identitete, prepoved ponovne registracije in indeksi za ON DELETE SET NULL
-- (specs/012-moji-podatki/data-model.md; D-72).

-- Firebase UID izbrisanih uporabnikov: razveljavitev ID žetonov (FR-012-15) in sled neizpolnjenega brisanja pri ponudniku (FR-012-14).
-- Hrani samo psevdonimni UID (ne imena, ne e-naslova).
CREATE TABLE deleted_identity (
    firebase_uid        varchar(128) PRIMARY KEY,
    deleted_at          timestamptz  NOT NULL DEFAULT now(),
    provider_deleted_at timestamptz,
    attempts            integer      NOT NULL DEFAULT 0,
    next_attempt_at     timestamptz  NOT NULL DEFAULT now(),
    last_error          varchar(40)
);

CREATE INDEX deleted_identity_pending ON deleted_identity (next_attempt_at) WHERE provider_deleted_at IS NULL;
CREATE INDEX deleted_identity_purge ON deleted_identity (provider_deleted_at) WHERE provider_deleted_at IS NOT NULL;

-- Račun z UID-jem iz nadgrobnika ne sme (znova) nastati: preverjanje ob potrditvi, ko je sočasni izbris že viden (R-03).
CREATE FUNCTION app_user_not_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM deleted_identity WHERE firebase_uid = NEW.firebase_uid) THEN
        RAISE EXCEPTION 'identity deleted' USING ERRCODE = 'CM401';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER app_user_not_deleted AFTER INSERT ON app_user
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_user_not_deleted();

-- Brez teh indeksov ON DELETE SET NULL pri izbrisu uporabnika prebere celotne tabele (R-05).
CREATE INDEX audit_entry_actor ON audit_entry (actor_id);
CREATE INDEX contact_updated_by ON contact (updated_by);
CREATE INDEX contact_group_updated_by ON contact_group (updated_by);
CREATE INDEX group_member_updated_by ON group_member (updated_by);
```

## `deleted_identity` (**novo**)

| Stolpec | Pomen | Pravila |
|---|---|---|
| `firebase_uid` | Firebase UID izbrisanega uporabnika (`sub` iz žetona) | PK; vir: `app_user.firebase_uid` v trenutku izbrisa; nikoli ne vsebuje imena ali e-naslova |
| `deleted_at` | čas potrditve izbrisa v aplikaciji | samo za diagnostiko |
| `provider_deleted_at` | čas uspešnega brisanja identitete pri ponudniku | `NULL` dokler ne uspe; nastavi ga `IdentityDeletionJob` ali hitra pot po izbrisu |
| `attempts`, `next_attempt_at` | ponavljanje in zakup (R-07) | `next_attempt_at` je hkrati čas naslednjega poskusa in **zakup**: ob vstavitvi `now() + lease` (privzeto 30 s), ob prevzemu v opravilu `now() + lease`, po neuspehu `now() + min(30 s · 2^attempts, 1 h)`, kjer je `attempts` **vrednost pred povečanjem** (prvi neuspeh: `attempts = 0` → 30 s, drugi: `1` → 60 s, šesti: `5` → 960 s); prevzem je en kratek `UPDATE … WHERE firebase_uid IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` |
| `last_error` | kratka koda zadnjega neuspeha (`TIMEOUT`, `HTTP_5XX`, `HTTP_401` …) | brez uporabnikovih podatkov, ne UID-a |

Vstavitev je `INSERT … ON CONFLICT (firebase_uid) DO NOTHING`: podvojen zapis ni nikoli vzrok za `500` (sočasni izbris istega uporabnika, R-04). Shema migracije se zaradi tega ne spreminja.

**Življenjski cikel vrstice:**

| Stanje | Pogoj | Učinek |
|---|---|---|
| odprt | `provider_deleted_at IS NULL` | ID žetoni UID-a: 401; nova registracija: zavrnjena (sprožilec); opravilo po izteku zakupa ponavlja brisanje pri ponudniku (zunaj podatkovne transakcije) |
| zaprt | `provider_deleted_at` nastavljen | ID žetoni UID-a: 401 do izbrisa vrstice (žeton lahko velja še do 1 ure) |
| izbrisan | `provider_deleted_at < now() - 2 h` (`identity-deletion.tombstone-retention`, najmanj 70 min) | opravilo izbriše vrstico (tudi po ponovnem zagonu; prvi zagon takoj); do takrat so vsi žetoni potekli. Odprta vrstica (`provider_deleted_at IS NULL`) se ne izbriše nikoli |

Stanje **odprt** ustreza odgovoru `202`, stanje **zaprt** ob potrditvi pa `204` (R-16, FR-012-17); vrstica je v obeh stanjih že zapisana, preden odjemalec dobi odgovor.

## Obstoječe tabele: vpliv izbrisa računa (brez sprememb sheme)

| Tabela.stolpec | `ON DELETE` (migracija) | Učinek ob izbrisu uporabnika | FR |
|---|---|---|---|
| `app_user` | – | vrstica izbrisana (ime, e-naslov, jezik, tema) | FR-012-08 |
| `group_member.user_id` (V3) | `CASCADE` | uporabnik odstranjen iz vseh skupin; lastnik arhivirane skupine z drugimi člani izgubi vrstico `OWNER` → skupina izpeljano trajno arhivirana (003) | FR-012-08, -09 |
| `invitation.invitee_id` (V6) | `CASCADE` | prejeta povabila izbrisana | FR-012-08 |
| `invitation.inviter_id` (V6) | `SET NULL` | poslana povabila ostanejo, pošiljatelj = »izbrisan uporabnik« | FR-012-11 |
| `audit_entry.actor_id` (V5) | `SET NULL` (sprožilec `audit_entry_immutable` dovoli samo to) | izvajalec = »izbrisan uporabnik«; stanja prej/potem nespremenjena | FR-012-12 |
| `contact.updated_by`, `contact_group.updated_by`, `group_member.updated_by` (V3, V4, V7) | `SET NULL` | »izbrisan uporabnik« (opozorila konflikta 004, 007) | FR-012-12 |
| `contact_group` (+ `contact*`, `audit_*`, `invitation`, `group_member` s `CASCADE`) | – | **izbrisana** (izrecni `DELETE`, R-05 korak 1), če je arhivirana in je uporabnik edini član | FR-012-09, -10 |

## Odločanje o skupinah ob izbrisu (pod zaklepom skupine, R-04, R-05)

| Skupina | Uporabnik | Rezultat | FR |
|---|---|---|---|
| nearhivirana | `OWNER` (obvezno, če je edini član) | **`409 OWNS_ACTIVE_GROUPS`**, nič se ne spremeni | FR-012-06, -13 |
| nearhivirana | ni lastnik | članstvo izbrisano; skupina nespremenjena | FR-012-08 |
| arhivirana | `OWNER`, drugi člani obstajajo | članstvo izbrisano → **trajno arhivirana** brez lastnika; ostali člani in vloge nespremenjeni | FR-012-09 |
| arhivirana | `OWNER`, edini član | **skupina izbrisana** z vsemi podatki | FR-012-09 |
| arhivirana | član brez vloge lastnika, lastnik obstaja | samo članstvo izbrisano; lastnik nespremenjen | FR-012-08 |
| trajno arhivirana (arhivirana, brez `OWNER`) | član, edini | **skupina izbrisana** | FR-012-10 |
| trajno arhivirana | član, drugi člani obstajajo | samo članstvo izbrisano; ostane trajno arhivirana | FR-012-08 |

## Izvoz (ni shranjen; posnetek v času klica)

Struktura `MyData` (podrobnosti in primer v [contracts/openapi.yaml](contracts/openapi.yaml)); viri:

| Odsek | Vir | Opomba |
|---|---|---|
| `profile` | `app_user` (`name`, `email`, `created_at`, `language`, `theme`) | `language`/`theme` `null`, če v profilu nista izbrana |
| `memberships` | `group_member` ⨝ `contact_group` | `state`: `ACTIVE` (`archived_at IS NULL`), `ARCHIVED`, `PERMANENTLY_ARCHIVED` (`archived_at IS NOT NULL` in brez `OWNER`); `role`, `joinedAt = group_member.created_at` |
| `receivedInvitations` | `invitation` (`invitee_id = uporabnik`) ⨝ `contact_group`, pošiljatelj iz `app_user` prek `inviter_id` | pošiljatelj: ime ali konstanta »izbrisan uporabnik« (`deleted: true`); brez e-naslova pošiljatelja |
| `sentInvitations` | `invitation` (`inviter_id = uporabnik`) ⨝ `contact_group`, `app_user` prejemnika | `inviteeEmail` je edini podatek drugega uporabnika; neodvisno od trenutne vloge ali članstva |
| `ownedGroups` | `contact_group` ⨝ `group_member` (`role = 'OWNER'`) | `state`: `ACTIVE` ali `ARCHIVED`; trajno arhivirana skupina nima lastnika, torej ni v izvozu |

Iz izvoza so izpuščeni: kontakti, atributi, značke, revizijska sled, imena in e-naslovi članov, `id`-ji (FR-012-03). **Edina izjema** (FR-012-03, CR-04): ime pošiljatelja prejetega povabila in e-naslov povabljenega pri poslanem povabilu.
