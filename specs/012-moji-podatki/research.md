# Research: Moji podatki – izvoz podatkov in izbris računa (012)

**Datum:** 2026-11-12 · **Vhod:** [spec.md](spec.md), konstitucija (II, III, V, VI, VII), `feature-map.md` §2.1–§2.5, §2.8, §2.10, `design.md` 8.11, 8.13, 9.9,
koda 001–008: `SecurityConfig`, `FirebaseJwtDecoder`, `UserDirectory`, `ProfileRepository`, `GroupRepository` (`NO_OWNER`, `lockState`), `MemberService`
(zaklep skupine, prenos lastništva), `InvitationRepository`, migracije V2–V8 (`ON DELETE` pravila), `AuthProvider`, `AccountPage`, `DeleteGroupDialog`.
Pretekle odločitve, na katere se plan opira: D-27 (2), D-55 (2), D-58 (7: »izbris računa mora pred brisanjem članstev zakleniti skupine«).

**Ugotovitev, ki oblikuje celoten plan:** zaledje **nima nobene povezave do Firebase razen preverjanja podpisa ID žetonov** (`FirebaseJwtDecoder`, brez
Admin SDK). ID žeton je samostojen in brez stanja: veljaven je do izteka (do 1 ura) tudi potem, ko je identiteta v Firebase že izbrisana. Zaledje ne more
niti izbrisati identitete niti zanesljivo razveljaviti žetona brez nove zmožnosti. Zato R-01 … R-08 skupaj določajo, kako 012 to varno doda.

Odločitvi D-72 (nadgrobnik) in D-73 (knjižnica) sta potrjeni (D-74); ugotovitve analize skladnosti so vključene (D-75, CR-04); po potrditvi je bil `accounts:delete` **preverjen proti Firebase emulatorju** (R-06) in je v specifikaciji dodano stanje `202` (CR-03, R-16).
Odprtih odločitev in nejasnosti (`NEEDS CLARIFICATION`) ni.

---

## R-01 Vrstni red: najprej PostgreSQL, nato Firebase (saga z vzdržno vmesno stanje)

- **Decision:** izbris računa poteka v dveh korakih **brez skupne transakcije**:
  1. **ena transakcija PostgreSQL** (R-04, R-05): preveri pogoje, izbriše podatke, izbriše uporabnika **in zapiše nadgrobnik** `deleted_identity` (R-02) – vse ali nič (FR-012-13);
  2. **po potrditvi** (commit) klic Firebase za izbris identitete (R-06); uspeh označi nadgrobnik (`provider_deleted_at`); neuspeh ga pusti odprtega, ponavlja ga opravilo (R-07).
  Po koraku 1 sledi **takojšen poskus** koraka 2 (omejen na 5 s); izid določa odgovor (R-16, FR-012-17): `204`, če je identiteta izbrisana (ali je ni bilo več), sicer `202 Accepted`. V obeh primerih
  od potrditve naprej račun v aplikaciji ne obstaja in žeton ne deluje (R-02, R-08); ob `202` je identiteta pri ponudniku zgolj še »osirotela« in se odstrani brez sodelovanja uporabnika.
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

- **Decision:** `AccountDeletionService` (brez transakcije) najprej brez zaklepov razčleni telo in primerja e-naslov z vrstico `app_user` (neujemanje → `400` brez zaklepanja skupin); nato **kratka transakcija** `LocalAccountDeletion.execute`
  (READ COMMITTED, kot vse ostalo; poseben bean, da deluje `@Transactional`):
  1. `SELECT g.id FROM contact_group g JOIN group_member m … WHERE m.user_id = :user ORDER BY g.id FOR UPDATE OF g` – zaklep **vseh** skupin uporabnika v naraščajočem vrstnem redu `id` (D-58 R-10);
  2. ponovno branje množice skupin uporabnika; če se je razlikovala od zaklenjene (sočasni sprejem povabila), ponovitev od koraka 1 (največ 3-krat, nato `500`; praktično nedosegljivo);
  3. **šele zdaj** ponovno branje stanja pod zaklepi: ali uporabnik še obstaja (ne → `401`), e-naslov (ponovno, ne → `400`), vloga, `archived_at`, število članov (odločitev ni nikoli na stanju pred zaklepom);
  4. `OWNS_ACTIVE_GROUPS`, če je lastnik skupine z `archived_at IS NULL` (R-05);
  5. brisanje (R-05), pri čemer **`DELETE FROM app_user` z 0 vrsticami pomeni, da je sočasni zahtevek uporabnika že izbrisal → `401`** (brez nadaljevanja, brez zapisa nadgrobnika).
  **Vrstice `app_user` se ne zaklepa vnaprej** (`FOR UPDATE` bi zahteval obraten vrstni red od običajnih operacij, ki imajo skupino zaklenjeno in vstavljajo sklice na uporabnika z `KEY SHARE`;
  to bi omogočilo mrtvi objem). Vrstni red je povsod: **skupina → uporabnik**.
- **Sočasni izbris istega uporabnika, tudi brez skupin (H1, analiza):** zaklepi skupin zaporedijo dva zahtevka le, če uporabnik ima skupine. Brez skupin zahtevka tečeta vzporedno, zato varnost zagotavlja končni korak:
  drugi `DELETE FROM app_user` počaka na potrditev prvega, izbriše 0 vrstic → `UnauthenticatedException` → rollback → `401`. Zapis nadgrobnika je `INSERT … ON CONFLICT (firebase_uid) DO NOTHING` (obramba, ne
  pričakovana pot): nikoli `500` zaradi podvojenega ključa. Isto velja za dvojni klik in dva zavihka (spec, robni primer).
- **Rationale:** vse operacije 003, 006, 007 zaklenejo ENO vrstico skupine, zato nimajo ciklov z našim naraščajočim zaporedjem več zaklepov. Zaklep vseh skupin uporabnika pred odločitvijo zagotovi
  FR-012-13: sočasni prenos lastništva (007) se zaporedi z izbrisom – bodisi prenos uspe prvi (uporabnik je lastnik → `409 OWNS_ACTIVE_GROUPS`) bodisi izbris prvi (prenos dobi `409 TARGET_NOT_MEMBER`) –
  in sočasno odarhiviranje (003) prav tako. Kot obramba ostaja zaznava mrtvega objema (SQLSTATE `40P01`) z enim samodejnim ponovnim poskusom celotne transakcije. Preverjanje e-naslova pred zaklepi pomeni,
  da napačen vpis ne zadrži zaklepov skupin (L7).
- **Pogoj za 009 (Patrik):** množične operacije, ki pišejo vrstice s sklicem na uporabnika (`updated_by`, `actor_id`), naj ravnajo po D-58 R-01: najprej zaklep skupine, nato pisanje; v nasprotnem primeru obrambo prevzame zaznava mrtvega objema.
- **Alternatives:** *`SERIALIZABLE`* (ni v preostalem sistemu, ponovitve); *`pg_advisory_xact_lock` na uporabnika* (ne zaporedi z operacijami, ki zaklepajo skupino; za H1 zadošča rowcount); *zaklep samo skupin, ki jih uporabnik poseduje*
  (izbris skupine pod sočasnim zapuščanjem zadnjega člana, FR-012-10, bi ostal nezaščiten).

## R-05 Posledice izbrisa v bazi (FR-012-08 … FR-012-12)

- **Decision:** pod zaklepi iz R-04, v tem vrstnem redu:
  1. **skupine za izbris:** skupine z `archived_at IS NOT NULL`, v katerih je uporabnik **edini član** (to pokrije FR-012-09 »lastnik, edini član«, FR-012-10 »edini član trajno arhivirane« in navadno arhivirano skupino, ki ji je
     uporabnik edini član): `DELETE FROM contact_group WHERE id = ANY(:ids)` (kontakti, sled, povabila, članstva s `CASCADE`);
  2. **`DELETE FROM app_user WHERE id = :user`**: s kaskadami V2–V8 izgineta (a) članstva (`group_member.user_id … CASCADE`; lastnik arhivirane skupine z drugimi člani s tem izgubi vrstico `OWNER` –
     skupina je po izpeljanem pravilu `NO_OWNER` (003) trajno arhivirana, **brez nove stolpca ali migracije stanja**) in (b) prejeta povabila (`invitee_id … CASCADE`); (c) `inviter_id`,
     `audit_entry.actor_id`, `contact.updated_by`, `contact_group.updated_by`, `group_member.updated_by` pa se postavijo na `NULL` = »izbrisan uporabnik« (§2.5, D-55 2) – **brez kode, ki bi spreminjala vnose sledi** (sprožilec V5 to
     kaskado izrecno dovoljuje); poslana povabila ostanejo veljavna (FR-012-11);
  3. `INSERT INTO deleted_identity (firebase_uid, next_attempt_at) VALUES (:uid, now() + :lease) ON CONFLICT (firebase_uid) DO NOTHING` (zakup za takojšnji poskus zahtevka, R-07).
  Pogoj, ki **ne** sproži izbrisa skupine: nearhivirana skupina (uporabnik je nujno lastnik → R-04 korak 4 ga ustavi pred brisanjem).
- **Rationale:** vsa pravila FR-012-08 … -12 so že izražena z `ON DELETE` pravili, ki so jih 002–007 pripravile zavestno (D-27, D-55); 012 doda samo odločitev o izbrisu skupin in nadgrobnik. »Trajna arhiviranost« je
  izpeljano stanje (`archived_at IS NOT NULL AND NOT EXISTS owner`), zato ni prehoda, ki bi ga bilo treba pisati.
- **Posledica za zmogljivost:** `ON DELETE SET NULL` brez indeksa na referenčnem stolpcu pomeni zaporedno branje celotne tabele (`audit_entry`, `contact`) pri vsakem izbrisu uporabnika. Migracija zato doda štiri indekse
  na stolpce `actor_id`/`updated_by` (data-model.md). Sled ostane nespremenljiva (sprožilec `audit_entry_immutable` dovoli samo `actor_id → NULL`).
- **Alternatives:** *kopiranje imena izvajalca v sled in nato anonimizacija* (nasprotuje SC-004 in bi spremenilo nespremenljivo sled); *stolpec `permanently_archived` v `contact_group`* (podvaja izpeljano stanje, 003 ga ne pozna).

## R-06 Klic Firebase: REST `accounts:delete` – **potrjeno (D-73, D-74)**

- **Decision (potrjeno D-73, D-74):** zaledje dobi vmesnik `IdentityProvider.delete(uid)` z eno izvedbo `FirebaseIdentityProvider`, ki prek `java.net.http.HttpClient` pokliče
  Identity Toolkit REST `POST …/v1/projects/{projectId}/accounts:delete` z `{"localId": "<uid>"}`:
  - **emulator** (`firebase.auth-emulator-host` nastavljen – tako kot v Compose in testih): `http://{host}/identitytoolkit.googleapis.com/…` z glavo `Authorization: Bearer owner`; **brez nove knjižnice in brez poverilnic**;
  - **produkcija:** `https://identitytoolkit.googleapis.com/…` z OAuth2 žetonom storitvenega računa (privzete poverilnice aplikacije, `GOOGLE_APPLICATION_CREDENTIALS`, vloga *Firebase Authentication Admin*).
    Žeton pridobi **ena nova knjižnica `com.google.auth:google-auth-library-oauth2-http`** (samo ta; brez celotnega Admin SDK).
  - **Dve ločeni plasti za testiranje (H2):** `FirebaseIdentityProvider` prejme `HttpClient` in vir žetona `AccessTokenSource` kot odvisnosti (konstruktor): `EmulatorAccessTokenSource` (vrne `owner`) in `GoogleAccessTokenSource` (OAuth 2.0, ADC). Zahtevek je gradnja v enem razredu in je
    testljiv z lažnim transportom, ne da bi se zanašali na odgovor emulatorja.
  - izid: `200` → uspeh; `400 USER_NOT_FOUND` → **uspeh** (idempotentnost: identiteta je že izbrisana); `401/403` → neuspeh z `ERROR` dnevnikom (napačne poverilnice, ni smiselno hitro ponavljati);
    `5xx`, časovna omejitev (povezava 2 s, odgovor 5 s) in omrežne napake → neuspeh, ponovni poskus (R-07).
- **Rationale:** emulator, ki je edini Firebase v testih (workflow 2.4), ta klic podpira, zato se vse, razen pridobitve produkcijskega žetona, preizkusi z resnično izmenjavo brez zrcaljenja. Celoten Admin SDK
  (~30 MB, gRPC, Guava …) je za en klic nesorazmeren, odločitev 001 (R-01) pa je bila namenoma brez njega. Konstitucija VII zahteva vnos za vsako novo knjižnico → D-73.
- **Alternatives:** *`com.google.firebase:firebase-admin`* (uradni, z ponavljanjem in obravnavo napak, `deleteUser`; velik, vleče grpc/guava; konfiguracija poverilnic v emulatorju manj očitna) – **sprejemljiva zamenjava, če razvijalca
  želita uradni SDK**; *lastna izvedba OAuth2 (JWT bearer) z `nimbus-jose-jwt`, ki je že v razredni poti* (brez nove knjižnice, a ročna varnostna koda in ni podpore za metapodatkovni strežnik GCE);
  *zahtevek brez poverilnic* (produkcija ga zavrne).
- **Preverjeno proti emulatorju (2026-11-12, firebase-tools 15.35, `auth` emulator, projekt `demo-contact-manager`):**

  | Klic | Izid |
  |---|---|
  | `POST /identitytoolkit.googleapis.com/v1/projects/demo-contact-manager/accounts:delete`, `Authorization: Bearer owner`, `{"localId": "<uid>"}` | `200 {"kind":"identitytoolkit#DeleteAccountResponse"}` |
  | isti klic znova (identitete ni več) | `400 USER_NOT_FOUND` → v kodi **uspeh** (idempotentnost) |
  | `accounts:lookup` s starim ID žetonom po izbrisu | `400 USER_NOT_FOUND` |
  | ponovna prijava z istim Google `sub` po izbrisu | **nov `localId`** (drug UID) – FR-012-14 |
  | klic brez `Authorization` | `400 INSUFFICIENT_PERMISSION` (z `?key=`) / `403` (brez ključa); ni brisanja |
  | `Authorization: Bearer nonsense` | `401 UNAUTHENTICATED` |
  | `Bearer owner` za drug projekt (`/projects/other/…`) | `400 USER_NOT_FOUND` (emulator je v `singleProjectMode`) – **past:** napačen `projectId` bi v emulatorju izgledal kot uspeh; `FirebaseIdentityProviderIT` zato brisanje preveri tudi z `accounts:lookup`, produkcijska konfiguracija pa `firebase.project-id` obvezno nastavi (že zahteva `SecurityConfig`) |

  Ugotovitve pogojujejo izvedbo: poziv je **izključno z OAuth 2.0 dostopom (v emulatorju `Bearer owner`)**, nikoli z uporabnikovim ID žetonom kot nadomestilom za administrativno pooblastilo; `google-auth-library-oauth2-http`
  poverilnice pridobi iz `GOOGLE_APPLICATION_CREDENTIALS` (ali metapodatkovnega strežnika); skrivnosti niso v kodi ali Gitu (gitleaks v pre-commit, poverilnice samo okoljska spremenljivka / mount).
  Če bi `FirebaseIdentityProviderIT` v katerem koli trenutku pokazal, da REST klic ni zanesljiv, je dovoljena zamenjava z `firebase-admin` za vmesnikom `IdentityProvider` (D-74).
  **Kaj dokazuje kateri test (emulator ne dokazuje produkcije):**
  - `FirebaseIdentityProviderIT` (emulator): pravi protokol emulatorja, `DELETED`/`NOT_FOUND`/`RETRY` (izpad z `pause`), `MISCONFIGURED` (neveljaven žeton vira) in dejanski izbris (`accounts:lookup`);
  - `FirebaseIdentityProviderTest` (unit, lažen `HttpClient` in lažen `AccessTokenSource`, brez omrežja): **oblika zahtevka v obeh načinih** (emulator: `http://{host}/identitytoolkit.googleapis.com/v1/projects/{projectId}/accounts:delete`, `Bearer owner`; produkcija: `https://identitytoolkit.googleapis.com/…`,
    `Authorization: Bearer <žeton iz vira>`, telo `{"localId": …}`, brez uporabnikovega ID žetona), preslikava izidov `200` → `DELETED`, `400 USER_NOT_FOUND` → `NOT_FOUND`, `400` z drugo vsebino → `RETRY`, `401`/`403` → `MISCONFIGURED`,
    `429`/`5xx`/`IOException`/časovna omejitev → `RETRY`, napaka vira žetona → `MISCONFIGURED` (brez klica);
  - **produkcijska konfiguracija in pristnost OAuth 2.0 dostopa** ostaneta ročna vrata (quickstart, naloga T-vrata pred združitvijo): to ni testna avtomatika, zato ni skrita med zelene teste.
  **Napačen projekt v produkciji:** pravi API za obstoječ, a napačen projekt prav tako vrne `USER_NOT_FOUND`. Konfiguracija `firebase.project-id` je hkrati zahtevani `aud`/`iss` pri preverjanju žetonov (`SecurityConfig`), zato žeton napačnega projekta ne bi prestal prijave;
  napaka bi se pokazala kot nedelujoča prijava, ne kot tiho »uspešno« brisanje. Ročno vrata še enkrat preverijo, da po izbrisu identiteta v konzoli Firebase ne obstaja.

## R-07 Ponavljanje: kratke transakcije, zakup (lease), zrušitve, idempotentnost

- **Decision:** zunanji klici Firebase **nikoli ne tečejo znotraj podatkovne transakcije** in niti v `afterCommit` (Spring izvede `afterCommit` še v kontekstu transakcije: pisanje ni potrjeno in povezava ostane zasedena do ~7 s). Zgradba:
  - `AccountDeletionService` (brez transakcije): (1) predpreverjanje e-naslova, (2) `LocalAccountDeletion.execute` – ena kratka transakcija (R-04, R-05), ki **vstavi nadgrobnik z zakupom** `next_attempt_at = now() + lease` (privzeto 30 s, vedno večji od vsote
    časovnih omejitev klica), (3) takojšen `IdentityProvider.delete` (povezava 2 s, zahtevek 5 s), (4) rezultat v svoji kratki transakciji: `markDeleted` (→ `204`) ali `markFailed` (→ `202`).
  - `IdentityDeletionJob` (`@Scheduled`, vsakih 30 s, prvi zagon ob `ApplicationReadyEvent`): `purge(retention)` (en `DELETE`), nato `lease(5)` = **en stavek v svoji kratki transakciji**:
    `UPDATE deleted_identity SET next_attempt_at = now() + :lease WHERE firebase_uid IN (SELECT firebase_uid FROM deleted_identity WHERE provider_deleted_at IS NULL AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING firebase_uid, attempts`.
    Vsako pridobljeno vrstico obdela **zunaj transakcije** (`IdentityProvider.delete`), nato `markDeleted` oziroma `markFailed` (`attempts + 1`, `next_attempt_at = now() + min(30 s · 2^attempts, 1 h)`, `last_error` – samo kratka koda) – vsaka v svoji transakciji.
  - Zakup nadomešča zaklep vrstice: nobena transakcija ne drži zaklepov ali povezave med zunanjim klicem; več primerkov zaledja se ne podvaja (`SKIP LOCKED` je samo v kratkem `UPDATE`); opravilo in zahtevek ne tekmujeta za isto vrstico (nova vrstica ni zapadla, dokler zakup ne poteče).
  - Brez omejitve števila poskusov: ob `attempts ≥ 10` dnevnik `WARN` na vsak poskus (opazljivost; brez UID-a v sporočilu); `MISCONFIGURED` (`401/403`) dnevnik `ERROR` ob vsakem poskusu.
  **Stanje je v celoti v bazi** (`deleted_identity`), ne v pomnilniku: po ponovnem zagonu opravilo najde zapadle vrstice (zahtevek, ki se je zrušil po potrditvi, dokonča opravilo po izteku zakupa, torej ≤ `lease` + interval), zato ponavljanje in čiščenje preživita zagon (R-16).
- **Obnašanje ob zrušitvi:**

  | Trenutek zrušitve | Stanje po zrušitvi | Izid |
  |---|---|---|
  | pred potrditvijo transakcije PostgreSQL | nič se ni spremenilo | uporabnik ponovi izbris (ista pot) |
  | po potrditvi, pred klicem Firebase | podatki izbrisani, nadgrobnik odprt z zakupom | opravilo ga prevzame po izteku zakupa (≤ 30 s + interval) |
  | med klicem Firebase (izid neznan) | nadgrobnik odprt z zakupom | po izteku zakupa ponovni klic: uspeh ali `USER_NOT_FOUND` = uspeh |
  | po uspehu Firebase, pred `markDeleted` | nadgrobnik odprt | ponovni klic: `USER_NOT_FOUND` = uspeh |
  | dolg izpad Firebase | podatki izbrisani, žeton 401, nova registracija blokirana (R-03), identiteta osirotela; odgovor je bil `202` | ponavljanje z odmikom do uspeha; `WARN` |
  | zrušitev ali ponovni zagon med ponavljanjem ali po uspehu pred čiščenjem | stanje v bazi | novo opravilo prvič teče ob zagonu in dokonča ponovitev oziroma čiščenje (R-16) |

- **Rationale:** vsako vmesno stanje je trajno zapisano in vsak korak je idempotenten, zato ni stanja, ki bi zahtevalo ročni poseg razen dolgotrajne napake poverilnic (`401/403`), ki jo operater vidi v dnevniku.
  Zunanji klic znotraj `FOR UPDATE`/transakcije bi zadržal povezavo in zaklepe do 5 s na vrstico (vse, česar se izogibamo pri izbrisu: R-01 alternativa), zato je zakup edini vir »lastništva« vrstice.
- **Alternatives:** *zunanja čakalna vrsta (Redis/RabbitMQ)* (nova infrastruktura); *`FOR UPDATE SKIP LOCKED` čez celoten obhod* (zadrži transakcijo in povezavo med zunanjimi klici – zavrnjeno po analizi M2); *izvajanje klica v `afterCommit`* (zavrnjeno po analizi M3);
  *izvajanje klica znotraj transakcije baze* (zadrži zaklepe skupin med zunanjim klicem; vsaka počasnost Firebase bi blokirala sočasne operacije).

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
  - **Izjemi pri podatkih drugih oseb (FR-012-03, CR-04):** samo ime pošiljatelja prejetega povabila in e-naslov povabljenega pri poslanem; test (`MyDataExportIT`) ima belo listo teh dveh polj, vse ostale tuje vrednosti so »kanarčki«.
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

- **Decision:** `POST /api/me/deletion`, telo `{"email": "<lastni e-naslov>"}`; uspeh `204` (lokalni račun in identiteta izbrisana) ali `202 {"code":"IDENTITY_DELETION_PENDING"}` (R-16). Vrstni red: **401** (neprijavljen, žeton izbrisanega, uporabnik v bazi ne obstaja – drugi zahtevek ob dvojnem kliku) →
  **400 VALIDATION_FAILED** (`email`: `REQUIRED`, `MISMATCH`; primerjava po obrezu in brez velikosti črk; neznano polje `UNKNOWN_FIELD`; neveljaven JSON `body: MALFORMED`, kot 007) →
  **409 OWNS_ACTIVE_GROUPS** (pod zaklepi, R-04) → 204 ali 202. E-naslov se primerja z vrednostjo iz baze (ne iz žetona): najprej pred zaklepi skupin (neujemanje → `400` brez zaklepanja), nato ponovno pod zaklepi (R-04).
  Poti `/api/users/{id}/export`, `/api/users/{id}`, `/api/me/{id}/export` → `404`, `DELETE /api/me` → `405` (operacije ni, FR-012-16); testirano po poti.
- **Rationale:** POST z `…/deletion` namesto `DELETE /api/me` z telesom: telo pri DELETE posredniki (nginx, CDN) lahko odstranijo, potrditev e-naslova pa je del zahtevka (FR-012-07). Izbris računa ne beleži v revizijsko sled (§2.7).
- **Alternatives:** *`DELETE /api/me` z glavo ali telesom* (krhko), *dva koraka z enkratno kodo* (neutemeljena zapletenost, spec zahteva vpis e-naslova).

## R-12 Vmesnik

- **Decision:** dva razdelka v obstoječem `AccountPage` (`/account`) med *Videz* in *Odjava* (design.md 9.9, točki 3 in 4), vsak v svoji komponenti (`MyDataSection`, `DeleteAccountSection`) z
  `DeleteAccountDialog` po vzoru `DeleteGroupDialog` (design.md 8.11: fokus na *Prekliči*, Esc, vrnitev fokusa, vpis e-naslova, primerjava po obrezu brez velikosti črk; napaka ob polju; zahtevek se ne pošlje ob neujemanju).
  Podatki: `useMyDataApi` (`export`, `blockers`, `deleteAccount`) prek `authFetch`. Stanja: izvoz – *Prenesi* (zasedeno med klicem, `aria-busy`), napaka `alert` + *Poskusi znova* (FR-012-04, design.md 8.13), uspeh `status`;
  blokade – nalaganje, napaka z *Poskusi znova*, seznam povezav (`/groups/:id`) z navodilom ali gumb. 409 `OWNS_ACTIVE_GROUPS` zapre dialog, osveži seznam iz telesa in prikaže navodilo;
  400 `MISMATCH` (zaledje) → napaka ob polju; omrežna napaka → `alert` v dialogu, dialog ostane odprt, nič se ni zgodilo; `204`/`202` → `AuthProvider.accountDeleted(pending)` (nova funkcija: izbriše lokalno sejo,
  `gateway.signOut()`, `exitTo = /login?reason=account-deleted` ob `204` oziroma `…=account-deleted-pending` ob `202`) → `LoginPage` prikaže `status` »Tvoj račun je izbrisan.« oziroma ob `202` razširjeno besedilo, da brisanje povezave z Google računom še poteka in ponovna registracija z istim Google računom nekaj časa morda ne bo mogoča (novi `reason`-a poleg `session-expired`, FR-012-14, FR-012-17).
  Dostopnost: razdelka sta `region` z naslovom ravni 2; gumb ≥ 44 px (48 px na groben kazalec); dialog ujame fokus; besedila sl/en (`account.data.*`, `account.delete.*`, `login.accountDeleted`); barve samo žetoni (`dangerButton`).
- **Rationale:** celotna 012 se omeji na dve novi komponenti, en nov razdelek v `AuthProvider` in en nov `reason`; obstoječi testi 001 ostanejo nespremenjeni.

## R-13 Testna strategija (podrobnosti za faze Testi in Pregled testov)

- **Izpad Firebase med brisanjem – samo v izoliranih integracijskih testih:** `FirebaseEmulatorContainer` (en primerek na JVM, testi tečejo zaporedoma) ustavimo z `docker pause` (Testcontainers `getDockerClient().pauseContainerCmd`) **v `try/finally` in z `@AfterEach` `unpause()`**
  (pomožna metoda `emulator.paused(() -> …)`), da noben naslednji test ne podeduje zamrznjenega emulatorja. Klic se izteče (5 s), nadgrobnik ostane odprt, odgovor je `202`, žeton `401`, `PUT /api/me` istega UID `401`; po `unpause`
  `job.runOnce()` (po poteku zakupa: test premakne `next_attempt_at`) → `provider_deleted_at` nastavljen, identiteta v emulatorju ne obstaja. Pravi emulator, pravi izpad.
- **E2E ne ustavlja skupnih storitev (H3):** Playwright teče `fullyParallel` v treh projektih nad skupnim sklopom Compose; `docker compose stop|pause` bi podrl druge teste. Napake se zato simulirajo samo v brskalniku, kot v obstoječih specih (`route.abort`, `setOffline`):
  FR-012-04 s `page.route('**/api/me/export', route => route.abort())`; stanje `202` v vmesniku z `page.route('**/api/me/deletion', …)`, ki za POST vrne `202 {"code":"IDENTITY_DELETION_PENDING"}` (zaledje se ne pokliče, račun se ne izbriše); `204` ostane pravi potek (E2E uporablja edinstvene uporabnike).
  Pravi `202` in ponovitev preverjata `AccountDeletionIT`/`IdentityDeletionIT`; ročno (quickstart 14–16) samo na lokalnem razvojnem Compose, ne na `verify`.
- **Atomarnost transakcije (M1):** `AccountDeletionAtomicityIT`: test ustvari `BEFORE DELETE` sprožilec na `app_user`, ki vrže izjemo (v `finally` ga odstrani); izbris vrne `500`, **nič** se ni spremenilo (uporabnik, članstva, povabila, arhivirana skupina z edinim članom in njeni kontakti ter sled
  obstajajo, nadgrobnika ni), po odstranitvi sprožilca ponovni izbris uspe. To je deterministični dokaz »vse ali nič« (FR-012-13), neodvisen od sočasnosti.
- **202/204:** `AccountDeletionIT` pokrije `204` (emulator dosegljiv, identiteta izbrisana), `202 {"code":"IDENTITY_DELETION_PENDING"}` (emulator `pause`, odgovor do ~7 s po potrditvi baze) in da v obeh stanjih ni nobenih lokalnih podatkov; `IdentityDeletionIT` pokrije odmik, zakup,
  `USER_NOT_FOUND` = uspeh, `401/403` poverilnic (neuspeh z `last_error`), čiščenje po 2 urah in da se nadgrobnik pred tem ne izbriše.
- **Ponovni zagon aplikacije:** `IdentityDeletionRestartIT` zažene **drugi, neodvisen kontekst aplikacije** nad isto bazo in istim emulatorjem po zaustavitvi prvega: (1) odprt nadgrobnik (izbris med `pause`) se po zagonu novega konteksta dokonča brez novega zahtevka (najpozneje po poteku zakupa);
  (2) nadgrobnik z `provider_deleted_at` starejšim od 2 uri in drug mlajši od 2 ur: po zagonu je prvi odstranjen, drugi ostane; (3) po zagonu nov izbris z drugim uporabnikom uspe (`204`). Čas se simulira z vnosom vrstic z zgodovinskim `provider_deleted_at` in `next_attempt_at`
  (opravilo uporablja `now()` baze), brez spanja in brez ponaredka ure.
- **Opravilo v testih:** `identity-deletion.scheduler-enabled=false` v osnovnem razredu testov (`ApiTest`), da opravilo ne tekmuje s testom; testi kličejo `runOnce()` neposredno (deterministično).
- **Sočasnost:** `AccountDeletionConcurrencyIT`: 100 ponovitev izbrisa vs prenos lastništva na istega uporabnika (SC-006) – po vsaki ponovitvi invariante (`nearhivirana skupina brez OWNER` ne obstaja, ni delno izbrisanega stanja: `app_user` izbrisan ⇔ nadgrobnik obstaja ⇔ vsa članstva izbrisana);
  `AccountDeletionLockingIT`: deterministična varianta z zadržanim zaklepom vrstice skupine (kot `MemberLockingIT`) – izbris čaka na zaklep, nato odloči na novem stanju (prenos → 409; odarhiviranje → 409); **dvojni zahtevek izbrisa: natanko en `204`/`202`, drugi `401`, ne glede na število skupin
  (tudi nobene, H1)**, nikoli `500`, natanko ena vrstica nadgrobnika.
- **Izvoz med izbrisom (M10):** `MyDataExportConcurrencyIT`: v zanki (30 ponovitev) se izvoz in izbris istega uporabnika izvajata sočasno; vsak izvoz je **bodisi `401` bodisi popoln in notranje skladen** (vsa pričakovana članstva, povabila in skupine, profil prisoten), nikoli delen ali `500`.
- **Ponovna prijava z istim Google računom:** `signInWithIdp` z istim `sub`/e-naslovom po izbrisu da novo identiteto v emulatorju (drug UID) → `PUT /api/me` → `201` nov prazen račun; stari vnosi sledi ostanejo »izbrisan uporabnik«.
- **Uhajanje:** `DeletedUserLeakSecurityIT` po izbrisu iz vseh besedilnih stolpcev vseh tabel razen `contact*` in `audit_change` poišče ime in e-naslov izbrisanega (SC-004) in pregleda dnevnik zaledja (ni imena, e-naslova, UID-ja, OAuth žetona ali poverilnic); izvoz `MyDataIsolationMatrixSecurityIT` z
  »kanarčki« v kontaktih, sledi in imenih drugih članov dokaže, da niso v izvozu (FR-012-03, SC-002), z izjemama, ki ju dovoli spec (ime pošiljatelja, e-naslov povabljenega).
- **Matrika izolacije:** vsi trije endpointi so uporabniško vezani (workflow 2.5): `401` (brez, neveljaven, potekel žeton, žeton izbrisanega uporabnika), pot s tujim identifikatorjem `404` (`/api/users/{id}/…`, `/api/me/{id}/…`), `DELETE /api/me` `405`; potrjeno z dvema uporabnikoma.
- **FE:** MSW (`myDataApi.ts`), `getByRole`/`getByLabel`, `vitest-axe`; datoteka izvoza preverjena prek `URL.createObjectURL` ponarejenega v `setup`, ne z lastnim iskalnikom po besedilu. E2E (360/768/1280 px, sl in en): izvoz (ime datoteke in vsebina prebrana nazaj), blokada, izbris, ponovna prijava,
  401 na drugi napravi (drug kontekst brskalnika), napake prek `page.route`.
- **Regresija 000–008:** `./verify.sh full` nad vsem; obstoječi testi se ne spreminjajo. Dotaknjena skupna testna datoteka je `ApiTest` (ena lastnost, R-07) in `AccountPage.test.tsx` (nova `describe`, obstoječe nespremenjene).

## R-14 Vzporedni razvoj s 009 (Patrik)

- **Migracija:** 012 potrebuje migracijo (nadgrobnik, sprožilec, 4 indeksi). Zadnja na `main` je `V8__iskanje.sql`; 012 uporabi **`V9__moji_podatki.sql`**. Spec 009 ne omenja nobene spremembe sheme (množične operacije nad obstoječimi tabelami), na `origin` veje 009 ni, zato V9 ni zagotovo prosta –
  preverjanje je obvezno **dvakrat**: ob začetku implementacije in tik pred PR (`git fetch && ls backend/src/main/resources/db/migration`). Če je medtem na `main` prišla `V9__*` ali višja, se naša preimenuje v naslednjo prosto številko (testi se na številko ne sklicujejo; `AccountDeletionMigrationIT`
  uporablja `target`, ki ga izračuna iz imena datoteke).
- **Posledice vrstnega reda združitve:**
  - *012 prva:* Patrik po rebase preštevilči svojo migracijo (če jo ima) in `D-NN`.
  - *009 prva:* 012 po rebase preštevilči migracijo, `D-72 … D-75` in `CR-03`, `CR-04`.
  - *Neopazni trk:* dve veji z isto številko sta posamično zeleni; trk se pokaže šele ob združitvi. Zato (a) PR, ki se združuje kot drugi, mora pred združitvijo vsebovati posodobljen `main` (CI nad rebase), (b) majhen unit test `MigrationVersionsUniqueTest` (brez baze: prebere imena `V*__*.sql` in zavrne podvojene različice ali vrzeli) se
    požene v `verify quick` in trk ujame takoj po rebase, ne šele z zrušenim zagonom. Brez te preverbe podvojena različica Flyway zruši zagon in vse integracijske teste šele po združitvi.
  - *Lokalne baze:* če je razvijalec migracijo že uporabil na lokalni bazi in jo nato preštevilčimo, `flyway validate` zavrne zagon. **Volumnov se ne briše** (`docker compose down -v` ni dovoljen brez izrecne potrditve): preštevilčena migracija se preizkusi na ločenem Compose projektu z lastnim volumnom
    (`docker compose -p contact-manager-012 up --build`) ali na ločeni testni bazi (Testcontainers), obstoječi volumen pa ostane nedotaknjen.
- **`DECISIONS.md`:** D-72 … D-75 so naslednje proste številke; Patrikov plan 009 lahko vzame iste. Vnosi so na koncu datoteke (isti prostor kot Patrikovi) → konflikt ob združevanju je vsebinsko trivialen (vse vrstice obstanejo, številke se preštevilčijo; sklici v `specs/012-moji-podatki`
  se posodobijo z `grep -rn "D-7[2345]" specs/012-moji-podatki`). Isto za `CR-03`, `CR-04` (CR je skupna številka projekta): pred PR `grep -rhno "CR-[0-9][0-9]" specs/*/spec.md | sort -u`.
- **Skupne datoteke – dejanski stik in kako ga zmanjšamo:**
  - `ApiExceptionHandler`: 009 po feature-map §2.10 uvaja `409 SELECTION_CHANGED` in bo verjetno dodal metodo v isti razred. **012 ga ne spreminja**: naši obravnavi (`OwnsActiveGroupsException`, `UnauthenticatedException`/SQLSTATE `CM401`) sta v novem `@RestControllerAdvice` `AccountExceptionHandler` v paketu `account`
    (pogodba odgovorov ostane enaka, `ApiExceptionHandler` je dokumentiran kot privzeti obravnavalec). Pri neposrednem prekrivanju prednosti obravnavalcev (isti tip izjeme) ni, ker so naši tipi novi.
  - `i18n/sl.json`, `en.json`: tudi 009 jih bo spreminjal; naši ključi so v enem sklenjenem bloku pod `account.data`, `account.delete`, `login.accountDeleted*`; pri trku se ohranijo vse vrstice obeh strani.
  - `SecurityConfig` (ovitje dekoderja, 3 vrstice), `AccountPage.tsx`, `AuthProvider.tsx` + `authContext.ts`, `LoginPage.tsx`, `ApiTest`: 009 jih običajno ne spreminja.
  Datoteke `feature-map.md`, workflow, konstitucija se **ne** spreminjajo (`OWNS_ACTIVE_GROUPS` je že v §2.10).
- **Patrikove veje ne dotikam:** delo samo na `moji-podatki` (iz `origin/main` `f557382`, 008 je združena).

## R-15 Pregled po konstituciji: zavestni odstopanji

Konstitucija je neprekosljiva; plan ne zmanjšuje nobenega načela, a dve določbi zahtevata izrecno utemeljitev (zapisano tudi v *Complexity Tracking* v plan.md in v D-75):

1. **VI Zasebnost: hramba Firebase UID izbrisanega uporabnika.** VI našteva hranjene osebne podatke (ime, e-naslov, izbira jezika in teme). `deleted_identity.firebase_uid` je neprosojen identifikator brez imena in e-naslova; isti stolpec že obstaja za vsakega uporabnika (`app_user.firebase_uid`), zato ne gre za nov razred podatka.
   Potreben je zaradi varnosti: ID žetona ni mogoče razveljaviti (R-08), zato FR-012-15 in FR-012-14 brez seznama zavrnjenih UID-jev nista izpolnljiva. Hramba je omejena: do uspešnega brisanja pri ponudniku in še 2 uri (FR-012-18), nato se vrstica dejansko izbriše.
   SC-004 išče ime in e-naslov, ki ju v nadgrobniku ni. Odločitev je potrjena z D-72/D-74 (razvijalec Ismar); **drugi razvijalec (Patrik) jo potrdi v pregledu PR** (kot pri D-19) – brez te potrditve funkcionalnost ni sprejeta.
2. **V Celovitost: »Vsi seznami so paginirani«.** Izvoz (`GET /api/me/export`) je celovit posnetek po FR-012-02, ne seznam v vmesniku, in se prenese kot datoteka; paginacija bi pomenila večkratne klice in nedosleden posnetek. Seznam blokad (`GET /api/me/deletion-blockers`) obsega samo nearhivirane skupine, kjer je uporabnik lastnik
   (praktično nekaj vnosov, SC-007 zahteva, da jih uporabnik vidi vse naenkrat). Seznama sta namenoma nepaginirana; omejitve velikosti ni (uporabnik lahko po FR-002 ustvari poljubno skupin, a izvoz 100 članstev + 50 povabil je v mejah SC-001).

## R-16 Dve uspešni stanji: `204` in `202 Accepted` (CR-03, FR-012-17, FR-012-18)

- **Decision:** po potrditvi transakcije baze `AccountDeletionService` takoj kliče `IdentityProvider.delete` (skupni časovni okvir 5 s; povezava 2 s). Izid → odgovor:

  | Izid klica | Nadgrobnik | Odgovor | Vmesnik |
  |---|---|---|---|
  | `200` ali `400 USER_NOT_FOUND` | `provider_deleted_at = now()` | **`204`** | `/login?reason=account-deleted` → »Tvoj račun je izbrisan.« |
  | časovna omejitev, omrežna napaka, `5xx`, `429` | ostane odprt (`attempts`, `next_attempt_at`, `last_error`) | **`202 {"code":"IDENTITY_DELETION_PENDING"}`** | `/login?reason=account-deleted-pending` → »Tvoj račun je izbrisan. Brisanje povezave z Google računom še poteka …« |
  | `401`/`403` (napačne poverilnice) | ostane odprt, `last_error = HTTP_401/403`, `ERROR` dnevnik | **`202`** (račun je lokalno izbrisan; popravek poverilnic je naloga operaterja) | kot zgoraj |

- **Pomen za uporabnika:** `204` pomeni, da je »vse izbrisano«, `202` pa »tvoji podatki so izbrisani, a povezava z Google računom še ni odstranjena«. V stanju `202` je ponovna prijava z istim Google računom odvisna od
  uspeha brisanja: dokler identiteta v Firebase obstaja, je njen UID v nadgrobniku in zaledje zavrne vsak njen žeton (`401`, vmesnik pokaže obstoječe sporočilo o neuspeli prijavi, FR-001-04); šele po uspešnem
  brisanju (tipično v nekaj sekundah ali minutah; pri dolgem izpadu pozneje) prijava ustvari nov račun. Sporočilo na strani za prijavo to izrecno pove (spec FR-012-17).
  Zaledje ne razlikuje vzroka 401 pri prijavi (ne razkriva, ali je UID v nadgrobniku).
- **Čiščenje (FR-012-18):** `IdentityDeletionJob` izbriše `deleted_identity` vrstice z `provider_deleted_at < now() - :retention`, `retention = 2 h` (`identity-deletion.tombstone-retention`; ob zagonu se zavrne vrednost
  manj kot 70 min = veljavnost ID žetona 1 h + 60 s zamika + rezerva). Čiščenje teče v istem opravilu kot ponavljanje, prvič ob zagonu aplikacije, nato vsakih 30 s; nobeno stanje ni v pomnilniku, zato
  preživi zrušitev in ponovni zagon. Nadgrobnik z odprtim brisanjem se ne izbriše nikoli (`provider_deleted_at IS NULL`).
- **Sprejeta omejitev (L6):** pojasnilo o čakanju uporabnik vidi samo ob takojšnji preusmeritvi na prijavo. Če se kasneje (še vedno v stanju čakanja) znova poskusi prijaviti, vidi obstoječe sporočilo o neuspeli prijavi (FR-001-04), ker zaledje ne razkriva vzroka `401`; če odgovor `202`/`204` zaradi omrežja ne doseže odjemalca, sporočila ni (žeton je že neuporaben). Dodatnih zahtev ne uvajamo.
- **Rationale:** uporabnik mora vedeti, kdaj ponovna registracija še ne bo delovala (sicer bi ob uspešnem izbrisu in takojšnji prijavi videl nerazumljivo napako); API pa ne sme trditi »vse izbrisano«, če ni (GDPR
  izjava). `202` namesto `5xx` je pravilen, ker se lokalni izbris ni vrnil nazaj in ponovitev zahtevka ni smiselna (uporabnika ni več; drugi zahtevek bi dobil 401).
- **Alternatives:** *vedno `204`* (prvotni predlog, zavrnjeno: ne pove, da identiteta še obstaja); *`500` ob napaki Firebase* (zavajajoče – podatki so izbrisani, ponovitev ni mogoča); *čakanje v zahtevku do uspeha Firebase*
  (blokira odjemalca in zadrži povezavo ob dolgem izpadu).
