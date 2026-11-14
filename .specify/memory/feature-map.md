# Zemljevid izdelka – Contact Manager

**Namen:** pregled funkcionalnosti in **skupna pravila izdelka**, ki veljajo čez vse funkcionalnosti (vloge, vrstni red preverjanj, arhivirane skupine, slovar podatkov, kode napak). Podrobno vedenje posamezne funkcionalnosti določajo koda in testi. Dokument se posodobi v istem PR kot koda, ki spremeni katero od skupnih pravil ali doda funkcionalnost.

**Povezano:** [`constitution.md`](constitution.md) (pravila in potek dela) · [`design.md`](design.md) (vmesnik)

---

## 1. Funkcionalnosti

Številke 000–012 so oznake prve različice; uporabljajo jih oznake `FR-NNN-XX` v testih in komentarjih (arhiv: `constitution.md` §6). Nove funkcionalnosti številke ne dobijo – dodajo se z imenom.

| Oznaka | Funkcionalnost | Obseg | Koda |
|---|---|---|---|
| 000 | ogrodje | ogrodje BE/FE/E2E, Docker Compose, žetoni v Tailwindu, i18n sl/en, PWA ogrodje, `verify.sh`, CI, gitleaks | `scripts/verify/`, `verify.sh`, `compose*.yaml` |
| 001 | prijava | prijava in registracija z Googlom (Firebase), odjava, zaščitene poti, ogrodje aplikacije, stran za neobstoječe poti, *Moj račun* – *Profil* in *Videz* (jezik, tema) | `features/auth`, `features/account`, `shared/layout` |
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
| 2 | skupina ne obstaja ali uporabnik ni njen član (tudi vir v tuji skupini, npr. kontakt druge skupine) | `404` – ne razkrije obstoja |
| 3 | vloga člana je pod najnižjo dovoljeno ali krši pravilo »le nižjim od sebe« | `403` s kodo `FORBIDDEN` (D-25) |
| 4 | pisanje v arhivirani skupini (§2.4) | `409` s kodo `GROUP_ARCHIVED` |
| 5 | poslana verzija ni več trenutna (optimistično zaklepanje) | `409` s kodo `VERSION_CONFLICT` |
| 6 | neveljavni podatki | `400` s kodo `VALIDATION_FAILED` in napakami po poljih |
| 7 | kršitev poslovnega pravila (npr. lastnik zapušča skupino, izbris skupine z več člani) | `409` z imenovano kodo, ki jo določi funkcionalnost (register v §2.10) |

- Viri, vezani na uporabnika (povabila, moji podatki, moj račun): `401` brez prijave, `404` za tuj vir (npr. tuje povabilo).
- Napake imajo strojno berljivo kodo; vmesnik jo prevede v razumljivo sporočilo v sl/en (brez tehničnih kod v vmesniku).
- Vsak uspeh in neuspeh je v vmesniku viden (design.md 8.13).

### 2.3 Optimistično zaklepanje

- Kontakt, članstvo (vloga) in podatki skupine imajo verzijo. Sprememba pošlje verzijo, ki jo je uporabnik videl; ob neujemanju se nič ne spremeni (`409 VERSION_CONFLICT`), vmesnik pa ponudi razrešitev (design.md 8.14).
- Množične operacije so **atomarne**: uspejo v celoti ali se nič ne spremeni.

### 2.4 Arhivirana in trajno arhivirana skupina

- **Arhivirana skupina** (arhivira jo lastnik): vsi člani imajo efektivno pravice bralca. Dovoljeno je samo:
  - branje (kontakti, podrobnosti, iskanje, filtri, revizijska sled, člani, podatki skupine);
  - izvoz izbranih kontaktov v Excel;
  - zapuščanje skupine (pravila 007);
  - izbris skupine (pravila 003);
  - odarhiviranje (samo lastnik, ne pri trajno arhivirani);
  - odziv na povabilo (sprejem ali zavrnitev) in umik čakajočega povabila (pravila 006); sprejeti član ima efektivno pravice bralca.
  
  Vse drugo (tudi pošiljanje povabil, spremembe vlog, odstranjevanje članov, prenos lastništva, urejanje skupine, rollback, dvojniki) → `409 GROUP_ARCHIVED`, če ima član sicer zadostno vlogo; sicer `403` (§2.2).
- **Trajno arhivirana skupina** nastane, ko lastnik arhivirane skupine izbriše račun (012). Nima lastnika (kot lastnik je prikazan »izbrisan uporabnik«), ne more se odarhivirati, zadnji član je ne more zapustiti, lahko jo le izbriše; izbriše jo lahko tudi član, ki ni lastnik, če je edini član.
- Arhivirane skupine niso na seznamu skupin po vlogah, ampak na ločenem seznamu *Arhivirane skupine*.

### 2.5 Izbrisan uporabnik

Povsod, kjer bi bilo prikazano ime ali e-naslov uporabnika, ki je izbrisal račun (revizijska sled, lastnik arhivirane skupine, pošiljatelj povabila, …), je prikazano »izbrisan uporabnik« / "deleted user". Osebni podatki izbrisanega uporabnika se ne hranijo.

### 2.6 Podatki (skupni slovar)

| Podatek | Pravila |
|---|---|
| Naslov skupine | obvezen, 1–100 znakov po obrezu presledkov |
| Opis skupine | neobvezen, do 1000 znakov |
| Barva skupine | ena od 8 poimenovanih barv (design.md 4.2: tinta, mah, opeka, oker, sliva, morje, grafit, rja); privzeto *tinta* |
| Ime, priimek | do 100 znakov; vsaj eno od obeh je obvezno |
| Naslov (kontakta) | neobvezen, do 300 znakov, večvrstičen |
| E-naslov (kontakta) | neobvezen, veljavna oblika e-naslova, do 254 znakov |
| Telefon | neobvezen, do 30 znakov; dovoljeni števke, presledki in `+ - ( ) /` |
| Dodatni atribut | ključ 1–50 znakov, edinstven v kontaktu (ne glede na velikost črk) in različen od imen predefiniranih atributov; vrednost 1–500 znakov; največ 50 atributov na kontakt |
| Značka | 1–50 znakov, brez presledkov; edinstvena v kontaktu (ne glede na velikost črk); največ 30 značk na kontakt |
| Paginacija | privzeto 25 na stran, izbira 25 / 50 / 100, največ 100 |
| Privzeto razvrščanje kontaktov | priimek, nato ime, naraščajoče; po slovenski abecedi (Č za C, Š za S, Ž za Z), ne glede na velikost črk in neodvisno od jezika vmesnika; enake vrednosti razločita čas nastanka in id (D-63, ki nadomešča D-38) |

### 2.7 Revizijska sled

Od funkcionalnosti 005 naprej **vsaka** sprememba kontaktov (ustvarjanje, urejanje, izbris, množične spremembe, združevanje, rollback) ustvari vnos v revizijski sledi skupine. Funkcionalnosti 009 in 011 to zahtevata v svojih FR; 005 doda beleženje operacij iz 004.

### 2.8 Nevarne operacije

Potrditveni dialog (design.md 8.11) je obvezen za: izbris kontakta (tudi množični), združevanje, rollback, odstranitev člana, spremembo vloge, zapuščanje skupine, arhiviranje, prenos lastništva, izbris skupine, izbris računa, zavrnitev povabila, umik povabila. Z vpisom naslova skupine oziroma lastnega e-naslova se potrdijo izbris skupine, izbris računa in prenos lastništva. Vsaka funkcionalnost to zapiše kot FR za svoje operacije.

### 2.9 Jezik, čas, dostopnost

- Vsa besedila v slovenščini in angleščini; privzeto po jeziku brskalnika (`sl` → slovenščina, sicer angleščina); izbira v *Mojem računu* ima prednost.
- Datumi in časi v zapisu izbranega jezika.
- WCAG 2.1 AA, odzivno (320 px naprej), PWA – po konstituciji in design.md.

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
