# Oblikovni jezik »Kartoteka« (v2) – Contact Manager

**Status:** v2 (2026-11-17) – prenova *Kartoteka, refined* (020); implementacija s Tailwind CSS v4 in (neobvezno) shadcn/ui, glej 13. Živi dokument; spreminja se s pull requestom (`constitution.md` §7).  
**Velja za:** celoten React frontend (namizje, tablica, mobilni telefon, nameščen PWA).  
**Povezano:** [`constitution.md`](constitution.md) (pravila in potek dela), [`feature-map.md`](feature-map.md) (funkcionalnosti in skupna pravila), `specs/*/spec.md` (zahteve)  
**Viri v2** (zunanji, samo za branje): oblikovni sistem *Kartoteka, refined* (pravila in žetoni `tokens.json`) in platno *Contacts — app redesign* (25 zaslonov, 16 dialogov); povezavi sta v `specs/020-prenova-vmesnika/spec.md`.

> Ta dokument določa **videz in vedenje vmesnika**. *Kaj* aplikacija počne, določajo `specs/*/spec.md` in skupna pravila v `feature-map.md`; pri navzkrižju veljajo ti. Točna dostopna imena elementov so v prevodih (`frontend/src/i18n/`); imena v tem dokumentu so izhodišče zanje.

---

## 1. Koncept

Aplikacija je urejena kot **pisarniška kartoteka**: skupina je predal, kontakt je kartica, barva skupine je jeziček na robu predala. Topel papir, mehke bele kartice, skoraj črno črnilo in en sam poudarek v barvi modrega črnila. Mirno in funkcionalno, a z zrakom, mehkobo in drobnimi trenutki veselja, da je videti skrbno narejeno, ne golo.

- **Papir in črnilo.** Plasti od svetle do temne: stran `bg` → kartice, preglednice, polja `surface` → lebdeče plasti `raised`; `sunken` za prehod, glavo preglednice, značke in sledi. V temni shemi je vsaka plast svetlejša od spodnje, zato globina ni odvisna od težkih senc.
- **Robovi in ton namesto senc.** Kartice v mirovanju so `surface` + tanka črta `divider`. Senca obstaja pri interaktivnih karticah (`sm`), lebdečih plasteh (`md`) in dialogih (`lg`); plast vedno obdrži pravi rob.
- **Jeziček skupine.** Barva skupine je ozek trak ob naslovu, pika v seznamih, ploščica z monogramom in druga barva v ilustracijah; nikoli besedilo.
- **Okras v praznih in vmesnih trenutkih.** Ilustracije, pozdravna ploskev in drobno gibanje živijo v prijavi, uvodu, praznih stanjih, uspehu in 404, **nikoli** nad delovnimi podatki.
- **Berljivost pred slogom.** *Atkinson Hyperlegible Next* je narejena za ljudi s slabšim vidom; dodatni atributi in časi v sledi so v *Mono* različici.

## 2. Načela

1. **Vsebina pred okvirjem.** Stalni elementi (stranski pas, glava) so ozki in tihi; kontakti zasedajo večino zaslona.
2. **Ena glavna akcija na zaslon.** En poln gumb `accent`; vse drugo je mehko, sekundarno ali tiho.
3. **Vedno veš, kje si.** Vidni so skupina (jeziček, monogram in naslov), tvoja vloga in stanje *Arhivirano*.
4. **Pokažemo samo, kar smeš.** Akcij, ki jih vloga ali stanje skupine ne dovoljujeta, vmesnik ne izriše. To je udobje, ne varnost – pravice vedno preveri zaledje.
5. **Nič se ne zgodi potiho.** Vsak uspeh in neuspeh ima viden odziv; napaka pove, kaj narediti.
6. **Prekinemo samo, ko je vložek velik.** Blokirajoč dialog le za nevarne operacije (8.11).
7. **Dostopno privzeto (WCAG 2.1 AA).** Komponenta brez podpore tipkovnici, bralniku zaslona in načinu vsiljenih barv ni dokončana.
8. **Mobilno enakovredno.** Na telefonu so na voljo vse funkcije, le razporejene drugače.
9. **Dvojezično.** Vsa besedila, tudi dostopna imena, so v slovenščini in angleščini prek ključev i18n.

## 3. Česa ne delamo

- barvnih prelivov (ozadja, gumbi, besedilo), »glassmorphism« in zameglitve ozadja;
- vijolične, indigo ali neonske poudarjene barve; več kot ene poudarjene barve;
- pisav Inter, Geist, Poppins in podobnih privzetih izbir; emojijev kot ikon ali okrasa;
- gumbov v obliki tablete; zaobljenosti nad 16 px (razen `radius-full` pri avatarjih, pikah stanja, filtrirnih čipih in stikalih);
- težkih senc pod kartico v mirovanju; barvnih robov na levi strani kartic; izmišljenih »statistik«;
- ilustracij, pozdravnih ploskev in vzorcev na delovnih zaslonih; ponavljajoče se animacije zunaj prijavne ploskve;
- skeletnih nalagalnikov z bleščečim prelivom (*shimmer*);
- privzete Tailwind palete in neprilagojene teme shadcn/ui (obe sta preslikani na žetone, 13);
- preklopnika teme v glavi (tema je nastavitev računa, 9.9, in se shrani v profil in brskalnik, 4.3);
- **seznama skupin v stranskem pasu** in razdelkov po vlogah: skupine so ena zbirka, vloga je značka na kartici (8.18);
- arhiviranih skupin kot sekundarne povezave: so samostojen zaslon (8.19);
- značk ali opomb o obnovitvi na kontaktu: obnovitve so samo v revizijski sledi;
- podčrtanih povezav, razen povezav v tekočem besedilu (8.20).

## 4. Barve

### 4.1 Žetoni

Barve so CSS spremenljivke z `light-dark()`; `:root` ima `color-scheme: light dark`. Vir vrednosti je `tokens.json` (v2); v Tailwindu so pod semantičnimi imeni shadcn/ui (`bg-card`, `text-muted-foreground`, `border-input` …, preslikava v 13.2). Privzeta paleta Tailwind je izklopljena; v kodi ni šestnajstiških vrednosti, arbitrarnih barv, barv ali razmikov v `style` in razredov `dark:`.

| Žeton | Svetla | Temna | Uporaba |
|---|---|---|---|
| `--k-bg` | `#F7F6F2` | `#121211` | podlaga strani (»papir«), stranski pas |
| `--k-surface` | `#FFFFFF` | `#1B1A18` | kartice, preglednica, vnosna polja |
| `--k-raised` | `#FFFFFF` | `#23221F` | lebdeče plasti: meniji, dialogi, obvestila, vrstica izbora |
| `--k-sunken` | `#EFEDE8` | `#2A2926` | glava preglednice, prehod, značke, sledi |
| `--k-text` | `#1B1A17` | `#EEECE7` | osnovno besedilo |
| `--k-muted` | `#625D55` | `#AAA59B` | pomožno besedilo, metapodatki |
| `--k-border` | `#8B857C` | `#7D776D` | robovi kontrol (polja, potrditvena polja, sekundarni gumbi), ≥ 3 : 1 |
| `--k-divider` | `#E6E3DC` | `#33312D` | robovi kartic, ločilne črte, obrobe plasti (dekorativno; nikoli rob kontrole) |
| `--k-accent` | `#1F4F99` | `#93B7F3` | edini poudarek: primarni gumb, povezave, fokus, izbira, označba aktivne navigacije |
| `--k-accent-hover` | `#183F7C` | `#B4CDF7` | primarni gumb ob prehodu |
| `--k-on-accent` | `#FFFFFF` | `#0E1F3A` | besedilo na `accent`, `danger` in na ploščici monograma |
| `--k-accent-soft` | `#E8EEFA` | `#1C2A42` | izbrana vrstica, aktivni zavihek in element navigacije, mehki gumb, informativni poudarek |
| `--k-danger` / `-soft` | `#B42318` / `#FDECEA` | `#F2907F` / `#3B1F1B` | brisanje, napake |
| `--k-success` / `-soft` | `#24703B` / `#E7F3EA` | `#84C895` / `#1B3122` | uspeh |
| `--k-warning` / `-soft` | `#8A5A00` / `#FBF1DB` | `#E3B955` / `#362B12` | arhivirano, konflikt verzij |

Stanja (`danger`, `success`, `warning`) vedno spremljata ikona in beseda. Izbira nikoli ni samo barva: vedno tudi obkljukano polje ali označba.

**Zahtevani kontrasti** (WCAG 2.x, vsi pari v obeh shemah; vrednosti v `tokens.json` jih izpolnjujejo):

| Par | Zahteva |
|---|---|
| `text`, `muted` na `bg`, `surface`, `raised`, `sunken`, `accent-soft` | 4,5 : 1 |
| `accent` na `bg`, `surface`, `accent-soft` | 4,5 : 1 |
| `on-accent` na `accent` / `accent-hover` / `danger` | 4,5 : 1 |
| `danger`, `success`, `warning` na `surface`, `bg` in svoji `-soft` | 4,5 : 1 |
| `border` na `bg`, `surface` (meje kontrol, ikone) | 3 : 1 |

`divider` je namenoma nizkega kontrasta; meja kontrole je vedno `border`.

### 4.2 Barve skupin

Uporabnik barve skupine ne izbira poljubno, ampak iz **osmih poimenovanih barv**. Tako ima vsaka barva preverjen kontrast in ime, ki ga prebere bralnik zaslona (»Barva: mah«).

| Ime (sl / en) | Svetla | Temna | Kontrast na `surface` / `bg` (svetla; temna) |
|---|---|---|---|
| Tinta / Ink | `#2F5FA8` | `#7FA6E6` | 6,3 / 5,8; 6,8 / 7,4 |
| Mah / Moss | `#3E7A3A` | `#86C07F` | 5,2 / 4,8; 7,8 / 8,6 |
| Opeka / Brick | `#B0412F` | `#EE8C7B` | 5,8 / 5,3; 6,9 / 7,5 |
| Oker / Ochre | `#9A6A00` | `#DDB24A` | 4,7 / 4,3; 8,4 / 9,2 |
| Sliva / Plum | `#7A4A93` | `#C79BE0` | 6,5 / 6,0; 7,3 / 8,0 |
| Morje / Sea | `#1F7A78` | `#6CC6C2` | 5,1 / 4,7; 8,3 / 9,1 |
| Grafit / Graphite | `#5E6670` | `#A3ABB5` | 5,8 / 5,3; 7,2 / 7,9 |
| Rja / Rust | `#B3561B` | `#F0A06A` | 4,9 / 4,5; 7,9 / 8,6 |

- Barva skupine se pokaže **samo** kot: navpičen jeziček širine 4 px ob naslovu skupine; pika 8 px v seznamih in meniju preklopa; ploščica monograma skupine (8.17) z začetnicama v `on-accent`; druga barva v ilustracijah; tanek trak na vrhu kartice kontakta (8.6a). Nikoli barva besedila, nikoli ozadje besedila, nikoli edini nosilec pomena (ime barve je vedno tudi besedilo).
- Izbira barve je skupina izbirnih gumbov (`radio`): vzorec 24 × 24 px z imenom barve ob njem.

### 4.3 Barvne sheme in vsiljene barve

- Privzeto sledimo nastavitvi sistema (`color-scheme: light dark`, brez atributa na `<html>`). Uporabnik lahko v *Mojem računu* izbere *Sistemska*, *Svetla* ali *Temna*. *Svetla* in *Temna* se shranita v `localStorage` in se uveljavita kot `data-theme="light|dark"` na `<html>` (ta nastavi `color-scheme`), *Sistemska* zapis izbriše. Prijavljenemu uporabniku se izbira (tako kot jezik) shrani tudi v profil in velja na vseh njegovih napravah: po prijavi se izbira iz profila zapiše v `localStorage` in uveljavi; `localStorage` je kopija za stran za prijavo, nalaganje brez bliska in čas po odjavi (001, FR-001-19; D-19). Atribut nastavi majhen vrinjen skript v `<head>`, da ni bliska napačne teme; brez JavaScripta stran še vedno sledi sistemu.
- Tailwindova različica `dark:` je vezana na isto pravilo (13.3), zato se ujema z žetoni.
- **Način vsiljenih barv** (`forced-colors: active`): vse meje so prave obrobe (`border`, `outline`), nikoli samo `box-shadow` ali ozadje. Izbrana vrstica dobi obrobo `Highlight`, fokus `outline` v `Highlight`. Jeziček skupine ostane viden z `forced-color-adjust: none`, ker je barva tam podatek, ki ga je izbral uporabnik (ime barve je vedno tudi v besedilu).

## 5. Tipografija

- **Pisava:** *Atkinson Hyperlegible Next* (spremenljiva, 200–800) za vse besedilo; *Atkinson Hyperlegible Mono* (400) za ključe in vrednosti dodatnih atributov, čase in tehnične vrednosti v revizijski sledi. Obe pod licenco SIL OFL, podpirata šumnike.
- Pisavi sta **gostovani lokalno** (WOFF2, latin in latin-ext, Fontsource), ne prek CDN – zaradi zasebnosti (GDPR) in predpomnjenja PWA.
- `font-display: swap`; nadomestni sklad `system-ui, "Segoe UI", Roboto, sans-serif` z `font-size-adjust: from-font`.
- Utež 400 besedilo, 500 oznake, 600 naslovi in gumbi; 700 samo besedni znak. Naslovi 600 z rahlim negativnim razmikom črk (`letterSpacing` iz tabele ostane).
- Številke v preglednicah, paginaciji in števcih so tabelarne (`tabular-nums`).

| Žeton | Velikost / višina vrstice | Uporaba |
|---|---|---|
| `--k-font-display` | 2,5 rem / 1,1, 600 | ena pozdravna glava: prijava, uvod, prvo prazno stanje, 404 |
| `--k-font-xxl` | 2 rem / 1,15, 600 | besedni znak, velike glave strani |
| `--k-font-xl` | 1,5 rem / 1,25, 600 | naslov strani (h1) |
| `--k-font-lg` | 1,25 rem / 1,35, 600 | naslovi razdelkov, kartic in dialogov (h2) |
| `--k-font-md`, `--k-font-md-strong` | 1 rem / 1,5, 400 / 600 | osnovno besedilo, polja; gumbi in imena kontaktov |
| `--k-font-label` | 0,875 rem / 1,4, 500 | oznake, glave stolpcev, navigacija, zavihki |
| `--k-font-sm` | 0,875 rem / 1,45 | metapodatki, pomoč |
| `--k-font-xs` | 0,8125 rem / 1,4, 500 | samo števci in namigi za tipke |
| `--k-mono-sm` | 0,875 rem / 1,45 | čas in tehnične vrednosti (Mono) |

- Stavčna oblika povsod; brez velikih tiskanih črk z razmikom. Besedilo daljše od enega stavka ima največjo širino `--k-prose-max` (70 ch). Polja imajo vsaj 16 px.

## 6. Prostor, oblike, sence, gibanje

- **Razmiki:** lestvica 4 px: `--k-space-0-5` 2, `-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48, `-8` 64, `-9` 96. Zračno: odmik v kartici `space-5`, polje→polje `space-5`, oznaka→polje `space-1`, razdelek→razdelek `space-6`, glava strani→vsebina `space-7`; pozdravne ploskve `space-8`/`space-9`.
- **Zaobljenost:** `radius-xs` 4 (potrditveno polje, značka, jeziček skupine); `radius-sm` 8 (gumbi, polja, elementi menija, monogram); `radius-md` 12 (kartice, meniji, obvestila, poudarki); `radius-lg` 16 (dialogi, listi, pozdravne ploskve); `radius-full` (avatarji, pike stanja, filtrirni čipi, stikala). Notranja zaobljenost = zunanja − odmik.
- **Robovi:** 1 px `border` za kontrole, 1 px `divider` za kartice, vrstice in plasti.
- **Višina (sence):** kartica v mirovanju brez sence; interaktivna kartica in aktivni element navigacije `shadow-sm`; meniji, obvestila, vrstica izbora `raised` + `divider` + `shadow-md`; dialogi in listi `raised` + `divider` + `shadow-lg`. Ozadje dialoga `rgb(18 18 17 / 0.45)`, brez zameglitve.
- **Gibanje:** `duration-fast` 120 ms (prehod, pritisk, fokus), `-base` 200 ms (meniji, obvestila, izbira), `-slow` 320 ms (dialogi, listi, vstop strani); `ease-out` za vstop, `ease-in-out` za premike. Dovoljeno: prozornost, premik do 8 px, merilo 0,98–1; drobni užitki (kljukica, drseči kazalnik segmentnega gumba, rahlo zaporedno pojavljanje prvih ≤ 8 kartic po 30 ms ob prvem nalaganju, ilustracija, ki se enkrat pojavi). **Ob `prefers-reduced-motion: reduce` je vse gibanje izklopljeno**, skeleti so statični.
- **Nalaganje:** skeleti so bloki `sunken` s počasnim utripanjem prozornosti (1,6 s), nikoli bleščeč preliv; nalagalnik se pokaže šele po 300 ms.
- **Velikost ciljev:** kontrole `--k-control-h` 44 px (`-touch` 48 px ob `pointer: coarse`); nikoli manj kot 44 px ciljna površina. (WCAG 2.1 AA tega ne zahteva – 2.5.5 je AAA; ciljamo nanj zaradi mobilne uporabe.)

## 7. Postavitev

### 7.1 Ogrodje aplikacije

- **Stranski pas** (`--k-sidebar-w` 264 px, `bg`) in glavni stolpec do `--k-content-max` (72 rem); obrazci in nastavitve do `--k-form-max` (40 rem). **Zgornje vrstice na namizju ni.**
- **Stranski pas je navigacija, ne vsebina.** Od zgoraj navzdol:
  1. besedni znak;
  2. trije enakovredni elementi: **Skupine** (števec `xs` `muted`), **Arhivirane** (števec), **Povabila** (značka `accent` s številom novih);
  3. samo znotraj skupine: kartica **Trenutna skupina** (`surface`, rob `divider`, označba aktivnega) z monogramom, naslovom, vlogo (`xs`) in ikono izbirnika; odpre meni preklopa skupine (8.16);
  4. spodaj pritrjeno nad ločilom `divider`: element računa (avatar, ime, e-naslov), ki odpre meni računa (*Moj račun*, jezik, *Odjava*).
- Aktivni element navigacije je na `surface` s `shadow-sm` in 3 px označbo `accent` na levi; `aria-current="page"`. **Skupin v pasu ne naštevamo**; *Nova skupina* je na zaslonu *Skupine*, ne v pasu.
- **Glava skupine** (na vseh zaslonih skupine): monogram 48 px, naslov (`xl`), opis (`muted`), značka vloge (in *Arhivirano*), nato zavihki skupine (*Kontakti*, *Dvojniki*, *Revizijska sled*, *Nastavitve*; `nav` s povezavami, ne ARIA zavihki) s 2 px podčrtanjem `accent` pod aktivnim. *Dvojniki* samo urednik in višje (ne v arhivirani skupini); *Nastavitve* vsi člani. Na telefonu se glava strne v vrstico 56 px, katere ime skupine odpre preklopnik, zavihki se drsijo vodoravno.
- **Pod 1024 px** je stranski pas list (sheet) z gumbom v zgornji vrstici 56 px (meni, besedni znak). **Pod 640 px** je glavna navigacija **spodnja vrstica** (`--k-bottom-bar-h` 72 px, `raised`, zgoraj rob `divider`) s točno 4 elementi, vsak z ikono 24 px in oznako: *Skupine*, *Arhivirane*, *Povabila*, *Račun*; aktivni ima pilulo `accent-soft` za ikono.
- **Preskoči na vsebino** je prvi element v vrstnem redu fokusa.

### 7.2 Prelomne točke

| Širina | Postavitev |
|---|---|
| < 768 px (od 320 px) | brez stalnega stranskega pasu (list); pod 640 px spodnja vrstica; skupino izbereš na zaslonu *Skupine* ali z imenom skupine v vrstici glave (preklopnik); zavihki skupine so vodoravno drsna vrstica; primarna akcija je gumb v glavi seznama; podrobnosti kontakta, obrazci in primerjava dvojnikov so ločene strani čez cel zaslon |
| 768–1023 px | kot zgoraj, a s širšimi robovi; preglednica kontaktov, če je vsebnik širok vsaj 640 px |
| 1024–1279 px | stalni stranski pas; podrobnosti kontakta so ločena stran |
| ≥ 1280 px | stranski pas + seznam + **panel podrobnosti** (`--k-detail-panel-w` 400 px, `position: sticky`, zgoraj `space-5`, lasten pomik, če je višji od okna) desno od seznama; izbrani kontakt je v naslovu poti, zato ostane ob osvežitvi |

- Brez vodoravnega drsenja strani pri 320 px in pri povečavi 400 % (WCAG 1.4.10).
- **Preglednica ↔ kartice** se preklaplja z **vsebniško poizvedbo** (`@container`, prag 640 px širine seznama), ne s širino zaslona, ker je ista komponenta lahko v ozkem panelu ali čez cel zaslon.
- Upoštevamo varna območja (`env(safe-area-inset-*)`) za nameščen PWA.
- E2E testi preverjajo postavitev pri 360, 768 in 1280 px.

## 8. Komponente

### 8.1 Gumbi

| Vrsta | Videz | Uporaba |
|---|---|---|
| Primarni | poln `accent`, besedilo `on-accent`, ob prehodu `accent-hover`, `shadow-sm` | ena glavna akcija zaslona |
| Mehki | `accent-soft`, besedilo `accent` | sekundarne pozitivne akcije: *Filtri*, *Povabi*, *Izvozi* |
| Sekundarni | `surface`, rob 1 px `border`, besedilo `text`, ob prehodu `sunken` | nevtralne akcije |
| Tihi | brez roba in ozadja, besedilo `accent` ali `text`, ob prehodu `sunken` | akcije v vrsticah, *Prekliči* |
| Nevarni | poln `danger`, besedilo `on-accent` | samo potrditveni gumb v dialogu nevarne operacije |

- Višina `--k-control-h` 44 px (48 px na dotik), vodoravni odmik `space-4`, `radius-sm`, `font-md-strong`, ikona 20 px z razmikom `space-2`. Pritisk: merilo 0,98 v `duration-fast`.
- Besedilo je glagol z objektom: »Shrani kontakt«, »Izvozi v Excel«, »Izbriši skupino«.
- V skupini akcij je primarna prva (levo), uničujoča tiha zadnja: *Uredi kontakt* · *Izbriši kontakt*. Dialogi so izjema: *Prekliči*, nato potrdilna akcija, desno poravnano (na telefonskih listih sta v isti vrstici, *Prekliči* levo).
- Ikona brez besedila samo v vrstici preglednice, orodnih vrsticah in pri prikazu gesla, vedno z dostopnim imenom (npr. »Dejanja za Janez Novak«).
- Med pošiljanjem gumb ostane na mestu, pokaže »Shranjujem…« in ne sprejme drugega klika. Pred pošiljanjem gumb **ni onemogočen** – napake se pokažejo ob poljih.

### 8.2 Vnosna polja in obrazci

- Oznaka vedno vidna nad poljem (ne samo `placeholder`); pomoč pod oznako, napaka pod poljem; povezani z `aria-describedby`.
- Polje: višina 44 px, `surface`, rob 1 px `border`, `radius-sm`, odmik `space-3`; ob prehodu rob `muted`; ob fokusu rob `accent` in obroba fokusa (8.12); ob napaki rob 2 px `danger` in ikona z besedilom pod poljem. Vodilna ikona (iskanje) je `muted`.
- Obvezna polja imajo ob oznaki besedo »(obvezno)«, ne samo zvezdico.
- Pravi tipi in namigi: e-naslov `type="email"` (`autocomplete="off"`, ker ne gre za uporabnikov e-naslov, brez samodejnega popravljanja), telefon `type="tel"`, naslov `<textarea>`.
- **Preverjanje ob zapustitvi polja**, ne med tipkanjem; napaka izgine, ko jo uporabnik začne popravljati. `aria-invalid` se nastavi hkrati z vizualnim stanjem (`:user-invalid`), ne že ob prvem vstopu v prazno obvezno polje.
- Ob neuspešni oddaji se nad obrazcem prikaže povzetek napak (`role="alert"`, s povezavami na polja), fokus se premakne nanj.
- Obrazci so v enem stolpcu; sorodna polja združuje `fieldset` z `legend` (*Osnovni podatki*, *Dodatni atributi*, *Značke*).

### 8.3 Dodatni atributi (ključ=vrednost)

```
Dodatni atributi
┌ Ključ ─────────────┐ ┌ Vrednost ─────────────────┐
│ kompetenca         │ │ web dev                   │  [Odstrani atribut kompetenca]
└────────────────────┘ └───────────────────────────┘
[+ Dodaj atribut]
```

- Vsak par je vrstica dveh polj z vidnima oznakama *Ključ* in *Vrednost* (v pisavi Mono) in tihim gumbom »Odstrani atribut ‹ključ›«.
- *Dodaj atribut* doda prazen par in premakne fokus v novo polje *Ključ*. Ključ, ki se ponovi v istem kontaktu, je napaka ob polju.
- V pogledu kontakta so atributi seznam opredelitev (`dl`): ključ v `muted` Mono, vrednost v `text`.
- **Predlogi (013):** polji *Ključ* in *Vrednost* sta kombinirani polji (kot v 8.4): ob fokusu praznega polja do 10 najpogostejših ključev oziroma vrednosti tega ključa v skupini, ob vpisu ujemajoči (brez razlike velikosti črk in strešic); prosti vnos ostane mogoč; že uporabljeni in rezervirani ključi niso ponujeni; ob zapustitvi polja ključa se vpis uskladi s kanoničnim zapisom skupine. Ob napaki ali brez predlogov polje deluje kot navadno besedilno polje.
- **Podjetje in država (013):** *Podjetje* je besedilno polje z istimi predlogi; *Država* je izbirno kombinirano polje brez prostega besedila (ime v jeziku vmesnika, iskanje po imenu in kodi; najprej države, ki jih skupina najpogosteje uporablja).
- **Prenos starega atributa (013):** ob obstoječem atributu z imenom `Država`, `Podjetje`, `Country` ali `Company` stoji opomba in gumb »Premakni v polje …«; dvoumna ali neprepoznana država, oziroma polje, ki že ima drugačno vrednost, zahteva odločitev v pogovornem oknu; do shranjevanja se na strežniku ne spremeni nič.

### 8.4 Značke

- Značka: `sunken`, besedilo `text` velikosti `sm`, `radius-xs`, brez barv – značke so oznake, ne kategorije barv. **Filtrirni čipi** (8.7): `radius-full`, `surface` z robom `border`; aktiven `accent-soft` z besedilom `accent` in gumbom »Odstrani filter …«; čipi vlog nimajo gumba za odstranitev.
- V obrazcu je vnos značk **kombinirano polje** (`role="combobox"`; shadcn *Combobox*/*Command* ali `useComboBox` iz React Aria, 13.4) s predlogi obstoječih značk skupine (013: ob fokusu najpogostejše z vidnim številom kontaktov, ob vpisu ujemajoče po predponi ali v sredini; ob dodajanju se zapis uskladi s kanoničnim zapisom skupine); *Enter* ali vejica doda značko. Dodane značke so pod poljem, vsaka z gumbom »Odstrani značko ‹ime›«.
- V preglednici so vidne največ tri značke in »+N«; vse so v podrobnostih.

### 8.5 Oznake vlog in stanj

- **Vloga:** značka z robom `border` in besedilom `muted` (»Lastnik«, »Admin«, »Urednik«, »Bralec«) z vizualno skritim »Vloga:«, nikoli samo barva ali ikona.
- **Arhivirano / Trajno arhivirano:** značka `warning-soft` z besedilom `warning` in ikono arhiva (pri trajno arhivirani ključavnica), poleg značke vloge.
- **Izbrisan uporabnik:** povsod, kjer bi bilo ime izbrisanega uporabnika (revizijska sled, lastnik arhivirane skupine, povabila, člani), piše »izbrisan uporabnik« v ležečem `muted` besedilu, brez povezave.

### 8.6 Preglednica kontaktov

- Semantični `<table>` z `<caption>` (vizualno skrit, npr. »Kontakti skupine Projekt FERI«), `<th scope="col">` in imenom kontakta kot `<th scope="row">`. Ovojnica ima `role="region"`, dostopno ime in `tabindex="0"`, glava preglednice je lepljiva (`position: sticky`).
- Stolpci: izbira, *Ime in priimek* (povezava na kontakt), *E-naslov*, *Telefon*, *Značke*, meni dejanj vrstice. Dodatnih stolpcev ni; dodatni atributi so v podrobnostih in v filtrih.
- Preglednica je na `surface` v kartici `radius-md`; glava `sunken`, `font-label`, lepljiva. Vrstica `--k-row-h` 56 px (zgoščeno `--k-row-h-compact` 44 px je nastavitev uporabnika, 9.9), ločilo `divider`; ob prehodu `sunken`; izbrana vrstica `accent-soft` in obkljukano polje (stanje nikoli samo z barvo). Celica imena: avatar (32 px) in ime v `font-md-strong`; ime se podčrta samo ob prehodu. Povezava na kontakt je ime, ne celotna vrstica, zato ostanejo izbira in meni ločena cilja.
- Glava stolpca, po katerem je mogoče razvrščati, vsebuje gumb; `aria-sort` na `<th>` in puščica pokažeta smer. Ponoven klik obrne smer.
- **Pod 640 px vsebnika** se vrstice zložijo v kartice: ime je glava kartice, ostala polja dobijo oznake (»E-naslov:«) prek `::before`, glava preglednice se skrije (`display: none`). Izbira in meni ostaneta v glavi kartice.

### 8.6a Kartica kontakta

Kartica `surface` (`radius-md`, rob `divider`), katere zgornji rob je tanek trak (`--k-group-strip-h`, v plošči 6 px) v barvi skupine kontakta. Pod njim: avatar 64 px (nikoli ne prekriva traku), ime (`xl`), ena vrstica `muted` »Dodano ‹datum› (‹ime›) · zadnja sprememba ‹datum›«, nato *Uredi kontakt* (primarni) pred *Izbriši kontakt* (tihi, nevarni). Značke ali opombe o obnovi **ni** (FR-020-20): obnova je vidna samo v revizijski sledi. Razdelek *Zgodovina* na koncu strani: `ol`, najnovejše prvo, vsak vnos z avatarjem izvajalca, stavkom, časom (`mono-sm`, `muted`) in spremenjenimi polji kot opredelitvenim seznamom; mirna povezava odpre revizijsko sled skupine, filtrirano na ta kontakt.

### 8.7 Iskanje, filtri, razvrščanje

- Iskalno polje (`type="search"`, oznaka »Iskanje po kontaktih«) išče po predefiniranih atributih; rezultati se osvežijo 300 ms po zadnjem pritisku tipke, število zadetkov se sporoči bralniku (»Najdenih 18 kontaktov«).
- Gumb *Filtri (N)* odpre razkrivni panel pod orodno vrstico (ne modalno okno):
  - *Atribut* – izbira polja (ime, priimek, naslov, e-naslov, telefon ali dodatni ključ, ki obstaja v skupini) in vrednost; več pogojev je mogoče dodati;
  - *Značke* – potrditvena polja značk skupine z iskalnim poljem »Poišči značko« (vsebuje, brez razlike velikosti črk in strešic; izbrane značke so vedno prikazane na vrhu, neizbranih hkrati največ 100; stanje »Značke: prikazanih N od M« se sporoči bralniku zaslona) (D-67);
  - *Uporabi filtre* in *Počisti filtre*.
- Uporabljeni filtri so nad preglednico kot odstranljive oznake (»Značka: konferenca2025 ✕«, dostopno ime »Odstrani filter Značka: konferenca2025«).
- *Razvrsti* je izbirni seznam polj in gumb za smer (»Naraščajoče« / »Padajoče«) – nujno na telefonu, kjer glav stolpcev ni.
- **Zbirka skupin** (9.2, 9.12) ima isto orodno vrstico: iskanje, čipi vlog (*Vse vloge*, *Lastnik*, *Admin*, *Urednik*, *Bralec*; ena aktivna) in izbirni seznam razvrščanja. **Segmentni gumb** (pogled, gostota): sled `sunken` (`radius-sm`) z drsečim kazalnikom `surface` + `shadow-sm` (`duration-base`).
- Iskanje, filtri, razvrstitev in stran so v poizvedbi naslova (URL), zato delujejo *Nazaj*, osvežitev in deljenje povezave.

### 8.8 Akcijska vrstica izbora in množično urejanje

- Ob izboru vsaj enega kontakta se od spodaj pod seznamom pojavi **plavajoča vrstica izbora** (`raised`, `radius-md`, `shadow-md`, `duration-base`) z »Izbranih: N« (`aria-live="polite"`), *Izberi vse zadetke (312)*, *Uredi izbrane*, *Izvozi v Excel*, *Izbriši*, *Počisti izbor*. Na telefonu je vrstica prilepljena na spodnji rob.
- Bralec in vsi člani arhivirane skupine vidijo le *Izvozi v Excel* in *Počisti izbor*.
- *Uredi izbrane* odpre dialog: *Dodaj značke*, *Odstrani značke*, *Nastavi atribut* (ključ in vrednost; prazna vrednost atribut odstrani). Gumb »Uporabi za N kontaktov«. Po uspehu obvestilo »Posodobljenih N kontaktov.«

### 8.9 Paginacija

- Pod seznamom: »1–25 od 312«, *Prejšnja*, »Stran 2 od 13«, *Naslednja*, izbira velikosti strani (25, 50, 100). Vse v `nav` z dostopnim imenom »Strani rezultatov«; če je na strani več paginiranih seznamov, ime vsebuje ime seznama, npr. »Strani rezultatov: Lastnik« (D-26).
- Ob menjavi strani se fokus premakne na naslov seznama in seznam se pomakne na vrh. Izbor kontaktov se ohrani čez strani.

### 8.10 Dialog

- Nativni `<dialog>` odprt s `showModal()` **ali** shadcn *Dialog* / *Alert Dialog* – v celotni aplikaciji samo en način (13.4). Naslov je `h2`, povezan z dostopnim imenom dialoga. Pri nativnem dialogu brez `role="dialog"`, `aria-modal` in lastne ujetosti fokusa – to zagotovi brskalnik, prav tako vrnitev fokusa na sprožilni gumb; pri shadcn to zagotovi komponenta.
- `raised`, rob `divider`, `radius-lg`, `shadow-lg`, odmik `space-6`, ozadje `rgb(18 18 17 / 0.45)` brez zameglitve. Na namizju sredinski dialog do 480 px (obrazci 560 px); **na telefonu spodnji list** čez celo širino.
- Zapiranje z *Esc* in gumbom *Prekliči*; klik ob dialog zapre samo informativne dialoge, nikoli obrazca z neshranjenimi spremembami.
- Drsenje v dialogu ne drsi strani pod njim (`overscroll-behavior: contain` na dialogu in ozadju).

### 8.11 Potrditveni dialog za nevarne operacije

Obvezen za: izbris kontakta (tudi množični), združevanje, rollback, odstranitev člana, spremembo vloge, zapuščanje skupine, arhiviranje, prenos lastništva, izbris skupine, izbris računa, zavrnitev povabila in umik povabila.

```
┌──────────────────────────────────────────────┐
│ Izbrišem 3 kontakte?                          │
│                                               │
│ Kontakti bodo odstranjeni iz skupine          │
│ Projekt FERI. Izbris bo zabeležen v           │
│ revizijski sledi.                             │
│                                               │
│               [Prekliči]  [Izbriši 3 kontakte]│
└──────────────────────────────────────────────┘
```

- Naslov je vprašanje s predmetom, besedilo pove posledico, nevarni gumb ponovi dejanje (»Izbriši 3 kontakte«, ne »V redu«).
- **Fokus ob odprtju je na *Prekliči*** (varna izbira); nevarni gumb je zadnji in se ne premika.
- Pri najtežjih operacijah (izbris skupine, izbris računa, prenos lastništva) mora uporabnik vpisati naslov skupine oziroma svoj e-naslov; brez ujemanja nevarni gumb ob kliku pokaže napako ob polju.

### 8.12 Fokus

- Obroba fokusa: 2 px `accent`, odmik 2 px, na vseh interaktivnih elementih (`:focus-visible`); `outline: none` brez nadomestka je prepovedan.
- Na polnih gumbih (`accent`, `danger`) je zaradi odmika obroba na podlagi, zato je vidna.
- V načinu vsiljenih barv je obroba v barvi `Highlight`.
- Povezava *Preskoči na vsebino* je prvi element strani in se pokaže ob fokusu.

### 8.13 Obvestila (toast) in sporočila

- **Uspeh:** obvestilo (`raised`, `radius-md`, `shadow-md`) spodaj desno (na telefonu spodaj na sredini, nad akcijsko vrstico): ikona kljukice, kratko besedilo, gumb »Zapri obvestilo«. Izvedeno kot `popover="manual"` z `role="status"` ali s shadcn *Sonner* (z gumbom za zapiranje, 13.4); izgine po 5 s, ne pa, dokler je nad njim miška ali fokus. Več obvestil se zloži eno nad drugo.
- Obvestilo z razveljavitvijo se ne uporablja – za razveljavitev obstaja rollback v revizijski sledi.
- **Napaka akcije** (npr. strežnik zavrne zahtevo): sporočilo ostane na mestu akcije nad obrazcem ali seznamom (`role="alert"`, ozadje `danger-soft`, `radius-md`, ikona v `danger`, besedilo `text`; brez barvnih robov na levi), z gumbom *Poskusi znova*, kjer je smiselno. Napaka nikoli ni samo obvestilo, ki izgine.
- **Opozorilo stanja** (arhivirano, brez povezave, konflikt): enak vzorec v `warning`.

### 8.14 Konflikt verzij

Ob sočasni spremembi (optimistično zaklepanje) obrazec ostane odprt z vnesenimi podatki, nad njim pa opozorilo: »Kontakt je medtem spremenil(a) ‹ime› ob 14.32.« Možnosti:

- *Prikaži razlike* – razkrije preglednico *Polje · Tvoja vrednost · Trenutna vrednost*;
- *Uporabi trenutno različico* – zavrže tvoje spremembe in naloži trenutno stanje;
- *Shrani moje spremembe* – ponovno pošlje tvoje vrednosti nad trenutno različico.

Nič se ne prepiše tiho. Enak vzorec velja za sočasne spremembe članov (npr. vloga je bila medtem spremenjena).

### 8.15 Prazna stanja, nalaganje, brez povezave

- **Prazno stanje:** naslov in en stavek, zakaj je prazno, ter naslednji korak, ki ga uporabnik sme narediti (»Ta skupina še nima kontaktov.« + *Nov kontakt*; bralec dobi samo razlago). Za prazen zadetek iskanja: »Ni kontaktov, ki ustrezajo filtrom.« + *Počisti filtre*. Prazno stanje je na sredini vsebine z ilustracijo (8.21), naslovom `lg` in stavkom `muted`; prvo prazno stanje sme imeti naslov `display`.
- **Nalaganje:** seznam obdrži prejšnjo vsebino z oznako »Nalagam…« in `aria-busy="true"`; ob prvem nalaganju so vrstice mirni bloki `sunken` s počasnim utripanjem (1,6 s) brez bleščanja; pri zmanjšanem gibanju statični. Nalagalnik se pokaže šele po 300 ms, da hitri odgovori ne utripajo.
- **Brez povezave (PWA):** pasica pod zgornjo vrstico »Ni povezave – podatki niso na voljo.« Akcije, ki potrebujejo strežnik, ostanejo vidne, ob kliku pa pojasnijo, zakaj ne delujejo. Podatki kontaktov se ne predpomnijo.

### 8.16 Meniji

- Meni dejanj vrstice, meni računa in preklop skupine so gumb s `popover` ali shadcn *Dropdown Menu* (13.4). Elementi menija so gumbi ali povezave; zapiranje z *Esc* in klikom drugam, fokus se vrne na gumb. Puščice premikajo fokus med elementi.
- Meni se ob robu zaslona obrne navzgor ali v levo, da se ne odreže.

### 8.17 Avatar in nalaganje slike

- **Avatar** je krog (uporabnik, kontakt) ali zaobljen kvadrat (skupina) velikosti 24, 32, 40, 64 ali 128 px. Brez slike so v njem začetnice (največ dve) v barvi iz 8 barv skupine (4.2), izbrani po id, kot besedilo na `surface` z robom 1 px. Ime ob avatarju ga že izrazi, zato je `alt` prazen; sicer je `alt` ime.
- **Nalaganje** odpre dialog (8.10): izbira datoteke ali povleci in spusti (JPEG, PNG, WebP), predogled z okvirjem, premik s povleko ali puščicami, povečava z drsnikom in `+`/`−`, *Shrani sliko*. Napake (neveljavna slika, prevelika, preveč poskusov) so trajne v dialogu z *Poskusi znova*; dokler nalaganje ne uspe, ostane stara slika. Slike se prenašajo z žetonom in so le v pomnilniku (`blob:`); po odjavi se prekličejo.

### 8.17a Monogram skupine

Ploščica v barvi skupine z začetnicama v `on-accent` (`radius-sm`): 32 px v seznamih in meniju, 24 px v menijih, 48 px (`radius` 10 px) na karticah skupin, v glavi skupine in na povabilih; vedno ob imenu skupine. Če ima skupina sliko (018), jo ploščica nadomesti.

### 8.18 Kartica skupine

Skupine so **ena zbirka**, nikoli razdeljena po vlogah. Na namizju mreža treh stolpcev klikljivih kartic (`surface`, `divider`, `radius-md`, odmik `space-5`; ob prehodu `shadow-sm`): monogram 48 px in zgoraj desno značka vloge; naslov (`lg`); opis (`muted`, »Brez opisa«, če je prazen); spodaj pripeto število kontaktov z ikono 16 px. Cela kartica je ena povezava. Na telefonu je enaka vsebina vrstica v enem seznamu. Nad zbirko: iskalno polje, čipi vlog in razvrščanje (8.7); pod njo paginacija (8.9).

### 8.19 Arhivirane skupine

Samostojen zaslon (element navigacije *Arhivirane*) z isto orodno vrstico in kartico; poleg značke vloge značka *Arhivirana* oziroma *Trajno arhivirana* (ključavnica), datum arhiviranja in »lastnik: izbrisan uporabnik«, kjer velja.

### 8.20 Povezave

Podčrtane (`text-decoration-thickness: 1px`, `text-underline-offset: 3px`, `accent`, `accent-hover` ob prehodu) so samo povezave v tekočem besedilu: »Pozabljeno geslo?«, povezave pogojev, e-naslov in telefon kot vrednost, ime kontakta v stavku sledi. Navigacija (pas, zavihki, spodnja vrstica, besedni znak), gumbi, kartice, vrstice, monogrami, avatarji, značke, naslovi in opisi niso podčrtani, tudi ko je cel element povezava. Ime kontakta v preglednici in povezave »Nazaj na …« s puščico se podčrtajo samo ob prehodu.

### 8.21 Ilustracije in pozdravna ploskev

- **Kje:** prijava, ustvarjanje računa, uvod, prazna stanja (ni skupin, kontaktov, zadetkov, povabil), trenutki uspeha (sprejeto povabilo, uvoz končan), brez povezave, 404. **Nikoli** v preglednicah, obrazcih, dialogih, orodnih vrsticah ali ob gostih podatkih.
- **Slog »črtna risba kartoteke«:** ploske risbe kartic, predalov, jezičkov, ovojnic in rok; obrisi 1,5 px `text` z zaobljenimi konci, polnila iz `surface`, `sunken`, `accent-soft` in en poudarek (`accent` ali barva skupine); zaobljenost iz lestvice. Brez prelivov, 3D, obrazov, stockovskih in generiranih slik. Narisane z žetoni (vgrajen SVG, CSS spremenljivke), zato sledijo temi; `aria-hidden`, pomen nosi besedilo. Prazna stanja 160–200 px, pozdravne do 360 px.
- **Pozdravna ploskev** samo v prijavi, ustvarjanju računa, uvodu in 404: `surface` (`radius-lg`) na `bg` z naslovom `display`, enim stavkom `muted`, eno primarno akcijo in ilustracijo; sme imeti tih vzorec (pike v koraku `space-5` v `divider` ali črte kot kartica). Animirano ozadje samo na prijavni ploskvi: zelo počasen (≥ 20 s) premik vzorca za < 8 px, ustavljen ob `prefers-reduced-motion` in ko je zavihek skrit; nikjer drugje ni ponavljajočih se animacij.

## 9. Zasloni

Vsak zaslon ima svojo pot in naslov strani (`<title>`: »‹Zaslon› – ‹skupina› – Kontakti«).

### 9.1 Prijava in ustvarjanje računa

- **Namizje:** dva stolpca: pozdravna ploskev (8.21: naslov `display`, stavek, ilustracija; pri ustvarjanju računa še tri kratke prednosti z ikonami v krogih `accent-soft`) in stolpec obrazca (`--k-auth-form-max` 420 px) na `bg`. Vrstni red v obrazcu: naslov in stavek; *Nadaljuj z Googlom* / *Registracija z Googlom* (Googlov beli gumb); ločilo »ali z e-pošto«; *E-naslov*; *Geslo* z gumbom za prikaz gesla in pri prijavi »Pozabljeno geslo?« desno ob oznaki; pri ustvarjanju računa pred e-naslovom *Ime* in pod poljem gesla sproten seznam pravil (`success` s kljukico, ko je izpolnjeno, `muted` s križcem, ko ni – ikona in besedilo); primarni gumb čez celo širino; sredinska povezava na drugi zaslon. Izbira jezika ostane na zaslonih prijave.
- **Telefon:** pas `surface` s vzorcem pik in zaobljenima spodnjima vogaloma (`radius-lg`) z besednim znakom, izbiro jezika, ilustracijo in sredinskim naslovom; obrazec sledi na `bg` s kontrolami 48 px in vodilnimi ikonami (pošta, ključavnica).
- Zasloni *Potrdi e-naslov*, *Pozabljeno geslo* in 404 sledijo isti postavitvi (pozdravna ploskev ali sredinska kartica z ilustracijo). Tokovi prijave so nespremenjeni (001, 017).

### 9.2 Skupine

- Naslov »Skupine« in primarna akcija *Nova skupina* (samo tu, ne v stranskem pasu).
- **Ena zbirka kartic** (8.18) z iskanjem, čipi vlog in razvrščanjem (8.7), števcem zadetkov (bralnik zaslona izve število) in paginacijo (8.9); iskalni niz, vloga in stran so v URL. Prazno stanje: »Nimaš še nobene skupine.« z akcijo *Nova skupina*.
- *Arhivirane skupine* so samostojen zaslon (8.19, 9.12), ne povezava pod seznamom.
- *Nova skupina* odpre dialog: *Naslov* (obvezno), *Opis*, *Barva* (8 vzorcev, 4.2), *Ustvari skupino*. Po uspehu odpre novo skupino.

### 9.3 Kontakti skupine (glavni zaslon)

Glava skupine (7.1), orodna vrstica (*Iskanje*, *Filtri*, *Razvrsti*, *Nov kontakt* kot edina primarna akcija), uporabljeni filtri, preglednica (8.6), paginacija (8.9), plavajoča vrstica izbora (8.8). Na ≥ 1280 px desno lepljiv panel podrobnosti izbranega kontakta (7.2).

### 9.4 Kontakt – pogled in urejanje

- **Pogled:** kartica kontakta (8.6a); naslov je ime in priimek (`xl`); seznam opredelitev *Naslov*, *E-naslov* (povezava `mailto:`), *Telefon* (povezava `tel:`); razdelek *Dodatni atributi* (Mono); razdelek *Značke*; povezava »Spremembe tega kontakta v revizijski sledi«. Akcije: *Uredi kontakt* (primarna) pred *Izbriši kontakt* (tiha, v `danger`); na telefonu je primarna akcija v spodnji vrstici akcij.
- **Urejanje** in **nov kontakt:** obrazec s tremi `fieldset` (8.2–8.4), *Shrani kontakt* in *Prekliči*. Pri neshranjenih spremembah *Prekliči* in navigacija stran vprašata »Zavržem spremembe?«.

### 9.5 Dvojniki

- Izbira **kategorije iskanja** kot skupina izbirnih gumbov (kategorije določi `spec.md`, npr. ime in priimek, e-naslov, telefon), gumb *Poišči dvojnike*.
- Rezultat: seznam skupin podvojenih kontaktov; vsaka je kartica z imeni in razlogom ujemanja (»Enak e-naslov: janez@…«) ter gumbom *Primerjaj in združi*.
- **Tabela razlik:** vrstice so polja, stolpci kontakti. Vsaka vrstica je skupina izbirnih gumbov (`fieldset` z `legend` = ime polja), privzeto je izbrana neprazna vrednost prvega kontakta. Vrstice z enakimi vrednostmi so strnjene pod »Enaka polja (N)«. Značke: potrditvena polja, privzeto unija. Dodatni atributi: vsak ključ je svoja vrstica.
- Na < 640 px je primerjava zaporedje polj: za vsako polje `fieldset` z vrednostmi kontaktov kot izbirnimi gumbi.
- Pod tabelo predogled združenega kontakta in *Združi kontakte* (potrditveni dialog, 8.11).

### 9.6 Revizijska sled skupine

- Kronološki seznam (`ol`, najnovejše zgoraj) s paginacijo. Vnos: čas (Mono, `muted`, `<time>`), izvajalec (ali »izbrisan uporabnik«), dejanje kot stavek (»dodal(a) kontakt Janez Novak«, »združil(a) 2 kontakta«, »povrnil(a) skupino na stanje 12. 10. 2026, 14.32«).
- *Podrobnosti* (`details`/`summary`) razkrijejo preglednico *Polje · Prej · Potem*.
- Filter po vrsti dejanja (dodajanje, urejanje, odstranjevanje, združevanje, rollback) in po kontaktu (povezava iz pogleda kontakta odpre sled, filtrirano po njem).
- Admin in lastnik imata pri vsakem vnosu tihi gumb **»Povrni skupino na to točko«**. Potrditveni dialog pove posledico: »Kontakti skupine bodo vrnjeni v stanje, kot je bilo ‹čas›. Spremembe po tej točki ostanejo zabeležene v revizijski sledi, rollback pa bo zapisan kot nov vnos.«

### 9.7 Nastavitve skupine

En stolpec razdelkov, vsak s svojim naslovom `h2`:

1. **Podatki skupine** – *Naslov*, *Opis*, *Barva*, *Shrani spremembe* (lastnik, admin; drugi vidijo podatke brez obrazca).
2. **Člani** – preglednica *Član · E-naslov · Vloga · Dejanja*. Kjer ima uporabnik pravico (lastnik, admin; samo nad nižjimi od sebe), meni dejanj vsebuje *Spremeni vlogo* (dialog z izbirnimi gumbi dovoljenih vlog) in *Odstrani iz skupine*.
3. **Povabi člana** (admin in višje) – *E-naslov* registriranega uporabnika in *Vloga* (izbirni gumbi samo vlog, nižjih od lastne), *Pošlji povabilo*. Če uporabnik ne obstaja, napaka ob polju. V arhivirani skupini obrazca ni.
   Pod obrazcem je podrazdelek **Čakajoča povabila** (admin in višje, tudi v arhivirani skupini) – preglednica *Povabljeni (e-naslov) · Vloga · Povabil(a) · Datum · Dejanja*; tihi gumb *Umakni povabilo* (s potrditvijo; admin samo pri povabilih z vlogo pod *Admin*). Prazno stanje: »Ni čakajočih povabil.«
4. **Upravljanje skupine** – ločeno z zgornjim robom; vsaka akcija ima en stavek razlage:
   - *Prenesi lastništvo* (lastnik; izbira člana; ti postaneš admin);
   - *Arhiviraj skupino* / *Odarhiviraj skupino* (lastnik);
   - *Zapusti skupino* (vsi razen lastnika; v trajno arhivirani skupini ne zadnji član);
   - *Izbriši skupino* (le edini član).

   Akcija, ki trenutno ni mogoča, ni izrisana; namesto nje je razlaga (npr. »Skupino lahko izbrišeš, ko si njen edini član.«).

### 9.8 Povabila

Seznam prejetih povabil: jeziček in naslov skupine, kdo vabi, ponujena vloga, datum. Akciji *Sprejmi povabilo* (primarna) in *Zavrni* (sekundarna, s potrditvijo). Po sprejetju obvestilo s povezavo »Odpri skupino«. Povabilo v arhivirano skupino ima oznako *Arhivirano* in razlago, obe akciji pa ostaneta. Prazno stanje: »Nimaš novih povabil.«

### 9.9 Moj račun

1. **Profil** – ime in e-naslov iz Google računa (samo za branje).
   **Profilna slika** – avatar (64 px), *Naloži sliko* ali *Zamenjaj sliko* in *Odstrani sliko* (potrditev 8.11); če ima Google račun sliko, še *Uporabi sliko Google računa* (8.17).
2. **Videz** – *Jezik*: izbirna gumba *Slovenščina*, *English*; *Tema*: *Sistemska*, *Svetla*, *Temna*; *Gostota tabel*: *Udobna* (`--k-row-h`) ali *Zgoščena* (`--k-row-h-compact`) (segmentni gumb).
3. **Moji podatki** – razlaga, kaj izvoz vsebuje (profilna slika, članstva, povabila, osebni podatki, skupine v lasti), gumb *Prenesi moje podatke (JSON)*.
4. **Izbris računa** – razlaga posledic (podatki in povabila se izbrišejo; v arhiviranih skupinah in revizijskih sledeh bo prikazan »izbrisan uporabnik«; arhivirane skupine, v katerih si edini član, se izbrišejo). Če je uporabnik lastnik vsaj ene nearhivirane skupine, je namesto gumba seznam teh skupin s povezavami in navodilom »Prenesi lastništvo ali arhiviraj te skupine«. Sicer *Izbriši račun* s potrditvijo z vpisom e-naslova.
5. *Odjava*.

### 9.10 Stran ne obstaja

Naslov »Te strani ni«, stavek »Povezava je napačna ali pa stran ni več na voljo.«, povezava *Na seznam skupin*. Enaka stran se prikaže za skupino ali kontakt, do katerega uporabnik nima dostopa (strežnik vrne 404 in ne razkrije obstoja).

### 9.11 Arhivirana skupina

Vsi zasloni skupine so na voljo samo za branje. Pod glavo skupine je pasica (`warning-soft`, ikona arhiva):

- »Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.« (zapuščanje in izbris skupine ostaneta v *Nastavitvah*) + *Odarhiviraj skupino* (samo lastnik);
- pri trajno arhivirani skupini: »Skupina je trajno arhivirana, ker lastnik nima več računa.«

Akcije spreminjanja se ne izrišejo; v *Nastavitvah* ostaneta *Zapusti skupino* in *Izbriši skupino*, kjer ju pravila dovoljujejo.

### 9.12 Arhivirane skupine (zbirka)

Naslov »Arhivirane skupine«, ista orodna vrstica in kartice kot 9.2 (8.19); brez primarne akcije. Prazno stanje z ilustracijo: »Nimaš arhiviranih skupin.«

## 10. Dostopnost (WCAG 2.1 AA) – kontrolni seznam

- [ ] Vse je uporabno samo s tipkovnico; vrstni red fokusa sledi vidnemu vrstnemu redu; *Preskoči na vsebino* deluje.
- [ ] Fokus je vedno viden (8.12), tudi v načinu vsiljenih barv.
- [ ] Semantični elementi (`header`, `nav`, `main`, `table`, `dialog`, `details`, `fieldset`); ARIA samo, kjer HTML ne zadošča.
- [ ] Kontrast besedila ≥ 4,5 : 1, meje kontrol in ikone ≥ 3 : 1 v obeh shemah (4.1).
- [ ] Barva nikoli ni edini nosilec pomena (stanje vedno tudi z besedilom ali ikono).
- [ ] Cilji ≥ 44 × 44 px (48 px na dotik).
- [ ] Deluje pri povečavi 200 %, pri 400 % in 320 px brez vodoravnega drsenja.
- [ ] Spremembe stanja (shranjeno, napaka, izbranih N, število zadetkov, nova stran) so sporočene bralniku zaslona.
- [ ] `<html lang>` se ujema z izbranim jezikom; vsaka stran ima edinstven `<title>`.
- [ ] Vsak element, na katerega se sklicuje test, ima dostopno ime (testi iščejo samo po vlogah in dostopnih imenih; `constitution.md` §3.3).
- [ ] axe (pravila WCAG 2.1 A in AA) brez kršitev v testih strani in v E2E.
- [ ] Ročni preizkus s tipkovnico in z bralnikom zaslona (NVDA na namizju, TalkBack ali VoiceOver na telefonu) pred sprejemom funkcionalnosti.

## 11. Besedila in ton

- **Tikanje**, kratko in prijazno, brez žargona: »Shrani kontakt«, »Nimaš novih povabil.« Angleščina enako neposredno (»Save contact«, "You have no new invitations.").
- Privzeti jezik sledi jeziku brskalnika (slovenščina, če je jezik `sl`, sicer angleščina); izbira v *Mojem računu* ima prednost.
- Napaka pove, kaj se je zgodilo in kaj narediti: »E-naslov ni veljaven. Primer: ime@podjetje.si« namesto »Neveljaven vnos«.
- Brez tehničnih kod v vmesniku (409, UUID …).
- Datumi in časi v zapisu izbranega jezika (`Intl.DateTimeFormat`): »12. 10. 2026, 14.32« / "12 Oct 2026, 14:32".
- Spolno nevtralne oblike pri dejanjih drugih: »spremenil(a)«.

## 12. PWA identiteta

- `name`: »Kontakti« / "Contacts"; `short_name` enako.
- `display`: `standalone`; `background_color` = `#F7F6F2`; `theme_color` = `#1F4E8C`.
- Ikona (`#1F4E8C` kvadrat): kvadrat v `accent` z belo stilizirano kartico z jezičkom; 192 px, 512 px in *maskable* različica. Brez prelivov in senc.
- Predpomni se samo ogrodje aplikacije (HTML, CSS, JS, pisavi, ikone), ne odgovori API-ja.

## 13. Implementacija: Tailwind CSS in shadcn/ui

### 13.1 Osnova

- **Tailwind CSS v4** (CSS-first konfiguracija, brez `tailwind.config.js`) je edini način oblikovanja. Lastnih datotek CSS ni, razen `frontend/src/styles/app.css` (žetoni, tema, pisave) in redkih pravil, ki jih pripomočki ne izrazijo (npr. oznake `::before` v zloženi preglednici, 8.6) – ta so v `@layer components`.
- **shadcn/ui je neobvezen** – vir dostopnega vedenja (fokus, tipkovnica, ARIA) za zahtevnejše komponente, **ne vir videza**. Vsaka prevzeta komponenta se prilagodi po 13.4.
- Razredi se združujejo s `cn()` (`clsx` + `tailwind-merge`); vrstni red razredov ureja `prettier-plugin-tailwindcss`.
- Nedovoljeno: arbitrarne barve (`bg-[#…]`), slogi v `style={…}` za barve in razmike, razred `dark:` v lastni kodi (barve se same prilagodijo prek `light-dark()`).

### 13.2 Žetoni v Tailwindu

Žetoni Kartoteke (`--k-*`, 4.1) so edini vir vrednosti. Imena spremenljivk shadcn/ui so samo **aliasi**, zato je besednjak enak, ne glede na to, ali shadcn uporabimo:

| Žeton Kartoteke | Ime v Tailwindu / shadcn | Primer pripomočka |
|---|---|---|
| `--k-bg` | `background`, `sidebar` | `bg-background` |
| `--k-surface` | `card`, `secondary`, `sidebar-accent` | `bg-card` |
| `--k-raised` | `popover` *(novo v v2)* | `bg-popover` |
| `--k-sunken` | `muted`, `accent` | `bg-muted`, `hover:bg-accent` |
| `--k-text` | `foreground` in vsi `*-foreground` razen spodnjih | `text-foreground` |
| `--k-muted` | `muted-foreground` | `text-muted-foreground` |
| `--k-border` | `input` | `border-input` (meje kontrol, 3 : 1) |
| `--k-divider` | `border`, `sidebar-border` | `border-border` (ločila) |
| `--k-accent` | `primary`, `ring`, `sidebar-primary`, `sidebar-ring` | `bg-primary`, `outline-ring` |
| `--k-accent-hover` | `primary-hover` *(novo)* | `hover:bg-primary-hover` |
| `--k-on-accent` | `primary-foreground`, `sidebar-primary-foreground`, `destructive-foreground` | `text-primary-foreground` |
| `--k-accent-soft` | `selected` *(novo)* | `bg-selected` |
| `--k-danger` / `-soft` | `destructive` / `destructive-soft` *(novo)* | `text-destructive` |
| `--k-success` / `-soft`, `--k-warning` / `-soft` | `success`, `success-soft`, `warning`, `warning-soft` *(novo)* | `bg-warning-soft` |
| barve skupin (4.2) | `group-tinta` … `group-rja` *(novo)* | `bg-group-mah` |

**Pozor:** v shadcn pomeni `accent` površino ob prehodu (pri nas `--k-sunken`), poudarjena barva Kartoteke pa je `primary`.

```css
/* frontend/src/styles/app.css (izvleček) */
@import "tailwindcss";

:root {
  color-scheme: light dark;
  --k-bg: light-dark(#F7F6F2, #121211);
  --k-surface: light-dark(#FFFFFF, #1B1A18);
  --k-raised: light-dark(#FFFFFF, #23221F);
  /* … vsi žetoni iz 4.1 in 4.2 ter razmiki, zaobljenosti, sence, trajanja in velikosti iz `tokens.json` … */

  /* aliasi shadcn/ui – blok .dark, ki ga ustvari shadcn init, se izbriše */
  --background: var(--k-bg);
  --card: var(--k-surface);
  --primary: var(--k-accent);
  --input: var(--k-border);
  --border: var(--k-divider);
  --ring: var(--k-accent);
  --radius: 0.5rem;
  /* … */
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }

@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]), :root:not([data-theme="light"]) *) { @slot; }
  }
}

@theme {
  --color-*: initial;                 /* brez privzete palete (zinc, indigo …) */
  --color-black: #000;                /* samo za ozadje dialoga (bg-black/40) */
  --color-white: #fff;
  --shadow-*: initial;                /* brez privzetih senc */
  --shadow-sm: var(--k-shadow-sm);  --shadow-md: var(--k-shadow-md);  --shadow-lg: var(--k-shadow-lg);
  --font-sans: "Atkinson Hyperlegible Next", system-ui, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Atkinson Hyperlegible Mono", ui-monospace, monospace;
  --text-xs: 0.875rem;                /* najmanjša velikost besedila je 14 px */
  --text-xs--line-height: 1.45;
}

@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-primary-hover: var(--k-accent-hover);
  --color-selected: var(--k-accent-soft);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-group-mah: var(--k-group-mah);
  /* … preostale barve iz tabele … */
  --radius-xs: 4px;  --radius-sm: 8px;  --radius-md: 12px;
  --radius-lg: 16px; /* nič bolj okroglega od 16 px; polni krog le pri `rounded-full` (6) */
}
```

- Lestvica razmikov ostane privzeta (`--spacing: 0.25rem` = korak 4 px iz 6).
- Prelomne točke ostanejo privzete in se ujemajo s 7.2: `md` 48 rem (768 px), `lg` 64 rem (1024 px), `xl` 80 rem (1280 px); `2xl` se ne uporablja.
- `rounded-full` je dovoljen samo za avatarje, pike stanja, filtrirne čipe in stikala (6), ne za gumbe in značke.

### 13.3 Uporabni vzorci v Tailwindu

| Potreba | Pripomoček |
|---|---|
| Preklop preglednica ↔ kartice (8.6) | ovojnica `@container`, razredi `@max-[40rem]:block` …; oznake `::before` v `@layer components` |
| Cilji na dotik (6) | `h-11 pointer-coarse:h-12`, `min-w-11` |
| Fokus (8.12) | skupni razred `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` |
| Vsiljene barve (4.3) | `forced-colors:outline-[Highlight]`, `forced-colors:border-[CanvasText]` |
| Gibanje (6) | `motion-safe:transition-opacity motion-safe:duration-150` |
| Napaka ob polju (8.2) | `aria-invalid:border-2 aria-invalid:border-destructive` (atribut nastavi logika iz 8.2) |
| Vizualno skrito besedilo | `sr-only` |

### 13.4 shadcn/ui – kdaj in kako

**Namestitev** (v `frontend/`, del funkcionalnosti 000): `npx shadcn@latest init`, slog `new-york`, osnovna barva `stone` (vrednosti se takoj zamenjajo z aliasi iz 13.2), `cssVariables: true`, `tailwind.config` prazno. Komponente gredo v `frontend/src/shared/ui/` (alias `ui` v `components.json`).

**Kdaj uporabiti:** samo za komponente, kjer je dostopno vedenje zahtevno in bi ga sicer pisali sami:

| Komponenta | shadcn | Namesto lastne izvedbe za |
|---|---|---|
| *Alert Dialog*, *Dialog* | da | potrditve in obrazce v dialogu (8.10, 8.11) |
| *Dropdown Menu* | da | meni dejanj, meni računa, preklop skupine (8.16) |
| *Command* / *Combobox* | da | vnos značk (8.4) |
| *Sonner* | da | obvestila (8.13) |
| *Checkbox*, *Radio Group* | neobvezno | izbira v preglednici, vloge, barve skupine |
| *Button*, *Input*, *Textarea*, *Label*, *Table*, *Separator* | neobvezno | samo kot izhodišče razredov |
| *Select* | **ne** – nativni `<select>` | razvrščanje, velikost strani |
| *Card*, *Sidebar*, *Tooltip*, *Carousel*, *Chart* | **ne** | – (kartice in stranski pas so preprosti lastni elementi; pomembne informacije niso v namigih) |

Za vsak vzorec se v funkcionalnosti 000 izbere **en** način (nativni element ali shadcn) in zabeleži v `docs/decisions/` (trenutna izbira: `2026-11-04-shadcn-ui-po-vzorcih.md`); mešanja ni.

**Obvezna prilagoditev vsake prevzete komponente** (preveri se pri pregledu kode):

1. Ikone `lucide-react` se zamenjajo s Tabler Icons (13.5).
2. Fokus: `focus-visible:ring-[3px] focus-visible:ring-ring/50` se zamenja s skupnim razredom fokusa iz 13.3 (polprosojen obroč nima zadostnega kontrasta).
3. Besedilo v poljih in gumbih je `text-base` (16 px) na vseh širinah; `md:text-sm` se odstrani.
4. Višina kontrol `h-11 pointer-coarse:h-12`; sence samo `shadow-sm/md/lg` po 6, zaobljenosti po lestvici 6 (nad `rounded-lg` nič).
5. Vsa vgrajena angleška besedila (npr. skriti »Close« v *Dialog*, »More pages« v *Pagination*) gredo prek i18n.
6. *Alert Dialog*: ob odprtju je fokus na *Prekliči*; nevarni gumb uporablja `bg-destructive`.
7. *Sonner*: `closeButton`, trajanje 5000 ms, položaj spodaj desno (pod `md` spodaj na sredini), brez `richColors` – barve iz žetonov.
8. *Skeleton*: brez `animate-pulse` (8.15).

### 13.5 Ikone in logotip

- **Ikone:** Tabler Icons (`@tabler/icons-react`, obrisne, debelina 1,75), samo kjer pomagajo: stanja (napaka, uspeh, arhiv), razvrščanje, meni dejanj, zapri. Velikost 20 px, vedno `aria-hidden="true"` ob besedilu.
- **Logotip:** besedni znak »Kontakti« / »Contacts« v `xxl`, utež 700, pred njim majhen jeziček `accent` (12 × 4 px, `radius-xs`); ločen logotip ni predviden. Ikona aplikacije je kvadrat `#1F4E8C` z belo kartico z jezičkom.

### 13.6 Zgodovina različic

- **v2 (2026-11-17, 020):** zamenjava z *Kartoteka, refined*: nove barve in sloj `raised`, lestvica zaobljenosti 4/8/12/16, sence `sm/md/lg`, tipografija (naslovi 600, `display`, `label`, `xs`), razmiki do 96 px, žetoni gibanja in velikosti, navigacija brez seznama skupin (pas + trenutna skupina + spodnja vrstica), zbirka kartic skupin z značko vloge, samostojen zaslon *Arhivirane*, kartica kontakta s trakom skupine, ilustracije in pozdravna ploskev, plavajoča vrstica izbora, lepljiva plošča podrobnosti, gostota tabel kot nastavitev računa. Poglavja 10–12 ohranjena.
- **v1.1 (2026-11-02):** prva različica *Kartoteka*.
