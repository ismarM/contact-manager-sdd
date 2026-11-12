# Research: Izvoz izbranih kontaktov v Excel (010)

Vhod: [spec.md](spec.md) (Clarify 2026-11-12: izbor po 009 s preverjanjem FR-009-18, razvrščanje stolpcev in značk po D-63), uporabnikov vnos pri `/speckit-plan`: **»datum naj izbere odjemalec«**. Obstoječa koda 008/009/012: `ContactSearch.orderBy`, `ContactQueryParser`, `BulkService.requireKnown` (`existing` + `knownToGroup`), `BulkInputParser.identities`, `useSelectionCheck`, `SelectionActionBar`, `downloadJson.ts` (`localDateStamp`). Technical Context nima več odprtih `NEEDS CLARIFICATION`.

---

## R-01 Kje nastane datoteka: na strežniku

- **Decision:** datoteko `.xlsx` sestavi zaledje v enem endpointu `POST /api/groups/{groupId}/contacts/export` (telo: identitete, razvrstitev, jezik) in jo vrne kot binarni odgovor. Odjemalec ga prenese kot `Blob` in ga shrani z `<a download>` (vzorec `downloadJson`, 012).
- **Rationale:** izbor ima lahko do 10 000 kontaktov. Odjemalec ima podatke samo za trenutno stran, izvoz pa potrebuje vse kontakte z vsemi atributi in značkami. Razvrščanje D-63 (kolacija `sort_sl`, ICU v PostgreSQL) je ena resnica samo v bazi, zato je vrstni red vrstic, stolpcev in značk enak kot na seznamu (FR-010-05 … FR-010-07). Preverjanja `404`/`409 EXPORT_EMPTY` in izolacija (SC-006) so tako na zaledju, kot zahteva konstitucija III.
- **Alternatives considered:** sestava na odjemalcu (knjižnica `.xlsx` v brskalniku, podatki iz novega endpointa JSON). To bi pomenilo dva endpointa namesto enega, prenos ~10 000 kontaktov v JSON in kolacijo v brskalniku (`Intl.Collator('sl')`), ki se lahko razlikuje od ICU v PostgreSQL. Poleg tega bi se paket PWA povečal za ~1 MB.

## R-02 Knjižnica za zapis `.xlsx`

- **Decision:** v zaledju se uporabi `org.dhatim:fastexcel` (Apache-2.0, brez odvisnosti), ki piše tok neposredno v `OutputStream` odgovora. Za branje v testih zaledja se uporabi `org.dhatim:fastexcel-reader` (obseg `test`). Za branje v E2E se uporabi `exceljs` (`devDependency` v `e2e/`), ki je neodvisna implementacija, zato test ne bere datoteke z isto knjižnico, kot jo je zapisala. Vse tri knjižnice dobijo vnos D-89 (`verify.sh` korak `orodja`, FR-000-16). Natančne verzije se pripnejo ob dodajanju.
- **Rationale:** `fastexcel` piše besedilo samo kot vrednost (`value(String)` → celica tipa `s` oziroma deljen niz). Formule nastanejo samo z izrecnim `formula(…)`, ki ga koda ne kliče, kar je osnova za FR-010-08/09 in SC-004. Knjižnica ima majhen pomnilniški odtis (10 000 × ~60 celic se zapiše v tok) in je ~10× manjša od Apache POI.
- **Alternatives considered:** Apache POI (`poi-ooxml`, SXSSF) je razširjen, a ima ~20 MB odvisnosti in več API-ja, kot ga potrebujemo. Ročni zapis SpreadsheetML (ZIP + XML) bi zahteval lastno ubežanje XML in lastno pravilnost formata. CSV ni sprejemljiv, ker spec zahteva `.xlsx`.

## R-03 Datum in ime datoteke: izbere ju odjemalec

- **Decision (vnos uporabnika):** ime datoteke `‹naslov›-kontakti-‹YYYY-MM-DD›.xlsx` sestavi **odjemalec** s čisto funkcijo `exportFileName(title, language, now)`. Datum dobi iz `localDateStamp` (lokalni čas brskalnika, že v 012; premakne se v `shared/download.ts`), naslov pa iz `fileNameTitle(title, language)` po pravilu FR-010-10 (NFD + odstranitev diakritike, `[^A-Za-z0-9._]+` → `-`, obrez vodilnih in končnih `-` in `.`, prazno → `skupina`/`group`). Strežnik datuma ne prejme in ga ne uporablja. Glava `Content-Disposition: attachment; filename="contacts.xlsx"` je samo nevtralna rezerva za neposreden klic API.
- **Rationale:** datum »po lokalnem času uporabnika« pozna samo brskalnik. Enak vzorec že uporablja 012 (`MyDataController`: »odjemalec uporabi lokalnega«). Pravilo imena je čista funkcija in ga v celoti pokrije unit test FE (FR-010-10, scenarija US1-13/14 in robni primer `???`).
- **Alternatives considered:** odjemalec pošlje `date` in strežnik sestavi ime v `Content-Disposition`. To je dodatno polje za validacijo in ubežanje ne-ASCII v glavi (RFC 6266), pri čemer brskalnik ime iz `Blob` prenosa vseeno določi z `download`.

## R-04 Endpoint, telo in vrstni red preverjanj

- **Decision:** `POST /api/groups/{groupId}/contacts/export`, telo `{ "contactIds": [uuid…], "sort": "lastName", "dir": "asc", "language": "sl" }`. Ker gre samo za branje, je endpoint dovoljen vsem članom in v arhivirani skupini.
  - `sort` in `dir` imata enak zapis in pomen kot parametra `sort`/`dir` seznama 008 (`ContactQueryParser`: `firstName|lastName|address|email|phone|attr:‹ključ›`, `asc|desc`). Brez njiju velja privzeta razvrstitev (FR-010-07). Ključ razvrščanja `attr:‹ključ›`, ki ga noben kontakt skupine nima več, **ni napaka** (spec Edge Cases, D-90): `ContactService.requireKnownKeys` se pri izvozu ne kliče, podizraz `ORDER BY` vrne pri vseh `NULL` (`NULLS LAST`), zato vrstice razvrstita vezi priimek in ime, enako kot privzeta razvrstitev.
  - `language`: `sl` | `en` (obvezno). Določa glavo predefiniranih stolpcev in ime lista (FR-010-03, FR-010-04).
  - Vrstni red: `401` → `404` (nečlan, neobstoječa skupina **ali** vsaj ena veljavna identiteta, ki nikoli ni bila kontakt te skupine – `BulkService.requireKnown`, 009 R-02; pri več kot 10 000 identitetah se baza ne obišče, 009 R-15) → `400 VALIDATION_FAILED` (telo ni JSON, identiteta ni UUID, 0 ali več kot 10 000 identitet po zlitju podvojenih (kot `ContactIdList` v 009), neveljaven `sort`/`dir`/`language`) → `409 EXPORT_EMPTY` (nobena identiteta ni več obstoječ kontakt). Koraka `403` in `409 GROUP_ARCHIVED` ni (FR-010-16).
  - Uspeh `200`: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `X-Export-Count: N` (vrstice), `X-Export-Skipped: M` (izpuščeni izbrisani ali združeni, FR-010-11), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Ker so glave na istem izvoru (nginx `/api/` → backend), CORS `expose-headers` ni potreben.
- **Rationale:** `POST` se uporablja iz istega razloga kot v 009 R-01 (10 000 identitet ≈ 400 KB, `client_max_body_size 2m` že velja). Ime `…/contacts/export` sledi `…/contacts/selection-check`. Števila so v glavah, ker je telo binarno.
- **Alternatives considered:** dva koraka (`POST` → id izvoza, `GET` datoteke) prineseta stanje na strežniku, ki ga spec izključuje (»Se ne shranjuje v sistemu«). Odgovor JSON z datoteko v Base64 pomeni +33 % velikosti in dekodiranje v brskalniku.

## R-05 Izbrisani in združeni kontakti: izpust namesto `SELECTION_CHANGED`

- **Decision:** po koraku `404` strežnik prebere obstoječe kontakte iz identitet (`group_id = :g AND id = ANY(:ids)`). Manjkajoče identitete (vse so po koraku 2 nekdaj bile kontakti te skupine, torej izbrisane, združene ali odstranjene z rollbackom) se preštejejo v `X-Export-Skipped`. Če ne ostane noben kontakt → `409 EXPORT_EMPTY` (koda je že v registru feature-map §2.10). `SELECTION_CHANGED` se pri izvozu nikoli ne vrne (spec Clarify 2026-11-12).
- Odjemalec pred izvozom pošlje `selection-check` (FR-009-18) prek obstoječega `useSelectionCheck` z `run = exportContacts`. Pri *Nadaljuj z obstoječim izborom* se manjkajoči odstranijo iz izbora že na odjemalcu, zato je takrat `X-Export-Skipped` 0. Neničelno število nastane samo v kratkem času med preverjanjem in izvozom (US3-4).
- **Rationale:** izvoz je branje, zato zavrnitev nima koristi (spec Assumptions). Ponovna uporaba `requireKnown` ohrani enako razlikovanje 404/izbrisan kot v 009 brez nove tabele.

## R-06 Konsistentno branje in vrstni red

- **Decision:** ena transakcija `@Transactional(readOnly = true, isolation = REPEATABLE_READ)`, zato vse poizvedbe (kontakti, atributi, značke) vidijo isti posnetek baze in se datoteka ne more »razpoloviti« med sočasnim urejanjem. Zaklepov ni, ker gre za branje, ki ne blokira pisanja.
  1. Vrstice: `SELECT c.id, c.first_name, c.last_name, c.address, c.email, c.phone FROM contact c WHERE c.group_id = :group AND c.id = ANY(:ids) ORDER BY ‹ContactSearch.orderBy(query)›`. Gre za isti fragment kot seznam 008, zato FR-010-07 velja po konstrukciji (vključno z vezmi `created_at`, `id`).
  2. Atributi: `SELECT contact_id, key, key_norm, value FROM contact_attribute WHERE contact_id = ANY(:ids)` po kosih 5000 (vzorec `chunks`).
  3. Značke v celici: `SELECT contact_id, tag FROM contact_tag WHERE contact_id = ANY(:ids) ORDER BY contact_id, tag_norm COLLATE sort_sl, tag_norm` (D-63, FR-010-06; vez po `tag_norm` v `C` za determinizem).
  4. Stolpci dodatnih atributov: različni `key_norm` izvoženih kontaktov, razvrščeni v SQL z `ORDER BY key_norm COLLATE sort_sl, key_norm` (vzorec `ContactRepository` vrstica 306). Glava je `key` iz **prve vrstice datoteke** (po vrstnem redu iz koraka 1), ki ima ta `key_norm` (FR-010-05). Izračuna se v Javi v enem prehodu.
- **Rationale:** kolacija `sort_sl` (V8, `sl-u-ks-level2`) je enaka kot pri seznamu, zato se D-63 ne podvaja v Javi (`java.text.Collator` se od ICU razlikuje v robnih primerih). `= ANY(:ids)` z enim parametrom polja (`uuid[]`) se izogne 10 000 vezanim parametrom.
- **Alternatives considered:** razvrščanje stolpcev in značk v Javi s `Collator.getInstance(sl)` – tveganje razhajanja z bazo; `SERIALIZABLE` – nepotrebno za branje.

## R-07 Zapis celic: besedilo in zaščita pred formulami

- **Decision:** čista funkcija `CellText.of(String value)`: `null` ali `""` → brez celice (prazna celica). Če je prvi znak `=`, `+`, `-`, `@`, `\t` ali `\r`, se vrednosti doda vodilni `'`. Sicer ostane vrednost nespremenjena (vodilne ničle, prelomi vrstic, presledki). Funkcija se uporabi za **vsako** celico, tudi za glave stolpcev dodatnih atributov (FR-010-09). Zapis je `sheet.value(row, col, String)` (deljen niz, tip besedilo). Stolpci dobijo slog `format("@")` (besedilo), zato tudi ročno popravljena celica v preglednici ostane besedilo. Prelom vrstice v naslovu dobi `wrapText`.
- **Rationale:** spec (Assumptions – zaščita) zahteva, da je `'` dejanski znak vrednosti, ki je viden ob branju nazaj in ohranjen ob shranjevanju v CSV. Ker je funkcija čista, unit test pokrije vse vodilne znake in robni primer »presledek, nato `=`« brez Testcontainers.
- **Alternatives considered:** `quotePrefix` v slogu celice se pri izvozu v CSV izgubi, zato ga spec izrecno zavrne.

## R-08 Jezik glave in lista na strežniku

- **Decision:** zaprta preslikava `ExportLabels` (`sl`/`en`) v zaledju: ime lista »Kontakti«/"Contacts" in glave »Ime«, »Priimek«, »Naslov«, »E-naslov«, »Telefon«, »Značke« / "First name", "Last name", "Address", "Email", "Phone", "Tags" (FR-010-04, dobesedno po spec). Odjemalec pošlje `language` = trenutni `i18n.language` ob kliku (Edge Cases – menjava jezika).
- **Rationale:** besedila datoteke niso del vmesnika, zato ne sodijo v `i18n/{sl,en}.json`. Unit test zaledja preveri natančna besedila. Preverjanje `i18n-keys` v `verify.sh` ostane nespremenjeno.

## R-09 Meja stolpcev Excel (16 384)

- **Decision:** list `.xlsx` ima največ 16 384 stolpcev. Izvoz potrebuje `6 + število različnih ključev`, kar je teoretično do 500 000 (10 000 kontaktov × 50 atributov). Če je ključev več kot 16 378 (stolpcev več kot 16 384), strežnik vrne `400 VALIDATION_FAILED` z napako `{ field: "contactIds", code: "TOO_MANY_COLUMNS" }`. Vmesnik prikaže »Izbrani kontakti imajo preveč različnih dodatnih atributov za en list. Izvozi manjši izbor.« / "The selected contacts have too many different custom attributes for one sheet. Export a smaller selection."
- **Rationale:** brez pravila bi `fastexcel` vrgel izjemo in vrnil `500`. Izbrana je najmanjša, preverljiva rešitev v okviru FR-010-13 (neveljaven obseg izbora → `400`). **Potrjeno po `/speckit-analyze`** (D-90): FR-010-13, robni primer in negativni scenarij v spec.
- **Alternatives considered:** razdelitev na več listov krši FR-010-03 (natanko en list). Prirezovanje ključev bi tiho izgubilo podatke.

## R-10 Vmesnik: gumb, stanja in obvestila

- **Decision:** nova podmapa `features/contacts/export/`:
  - `ExportButton` v `SelectionActionBar` (vidni vsem članom, tudi v arhivirani skupini, FR-010-01). Uporablja `useSelectionCheck({ run: ids => exportContacts(…), onSuccess })`, zato se obvestilo FR-009-18 (`SelectionChangedNotice`) prikaže nad seznamom v območju obvestil akcijske vrstice, ne v dialogu.
  - Med `busy` ima gumb `aria-disabled="true"` (ne `disabled`, da ostane v zaporedju tabulatorja, vzorec 009) in vidno besedilo »Pripravljam izvoz…«. Ker bralniki zaslona spremembe imena gumba v fokusu ne preberejo zanesljivo, je **edino** sporočilo ločen, vizualno skrit `role="status"` (`sr-only`), ki ob začetku priprave dobi »Pripravljam izvoz…« in se ob koncu izprazni (FR-010-15, Edge Cases – bralnik zaslona; D-90). Ime gumba ni živo območje, zato se besedilo ne prebere dvakrat.
  - Uspeh: `downloadBlob(blob, exportFileName(…))`, nato toast (`sonner`, `role="status"`) »Izvoženih kontaktov: N.« in po potrebi stavek o izpuščenih s sklanjatvami (`one`/`two`/`few`/`other`). Izbor se ne spremeni (FR-010-14).
  - Neuspeh: `role="alert"` nad seznamom (design.md 8.13) z gumbom *Poskusi znova* (ponovi celoten potek s preverjanjem). Besedila: `409 EXPORT_EMPTY` → »Nobeden od izbranih kontaktov ne obstaja več.«; `400` z več kot 10 000 → sporočilo meje; `TOO_MANY_COLUMNS` (R-09); brez povezave ali `5xx` → »Izvoz ni uspel. Poskusi znova.« oziroma obstoječi `groups.offline` (8.15: gumb ostane viden, ob kliku pojasni).
- **Rationale:** ponovna uporaba `useSelectionCheck` pomeni eno samo pot za FR-009-18 v vseh treh akcijah. `aria-disabled` z oznako sledi 009 (»Uporabljam…«).
- `apiFetchBlob` v `shared/api/client.ts`: enaka obdelava napak kot `apiFetch` (`ApiError` z `code` iz telesa JSON), ob uspehu vrne `{ blob, headers }`.

## R-11 Zmogljivost (SC-002) in testi

- **Decision:** `ExportPerformanceIT` (korak `full`, vzorec `BulkPerformanceIT`): 10 000 kontaktov s 5 dodatnimi atributi (20 različnih ključev) in 3 značkami, 2 ogrevalna in 10 merjenih izvozov, p95 < 10 s od zahtevka do zadnjega bajta. Pomnilnik: `fastexcel` piše v tok, podatki v pomnilniku pa so ~10 000 × (6 + 5) nizov (< 50 MB).
- **E2E** (konstitucija II, workflow §2.9): `izvoz-excel.spec.ts` pri 360/768/1280 px s `page.waitForEvent('download')` prenese datoteko in jo prebere z `exceljs`. Preveri ime lista, glavo, vrstice in besedilo celic, da nobena celica nima formule ter ime datoteke (`download.suggestedFilename()`).
