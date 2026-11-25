# Research: Izbor in množično urejanje kontaktov (009)

Vhod: [spec.md](spec.md) (Clarify 2026-11-12: meja 10 000, posnetek »vsi zadetki« + preverjanje FR-009-18, mešano stanje »Izberi vse na strani«), obstoječa koda 004/005/008 (`ContactService`, `ContactSnapshots`, `AuditLog`, `ContactSearch`, `ContactQueryParser`). V Technical Context ni ostalo `NEEDS CLARIFICATION`.

---

## R-01 Endpointi: POST z identitetami v telesu

- **Decision:** štirje novi endpointi pod `/api/groups/{groupId}`:
  - `GET /contact-ids?q=&f=&tag=` – identitete vseh zadetkov iskanja in filtrov (»Izberi vse zadetke«, FR-009-03);
  - `POST /contacts/selection-check` – preverjanje sprememb izbora pred končno akcijo (FR-009-18);
  - `POST /contacts/bulk-update` – množično urejanje (FR-009-06 … FR-009-12, FR-009-14 … FR-009-16);
  - `POST /contacts/bulk-delete` – množični izbris (FR-009-13 … FR-009-15).
- **Rationale:** izbor ima do 10 000 identitet (≈ 400 KB JSON) – to ne gre v naslov (`GET` z dolgim naslovom zavrnejo nginx in Tomcat pri 8 KB). `DELETE` s telesom HTTP ne definira zanesljivo (posredniki ga zavržejo), zato je izbris `POST …/bulk-delete`. `selection-check` je samo branje, a potrebuje telo iz istega razloga; ne spreminja ničesar in je dovoljen bralcu in v arhivirani skupini.
- **Alternatives considered:** `PATCH /contacts` s seznamom operacij (JSON Patch) – preveč splošno za tri vrste sprememb, težje validirati po kontaktih; izbor shranjen na strežniku (`POST /selections` → id) – spec izrecno določa, da izbor ni na strežniku (Key Entities); en endpoint `POST /contacts/bulk` z `action` – mešanje najnižjih vlog (VIEWER za preverjanje, EDITOR za pisanje) v en vnos matrike izolacije.

## R-02 Vrstni red preverjanj pri množični operaciji

- **Decision:** `401` → `404` (nečlan, neobstoječa skupina, **ali** vsaj ena identiteta v telesu, ki nikoli ni bila kontakt te skupine) → `403` (pod EDITOR) → `409 GROUP_ARCHIVED` → `400 VALIDATION_FAILED` (zahtevek; nato končna stanja po kontaktih) → `409 SELECTION_CHANGED` (izbrani kontakti te skupine, ki ne obstajajo več). Verzije se ne pošiljajo (spec Assumptions), zato koraka 5 ni.
- **»Nikoli ni bil kontakt te skupine«** = ni v `contact` s tem `group_id` **in** ni v nobenem `audit_change` vnosa te skupine (`audit_change.contact_id` + `audit_entry.group_id`, obstoječi indeks `audit_change_contact`). Izbrisan, združen ali z rollbackom odstranjen kontakt ima vedno vnos v sledi te skupine (005 beleži vse), zato je `SELECTION_CHANGED`; kontakt druge skupine ali izmišljena identiteta je `404` (FR-009-11). Razlikovanje ne razkrije ničesar, česar član ne vidi v svoji sledi (spec Assumptions – kode). Sprejeta omejitev: kontakt, izbrisan pred začetkom beleženja (pred 005), nima vnosa v sledi in dobi `404` namesto `409`; produkcijskih podatkov iz časa pred 005 ni, vmesnik pa obe kodi obravnava kot »kontakt ne obstaja več« (D-73).
- **Sintaktično neveljavno telo** (ni JSON, identiteta ni UUID, napačni tipi): razčlenjevalnik ne vrže; korak 2 se izvede samo nad veljavnimi UUID-ji, nato 403 → 409 → `400` z `MALFORMED`/`INVALID_VALUE` (enak vzorec kot `ContactInputParser`: »napake podatkov se sporočijo šele po preverjanju dostopa«).
- **Rationale:** sledi feature-map §2.2 in spec (Odločitev – kode); 404 pred 403 pomeni, da tudi VIEWER s tujo identiteto dobi 404 (Negative Scenarios: »katerakoli vloga«).
- **Alternatives considered:** 404 za vsako manjkajočo identiteto (brez razlikovanja) – spec zahteva `SELECTION_CHANGED` s seznamom; razlikovanje po tabeli »izbrisani kontakti« – nova tabela podvaja revizijsko sled.

## R-03 Atomarnost, zaklepanje in zaporedje sočasnih operacij

- **Decision:** ena transakcija na operacijo: (1) `lockGroupArchived` (`FOR SHARE` na skupini – obstoječe, zapre dirko z arhiviranjem, 004 R-05); (2) zaklep vseh obstoječih izbranih kontaktov `SELECT id FROM contact WHERE group_id = :g AND id IN (:chunk) ORDER BY id FOR UPDATE` po kosih 5000; (3) branje stanj (`ContactSnapshots.load`); (4) izračun končnih stanj in validacija v pomnilniku; (5) paketni zapis; (6) en vnos `AuditLog.record`. Katera koli napaka razveljavi vse.
- **Rationale:** zaklep v vrstnem redu `id` prepreči zastoj (deadlock) dveh prekrivajočih se operacij – druga počaka in se izvede za prvo nad njenim rezultatom (FR-009-16, Edge Cases); posamezno urejanje (004) zaklene isto vrstico `FOR UPDATE`, zato se z množično operacijo serializira in dobi `VERSION_CONFLICT`, če je poslalo staro verzijo.
- **Alternatives considered:** `SERIALIZABLE` izolacija – ponavljanje ob napakah serializacije pri 10 000 vrsticah; zaklep celotne skupine `FOR UPDATE` – blokira tudi branje drugih in arhiviranje dlje kot treba.

## R-04 Pomen sprememb (čista funkcija `BulkEdit`)

- **Decision:** `BulkEdit.apply(ContactState, BulkEditInput) → ContactState` brez stanja in brez baze; vrstni red po Edge Cases: odstrani značke → dodaj značke → nastavi atribute.
  - Značke: primerjava po `normalize` (obstoječi `ContactInputParser.normalize`); dodana značka gre na konec, v zapisu iz zahtevka; obstoječa ostane v svojem zapisu (scenarij US2-6).
  - Dodatni atribut: obstoječ ključ (normaliziran) → vrednost in zapis ključa iz zahtevka, položaj ostane; **če je vrednost enaka obstoječi, ostane tudi zapis ključa in kontakt se ne šteje kot spremenjen** (D-78, FR-009-12); nov ključ → na konec; prazna vrednost → odstranitev, položaji se strnejo.
  - *Naslov*, *E-naslov*, *Telefon*: neprazna vrednost nastavi, prazna izprazni (`null`).
  - Kontakt je »spremenjen«, če se vsebina (polja, atributi, značke v vrstnem redu) razlikuje; samo ti dobijo `version + 1`, `updated_by`, `updated_at = now()`, `reverted_entry_id = NULL` (kot 004 `update`), samo ti so v vnosu sledi in v »Posodobljenih N«.
- **Validacija končnega stanja po kontaktu:** največ 30 značk (`TOO_MANY` na `tags`), največ 50 dodatnih atributov (`TOO_MANY` na `attributes`). Ostala pravila (oblika e-naslova in telefona, dolžine, rezervirani ključi, presledki v znački) so neodvisna od kontakta in se preverijo na zahtevku (R-05).
- **Rationale:** čista funkcija je hitro unit-testljiva (vse robne primere iz spec brez Testcontainers) in je ena resnica za število spremenjenih.
- **Alternatives considered:** SQL `UPDATE … FROM` z JSON operacijami – težko ugotoviti, kateri kontakti se dejansko spremenijo, in validacija končnega stanja po kontaktu bi zahtevala več poizvedb.

## R-05 Razčlenitev in validacija zahtevka

- **Decision:** `BulkInputParser` (po vzoru `ContactInputParser`, nikoli ne vrže):
  - `contactIds`: obvezen, 1–10 000 (`REQUIRED`, `TOO_MANY`), elementi UUID (`contactIds[i]` `INVALID_VALUE`); podvojene identitete se zlijejo (Edge Cases).
  - `addTags`, `removeTags`: do 30 vsak (`TOO_MANY`); značka 1–50 znakov, brez presledkov (`addTags[i]` `REQUIRED`/`TOO_LONG`/`INVALID_VALUE`); ista značka (normalizirano) v obeh → `removeTags[i]` `DUPLICATE`.
  - `attributes`: do 10 (`TOO_MANY`); `attributes[i].field` ∈ {`address`, `email`, `phone`, `custom`} (`firstName`/`lastName` in drugo → `INVALID_VALUE`, scenarij US2-5); pri `custom` ključ 1–50, ne ime predefiniranega polja (`attributes[i].key` `REQUIRED`/`TOO_LONG`/`RESERVED_KEY`); pri `address`/`email`/`phone` ključ ni dovoljen – poslan `key` → `attributes[i].key` `INVALID_VALUE` (zavrnjeno, ne prezrto; D-75), ključ ali polje dvakrat → `DUPLICATE`; vrednost obrezana, prazna = odstrani; neprazna: pravila slovarja §2.6 za polje (`attributes[i].value` `TOO_LONG`/`INVALID_VALUE`).
  - Nič za dodati, odstraniti ali nastaviti → `body` `EMPTY_OPERATION`. Neznano polje telesa → `UNKNOWN_FIELD` (kot 004).
- **Rationale:** iste kode kot 004/008 (vmesnik jih že prevaja); polja z indeksi omogočijo prikaz napake ob pravem vnosu v dialogu.

## R-06 Oblika napak po kontaktih (`400`) in `409 SELECTION_CHANGED`

- **Decision:**
  - `400 {"code":"VALIDATION_FAILED","errors":[…],"contacts":[{"contactId","displayName","errors":[{"field":"tags","code":"TOO_MANY"}]}]}` – nov zapis `BulkValidationError` razširi obstoječo obliko z neobveznim `contacts` (vsi prizadeti kontakti, razvrščeni po slovenski abecedi imena; vmesnik pokaže do 10 imen in »… in še N«, FR-009-09). Napake zahtevka in napake po kontaktih se ne mešajo: kontakti se preverijo samo, ko je zahtevek veljaven.
  - `409 {"code":"SELECTION_CHANGED","missing":["uuid",…]}` – identitete izbranih kontaktov te skupine, ki ne obstajajo več (FR-009-10). Nova izjema `SelectionChangedException` in rokovalnik v `ApiExceptionHandler`. Koda je že v registru (feature-map §2.10).
- **Rationale:** `ValidationError` 004 ima samo `field`+`code`; ime kontakta mora priti s strežnika, ker kontakt morda ni na trenutni strani.
- **Alternatives considered:** polja `contacts[<uuid>].tags` v obstoječem `errors` – vmesnik bi moral imena brati posebej.

## R-07 Paketni zapis in zmogljivost (SC-002: 10 000 kontaktov < 15 s, p95)

- **Decision:** nova metoda `ContactSnapshots.replaceContent(groupId, actor, List<Change>)`: en `batchUpdate` za vrstice `contact` (vrednosti, `version = version + 1`, `updated_by`, `updated_at`, `reverted_entry_id = NULL`, `sort_*`), otroci samo, kjer so se spremenili (`DELETE … WHERE contact_id IN (:chunk)` in paketni `INSERT` značk oziroma atributov); izbris: `DELETE FROM contact WHERE group_id = :g AND id IN (:chunk)` (kaskada odstrani otroke). Branje stanj po kosih 5000 (obstoječi `CHUNK`). Vnos sledi z obstoječim paketnim `AuditRepository.insert`. JDBC URL dobi `reWriteBatchedInserts=true` (gonilnik PostgreSQL; ni novo orodje).
- **Merjenje:** `BulkPerformanceIT` – skupina z 10 000 kontakti (vsak 3 značke, 3 atributi), 2 ogrevalni + 20 merjenih operacij (dodaj značko / odstrani značko izmenično, en izbris na koncu), p95 po najbližjem rangu < 15 000 ms; okolje in izid v `traceability.md` (*Meritve*), kot 008 R-15.
- **Rationale:** paketni stavki in branje po kosih so isti vzorec kot rollback 005 (R-12 005), ki uveljavi stanja tisočev kontaktov v eni transakciji; dejanski čas se izmeri v `BulkPerformanceIT` (ni še izmerjen). Če meja ni dosežena, je naslednji korak začasna tabela (spodaj).
- **Alternatives considered:** začasna tabela + `UPDATE … FROM` – hitreje, a dvojna pot pisanja kontaktov ob obstoječem `ContactSnapshots`.

## R-08 Velikost telesa zahtevka

- **Decision:** `nginx.conf`, `location /api/`: `client_max_body_size 2m` (privzeto 1 MB). 10 000 identitet ≈ 390 KB; `selection-check` ima zaradi omejitev R-10 največ 30 000 identitet ≈ 1,2 MB. Spring Boot/Tomcat za JSON telesa nima nižje meje.
- **Rationale:** brez tega bi nginx velik izbor zavrnil z `413`, ki ga vmesnik ne prevede.

## R-09 »Izberi vse zadetke« – `GET /contact-ids`

- **Decision:** parametri `q`, `f`, `tag` z istim pomenom in validacijo kot 008 (`ContactQueryParser`, `requireKnownKeys`); `sort`, `dir`, `page`, `size` se validirajo kot v 008, a ne vplivajo na odgovor (vmesnik lahko pošlje isti `toApiParams`). Odgovor `{"total": N, "ids": [...]}`; pri `total > 10 000` je `ids` prazen in `truncated: true` – unija bi v vsakem primeru presegla mejo (FR-009-04), zato prenos ni potreben. SQL: `SELECT c.id FROM contact c WHERE ‹ContactSearch.where›` brez razvrščanja.
- **Vmesnik:** unija z obstoječim izborom; če > 10 000 → izbor nespremenjen + sporočilo (FR-009-04). Sicer doda identitete in zapomni poizvedbo (R-10).
- **Alternatives considered:** vračanje vseh identitet ne glede na število – pri 100 000 kontaktih nepotreben prenos 4 MB.

## R-10 Model izbora v vmesniku in preverjanje FR-009-18

- **Decision:** `SelectionProvider` v `GroupLayout` (živi, dokler je odprta ista skupina; nov `groupId` ali odjava ga ponastavi; osvežitev strani ga izgubi – FR-009-02). Stanje:
  - `ids: Set<string>` (do 10 000);
  - `queries: SelectionQuery[]` – za vsak »Izberi vse zadetke«: `params` (`q`, `f[]`, `tag[]` – kanonični niz 008), `added: Set` (identitete, ki jih je ta klik dodal ali so že bile v zadetkih), `deselected: Set` (ročno odznačene med `added`).
  - Ročno odznačen kontakt se odstrani iz `ids` in doda v `deselected` poizvedbe, ki ga ima v `added`.
  - **Omejitve (D-73):** vsak kontakt pripada največ eni poizvedbi – nov »Izberi vse zadetke« prevzame kontakte, ki jih doda ali so že v njegovih zadetkih, in jih odstrani iz `added`/`deselected` starejših poizvedb; poizvedba z enakimi kanoničnimi `params` se zlije s prejšnjo (nova vrednost `added` = unija, ostane na mestu najnovejše). Največ **20 poizvedb** in skupaj največ **10 000** `deselected`; ob preseganju se najstarejša poizvedba pozabi (njeni `added` ostanejo v `ids` kot ročno izbrani). Zato je v telesu `selection-check` vsota `queries[].contactIds` ≤ 10 000 in vsota `queries[].excludedIds` ≤ 10 000, skupaj z `contactIds` največ 30 000 identitet ≈ 1,2 MB (< 2 MB, R-08). Strežnik vsote preveri (`queries` `TOO_MANY`).
- **Preverjanje:** pred `bulk-update`, `bulk-delete` (in izvozom 010) vmesnik pošlje `POST …/contacts/selection-check` z `contactIds` in `queries[{q,f,tag,contactIds: added∩ids, excludedIds: deselected}]`. Strežnik vrne `missing` (izbrani, ki ne obstajajo več) in za vsako poizvedbo `newMatches` (zadetki zdaj, ki niso v `contactIds` in ne v `excludedIds`) ter `noLongerMatching` (njeni obstoječi kontakti, ki niso več zadetki). Spremembe drugih podatkov se ne javijo, ker se primerja samo članstvo v zadetkih (scenarij US3-8).
- **Obvestilo:** `role="alert"` (warning, design.md 8.13) v dialogu z vsotami po vrstah; *Posodobi izbor* (odstrani `missing`, doda `newMatches`, odstrani `noLongerMatching` samo ob obkljukanem polju, privzeto obkljukano; meja 10 000 velja – Edge Cases) in *Nadaljuj z obstoječim izborom* (odstrani `missing`, takoj pošlje operacijo). Pri `409 SELECTION_CHANGED` (sprememba med preverjanjem in izvedbo) isto obvestilo samo z `missing`.
- **Rationale:** ločen endpoint ohrani pisalna endpointa preprosta (spec: operacija velja za fiksen seznam) in ga lahko uporabi izvoz 010 brez lastne logike.
- **Alternatives considered:** preverjanje v istem klicu kot operacija (`dryRun`) – podvaja validacijo; časovni žig »izbor ob« + revizijska sled – sled ne pove, ali je kontakt začel ustrezati filtrom.

## R-11 Vmesnik: akcijska vrstica in orodna vrstica

- **Decision:** območje »Iskanje in filtri« (008) ostane vedno vidno – FR-009-02/03 zahtevata spreminjanje iskanja in filtrov med izborom. Akcijska vrstica (`role="toolbar"`, »Dejanja izbora«) ob izboru zamenja vrstico z *Nov kontakt* nad preglednico; na telefonu (< 640 px) je prilepljena na spodnji rob (design.md 8.8). Bralec in arhivirana skupina vidita *Izberi vse zadetke (N)*, *Izvozi v Excel*, *Počisti izbor* (FR-009-05).
- **Odstopanje od design.md 8.8** (»orodno vrstico zamenja akcijska vrstica«, »bralec vidi le *Izvozi v Excel* in *Počisti izbor*«): spec 009 (FR-009-02, FR-009-05) ima prednost in je novejša; zapisano v **D-72** (za pregled v PR; predlog besedila design.md 8.8 v D-72).
- **»Izvozi v Excel«** je v lasti 010: 009 izriše gumb samo, ko obstaja izvoz (010 še ni implementiran), zato ga do 010 ni; FR-009-05 testi preverijo njegovo odsotnost/prisotnost v 010 (opomba v *Public Interfaces*).
- **Stolpec izbire:** nativni `<input type="checkbox">` (design.md 13.4 – brez shadcn *Checkbox*, D-izbira 000); glava `indeterminate = true` → bralnik prebere »delno označeno« (`mixed`). Pod 640 px je polje v glavi kartice (8.6).
- **Dialog *Uredi izbrane*:** obstoječi `shared/ui/dialog.tsx`; *Dodaj značke* in *Odstrani značke* z obstoječim `TagInput` (combobox, 8.4); *Nastavi atribut* – vrstice (`select` polje: Naslov, E-naslov, Telefon, Dodatni atribut; `textbox` ključ samo pri dodatnem; `textbox` vrednost; *Odstrani atribut N*), *Dodaj atribut* do 10.
- **Potrditev izbrisa:** vzorec `DeleteContactDialog` (8.11), fokus na *Prekliči*.

## R-12 Besedila in sklanjatve

- **Decision:** i18next plural (sl: `one`, `two`, `few`, `other`; en: `one`, `other`) za »Izbranih: N«, »Posodobljenih N kontaktov.«, »Izbrisanih N kontaktov.«, »Izbrišem N kontaktov?«, »Uporabi za N kontaktov«, »Izbriši N kontaktov«, obvestilo o spremembi izbora in »N izbrana kontakta ne obstajata več.«. Natančna besedila v *Public Interfaces*.

## R-13 Revizijska sled

- **Decision:** množično urejanje → en `AuditLog.record(…, UPDATE, changes)` s `ContactChange(id, name(after), before, after)` za vsak spremenjen kontakt (vrstni red: slovenska abeceda imena); izbris → en `DELETE` z `before`. Brez spremenjenih → brez vnosa (`AuditLog` prazen seznam zavrne). 005 že izriše »uredil(a) N kontaktov« in podrobnosti s paginacijo (FR-005-08) – sprememb 005 ni.
- **Rollback (005)** množičnega vnosa deluje brez sprememb (005 R-12 uveljavlja stanja iz `audit_change`).

## R-14 Vpliv na obstoječe funkcionalnosti in teste

- 004: seznam dobi stolpec izbire (design.md 8.6 ga že predvideva), `<th>` »Izberi« se doda prvi; obstoječi testi seznama, ki štejejo stolpce ali `checkbox`, se po potrebi uskladijo kot `sprememba-testa` (DECISIONS) – pričakovano nobeden (testi iščejo po imenih).
- 005: brez sprememb.
- 008: orodna vrstica nespremenjena; `ContactSearch.where` se ponovno uporabi (R-09, R-10).
- 010: **neskladje** FR-010-02/scenarij 2 (zadetki ob izvozu) z 009 (posnetek + FR-009-18) – rešuje se v `/speckit-clarify` 010; 010 izbor prevzame iz `SelectionProvider` in pred izvozom uporabi `selection-check`.

## R-15 Varnost in zasebnost

- Vse poizvedbe imajo `group_id` iz `Membership`; identitete iz telesa se vedno filtrirajo z `group_id` (nikoli `WHERE id IN (…)` brez skupine). Odgovori `selection-check` vsebujejo samo identitete te skupine.
- Telesa zahtevkov (vrednosti atributov, značke) se ne beležijo (kot 008 R-12); dnevnik ima samo pot, status in ID zahtevka (nginx `log_format` brez telesa).
- Napad z ogromnim telesom: nginx 2 MB, razčlenjevalnik zavrne > 10 000 identitet pred dostopom do baze.
