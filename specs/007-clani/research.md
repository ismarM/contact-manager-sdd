# Research: Upravljanje članov skupine (007)

**Datum:** 2026-11-10 · **Vhod:** [spec.md](spec.md), konstitucija, `feature-map.md` §2.1–§2.6, §2.8, §2.10, `design.md` 8.6, 8.9, 8.11, 8.13, 8.14, 9.7,
koda 001–006 (`GroupAccess`, `GroupRepository.lockState`, `GroupService`, `InvitationRepository`, `SettingsPage`, `GroupManagementSection`, `ConflictAlert`).
Nove knjižnice niso potrebne. Odločitve so zapisane v `DECISIONS.md` D-58. Nejasnosti (`NEEDS CLARIFICATION`) ni.

---

## R-01 Ena serializacija na skupino: zaklep vrstice `contact_group`

- **Decision:** vsaka pisalna operacija nad člani (sprememba vloge, odstranitev, zapuščanje, prenos lastništva) v eni transakciji najprej zaklene
  vrstico skupine (`SELECT … FOR UPDATE`), nato ponovno prebere klicateljevo in ciljno članstvo ter šele nato odloča in piše. Vrstni red zaklepov je
  vedno: skupina → članstva (po `user_id`). Preverjanja iz `GroupAccess` (pred transakcijo) so le hitra pot; **odločilna so ponovna preverjanja pod zaklepom**.
- **Rationale:** isti vzorec že uporabljajo arhiviranje in izbris (003, `lockState`) ter pošiljanje in sprejem povabil (006, R-04). Ker vse operacije,
  ki spreminjajo sestavo ali stanje skupine, zaklepajo isto vrstico, se ne morejo razminiti: sprejem povabila med odstranitvijo, arhiviranje med
  spremembo vloge, izbris skupine med zapuščanjem. Brez zaklepa bi dva člana, ki hkrati zapuščata trajno arhivirano skupino z dvema članoma, oba
  videla »še en član ostane« in oba odšla (kršitev FR-007-08 – skupina brez članov, ki je nihče več ne more izbrisati).
- **Alternatives:** raven izolacije `SERIALIZABLE` (ponovitve ob konfliktu, ni v ostalem sistemu); `pg_advisory_xact_lock` (neodvisen od vrstice, ki jo zaklepajo
  003 in 006 – ne bi serializiral z njima); preverjanje s pogojnim `DELETE … WHERE (SELECT count(*) …) > 1` (ne zaščiti pred sočasnim zapuščanjem pri
  READ COMMITTED, če obe transakciji vidita staro število).

## R-02 Zapuščanje (FR-007-06 … 08) pod zaklepom

- **Decision:** `POST /api/groups/{groupId}/leave`. Pod zaklepom skupine: (1) klicateljevo članstvo ne obstaja več → 404; (2) vloga OWNER →
  `409 OWNER_CANNOT_LEAVE`; (3) skupina je trajno arhivirana (`archived_at IS NOT NULL` in ni vrstice OWNER) in je število članstev 1 →
  `409 LAST_MEMBER_CANNOT_LEAVE`; (4) `DELETE` članstva → 204. Zapuščanje je dovoljeno tudi v arhivirani skupini (brez `GROUP_ARCHIVED`).
- **Rationale:** število članov in stanje skupine se berejo pod istim zaklepom, ki ga drži vsak drug zapuščevalec, zato drugi bere že spremenjeno
  število (1 → zavrnjen). V trajno arhivirani skupini z dvema članoma uspe natanko eden (FR-007-08, scenarij 6). Revizijska sled se ne dotakne (FR-007-12);
  vnosi ostanejo vezani na `app_user`, ne na članstvo (005).
- **Alternatives:** zadnjega člana ob zapustitvi samodejno izbrisati skupino – spec izrecno določa, da jo mora izbrisati sam (003).

## R-03 Prenos lastništva brez kršitve `group_member_one_owner`

- **Decision:** `POST /api/groups/{groupId}/ownership-transfer` s telesom `{"memberId": "<uuid>"}`. Pod zaklepom skupine in po ponovnem branju
  (pošiljatelj je še OWNER, sicer 403; cilj je član, sicer `409 TARGET_NOT_MEMBER`) dva ločena stavka v isti transakciji, **v tem vrstnem redu**:
  (1) `UPDATE group_member SET role = 'ADMIN', version = version + 1` za prejšnjega lastnika, (2) `UPDATE … SET role = 'OWNER', version = version + 1`
  za cilj. Odgovor: 200 s tekočim `GroupDetail` (002) – klicatelj je zdaj ADMIN.
- **Rationale:** indeks `group_member_one_owner` je navaden delni unikatni indeks (ne odložljiv ključ), preverja se po vsaki vrstici. Če bi najprej
  povišali cilj, bi za trenutek obstajala dva lastnika in bi stavek padel; če znižamo najprej, je zaradi zaklepa in transakcije vmesno stanje (nič
  lastnikov) nevidno drugim transakcijam – tisti, ki berejo, vidijo bodisi staro bodisi novo stanje. Ob izjemi se vse povrne (stara vloga ostane).
  Sočasna prenosa se serializirata na zaklepu; drugi najde, da pošiljatelj ni več OWNER → 403 (spec *Edge Cases*), zato SC-003 (natanko en lastnik) velja.
- **Alternatives:** en `UPDATE … SET role = CASE …` (vrstni red preverjanja unikatnosti znotraj stavka ni zajamčen → občasne napake); odložljiv
  ključ (zahteva spremembo indeksa 002 in migracijo brez potrebe); `DELETE` + `INSERT` (izgubi `version` in identifikator člana).

## R-04 Podatkovni model: `group_member.version` zadošča, identifikator člana manjka

- **Decision:** stolpec `version` (V3) se uporabi za optimistično zaklepanje spremembe vloge (povečan ob vsaki spremembi vloge in prenosu). Doda se
  migracija **`V7__clani.sql`** z enim stolpcem `id uuid NOT NULL DEFAULT uuidv7() UNIQUE` v `group_member` – opaken identifikator člana v API (`memberId`).
- **Rationale:** 001 določa, da se notranji `app_user.id` nikoli ne pojavi v API-ju (`UserDirectory`), primarni ključ članstva pa je `(group_id, user_id)`.
  Pot `…/members/{memberId}` mora cilj nedvoumno določiti, ne da bi razkrila e-naslov v URL (zapisi v dnevnikih) ali zaporedni id. Edina potrebna
  sprememba sheme je ta stolpec; `version` in indeks `group_member_one_owner` ostaneta. `ADD COLUMN … DEFAULT uuidv7()` obstoječim vrsticam dodeli vrednosti.
- **Alternatives:** e-naslov v poti (osebni podatek v URL); `app_user.id` v API (krši 001); `firebase_uid` (identifikator ponudnika prijave ne sodi v API);
  sestavljeni ključ `groupId + userId` (isti problem z `userId`).

## R-05 Avtorizacija in vrstni red preverjanj

- **Decision:** `GroupAccess.require(jwt, groupId, Role.ADMIN, false)` (leave: `VIEWER`; seznam: `VIEWER`; prenos: `OWNER`) vedno z `write = false`; stanje
  `GROUP_ARCHIVED` presodi servis sam, ker mora cilj (404) in pravilo »le nižjim od sebe« (403) priti **pred** 409 (spec *Assumptions*, §2.2). Vrstni
  red za spremembo vloge in odstranitev: 401 → 404 (skupina/nečlan) → 403 (vloga pod ADMIN, **tudi pri neobstoječem ali tujem `memberId`** – spec: »VIEWER ali EDITOR … kogar koli → 403«;
  to je posledica `GroupAccess.require(ADMIN)`) → 404 (`memberId` neveljaven ali ni v tej skupini; samo ADMIN/OWNER) → 403 (cilj ni strogo nižji, lastno članstvo,
  dodelitev ADMIN kot admin ali OWNER kot kdorkoli, dodeljena vloga ≥ klicateljeve) → 409 `GROUP_ARCHIVED`
  → 409 `VERSION_CONFLICT` (samo vloga) → 400 `VALIDATION_FAILED` → (leave/transfer) 409 poslovna pravila. Prenos: 401 → 404 → 403 (ni OWNER; tudi v trajno
  arhivirani skupini, kjer lastnika ni) → 409 `GROUP_ARCHIVED` → 400 → 409 `TARGET_NOT_MEMBER`. Telo se razčleni pred dostopom, napake pa se sporočijo
  šele na koraku 400 (kot `InvitationInputParser`, 006).
- **Rationale:** `GroupAccess` ostane edina točka za korake 2–3 (D-27); neodvisnost testov od izvedbe: matriki SC-005 (`MemberRulesTest`, `MemberRoleMatrixSecurityIT`) uporabljata **ročno napisano tabelo pričakovanj** (brez uvoza `MemberRules`) in preverjata njeno velikost (R-11); nobenega podvajanja tabele vlog. Pravilo »le nižjim od sebe« je ena čista funkcija
  `MemberRules` (unit test za matriko SC-005), ki jo kličeta spremeni-vlogo in odstrani.
- **Alternatives:** `write = true` v `GroupAccess` (vrne 409 pred 404/403 za cilj, kar krši spec); iskanje cilja pred preverjanjem vloge (kot D-41 pri kontaktih) – zavrnjeno,
  ker spec za VIEWER/EDITOR izrecno zahteva 403 »kogar koli«; pri članih je cilj viden vsem članom, zato 403 ničesar ne razkrije.

## R-06 Sprememba vloge z optimistično verzijo (FR-007-03, 04)

- **Decision:** `PUT /api/groups/{groupId}/members/{memberId}` s telesom `{"role": "...", "version": n}`. Pod zaklepom skupine `UPDATE … SET role, version = version + 1
  WHERE group_id AND id AND version = :n` – nič posodobljenih vrstic ob obstoječem članstvu → `409 VERSION_CONFLICT` s telesom `{code, current: Member}`
  (obstoječi `VersionConflictException`); `current` nosi trenutno vlogo, verzijo in podatek, kdo je spremenil. Kdo in kdaj: ker `group_member` nima stolpcev
  `updated_by` / `updated_at`, ju V7 **doda** (`updated_at timestamptz`, `updated_by bigint REFERENCES app_user ON DELETE SET NULL`), saj opozorilo
  design.md 8.14 in FR-007-04 zahtevata »Vlogo člana je medtem spremenil(a) ‹ime› ob ‹čas›«.
- **Rationale:** vzorec 002 in 004 (verzija v telesu, `current` v 409). Dve neodvisni zaščiti (primerjava pod zaklepom in pogoj `version = :n`) sta enako
  poceni in pokrijeta SC-002 tudi ob prihodnji poti brez zaklepa. Zahtevek, ki vloge ne spremeni (enaka vloga), po verziji ne pride do 400 prej kot do 409.
- **Alternatives:** ETag/`If-Match` (drugačen vzorec kot v 002/004); ločen endpoint z verzijo v poti.

## R-07 Seznam članov (FR-007-01, 02)

- **Decision:** `GET /api/groups/{groupId}/members?page&size&lang` (najnižja vloga VIEWER, tudi v arhivirani skupini). Vrstice: `id`, `name`, `email`,
  `role`, `version`, `self`, `canManage` (strogo nižja vloga in klicatelj OWNER/ADMIN in skupina nearhivirana); vrstni red: vloga od najvišje,
  nato ime (če imena ni, e-naslov) s kolacijo jezika (ICU `title_sl`/`title_en` iz V3, enako kot seznam skupin), nato `id`. Odgovor ima še
  `deletedOwner: true` v trajno arhivirani skupini (vmesnik izriše informativno vrstico »izbrisan uporabnik«, ki ni članstvo, ni v `total` in nima dejanj).
- **Rationale:** `canManage` strežnik izračuna z istim `MemberRules` kot pisalne operacije, zato vmesnik ne podvaja pravil; vmesnik meni samo izriše ali ne.
  Vsi člani vidijo e-naslove (spec *Assumptions*).
- **Alternatives:** vrstica »izbrisan uporabnik« kot element `items` (zmede `total` in paginacijo); `canManage` izračunati v vmesniku (podvajanje pravil).

## R-08 Integracija z obstoječim vmesnikom

- **Decision:** `SettingsPage` dobi razdelek *Člani* (po *Podatki skupine*, pred *Povabi člana*; design.md 9.7); `GroupManagementSection` (003) dobi *Zapusti
  skupino* in *Prenesi lastništvo* z razlagami namesto njiju; število članov za pravilo »edini član« vmesnik prebere iz `total` seznama članov
  (`size=1`), zato `GroupDetail` (002) ostane nespremenjen in testi 002/003 ne potrebujejo popravkov. Opozorilo o konfliktu je nov `MemberConflictAlert`
  po vzorcu `ConflictAlert` (002) – skupna logika sporočila (kdo, kdaj) se vzame iz `conflictMessage`. Paginacija: `SectionPagination` (003).
  Po zapustitvi `GroupsProvider` osveži seznam skupin (kot po izbrisu skupine v 003). Pri 404 na dejanju nad članom vmesnik ponovno prebere skupino: 404 tudi tam → »Te strani ni« (`GroupLayout.markNotFound`), sicer je izginil cilj → sporočilo in osvežitev seznama (spec *Edge Cases*).
- **Rationale:** brez podvajanja logike; obstoječi testi ostanejo veljavni (preveri se z `verify.sh quick`).

## R-09 Brez zapisov v revizijsko sled in brez obveščanja

- **Decision:** nobena operacija 007 ne kliče `AuditService`; testi (`MemberAuditIT`) preverijo, da je `audit_entry` skupine po vsaki operaciji nespremenjen
  (FR-007-12, FR-005-06). Imena odstranjenih in bivših članov ostanejo v sledi, ker vnosi kažejo na `app_user`, ne na `group_member`. Obvestil
  (e-pošta, push) ni (spec *Assumptions*).

## R-08a Javni vmesnik `GroupReader` (I1)

- **Decision:** v paket `group` se doda majhen javni bean `GroupReader` z eno metodo `GroupDetail read(Membership)`, ki delegira na paketni `GroupService.read`. `member`
  ga uporabi samo za odgovor prenosa lastništva (`200 GroupDetail`).
- **Rationale:** `GroupService`, `GroupRepository` in `Collation` so paketni (`class GroupService`), zato `member` brez vmesnika ne bi prevedel. Vmesnik ne spremeni pogodbe 002,
  testov 002/003 ali vedenja; `GroupDetail` ostane nespremenjen (R-08).
- **Alternatives:** `GroupService.read` narediti `public` (razkrije celoten servis); prenos vrne `Member` in vmesnik ponovno prebere skupino (sprememba pogodbe, dodaten krog).

## R-11 Preizkušanje sočasnosti in matrik

- **Decision:** (1) **Deterministični sočasnostni test** (`MemberLockingIT`): test na ločeni JDBC povezavi odpre transakcijo in zadrži `SELECT … FOR UPDATE` na vrstici skupine; nato
  asinhrono pošlje zahtevo(-i) (zapuščanje, sprememba vloge, odstranitev, prenos), preveri, da po 1 s **še niso vrnile odgovora** (in da v `pg_stat_activity` čakajo na zaklep),
  sprosti zaklep in preveri izid (npr. dva zapustnika trajno arhivirane skupine z dvema članoma: natanko en `204` in en `409 LAST_MEMBER_CANNOT_LEAVE`). Brez zaklepa v kodi bi zahteve
  vrnile odgovor med zadrževanjem in test pade. (2) `MemberConcurrencyIT` (10 ponovitev) ostane kot stresni dodatek. (3) Matrika »le nižjim od sebe« je v testih **dobesedna tabela**
  (`PUT`: 4 klicatelji × 4 cilji × 4 nove vloge × 2 stanji = **128**; `DELETE`: 4 × 4 × 2 = **32**), test preveri velikost tabele; `MemberRules` v testih matrik ni uvožen.
- **Rationale:** verjetnostni test z dirko lahko prestane tudi brez zaklepa; dokaz o zaklepu mora biti deterministična posledica zadržane vrstice. Tabela, izpeljana iz izvedbe, bi
  potrdila njene napake.

## R-10 Posledica za 012 (izbris računa)

- **Decision:** `ON DELETE CASCADE` iz V3 odstrani članstva ob izbrisu računa; 012 mora pred tem zakleniti vrstice skupin (enak vzorec), da se izbris ne razmini
  z zapuščanjem v trajno arhivirani skupini. Zapisano kot opomba, ne kot naloga 007.
