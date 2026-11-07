# Research: Kontakti skupine

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Vse točke so odločene; v tehničnem kontekstu ni ostalo nobene `NEEDS CLARIFICATION`. Odločitve so povzete v `DECISIONS.md` (D-39).

## R-01 Shranjevanje: tri tabele, ne JSON

- **Odločitev**: tabele `contact`, `contact_attribute`, `contact_tag` (migracija `V4__kontakti.sql`), vse z `ON DELETE CASCADE` na nadrejeno vrstico (izbris kontakta in skupine, 003 data-model).
- **Razlog**: iskanje, filtri in razvrščanje po dodatnih atributih in značkah (008), predlogi značk (FR-004-04) in množično urejanje (009) so poizvedbe po ključih in značkah; `jsonb` bi zahteval posebne indekse in ne bi zagotovil edinstvenosti ključa in značke v kontaktu na ravni baze.
- **Alternative**: `jsonb` stolpca v `contact` (preprostejše branje, slabše poizvedbe in omejitve); EAV z eno tabelo (meša dva pomena).

## R-02 Edinstvenost brez odvisnosti od kolacije baze

- **Odločitev**: ključ atributa in značka sta shranjena v izvorni obliki, poleg njiju pa v stolpcu `key_norm` oziroma `tag_norm` normalizirana oblika (`toLowerCase(Locale.ROOT)` po obrezu); `UNIQUE (contact_id, key_norm)` in `UNIQUE (contact_id, tag_norm)`.
- **Razlog**: `lower()` v PostgreSQL je odvisen od kolacije baze; Java daje enak rezultat v vseh okoljih (Testcontainers, produkcija). Normalizacijo opravi strežnik, odjemalec je ne pozna.
- **Alternativa**: unikatni indeks na `lower(key)` – odvisen od kolacije.

## R-03 Razvrščanje po kodnih točkah Unicode (D-38)

- **Odločitev**: `contact.sort_last` in `contact.sort_first` (`text COLLATE "C"`) hranita `toLowerCase(Locale.ROOT)` priimka in imena, `NULL` za prazno vrednost. Poizvedba: `ORDER BY sort_last NULLS LAST, sort_first NULLS LAST, created_at, id`. Indeks `(group_id, sort_last, sort_first, created_at, id)`.
- **Razlog**: kolacija `"C"` v UTF-8 primerja bajte, to je enako vrstnemu redu kodnih točk; velikost črk je odstranjena v ključu. Prazno se uvrsti na konec (Edge Cases in Assumptions), enaki ključi pa po času ustvarjanja in `id` (uuidv7), kar zagotovi stabilne strani. Indeks omogoča SC-002 (10.000 kontaktov).
- **Opomba**: razvrščanje je neodvisno od jezika vmesnika, zato endpoint seznama nima parametra `lang` (razlika od 002/003).

## R-04 Paginacija

- **Odločitev**: `GET …/contacts?page=&size=` s `size` ∈ {25, 50, 100} (privzeto 25) in `page` ≥ 0; druga velikost → `400 VALIDATION_FAILED`. Odgovor vsebuje `total`; stran onkraj zadnje vrne prazen `items` s pravilnim `total`. Skupno število: `count(*)` nad `(group_id)`.
- **URL**: stran v naslovu poti je 1-osna in uporabniku vidna (`?page=2&size=50`), API je 0-osen kot pri skupinah. Privzete vrednosti se v URL ne zapisujejo.
- **Stran onkraj zadnje**: vmesnik prebere `total` in preusmeri (`replace`) na zadnjo obstoječo stran (kot FR-008-08).

## R-05 Optimistično zaklepanje in primerjava vrednosti (Clarifications 2026-11-06)

- **Odločitev**: `PUT` in `DELETE` pod zaklepom vrstice (`SELECT … FOR UPDATE` na `contact` z `group_id`). Zaporedje (feature-map §2.2): kontakt ne obstaja v skupini → `404` (korak 2, pred vlogo in arhiviranostjo); vloga < EDITOR → `403`; arhivirana → `409 GROUP_ARCHIVED`; `PUT` s poslano verzijo ≠ trenutni: če so razčlenjene vrednosti **enake** trenutnim → `200` brez povečanja verzije, sicer `409 VERSION_CONFLICT` s trenutnim `ContactDetail`; poslana verzija = trenutna: enake vrednosti → `200` brez spremembe, sicer posodobitev in `version + 1`. Neveljavni podatki pri zastareli verziji: `409` (korak 5 pred korakom 6, feature-map §2.2); pri trenutni verziji: `400`.
- **Primerjava**: enakost vseh polj po obrezu in z enakim vrstnim redom atributov in značk (vrstni red je del podatka, Key Entities).
- **Izbris**: verzija je obvezen parameter poizvedbe `version` (`DELETE` nima telesa); manjka ali ni število → `400`. Zastarela verzija → `409 VERSION_CONFLICT` s trenutnim stanjem; neobstoječ kontakt → `404`. Izbris ne primerja vrednosti (ni varianta »enaki podatki«): izbris zastarele verzije je vedno konflikt (Assumptions).
- **Sočasno arhiviranje**: `GroupAccess.require(…, write = true)` opravi korak 4 ob začetku zahtevka. Ker arhiviranje (003) zaklene vrstico skupine z `FOR UPDATE`, vsaka pisalna transakcija kontaktov najprej prebere vrstico skupine z `SELECT archived_at … FOR SHARE`: če je arhiviranje v teku, počaka in nato vidi arhivirano skupino → `409 GROUP_ARCHIVED` (Edge Cases: arhiviranje med odprtim obrazcem). Šele nato zaklene kontakt (`FOR UPDATE`). Vrstni red zaklepov je povsod skupina → kontakt, zato ni zastoja.

## R-06 Preverjanje podatkov na strežniku

- **Odločitev**: razčlenjevalnik `ContactInputParser` (kot `GroupInputParser`) vrne vrednosti in vse napake po poljih; nikoli ne vrže, ker se napake podatkov sporočijo po preverjanju dostopa in verzije. Neznana polja → `UNKNOWN_FIELD`. Polja napak: `firstName`, `lastName`, `address`, `email`, `phone`, `attributes[i].key`, `attributes[i].value`, `attributes` (preveč), `tags[i]`, `tags` (preveč), `body`. Kode: `REQUIRED`, `TOO_LONG`, `INVALID_VALUE`, `DUPLICATE`, `RESERVED_KEY`, `TOO_MANY`, `UNKNOWN_FIELD`, `MALFORMED`.
- **Ime ali priimek**: če sta oba prazna po obrezu, napaka `REQUIRED` na obeh poljih.
- **Vrstice atributov**: vrstica s praznim ključem **in** praznim vrednostjo se prezre; vrstica z enim od njiju je napaka (`REQUIRED`) ob praznem polju.
- **E-naslov**: `^[^\s@]+@[^\s@]+\.[^\s@]+$` in do 254 znakov (dovolj za FR-004-02; popolno RFC 5322 ni cilj). **Telefon**: znaki `0-9 + - ( ) /` in presledek. **Znački**: brez presledkov (vsak Unicode presledek).
- **Rezervirani ključi** (normalizirani: obrezani, mala črka, večkratni presledki v enega): `ime`, `first name`, `priimek`, `last name`, `naslov`, `address`, `e-naslov`, `email`, `e-mail`, `telefon`, `phone`.
- **Znaki**: dolžine se merijo v kodnih točkah, večvrstični naslov normalizira `\r\n` v `\n`.

## R-07 Predlogi značk

- **Odločitev**: `GET /api/groups/{groupId}/tags?q=` (EDITOR; nearhivirana in arhivirana skupina sta dovoljeni za branje, a bralec dobi `403` po FR-004-04 in negativnih scenarijih). Vrne do 20 različnih značk skupine (po `tag_norm`, prikazana je oblika z najstarejšim kontaktom), katerih normalizirana oblika se začne z normaliziranim `q`, razvrščenih po `tag_norm`. Brez `q` vrne prvih 20.
- **Razlog**: predlogi ne smejo pasti iz drugih skupin; poizvedba je vedno z `group_id`. Pot je ločena od `contacts/{id}`, da ni dvoumnosti pri statični poti.
- **Arhivirana skupina**: urednik nima obrazca, zato endpoint v arhivirani skupini ni potreben – a ker je branje, ga dovoljuje (`write = false`), a z najnižjo vlogo EDITOR.

## R-08 Vmesnik: poti, panel in prelomnica 1280 px

- **Poti**: `/groups/:groupId/contacts` (seznam), `…/contacts/new`, `…/contacts/:contactId`, `…/contacts/:contactId/edit`. Poizvedba `page`/`size` se prenese v pot kontakta (`?page=2&size=50`), zato je vrnitev na seznam na isto stran preprosta povezava.
- **Panel**: ≥ 1280 px (`(min-width: 1280px)`) se na poti kontakta izriše seznam in desno panel (400 px); pod 1280 px samo podrobnosti na ločeni strani. Širina se bere z `useMediaQuery`; testni nadomestek `setViewport` se razširi s tretjo širino.
- **404 kontakta** (nedosegljiv ali izbrisan, strežnik ju ne razlikuje): pod 1280 px celotna stran »Te strani ni« (FR-004-14 scenarij 8); od 1280 px seznam ostane, panel pokaže »Tega kontakta ni več – medtem ga je nekdo izbrisal.« (Edge Cases). Isto besedilo velja za urejanje in izbris (FR-004-13). **Predpostavka za opis PR**: spec ne loči tega po širini; ta razlaga ustreza obema mestoma v specifikaciji.
- **Prelomnica seznama**: preglednica ↔ kartice z vsebniško poizvedbo (`@container`, prag 640 px), ne s širino zaslona (design.md 7.2).
- **Privzeti razdelek skupine**: `/groups/:id` preusmeri na `contacts` (002 Assumptions: »od 004 naprej *Kontakti*«); posledično se v testih 002 in 003 spremeni pričakovani cilj preusmeritve (D-39).

## R-09 Nesohranjene spremembe

- **Odločitev**: `App` preide na podatkovni usmerjevalnik (`createBrowserRouter` z eno potjo `*`, ki izriše obstoječe `<Routes>`), ker `useBlocker` ne deluje v `BrowserRouter`. Obrazec uporablja `useBlocker` (navigacija v aplikaciji) in `beforeunload` (zavihek). Vprašanje »Zavržem spremembe?« je dialog z gumboma *Nadaljuj z urejanjem* (privzeti fokus) in *Zavrzi spremembe*, ne `window.confirm` – enak vzorec kot ostali dialogi in testabilen z RTL.
- **Brez sprememb** = vrednosti obrazca so enake začetnim (normaliziranim); takrat *Prekliči* in navigacija brez vprašanja.
- **Alternativa**: samo `beforeunload` + lastna povezava *Prekliči* – ne bi pokrila gumba Nazaj v aplikaciji.

## R-10 Kombinirano polje za značke

- **Odločitev**: lastna komponenta po vzorcu ARIA 1.2 (`role="combobox"` na `<input>`, `aria-controls` na `role="listbox"`, `aria-activedescendant`, `aria-expanded`, `aria-autocomplete="list"`), brez nove knjižnice (design.md 8.4 dovoljuje shadcn ali React Aria; nobena ni nameščena, nova odvisnost bi potrebovala D-NN). Predloge prinese `GET …/tags?q=`; zahteva se po vsaki spremembi besedila (prejšnja se prekliče z `AbortController`-jem in zamikom 150 ms).
- **Vedenje**: *Enter* ali vejica doda vpisano značko (obrezano, brez presledkov); *Enter* z izbranim predlogom doda predlog; *Backspace* v praznem polju ne briše značk (preprečena nenamerna izguba). Napaka (presledek, podvojena, > 50 znakov, > 30 značk) se pokaže ob polju in značka se ne doda.

## R-11 Menij dejanj vrstice in izbris

- **Odločitev**: `DropdownMenu` (obstaja v `shared/ui/dropdown-menu.tsx`) z gumbom »Dejanja za ‹ime›« in elementoma *Uredi kontakt* (povezava) in *Izbriši kontakt*; izbris odpre potrditveni dialog. Seznam zato vsebuje `version` vsakega kontakta (potrebna za `DELETE`). Bralec in člani arhivirane skupine stolpca nimajo (FR-004-17).
- **Po izbrisu**: obvestilo »Kontakt ‹ime› je izbrisan.«, seznam se ponovno prebere (če je stran prazna, na zadnjo obstoječo); iz pogleda kontakta preusmeritev na seznam.

## R-12 Števila kontaktov v 002/003

- **Odločitev**: `GroupRepository.pageByRole` in `pageArchived` zdaj vrneta pravo število kontaktov (podpoizvedba `count(*)` nad `contact`), kar sta 002/003 že predvidela (»Število kontaktov vodi 004; do takrat 0«). Brez spremembe pogodbe (`contactCount` že obstaja).

## R-13 Brez novih knjižnic

Zaledje: obstoječi `JdbcClient`, Jackson (`tools.jackson`), Flyway. Vmesnik: `react-router`, `radix-ui` (Dialog, DropdownMenu), `sonner`, `@tabler/icons-react`, `react-i18next`. Nobena nova odvisnost.
