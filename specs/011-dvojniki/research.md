# Research: Iskanje in združevanje podvojenih kontaktov (011)

Vhod: [spec.md](spec.md) (Clarify 2026-11-12, D-89: največ 10 kontaktov v primerjavi, FR-011-21), `feature-map.md` (§2.2, §2.4, §2.6, §2.7, §2.10), obstoječa koda 004/005/008/009 (`ContactService`, `ContactRepository`, `ContactSnapshots`, `AuditLog`, `RollbackService`, `BulkService`, `ContactInputParser`, `GroupAccess`). V Technical Context ni ostalo `NEEDS CLARIFICATION`; tri odločitve, ki jih specifikacija ne določa in so potencialno občutljive, so zbrane v R-16 (O-1 … O-4) in čakajo na potrditev razvijalca.

---

## R-01 Endpointi in poti

- **Decision:** trije novi endpointi pod `/api/groups/{groupId}/duplicates`:
  - `GET …/duplicates?category=&page=&size=` – iskanje skupin dvojnikov (FR-011-02 … FR-011-07);
  - `GET …/duplicates/compare?ids=` – kontakti za tabelo razlik (FR-011-08, FR-011-20, FR-011-21);
  - `POST …/duplicates/merge` – združitev (FR-011-13 … FR-011-17, FR-011-19 … FR-011-21).
  Vsi imajo najnižjo vlogo EDITOR in so **zavrnjeni** v arhivirani skupini (`409 GROUP_ARCHIVED`, tudi iskanje in primerjava, FR-011-19). Dve novi strani vmesnika: `/groups/:groupId/duplicates` in `/groups/:groupId/duplicates/compare`.
- **Rationale:** `GET` za obe branji (parametri so kratki: do 10 UUID ≈ 370 znakov, daleč pod 8 KB omejitvijo nginx/Tomcat – za razliko od 009 z 10 000 identitetami); `POST` za združitev (spreminja stanje, telo z vrednostmi). Primerjava je samostojen endpoint, ker mora vrniti **trenutne** verzije ob odprtju (FR-011-16: konflikt se ugotavlja glede na odprtje primerjave, ne iskanja). Rezultati iskanja niso shranjeni (Key Entities), zato skupina dvojnikov nima identifikatorja – primerjava dobi seznam kontaktov.
- **Alternatives considered:** `GET …/duplicates/{groupKey}` z identifikatorjem skupine – skupina ni shranjena in se spreminja med iskanjem in odprtjem; `POST …/duplicates/compare` – branje ne potrebuje telesa; en endpoint `POST …/contacts/merge` v 004 poti – drugačna najnižja vloga in pravila kot kontakti, težje ločiti v matriki izolacije.

## R-02 Iskanje: izračun v aplikaciji, brez migracije

- **Decision:** `ContactRepository.duplicateCandidates(group)` prebere **vse** kontakte skupine (`id`, `first_name`, `last_name`, `email`, `phone`, `created_at`, `ORDER BY created_at, id`); čista funkcija `DuplicateKeys` izračuna normaliziran ključ izbrane kategorije; `DuplicateGroups` jih zbere v skupine (`LinkedHashMap<ključ, seznam>`), obdrži skupine z ≥ 2 kontakta, razvrsti in izreže stran. Brez nove migracije, brez novih stolpcev, indeksov ali razširitev PostgreSQL.
- **Rationale:** (1) normalizacija (FR-011-03 … FR-011-05) – slovenska diakritika, strnitev presledkov, odstranitev neštevk – je v SQL mogoča samo z `unaccent` (razširitev, ki je ni v migracijah) ali z nedeterministično ICU kolacijo `search_fold` (008), ki je v 008 namenjena iskanju s `strpos()` in omejuje grupiranje; izvedba v Javi je ena resnica, ki jo unit test preveri brez baze; (2) merilo SC-002 je 5000 kontaktov v 3 s: branje 5000 vrstic s 6 stolpci in grupiranje v pomnilniku traja po oceni nekaj deset ms (preverja `DuplicatePerformanceIT`); (3) brez migracije ni konflikta številk `V10` s Patrikovo 010 (R-15).
- **Poraba pomnilnika:** O(število kontaktov skupine) na zahtevek (~100 B/kontakt → 5000 kontaktov ≈ 0,5 MB; 100 000 ≈ 10 MB). Specifikacija ne določa zgornje meje skupine; meja iz 009 (10 000 pri izboru) ne velja. Če se pokaže potreba, je naslednji korak generirani stolpec z normaliziranim ključem + indeks (nova funkcionalnost/CR, ne del 011).
- **Alternatives considered:** SQL `GROUP BY` z `translate`/`lower`/`regexp_replace` – podvaja pravila normalizacije v dveh jezikih, diakritike ne pokrije brez razširitve; shranjeni normalizirani stolpci s sprožilcem (`V10__dvojniki.sql`) – migracija in tveganje konflikta, prepis tabele ob uvedbi, specifikacija ne zahteva; predpomnjenje rezultatov med zahtevki – spec izrecno določa, da so rezultati posnetek in ni shranjenih skupin.

## R-03 Pravila ujemanja (samo tista iz specifikacije)

Funkcija `DuplicateKeys.key(category, contact) → Optional<Key>`; prazen `Optional` = kontakt je izpuščen (FR-011-06).

| Kategorija | Normalizacija (vrstni red) | Ključ | Prazno (izpuščen) | FR |
|---|---|---|---|---|
| `name` | **vsaka od obeh komponent posebej**: razčlenitev Unicode NFD → odstranitev znakov kategorije `\p{M}` (č → c, ó → o) → male črke (`Locale.ROOT`) → strnitev zaporednih presledkov (`[\p{Z}\s]+` → en presledek) → obrez | par (ime, priimek) | oba prazna (ena prazna komponenta je dovoljena: »Janez« + brez priimka se ujema z istim) | 03, 06 |
| `email` | obrez presledkov na začetku in koncu → male črke (`Locale.ROOT`); diakritike in notranjih presledkov se **ne** dotika | niz | prazen po obrezu | 04, 06 |
| `phone` | obdrži samo števke `0-9` → če se niz začne z `00`, se odstrani ta predpona (samo enkrat) | niz števk | brez števk (tudi po odstranitvi `00`) | 05, 06 |

- Zamenjana ime in priimek (»Novak Janez«) nista dvojnik, ker se komponenti primerjata posebej (FR-011-03, scenarij 5). Nacionalna (`041 …`) in mednarodna oblika (`+386 41 …`) se ne pretvarjata (FR-011-05, Assumptions).
- **Brez dodatnih pravil:** brez primerjave podobnosti (Levenshtein, fonetika), brez kombiniranja kategorij, brez ujemanja po naslovu ali atributih, brez prehodnosti čez kategorije. Ena zahteva = ena kategorija (FR-011-02). Prehodnost znotraj kategorije je »zastonj«: vsi kontakti z istim ključem so ena skupina, kontakt je v največ eni skupini (FR-011-07).
- **Omejitev (O-4):** NFD odstrani samo *kombinirne* znake; črke brez razčlenitve (`đ`, `ł`, `ø`) se ne pretvorijo (»Đorđe« ≠ »Dorde«). Specifikacija omenja le diakritična znamenja (primera č, ó); `đ` je v slovenskih imenih redek. Zapisano za potrditev v R-16.
- **Razlog ujemanja** (`reason.value`): vrednost **prvega** kontakta skupine (po `created_at`, `id`), nenormalizirana: pri `name` prikazno ime (ime + presledek + priimek, `ContactRepository.displayName`), pri `email` e-naslov, pri `phone` telefon, kot je shranjen (FR-011-07).

## R-04 Razvrščanje, strani in oblika odgovora iskanja

- **Decision:**
  - Kontakti v skupini: `created_at` naraščajoče, nato `id` naraščajoče (FR-011-07, D-89) – iz SQL `ORDER BY`.
  - Skupine: po `reason.value` z `Collator.getInstance(Locale.forLanguageTag("sl"))`, moč `SECONDARY` (ne glede na velikost črk, razlikuje strešice; enako kot D-63 za razvrščanje kontaktov), nato po `created_at` in `id` prvega kontakta (stabilen, determinističen vrstni red).
  - Paginacija po feature-map §2.6: `size` ∈ {25, 50, 100} (privzeto 25), `page` 0-osno kot v 008 (`ContactQueryParser`); vmesnik v naslovu uporablja 1-osno `page` kot revizijska sled. Neveljaven `page`/`size`/`category` → `400 VALIDATION_FAILED` (`INVALID_VALUE`, polje `category` je obvezno: `REQUIRED`). Stran prek zadnje → `200` s praznim `groups` in pravim `total`; vmesnik preusmeri na zadnjo stran.
  - Odgovor: `{category, total, page, size, groups:[{reason:{category,value}, size, contacts:[{id, displayName}]}]}`; `contacts` vsebuje **vse** kontakte skupine (D-89: kartice prikazujejo celotno skupino); `total` = število skupin dvojnikov (ne kontaktov).
- **Rationale:** `Collator` v JVM je enak za vse vloge in neodvisen od jezika vmesnika; test razvrščanja uporablja samo črke in števke (ne ločil), da se izogne razlikam med JDK in ICU (008). Stabilna razvrstitev je pogoj za paginacijo brez ponavljanja ali izpusta.
- **Alternatives considered:** razvrščanje po velikosti skupine – spec določa abecedno po razlogu; `LIMIT/OFFSET` v SQL – skupine nastanejo šele po grupiranju.

## R-05 Primerjava: izbor 10 kontaktov, izbrisani in tuji

- **Decision:** `GET …/duplicates/compare?ids=a,b,…` sprejme 2–10 različnih UUID (`ids` je lahko ponovljen parameter ali seznam, ločen z vejicami). Postopek: (1) identitete, ki so veljavni UUID, se razvrstijo kot v 009 R-02 – obstoječ kontakt te skupine; **izbrisan** (je v `audit_change` vnosa te skupine: `ContactRepository.knownToGroup`); **tuj** (ni ne v `contact` ne v sledi te skupine) → `404`; (2) odgovor vsebuje samo obstoječe kontakte, razvrščene po `created_at`, `id` (ne glede na vrstni red v zahtevku), z `version`, `createdAt`, vsemi polji, atributi in značkami; (3) če je obstoječih manj kot 2, je odgovor še vedno `200` z manj kontakti – vmesnik prikaže »Te skupine dvojnikov ni več.« in povezavo na osvežene rezultate (FR-011-16, Edge Cases).
- **Izbor prvih 10 (D-89):** *izbere ga vmesnik iz kartice*, ker kartica že vsebuje vse kontakte skupine razvrščene po `created_at`, `id` (R-04); strežnik zahteva samo ≤ 10 identitet in jih vrne razvrščene. Več kot 10 ali manj kot 2 različnih → `400 VALIDATION_FAILED` (`ids`: `TOO_MANY` pri > 10, `REQUIRED` pri < 2 različnih ali brez parametra; ponovljen id: `DUPLICATE`; neveljaven UUID: `INVALID_VALUE` – obstoječi nabor kod 004/008/009, brez nove kode).
- **Rationale:** strežnik ne ugiba, kateri kontakti so »skupina« (skupina ni shranjena); determinizem izbora je v razvrstitvi, ki ju zagotavljata iskanje in primerjava z istim ključem (`created_at`, `id`). Izbrisan kontakt ni `404`, ker bi `404` v tem primeru urednika zavedel, da je napaka v naslovu (Assumptions: »Zbrisan kontakt … je 409/ni več«).
- **Znana omejitev** (kot 009 R-02, D-73): kontakt, izbrisan pred uvedbo beleženja 005, nima vnosa v sledi in dobi `404` namesto »ni več«; vmesnik obe obravnava kot »kontakt ne obstaja več« (produkcijskih podatkov iz tega časa ni).
- **Alternatives considered:** strežnik vrne skupino po ključu (`category` + `value`) – ponovno iskanje, odvisno od sočasnih sprememb; `404` za izbrisane – ne ustreza FR-011-16.

## R-06 Združitev: oblika zahtevka, ohranjeni kontakt, validacija rezultata

- **Decision:** `POST …/duplicates/merge`, telo:
  ```json
  { "contacts": [ {"id": "uuid", "version": 3}, … ],
    "result": { "firstName": "Janez", "lastName": "Novak", "address": null, "email": "janez@primer.si",
                "phone": "041 111 222", "attributes": [{"key": "Kompetenca", "value": "web dev"}],
                "tags": ["vip", "alumni"] } }
  ```
  - `contacts`: 2–10 različnih elementov z `id` (UUID) in `version` (celo število ≥ 0). **Ohranjeni kontakt določi strežnik**: najstarejši po `created_at`, nato `id` med `contacts` (FR-011-11, Assumptions: »ohrani se prvi«). Odjemalec ga ne pošilja, zato ne more ohraniti drugega kot po pravilu; po izločitvi je ohranjen prvi preostali.
  - `result`: končne vrednosti združenega kontakta (kar vmesnik prikazuje v predogledu). Strežnik **ne preverja izvora** posamezne vrednosti (Assumptions: »izvora … ne preverja«), preveri pa jo po slovarju podatkov z obstoječim `ContactInputParser.parseCreate` (vsaj ime ali priimek; dolžine; oblika e-naslova in telefona; ≤ 50 atributov, edinstveni ključi brez razlike velikosti črk, rezerviranih ključev ni; ≤ 30 značk, edinstvene brez razlike velikosti črk; neznano polje → `UNKNOWN_FIELD`), napake pa predpona `result.` (npr. `result.firstName`, `result.tags`).
  - Odgovor `200`: `{keptContactId, keptDisplayName, mergedCount, auditEntryId}`.
- **Rationale:** pošiljanje končnih vrednosti (ne izbir »polje → kontakt«) naredi strežnik neodvisen od oblike tabele razlik in ujame vse kršitve slovarja na enem mestu; hkrati ostane test neodvisen od implementacije vmesnika. Reuse `ContactInputParser` pomeni, da se pravila slovarja ne podvajajo (004, 009 uporabljata isti razčlenjevalnik).
- **Alternatives considered:** pošiljanje izbir po poljih (`{"phone": {"from": "<id>"}}`) – strežnik bi moral implementirati pravila privzetih izbir in izvor vrednosti, spec tega ne zahteva; pošiljanje ohranjenega kontakta – odpira vprašanje, kaj ob neskladju s pravilom (FR-011-11 ga določa deterministično).

## R-07 Vrstni red preverjanj združitve in branj

- **Decision (feature-map §2.2, D-41, 009 R-02):** `401` → `404` (skupina, nečlan **ali** vsaj ena identiteta, ki nikoli ni bila kontakt te skupine) → `403` (VIEWER, tudi v arhivirani skupini) → `409 GROUP_ARCHIVED` → `400` (**zgradba zahtevka**: telo ni JSON, število 2–10, različnost, `version` manjka ali ni število) → `409 VERSION_CONFLICT` (katerikoli vključeni kontakt spremenjen ali izbrisan) → `400` (**rezultat**: slovar podatkov, `result.*`). Iskanje in primerjava: 401 → 404 → 403 → 409 → 400 (parametri; za primerjavo najprej identitete).
- **Pomembno:** (a) pri več kot 10 identitetah v telesu se baza za korak 404 ne obišče (kot 009 R-15); nato 403 → 409 → `400 TOO_MANY` – zato `400` ob prevelikem številu velja kot zahteva D-89, ne glede na to, ali so kontakti sicer veljavni; (b) `VERSION_CONFLICT` pred `VALIDATION_FAILED` rezultata je skladen s `ContactService.update` (zastarela verzija je konflikt tudi ob neveljavnih podatkih); (c) `403` pred `409 GROUP_ARCHIVED`: VIEWER arhivirane skupine dobi `403`.
- **Rationale:** enak vrstni red kot v ostalih funkcionalnostih, zato isti tipi izjem in rokovalniki; nobena nova koda napake (`VALIDATION_FAILED`, `VERSION_CONFLICT`, `GROUP_ARCHIVED` so v registru §2.10).

## R-08 Atomarnost, zaklepanje in sočasnost

- **Decision:** ena `@Transactional` metoda `DuplicateService.merge`: (1) `contacts.lockGroupArchived(group)` – `FOR SHARE` na skupini (počaka na sočasno arhiviranje in rollback; arhivirana → `GroupArchivedException`); (2) `contacts.lockExisting(group, ids)` – `FOR UPDATE` v **naraščajočem vrstnem redu `id`** (obstoječa metoda); (3) razvrstitev manjkajočih (R-05): manjkajoč a znan → `VersionConflictException`; (4) primerjava poslanih verzij s trenutnimi; (5) `snapshots.load` stanj **prej**; (6) izračun in validacija rezultata (če še ni); (7) zapis ohranjenega + brisanje ostalih; (8) en vnos `MERGE` prek `AuditLog.record`. Katera koli izjema razveljavi vse (FR-011-15).
- **Rationale:** vrstni red `id` je enak kot pri `BulkService` (009 R-03), zato se dve prekrivajoči se operaciji (združitev + množično urejanje, dve združitvi) serializirata in ne zastojita. Posamično urejanje/izbris (004) zaklene isto vrstico `FOR UPDATE`, zato združitev po urejanju dobi `VERSION_CONFLICT`, urejanje po združitvi pa `404`/`VERSION_CONFLICT` (kontakt je izbrisan, a znan). Rollback (005) zaklene skupino `FOR UPDATE`; združitev (`FOR SHARE`) počaka in po njegovem koncu zavrne zastarele verzije (FR-005-13: obnovljeni kontakti imajo višjo verzijo) – zastoja ni, ker vsi pisalci najprej zaklenejo skupino, nato kontakte, nato glavo sledi.
- **Preprečevanje izgubljenih sprememb:** zahtevek nosi verzijo **vsakega** kontakta, ki ga je uporabnik videl; sprememba kateregakoli (tudi neizbranega za vrednost) ali izbris → `409 VERSION_CONFLICT`, nič se ne spremeni (SC-004). Kontakt zunaj `contacts` (ostali iz skupine > 10, izločeni) ni zaklenjen in ni spremenjen.
- **Dva urednika hkrati:** prvi uspe; drugi najde izbrisane (znane) kontakte → `409 VERSION_CONFLICT`; vmesnik ponovno naloži primerjavo (`GET compare`), dobi < 2 kontakta in pokaže »Te skupine dvojnikov ni več.« (Edge Cases).
- **Alternatives considered:** `SERIALIZABLE` – ponavljanje in nepotrebna kompleksnost; zaklep samo ohranjenega kontakta – ostali bi lahko bili sočasno spremenjeni, FR-011-16 zahteva zavrnitev.

## R-09 Zapis združitve in vnos revizijske sledi (pogodba 005)

- **Decision:**
  - **Ohranjeni kontakt:** nov `ContactSnapshots.replaceMerged(group, actor, keeperId, after)` – `UPDATE contact` z `first_name`, `last_name`, `address`, `email`, `phone`, **ključema razvrščanja** `sort_last`/`sort_first` (kot pri vstavljanju v `ContactSnapshots`/`ContactRepository`), `version = version + 1`, `updated_by = actor`, `updated_at = now()`, `reverted_entry_id = NULL`; atributi in značke se zamenjajo (brisanje + vstavitev z obstoječim `insertChildren`). Obstoječa `replaceContent` ne posodablja imena, zato je potrebna nova metoda (kratka, ob njej unit test ključev razvrščanja v integracijskem testu).
  - **Ostali:** `ContactRepository.deleteAll(group, ids)` (kaskada odstrani atribute in značke).
  - **Vnos:** `audit.record(group, actor, AuditAction.MERGE, changes)`; `changes[0]` = ohranjeni `(before, after)` z imenom iz `after`; `changes[1..]` = ostali `(before, null)` v vrstnem redu `created_at`, `id` z imenom iz `before`. `after` ohranjenega se prebere iz baze po zapisu (kot `BulkService.update`), da vsebuje pravo `version`/`updatedAt`/`updatedById`. Vnos je **en** (FR-011-17), `contact_count = N`, `contact_name = NULL` (N ≥ 2). `AuditLog.validate` za `MERGE` zahteva `before != null` pri vseh – izpolnjeno.
  - **Verzija ohranjenega se poveča vedno**, tudi če se vrednosti ne spremenijo (O-3 v R-16): združitev je operacija nad njim in vnos jo beleži; sočasno odprt obrazec urejanja z staro verzijo mora dobiti `VERSION_CONFLICT`, ker kontakt zdaj predstavlja več kontaktov.
  - **Povezave:** ni tujih ključev na `contact` razen `contact_attribute`/`contact_tag` (V4) z `ON DELETE CASCADE`; `audit_change.contact_id` namenoma brez tujega ključa (005 data-model). Povezava na ohranjeni kontakt ostane enaka (isti `id`); povezave na izbrisane vrnejo »Te strani ni« (FR-011-15, obstoječe vedenje 004).
- **Rationale:** vse v isti transakciji kot vnos (FR-005-04); vnos hrani **celotno** stanje prej za vse kontakte (R-10).

## R-10 Razveljavitev združitve (rollback) – analiza in odločitev

**Dejstvo:** specifikacija 011 (FR-011-17, SC-005) in 005 (FR-005-11 … FR-005-15, Edge Cases »Rollback na vnos združevanje«) že določata razveljavitev: **rollback skupine na točko tik pred združitvijo** (`POST /api/groups/{groupId}/audit/{entryId}/rollback` ali `…/audit/initial-state/rollback`, ADMIN+, nearhivirana). 011 **ne uvaja** lastnega endpointa za razveljavitev in lastne tabele; zagotovi samo pravilen vnos `MERGE`.

- **Katere podatke je treba shraniti:** ničesar novega. Vnos `audit_entry` (`action = MERGE`) + `audit_change` za vsak vključeni kontakt hrani `before` = celoten `ContactState` (polja, atributi z ključem, vrednostjo in vrstnim redom, značke z vrstnim redom, `version`, `createdAt`, `updatedAt`, `updatedById`); ohranjeni ima tudi `after`, izbrisani `after = NULL`. To je dovolj za popolno obnovo (preverjeno: `contact` nima drugih stolpcev ali tabel, ki bi se izgubili – `reverted_entry_id` se ponastavi z rollbackom).
- **Kako se obnovijo originalni kontakti:** `RollbackService` izračuna stanje skupine v točki T = vnos tik pred združitvijo: za vsak kontakt, ki ga je spremenil vnos s `seq > T`, vzame `before` njegove prve spremembe po T (`AuditRepository.statesAfter`). Za združitev so to `before` ohranjenega in `before` vseh izbrisanih → ohranjeni dobi prejšnje vrednosti, izbrisani se **obnovijo z istim `id`**, atributi in značkami (`ContactSnapshots.apply` – `INSERT` obnovljenih, zamenjava otrok), `version = max(prejšnje, največja v sledi) + 1` (FR-005-13), oznaka *Povrnjeno* (FR-005-19). Brez spremembe `RollbackService` – 011 doda samo teste, ki to pogodbo preverijo za vnos `MERGE` (`MergeRollbackIT`).
- **Kdo sme:** ADMIN in OWNER nearhivirane skupine (FR-005-11, -17); EDITOR ne more razveljaviti lastne združitve (`403`); arhivirana skupina `409 GROUP_ARCHIVED` (ADMIN, OWNER).
- **Ohranjeni kontakt je bil po združitvi ponovno spremenjen:** rollback na točko pred združitvijo **po zasnovi 005 vrne vso skupino** v stanje v T – torej tudi poznejše urejanje ohranjenega kontakta in vse druge poznejše spremembe v skupini se prekrijejo z vrednostmi iz T (FR-005-11). To ni tiha izguba: (1) pred izvedbo je potrditveni dialog s posledico (FR-005-16, design.md 9.6); (2) zahtevek nosi najnovejši vnos celotne sledi – če se je sled po odprtju spremenila → `409 VERSION_CONFLICT` (FR-005-14), torej admin ne povozi sprememb, ki jih ni videl; (3) vsi poznejši vnosi ostanejo v sledi in rollback je nov vnos – razveljavi se z rollbackom na vnos tik pred njim (FR-005-12), ki obnovi tudi poznejše urejanje.
- **Dvojni rollback in sočasni zahtevki:** drugi hkratni rollback → `409 VERSION_CONFLICT` (najnovejši vnos se je spremenil); ponovni rollback na isto točko s svežim `latestEntryId` → `409 ROLLBACK_NO_CHANGES` (stanje je že v T); rollback med združitvijo → združitev počaka na zaklep skupine in nato dobi `409 VERSION_CONFLICT` (R-08). Atomarnost in sledljivost: ena transakcija z vnosom `ROLLBACK`, ki se sklicuje na ciljni vnos (005 R-04, R-05).
- **Rollback na sam vnos `MERGE`** (točka T = združitev): združeni kontakt ima stanje takoj po združitvi, izbrisani ostanejo izbrisani; spremeni se le to, kar je bilo po združitvi (Edge Cases 005).
- **Vmesnik 011:** po uspešni združitvi obvestilo vsebuje povezavo »Odpri revizijsko sled« na `/groups/:groupId/audit` (O-2); gumb »Povrni skupino na to točko« je že v 005 in ga vidita samo admin in lastnik. 011 ne duplicira dialoga rollbacka.
- **Odprta odločitev (O-1):** *ciljna* razveljavitev samo te združitve (obnovi samo izbrisane kontakte in ohranjeni kontakt, ne da bi povozila druge poznejše spremembe v skupini) specifikaciji **ni zahtevana** in je ne načrtujemo; uporabnik, ki hoče »razveljavi samo to združitev«, jo z rollbackom skupine dobi skupaj z vsemi poznejšimi spremembami. Izbira vedenja ob poznejšem urejanju ohranjenega kontakta (zavrniti ali prepisati) bi bila pri ciljni razveljavitvi destruktivna odločitev, zato je izpostavljena razvijalcu, ne izbrana tiho (R-16).

## R-11 Vmesnik: iskanje, kartice in zavihek

- **Decision:**
  - Razdelek `duplicates` v `GroupLayout` (poleg `contacts`, `audit`, `settings`); podpoti `duplicates` in `duplicates/compare`; drugo → »Te strani ni«.
  - Zavihek »Dvojniki« v `GroupHeader` samo za EDITOR+ v nearhivirani skupini (FR-011-01, design.md 7.1), med »Kontakti« in »Revizijska sled«. Ob neposredni poti: bralec ali arhivirana skupina → razlaga + povezava »Na kontakte skupine« (brez klica API).
  - `DuplicateSearchForm`: skupina izbirnih gumbov »Kategorija« (`fieldset`/`legend`, `radiogroup`), privzeto »Ime in priimek«, gumb »Poišči dvojnike«. **Naslov (URL)** po iskanju vsebuje `category`, `page`, `size`; `/duplicates` brez `category` pokaže samo obrazec; z `category` naloži rezultate (osvežitev in *Nazaj* ohranita rezultat, FR-011-02).
  - `DuplicateCard`: `li` s poimenovano skupino (naslov = razlog), imena kontaktov, gumb »Primerjaj in združi«. Skupine z > 10 kontakti: prvih 10 (ki gredo v primerjavo) je v seznamu, ostali so v `details` »Še N kontaktov« (D-89: celotna skupina je vidna; ni skrita). Povezava na primerjavo: `ids` = prvih 10, `total` = velikost skupine.
  - Paginacija: obstoječa `SectionPagination` (nav »Strani rezultatov«), fokus na naslov rezultatov ob menjavi strani; prazno stanje (design.md 8.15) »Ni dvojnikov po kategoriji ‹kategorija›.«; napaka nalaganja trajno sporočilo z *Poskusi znova* (8.13).
- **Rationale:** brez novih knjižnic; vzorec URL-ja in paginacije kot revizijska sled (005) in seznam (008).

## R-12 Vmesnik: tabela razlik, model izbir in predogled

- **Decision:** čista funkcija `mergeModel.ts` (brez React, unit testi) je ena resnica za: vrstice (predefinirana polja v vrstnem redu »Ime, Priimek, Naslov, E-naslov, Telefon«, nato po ena vrstica na ključ dodatnega atributa brez razlike velikosti črk, nato »Značke«), privzete izbire (prva neprazna vrednost po vrstnem redu, FR-011-09), strnitev enakih vrstic v »Enaka polja (N)«, unijo značk (brez razlike velikosti črk, zapis prvega kontakta, FR-011-10), izločitev kontakta (izbire, ki so kazale na izločenega, se vrnejo na privzete, FR-011-11), gradnjo `result` za predogled in zahtevek, odjemalsko validacijo (ime/priimek, ≤ 30 značk, ≤ 50 atributov).
  - **Izbira vrednosti:** vsaka vrstica razen značk je `fieldset` z `legend` = ime polja in izbirnimi gumbi **različnih** vrednosti (»(prazno)« + vsaka različna vrednost, FR-011-09); opis izbirnega gumba navaja kontakte, ki to vrednost imajo. Atribut: ključ vrstice brez razlike velikosti črk; rezultat dobi zapis ključa iz kontakta, katerega vrednost je izbrana; »(prazno)« = atributa ni.
  - **Značke:** `fieldset` »Značke« s potrditvenimi polji, privzeto vse obkljukane.
  - **Zgradba:** en DOM za vse širine. ≥ 640 px: glava s stolpci kontaktov (ime, »Ostane« pri prvem, gumb »Izloči iz združevanja«) in mreža (CSS grid), v kateri je vsaka vrstica fieldset; < 640 px: zaporedje fieldsetov z vrednostmi kot izbirnimi gumbi (design.md 9.5). Brez `<table>`, ker `fieldset` ne more biti vrstica tabele; vodoravno drsenje samo znotraj mreže ≥ 640 px (320 px brez vodoravnega drsenja strani, WCAG 1.4.10).
  - **Predogled:** `section` »Predogled združenega kontakta« pod mrežo, posodobljen ob vsaki spremembi; tipkovnica: vrstni red fokusa vrstice → predogled → »Združi kontakte«.
  - **Izločitev:** gumb »Izloči iz združevanja« v glavi stolpca; pri 2 kontaktih gumbov ni, namesto njih razlaga »Združiti je treba vsaj 2 kontakta.« Izločeni se odstranijo iz `ids` v naslovu (`replace`), da osvežitev ohrani izločitev; razlaga »Prikazanih je prvih 10 od N kontaktov.« ostane vidna (`total` iz naslova, samo prikaz).
  - **Združi:** odjemalska validacija pred dialogom (napaka ob vrstici »Ime« / »Značke« / »Dodatni atributi«, fokus na prvo napako); nato `alertdialog` (design.md 8.11) »Združim N kontaktov?« s fokusom na »Prekliči« in nevarnim gumbom »Združi N kontaktov«; med pošiljanjem `aria-disabled`.
  - **Izidi:** `200` → toast »Združenih kontaktov: N. Ostal je kontakt ‹ime›.« z povezavo »Odpri revizijsko sled«, navigacija na rezultate iste kategorije/strani (`replace`); `409 VERSION_CONFLICT` → ponovno `GET compare` z ostalimi `ids`, izbire na privzete (izločitve se **ohranijo** – varnejše, uporabnik jih je izbral zavestno), opozorilo (`role="alert"`) »Kontakti so se medtem spremenili. Primerjava je osvežena – preglej izbire in znova združi.«; < 2 kontakta → navigacija na rezultate z obvestilom »Te skupine dvojnikov ni več.« (`role="status"`); `400 VALIDATION_FAILED` → napake `result.*` ob vrsticah; `403`/`409 GROUP_ARCHIVED` → sporočilo kot pri 004/009; omrežna/`5xx` napaka → `role="alert"` z *Poskusi znova*, izbire ostanejo (FR-011-18).
- **Rationale:** model v čisti funkciji omogoča test-first (Vitest) vseh pravil FR-011-09 … 12 brez izrisa; en DOM prepreči podvajanje komponent in testov za mobilni/namizni prikaz.
- **Alternatives considered:** `<table>` z radio gumbi v celicah – ne pokrije `fieldset`/`legend` iz spec in design.md 9.5; dve ločeni komponenti (namizna/mobilna) – podvajanje in dvakratni testi.

## R-13 Prevodi (sl/en) in sklanjanje

- Ključi pod `duplicates.*` v `i18n/sl.json` in `en.json`; sl množinske oblike `one`/`two`/`few`/`other` (kot 009 R-12) za: »Združim N kontaktov?« (2 kontakta, 3–4 kontakte, 5–10 kontaktov), »Združi N kontaktov«, »ostala 2 bosta izbrisana« / »ostali 3 bodo izbrisani« / »ostalih 5 bo izbrisanih« (dvojina, tri-štiri, več), »Prikazanih je prvih 10 od N kontaktov.«, »Še N kontaktov«. »Združenih kontaktov: N.« je enaka oblika za vse N.
- Brez tehničnih kod v vmesniku; napake strežnika se preslikajo po `code` in polju. Besedilo napake pri > 50 atributih (spec ga ne navaja): »Kontakt ima lahko največ 50 dodatnih atributov – izberi »(prazno)« pri vsaj N.« / "A contact can have at most 50 custom attributes – choose "(empty)" for at least N." (predpostavka za pregled PR).

## R-14 Testna strategija (test-first, brez podvajanja)

- **Unit (brez baze):** `DuplicateKeysTest` (vse tri normalizacije in prazne vrednosti, FR-011-03 … 06), `DuplicateGroupsTest` (grupiranje, prehodnost, ≥ 2, razvrščanje, strani), `MergeInputParserTest` (zgradba: 2–10, različnost, verzije), `mergeModel.test.ts` (privzete izbire, strnitev, unija značk, izločitev, validacija).
- **Integracijski (Testcontainers + Firebase Auth Emulator):** `DuplicateSearchIT` (kategorije, URL parametri, strani 25/50/100, prazno), `DuplicateCompareIT` (stolpci, izbrisan/tuj/prekratek/predolg), `MergeIT` (vrednosti, značke, atributi, ohranjeni = najstarejši, ostali izbrisani, ime razvrščanja posodobljeno), `MergeAtomicityIT` (vsiljena napaka med brisanjem/zapisom sledi → nič se ne spremeni), `MergeValidationIT` (400 po poljih, > 10, < 2, podvojen id), `MergeVersionConflictIT` (spremenjen/izbrisan kontakt → 409, nič se ne spremeni), `MergeConcurrencyIT` (dve združitvi, združitev + urejanje, združitev + množično urejanje, združitev + rollback; brez zastoja), `MergeAuditIT` (natanko en vnos `MERGE`, stanja prej/potem), `MergeRollbackIT` (rollback pred/na vnos `MERGE`, poznejše urejanje ohranjenega, dvojni rollback, razveljavitev rollbacka), `DuplicateArchivedIT`, `DuplicateLogIT` (dnevnik brez imen, e-naslovov, telefonov), `DuplicatePerformanceIT` (5000 kontaktov, SC-002). Varnostni: `DuplicateIsolationMatrixSecurityIT` (vsi trije endpointi: 401 / 404 / 403 / 409 / 2xx; tuj kontakt druge skupine).
- **FE (Vitest + RTL + MSW + vitest-axe):** `DuplicatesPage.test` (zavihek, bralec/arhiva razlaga, obrazec, URL), `DuplicateResults.test` (kartice, strani, prazno, napaka, `details` pri > 10), `ComparePage.test` (vrstice, izbire, enaka polja, značke, predogled, izločitev, 10 od N), `MergeFlow.test` (validacija, dialog, uspeh, 409, < 2, 400, omrežna napaka), `CompareA11y.test` (axe, tipkovnica), `mergeModel.test.ts`.
- **E2E (`e2e/tests/dvojniki.spec.ts`, 360/768/1280 px, axe):** iskanje po e-naslovu → primerjava → združitev (SC-001: 4 kliki) → revizijska sled; > 10 kontaktov; konflikt z drugim uporabnikom; bralec nima zavihka; rollback admina povrne kontakte (celotna veriga 011 + 005).
- **Regresija 000–009:** ne spreminja se nobena obstoječa pogodba; `verify.sh full` teče nad celotnim sistemom. Edina sprememba obstoječih datotek so dopolnitve (zavihek, ruta, `ContactRepository`, `ContactSnapshots`, `ApiExceptionHandler` ni potreben, i18n, msw privzeti rokovalniki).
- **Pomen testa je neodvisen od implementacije:** testi kličejo samo REST in dostopna imena iz `plan.md`; stanje preverjajo prek `GET …/contacts`, `GET …/audit` in `GET …/audit/{id}/changes`, ne prek notranjih razredov.

## R-15 Vzporedna 010 (Patrik) in skupne datoteke

Stanje ob izdelavi načrta: veja `izvoz-excel` ni potisnjena v `origin` (ob `git fetch` 2026-11-12 je `origin/main` = `118e3f0`); `specs/010-izvoz-excel/` vsebuje samo `spec.md` in `checklists/`. Analiza je zato narejena nad spec 010 in nad dejanskim stanjem `main`; **ponovno preveriti pred PR** (`git fetch`, `git diff origin/main..origin/izvoz-excel --stat`).

| Področje | 011 | 010 | Tveganje |
|---|---|---|---|
| Migracije Flyway | **brez** (R-02) | po spec 010 izvoz ne shranjuje podatkov → pričakovano brez | nizko; `MigrationVersionsUniqueTest` ujame |
| Model kontakta | samo dodatek metode `ContactSnapshots.replaceMerged`; brez spremembe stolpcev | bere kontakte (izvoz), brez sprememb modela | nizko |
| `ContactRepository` / `ContactSnapshots` | dodane metode (`duplicateCandidates`, `replaceMerged`) | lahko doda `ContactRepository.exportRows…`/podobno | srednje: oba dodajata v isto datoteko → konflikt pri združevanju, razrešitev je mehanska (dodatki na koncu razreda) |
| `ApiExceptionHandler`, `SecurityConfig` | brez sprememb | morda nova koda `EXPORT_EMPTY` (feature-map §2.10) | nizko |
| `DECISIONS.md` | D-90 … (R-16) | tudi novi D-NN | **visoko**: skupna zaporedna številka; ob konfliktu se 011 vnosi preštevilčijo (kot pri 012, D-84) – številke v dokumentih 011 se zato pred PR preverijo (`git grep "D-9"`) |
| Oznake `CR-NN` | 011 ne uvaja novih CR (Clarify D-89 je pred planom) | lahko uvede CR | nizko; številčenje enotno, preveri ob PR |
| FE: `GroupLayout`, `GroupHeader`, `i18n/{sl,en}.json`, `test/msw.ts` | nov razdelek `duplicates`, ključi `duplicates.*` | akcijska vrstica izbora (`SelectionActionBar`) dobi gumb *Izvozi v Excel*, ključi `export.*` | srednje: `GroupLayout`/`GroupHeader`/`sl.json`/`en.json`/`msw.ts` so skupne; konflikti so na ločenih blokih (ključi `duplicates.*` v sklenjenem bloku, rokovalniki 011 na koncu `msw.ts`) |
| Revizijska sled (005) | uporablja `MERGE` (že podprt: `AuditAction`, `ChangeDiff`, `sl.json` `MERGE_count_*`) | izvoz ne beleži vnosov | brez konflikta |
| Izbor kontaktov (009) | 011 ga **ne** uporablja (skupina dvojnikov ni izbor) | uporablja `SelectionProvider` | brez konflikta |

- **Pravilo:** 011 se razvija v veji `dvojniki` iz `origin/main`; ne dotika se Patrikove veje in ne izvaja `merge`/`rebase` brez navodila. Skupne datoteke se spreminjajo z majhnimi, samostojnimi dodatki.

## R-16 Odločitve, ki čakajo na potrditev razvijalca

| # | Vprašanje | Priporočilo | Če razvijalec zavrne |
|---|---|---|---|
| **O-1** | Razveljavitev združitve = rollback skupine iz 005 (vse poznejše spremembe v skupini se prekrijejo, a ostanejo v sledi in so obnovljive). Ali potrebujemo še *ciljno* razveljavitev samo te združitve? | **Ne v 011.** Ni v spec/SC-005; ciljna razveljavitev odpira destruktivno vprašanje, kaj ob poznejši spremembi ohranjenega kontakta (zavrniti z `409` ali prepisati). Če jo želiš, jo uvedi kot CR z jasnim pravilom (npr. `409` ob vsaki poznejši spremembi). | nov CR za 005/011 pred Tasks |
| **O-2** | V toast uspeha dodati povezavo »Odpri revizijsko sled« (spec določa le besedilo obvestila). | Da – nič ne spreminja besedila, omogoča hitro pot do rollbacka (admin) ali pregleda (urednik). | povezavo odstranimo |
| **O-3** | Verzija ohranjenega kontakta se poveča vedno (tudi če se njegove vrednosti ne spremenijo). | Da (R-09). | `version + 1` samo ob dejanski spremembi vrednosti |
| **O-4** | Normalizacija imen z Unicode NFD: `đ`, `ł`, `ø` se ne pretvorijo (»Đorđe« ≠ »Dorde«). | Sprejeti – spec zahteva samo diakritična znamenja; alternativa (tabela dodatnih preslikav) je dodatno pravilo, ki ga spec ne navaja. | dodamo preslikave (CR v spec) |

Odločitve, ki jih sprejme plan sam in jih zapiše v `DECISIONS.md`: R-01 (endpointi), R-02 (izračun v aplikaciji, brez migracije), R-06 (oblika zahtevka), R-07 (vrstni red preverjanj), R-10 (rollback = 005), R-12 (en DOM za tabelo razlik; izločitve se ohranijo ob konfliktu).
