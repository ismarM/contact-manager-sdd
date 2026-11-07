# Zemljevid funkcionalnosti – Contact Manager

**Namen:** razdelitev zahtev na funkcionalnosti Spec Kit in skupna pravila, ki veljajo čez vse `spec.md`. Vsaka zahteva iz prvotnega seznama zahtev (`original_documentation/zahteve-raw.txt`, zgodovinski dokument) je dodeljena **natanko eni** funkcionalnosti. Od zdaj naprej so vir resnice `specs/*/spec.md`; ta dokument se posodobi ob vsaki novi funkcionalnosti ali spremembi meje med funkcionalnostmi (vnos v `DECISIONS.md`).

**Povezano:** [`constitution.md`](constitution.md) · [`workflow.md`](workflow.md) · [`design.md`](design.md)

---

## 1. Funkcionalnosti

Mape so oštevilčene (številka je del FR-ID `FR-NNN-XX`), **veje niso**: veja se imenuje kot mapa brez številke (`specs/004-kontakti/` → veja `kontakti`). Vejo in kazalec na trenutno funkcionalnost nastavi `scripts/feature.sh kontakti` (workflow.md §0.3).

| Mapa | Veja | Obseg | Odvisna od |
|---|---|---|---|
| `000-ogrodje` | `ogrodje` | ogrodje BE/FE/E2E, Docker Compose, žetoni Kartoteke v Tailwindu, i18n sl/en, PWA ogrodje, `verify.sh`, CI, gitleaks, odločitev o shadcn/ui, ročni samopreizkus | – |
| `001-prijava` | `prijava` | prijava in registracija z Googlom (Firebase), odjava, zaščitene poti, ogrodje aplikacije (zgornja vrstica, meni računa, *Preskoči na vsebino*), stran za neobstoječe poti, *Moj račun* – razdelka *Profil* in *Videz* (jezik, tema) | 000 |
| `002-skupine` | `skupine` | ustvarjanje skupine (naslov, opis, barva; ustvarjalec postane lastnik), seznam mojih skupin ločeno po vlogah, glava in zavihki skupine, ogled podatkov skupine, urejanje skupine (lastnik, admin) | 001 |
| `003-arhiviranje` | `arhiviranje` | arhiviranje in odarhiviranje (lastnik), seznam arhiviranih skupin, pasica in način samo za branje, splošno pravilo zavračanja pisanja v arhivirani skupini, stanje »trajno arhivirana«, izbris skupine (edini član) | 002 |
| `004-kontakti` | `kontakti` | ustvarjanje, ogled, urejanje in izbris kontakta (predefinirani in dodatni atributi, značke), seznam kontaktov skupine s paginacijo, optimistično zaklepanje in konflikt verzij | 002, 003 |
| `005-revizijska-sled` | `revizijska-sled` | beleženje vseh sprememb kontaktov skupine, pregled sledi (filtri, po kontaktu), rollback na poljubno točko (admin, lastnik) | 004 |
| `006-povabila` | `povabila` | povabilo registriranega uporabnika po e-naslovu z vlogo, nižjo od lastne (admin in višje); prikaz prejetih povabil; sprejem in zavrnitev | 002, 003 |
| `007-clani` | `clani` | seznam članov, sprememba vloge in odstranitev člana (le nižjim od sebe), zapuščanje skupine, prenos lastništva | 006 |
| `008-iskanje` | `iskanje` | iskanje in filtri v skupini (predefinirani in dodatni atributi, značke), razvrščanje naraščajoče/padajoče, stanje v URL | 004 |
| `009-mnozicno-urejanje` | `mnozicno-urejanje` | izbor kontaktov (tudi čez strani in »vsi zadetki«), akcijska vrstica izbora, množično dodajanje/odstranjevanje značk, nastavljanje/odstranjevanje atributa, množični izbris | 005, 008 |
| `010-izvoz-excel` | `izvoz-excel` | izvoz izbranih kontaktov v `.xlsx` | 009 |
| `011-dvojniki` | `dvojniki` | iskanje podvojenih kontaktov po kategorijah, tabela razlik, združevanje | 005 |
| `012-moji-podatki` | `moji-podatki` | izvoz lastnih podatkov (JSON), izbris računa z vsemi posledicami (»izbrisan uporabnik«, trajno arhivirane skupine) | 003, 007 |

### 1.1 Pokritost prvotnih zahtev

| Prvotna zahteva | Funkcionalnost |
|---|---|
| registracija & prijava (Google), odjava | 001 |
| ustvarjanje skupine (naslov, opis, barva; owner) | 002 |
| ustvarjanje kontaktov (predefinirani + ključ=vrednost + značke; editor+) | 004 |
| urejanje kontaktov (editor+) | 004 |
| urejanje skupine (owner, admin) | 002 |
| prikaz skupin, katerih član je uporabnik, ločeno po vlogah | 002 |
| zapuščanje skupine (z izjemo trajno arhivirane) | 007 |
| dodajanje registriranih članov po e-naslovu, povabilo, odziv (admin+) | 006 |
| odstranjevanje članov (owner, admin; le nižje) | 007 |
| spreminjanje vloge članov (owner, admin; le nižjim) | 007 |
| izbris kontaktov (editor+) | 004 (posamezen), 009 (množičen) |
| verzioniranje sprememb kontaktov (revizijska sled po skupini) | 005 |
| pregled revizijske sledi (viewer+) | 005 |
| rollback na poljubno točko (admin, owner) | 005 |
| iskanje podvojenih kontaktov (editor+) | 011 |
| združevanje podvojenih kontaktov (tabela razlik; editor+) | 011 |
| iskanje s filtri in razvrščanjem (viewer+) | 008 |
| izvoz izbranih kontaktov v Excel (viewer+) | 010 |
| arhiviranje skupine (owner) | 003 |
| prikaz arhiviranih skupin | 003 |
| prikaz kontaktov v skupini (viewer+) | 004 |
| množično urejanje kontaktov (editor+) | 009 |
| prenos lastništva | 007 |
| odarhiviranje (owner) | 003 |
| potrditvena okna za nevarne operacije | vsaka funkcionalnost za svoje operacije (§2.8) |
| stran za neobstoječe poti | 001 |
| arhivirana skupina samo za branje | 003 (splošno pravilo) + vsaka funkcionalnost v negativnih scenarijih |
| prikaz prejetih povabil; sprejem/zavrnitev | 006 |
| izvoz svojih podatkov (JSON) | 012 |
| izbris računa | 012 |
| izbris skupine (edini član; trajno arhivirana) | 003 |
| nefunkcionalne zahteve | konstitucija (vse funkcionalnosti) |

---

## 2. Skupna pravila (veljajo za vse `spec.md`)

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
| 7 | kršitev poslovnega pravila (npr. lastnik zapušča skupino, izbris skupine z več člani) | `409` z imenovano kodo, ki jo določi `spec.md` |

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
  - odarhiviranje (samo lastnik, ne pri trajno arhivirani).
  
  Vse drugo (tudi povabila, spremembe vlog, odstranjevanje članov, prenos lastništva, urejanje skupine, rollback, dvojniki) → `409 GROUP_ARCHIVED`, če ima član sicer zadostno vlogo; sicer `403` (§2.2).
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
| Privzeto razvrščanje kontaktov | priimek, nato ime, naraščajoče; po vrstnem redu kodnih točk Unicode, ne glede na velikost črk in neodvisno od jezika vmesnika (D-38) |

### 2.7 Revizijska sled

Od funkcionalnosti 005 naprej **vsaka** sprememba kontaktov (ustvarjanje, urejanje, izbris, množične spremembe, združevanje, rollback) ustvari vnos v revizijski sledi skupine. Funkcionalnosti 009 in 011 to zahtevata v svojih FR; 005 doda beleženje operacij iz 004.

### 2.8 Nevarne operacije

Potrditveni dialog (design.md 8.11) je obvezen za: izbris kontakta (tudi množični), združevanje, rollback, odstranitev člana, spremembo vloge, zapuščanje skupine, arhiviranje, prenos lastništva, izbris skupine, izbris računa, zavrnitev povabila. Z vpisom naslova skupine oziroma lastnega e-naslova se potrdijo izbris skupine, izbris računa in prenos lastništva. Vsaka funkcionalnost to zapiše kot FR za svoje operacije.

### 2.9 Jezik, čas, dostopnost

- Vsa besedila v slovenščini in angleščini; privzeto po jeziku brskalnika (`sl` → slovenščina, sicer angleščina); izbira v *Mojem računu* ima prednost.
- Datumi in časi v zapisu izbranega jezika.
- WCAG 2.1 AA, odzivno (320 px naprej), PWA – po konstituciji in design.md.

### 2.10 Register kod napak

Skupne kode (§2.2): `UNAUTHENTICATED` (401), `FORBIDDEN` (403, D-25), `GROUP_ARCHIVED`, `VERSION_CONFLICT` (409), `VALIDATION_FAILED` (400). Kode poslovnih pravil (409), ki so jih uvedle specifikacije – nova koda se doda sem, obstoječa se ne preimenuje:

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
