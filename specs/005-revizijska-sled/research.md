# Research: Revizijska sled skupine

Odločitve za [plan.md](plan.md). Vsaka ima *Decision / Rationale / Alternatives*. Specifikacija ni imela odprtih
`[NEEDS CLARIFICATION]`; spodnje točke razrešijo tehnične neznanke iz *Technical Context*.

## R-01 Shranjevanje: vnos + spremembe s celotnim stanjem (JSONB)

- **Decision:** dve tabeli – `audit_entry` (en vnos na operacijo) in `audit_change` (en prizadeti kontakt v vnosu) s stolpcema
  `before` in `after` tipa `jsonb`, ki hranita **celotno stanje** kontakta (`ContactState`, [data-model.md](data-model.md)):
  predefinirani atributi, dodatni atributi (vrstni red vnosa), značke (vrstni red vnosa), `version`, `createdAt`, `updatedAt`,
  `updatedById`. `before` je `NULL` pri dodajanju, `after` pri odstranjevanju. Seznam spremenjenih polj se izpelje ob branju (R-03).
- **Rationale:** FR-005-04 (pogodba beleženja) zahteva celotno stanje prej in potem; iz njega se brez ponovnega predvajanja
  izpelje stanje v kateri koli točki (R-04) in obnovi izbrisan kontakt z istim identifikatorjem (FR-005-11). Stanje je
  nespremenljiv dokument, zato je JSONB naraven zapis; stolpci kontakta se lahko v prihodnje razširijo brez migracije starih vnosov.
- **Alternatives:** (a) zapis samo spremenjenih polj (delta) – rollback bi moral predvajati zgodovino od začetka, kontakti
  izpred beleženja pa nimajo izhodišča; zavrnjeno. (b) Normalizirane tabele za vsako polje – veliko vrstic na vnos (1.000
  kontaktov × polja) brez koristi za poizvedbe; zavrnjeno. (c) Posnetek celotne skupine ob vsakem vnosu – 10.000 kontaktov na
  vnos; zavrnjeno.
- **Zasebnost (konstitucija VI, 012):** stanje hrani samo `updatedById` (številski identifikator), ne imena ali e-naslova. Ob
  izbrisu računa (012) vrstica `app_user` izgine, identifikator v stanjih ostane brez pomena in se prikaže kot »izbrisan
  uporabnik«; ob rollbacku se tak identifikator zapiše kot `updated_by = NULL`. Identifikatorji se ne uporabijo znova
  (`identity`). 012 mora to upoštevati v svojih predpostavkah (sled se ob izbrisu računa ne prepisuje).

## R-02 Popolna urejenost vnosov in najnovejši vnos (glava sledi)

- **Decision:** vsak vnos dobi zaporedno številko `seq` znotraj skupine iz tabele `audit_head (group_id, last_seq,
  last_entry_id)`; zapis vnosa izvede `INSERT … ON CONFLICT (group_id) DO UPDATE SET last_seq = audit_head.last_seq + 1 …
  RETURNING last_seq`, ki zaklene vrstico glave do konca transakcije. Vrstni red sledi je `seq` (ne čas). `last_entry_id`
  je **najnovejši vnos celotne sledi** (Clarifications 2026-11-08), ki ga seznam vrne v polju `latestEntryId` ne glede na filtre.
- **Rationale:** sočasna pisanja kontaktov iste skupine imajo na vrstici skupine le `FOR SHARE` (004 R-05), zato števec na
  `contact_group` ne pride v poštev (dva `FOR SHARE` + `UPDATE` iste vrstice → zastoj). Ločena vrstica glave serializira samo
  zapis vnosa; ker se zaklep sprosti ob potrditvi, je vrstni red `seq` enak vrstnemu redu potrditev, kar zagotavlja, da je
  `before` vsakega vnosa enak `after` prejšnjega vnosa istega kontakta (veriga stanj, R-04). Čas (`created_at`) ostane samo za prikaz.
- **Alternatives:** (a) urejanje po `created_at` – enaki časi in čas začetka transakcije ne ustrezata vrstnemu redu potrditev;
  zavrnjeno. (b) Zaporedje PostgreSQL (`SEQUENCE`) – številke se dodelijo ob vstavljanju, ne ob potrditvi, zato vrstni red
  ne bi ustrezal verigi stanj; zavrnjeno. (c) Zaklep `FOR UPDATE` na skupini pri vsakem pisanju – serializira tudi branje
  kontaktov pred pisanjem; zavrnjeno.

## R-03 Spremenjena polja (izpeljava na strežniku)

- **Decision:** razred `ChangeDiff` (čista funkcija, enotski test) iz `before`/`after` izpelje vrstice *Polje · Prej · Potem* v
  vrstnem redu obrazca 004: Ime, Priimek, Naslov, E-naslov, Telefon, nato dodatni atributi po ključu (vrstni red: ključi iz
  `before`, nato novi ključi iz `after`), nato Značke kot seznam prej in potem. Ključ se primerja **točno** (z velikostjo črk),
  zato je sprememba samo velikosti črk ključa odstranitev starega in dodajanje novega ključa (Edge Cases). Metapodatki
  (`version`, `createdAt`, `updatedAt`, `updatedById`) niso polja. Odgovor API vsebuje že izpeljane vrstice (`fields`).
- **Rationale:** isto pravilo potrebujeta prikaz (FR-005-08) in odločitev »rollback ne bi ničesar spremenil« (FR-005-15, R-04);
  izpeljava na enem mestu prepreči razhajanje med strežnikom in vmesnikom.
- **Alternatives:** izpeljava v vmesniku – podvojeno pravilo in večji odgovor (celotni stanji); zavrnjeno.

## R-04 Rollback: izračun ciljnega stanja

- **Decision:** za cilj T z zaporedno številko `t` (pri *Začetnem stanju* `t = 0`, FR-005-20) strežnik pod zaklepi (R-05):
  1. poišče vse kontakte, ki jih je spremenil kateri koli vnos s `seq > t`, in za vsakega vzame `before` iz njegove **prve**
     spremembe s `seq > t` (`DISTINCT ON (contact_id) … ORDER BY contact_id, seq`) – to je stanje takoj po T (veriga stanj R-02);
     `NULL` pomeni, da kontakt v točki T ni obstajal;
  2. ciljno stanje primerja s trenutnim (vsebina po R-03, brez metapodatkov) in zbere samo razlike: obstaja → ne obstaja
     (odstranitev), ne obstaja → obstaja (obnovitev z istim `id`, `created_at` iz stanja), obstaja → drugačna vsebina (urejanje);
  3. če ni nobene razlike → `409 ROLLBACK_NO_CHANGES` (FR-005-15);
  4. razlike uveljavi s paketnimi stavki (`NamedParameterJdbcTemplate.batchUpdate`, obstoječi `spring-jdbc`) in zapiše en vnos
     `ROLLBACK` z `target_entry_id` (ali `target_initial = true`) in spremembami prej/potem samo za spremenjene kontakte (FR-005-12).
  Kontaktom, ki jih rollback ne zajame (brez sprememb po T), se nič ne zgodi (FR-005-11). Kontakti izpred začetka beleženja
  imajo izhodišče v `before` svoje prve zabeležene spremembe; če jih ni spremenil noben vnos, ostanejo nespremenjeni.
- **Verzija (FR-005-13):** nova verzija = `max(trenutna verzija, največja verzija tega kontakta v vseh stanjih sledi) + 1`;
  indeks `audit_change (contact_id)` omogoča poizvedbo za 1.000 kontaktov v enem stavku.
- **Izvajalec in čas (FR-005-19):** `updated_by`/`updated_at` dobita vrednosti iz ciljnega stanja; `reverted_entry_id` kaže na
  nov vnos `ROLLBACK`. Vsaka druga uspešna operacija nad kontaktom (urejanje 004, 009, 011) nastavi `reverted_entry_id = NULL`.
- **Rationale:** en prehod po indeksu namesto predvajanja zgodovine; čas je sorazmeren številu kontaktov, spremenjenih po T,
  ne velikosti skupine (SC-003: 1.000 sprememb v skupini z 10.000 kontakti < 10 s). Rollback na rollback (FR-005-12) deluje
  brez posebnega primera, ker je vnos `ROLLBACK` navaden člen verige.
- **Alternatives:** (a) obratno predvajanje vnosov od najnovejšega do T – več korakov in vmesna stanja brez koristi; zavrnjeno.
  (b) Primerjava z metapodatki – rollback, ki spremeni le izvajalca, bi bil »sprememba« brez vsebinske razlike; zavrnjeno (spec:
  »ne bi spremenil nobenega kontakta«).

## R-05 Sočasnost in atomarnost

- **Decision:** vrstni red zaklepov je v vseh pisalnih potezah enak – **skupina → kontakt(i) → glava sledi**:
  - pisanje kontakta (004, pozneje 009, 011): `contact_group FOR SHARE` → `contact FOR UPDATE` → sprememba → `AuditLog.record`
    (zaklep `audit_head`) v isti transakciji;
  - rollback: `contact_group FOR UPDATE` (počaka na tekoča pisanja in jih blokira do konca; preveri arhiviranost) →
    `audit_head FOR UPDATE` → primerjava `last_entry_id` s poslanim `latestEntryId` (`409 VERSION_CONFLICT`, FR-005-14) →
    izračun in uveljavitev (R-04).
  `AuditLog.record` ima `@Transactional(propagation = MANDATORY)`: brez obdajajoče transakcije operacije pade, napaka pri zapisu
  vnosa pa razveljavi celotno operacijo (FR-005-04, FR-005-11).
- **Rationale:** enak vrstni red ne povzroča zastojev; `FOR UPDATE` na skupini ustreza arhiviranju (003 R-06), zato se rollback
  in arhiviranje izključujeta; urednik z obrazcem, odprtim pred rollbackom, dobi `409 VERSION_CONFLICT` zaradi nove verzije (FR-005-13).
- **Alternatives:** `SERIALIZABLE` izolacija – ponovni poskusi ob vsaki serializacijski napaki; zavrnjeno.

## R-06 Pogodba beleženja za 009 in 011 (FR-005-04)

- **Decision:** javni vmesnik v paketu `audit`:
  `AuditLog.record(UUID groupId, long actorId, AuditAction action, List<ContactChange> changes)` → `UUID entryId`, kjer je
  `ContactChange(UUID contactId, String displayName, ContactState before, ContactState after)`. Pravila: `changes` ni prazen;
  `CREATE` ima samo `after`, `DELETE` samo `before`, `UPDATE` oba; `MERGE` (011) ima ohranjeni kontakt z obema stanjema in
  odstranjene samo z `before`; `ROLLBACK` zapisuje samo `RollbackService`. Kršitev pravil je programska napaka
  (`IllegalArgumentException`, 500), ne napaka uporabnika. Stanja pridobi `ContactSnapshots` (paket `contact`, javni).
- **Rationale:** 009 in 011 dobita eno točko, ki zagotavlja obliko in atomarnost; spec 005 določa le obliko vnosa.
- **Alternatives:** beleženje s sprožilci baze (trigger) – izvajalca in vrste dejanja (npr. `MERGE`) baza ne pozna, množična
  operacija pa bi postala več vnosov; zavrnjeno.

## R-07 Nespremenljivost (FR-005-05)

- **Decision:** API nima operacij za spremembo ali izbris vnosa (`PUT`/`PATCH`/`DELETE` na poti vnosa → prijavljen `405` s praznim telesom in
  glavo `Allow`, neprijavljen `401`; `ApiExceptionHandler` preslika `HttpRequestMethodNotSupportedException` v `405` brez telesa,
  enako kot `404` – brez nove kode napake, ker vmesnik teh zahtev ne pošilja; velja za vse poti API, obstoječi testi 405 ne
  preverjajo); v bazi sprožilec `BEFORE UPDATE` na `audit_entry` in
  `audit_change` zavrne vsako posodobitev. `DELETE` ostane dovoljen samo prek `ON DELETE CASCADE` iz `contact_group` (003).
- **Rationale:** obramba v globino; izbris skupine mora še naprej izbrisati sled.
- **Alternatives:** sprožilec tudi za `DELETE` – blokiral bi kaskadni izbris skupine; zavrnjeno.

## R-08 Branje sledi in zmogljivost (SC-005)

- **Decision:** `GET …/audit` vrne stran povzetkov vnosov (brez sprememb): `ORDER BY seq DESC LIMIT/OFFSET` po indeksu
  `(group_id, seq DESC)`, filter po vrsti `action = ANY(:actions)` po indeksu `(group_id, action, seq DESC)`, filter po kontaktu
  `EXISTS (audit_change WHERE contact_id = :contact)` po indeksu `audit_change (contact_id, entry_id)`; `count(*)` z enakimi
  pogoji. Povzetek nosi `contactCount` in `contactName` (prikazno ime, če je kontakt en sam), shranjena ob zapisu, da stavek
  (»dodal(a) kontakt Janez Novak«, »uredil(a) 12 kontaktov«) ne potrebuje sprememb. Spremembe vnosa se naložijo ločeno
  (`GET …/audit/{entryId}/changes`, paginirano, Clarifications 2026-11-08).
- **Rationale:** prva stran s 100.000 vnosi je ena poizvedba po indeksu + štetje (< 2 s p95); veliki vnosi (1.000 kontaktov)
  ne povečajo seznama.
- **Alternatives:** paginacija s kazalcem (`seq < :cursor`) – skupni slovar zahteva številke strani in »1–25 od N«; zavrnjeno.

## R-09 Izolacija in vrstni red preverjanj

- **Decision:** vsi endpointi gredo skozi `GroupAccess.require` (002); vnos se vedno išče z `group_id` iz poti, zato je vnos druge
  skupine `404` (FR-005-08). Filter `contact` iz druge skupine vrne prazen seznam (pogoj `group_id` je na vnosu), neveljaven zapis
  uuid → `400` s poljem `contact`. Rollback: 401 → 404 (skupina ali ciljni vnos v tej skupini) → 403 (pod ADMIN) → `409
  GROUP_ARCHIVED` → `400` (`latestEntryId` manjka ali ni uuid) → `409 VERSION_CONFLICT` → `409 ROLLBACK_NO_CHANGES` (D-41).
- **Rationale:** enako kot 004 (D-41) in feature-map §2.2; ciljni vnos je vir v poti, zato je njegov 404 pred 403.

## R-10 Vmesnik: pot, filtri, podrobnosti, oznaka *Povrnjeno*

- **Decision:**
  - Razdelek *Revizijska sled* v glavi skupine med *Kontakti* in *Nastavitve* (002 Assumptions), pot `/groups/:groupId/audit`
    s poizvedbo `?page=` (1-osno), `?size=`, ponovljenim `?action=` in `?contact=` (FR-005-09); posamezen vnos na
    `/groups/:groupId/audit/:entryId` (cilj povezav iz vnosa *rollback* in iz oznake *Povrnjeno*).
  - Seznam je `ol` (design.md 9.6), vsak vnos `li` s `<time>`, izvajalcem in stavkom; *Podrobnosti* so `details/summary`,
    ob odprtju se naloži prva stran prizadetih kontaktov, vsak kontakt je gnezden `details`, katerega `summary` je prikazno
    ime, vsebina preglednica *Polje · Prej · Potem* (Clarifications 2026-11-08: preglednice niso razkrite privzeto).
  - Filter po vrsti dejanja: razkrivni panel *Filtri* s petimi potrditvenimi polji in *Uporabi filtre* / *Počisti filtre*
    (design.md 8.7); filter po kontaktu je odstranljiva oznaka »Kontakt: ‹ime›«.
  - Čas po design.md §11 (»12. 10. 2026, 14.32« / "12 Oct 2026, 14:32") v časovnem pasu brskalnika: sl je datum
    (`day`, `month: 'numeric'`, `year`) + », « + ura (`hour: 'numeric'`, `minute: '2-digit'`, `hourCycle: 'h23'`) z `.` namesto
    `:`; en je `en-GB` (`day`, `month: 'short'`, `year`, `hour: '2-digit'`, `minute: '2-digit'`, `hourCycle: 'h23'`). Samo
    `Intl` s privzetimi možnostmi da »14:32« in "10/12/2026, 2:32 PM", kar ni zapis iz design.md; zato vsaj en test preveri
    dobesedna niza (D-47).
  - Oznaka *Povrnjeno* (FR-005-19) v seznamu kontaktov (ob imenu) in v pogledu kontakta; v pogledu je `details/summary`
    s podrobnostmi rollbacka (čas T s povezavo, povezava na vnos rollbacka, izvajalec).
- **Rationale:** design.md 8.7, 8.9, 8.15, 9.6; nativni `details` je dostopen brez dodatne knjižnice in ne potrebuje stanja.
- **Alternatives:** zavihki ali modalno okno za podrobnosti – v nasprotju z design.md 9.6; zavrnjeno.

## R-11 Vpliv na 004 (kontakti)

- **Decision:** `ContactService.create/update/delete` po spremembi pokliče `AuditLog.record` z vrstami `CREATE`, `UPDATE`,
  `DELETE`; obstoječe zgodnje vrnitve (»brez dejanske spremembe«, zastarela verzija z enakimi vrednostmi) vnosa ne ustvarijo
  (FR-005-01). `ContactDetail` dobi polje `reverted` (objekt ali `null`), `ContactSummary` polje `reverted` (boolean); pogled
  kontakta dobi povezavo »Spremembe tega kontakta v revizijski sledi« (FR-005-09). Polji sta v tipih vmesnika neobvezni, zato se
  obstoječe testne podatke 004 (MSW) ne spreminja; če bi bila sprememba testa 004 vseeno potrebna, dobi vnos v `DECISIONS.md`.
- **Rationale:** 004 Assumptions: »005 doda beleženje … in povezavo«.

## R-12 Brez novih knjižnic

- **Decision:** zaledje: obstoječi `spring-jdbc` (`JdbcClient`, `NamedParameterJdbcTemplate.batchUpdate`), Jackson za JSONB
  (`tools.jackson`); vmesnik: obstoječi `react-router`, `radix-ui` Dialog, `sonner`, `react-i18next`, `@tabler/icons-react`.
- **Rationale:** konstitucija VII – nova knjižnica zahteva vnos v `DECISIONS.md`; ni potrebna.
