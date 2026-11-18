# Zemljevid izdelka – Contact Manager

**Namen:** pregled funkcionalnosti in **skupna pravila izdelka**, ki veljajo čez vse funkcionalnosti (vloge, vrstni red preverjanj, arhivirane skupine, slovar podatkov, kode napak). Zahteve posamezne funkcionalnosti so v `specs/NNN-ime/spec.md`. Dokument se posodobi v istem PR kot koda, ki spremeni katero od skupnih pravil ali doda funkcionalnost.

**Povezano:** [`constitution.md`](constitution.md) (pravila in potek dela) · [`design.md`](design.md) (vmesnik)

---

## 1. Funkcionalnosti

Številka je mapa `specs/NNN-ime/` in del oznak `FR-NNN-XX`; veja je `ime` brez številke. Nova funkcionalnost dobi naslednjo številko (`/speckit-specify`) in vrstico v tej tabeli.

| Oznaka | Funkcionalnost | Obseg | Koda |
|---|---|---|---|
| 000 | ogrodje | ogrodje BE/FE/E2E, Docker Compose, žetoni v Tailwindu, i18n sl/en, PWA ogrodje, `verify.sh`, CI, gitleaks | `scripts/verify/`, `verify.sh`, `compose*.yaml` |
| 001 | prijava | prijava in registracija z Googlom (Firebase; od 017 tudi z geslom), odjava, zaščitene poti, ogrodje aplikacije, stran za neobstoječe poti, *Moj račun* – *Profil* in *Videz* (jezik, tema) | `features/auth`, `features/account`, `shared/layout` |
| 002 | skupine | ustvarjanje skupine (naslov, opis, barva; ustvarjalec postane lastnik), seznam mojih skupin po vlogah, glava in zavihki skupine, urejanje skupine (lastnik, admin) | `features/groups`, paket `group` |
| 003 | arhiviranje | arhiviranje in odarhiviranje (lastnik), seznam arhiviranih skupin, način samo za branje, stanje »trajno arhivirana«, izbris skupine (edini član) | `features/groups`, paket `group` |
| 004 | kontakti | ustvarjanje, ogled, urejanje in izbris kontakta (predefinirani in dodatni atributi, značke), seznam s paginacijo, optimistično zaklepanje | `features/contacts`, paket `contact` |
| 005 | revizijska sled | beleženje vseh sprememb kontaktov skupine, pregled sledi (filtri, po kontaktu), rollback na poljubno točko (admin, lastnik) | `features/audit`, paket `audit` |
| 006 | povabila | povabilo registriranega uporabnika po e-naslovu z vlogo, nižjo od lastne (admin in višje); prejeta povabila, sprejem in zavrnitev; pregled in umik poslanih povabil | `features/invitations`, paket `invitation` |
| 007 | člani | seznam članov, sprememba vloge in odstranitev člana (le nižjim od sebe), zapuščanje skupine, prenos lastništva | `features/members`, paket `member` |
| 008 | iskanje | iskanje in filtri v skupini (predefinirani in dodatni atributi, značke), razvrščanje, stanje v URL | `features/contacts`, paket `contact` |
| 009 | množično urejanje | izbor kontaktov (tudi čez strani in »vsi zadetki«), akcijska vrstica izbora, množične značke, atributi in izbris | `features/contacts`, paket `contact` |
| 010 | izvoz v Excel | izvoz izbranih kontaktov v `.xlsx` (viewer in višje, tudi v arhivirani skupini) | `features/contacts`, paket `contact` |
| 011 | dvojniki | iskanje podvojenih kontaktov po kategorijah, tabela razlik, združevanje (editor in višje) | `features/duplicates`, paket `contact` |
| 012 | moji podatki | izvoz lastnih podatkov (JSON), izbris računa z vsemi posledicami (»izbrisan uporabnik«, trajno arhivirane skupine) | `features/account` |
| 013 | pametni atributi | predefinirani polji *Podjetje* in *Država* (koda ISO 3166-1), predlogi ključev, vrednosti, podjetij, držav in značk, kanonični zapis ključev in značk, ročni prenos starih atributov | `features/contacts`, paket `contact` |
| 014 | uvoz in izvoz | uvoz iz Excela in vizitk s predogledom (editor in višje), izvoz vCard (izbor, en kontakt), koda QR kontakta (deljenje, branje s kamero ali iz slike), CardDAV samo za branje z gesli za aplikacijo | `features/import`, `features/contacts/qr`, `features/account`, paketi `contact`, `account`, `carddav` |
| 015 | napredna revizija | filter sledi po uporabniku (tudi nekdanji in izbrisani), zgodovina posameznega kontakta, ogled in primerjava različic, obnova enega kontakta, seznam izbrisanih kontaktov | `features/audit`, `features/contacts`, paket `audit` |
| 016 | tipizirani atributi | tip ključa atributa v skupini (7 tipov), normalizacija na strežniku, strukturiran naslov s samodokončanjem, osebna prikazna shema (telefon, datum, naslov), zemljevid naslovov (OSM samo prek zaledja), tipi v uvozu, izvozu in sledi | `features/contacts`, `features/groups`, `features/account`, paketa `contact`, `maps` |
| 017 | prijava z geslom in skupine | registracija, prijava in ponastavitev gesla (Email/Password poleg Googla), obvezna potrditev e-naslova (`403 EMAIL_NOT_VERIFIED`), izrecno povezovanje Googla in gesla v isti račun (isti UID), ponovna avtentikacija pri izbrisu računa; iskanje in filtri skupin (naziv, vloga, aktivne/arhivirane); zapusti skupino z razlago za lastnika | `features/auth`, `features/account`, `features/groups`, `features/members`, paketa `account`, `group`, `shared/security` |
| 018 | slike | profilna slika (nalaganje z obrezovanjem, slika Google računa), slika skupine (admin in lastnik), slika kontakta (editor in višje), prikaz v sledi, združevanju in izvozu mojih podatkov | `shared/images`, `features/account`, `features/groups`, `features/contacts`, paket `image` |
| 019 | API ključi | API ključi (`cmk_` + podpisan JWT, do 10 aktivnih na uporabnika; obseg po skupinah z branjem ali pisanjem, rok ali brez roka, preklic), ločeni endpointi `/v1/**` z lastno verigo filtrov in omejitvijo 120 zahtev/min na ključ, statistika uporabe po ključu, javna stran API `/api-docs` z opisom `/v1/openapi.json` | `features/account`, `features/api-docs`, paket `apikey` |
| 020 | prenova vmesnika | Kartoteka v2: novi žetoni (barve, tipografija, oblike, sence, gibanje), novo ogrodje (stranska navigacija brez seznama skupin, kartica in preklopnik trenutne skupine, spodnja vrstica na telefonu), skupine kot ena zbirka kartic, prijava s pozdravno ploskvijo, kartica kontakta z lepljivo ploščo, prazna stanja z ilustracijami; vsi zasloni in dialogi po platnu | `shared/layout`, `shared/ui`, vsi `features/*`, `design.md` |

Poti: `features/*` je `frontend/src/features/*`, paketi so `backend/src/main/java/si/contactmanager/*`, E2E scenariji so v `e2e/tests/*.spec.ts`.

---

## 2. Skupna pravila (veljajo za vse funkcionalnosti)

### 2.1 Vloge

- Hierarhija: `VIEWER < EDITOR < ADMIN < OWNER` (sl: *Bralec*, *Urednik*, *Admin*, *Lastnik*).
- Skupina ima natanko enega lastnika, razen **trajno arhivirane** skupine (§2.4), ki ga nima.
- »Le nižjim od sebe«: član sme upravljati (vabiti, spreminjati vlogo, odstraniti) samo člane s **strogo nižjo** vlogo, in dodeli lahko samo vlogo, **strogo nižjo** od svoje. Vloge `OWNER` ni mogoče dodeliti s povabilom ali spremembo vloge – samo s prenosom lastništva.

### 2.2 Vrstni red preverjanj in odgovori

Pri vsakem zahtevku nad podatki skupine se preverja v tem vrstnem redu; prvi neuspeh določi odgovor:

| # | Pogoj | Odgovor |
|---|---|---|
| 1 | ni žetona, neveljaven ali potekel žeton | `401` s kodo `UNAUTHENTICATED` |
| 1a | žeton je veljaven, vendar `email_verified` ni `true` (017; velja za vse `/api/**` razen `GET /api/health`) | `403` s kodo `EMAIL_NOT_VERIFIED`, nič se ne ustvari ali spremeni |
| 2 | skupina ne obstaja ali uporabnik ni njen član (tudi vir v tuji skupini, npr. kontakt druge skupine) | `404` – ne razkrije obstoja |
| 3 | vloga člana je pod najnižjo dovoljeno ali krši pravilo »le nižjim od sebe« | `403` s kodo `FORBIDDEN` (D-25) |
| 4 | pisanje v arhivirani skupini (§2.4) | `409` s kodo `GROUP_ARCHIVED` |
| 5 | poslana verzija ni več trenutna (optimistično zaklepanje) | `409` s kodo `VERSION_CONFLICT` |
| 6 | neveljavni podatki | `400` s kodo `VALIDATION_FAILED` in napakami po poljih |
| 7 | kršitev poslovnega pravila (npr. lastnik zapušča skupino, izbris skupine z več člani) | `409` z imenovano kodo, ki jo določi funkcionalnost (register v §2.10) |

- Viri, vezani na uporabnika (povabila, moji podatki, moj račun, gesla za aplikacijo): `401` brez prijave, `404` za tuj vir (npr. tuje povabilo).
- CardDAV (014, nov tip klicatelja): prijava samo s HTTP Basic (e-naslov računa + geslo za aplikacijo) na `/dav/**`; vrstni red `401` → `404` (skupina ali kontakt ni viden) → `403` (vsako pisanje). Firebase žeton tam ne velja, Basic ne velja na `/api`.
- Omejitev hitrosti (018: nalaganje slik in prevzem slike Google računa): `429` s kodo `RATE_LIMITED`; vmesnik prikaže sporočilo »poskusi znova čez trenutek«.
- API ključ (019, nov tip klicatelja): prijava samo z glavo `Authorization: Bearer cmk_…` na `/v1/**`; vrstni red `401` (brez, neveljaven, preklican ali potekel ključ ali izbrisan račun) → `429 RATE_LIMITED` (nad 120 zahtev/min na ključ, z `Retry-After`) → `404` (skupina ni vidna uporabniku ali je ključ ne pokriva) → `404` (obseg) → `403` (pravica pod potrebno: dejanska pravica je `min(ključ, vloga člana)`) → `409` (`GROUP_ARCHIVED`, `VERSION_CONFLICT`). Firebase žeton na `/v1` in ključ na `/api` ne veljata (`401`); `/v1` nima CORS. Upravljanje ključev (`/api/me/api-keys`) je vir, vezan na uporabnika.
- Napake imajo strojno berljivo kodo; vmesnik jo prevede v razumljivo sporočilo v sl/en (brez tehničnih kod v vmesniku).
- Vsak uspeh in neuspeh je v vmesniku viden (design.md 8.13).

### 2.3 Optimistično zaklepanje

- Kontakt, članstvo (vloga) in podatki skupine imajo verzijo. Sprememba pošlje verzijo, ki jo je uporabnik videl; ob neujemanju se nič ne spremeni (`409 VERSION_CONFLICT`), vmesnik pa ponudi razrešitev (design.md 8.14).
- Množične operacije so **atomarne**: uspejo v celoti ali se nič ne spremeni.

### 2.4 Arhivirana in trajno arhivirana skupina

- **Arhivirana skupina** (arhivira jo lastnik): vsi člani imajo efektivno pravice bralca. Dovoljeno je samo:
  - branje (kontakti, podrobnosti, iskanje, filtri, revizijska sled, člani, podatki skupine);
  - izvoz izbranih kontaktov v Excel in vCard (014), vizitka enega kontakta in koda QR;
  - branje imenikov prek CardDAV (014; CardDAV je vedno samo za branje);
  - zapuščanje skupine (pravila 007);
  - izbris skupine (pravila 003);
  - odarhiviranje (samo lastnik, ne pri trajno arhivirani);
  - odziv na povabilo (sprejem ali zavrnitev) in umik čakajočega povabila (pravila 006); sprejeti član ima efektivno pravice bralca.
  
  Vse drugo (tudi pošiljanje povabil, spremembe vlog, odstranjevanje članov, prenos lastništva, urejanje skupine, rollback, dvojniki) → `409 GROUP_ARCHIVED`, če ima član sicer zadostno vlogo; sicer `403` (§2.2).
- **Trajno arhivirana skupina** nastane, ko lastnik arhivirane skupine izbriše račun (012). Nima lastnika (kot lastnik je prikazan »izbrisan uporabnik«), ne more se odarhivirati, zadnji član je ne more zapustiti, lahko jo le izbriše; izbriše jo lahko tudi član, ki ni lastnik, če je edini član.
- Arhivirane skupine niso na seznamu skupin po vlogah, ampak na ločenem seznamu *Arhivirane skupine*; od 017 so dosegljive tudi z domače strani prek filtra *Stanje* (isti seznam z iskanjem po nazivu in filtrom vlog).

### 2.5 Izbrisan uporabnik

Povsod, kjer bi bilo prikazano ime ali e-naslov uporabnika, ki je izbrisal račun (revizijska sled, lastnik arhivirane skupine, pošiljatelj povabila, …), je prikazano »izbrisan uporabnik« / "deleted user". Osebni podatki izbrisanega uporabnika se ne hranijo.

### 2.6 Podatki (skupni slovar)

| Podatek | Pravila |
|---|---|
| Naslov skupine | obvezen, 1–100 znakov po obrezu presledkov |
| Opis skupine | neobvezen, do 1000 znakov |
| Barva skupine | ena od 8 poimenovanih barv (design.md 4.2: tinta, mah, opeka, oker, sliva, morje, grafit, rja); privzeto *tinta* |
| Ime, priimek | do 100 znakov; vsaj eno od obeh je obvezno |
| Naslov (kontakta) | neobvezen; od 016 po delih: ulica (do 200), dodatek (do 200), poštna številka (do 20), kraj (do 100), regija (do 100), država (koda ISO 3166-1); vsaj ulica ali kraj; shranijo se obrezani deli, strnjeni presledki, poštna številka z velikimi črkami. Obstoječi večvrstični naslov (do 300 znakov) ostane kot nerazčlenjen naslov, dokler ga uporabnik ne razčleni (*Razčleni naslov*, na izrecno zahtevo prek OSM); samodejne pretvorbe ni; naslov je nerazčlenjen ali razčlenjen, nikoli oboje |
| Podjetje | neobvezno, do 200 znakov po obrezu presledkov |
| Država | neobvezna; shrani se koda ISO 3166-1 alpha-2 (dve veliki črki, uradno dodeljena; `INVALID_VALUE` sicer); vmesnik prikazuje ime v jeziku (sl/en); iskanje po kodi in imenu v obeh jezikih; prepoznavanje iz besedila (npr. uvoz): natančno ujemanje ali odločitev uporabnika, nikoli samodejna popravka |
| E-naslov (kontakta) | neobvezen, veljavna oblika e-naslova, do 254 znakov |
| Telefon | neobvezen, do 30 znakov; od 016 veljaven po mednarodnem standardu številčenja (libphonenumber: veljavna številka ali veljavna kratka številka), shrani se E.164 (z razširitvijo `;ext=N`), kratke številke kot števke; prikaz po osebni shemi (§2.7); nespremenjena shranjena vrednost se ne preverja ponovno |
| Tip ključa atributa (016) | vsak ključ v skupini ima tip: `OTHER` (privzeto), `NOTES`, `EMAIL`, `PHONE`, `ADDRESS`, `URL`, `DATE`; velja za vse kontakte skupine; sprememba (editor in višje) je mogoča, če so vse obstoječe vrednosti veljavne za novi tip, sicer `409 ATTRIBUTE_TYPE_CONFLICT` s seznamom kontaktov (največ 100) in nič se ne spremeni; tip se pri neuporabljenem ključu ob ponovni uporabi izbere znova. Normalizacija na strežniku: `OTHER`/`NOTES` obrez (`NOTES` vsaj en nepresledni znak), `EMAIL` obrez in domena z malimi črkami, `PHONE` kot telefon zgoraj, `URL` samo `http`/`https` z gostiteljem s piko, privzeto `https://`, `DATE` koledarski datum `LLLL-MM-DD`, `ADDRESS` deli kot naslov kontakta |
| Dodatni atribut | ključ 1–50 znakov, edinstven v kontaktu (ne glede na velikost črk) in različen od imen predefiniranih atributov; vrednost 1–500 znakov; največ 50 atributov na kontakt; imena `država`, `country`, `podjetje`, `company` (poleg imen predefiniranih polj) so rezervirana za nove in spremenjene ključe, obstoječi atributi z njimi ostanejo; zapis ključa se ob pisanju uskladi s kanoničnim zapisom skupine (pogostejša različica, pri izenačenju najstarejši kontakt) |
| Značka | 1–50 znakov, brez presledkov; edinstvena v kontaktu (ne glede na velikost črk); največ 30 značk na kontakt; zapis se ob pisanju uskladi s kanoničnim zapisom skupine kot pri ključih |
| Slika (uporabnik, skupina, kontakt) | ena slika na lastnika (zamenjava prepiše); JPEG, PNG ali WebP; datoteka do 5 MB; obrezana na kvadrat, shranjena v več različicah (največ 1024 točk); neveljavna vsebina `400` z `INVALID_IMAGE`, `IMAGE_TOO_LARGE` ali `FILE_TOO_LARGE`; dostop do slike ima samo, kdor sme videti lastnika (§2.2) |
| Paginacija | privzeto 25 na stran, izbira 25 / 50 / 100, največ 100 |
| API ključ (019) | ime 1–50 znakov, edinstveno med aktivnimi ključi uporabnika; ključ `cmk_` + JWT s `jti`, prikazan samo ob ustvarjanju, shrani se zgostitev in namig (zadnjih 6 znakov); obseg: vse skupine ali izbrane, za vsako branje ali pisanje; rok: 30/90/365 dni ali brez roka; največ 10 aktivnih. Statistika uporabe: po dnevih število uspešnih, napak in zavrnitev (čiščenje po 90 dneh) |
| Privzeto razvrščanje kontaktov | priimek, nato ime, naraščajoče; po slovenski abecedi (Č za C, Š za S, Ž za Z), ne glede na velikost črk in neodvisno od jezika vmesnika; enake vrednosti razločita čas nastanka in id (D-63, ki nadomešča D-38) |

### 2.7 Revizijska sled

Od funkcionalnosti 005 naprej **vsaka** sprememba kontaktov (ustvarjanje, urejanje, izbris, množične spremembe, združevanje, rollback, obnova enega kontakta – `RESTORE`, 015, uvoz – `IMPORT`, 014) ustvari vnos v revizijski sledi skupine. Sprememba slike kontakta (dodaj, zamenjaj, odstrani) je vnos `UPDATE` z oznako `photo_change`; obnova in rollback slik ne spreminjata. Branje (izvoz, CardDAV) se ne beleži. Od 016 tudi sprememba tipa ključa atributa ustvari vnos `ATTRIBUTE_TYPE` (ključ, tip prej in potem; brez vrednosti kontaktov). Sprememba prek API ključa (019) ima v sledi oznako »prek API« in ime ključa (`apiKeyName`); branje prek API se ne beleži.

**Osebna prikazna shema (016):** uporabnikova nastavitev *oblika zapisa* (`phoneFormat`: `INTERNATIONAL` | `NATIONAL` | `E164`, `dateFormat`: `LOCALE` | `ISO` | `LONG`, `addressFormat`: `COUNTRY` | `SINGLE_LINE`; `null` = privzeto) se hrani ob jeziku in temi, velja na vseh napravah, je v izvozu *Moji podatki* in se izbriše z računom. Vpliva samo na prikaz; shranjeni podatki so vedno kanonični. Funkcionalnosti 009 in 011 to zahtevata v svojih FR; 005 doda beleženje operacij iz 004.

### 2.8 Nevarne operacije

Potrditveni dialog (design.md 8.11) je obvezen za: izbris kontakta (tudi množični), združevanje, rollback, odstranitev člana, spremembo vloge, zapuščanje skupine, arhiviranje, prenos lastništva, izbris skupine, izbris računa, zavrnitev povabila, umik povabila. Z vpisom naslova skupine oziroma lastnega e-naslova se potrdijo izbris skupine, izbris računa in prenos lastništva. Vsaka funkcionalnost to zapiše kot FR za svoje operacije.

### 2.9 Jezik, čas, dostopnost

- Vsa besedila v slovenščini in angleščini; privzeto po jeziku brskalnika (`sl` → slovenščina, sicer angleščina); izbira v *Mojem računu* ima prednost.
- Datumi in časi v zapisu izbranega jezika.
- WCAG 2.1 AA, odzivno (320 px naprej), PWA – po konstituciji in design.md.
- Kartoteka v2 (020): `GET /api/groups` vrne en paginiran seznam `{total, page, size, items[]}` z `role` na elementu (parametri `q`, `role`, `page`, `size`, `lang`); kartica skupine nosi značko vloge in stanja; navigacija ima števce (skupine, arhivirane, nova povabila; brez števca, če jih ni) iz `GET /api/groups?size=1`, `GET /api/groups/archived?size=1` in `GET /api/invitations/count`; glava skupine kaže vlogo in stanje skupine; značka *Povrnjeno* ni na kartici kontakta, podatek je samo v sledi in zgodovini.
- Skupni vzorci vmesnika: prazno stanje (`EmptyState`: naslov, stavek, dejanje samo po vlogi in stanju skupine; ilustracija le na zaslonih brez podatkov), skelet po 300 ms (`LoadingState`), obvestila z ikono in zapiranjem, vsak dialog ima gumb X »Zapri dialog«, neobvezna polja imajo oznako »(neobvezno)« ob `label` (zunaj dostopnega imena).

### 2.10 Register kod napak

Skupne kode (§2.2): `UNAUTHENTICATED` (401), `FORBIDDEN` (403, D-25), `GROUP_ARCHIVED`, `VERSION_CONFLICT` (409), `VALIDATION_FAILED` (400). Kode poslovnih pravil (409), ki so jih uvedle funkcionalnosti – nova koda se doda sem, obstoječa se ne preimenuje:

| Koda | Funkcionalnost | Pomen |
|---|---|---|
| `GROUP_NOT_ARCHIVED` | 003 | odarhiviranje skupine, ki ni arhivirana |
| `GROUP_HAS_OTHER_MEMBERS` | 003 | izbris skupine, ki ima še druge člane |
| `ROLLBACK_NO_CHANGES` | 005 | rollback, ki ne bi ničesar spremenil (npr. na najnovejši vnos) |
| `CANNOT_INVITE_SELF`, `INVITEE_NOT_REGISTERED`, `ALREADY_MEMBER`, `INVITATION_ALREADY_PENDING` | 006 | napake povabila |
| `OWNER_CANNOT_LEAVE`, `LAST_MEMBER_CANNOT_LEAVE`, `TARGET_NOT_MEMBER` | 007 | zapuščanje in upravljanje članov |
| `SELECTION_CHANGED` | 009 | izbrani kontakti medtem ne obstajajo več |
| `EXPORT_EMPTY` | 010 | izvoz, v katerem ne ostane noben kontakt |
| `OWNS_ACTIVE_GROUPS` | 012 | izbris računa lastnika nearhivirane skupine |
| `APP_PASSWORD_LIMIT` | 014 | ustvarjanje enajstega gesla za aplikacijo |
| `RESTORE_NO_CHANGES` | 015 | obnova kontakta, ki ne bi spremenila nobenega polja |
| `GOOGLE_PHOTO_UNAVAILABLE` | 018 | prevzem slike Google računa ni mogoč (račun je nima ali je ni mogoče varno prenesti) |
| `RESTORE_NOT_ALLOWED` | 015 | obnova kontakta, ki je bil z združevanjem odstranjen (neposredna obnova ni dovoljena) |
| `EMAIL_NOT_VERIFIED` (403) | 017 | zahtevek z žetonom nepotrjenega e-naslova |
| `REAUTHENTICATION_REQUIRED` (403) | 017 | izbris računa, ko je `auth_time` starejši od 5 minut |
| `ACCOUNT_CONFLICT` (409) | 017 | e-naslov je že v profilu z drugim Firebase UID |
| `ATTRIBUTE_TYPE_CONFLICT` | 016 | sprememba tipa ključa atributa, ki bi pustila neveljavne vrednosti (409; telo `details`: kontakti, največ 100, in `total`) |
| `MAP_SERVICE_UNAVAILABLE` | 016 | kartografska storitev (OSM) nedosegljiva, počasna ali omejitev pogostosti (503; ne ovira dela s kontaktom) |
| `API_KEY_LIMIT` | 019 | ustvarjanje enajstega aktivnega API ključa (409) |
| `RATE_LIMITED` | 019 | več kot 120 zahtev/min z istim API ključem na `/v1` (429, glava `Retry-After`) |
| `IDENTITY_PROVIDER_UNAVAILABLE` (503) | 017 | ključev Googla za preverjanje žetona ni mogoče dobiti (omrežje, DNS); glava `Retry-After` |

Opomba (016): `TOO_SHORT` ni samostojna koda napake, ampak koda polja v `VALIDATION_FAILED` (400) za `q` pri predlogih naslova (krajše od najmanjše dolžine; poleg `REQUIRED`, `TOO_LONG`, `INVALID_VALUE`).
