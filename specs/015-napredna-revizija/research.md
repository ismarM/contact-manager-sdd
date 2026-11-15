# Research: Napredna revizijska sled in zgodovina kontakta

## R-01 Zgodovina kontakta brez nove tabele

- **Odločitev**: zgodovina kontakta je poizvedba `audit_change c JOIN audit_entry e ON e.id = c.entry_id WHERE e.group_id = :group AND c.contact_id = :contact ORDER BY e.seq DESC` (stran 25/50/100). Obstoječi indeks `audit_change_contact (contact_id, entry_id)` omogoča iskanje po kontaktu; `group_id` se preveri na `audit_entry` (izolacija).
- **Dogodek** = ena vrstica `audit_change` + glava vnosa (čas, izvajalec, vrsta). Spremenjena polja: `ChangeDiff.fields(before, after)` (R-03 iz 005), izračunana ob branju strani (največ 100 dogodkov). Za vnose z 1.000 kontakti se bere samo vrstica tega kontakta, ne celoten vnos.
- **Izbrisan/združen**: kontakt brez vrstice v `contact`, a z vrsticami v sledi, ima zgodovino enako kot obstoječ; `status` izpeljan iz zadnje vrstice (`after IS NULL` → odstranjen; vrsta `MERGE` → združen). Ohranjeni kontakt združitve ima v isti vrstici `before` in `after` (`MERGE`), odstranjeni samo `before`; ime ohranjenega najde druga vrstica istega vnosa z `after IS NOT NULL`.
- **Brez zabeleženih sprememb**: obstoječ kontakt brez vrstic → 200 s praznim seznamom; kontakt, ki ni ne v `contact` ne v sledi te skupine (tudi iz druge skupine) → 404.
- **Zavrnjeno**: ločena tabela zgodovine (podvajanje, razhajanje od sledi); `contact_version` tabela (isto).

## R-02 Različice

- **Različica** po vnosu E: `audit_change.after` vrstice (E, kontakt); vnosi z `after IS NULL` (odstranjevanje, združitev odstranjenega) različice nimajo. `initial`: `before` prve vrstice kontakta v sledi, če je `before IS NOT NULL` (kontakt je obstajal pred beleženjem); sicer `initial` ne obstaja (404). `current`: živ kontakt prek `ContactSnapshots.load`.
- Različica druge skupine ali drugega kontakta → 404 (poizvedba po `(entry_id, contact_id)` z `e.group_id`).
- Primerjava `from`/`to`: `ChangeDiff.fields(from, to)`; odgovor vsebuje obe stanji (`VersionView`), da vmesnik prikaže nespremenjena polja na zahtevo (spec FR-015-09). Isti ref za `from` in `to` → 400 `INVALID_VALUE`.
- Stanja pred 013 nimajo `company`/`country` → `ContactState` jih bere kot `null` (obstoječe vedenje).

## R-03 Filter po izvajalcu

- **Žeton**: `audit_entry.actor_id` je interni bigint; v API ga ne izpostavimo (obstoječe pravilo: opaki `memberId`). Žeton izvajalca = prvih 16 bajtov `sha256(group_id || ':' || actor_id)` kot uuid, izračunan v SQL; stabilen, po skupinah različen, brez razkritja števca. Izbrisan uporabnik (`actor_id IS NULL`) = žeton `deleted`.
- **Seznam izvajalcev** (`GET /audit/actors`): `SELECT DISTINCT actor_id FROM audit_entry WHERE group_id = :group` + podatki iz `app_user` in `group_member` (član ali nekdanji član), plus postavka `deleted`, če obstaja vnos z `actor_id IS NULL`. Vrstni red: člani, nekdanji člani (po imenu), izbrisan uporabnik zadnji. Prikaz imena/e-naslova enak kot v sledi 005 (ne razkrije več, kot sled že kaže).
- **Filter** `actor=`: preslikava žeton → `actor_id` z isto poizvedbo `DISTINCT` (omejena na skupino), nato `e.actor_id = :id` (ali `IS NULL`). Neznan žeton → prazen seznam (200), oblika ni uuid ali `deleted` → `400 INVALID_VALUE`. Kombinacija z `action` in `contact` je `AND`, število in paginacija sta po istem `where`.
- **Indeks**: `audit_entry_group_actor (group_id, actor_id, seq DESC)` (tudi za `DISTINCT`).
- `latestEntryId` ostane vnos celotne sledi (FR-015-04, nespremenjeno).

## R-04 Vrsta dejanja RESTORE (odločitev Q2)

- `audit_entry.action` dobi `RESTORE`; `audit_entry_target`: `action IN ('ROLLBACK','RESTORE')` ⇒ natanko eden od `target_entry_id` (različica nastala z vnosom) ali `target_initial` (izhodiščna različica); sicer oba prazna. Brez novih stolpcev; `ENTRY_SELECT` že pridobi čas cilja.
- Skupinski rollback (`statesAfter`, `maxVersions`) obravnava `RESTORE` kot vsak drug vnos (bere `before`/`after`), zato se nič ne spremeni.
- `ROLLBACK`, ki cilja `RESTORE`, in obratno sta veljavna (CHECK zahteva samo obstoj cilja).
- Novi `CHECK` mora vključevati vse obstoječe vrste (unija, glej usklajevanje 014 v plan.md).

## R-05 Obnova in sočasnost

- Ena transakcija v `RestoreService`: (1) `GroupAccess.require(VIEWER)` → 404 skupine; kontakt mora obstajati v `contact` ali sledi, sicer 404; različica `from` mora pripadati kontaktu in skupini, sicer 404; (2) vloga < EDITOR → 403; (3) `lockGroupArchived` (isti zaklep kot ContactService/RollbackService; arhivirana → 409 `GROUP_ARCHIVED`); (4) validacija telesa → 400; (5) sočasnost: obstoječ kontakt – `version` iz telesa mora biti enaka `contacts.lockVersion`; izbrisan kontakt – `lastEntryId` mora biti najnovejši vnos kontakta v sledi; kontakt, ki je medtem spet živ, ali drug zadnji vnos → `409 VERSION_CONFLICT` (telo z `latestEntryId`/trenutnim stanjem kot pri 004); (6) združen (zadnja vrstica `MERGE`, `after IS NULL`) → `409 RESTORE_NOT_ALLOWED`; (7) enaka vsebina kot trenutna → `409 RESTORE_NO_CHANGES`.
- Zaklep skupine (`SELECT … FOR UPDATE` na `contact_group`) serializira vse pisalce (urejanje, izbris, množično, združevanje, rollback, obnova); glava sledi se zaklene šele v `AuditLog` (kot pri vseh), vrstni red je povsod enak → ni zastoja. Dve sočasni obnovi: druga po zaklepu vidi spremenjeno verzijo oz. živ kontakt → 409.
- **Učinek**: nova verzija = `max(trenutna verzija, maxVersions v sledi) + 1` (FR-005-13); `updated_by` = obnovitelj, `updated_at = now()` (Q3), `created_at` iz različice, `reverted_entry_id = NULL`; atributi in značke zamenjani (`insertChildren`); ni kanonizacije in ni ponovne validacije vsebine (kot rollback). Vnos: `AuditLog.recordRestore(group, actor, change(before=trenutno|null, after=novo), targetEntry | initial)`; `contact_count = 1`, `contact_name` = prikazno ime. Samo ta kontakt se spremeni; stari vnosi nedotaknjeni (sprožilec nespremenljivosti jih tudi varuje).
- **Zavrnjeno**: ločen zaklep na kontakt (ne bi izključil sočasnega rollbacka skupine); uporaba `ROLLBACK` z enim kontaktom (zavajajoč stavek, FR-005-12 pomen).

## R-06 Seznam izbrisanih kontaktov

- **Izpeljava** (brez shranjevanja): vrstice `audit_change c` z `after IS NULL` v skupini, za katere (a) v `contact` ni vrstice z tem `id`, (b) v sledi ni novejše spremembe istega kontakta (`NOT EXISTS … seq > e.seq`). Tako je vsak kontakt enkrat, s stanjem zadnjega odstranjevanja; obnovljen kontakt izgine (živ ali novejša sprememba).
- **Razvrstitev stanja**: vrsta vnosa `MERGE` → `MERGED` (ime/id ohranjenega iz druge vrstice vnosa, `exists` = živ v `contact`); `DELETE`, `ROLLBACK`, katera koli druga vrsta z odstranitvijo → `RESTORABLE`; razlog `DELETED` | `ROLLBACK` | `MERGED`.
- **Iskanje** `q` (≤ 100 znakov): ime, e-naslov, podjetje iz `before` (jsonb) z `strpos(x COLLATE search_fold, :q)` (V8: brez razlike velikosti črk in strešic, kot 008). Filter `state`. Razvrstitev: `e.seq DESC` (najnovejši izbris zgoraj), paginacija 25/50/100; `total` z istim `where`.
- **Zmogljivost**: parcialni indeks `audit_change_removed (entry_id) WHERE after IS NULL`; poizvedba se poganja od `audit_entry (group_id, seq)`. SC-007 preveri IT z 10.000 izbrisanimi; če meja ni dosežena, se doda indeks `(contact_id)` na parcialni del (ne spreminja podatkov).
- **Zavrnjeno**: tabela `deleted_contact` (podvajanje, razhajanje s sledjo, dodatna migracija podatkov).

## R-07 Opozorilo o podvajanju v predogledu

- Nova javna enota `contact.DuplicateLookup.find(group, state, exceptId)`: obstoječi kontakti skupine z enakim ključem **e-naslov** ali **ime in priimek** po `DuplicateKeys` (isti normalizacijski pravili kot 011: obrez, male črke; ime brez diakritik). Vrne do 5 zadetkov (`contactId`, `displayName`, `reason` = `EMAIL` | `NAME`). Opozorilo ne blokira obnove (spec FR-015-14).
- Predogled za obstoječ kontakt: seznam podvajanj se izpusti (kontakt že obstaja); za izbrisan kontakt se izračuna za stanje iz različice.

## R-08 Predogled obnove

- `GET …/restore-preview?from=`: `changes` = `ChangeDiff.fields(trenutno|null, različica)` (pri izbrisanem kontaktu vsa izpolnjena polja kot dodana), `restorable` (false z `reason`: `MERGED` | `NO_CHANGES`), `duplicates`, `currentVersion` / `lastEntryId` za telo zahteve. Dialog ob odprtju prebere predogled; ob `409 VERSION_CONFLICT` osveži predogled in zgodovino.

## R-09 Neznane vrste dejanj (združljivost z 014)

- Novi DTO-ji (`HistoryEvent`, `DeletedContactItem`) imajo `action` kot besedilo; FE preslika znane vrste v stavke, neznano v splošni stavek »spremenil(a) kontakt ‹ime›« (FR-015-18) z enako tabelo polj. Seznam izbrisanih in obnova ne ločujeta po vrsti (razen `MERGE`) – uvoz, ki odstranjuje, bi bil obnovljiv.
- Obstoječi `AuditRepository.entry()` (enum) se ne spreminja po vedenju; razširitev enuma pri 014 je njegova naloga (plan.md).

## R-10 Frontend

- Nova mapa `features/history/`; tipi iz `contracts/openapi.yaml`. Časovnica je `ol` z `<time>`; vrsta spremembe je ikona + besedilo (»Dodano«, »Odstranjeno«, »Spremenjeno«), ne le barva (barve iz žetonov design.md). Primerjava: tabela *Polje · Prej · Potem* (`ChangeTable`) + stolpec vrste; nespremenjena polja skrita z gumbom »Pokaži nespremenjena polja«. Pod 640 px zaporedje kartic (kot 9.5).
- Dialog obnove po 8.11: fokus na *Prekliči*, naslov »Obnovim kontakt ‹ime› na stanje ‹čas›?«, predogled sprememb, opozorilo o podvajanju (`role="status"`), uspeh kot toast (8.13), napaka kot trajno sporočilo ob dialogu z *Poskusi znova*; konflikt kot opozorilo (8.14) »Kontakt se je medtem spremenil.« z osvežitvijo.
- Seznam izbrisanih: iskalno polje (privzeto debounce kot 008), filter *Vsi / Obnovljivi / Združeni* kot skupina izbirnih gumbov, vrstica: ime, e-naslov, podjetje, »Odstranil(a) ‹izvajalec› ‹čas›«, oznaka (Obnovljiv / Združen v ‹ime›), akcije *Zgodovina* in *Obnovi* (EDITOR+); pri združenem razlaga in povezava na ohranjeni kontakt, brez gumba *Obnovi*. Stanje v URL.
- Neznana vrsta dejanja: `auditSentence()` ima privzeto vejo; test z vrednostjo `IMPORT`.
