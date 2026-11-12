# Data Model: Izbor in množično urejanje kontaktov (009)

**Brez migracije.** 009 uporablja obstoječe tabele `contact`, `contact_attribute`, `contact_tag` (004, V4/V8) in `audit_entry`, `audit_change` (005, V5). Novi so samo nepremenljivi modeli zahtevkov in odgovorov ter stanje izbora v vmesniku.

## Zaledje

### BulkTarget (identitete v zahtevku)

| Polje | Tip | Pravila |
|---|---|---|
| `contactIds` | seznam UUID | 1–10 000 po zlitju podvojenih (FR-009-04); vsak UUID |

Razvrstitev identitet ob obdelavi (R-02):

| Razred | Pogoj (vedno z `group_id` iz `Membership`) | Izid |
|---|---|---|
| obstoječ | vrstica v `contact` te skupine | se obdela |
| manjkajoč | ni v `contact`, je v `audit_change` vnosa te skupine (`audit_entry.group_id`) | `409 SELECTION_CHANGED` (`missing`) |
| tuj | ni ne v `contact` ne v sledi te skupine | `404` (korak 2), nič se ne spremeni |

### BulkEditInput (`POST …/contacts/bulk-update`)

| Polje | Tip | Pravila (R-05) |
|---|---|---|
| `contactIds` | UUID[] | kot BulkTarget |
| `addTags` | string[] | 0–30; značka 1–50 znakov, brez presledkov |
| `removeTags` | string[] | 0–30; ista pravila; presek z `addTags` (normalizirano) prazen |
| `attributes` | AttributeSet[] | 0–10; vsako polje / ključ največ enkrat |

Vsaj eden od `addTags`, `removeTags`, `attributes` ni prazen (`EMPTY_OPERATION`).

**AttributeSet**

| Polje | Tip | Pravila |
|---|---|---|
| `field` | `address` \| `email` \| `phone` \| `custom` | `firstName`, `lastName` in drugo → `INVALID_VALUE` (FR-009-07) |
| `key` | string | samo pri `custom`: 1–50 znakov, ne ime predefiniranega polja (sl/en, kot 004); pri `address`/`email`/`phone` poslan `key` → `INVALID_VALUE` (D-75) |
| `value` | string | obrezana; prazna = odstrani / izprazni; neprazna po §2.6: naslov ≤ 300, e-naslov oblika in ≤ 254, telefon ≤ 30 in dovoljeni znaki, dodatna vrednost ≤ 500 |

### BulkEdit (čista funkcija, R-04)

`apply(ContactState before, BulkEditInput edit) → ContactState after`

1. odstrani značke iz `removeTags` (primerjava `normalize`); manjkajoča značka ni napaka;
2. doda značke iz `addTags`, ki jih kontakt (normalizirano) nima – na konec, v zapisu iz zahtevka;
3. za vsak `AttributeSet`: predefinirano polje = vrednost ali `null`; dodatni ključ: obstoječ (normalizirano) → nova vrednost in zapis ključa, isti položaj; nov → na konec; prazna vrednost → odstrani, položaji se strnejo.

`changed = vsebina(before) ≠ vsebina(after)` (polja, atributi in značke v vrstnem redu; metapodatki se ne primerjajo).

**Validacija končnega stanja po kontaktu:** `after.tags.size() ≤ 30` (`tags` `TOO_MANY`), `after.attributes.size() ≤ 50` (`attributes` `TOO_MANY`).

### Prehodi stanja kontakta

| Operacija | Spremenjen kontakt | Nespremenjen izbran kontakt |
|---|---|---|
| bulk-update | vrednosti po BulkEdit; `version + 1`; `updated_by` = izvajalec; `updated_at = now()`; `reverted_entry_id = NULL`; `sort_last`/`sort_first` iz imena (ime se ne spreminja) | nič (verzija ostane, FR-009-16, spec Assumptions – štetje) |
| bulk-delete | vrstica izbrisana (kaskada: atributi, značke) | – |

### BulkResult (odgovor `200`)

| Polje | Tip | Pomen |
|---|---|---|
| `changed` | integer | bulk-update: število dejansko spremenjenih (0 = »Nobenega kontakta ni bilo treba spremeniti.«) |
| `deleted` | integer | bulk-delete: število izbrisanih (= velikost izbora po zlitju) |

### BulkValidationError (`400`)

`{ code: "VALIDATION_FAILED", errors: FieldError[], contacts?: ContactErrors[] }` – `ContactErrors = { contactId, displayName, errors: FieldError[] }`; `contacts` samo pri veljavnem zahtevku, vsi prizadeti kontakti, razvrščeni po slovenski abecedi prikaznega imena (R-06).

### SelectionChanged (`409`)

`{ code: "SELECTION_CHANGED", missing: UUID[] }`.

### Vnos revizijske sledi (005, R-13)

| Operacija | `action` | `audit_change` |
|---|---|---|
| bulk-update | `UPDATE` | en zapis na spremenjen kontakt: `before`, `after` (`ContactState`), `display_name` iz `after` |
| bulk-delete | `DELETE` | en zapis na izbrisan kontakt: `before` |

Brez spremenjenih kontaktov ni vnosa. Vnos nastane v isti transakciji (`AuditLog.record`, `Propagation.MANDATORY`).

### ContactIds (`GET …/contact-ids`)

| Polje | Tip | Pomen |
|---|---|---|
| `total` | integer | število zadetkov iskanja in filtrov (008) |
| `ids` | UUID[] | vse identitete zadetkov, če `total ≤ 10 000`; sicer prazno |
| `truncated` | boolean | `total > 10 000` |

### SelectionCheck (`POST …/contacts/selection-check`)

Zahtevek:

| Polje | Tip | Pravila |
|---|---|---|
| `contactIds` | UUID[] | 1–10 000 (trenutni izbor) |
| `queries` | SelectionQuery[] | 0–20; vsota `queries[].contactIds` ≤ 10 000 in vsota `queries[].excludedIds` ≤ 10 000 (sicer `queries` `TOO_MANY`); identiteta največ v eni poizvedbi |

**SelectionQuery:** `q` (string ≤ 200), `f` (string[] ≤ 10), `tag` (string[] ≤ 30) – oblika in validacija 008 (polja napak `queries[i].q`, `queries[i].f[j]` …); `contactIds` (UUID[], ≤ 10 000: izbrani kontakti, ki jih je dodala ta poizvedba); `excludedIds` (UUID[], ≤ 10 000: ročno odznačeni).

Odgovor `200`:

| Polje | Tip | Pomen |
|---|---|---|
| `missing` | UUID[] | izbrani kontakti te skupine, ki ne obstajajo več |
| `queries[i].newMatches` | UUID[] | zdajšnji zadetki poizvedbe, ki niso v `contactIds` zahtevka in ne v `excludedIds` |
| `queries[i].noLongerMatching` | UUID[] | obstoječi kontakti iz `queries[i].contactIds`, ki niso več zadetki |
| `changed` | boolean | kateri koli od zgornjih seznamov ni prazen |

Tuja identiteta (ni v skupini ne v njeni sledi) v katerem koli seznamu → `404`.

## Vmesnik

### Selection (`SelectionProvider`, R-10)

| Polje | Tip | Pomen |
|---|---|---|
| `groupId` | string | izbor velja za eno skupino; ob drugi skupini se ponastavi |
| `ids` | Set<string> | izbrani kontakti, ≤ 10 000 |
| `queries` | SelectionQuery[] | `params` (kanonični `q`/`f`/`tag` iz 008 `toApiParams`), `added: Set<string>`, `deselected: Set<string>` |

Invariante (research R-10, D-73): vsak kontakt je v `added` ali `deselected` največ ene poizvedbe; poizvedbe z enakimi `params` se zlijejo; največ 20 poizvedb in skupaj največ 10 000 `deselected` – ob preseganju se najstarejša poizvedba pozabi (njeni kontakti ostanejo v `ids`).

Operacije: `toggle(id)`, `setPage(ids, selected)`, `addMatches(params, ids)` (unija; > 10 000 → zavrnjeno brez spremembe; prevzame kontakte od starejših poizvedb), `applyCheck(result, removeNoLongerMatching)`, `removeMissing(ids)`, `clear()`. Vse operacije, ki bi presegle 10 000, vrnejo `limit` in ne spremenijo stanja (FR-009-04, Edge Cases).

Stanje glave »Izberi vse na strani«: `checked` (vsi na strani izbrani), `mixed` (nekateri), `unchecked` (nobeden); aktivacija pri `mixed`/`unchecked` izbere vse na strani, pri `checked` jih odznači (Clarify Q4).
