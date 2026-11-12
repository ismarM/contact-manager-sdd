# Data Model: Iskanje in združevanje podvojenih kontaktov (011)

**Brez migracije** (research R-02). 011 uporablja obstoječe tabele `contact`, `contact_attribute`, `contact_tag` (004, V4, V8) in `audit_entry`, `audit_change`, `audit_head` (005, V5; `CHECK (action IN (…,'MERGE',…))` že obstaja). Skupine dvojnikov in primerjave **niso shranjene** (spec – Key Entities); novi so samo nepremenljivi modeli zahtevkov in odgovorov ter stanje primerjave v vmesniku.

## Zaledje

### Kategorija iskanja

| Vrednost v API | Pomen | Ključ ujemanja (research R-03) |
|---|---|---|
| `name` | Ime in priimek | par (ime, priimek), vsaka komponenta: NFD brez `\p{M}` → male črke → strnjeni presledki → obrez; oba prazna = izpuščen |
| `email` | E-naslov | obrez → male črke; prazen = izpuščen |
| `phone` | Telefon | samo števke `0-9`, brez vodilnega `00`; brez števk = izpuščen |

Neznana ali manjkajoča kategorija → `400 VALIDATION_FAILED` (`category`: `INVALID_VALUE` / `REQUIRED`).

### DuplicateCandidate (notranji, ni API)

Vrstica iz `ContactRepository.duplicateCandidates(group)`: `id`, `first_name`, `last_name`, `email`, `phone`, `created_at`; razvrščeno `created_at, id`. Zakrito v paketu `contact`.

### DuplicatePage (odgovor `GET …/duplicates`)

| Polje | Tip | Pravila |
|---|---|---|
| `category` | `name` \| `email` \| `phone` | povzeto iz zahtevka |
| `total` | integer | število skupin dvojnikov (ne kontaktov) |
| `page` | integer ≥ 0 | 0-osno kot 008 |
| `size` | 25 \| 50 \| 100 | |
| `groups` | `DuplicateGroup[]` | največ `size`; prazno za prazen rezultat ali stran prek zadnje |

### DuplicateGroup

| Polje | Tip | Pravila |
|---|---|---|
| `reason.category` | kot zgoraj | |
| `reason.value` | string | vrednost prvega kontakta (FR-011-07): ime in priimek / e-naslov / telefon, nenormalizirano |
| `size` | integer ≥ 2 | število kontaktov v skupini |
| `contacts` | `DuplicateContact[]` | **vsi** kontakti skupine, `created_at` naraščajoče, nato `id`; prvi je ohranjen ob združitvi |

`DuplicateContact`: `id` (uuid), `displayName` (string; ime in priimek brez manjkajočega dela).

Skupina nima identifikatorja; vsak kontakt je v največ eni skupini; skupina ima ≥ 2 kontakta; skupine so razvrščene po `reason.value` (sl `Collator`, moč `SECONDARY`), nato `created_at`, `id` prvega kontakta (research R-04).

### Comparison (odgovor `GET …/duplicates/compare?ids=`)

| Polje | Tip | Pravila |
|---|---|---|
| `contacts` | `CompareContact[]` | samo obstoječi kontakti te skupine izmed zahtevanih `ids`, `created_at` naraščajoče, nato `id`; lahko < 2 (izbrisani); največ 10 |

`CompareContact`: `id`, `version` (bigint), `createdAt`, `firstName`, `lastName`, `address`, `email`, `phone` (vsi lahko `null`), `attributes` (`[{key, value}]`, vrstni red vnosa), `tags` (`string[]`, vrstni red vnosa).

Razvrstitev zahtevanih identitet (research R-05; vedno z `group_id` iz `Membership`):

| Razred | Pogoj | Izid |
|---|---|---|
| obstoječ | vrstica v `contact` te skupine | v odgovoru |
| izbrisan | ni v `contact`, je v `audit_change` vnosa te skupine (`audit_entry.group_id`) | izpuščen (brez napake) |
| tuj | ni ne v `contact` ne v sledi te skupine | `404`, nič ni vrnjeno |

Zahteva: `ids` 2–10 različnih UUID (sicer `400`, research R-05).

### MergeRequest (`POST …/duplicates/merge`)

| Polje | Tip | Pravila |
|---|---|---|
| `contacts` | `{id, version}[]` | 2–10 različnih `id` (`TOO_MANY`, `REQUIRED`, `DUPLICATE`, `INVALID_VALUE`); `version` obvezen celo število ≥ 0 (`contacts[i].version`) |
| `result` | objekt | končne vrednosti; pravila slovarja §2.6 prek `ContactInputParser.parseCreate`; napake s predpono `result.` |

`result`: `firstName`, `lastName`, `address`, `email`, `phone`, `attributes` (`[{key,value}]`), `tags` (`string[]`) – enaka pravila kot pri ustvarjanju kontakta (004): vsaj ime ali priimek; ime/priimek ≤ 100, naslov ≤ 300, e-naslov ≤ 254 veljavne oblike, telefon ≤ 30 (`0-9 + - ( ) / presledek`); ključ atributa 1–50 in edinstven brez razlike velikosti črk ter različen od imen predefiniranih polj, vrednost 1–500, ≤ 50 atributov; značka 1–50 brez presledkov, edinstvena brez razlike velikosti črk, ≤ 30 značk.

**Ohranjeni kontakt** ni v zahtevku: je najstarejši po `created_at`, `id` med `contacts` (FR-011-11).

### MergeResult (odgovor `200`)

| Polje | Tip |
|---|---|
| `keptContactId` | uuid |
| `keptDisplayName` | string (ime in priimek ohranjenega po združitvi) |
| `mergedCount` | integer (število vključenih kontaktov N, vključno z ohranjenim) |
| `auditEntryId` | uuid vnosa `MERGE` |

### Napake

- `400 VALIDATION_FAILED` – `{code, errors:[{field, code}]}` (obstoječa oblika `ValidationError`); polja: `category`, `page`, `size`, `ids`, `contacts`, `contacts[i].version`, `result.<polje>`.
- `409 VERSION_CONFLICT` – obstoječa oblika `VersionConflict` (`{code:"VERSION_CONFLICT"}`; `current` ni uporabljen, je `null` ali izpuščen); vmesnik ponovno naloži primerjavo.
- `409 GROUP_ARCHIVED`, `403 FORBIDDEN`, `404`, `401 UNAUTHENTICATED` – skupne kode (feature-map §2.2).
- Nobena nova koda napake; register §2.10 se ne spreminja.

## Vpliv združitve na obstoječe tabele (v eni transakciji)

| Tabela | Ohranjeni kontakt K | Ostali vključeni kontakti |
|---|---|---|
| `contact` | `UPDATE`: `first_name`, `last_name`, `address`, `email`, `phone`, `sort_last`, `sort_first`, `version = version + 1`, `updated_by = izvajalec`, `updated_at = now()`, `reverted_entry_id = NULL`; `id`, `group_id`, `created_at` nespremenjeni | `DELETE` |
| `contact_attribute`, `contact_tag` | zamenjava (brisanje + vstavitev izbranih, vrstni red iz `result`) | kaskadni izbris |
| `audit_entry` | 1 vnos: `action = 'MERGE'`, `contact_count = N`, `contact_name = NULL`, `actor_id`, `target_* = prazno` | – |
| `audit_change` | `(position 0)` `before` = stanje pred, `after` = stanje po zapisu | `(position 1…)` `before` = stanje pred, `after = NULL`; razvrščeno `created_at`, `id` |
| `audit_head` | `last_seq + 1`, `last_entry_id` = novi vnos | |

Kontakti zunaj `contacts` (ostali iz velike skupine, izločeni) se ne dotaknejo.

## Prehodi stanja

- Kontakt K: obstaja (verzija v) → obstaja z izbranimi vrednostmi (v + 1), brez oznake *Povrnjeno*.
- Ostali kontakt: obstaja → ne obstaja; ostane v sledi (`before`) in je z rollbackom obnovljiv z istim `id` (research R-10).
- Rollback na točko pred združitvijo: K → `before` vrednosti (verzija `max(…) + 1`), izbrisani → obnovljeni z istim `id`, vsi z oznako *Povrnjeno*; nov vnos `ROLLBACK` (005). Brez sprememb sheme.

## Stanje v vmesniku (ni shranjeno na strežniku)

`CompareState` (čista funkcija `mergeModel.ts`): `contacts` (`CompareContact[]` po izločitvah), `choices` (po vrstici izbrana vrednost), `tags` (obkljukane značke), `excluded` (id-ji), `total` (iz naslova, samo prikaz). Naslov strani: `category`, `page`, `size` (vrnitev na rezultate), `ids` (trenutno vključeni, ≤ 10), `total`.
