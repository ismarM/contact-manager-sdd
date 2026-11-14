# Research: Iskanje, filtri in razvrščanje kontaktov

Odločitve faze Plan za 008. Povzetek je v D-64 (`DECISIONS.md`); razvrščanje nadomešča D-38 (D-63). Preizkusi baze so bili izvedeni na sliki `postgres:18-alpine` (PostgreSQL 18.6, ICU), isti kot v Compose in Testcontainers.

## R-01 Slovensko razvrščanje: nedeterministična ICU kolacija `sort_sl` (D-63)

- **Odločitev**: nova kolacija `CREATE COLLATION sort_sl (provider = icu, locale = 'sl-u-ks-level2', deterministic = false)`. Vsi trije stolpci, po katerih razvrščamo kontakte (`sort_last`, `sort_first` in polja ob izbiri drugega polja), se primerjajo s to kolacijo.
- **Razlog**: pravilo D-63 zahteva abecedo (Č za C, Š za S, Ž za Z), **ne glede na velikost črk**, nato priimek → ime → čas nastanka → id. Obstoječa kolacija `title_sl` (V3, privzeta moč *tertiary*, deterministična) velikost črk upošteva kot razločevalni ključ: `novak` in `Novak` sta ji različna, zato bi dva kontakta s priimkoma `novak` in `Novak` nikoli prišla do primerjave po imenu. Preizkus: `title_sl` vrne `novak, Novak, šuligoj, Šuligoj`, `sort_sl` pa ju šteje za enaka in odloči naslednji ključ. Moč *secondary* ohrani razliko med znaki (Č ≠ C), prezre pa velikost črk.
- **Preverjeno** (PostgreSQL 18.6, alpine): `Ana, Ceh, Cene, cene, Čeh, Dana, Suhadolnik, šuligoj, Šuligoj, Zupan, Žagar` – `Čeh` stoji za vsemi `C…`, `Žagar` za `Zupan`; `'Novak' = 'novak' COLLATE sort_sl` je `true`, `'Čeh' = 'ceh' COLLATE sort_sl` je `false`.
- **Omejitev nedeterministične kolacije**: ne uporabljamo je za `LIKE`, `UNIQUE` ali pogoje; samo za `ORDER BY` in indeks (b-drevo to podpira). Zato ni težav s PostgreSQL < 18.
- **Alternative**: (a) deterministična kolacija na stolpcih z malimi črkami – deluje samo za `sort_last`/`sort_first`, ne za e-naslov, telefon in dodatne atribute, kjer ključev razvrščanja ni; (b) `lower(col) COLLATE title_sl` – izraz brez indeksa za privzeto razvrščanje; (c) razvrščanje v Javi – nezdružljivo s paginacijo.
- **Tveganje**: različica ICU v sliki. Ob posodobitvi slike z drugo različico ICU PostgreSQL opozori (`collation version mismatch`) in indeks `contact_group_sort` je treba obnoviti (`REINDEX`, `ALTER COLLATION … REFRESH VERSION`). Slika je v Compose pripeta na `postgres:18-alpine` (plavajoča oznaka); priporočilo za pregled v PR: pripeti na natančno različico. To ni del 008.

## R-02 Migracija `V8__iskanje.sql` (V4 se ne spreminja)

- **Vsebina**:
  1. `CREATE COLLATION sort_sl …` (R-01) in `CREATE COLLATION search_fold (provider = icu, locale = 'und-u-ks-level1', deterministic = false)` (R-03);
  2. `ALTER TABLE contact ALTER COLUMN sort_last TYPE text COLLATE sort_sl, ALTER COLUMN sort_first TYPE text COLLATE sort_sl;` – spremeni kolacijo obstoječih stolpcev. PostgreSQL ob tem prepiše tabelo in obnovi indeks `contact_group_sort (group_id, sort_last, sort_first, created_at, id)`, zato se ne dotaknemo V4 in indeksa ni treba ponovno ustvariti. Vrednosti v stolpcih (male črke, `NULL` za prazno) ostanejo enake, zato `ContactRepository`, `ContactSnapshots`, `ContactFixtures` in E2E pomočniki ne potrebujejo spremembe zapisovanja;
  3. `CREATE INDEX contact_attribute_key ON contact_attribute (key_norm, contact_id)` – za pogoje nad dodatnim ključem, preverjanje obstoja ključa v skupini in seznam ključev.
- **Zaklep**: `ALTER COLUMN … TYPE` vzame `ACCESS EXCLUSIVE` zaklep na `contact` za čas prepisa. Pri obsegu aplikacije (do nekaj deset tisoč vrstic) je to sekunde; Flyway ga požene ob zagonu pred prometom. Sprejeto.
- **Preizkus** (10.000 vrstic): po spremembi kolacije načrt privzete poizvedbe (`WHERE group_id = … ORDER BY sort_last NULLS LAST, sort_first NULLS LAST, created_at, id LIMIT 25`) ostane *Index Only Scan* po `contact_group_sort` (0,4 ms).
- **Vpliv na `ContactRepository.page` (004)**: za privzeto razvrščanje se `ORDER BY` ne spremeni (kolacija je lastnost stolpca). Metodi `page(UUID, int, int)` in `count(UUID)` nadomestita iskalni različici (R-05) z istim privzetim `ORDER BY`; stari metodi se odstranita, ker ju kliče samo `ContactService.list` (`contactCount` v 002/003 računa `GroupRepository` sam).
- **Opomba**: stolpca `sort_last`/`sort_first` ostaneta ključa z malimi črkami (`toLowerCase(Locale.ROOT)`); za kolacijo `sort_sl` velikost črk ni pomembna, a spremembe zapisovanja v 004 se ne izplačajo.

## R-03 Iskanje: `strpos` z nedeterministično kolacijo `search_fold`

- **Odločitev**: beseda je v atributu, če je `strpos(coalesce(col, '') COLLATE search_fold, :beseda) > 0`. Kolacija `und-u-ks-level1` (nedeterministična, koren CLDR) prezre velikost črk in vse strešice, torej `c = č = ć`, `s = š`, `z = ž`, `a = á` (FR-008-02).
- **Preverjeno** (PostgreSQL 18.6): `strpos('Zupančič' COLLATE search_fold, 'ZUPANC') = 1`; `'Zupančič' LIKE '%zupanc%' COLLATE search_fold` je `true`. PostgreSQL ≥ 18 dovoljuje podniz z nedeterministično kolacijo; slika je 18.
- **Zakaj `strpos` in ne `LIKE`**: `strpos` nima nadomestnih znakov, zato so `%`, `_`, `*`, `+`, `(` in `\` dobesedni (Edge Cases); `LIKE` bi zahteval ubežanje.
- **Zakaj ne `unaccent`**: razširitev je dodatna odvisnost in bi zahtevala `lower(unaccent(x))` na vsakem stolpcu (v izvedbi brez ICU `lower` deluje po ctype baze); `search_fold` je ena kolacija, ki naredi oboje.
- **Besede**: iskalni niz se obreže, zaporedni presledki postanejo eden (Unicode presledki), razdeli se na besede; kontakt je zadetek, če za vsako besedo obstaja vsaj en predefiniran atribut, ki jo vsebuje (`AND` čez besede, `OR` čez atribute). Beseda, sestavljena samo iz nevidnih znakov (kategorije `Cc`, `Cf`, npr. `\u200b`), se zavrže (odločitev; preverjeno: `strpos('abc' COLLATE search_fold, E'\u200b')` vrne 0, torej bi beseda sicer dala 0 zadetkov); znak U+0000 pa je napaka `MALFORMED` (R-06). Preverjeno tudi: ICU na ravni 1 zlije `Đ`→`d`, `Ł`→`l`, `Ć`→`c`, `Ü`→`u` (`dorde` najde »Đorđe«); ločila in presledki ostanejo pomembni (`041123` ne najde »041 123 456«, `novakkralj` ne najde »Novak-Kralj«).
- **Telefon** (CR-008-1, D-68): primerjava je dobesedna, presledki v telefonu so pomembni (`041123` najde `041123456`, ne `041 123 456`; `041 123` se razdeli na besedi `041` in `123`, zato najde oba; pogoj filtra `phone:041 123` se ne razdeli in najde samo `041 123 456`): privzeto ICU *alternate = non-ignorable* presledkov in ločil ne prezre.
- **Hitrost** (10.000 kontaktov v skupini, brez indeksa): iskanje po 5 poljih 34 ms, pogoj nad e-naslovom 10 ms, pogoj nad dodatnim atributom 2 ms. Polno skeniranje skupine je zadosti hitro za SC-001 (< 1 s, p95); trigramski indeksi ne bi delovali z nedeterministično kolacijo in niso potrebni.

## R-04 Filtri: pogoji atributov in značke

- **Pogoj nad predefiniranim poljem** (`firstName`, `lastName`, `address`, `email`, `phone`): `strpos(coalesce(c.<stolpec>, '') COLLATE search_fold, :v) > 0`; `<stolpec>` je iz zaprte preslikave (R-06), nikoli iz vnosa.
- **Pogoj nad dodatnim ključem**: `EXISTS (SELECT 1 FROM contact_attribute a WHERE a.contact_id = c.id AND a.key_norm = :k AND strpos(a.value COLLATE search_fold, :v) > 0)`. `:k` je `ContactInputParser.normalize(key)` (male črke, `Locale.ROOT`, kot ob shranjevanju), zato `Kompetenca` = `kompetenca`; kontakt brez ključa pogoju ne ustreza. Več pogojev nad istim ključem so ločeni `EXISTS` (IN: `web` **in** `dev`).
- **Značke**: za vsako značko `EXISTS (SELECT 1 FROM contact_tag t WHERE t.contact_id = c.id AND t.tag_norm = :tag)`; `:tag` je normalizirana oblika. Podvojene značke v zahtevi (`vip`, `VIP`) se združijo, preden se šteje omejitev 30. Značka, ki je ni v skupini, da 0 zadetkov (ni napaka).
- Vse vrednosti so imenovani parametri (`JdbcClient`); nič iz vnosa ne vstopa v besedilo SQL (R-13).
- **Alternativa**: en `JOIN` z `GROUP BY … HAVING count(DISTINCT tag_norm) = N` – dražje za strani in težje za združevanje z drugimi pogoji; `EXISTS` uporablja indeks `contact_tag_norm (tag_norm, contact_id)` in PK.

## R-05 Razvrščanje in poizvedba strani

- **Polja razvrščanja** (zaprta preslikava, D-63): `lastName` (privzeto), `firstName`, `address`, `email`, `phone` in `x.<ključ>` (dodatni atribut). Vrstni red v poizvedbi je vedno:

  | Polje | `ORDER BY` |
  |---|---|
  | `lastName` | `sort_last ‹smer› NULLS LAST, sort_first ASC NULLS LAST, created_at, id` |
  | `firstName` | `sort_first ‹smer› NULLS LAST, sort_last ASC NULLS LAST, created_at, id` |
  | `address`, `email`, `phone` | `‹stolpec› COLLATE sort_sl ‹smer› NULLS LAST, sort_last ASC NULLS LAST, sort_first ASC NULLS LAST, created_at, id` |
  | `x.<ključ>` | `(SELECT a.value FROM contact_attribute a WHERE a.contact_id = c.id AND a.key_norm = :sortKey) COLLATE sort_sl ‹smer› NULLS LAST, sort_last ASC …, created_at, id` |

  `‹smer›` je `ASC` ali `DESC` (iz oštevilčene vrednosti, ne iz besedila). `NULLS LAST` velja v obeh smereh (FR-008-07); enake vrednosti vedno naraščajoče po priimku, imenu, času nastanka in id, zato je vrstni red popolnoma določen (stabilna paginacija; `id` je `uuidv7`, edinstven).
- **Prazno**: `NULL` v `sort_last`/`sort_first` in v stolpcih (004 ne shrani praznih nizov); atribut, ki ga kontakt nima, daje `NULL` iz podizbire.
- **Privzeto razvrščanje po priimku** je isto kot izbira `lastName` + `asc`; brez parametrov `sort`/`dir` poizvedba uporablja indeks `contact_group_sort`. Ob padajoči smeri ali drugem polju je dodatno razvrščanje v pomnilniku v obsegu zadetkov skupine (v meritvi 10.000 vrstic < 100 ms).
- **Stran**: `SELECT … FROM contact c WHERE c.group_id = :g AND ‹iskanje› AND ‹pogoji› AND ‹značke› ORDER BY … LIMIT :size OFFSET :offset`; skupno število: `SELECT count(*)` z istim `WHERE` (isti gradnik, dva klica kot v 004; vmes se lahko podatki spremenijo, kar spec dopušča). Stran onkraj zadnje: `200` s praznim `items` in pravilnim `total` (kot 004); vmesnik preusmeri na zadnjo (FR-008-08).
- **Značke strani** (`tags(ids)`) in `ContactSummary` ostanejo iz 004.

## R-06 Razčlenitev in preverjanje parametrov (FR-008-14)

- **Razred** `ContactQueryParser` razčleni `Map<String, List<String>>` (ne Spring tipov) v `ContactQuery` ali seznam napak; uporabljata ga lahko tudi 009 in 010. Razčlenitev zbere **vse** napake naenkrat (`FieldError(field, code)`), kot `ContactInputParser`.
- **Napake**:

  | Polje | Koda | Primer |
  |---|---|---|
  | `q` | `TOO_LONG` | več kot 200 znakov po obrezu |
  | `f[i]` | `MALFORMED` | pogoj brez `:` ali z neveljavnim `%`-zaporedjem v ključu |
  | `f[i]` | `UNKNOWN_FIELD` | polje ni predefinirano in nima predpone `x.`; ali ključ ne obstaja v skupini |
  | `f[i]` | `REQUIRED` | prazna vrednost (tudi samo presledki) |
  | `f[i]` | `TOO_LONG` | vrednost > 500 znakov |
  | `f` | `TOO_MANY` | več kot 10 pogojev |
  | `tag[i]` | `REQUIRED` / `TOO_LONG` | prazna značka / več kot 50 znakov |
  | `tag` | `TOO_MANY` | več kot 30 različnih značk |
  | `sort` | `UNKNOWN_FIELD` | neznano ali prazno polje ali ključ, ki ne obstaja v skupini |
  | `dir` | `INVALID_VALUE` | ni `asc` ali `desc` |
  | `page`, `size` | `INVALID_VALUE` | kot 004 (D-43): ni celo število ≥ 0, `size` ni 25, 50, 100; prazna vrednost je napaka |

  `i` je 0-osni položaj v vrstnem redu zahteve. Dolžine so v kodnih točkah (`codePointCount`), vrednosti se obrežejo (`strip()`), zaporedni presledki v `q` se združijo.
- **Znak U+0000** (v `q`, vrednosti `f`, ključu `x.…` ali `tag`) PostgreSQL zavrne (`invalid byte sequence for encoding "UTF8": 0x00`, preverjeno) – brez pravila bi bil odgovor `500`. Razčlenjevalnik ga zavrne **pred** vsako drugo obdelavo (tudi pred zavržitvijo besed iz znakov `Cc`/`Cf`) z `MALFORMED` pri `q`, `f[i]` oziroma `tag[i]`; ostali nadzorni znaki (`Cc`, `Cf`) so v vrednosti `f` in `tag` dovoljni (dobesedno primerjani).
- **Neveljavno %-kodiranje pri neposrednem klicu API** (npr. `?q=%zz`): zavrne ga vsebnik (Tomcat `400` brez telesa JSON), preden pride do krmilnika; vmesnik take zahteve ne more povzročiti, ker poizvedbo gradi sam (`URLSearchParams`). Sprejeto in samo dokumentirano; neveljavna zaporedja `%` **znotraj** ključa `x.…` so `MALFORMED` (R-07).
- **Obstoj ključa v skupini** se preveri šele, ko je razčlenitev sintaktično uspela (ena poizvedba: `SELECT k FROM unnest(:keys) k WHERE EXISTS (SELECT 1 FROM contact_attribute a JOIN contact c ON c.id = a.contact_id WHERE a.key_norm = k AND c.group_id = :g)`), tako da napaka ne razkrije, ali ključ obstaja v drugi skupini (FR-008-14, FR-008-16): odgovor je enak za »ključa ni nikjer« in »ključ je samo v drugi skupini«.
- **Vrstni red**: 401 → 404 → 400 (preverjanje 403 in `GROUP_ARCHIVED` ne obstaja; vse je branje, §2.2).
- **Parameter `page`**: v API je 0-osni (kot v 004), v naslovu vmesnika 1-osni.

## R-07 Oblika naslova (URL) in API poizvedbe

Isti parametri v API in v naslovu strani (razen `page`, glej R-06):

| Parameter | Pomen | Primer |
|---|---|---|
| `q` | iskalni niz (prosto iskanje) | `q=janez%20novak` |
| `f` (ponovljiv, ≤ 10) | pogoj `‹polje›:‹vrednost›` – ločilo je prvi `:`; vrednost je vse za njim | `f=email:feri.si&f=x.kompetenca:web` |
| `tag` (ponovljiv, ≤ 30) | značka | `tag=vip&tag=konferenca2025` |
| `sort` | polje razvrščanja (privzeto `lastName`) | `sort=x.podjetje` |
| `dir` | `asc` (privzeto) ali `desc` | `dir=desc` |
| `page` | stran; API 0-osna, naslov 1-osna (privzeto prva) | `page=3` |
| `size` | 25 (privzeto), 50, 100 | `size=100` |

- **Polje**: `firstName`, `lastName`, `address`, `email`, `phone` ali `x.‹ključ›` za dodatni atribut. V ključu sta znaka `%` in `:` zapisana kot `%25` in `%3A` (nato se celoten parameter še kodira po URL pravilih), zato vrednost `x.a%3Ab:vrednost` pomeni ključ `a:b`. Predpona `x.` ločuje ključ od predefiniranih polj (ključ `email` je v 004 rezerviran, `x.email` bi bil zavrnjen kot neobstoječ ključ).
- **Privzete vrednosti se ne zapišejo** (`sort=lastName`, `dir=asc`, `page=1`, `size=25`), naslov je kratek in kanoničen: dva enaka stanja imata enak naslov. Razčlenitev v vmesniku je prizanesljiva (neznani parametri se prezrejo), strežnik je strog (400).
- **Kanoničnost**: parametri se serializirajo v vrstnem redu `q, f…, tag…, sort, dir, size, page`; pogoji in značke ohranijo vrstni red uporabnika (oznake filtrov v istem vrstnem redu), podvojene značke se odstranijo.
- **Prihodnost (009, 010)**: obe uporabljata ta isti model (`ContactQuery`; v zahtevah POST isti zapis kot objekt `{q, f[], tag[], sort, dir}` brez `page`/`size`). 008 ne uvaja telesa zahteve.
- **Zavrnjene alternative**: JSON v enem parametru (nečitljiva povezava, težje ročno urejanje); ločena `fk`/`fv` (povezava po položaju je krhka); `field.op=value` (operatorji so izven obsega: samo »vsebuje«).

## R-08 Možnosti filtrov: `GET /api/groups/{groupId}/contact-filters` (FR-008-06)

- **Odločitev**: nov endpoint, VIEWER, dovoljen tudi v arhivirani skupini. Odgovor `{ "keys": [...], "tags": [...] }`: različni dodatni ključi in različne značke kontaktov **te** skupine (`WHERE c.group_id = :g`), vsak v obliki najstarejšega kontakta (kot predlogi značk v 004, R-07), razvrščeni po `sort_sl` na normalizirani obliki. Predefinirani atributi so konstantni v vmesniku (ne v odgovoru).
- **Zakaj ne `GET /tags`**: ta je EDITOR in predlaga s predpono (004). Bralec mora videti značke v filtrih.
- **Zakaj ne vgrajeno v seznam**: možnosti niso odvisne od strani/iskanja; vmesnik jih naloži enkrat ob prikazu seznama (izbira *Razvrsti* ponuja dodatne ključe tudi pri zaprtem panelu) in jih uporabi tudi v panelu *Filtri*; ponovno se naložijo le ob izrecnem ponovnem poskusu po napaki.
- **Velikost**: število različnih ključev in značk ni omejeno z modelom (največ 50 + 30 na kontakt). Strežnik vrne **vse** (omejitev bi tiho skrila značke), prikaz pa omeji vmesnik z iskalnim poljem »Poišči značko« (R-10, odločitev D-67). Meritev v ITu: 10.000 kontaktov × 3 atributi × 3 značke in skupina z 1000 različnimi značkami < 500 ms.
- **Indeksi**: `contact_attribute_key (key_norm, contact_id)` (R-02) in obstoječi `contact_tag_norm`.

## R-09 Stanje seznama v vmesniku

- **Modul** `contactQuery.ts` (čista funkcija, brez React): `parseQuery(URLSearchParams) → ContactQuery`, `serializeQuery(ContactQuery) → string`, `countFilters(q)`, `describeFilter(…)`, ter pretvorba v parametre API (stran 0-osna). Nadomesti `readPaging`/`listSearch` iz `contactRouting.ts` (te so zdaj poseben primer). Seznam 004 že bere `page`/`size` iz naslova; razširimo ga, ne nadomestimo komponent.
- **Naslov je vir resnice**: `useSearchParams` → `ContactQuery`; iskalno polje ima lokalno vrednost (takojšen odziv) in po 300 ms miru (design.md 8.7) zapiše `q` v naslov. Komponenta si zapomni zadnjo vrednost, ki jo je **sama** zapisala (`lastWritten`). Polje se uskladi z naslovom samo, kadar se `q` v naslovu razlikuje od `lastWritten` (navigacija od zunaj: *Nazaj*, *Naprej*, deljena povezava, *Počisti filtre*); odmev lastnega zapisa ali zakasnel odgovor starejšega zahtevka polja nikoli ne prepiše, zato uporabnik med tipkanjem ne izgubi znakov.
- **Zgodovina**: iskalni niz piše z `replace` (tipkanje ne zalaga zgodovine); uporaba filtrov, odstranitev oznake, razvrstitev, stran in velikost strani pišejo z `push` (*Nazaj* jih razveljavi). *Počisti filtre* je `push`.
- **Ponastavitev strani**: vsaka sprememba `q`, `f`, `tag`, `sort`, `dir` ali `size` postavi stran na 1 (FR-008-08); samo sprememba strani jo ohrani.
- **Zahtevek**: en učinek na `ContactQuery` (serializiran ključ); star zahtevek se prekine (`AbortController`) in njegov odgovor se zavrže (`active` kot v 004), zato vedno velja zadnji (FR-008-17). Prejšnja vsebina ostane med nalaganjem (`aria-busy="true"` na regiji preglednice, oznaka »Nalagam…« po zakasnitvi `useDelayed`).
- **Napake**: `400` → stanje `invalid` (»Filtri niso veljavni.« + *Počisti filtre*); omrežje, 5xx → `failed` s prejšnjo vsebino in `role="alert"` z *Poskusi znova*; 404 → `NotFoundPage` (kot 004).
- **Podrobnosti kontakta**: povezava iz seznama in vrnitev ohranita celoten naslov seznama (ne le `page`/`size`), zato *Nazaj* po ogledu pokaže isto iskanje (FR-008-09, razširitev 004 R-11).

## R-10 Orodna vrstica, panel filtrov, oznake, razvrščanje (design.md 8.6, 8.7, 8.9, 8.15)

- **Pristanišče**: iskalno polje, število zadetkov, *Filtri (N)*, panel filtrov, oznake, *Razvrsti* in gumb smeri so v enem območju `role="search"` (nativni element `<search>` ali `div role="search"`) z imenom »Iskanje in filtri« / "Search and filters". Testi (omejeni na role) do števila zadetkov, gumbov *Počisti filtre* in oznak dostopajo prek `within(getByRole('search', { name: … }))`; zunaj območja ostanejo preglednica in paginacija (ki ima svoj `status`).
- **Orodna vrstica** nad preglednico: iskalno polje (`type="search"`), gumb *Filtri (N)* (`aria-expanded`, `aria-controls`), izbira *Razvrsti* (nativni `<select>`, design.md 13) in gumb smeri. Na telefonu (< 640 px) se vrstica zlomi v dve vrstici (iskanje čez celo širino; filtri in razvrščanje pod njim); razvrščanje je vedno na voljo, ker glav stolpcev na karticah ni.
- **Panel filtrov** je razkrivni (ne modalen): osnutek pogojev (vrstica: *Atribut* `<select>` + *Vrednost* + *Odstrani pogoj*), *Dodaj pogoj* (največ 10), skupina potrditvenih polj *Značke* z iskalnim poljem »Poišči značko« (D-67), *Uporabi filtre*, *Počisti filtre*.
- **Značke v panelu (D-67, možnost A)**: `searchbox` »Poišči značko« zoži seznam (vsebuje, brez razlike velikosti črk in strešic, računano v vmesniku nad naloženim seznamom); izbrane značke so **vedno** prikazane na vrhu (tudi če jih iskanje ne zadene in tudi če jih ni več med možnostmi skupine – dodatna obkljukana polja, tako da *Uporabi filtre* in deljena povezava ne izgubita značke); neizbranih zadetkov se hkrati izriše največ 100. `status` »Značke: prikazanih ‹N› od ‹M›« / "Tags: showing ‹N› of ‹M›" (z dodatkom »Vpiši iskanje za ožji izbor.«, kadar je zadetkov več od prikazanih) se osveži po vsaki spremembi polja in ga bere bralnik zaslona. Polje, polja značk in gumbi so v naravnem vrstnem redu tipkovnice (iskanje → izbrane → zadetki → *Uporabi filtre*). Ključi v izbiri *Atribut* ostanejo nativni `<select>`; ključ iz naslova, ki ga ni med možnostmi, je dodatna izbira v tisti vrstici (pogoj ostane viden in odstranljiv, strežnik pa vrne `400` → »Filtri niso veljavni.« s *Počisti filtre*). Osnutek ni v naslovu, dokler ni uporabljen; *Uporabi filtre* zapiše naslov. Pri odprtju se osnutek napolni iz naslova.
- **Oznake uporabljenih filtrov**: `ul` »Uporabljeni filtri« z gumbom na oznako (»Odstrani filter ‹opis›«). Opis pogoja: »‹polje› vsebuje ‹vrednost›«, značke: »Značka: ‹značka›«. Število v *Filtri (N)* = pogoji + značke (iskalni niz ni filter).
- **Fokus** po odstranitvi oznake: na gumb naslednje oznake, sicer prejšnje, sicer – ko je odstranjena zadnja – na gumb *Filtri* v istem območju »Iskanje in filtri« (FR-008-11: »območje oznak filtrov« je to območje; fokus nikoli ne pade na `body`).
- **Glave stolpcev** *Ime in priimek* (`lastName`), *E-naslov*, *Telefon*: gumb v `th`, `aria-sort="ascending|descending|none"`; ponovni klik obrne smer, prvi klik na drug stolpec = naraščajoče. *Značke* ni razvrstljiva. Gumb ohrani besedilo stolpca kot ime, zato imena glav iz 004 ostanejo enaka.
- **Število zadetkov**: `<p role="status">` »Najdenih 18 kontaktov« / "18 contacts found" z i18next ednino, dvojino, množino (sl: 1, 2, 3–4, 5+) po vsaki osvežitvi (FR-008-10). Pri 0 zadetkih ostane tudi prazno stanje.
- **Prazno stanje**: `h3` »Ni kontaktov, ki ustrezajo filtrom.« in *Počisti filtre*, kadar je nastavljen vsaj `q`, filter ali značka; prazna skupina brez filtrov ohrani stanje 004.
- **Brez nove knjižnice**; ponovna uporaba `SectionPagination`, `useDelayed`, `styles.ts`, `ContactList`, `contactRouting`.

## R-11 Dostopnost, jeziki, odzivnost

- Imena so v *Public Interfaces* (sl in en); vsa besedila v `sl.json`/`en.json` pod `contacts.search.*`, `contacts.filters.*`, `contacts.sort.*`.
- Stanje ni nikoli samo z barvo (puščica in `aria-sort` pri razvrščanju, besedilo pri filtrih). Gumbi ≥ 44 px (kot v 004). Tipkovnica: panel se odpre z *Enter*/*Space* na gumbu, polja po vrsti, *Esc* v panelu zapre panel in vrne fokus na gumb *Filtri*.
- Spremembe seznama niso napovedane z `alert`; napovedan je status (število zadetkov) in `alert` samo pri napaki.
- Pri 1000 značkah: v DOM je hkrati največ 100 neizbranih + izbrane značke; axe brez kršitev, odprtje panela in filtriranje značk v dopustnem času (T025, T030).
- axe (WCAG 2.1 AA) na seznamu z odprtim panelom, z oznakami, v praznem stanju in v napaki pri 360/768/1280 px.

## R-12 Izolacija in zasebnost

- Vsaka poizvedba ima `c.group_id = :g` iz `Membership` (kot 004); možnosti filtrov in obstoj ključa se berejo samo za to skupino. `404` za nečlana in neobstoječo skupino (korak 2 §2.2), 401 brez žetona.
- Iskalni nizi, vrednosti in značke so osebni podatki: ne zapisujejo se v dnevnike (poizvedbeni parametri so v URL, zato `ContactController` ne beleži zahtev; potrdi se v IT z iskanjem nizov v izpisu).
- Brez razkritja: napaka za ključ drugih skupin je enaka (R-06); `contact-filters` ne vsebuje podatkov drugih skupin.

## R-13 Varno sestavljanje poizvedb

- Poizvedba se sestavi iz **fiksnih fragmentov**: besedila SQL so konstante (`record SortSpec(String expression)` z vnaprej določenimi izrazi iz tabele v R-05), uporabnik izbira samo med oštevilčenimi vrednostmi (`SortField`, `Direction`). Nikoli se v SQL ne vstavi polje, ključ, vrednost ali kolacija iz zahteve.
- Vse spremenljive vrednosti so imenovani parametri `JdbcClient` (`:w0`, `:c0`, `:k0`, `:t0`, …); število pogojev (≤ 10) in značk (≤ 30) je omejeno pred gradnjo.
- Preizkus: `ContactQueryParserTest` in `ContactSearchIT` pošljeta `'; DROP TABLE contact;--`, `%`, `_`, `\`, `*`, `\u0000`, ključ s `:`/`%` ter preverita dobesedno obravnavo in da tabela obstaja.
- `LIMIT`/`OFFSET` iz razčlenjenih celih števil (`size` ∈ {25, 50, 100}, `page` ≥ 0 omejen na `Integer.MAX_VALUE / size`); preseganje je `400`.

## R-14 Vpliv na 004 in druge funkcionalnosti

| Kaj | Vpliv | Izvedba |
|---|---|---|
| `ContactRepository.page` (004) | nadomesti jo iskalna različica; privzeti `ORDER BY` enak | 008 koda |
| `contact.sort_last`, `sort_first` | nova kolacija `sort_sl` | `V8` |
| `ContactReadIT` (004) | vrstni red s šumniki (»Bojan Čeh« po D-63) | `sprememba-testa` (D-63, vnos ob spremembi) |
| `ContactsPage.test.tsx` in sorodni | seznam dobi orodno vrstico in dodaten zahtevek `GET …/contact-filters`; privzeti MSW rokovalnik v `frontend/src/test/msw.ts` (kot D-40) | sprememba skupnega MSW, brez sprememb asercij |
| `kontakti.spec.ts` (E2E) | asercij vrstnega reda s šumniki ni; seznam ima več elementov (`status`) | brez sprememb |
| 002/003 | `contactCount` nespremenjen | – |
| 009 | uporabi `ContactQuery`/`ContactQueryParser`/gradnik `WHERE` (R-08 v kodi: `ContactSearch.where(...)`); dodal bo `ids(group, query)` | – |
| 010 | uporabi isti `ORDER BY`; `FR-010-07` je že naveden »po trenutni razvrstitvi«. **Odprto vprašanje za `/speckit-clarify` 010 (zahtev ne spreminjamo):** FR-010-05/06 razvrščata stolpce in značke po jeziku vmesnika, kontakti pa so od D-63 po slovenski abecedi neodvisno od jezika – ali naj bo tudi vsebina izvoza enotna? | – |
| 011 | `FR-011-07` se sklicuje na §2.6 | – |

## R-15 Meritve in testna podlaga

- **SC-001 – ponovljiv postopek meritve** (T018): skupina z 10.000 kontakti iz deterministične porazdelitve (`ContactFixtures.insertMany`, brez `random()`), poizvedba `q` + dva pogoja + dve znački + `sort`; **5 ogrevalnih** zahtev (zavržene), nato **50 zaporednih merjenih** zahtev v istem procesu (celoten HTTP odgovor, `System.nanoTime()`); p95 po metodi najbližjega ranga = 48. najmanjša izmerjena vrednost; zahteva: **p95 < 1000 ms** (prag se ne spreminja). Test izpiše in zapiše v `traceability.md` (razdelek *Meritve*): p50, p95, največ, različica PostgreSQL in JDK, slika baze, procesor in pomnilnik gostitelja (`/proc/cpuinfo`, `Runtime`), datum in commit. Test je označen `@Tag("FR-008-08")` in `@Tag("SC-001")`.
- **SC-001 (baza)**: poizvedba (iskanje po 5 poljih + pogoj nad e-naslovom + pogoj nad dodatnim atributom + 2 znački, 10.000 kontaktov v skupini) ≈ 15 ms za število in ≈ 4 ms za stran, razvrščanje po dodatnem atributu ≈ 45 ms, po e-naslovu ≈ 15 ms (merjeno z `EXISTS` in indeksoma `contact_tag_norm`-podobnim ter `contact_attribute_key`-podobnim, na sliki `postgres:18-alpine`); v IT je meja 1 s za celoten HTTP odgovor.
- **Testna podlaga**: `ContactFixtures` ostane (vstavlja male črke v `sort_*`); dodajo se pomočniki za atribute in značke (že v 004 podpori). IT vedno na sliki `postgres:18-alpine`, kot Compose (D-28).
- **Izbira kolacije se preveri**: `ContactSortCollationIT` preveri obstoj kolacij, red `Cene < Čeh < Dana < Šuligoj < Zupan < Žagar`, enakost `Novak = novak`, razliko `Čeh ≠ ceh` ter nedeterminističnost; `ContactSortMigrationIT` požene Flyway do V7, vstavi kontakte s šumniki, migrira na V8 in preveri nov vrstni red.

## R-16 Opomba: pregled skrivnosti (gitleaks) v worktreeju

Kavelj `.githooks/pre-commit` zažene `gitleaks` prek Dockerja z `-v "$ROOT:/repo"`. V worktreeju je `.git` datoteka z absolutno potjo do `.git/worktrees/…` zunaj priklopljene mape, zato v vsebniku `git` javi »not a git repository«, gitleaks pa vseeno konča z izhodno kodo 0 in »0 commits scanned« – **pregled se ni izvedel, kavelj je bil lažno zelen**. Preverjeno ročno: z `-v "$PWD:$PWD" -v "$(git rev-parse --git-common-dir):…" -w "$PWD"` je gitleaks pregledal commit `2af4aa8` (brez ugotovitev). **Popravljeno** v ločenem commitu (D-66): kavelj priklopi worktree in skupno mapo `.git` na enaki absolutni poti ter odpove, če gitleaks javi napako ali ne pregleda nobenega bajta ob besedilnih spremembah; testi `scripts/verify/test-full/pre-commit.test.mjs` pokrivajo običajni repozitorij, Git worktree in lažen gitleaks. Zato ročni ukaz ni več potreben za vsak commit; pred PR se še vedno ročno pregleda cela veja (`main..HEAD`).
