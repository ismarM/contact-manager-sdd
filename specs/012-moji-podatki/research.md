# Research: Moji podatki – izvoz podatkov in izbris računa (012)

**Datum:** 2026-11-12 · **Vhod:** [spec.md](spec.md), konstitucija (II, III, V, VI, VII), `feature-map.md` §2.1–§2.5, §2.8, §2.10, `design.md` 8.11, 8.13, 9.9,
koda 001–008: `SecurityConfig`, `FirebaseJwtDecoder`, `UserDirectory`, `ProfileRepository`, `GroupRepository` (`NO_OWNER`, `lockState`), `MemberService`
(zaklep skupine, prenos lastništva), `InvitationRepository`, migracije V2–V8 (`ON DELETE` pravila), `AuthProvider`, `AccountPage`, `DeleteGroupDialog`.
Pretekle odločitve, na katere se plan opira: D-27 (2), D-55 (2), D-58 (7: »izbris računa mora pred brisanjem članstev zakleniti skupine«).

**Ugotovitev, ki oblikuje celoten plan:** zaledje **nima nobene povezave do Firebase razen preverjanja podpisa ID žetonov** (`FirebaseJwtDecoder`, brez
Admin SDK). ID žeton je samostojen in brez stanja: veljaven je do izteka (do 1 ura) tudi potem, ko je identiteta v Firebase že izbrisana. Zaledje ne more
niti izbrisati identitete niti zanesljivo razveljaviti žetona brez nove zmožnosti. Zato R-01 … R-08 skupaj določajo, kako 012 to varno doda.

Odprta odločitev, ki jo potrdita razvijalca pred implementacijo: **R-06 (knjižnica za brisanje identitete)**; zapisana je kot predlog v D-73.
Ostale nejasnosti (`NEEDS CLARIFICATION`) ni.

---

## R-01 Vrstni red: najprej PostgreSQL, nato Firebase (saga z vzdržno vmesno stanje)

- **Decision:** izbris računa poteka v dveh korakih **brez skupne transakcije**:
  1. **ena transakcija PostgreSQL** (R-04, R-05): preveri pogoje, izbriše podatke, izbriše uporabnika **in zapiše nadgrobnik** `deleted_identity` (R-02) – vse ali nič (FR-012-13);
  2. **po potrditvi** (commit) klic Firebase za izbris identitete (R-06); uspeh označi nadgrobnik (`provider_deleted_at`); neuspeh ga pusti odprtega, ponavlja ga opravilo (R-07).
  Odgovor `204` se vrne po koraku 1 **ne glede na izid koraka 2**: od potrditve naprej račun v aplikaciji ne obstaja in žeton ne deluje (R-02, R-08); identiteta
  pri ponudniku je zgolj še »osirotela« in se odstrani brez sodelovanja uporabnika.
- **Rationale:** (a) če korak 2 odpove, je stanje varno in popravljivo (osirotela identiteta, ki je zaradi nadgrobnika neuporabna); (b) če bi bil Firebase prvi in bi
  nato odpovedala baza, bi uporabnik izgubil dostop, podatki pa bi ostali (nepopravljivo za uporabnika: ne more se več prijaviti, da bi poskusil znova);
  (c) pogoj `OWNS_ACTIVE_GROUPS` in zaklepi skupin so v bazi – brez njih Firebase sploh ne sme biti poklican; (d) spec (Predpostavke) to izrecno predvideva:
  »brisanje podatkov aplikacije je atomarna enota; če brisanje identitete začasno ne uspe, se ponavlja«.
- **Alternatives:** *Firebase najprej, nato baza* (zavrnjeno, glej (b)); *dvofazno z začasnim stanjem `deleting` v `app_user`* (osebni podatki ostanejo v bazi, dokler Firebase ne uspe –
  v nasprotju s FR-012-08 in GDPR; dodaten stolpec in stanje v vsaki poizvedbi); *izbris identitete na odjemalcu (`deleteUser` v Firebase JS SDK)* (zahteva sveže prijavo, odjemalcu ni mogoče zaupati,
  ob zaprtem zavihku ostane identiteta za vedno).

## R-02 Nadgrobnik `deleted_identity`: razveljavitev žetona in ponavljanje

- **Decision:** nova tabela `deleted_identity(firebase_uid PK, deleted_at, provider_deleted_at, attempts, next_attempt_at, last_error)` (data-model.md). Hrani **samo Firebase UID**
  (psevdonimen, nepovezan z imenom ali e-naslovom, ker `app_user` ni več) in stanje brisanja pri ponudniku. Nadgrobnik služi trem namenom:
  1. **razveljavitev žetona (FR-012-15):** dekoder ID žetonov (R-08) žeton, katerega `sub` je v nadgrobniku, zavrne → `401 UNAUTHENTICATED` povsod, tudi pri `PUT /api/me`;
  2. **trajna evidenca neizpolnjenega brisanja:** vrstice s `provider_deleted_at IS NULL` ponavlja opravilo (R-07), tudi po zrušitvi ali ponovnem zagonu aplikacije;
  3. **preprečitev ponovnega ustvarjanja računa (R-03).**
  Nadgrobnik se izbriše šele, ko je identiteta pri ponudniku izbrisana **in** je od tega minilo 2 uri (R-08: ID žeton velja največ 1 uro + 60 s zamika).
- **Rationale:** edini način, da se žeton, ki ga zaledje ne more preklicati, ustavi takoj in na vseh napravah (FR-012-15), je seznam zavrnjenih identitet na strani zaledja.
  UID ni osebni podatek v smislu ime/e-naslov (SC-004 išče ime in e-naslov); hranjenje je omejeno na čas veljavnosti žetonov po uspešnem izbrisu (prej do uspeha brisanja) in je
  zapisano v D-72 kot zavestno odstopanje od »nič sledi«.
- **Alternatives:** *preverjanje preklica pri Firebase za vsak zahtevek (`checkRevoked`)* (klic na zunanji sistem pri vsakem zahtevku, odvisnost zaledja od razpoložljivosti Firebase za vse operacije in nova knjižnica);
  *skrajšanje veljavnosti žetonov* (v Firebase ni nastavljivo); *zanašanje samo na odsotnost vrstice `app_user`* (`PUT /api/me` bi ob veljavnem žetonu znova ustvaril račun, drugi endpointi bi vračali 404 namesto 401).

## R-03 Prepoved ponovnega ustvarjanja računa: odloženi sprožilec na `app_user`

- **Decision:** v migraciji sprožilec `CONSTRAINT TRIGGER … AFTER INSERT ON app_user DEFERRABLE INITIALLY DEFERRED`, ki ob potrditvi transakcije zavrne vstavljanje vrstice, katere `firebase_uid` je
  v `deleted_identity` (napaka s kodo SQLSTATE `CM401`; aplikacija jo preslika v `401 UNAUTHENTICATED`). Varovalka velja za vse poti vstavljanja (`PUT /api/me`, `UserDirectory.ensure`, testni pripomočki, ročni SQL).
- **Rationale:** dekoder (R-08) pokrije zahtevke, ki pridejo po potrditvi izbrisa. Ostane **tekma**: zahtevek `PUT /api/me` je žeton že prestal, nato transakcija izbrisa potrdi, `INSERT … ON CONFLICT`
  pa (ker je stara vrstica izginila) vstavi novo – račun bi se po izbrisu znova pojavil. Preverjanje ob vstavljanju samo (običajen sprožilec ali `WHERE NOT EXISTS`) ne pomaga: vstavek čaka na zaklep izbrisane vrstice
  in odloča na starem posnetku. Odloženi sprožilec teče ob potrditvi, ko je izbris že potrjen, in v READ COMMITTED vidi nadgrobnik. Varovalka je v bazi, zato je ni mogoče zaobiti z novo potjo v kodi.
- **Alternatives:** *`pg_advisory_xact_lock(hashtext(uid))` v `ProfileRepository` in v izbrisu* (zahteva spremembo transakcijske meje v 001 in vseh drugih mestih vstavljanja, ki jih pozneje kdo doda);
  *serializacija prek zaklepa vrstice `app_user`* (vrstice ni več, kjer jo najbolj potrebujemo); *stolpec `deleted` v `app_user`* (osebni podatki ostanejo, vsaka poizvedba mora filtrirati).

## R-04 Zaklepanje in vrstni red: skupine (po `id`), nato preverjanje, nazadnje uporabnik

- **Decision:** izbris v eni transakciji (READ COMMITTED, kot vse ostalo):
  1. `SELECT g.id FROM contact_group g JOIN group_member m … WHERE m.user_id = :user ORDER BY g.id FOR UPDATE OF g` – zaklep **vseh** skupin uporabnika v naraščajočem vrstnem redu `id` (D-58 R-10);
  2. ponovno branje množice skupin uporabnika; če se je razlikovala od zaklenjene (sočasni sprejem povabila), ponovitev od koraka 1 (največ 3-krat, nato `500`; praktično nedosegljivo);
  3. **šele zdaj** ponovno branje stanja pod zaklepi: ali je uporabnik še član, vloga, `archived_at`, število članov (odločitev ni nikoli na stanju pred zaklepom);
  4. `OWNS_ACTIVE_GROUPS`, če je lastnik skupine z `archived_at IS NULL` (R-05);
  5. brisanje (R-05).
  **Vrstice `app_user` se ne zaklepa vnaprej** (`FOR UPDATE` bi zahteval obraten vrstni red od običajnih operacij, ki imajo skupino zaklenjeno in vstavljajo sklice na uporabnika z `KEY SHARE`;
  to bi omogočilo mrtvi objem). Vrstni red je povsod: **skupina → uporabnik**.
- **Rationale:** vse operacije 003, 006, 007 zaklenejo ENO vrstico skupine, zato nimajo ciklov z našim naraščajočim zaporedjem več zaklepov. Zaklep vseh skupin uporabnika pred odločitvijo zagotovi
  FR-012-13: sočasni prenos lastništva (007) se zaporedi z izbrisom – bodisi prenos uspe prvi (uporabnik je lastnik → `409 OWNS_ACTIVE_GROUPS`) bodisi izbris prvi (prenos dobi `409 TARGET_NOT_MEMBER`) –
  in sočasno odarhiviranje (003) prav tako. Kot obramba ostaja zaznava mrtvega objema (SQLSTATE `40P01`) z enim samodejnim ponovnim poskusom celotne transakcije.
- **Alternatives:** *`SERIALIZABLE`* (ni v preostalem sistemu, ponovitve); *`pg_advisory_xact_lock` na uporabnika* (ne zaporedi z operacijami, ki zaklepajo skupino); *zaklep samo skupin, ki jih uporabnik poseduje*
  (izbris skupine pod sočasnim zapuščanjem zadnjega člana, FR-012-10, bi ostal nezaščiten).

## R-05 Posledice izbrisa v bazi (FR-012-08 … FR-012-12)

- **Decision:** pod zaklepi iz R-04, v tem vrstnem redu:
  1. **skupine za izbris:** skupine z `archived_at IS NOT NULL`, v katerih je uporabnik **edini član** (to pokrije FR-012-09 »lastnik, edini član«, FR-012-10 »edini član trajno arhivirane« in navadno arhivirano skupino, ki ji je
     uporabnik edini član): `DELETE FROM contact_group WHERE id = ANY(:ids)` (kontakti, sled, povabila, članstva s `CASCADE`);
  2. **`DELETE FROM app_user WHERE id = :user`**: s kaskadami V2–V8 izgineta (a) članstva (`group_member.user_id … CASCADE`; lastnik arhivirane skupine z drugimi člani s tem izgubi vrstico `OWNER` –
     skupina je po izpeljanem pravilu `NO_OWNER` (003) trajno arhivirana, **brez nove stolpca ali migracije stanja**) in (b) prejeta povabila (`invitee_id … CASCADE`); (c) `inviter_id`,
     `audit_entry.actor_id`, `contact.updated_by`, `contact_group.updated_by`, `group_member.updated_by` pa se postavijo na `NULL` = »izbrisan uporabnik« (§2.5, D-55 2) – **brez kode, ki bi spreminjala vnose sledi** (sprožilec V5 to
     kaskado izrecno dovoljuje); poslana povabila ostanejo veljavna (FR-012-11);
  3. `INSERT INTO deleted_identity (firebase_uid) VALUES (:uid)`.
  Pogoj, ki **ne** sproži izbrisa skupine: nearhivirana skupina (uporabnik je nujno lastnik → R-04 korak 4 ga ustavi pred brisanjem).
- **Rationale:** vsa pravila FR-012-08 … -12 so že izražena z `ON DELETE` pravili, ki so jih 002–007 pripravile zavestno (D-27, D-55); 012 doda samo odločitev o izbrisu skupin in nadgrobnik. »Trajna arhiviranost« je
  izpeljano stanje (`archived_at IS NOT NULL AND NOT EXISTS owner`), zato ni prehoda, ki bi ga bilo treba pisati.
- **Posledica za zmogljivost:** `ON DELETE SET NULL` brez indeksa na referenčnem stolpcu pomeni zaporedno branje celotne tabele (`audit_entry`, `contact`) pri vsakem izbrisu uporabnika. Migracija zato doda štiri indekse
  na stolpce `actor_id`/`updated_by` (data-model.md). Sled ostane nespremenljiva (sprožilec `audit_entry_immutable` dovoli samo `actor_id → NULL`).
- **Alternatives:** *kopiranje imena izvajalca v sled in nato anonimizacija* (nasprotuje SC-004 in bi spremenilo nespremenljivo sled); *stolpec `permanently_archived` v `contact_group`* (podvaja izpeljano stanje, 003 ga ne pozna).

## R-06 Klic Firebase: REST `accounts:delete` – **odločitev za razvijalca (D-73)**

- **Decision (predlog):** zaledje dobi vmesnik `IdentityProvider.delete(uid)` z eno izvedbo `FirebaseIdentityProvider`, ki prek `java.net.http.HttpClient` pokliče
  Identity Toolkit REST `POST …/v1/projects/{projectId}/accounts:delete` z `{"localId": "<uid>"}`:
  - **emulator** (`firebase.auth-emulator-host` nastavljen – tako kot v Compose in testih): `http://{host}/identitytoolkit.googleapis.com/…` z glavo `Authorization: Bearer owner`; **brez nove knjižnice in brez poverilnic**;
  - **produkcija:** `https://identitytoolkit.googleapis.com/…` z OAuth2 žetonom storitvenega računa (privzete poverilnice aplikacije, `GOOGLE_APPLICATION_CREDENTIALS`, vloga *Firebase Authentication Admin*).
    Žeton pridobi **ena nova knjižnica `com.google.auth:google-auth-library-oauth2-http`** (samo ta; brez celotnega Admin SDK).
  - izid: `200` → uspeh; `400 USER_NOT_FOUND` → **uspeh** (idempotentnost: identiteta je že izbrisana); `401/403` → neuspeh z `ERROR` dnevnikom (napačne poverilnice, ni smiselno hitro ponavljati);
    `5xx`, časovna omejitev (povezava 2 s, odgovor 5 s) in omrežne napake → neuspeh, ponovni poskus (R-07).
- **Rationale:** emulator, ki je edini Firebase v testih (workflow 2.4), ta klic podpira, zato se vse, razen pridobitve produkcijskega žetona, preizkusi z resnično izmenjavo brez zrcaljenja. Celoten Admin SDK
  (~30 MB, gRPC, Guava …) je za en klic nesorazmeren, odločitev 001 (R-01) pa je bila namenoma brez njega. Konstitucija VII zahteva vnos za vsako novo knjižnico → D-73.
- **Alternatives:** *`com.google.firebase:firebase-admin`* (uradni, z ponavljanjem in obravnavo napak, `deleteUser`; velik, vleče grpc/guava; konfiguracija poverilnic v emulatorju manj očitna) – **sprejemljiva zamenjava, če razvijalca
  želita uradni SDK**; *lastna izvedba OAuth2 (JWT bearer) z `nimbus-jose-jwt`, ki je že v razredni poti* (brez nove knjižnice, a ročna varnostna koda in ni podpore za metapodatkovni strežnik GCE);
  *zahtevek brez poverilnic* (produkcija ga zavrne).
- **Tveganje in preverjanje:** točno obliko emulatorjeve končne točke `accounts:delete` (`localId` + `Bearer owner`) potrdi **prva naloga implementacije** (`FirebaseIdentityProviderIT` v fazi Foundational, ki pred vsem
  ostalim preveri tudi, da je po klicu ponoven vpis z isto Google identiteto nova identiteta z drugim UID). Če emulator oblike ne podpira, se klic zamenja z različico z ID žetonom uporabnika (`accounts:delete` z `idToken`);
  plan se ne spremeni (vmesnik `IdentityProvider` skrije razliko).
  Produkcijskega žetona testi ne preverijo (brez pravih zunanjih storitev); ročno preverjanje je v quickstart.md.

## R-07 Ponavljanje, zrušitve in idempotentnost

- **Decision:** `IdentityDeletionJob` (`@Scheduled`, vsakih 30 s, prvi zagon ob zagonu aplikacije; Spring, brez nove knjižnice):
  `SELECT … FROM deleted_identity WHERE provider_deleted_at IS NULL AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED` → `IdentityProvider.delete` → uspeh: `provider_deleted_at = now()`;
  neuspeh: `attempts + 1`, `next_attempt_at = now() + min(30 s · 2^attempts, 1 h)`, `last_error` (kratka koda, brez uporabnikovih podatkov). Isto opravilo izbriše nadgrobnike s `provider_deleted_at < now() - 2 h` (R-02).
  Pot izbrisa po potrditvi **takoj poskusi enkrat** (hitra pot, tipično uspe v ~100 ms), nato prepusti nadaljevanje opravilu. `SKIP LOCKED` omogoča več primerkov zaledja brez podvajanja. Brez omejitve števila poskusov:
  ob `attempts ≥ 10` dnevnik `WARN` na vsak poskus (opazljivost; brez UID-a v sporočilu).
- **Obnašanje ob zrušitvi:**

  | Trenutek zrušitve | Stanje po zrušitvi | Izid |
  |---|---|---|
  | pred potrditvijo transakcije PostgreSQL | nič se ni spremenilo | uporabnik ponovi izbris (ista pot) |
  | po potrditvi, pred klicem Firebase | podatki izbrisani, nadgrobnik odprt | opravilo ob zagonu nadaljuje |
  | med klicem Firebase (izid neznan) | nadgrobnik odprt | ponovni klic: uspeh ali `USER_NOT_FOUND` = uspeh |
  | po uspehu Firebase, pred posodobitvijo nadgrobnika | nadgrobnik odprt | ponovni klic: `USER_NOT_FOUND` = uspeh |
  | dolg izpad Firebase | podatki izbrisani, žeton 401, nova registracija blokirana (R-03), identiteta osirotela | ponavljanje z odmikom do uspeha; `WARN` |

- **Rationale:** vsako vmesno stanje je trajno zapisano in vsak korak je idempotenten, zato ni stanja, ki bi zahtevalo ročni poseg razen dolgotrajne napake poverilnic (`401/403`), ki jo operater vidi v dnevniku.
- **Alternatives:** *zunanja čakalna vrsta (Redis/RabbitMQ)* (nova infrastruktura); *izvajanje klica znotraj transakcije baze* (zadrži zaklepe skupin med zunanjim klicem; vsaka počasnost Firebase bi blokirala sočasne operacije).

## R-08 Seje in žetoni: kaj se res zgodi in njihove omejitve

- **Decision:** `FirebaseJwtDecoder` ostane nespremenjen; v `SecurityConfig` ga ovije `DeletedIdentityJwtDecoder` (nov razred v `shared/security`): po uspešnem preverjanju podpisa in zahtevkov preveri
  `SELECT 1 FROM deleted_identity WHERE firebase_uid = :sub`; zadetek → `BadJwtException` → `401 UNAUTHENTICATED` (enako kot vsaka neuspela prijava). En poizvedbi po glavnem ključu na zahtevek.
  Odjemalec po uspešnem izbrisu **takoj** odjavi uporabnika iz Firebase JS SDK (lokalno), počisti stanje seje in odpre `/login?reason=account-deleted` (FR-012-14); izguba seje na drugih napravah se pokaže ob
  prvem zahtevku (401 → `AuthProvider.sessionLost`, FR-001-10).
- **Dejanske omejitve (zapisane, ne prikrite):**
  1. ID žeton ne more biti razveljavljen; po izbrisu velja podpis še do 1 ure. Edina zaščita je nadgrobnik – zato ga hranimo še 2 uri po uspešnem brisanju identitete (R-02).
  2. Osvežilni žetoni po izbrisu identitete v Firebase prenehajo delovati; dokler identiteta v Firebase še obstaja (izpad, R-07), lahko uporabnik na drugi napravi dobi nov ID žeton – dekoder ga zavrne (401),
     aplikacija pa ne deluje. Ni razkritja podatkov, le začasna nerabnost.
  3. Zahtevek istega uporabnika, ki je dekoder prestal **pred** potrditvijo izbrisa in se izvaja vzporedno, lahko konča z `404`/`500` (npr. kršitev tujega ključa pri vstavljanju z `updated_by` izbrisanega uporabnika).
     Podatkov ne razkrije in ne ustvari računa (R-03); izbris sam je tedaj že potrjen. Sprejeto kot nepomembno (uporabnik v tem trenutku brez tega briše račun).
  4. Zaledje `deleted_identity` bere pri vsakem zahtevku; ob izpadu baze zahtevek tako ali tako ne uspe (ostale poizvedbe).
- **Alternatives:** *servletski filter po `BearerTokenAuthenticationFilter`* (enak učinek, a dvojna avtentikacija in lastna obravnava 401); *`checkRevoked` pri Firebase* (R-02).

## R-09 Izvoz: `GET /api/me/export`

- **Decision:** `GET /api/me/export` vrne `200 application/json; charset=UTF-8` s telesom po [contracts/openapi.yaml](contracts/openapi.yaml) (`MyData`) in glavami
  `Content-Disposition: attachment; filename="moji-podatki-YYYY-MM-DD.json"` (datum po UTC), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` (zadnjo že nastavi Spring Security; test preveri vse tri).
  Vsa branja v eni transakciji `READ ONLY` z `REPEATABLE READ`: izvoz je **posnetek** (FR: »bodisi popolni podatki pred izbrisom bodisi 401, nikoli delni«); če vrstice `app_user` v posnetku ni → `401`.
  Datoteko sestavi odjemalec: pokliče `authFetch('/me/export')`, odgovor shrani z `Blob` in `<a download>` z imenom **po lokalnem datumu brskalnika** (spec, Predpostavke: »datum izvoza po lokalnem času uporabnika«);
  zaledje ne pozna časovnega pasu uporabnika, njegova `Content-Disposition` (UTC) je za odjemalce brez brskalnika. Odjemalec zapiše JSON z zamikom 2 presledka.
  - **Struktura:** `formatVersion` (1), `exportedAt` (ISO 8601, UTC), `profile`, `memberships`, `receivedInvitations`, `sentInvitations`, `ownedGroups`. Imena polj angleška, vrednosti kode (`OWNER`, `ARCHIVED` …),
    datumi `…Z` – neodvisno od jezika vmesnika (spec, Predpostavke). Brez `app_user.id`, `memberId` ali drugih notranjih identifikatorjev (FR-001-08).
  - **Pošiljatelj prejetega povabila** (FR-012-02 (c)): `{"name": <ime ali null>, "deleted": false}`; izbrisan pošiljatelj `{"name": "izbrisan uporabnik", "deleted": true}` – zapis iz specifikacije kot nespremenljiva vrednost
    (nevtralno do jezika vmesnika) in strojno berljiva zastavica; e-naslova pošiljatelja izvoz ne vsebuje (FR-012-03).
  - **Poslano povabilo:** `inviteeEmail` (edini podatek drugega uporabnika v izvozu; spec, Predpostavke). Zajeto po `inviter_id = uporabnik`, neodvisno od trenutne vloge ali članstva.
  - **Ni paginacije:** izvoz je celovit posnetek po FR-012-02, ne seznam v vmesniku (konstitucija V: »vsi seznami so paginirani« velja za seznamske endpointe); SC-001 (100 članstev + 50 povabil v 5 s) je dosegljiv s 5 poizvedbami.
  - Vrstni red v poljih: po datumu (`joinedAt`/`createdAt`), nato po naslovu skupine – deterministično za teste.
- **Rationale:** pot brez `{userId}` je najprepričljivejša izolacija: tujega uporabnika ni mogoče nasloviti (FR-012-16), kakor je 001 storil za `/api/me`.
- **Alternatives:** *neposredna povezava `<a href>`* (ne more nositi `Authorization`); *ime datoteke samo s strežnika* (UTC datum se lahko razlikuje od lokalnega, spec zahteva lokalnega);
  *potisni v `ReadableStream`* (nepotrebno, izvoz je majhen).

## R-10 Blokada: `GET /api/me/deletion-blockers` in `409 OWNS_ACTIVE_GROUPS`

- **Decision:** ista poizvedba (nearhivirane skupine, kjer je uporabnik `OWNER`, urejene po naslovu z `title_sl` kolacijo kot v 002) napaja (1) `GET /api/me/deletion-blockers` →
  `{"groups":[{"id","title"}]}` (vmesnik jo bere ob odprtju *Mojega računa*, SC-007) in (2) telo `409 {"code":"OWNS_ACTIVE_GROUPS","groups":[…]}` iz `POST /api/me/deletion` (FR-012-06, FR-012-13).
  `id` je UUID skupine (že del API 002), ne notranji id uporabnika.
- **Rationale:** en vir resnice za gumb in za zavrnitev; pri 409 vmesnik osveži seznam brez dodatnega klica (spec, Predpostavke).
- **Alternatives:** *seznam iz `GET /api/groups`* (007 že kaže, da je pregled po vlogah omejen na strani; blokade ne smejo biti odvisne od paginacije).

## R-11 Pogodba `POST /api/me/deletion`

- **Decision:** `POST /api/me/deletion`, telo `{"email": "<lastni e-naslov>"}`; `204` brez telesa. Vrstni red: **401** (neprijavljen, žeton izbrisanega, uporabnik v bazi ne obstaja – drugi zahtevek ob dvojnem kliku) →
  **400 VALIDATION_FAILED** (`email`: `REQUIRED`, `MISMATCH`; primerjava po obrezu in brez velikosti črk; neznano polje `UNKNOWN_FIELD`; neveljaven JSON `body: MALFORMED`, kot 007) →
  **409 OWNS_ACTIVE_GROUPS** (pod zaklepi, R-04) → 204. E-naslov se primerja z vrednostjo iz baze pod zaklepi (ne iz žetona).
  Poti `/api/users/{id}/export`, `/api/users/{id}`, `/api/me/{id}/export`, `DELETE /api/me` → `404`/`405` (operacije ni, FR-012-16); testirano.
- **Rationale:** POST z `…/deletion` namesto `DELETE /api/me` z telesom: telo pri DELETE posredniki (nginx, CDN) lahko odstranijo, potrditev e-naslova pa je del zahtevka (FR-012-07). Izbris računa ne beleži v revizijsko sled (§2.7).
- **Alternatives:** *`DELETE /api/me` z glavo ali telesom* (krhko), *dva koraka z enkratno kodo* (neutemeljena zapletenost, spec zahteva vpis e-naslova).

## R-12 Vmesnik

- **Decision:** dva razdelka v obstoječem `AccountPage` (`/account`) med *Videz* in *Odjava* (design.md 9.9, točki 3 in 4), vsak v svoji komponenti (`MyDataSection`, `DeleteAccountSection`) z
  `DeleteAccountDialog` po vzoru `DeleteGroupDialog` (design.md 8.11: fokus na *Prekliči*, Esc, vrnitev fokusa, vpis e-naslova, primerjava po obrezu brez velikosti črk; napaka ob polju; zahtevek se ne pošlje ob neujemanju).
  Podatki: `useMyDataApi` (`export`, `blockers`, `deleteAccount`) prek `authFetch`. Stanja: izvoz – *Prenesi* (zasedeno med klicem, `aria-busy`), napaka `alert` + *Poskusi znova* (FR-012-04, design.md 8.13), uspeh `status`;
  blokade – nalaganje, napaka z *Poskusi znova*, seznam povezav (`/groups/:id`) z navodilom ali gumb. 409 `OWNS_ACTIVE_GROUPS` zapre dialog, osveži seznam iz telesa in prikaže navodilo;
  400 `MISMATCH` (zaledje) → napaka ob polju; omrežna napaka → `alert` v dialogu, dialog ostane odprt, nič se ni zgodilo; `204` → `AuthProvider.accountDeleted()` (nova funkcija: izbriše lokalno sejo,
  `gateway.signOut()`, `exitTo = /login?reason=account-deleted`) → `LoginPage` prikaže `status` »Tvoj račun je izbrisan.« (nov `reason` poleg `session-expired`, FR-012-14).
  Dostopnost: razdelka sta `region` z naslovom ravni 2; gumb ≥ 44 px (48 px na groben kazalec); dialog ujame fokus; besedila sl/en (`account.data.*`, `account.delete.*`, `login.accountDeleted`); barve samo žetoni (`dangerButton`).
- **Rationale:** celotna 012 se omeji na dve novi komponenti, en nov razdelek v `AuthProvider` in en nov `reason`; obstoječi testi 001 ostanejo nespremenjeni.

## R-13 Testna strategija (podrobnosti za faze Testi in Pregled testov)

- **Izpad Firebase med brisanjem:** `FirebaseEmulatorContainer` ustavimo z `docker pause` (Testcontainers `getDockerClient().pauseContainerCmd`) za čas klica: klic se izteče (5 s), nadgrobnik ostane odprt,
  odgovor je `204`, žeton `401`, `PUT /api/me` istega UID `401`; `unpause` + `job.runOnce()` → `provider_deleted_at` nastavljen, identiteta v emulatorju ne obstaja. Brez ponaredka: pravi emulator, pravi izpad.
- **Ponovitev nedokončanega brisanja:** (1) ponoven `runOnce()` po uspehu je nični (idempotentno); (2) ročno vstavljen nadgrobnik z identiteto, ki je v emulatorju že ni → uspeh (`USER_NOT_FOUND`); (3) `runOnce()` v ločenem
  kontekstu aplikacije nad isto bazo (simulira ponovni zagon) dokonča vrstico prejšnjega.
- **Opravilo v testih:** `identity-deletion.scheduler-enabled=false` v osnovnem razredu testov (`ApiTest`), da opravilo ne tekmuje s testom; testi kličejo `runOnce()` neposredno (deterministično).
- **Sočasnost:** `AccountDeletionConcurrencyIT`: 100 ponovitev izbrisa vs prenos lastništva na istega uporabnika (SC-006) – po vsaki ponovitvi invariante (`nearhivirana skupina brez OWNER` ne obstaja,
  ni delno izbrisanega stanja: `app_user` izbrisan ⇔ nadgrobnik obstaja ⇔ vsa članstva izbrisana); `AccountDeletionLockingIT`: deterministična varianta z zadržanim zaklepom vrstice skupine (kot `MemberLockingIT`)
  – izbris čaka na zaklep, nato odloči na novem stanju (prenos → 409; odarhiviranje → 409); dvojni zahtevek izbrisa (dva sočasna zahtevka): natanko en `204`, drugi `401`.
- **Ponovna prijava z istim Google računom:** `signInWithIdp` z istim `sub`/e-naslovom po izbrisu da novo identiteto v emulatorju (drug UID) → `PUT /api/me` → `201` nov prazen račun; stari vnosi sledi ostanejo »izbrisan uporabnik«.
- **Uhajanje:** `DeletedUserLeakSecurityIT` po izbrisu iz vseh besedilnih stolpcev vseh tabel razen `contact*` in `audit_change` poišče ime in e-naslov izbrisanega (SC-004); izvoz `ExportIsolationSecurityIT` z
  »kanarčki« v kontaktih, sledi in imenih drugih članov dokaže, da niso v izvozu (FR-012-03, SC-002), z izjemama, ki ju dovoli spec (ime pošiljatelja, e-naslov povabljenega).
- **Matrika izolacije:** vsi trije endpointi so uporabniško vezani (workflow 2.5): `401` (brez, neveljaven, potekel žeton, žeton izbrisanega uporabnika), `404` za pot s tujim identifikatorjem; potrjeno z dvema uporabnikoma.
- **FE:** MSW (`myDataApi.ts`), `getByRole`/`getByLabel`, `vitest-axe`; datoteka izvoza preverjena prek `URL.createObjectURL` ponarejenega v `setup`, ne z lastnim iskalnikom po besedilu. E2E (360/768/1280 px,
  sl in en): izvoz (ime datoteke in vsebina prebrana nazaj), blokada, izbris, ponovna prijava, 401 na drugi napravi (drugi kontekst brskalnika).
- **Regresija 000–008:** `./verify.sh full` nad vsem; obstoječi testi se ne spreminjajo. Edina dotaknjena skupna testna datoteka je `ApiTest` (ena lastnost, R-07) in `AccountPage.test.tsx` (nove `describe`, obstoječe nespremenjene).

## R-14 Vzporedni razvoj s 009 (Patrik)

- **Migracija:** 012 potrebuje migracijo (nadgrobnik, sprožilec, 4 indeksi). Zadnja na `main` je `V8__iskanje.sql`; 012 uporabi **`V9__moji_podatki.sql`**. Spec 009 ne omenja nobene spremembe sheme
  (množične operacije nad obstoječimi tabelami), na `origin` vejo 009 ne obstaja, zato V9 ni zagotovo prost – preverjanje je obvezno **dvakrat**: ob začetku implementacije in tik pred PR
  (`git fetch && ls backend/src/main/resources/db/migration`). Če je medtem na `main` prišel `V9__*` ali višja, se naša preimenuje v naslednjo prosto številko (testi se sklicujejo na ime datoteke samo v komentarjih; brez
  trde številke). Podvojena različica Flyway ne preživi neopaženo: zaledje se ne zažene, `HealthAndMigrationIT` in vsi integracijski testi padejo – nikoli tiha poškodba. Vrstni red združitve odloči, kdo preštevilči.
- **`DECISIONS.md`:** D-72 in D-73 sta naslednji prosti številki; Patrikov plan 009 lahko vzame iste. Vnosa sta na koncu datoteke (isti prostor kot Patrikova) → konflikt ob združevanju je vsebinsko trivialen
  (obe vrstici obstaneta, številki se preštevilčita; sklici v `specs/012-*` se posodobijo s `grep D-72`). Vnosa sta namenoma samo **dva**, da je preštevilčenje majhno.
- **Skupne datoteke:** sprememba ostane omejena na (a) `SecurityConfig` (ovitje dekoderja, 3 vrstice), (b) `AccountPage.tsx` (dva uvoza in dve komponenti), (c) `AuthProvider`/`authContext` (`accountDeleted`),
  (d) `LoginPage` (nov `reason`), (e) `i18n/sl.json` in `en.json` (novi ključi pod `account.data`, `account.delete`, `login.accountDeleted` – ločen blok, na koncu razdelka `account`), (f) `ApiTest` (ena lastnost), (g) `ApiExceptionHandler` (1 metoda).
  009 (množično urejanje kontaktov, iskalnik) teh datotek običajno ne dotakne, razen i18n (različni ključi). Datoteke `feature-map.md`, workflow, konstitucija se **ne** spreminjajo (`OWNS_ACTIVE_GROUPS` je že v §2.10).
- **Patrikove veje ne dotikam:** delo samo na `moji-podatki`.

## R-15 Pregled po konstituciji

Konstitucija VI zahteva izvoz in izbris, da je izbrisan uporabnik povsod prikazan kot »izbrisan uporabnik« in da se ne hranijo nepotrebni osebni podatki. Plan to izpolni z izjemo, ki jo
zapisuje D-72: **Firebase UID izbrisanega uporabnika ostane v `deleted_identity`** (a) do uspešnega brisanja pri ponudniku in (b) še 2 uri po njem. Ni ime ali e-naslov, služi pa varnosti (razveljavitev žetona) –
brez nje FR-012-15 ni izpolnljiv. Razvijalca potrdita to odstopanje s potrditvijo D-72.
