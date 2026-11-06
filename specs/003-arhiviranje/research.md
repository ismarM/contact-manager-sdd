# Research: Arhiviranje in izbris skupine (003)

**Datum:** 2026-11-06 · **Vhod:** [spec.md](spec.md), konstitucija, `feature-map.md` §2.2, §2.4, §2.5, §2.8, §2.10, `design.md` 8.5, 8.9–8.11,
8.13, 9.2, 9.7, 9.11, 13.4, plan in koda 002 (`GroupAccess`, `GroupRepository`, `GroupLayout`, `SettingsPage`). Nove knjižnice niso potrebne.
Odločitve so zapisane v `DECISIONS.md` D-35.

---

## R-01 Trajno arhivirana skupina je izpeljano stanje (brez nove migracije)

- **Decision:** trajno arhivirana = `archived_at IS NOT NULL` **in** v `group_member` ni vrstice z vlogo `OWNER`. Stolpca ni; migracije ni.
  Izpeljava je v SQL (`NOT EXISTS (SELECT 1 FROM group_member o WHERE o.group_id = g.id AND o.role = 'OWNER')`) in pride kot
  `permanentlyArchived` v `GroupDetail` in na seznam arhiviranih. Stanje v testih pripravi `GroupFixtures.makePermanentlyArchived` (arhivira
  skupino in izbriše vrstico `OWNER`; data-model 002: delni unikatni indeks dovoljuje skupino brez lastnika).
- **Rationale:** feature-map §2.4 določa, da je trajno arhivirana skupina arhivirana skupina brez lastnika; stanje, shranjeno ločeno,
  bi se lahko razšlo z članstvi. 012 stanje povzroči z odstranitvijo vrstice `OWNER`, 003 pa ga samo bere.
- **Alternatives:** stolpec `permanently_archived` (podvojena resnica, 012 bi moral paziti na dvoje); status `enum` (enako).

## R-02 Endpointi: dejanja kot `POST` na podvir, izbris kot `DELETE`

- **Decision:** `POST /api/groups/{id}/archive` in `POST /api/groups/{id}/unarchive` (telo ni potrebno, uspeh `200` + `GroupDetail`),
  `DELETE /api/groups/{id}` (uspeh `204`), `GET /api/groups/archived` (paginiran seznam). Statična pot `archived` ima v Spring MVC prednost
  pred `/{groupId}`; `archived` ni veljaven uuid, zato nikoli ne trči z zapisom skupine.
- **Rationale:** arhiviranje je prehod stanja, ne urejanje podatkov (`PUT` bi zahteval verzijo, spec jo izrecno ne zahteva); ločeni
  imeni dejanj dasta ločeni kodi `GROUP_ARCHIVED` / `GROUP_NOT_ARCHIVED` brez iskanja po telesu. Odgovor `GroupDetail` takoj osveži vmesnik.
- **Alternatives:** `PATCH {archived: true}` (en endpoint, a razlikovanje zavrnitev je nejasno); `PUT …/archived` (idempotenten, spec pa zahteva
  `409` za ponovitev).

## R-03 Preverjanja: vloga pred stanjem, poslovna pravila po zaklepu

- **Decision:** `GroupAccess.require` ostane edino mesto korakov 2–4 (§2.2). `archive`: `require(OWNER, write=true)` – arhivirana skupina da
  `409 GROUP_ARCHIVED` šele po preverjeni vlogi. `unarchive`: `require(OWNER, write=false)`; trajno arhivirana skupina nima lastnika, zato je
  vsak član pod `OWNER` in dobi `403` brez posebne kode (spec, Assumptions). `delete`: `require(VIEWER, write=false)`, nato v servisu:
  trajno arhivirana → vsaka vloga; sicer vloga < `OWNER` → `403`; nato (korak 7) več kot en član → `409 GROUP_HAS_OTHER_MEMBERS`.
  `Membership` dobi polje `permanentlyArchived`.
- **Sočasnost (Edge Cases):** servis v transakciji zaklene vrstico skupine (`SELECT … FOR UPDATE`, kot pri urejanju v 002 R-06) in znova
  prebere stanje: drugi sočasni `archive` vidi `archived_at` ≠ `NULL` → `GroupArchivedException`; drugi `unarchive` vidi `NULL` →
  `GroupNotArchivedException`. Pri `delete` se število članov prešteje pod zaklepom, tako da hkratni `DELETE` in sprejem povabila (006, ki
  mora prav tako zakleniti vrstico skupine) ne dasta izbrisa skupine z dvema članoma. Urejanje podatkov (002) po arhiviranju vrne
  `GROUP_ARCHIVED`, ker `PUT` že uporablja `require(…, write=true)` **in** zaklep (sočasno urejanje čaka na arhiviranje, nato bere novo stanje –
  zato `GroupService.update` po zaklepu ponovno preveri `archived_at`).
- **Alternatives:** optimistična verzija za arhiviranje (spec: ni zahtevana); `SERIALIZABLE` (težje, nepotrebno).

## R-04 Arhiviranje ne spremeni podatkov skupine

- **Decision:** `archive`/`unarchive` nastavita samo `archived_at` (`now()` / `NULL`); `version`, `updated_at`, `updated_by` ostanejo
  (spremenili so se samo metapodatki stanja, ne podatki, ki jih ščiti verzija; Assumptions: ni verzije, revizijska sled jih ne beleži).
- **Rationale:** vmesnik z odprtim obrazcem podatkov ne dobi lažnega `VERSION_CONFLICT`; zavrnitev urejanja po arhiviranju je
  `GROUP_ARCHIVED` (FR-003-04).

## R-05 Izbris skupine in odvisni podatki

- **Decision:** `DELETE FROM contact_group WHERE id = :id`; `group_member` ima `ON DELETE CASCADE` (V3). Tabele prihodnjih funkcionalnosti
  (kontakti 004, revizijska sled 005, povabila 006) **morajo** imeti tuji ključ na `contact_group(id)` z `ON DELETE CASCADE` (FR-003-11) –
  zapis je v data-model.md in v plan.md (Constitution Check); vsaka od njih doda test izbrisa v svoj paket (feature-map §2.2/§2.4 že zahteva,
  da funkcionalnosti preverjajo pravila 003). 003 preveri kaskado za tabele, ki obstajajo (`group_member`).
- **Rationale:** en `DELETE` v transakciji je atomaren; kaskada v bazi ne more pozabiti odvisnih vrstic.
- **Alternatives:** brisanje po tabelah v aplikaciji (pozabljeni odvisni podatki ob novi tabeli); mehki izbris (SC-004 zahteva 0 dostopnih podatkov).

## R-06 Možnost izbrisa v odgovoru (`canDelete`)

- **Decision:** `GroupDetail` dobi `permanentlyArchived: boolean` in `canDelete: boolean` (člani == 1 in (vloga == `OWNER` ali trajno arhivirana)).
  Vmesnik izriše *Izbriši skupino* samo ob `canDelete`, sicer razlago (FR-003-10). Strežnik pravilo vedno preveri sam.
- **Rationale:** vmesnik ne sme poznati števila članov (člani so šele 007); en logičen podatek je dovolj in ne razkriva več kot skupina sama.
- **Alternatives:** `memberCount` v odgovoru (po nepotrebnem širi API); posebni endpoint (dodaten krog).

## R-07 Seznam arhiviranih skupin

- **Decision:** `GET /api/groups/archived?page&size&lang` – isti parametri, pravila in napake `400` kot `GET /api/groups` (`size` 1–100,
  privzeto 25; `lang` določa ICU kolacijo, D-28); en seznam (ne po vlogah), `ORDER BY title COLLATE …, id`. Vrstica:
  `{id,title,description,color,contactCount,role,permanentlyArchived}`. Vmesnik: pot `/groups/archived` (statična pot ima v React Router
  prednost pred `groups/:groupId/*`), uporabi obstoječo `SectionPagination` z imenom »Arhivirane skupine«.
- **Rationale:** design.md 9.2 predvideva en seznam z oznako *Arhivirano*; enaka paginacija kot v 002 (design.md 8.9).

## R-08 Vmesnik: kje je kaj

- **Pasica** (`ArchivedBanner`) je del okvira skupine, pod glavo, na vseh zaslonih skupine; v 002 je samo *Nastavitve*, 004+ jo dobijo
  samodejno (FR-003-05). Regija z imenom »Stanje skupine«; *Odarhiviraj skupino* samo za lastnika nepermanentne.
- **Upravljanje skupine** (`GroupManagementSection`) je nov razdelek v *Nastavitvah* pod *Podatki skupine*; vidijo ga lastnik in – pri
  trajno arhivirani skupini – vsi člani. Člani, ki niso lastnik, v nearhivirani skupini v 003 nimajo kaj upravljati (*Zapusti skupino* doda
  007); izbris za nje ni mogoč (`403`), zato razlage ne prikažemo.
- **Dialoga** (arhiviranje, izbris): shadcn *Dialog* (D-15, 13.4); fokus ob odprtju na *Prekliči* (`onOpenAutoFocus`), klik ob dialog ga ne zapre,
  ob zaprtju s *Prekliči*/*Esc* se fokus vrne na sprožilec (Radix). Nevarni gumb `bg-destructive` (nov skupni razred `dangerButton`).
- **FR-003-04 točka 5:** ob `409 GROUP_ARCHIVED` ob shranjevanju obrazca *Podatki skupine* vmesnik ponovno prebere skupino (`GET`); obrazec
  se zamenja z bralnim pogledom, sporočilo ostane v `role="alert"` nad podatki (živi v nadrejeni komponenti, ker obrazec izgine).
- **Po uspehu:** arhiviranje – obvestilo »Skupina je arhivirana.«, `setGroup(odgovor)`, osvežitev povzetka (skupina izgine iz stranskega pasu),
  fokus na naslov razdelka *Upravljanje skupine*; odarhiviranje – obvestilo, enako; izbris – obvestilo, osvežitev povzetka, preusmeritev na `/`.
- **Alternatives:** pasica samo v *Nastavitvah* (ne ustreza FR-003-05); `AlertDialog` (isti Radix temelj, a v projektu je prevzet *Dialog*, D-15).

## R-09 Brez novih odvisnosti, brez migracije

- **Decision:** nobene nove knjižnice, nobene migracije (stolpec `archived_at` in kaskada že obstajata). Spremembe skupnih datotek: `styles.ts`
  (`dangerButton`), `ApiExceptionHandler` (dve novi kodi), `GroupDetail` (dve novi polji), podpora testov (`groupsApi.ts`, `GroupFixtures`,
  `e2e/tests/support/groups.ts`) – zapisano v D-35.
