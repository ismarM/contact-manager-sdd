# Oblikovni jezik »Kartoteka« – Contact Manager

**Status:** v1.1 (2026-11-02) – implementacija s Tailwind CSS v4 in (neobvezno) shadcn/ui, glej 13.  
**Velja za:** celoten React frontend (namizje, tablica, mobilni telefon, nameščen PWA).  
**Povezano:** [`zahteve-raw.txt`](zahteve-raw.txt) (vir resnice za zahteve), [`RAZVOJNI-OKVIR.md`](RAZVOJNI-OKVIR.md) (potek razvoja)

> Ta dokument določa **videz in vedenje vmesnika**. *Kaj* aplikacija počne, določa `zahteve-raw.txt` (kasneje `specs/*/spec.md`). Pri navzkrižju velja `zahteve-raw.txt`. Točne poti in dostopna imena elementov določi `plan.md` posamezne funkcionalnosti; imena v tem dokumentu so izhodišče zanj.

---

## 1. Koncept

Aplikacija je urejena kot **pisarniška kartoteka**: skupina je predal, kontakt je kartica, barva skupine je jeziček na robu predala. Iz te podobe izhaja vse ostalo:

- **Papir in črnilo.** Topla svetla podlaga, bele kartice, besedilo v skoraj črni barvi, en sam poudarek v barvi modrega črnila. Brez prelivov, steklenih učinkov in okrasnih ilustracij.
- **Robovi namesto senc.** Površine ločujejo tanke črte in razlika v tonu, ne sence. Senca obstaja samo pri elementih, ki res lebdijo nad stranjo (dialog, meni).
- **Jeziček skupine.** Barva skupine se pokaže le kot ozek navpičen trak ob naslovu skupine – v stranskem pasu, v glavi skupine in na povabilu. Takoj veš, v katerem predalu si, barva pa nikoli ne nosi besedila.
- **Berljivost pred slogom.** Pisava *Atkinson Hyperlegible Next* je narejena za ljudi s slabšim vidom; dodatni atributi (`ključ=vrednost`) in časi v revizijski sledi so v pripadajoči *Mono* različici, zato so na pogled ločeni od navadnih polj.
- **Mirna gostota.** Seznam kontaktov je preglednica, ki se bere kot imenik: vrstice 48 px, poravnani stolpci, nič odvečnih ikon.

## 2. Načela

1. **Vsebina pred okvirjem.** Stalni elementi (zgornja vrstica, stranski pas) so ozki in tihi; kontakti zasedajo večino zaslona.
2. **Ena glavna akcija na zaslon.** Samo en primarni (poln) gumb na zaslonu, npr. *Nov kontakt*. Vse drugo je sekundarno ali tiho.
3. **Vedno veš, kje si.** Vidni so skupina (jeziček in naslov), tvoja vloga v njej in stanje *Arhivirano*.
4. **Pokažemo samo, kar smeš.** Akcij, ki jih vloga ali stanje skupine ne dovoljujeta, vmesnik ne izriše. To je udobje, ne varnost – pravice vedno preveri zaledje.
5. **Nič se ne zgodi potiho.** Vsak uspeh in neuspeh ima viden odziv; napaka pove, kaj narediti.
6. **Prekinemo samo, ko je vložek velik.** Blokirajoč dialog le za nevarne operacije (7.6); vse ostalo so nemoteča sporočila.
7. **Dostopno privzeto (WCAG 2.1 AA).** Komponenta brez podpore tipkovnici, bralniku zaslona in načinu vsiljenih barv ni dokončana.
8. **Mobilno enakovredno.** Na telefonu so na voljo vse funkcije, le razporejene drugače.
9. **Dvojezično.** Vsa besedila, tudi dostopna imena, so v slovenščini in angleščini prek i18n ključev.

## 3. Česa ne delamo

Vmesnik mora delovati kot skrbno narejeno orodje, ne kot generična predloga. Zato **ne uporabljamo**:

- barvnih prelivov (ozadja, gumbi, besedilo), »glassmorphism« in zameglitev ozadja;
- vijolične, indigo ali neonske poudarjene barve; več kot ene poudarjene barve;
- pisav Inter, Geist, Poppins in podobnih privzetih izbir; emojijev kot ikon;
- mehkih velikih senc pod vsako kartico, »pill« gumbov in zaobljenosti nad 8 px;
- okrasnih ilustracij, praznih »hero« površin, animiranih ozadij, iskric in svetlečih robov;
- skeletnih nalagalnikov z bleščečo animacijo;
- stalnega preklopnika teme v glavi (tema je nastavitev računa, 9.9);
- privzete Tailwind palete (`zinc`, `slate`, `indigo` …) in privzete teme shadcn/ui (sivine, Inter, Lucide, `rounded-xl`, `shadow-sm` na karticah) – obe sta v projektu odstranjeni oziroma preslikani na žetone (13).

## 4. Barve

### 4.1 Žetoni

Barve so definirane kot CSS spremenljivke z `light-dark()`; `:root` ima `color-scheme: light dark`. V Tailwindu so na voljo pod semantičnimi imeni shadcn/ui (`bg-card`, `text-muted-foreground`, `border-input` …, preslikava v 13.2); privzeta paleta Tailwind je izključena, zato komponente ne morejo uporabiti barve zunaj te tabele.

| Žeton | Svetla | Temna | Uporaba |
|---|---|---|---|
| `--k-bg` | `#F6F5F1` | `#161513` | podlaga strani (»papir«) |
| `--k-surface` | `#FFFFFF` | `#1F1E1B` | kartice, preglednica, dialogi, vnosna polja |
| `--k-sunken` | `#EEECE6` | `#2A2925` | glava preglednice, vrstica ob prehodu, značke |
| `--k-text` | `#1C1B19` | `#ECEAE5` | osnovno besedilo |
| `--k-muted` | `#5C5850` | `#A8A399` | pomožno besedilo, metapodatki |
| `--k-border` | `#86817A` | `#7C776E` | robovi kontrol (polja, potrditvena polja, sekundarni gumbi) |
| `--k-divider` | `#E0DDD5` | `#34322E` | ločilne črte med vrsticami in razdelki (dekorativne) |
| `--k-accent` | `#1F4E8C` | `#8FB5F0` | primarni gumbi, povezave, fokus, izbrano |
| `--k-accent-hover` | `#173D6E` | `#B0CBF5` | primarni gumb ob prehodu/pritisku |
| `--k-on-accent` | `#FFFFFF` | `#0F203A` | besedilo na `accent` |
| `--k-accent-soft` | `#E5ECF6` | `#1D2B41` | ozadje izbrane vrstice, aktivni zavihek |
| `--k-danger` / `-soft` | `#A12A1D` / `#FAE9E6` | `#F08A7B` / `#3A1F1B` | brisanje, napake |
| `--k-success` / `-soft` | `#2B6A39` / `#E6F1E8` | `#80C390` / `#1C3123` | uspeh |
| `--k-warning` / `-soft` | `#7A5800` / `#FAF0D7` | `#E0B64E` / `#352B12` | arhivirano, konflikt verzij |

**Preverjeni kontrasti** (WCAG 2.x, vsi pari v obeh načinih):

| Par | Najnižje razmerje (svetla / temna) | Zahteva |
|---|---|---|
| `text` na `bg`, `surface`, `sunken`, `accent-soft` | 14,5 / 11,9 | 4,5 : 1 |
| `muted` na `bg`, `surface`, `sunken` | 6,0 / 5,8 | 4,5 : 1 |
| `accent` na `bg`, `surface`, `accent-soft` | 7,0 / 6,8 | 4,5 : 1 |
| `on-accent` na `accent` / `accent-hover` | 8,3 / 7,8 | 4,5 : 1 |
| `danger`, `success`, `warning` na `surface` in svoji `-soft` | 5,6 / 6,2 | 4,5 : 1 |
| `border` na `bg`, `surface` | 3,5 / 3,8 | 3 : 1 (meje kontrol) |

`divider` je namenoma nizkega kontrasta, ker ne označuje meje kontrole; meja kontrole je vedno `border`.

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

- Barva skupine je **samo jeziček**: navpičen trak širine 4 px ob naslovu skupine. Nikoli ozadje besedila, nikoli barva besedila, nikoli edini nosilec pomena (ob traku je vedno naslov skupine).
- Izbira barve je skupina izbirnih gumbov (`radio`): vzorec 24 × 24 px z imenom barve ob njem.

### 4.3 Barvne sheme in vsiljene barve

- Privzeto sledimo nastavitvi sistema (`color-scheme: light dark`, brez atributa na `<html>`). Uporabnik lahko v *Mojem računu* izbere *Sistemska*, *Svetla* ali *Temna*. *Svetla* in *Temna* se shranita v `localStorage` in se uveljavita kot `data-theme="light|dark"` na `<html>` (ta nastavi `color-scheme`), *Sistemska* zapis izbriše. Atribut nastavi majhen vrinjen skript v `<head>`, da ni bliska napačne teme; brez JavaScripta stran še vedno sledi sistemu.
- Tailwindova različica `dark:` je vezana na isto pravilo (13.3), zato se ujema z žetoni.
- **Način vsiljenih barv** (`forced-colors: active`): vse meje so prave obrobe (`border`, `outline`), nikoli samo `box-shadow` ali ozadje. Izbrana vrstica dobi obrobo `Highlight`, fokus `outline` v `Highlight`. Jeziček skupine ostane viden z `forced-color-adjust: none`, ker je barva tam podatek, ki ga je izbral uporabnik (ime barve je vedno tudi v besedilu).

## 5. Tipografija

- **Pisava:** *Atkinson Hyperlegible Next* (spremenljiva, uteži 400 in 700) za vse besedilo; *Atkinson Hyperlegible Mono* (400) za ključe in vrednosti dodatnih atributov, čase in tehnične vrednosti v revizijski sledi. Obe pod licenco SIL OFL, podpirata šumnike.
- Pisavi sta **gostovani lokalno** (WOFF2, podnabora latin in latin-ext, npr. prek Fontsource), ne prek Google Fonts CDN – zaradi zasebnosti (GDPR) in zato, da sta del predpomnjenega ogrodja PWA.
- `font-display: swap`; nadomestni sklad `system-ui, "Segoe UI", Roboto, sans-serif` z `font-size-adjust: from-font`, da zamenjava pisave ne premakne postavitve.
- Številke v preglednicah, paginaciji in števcih so tabelarne (`font-variant-numeric: tabular-nums`).

| Žeton | Velikost / višina vrstice | Uporaba |
|---|---|---|
| `--k-font-sm` | 0,875 rem / 1,45 | metapodatki, značke, oznake vlog, pomoč pod poljem |
| `--k-font-md` | 1 rem / 1,5 | osnovno besedilo, vnosna polja, gumbi |
| `--k-font-lg` | 1,25 rem / 1,35 | naslovi razdelkov, naslov dialoga |
| `--k-font-xl` | 1,5 rem / 1,25 | naslov strani (ime skupine, ime kontakta) |
| `--k-font-xxl` | 2 rem / 1,2 | samo besedni znak na strani za prijavo |

- Uteži samo 400 in 700. Brez velikih tiskanih črk z razmikom kot okrasa; vse oznake so v običajni stavčni obliki.
- Besedilo daljše od enega stavka ima največjo širino 70 znakov (`max-inline-size: 70ch`).
- Vnosna polja imajo vedno vsaj 16 px, da mobilni brskalnik ne povečuje strani.

## 6. Prostor, oblike, sence, gibanje

- **Razmiki:** lestvica s korakom 4 px – `--k-space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48. Razmik med oznako in poljem (4 px) je manjši od razmika med polji (24 px).
- **Zaobljenost:** `--k-radius-sm` 4 px (gumbi, polja, značke), `--k-radius-md` 6 px (kartice, dialogi, meniji). Nič bolj okroglega.
- **Robovi:** 1 px `--k-border` za kontrole, 1 px `--k-divider` med vrsticami in razdelki.
- **Sence:** ena sama, `--k-shadow-float: 0 8px 24px rgb(0 0 0 / 0.16)`, samo za dialoge, menije in obvestila. Vedno skupaj z robom, ki ostane viden v načinu vsiljenih barv. V temnem načinu lebdeči elementi dobijo še svetlejšo površino `--k-sunken`.
- **Gibanje:** 120–160 ms, `ease-out`, samo prozornost in rahel premik (do 8 px). Dialog in obvestila se pojavijo z rahlim zbledenjem. Ob `prefers-reduced-motion: reduce` gibanja ni.
- **Velikost ciljev:** vse interaktivne kontrole imajo vsaj 44 × 44 px; ob `pointer: coarse` 48 px. (WCAG 2.1 AA tega ne zahteva – 2.5.5 je raven AAA; ciljava nanj zaradi mobilne uporabe.)

## 7. Postavitev

### 7.1 Ogrodje aplikacije

```
┌──────────────────────────────────────────────────────────────┐
│ ▌Kontakti    [▌Projekt FERI ▾]            Povabila (2)  [PK ▾]│  zgornja vrstica, 56 px
├──────────────┬───────────────────────────────────────────────┤
│ Skupine      │ ▌Projekt FERI   Lastnik                       │  glava skupine
│              │ Kontakti · Dvojniki · Revizijska sled · Nast. │  zavihki skupine
│ Lastnik      │───────────────────────────────────────────────│
│ ▌Projekt FERI│ [Iskanje…]  [Filtri (2)]  [Razvrsti ▾]  [Nov kontakt]
│ Admin        │ ┌──┬───────────────┬──────────────┬──────────┐│
│ ▌Podjetje ABC│ │☐ │ Ime in priimek │ E-naslov     │ Značke   ││
│ Bralec       │ ├──┼───────────────┼──────────────┼──────────┤│
│ ▌Konferenca  │ │☐ │ Janez Novak    │ janez@…      │ vip      ││
│              │ └──┴───────────────┴──────────────┴──────────┘│
│ Arhivirane   │           1–25 od 312   ‹ Prejšnja  Naslednja ›│
│ [Nova skupina]│                                               │
└──────────────┴───────────────────────────────────────────────┘
```

- **Zgornja vrstica** (56 px, ena vrstica, pod 12 % višine zaslona): besedni znak *Kontakti* z jezičkom v barvi `accent`, gumb za preklop skupine (pod 1024 px), *Povabila* s številom novih, meni računa (začetnici uporabnika; vsebuje *Moj račun*, jezik, *Odjava*). Pri drsenju navzdol se na telefonu skrije in pri drsenju navzgor vrne; ko vsebuje fokus, ostane vidna.
- **Stranski pas** (od 1024 px, širina 256 px): skupine, razvrščene po vlogi (*Lastnik*, *Admin*, *Urednik*, *Bralec* – razdelek brez skupin se ne izriše), povezava *Arhivirane skupine*, gumb *Nova skupina*. Trenutna skupina ima `aria-current="page"` in ozadje `accent-soft`.
- **Glava skupine:** jeziček, naslov skupine, oznaka vloge, oznaka *Arhivirano* (če velja) in vrstica zavihkov skupine (`nav` s povezavami, ne ARIA zavihki, ker vsak vodi na svojo pot). Zavihek *Dvojniki* vidijo samo urednik in višje, v arhivirani skupini ga ni. Zavihek *Nastavitve* vidijo vsi člani (tam so tudi *Zapusti skupino* in seznam članov); urejanje v njem je omejeno po vlogi.

### 7.2 Prelomne točke

| Širina | Postavitev |
|---|---|
| < 768 px (od 320 px) | brez stranskega pasu; skupino izbereš na zaslonu *Skupine* ali z gumbom v zgornji vrstici (meni s seznamom); zavihki skupine so vodoravno drsna vrstica; primarna akcija je gumb v glavi seznama; podrobnosti kontakta, obrazci in primerjava dvojnikov so ločene strani čez cel zaslon |
| 768–1023 px | kot zgoraj, a s širšimi robovi; preglednica kontaktov, če je vsebnik širok vsaj 640 px |
| 1024–1279 px | stalni stranski pas; podrobnosti kontakta so ločena stran |
| ≥ 1280 px | stranski pas + seznam + **panel podrobnosti** (400 px) desno od seznama; izbrani kontakt je v naslovu poti, zato ostane ob osvežitvi |

- Brez vodoravnega drsenja strani pri 320 px in pri povečavi 400 % (WCAG 1.4.10).
- **Preglednica ↔ kartice** se preklaplja z **vsebniško poizvedbo** (`@container`, prag 640 px širine seznama), ne s širino zaslona, ker je ista komponenta lahko v ozkem panelu ali čez cel zaslon.
- Upoštevamo varna območja (`env(safe-area-inset-*)`) za nameščen PWA.
- E2E testi preverjajo postavitev pri 360, 768 in 1280 px.

## 8. Komponente

### 8.1 Gumbi

| Vrsta | Videz | Uporaba |
|---|---|---|
| Primarni | poln `accent`, besedilo `on-accent` | ena glavna akcija zaslona |
| Sekundarni | `surface`, rob `border`, besedilo `text` | ostale akcije |
| Tihi | brez roba in ozadja, besedilo `accent`; ob prehodu `sunken` | akcije v vrsticah, *Prekliči* |
| Nevarni | poln `danger`, besedilo `on-accent` (temna: `#1C0A07`) | samo potrditveni gumb v dialogu nevarne operacije |

- Višina 44 px (48 px na dotik), vodoravni odmik 16 px, zaobljenost 4 px, utež 700.
- Besedilo je glagol z objektom, kjer je to potrebno: »Shrani kontakt«, »Izvozi v Excel«, »Izbriši skupino«.
- Ikona brez besedila samo v vrstici preglednice in vedno z dostopnim imenom (npr. »Dejanja za Janez Novak«).
- Med pošiljanjem gumb ostane na mestu, pokaže »Shranjujem…« in ne sprejme drugega klika. Pred pošiljanjem gumb **ni onemogočen** – napake se pokažejo ob poljih.

### 8.2 Vnosna polja in obrazci

- Oznaka vedno vidna nad poljem (ne samo `placeholder`); pomoč pod oznako, napaka pod poljem; povezani z `aria-describedby`.
- Polje: višina 44 px, `surface`, rob 1 px `border`; ob fokusu obroba fokusa (8.12); ob napaki rob 2 px `danger` in ikona z besedilom.
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

### 8.4 Značke

- Pravokotna oznaka: `sunken`, besedilo `text` velikosti `sm`, zaobljenost 4 px, brez barv – značke so oznake, ne kategorije barv.
- V obrazcu je vnos značk **kombinirano polje** (`role="combobox"`; shadcn *Combobox*/*Command* ali `useComboBox` iz React Aria, 13.4) s predlogi obstoječih značk skupine; *Enter* ali vejica doda značko. Dodane značke so pod poljem, vsaka z gumbom »Odstrani značko ‹ime›«.
- V preglednici so vidne največ tri značke in »+N«; vse so v podrobnostih.

### 8.5 Oznake vlog in stanj

- **Vloga:** besedilna oznaka z robom `border` in besedilom `muted` (»Lastnik«, »Admin«, »Urednik«, »Bralec«), nikoli samo barva ali ikona.
- **Arhivirano:** oznaka `warning-soft` z besedilom `warning` in ikono arhiva.
- **Izbrisan uporabnik:** povsod, kjer bi bilo ime izbrisanega uporabnika (revizijska sled, lastnik arhivirane skupine, povabila, člani), piše »izbrisan uporabnik« v ležečem `muted` besedilu, brez povezave.

### 8.6 Preglednica kontaktov

- Semantični `<table>` z `<caption>` (vizualno skrit, npr. »Kontakti skupine Projekt FERI«), `<th scope="col">` in imenom kontakta kot `<th scope="row">`. Ovojnica ima `role="region"`, dostopno ime in `tabindex="0"`, glava preglednice je lepljiva (`position: sticky`).
- Stolpci: izbira, *Ime in priimek* (povezava na kontakt), *E-naslov*, *Telefon*, *Značke*, meni dejanj vrstice. Dodatnih stolpcev ni; dodatni atributi so v podrobnostih in v filtrih.
- Vrstica 48 px, ločilo `divider`; ob prehodu `sunken`; izbrana vrstica `accent-soft` in obkljukano polje (stanje nikoli samo z barvo). Povezava na kontakt je ime, ne celotna vrstica, zato ostanejo izbira in meni ločena cilja.
- Glava stolpca, po katerem je mogoče razvrščati, vsebuje gumb; `aria-sort` na `<th>` in puščica pokažeta smer. Ponoven klik obrne smer.
- **Pod 640 px vsebnika** se vrstice zložijo v kartice: ime je glava kartice, ostala polja dobijo oznake (»E-naslov:«) prek `::before`, glava preglednice se skrije (`display: none`). Izbira in meni ostaneta v glavi kartice.

### 8.7 Iskanje, filtri, razvrščanje

- Iskalno polje (`type="search"`, oznaka »Iskanje po kontaktih«) išče po predefiniranih atributih; rezultati se osvežijo 300 ms po zadnjem pritisku tipke, število zadetkov se sporoči bralniku (»Najdenih 18 kontaktov«).
- Gumb *Filtri (N)* odpre razkrivni panel pod orodno vrstico (ne modalno okno):
  - *Atribut* – izbira polja (ime, priimek, naslov, e-naslov, telefon ali dodatni ključ, ki obstaja v skupini) in vrednost; več pogojev je mogoče dodati;
  - *Značke* – potrditvena polja vseh značk skupine;
  - *Uporabi filtre* in *Počisti filtre*.
- Uporabljeni filtri so nad preglednico kot odstranljive oznake (»Značka: konferenca2025 ✕«, dostopno ime »Odstrani filter Značka: konferenca2025«).
- *Razvrsti* je izbirni seznam polj in gumb za smer (»Naraščajoče« / »Padajoče«) – nujno na telefonu, kjer glav stolpcev ni.
- Iskanje, filtri, razvrstitev in stran so v poizvedbi naslova (URL), zato delujejo *Nazaj*, osvežitev in deljenje povezave.

### 8.8 Akcijska vrstica izbora in množično urejanje

- Ob izboru vsaj enega kontakta orodno vrstico nad preglednico zamenja akcijska vrstica: »Izbranih: N« (`aria-live="polite"`), *Izberi vse zadetke (312)*, *Uredi izbrane*, *Izvozi v Excel*, *Izbriši*, *Počisti izbor*. Na telefonu je vrstica prilepljena na spodnji rob.
- Bralec in vsi člani arhivirane skupine vidijo le *Izvozi v Excel* in *Počisti izbor*.
- *Uredi izbrane* odpre dialog: *Dodaj značke*, *Odstrani značke*, *Nastavi atribut* (ključ in vrednost; prazna vrednost atribut odstrani). Gumb »Uporabi za N kontaktov«. Po uspehu obvestilo »Posodobljenih N kontaktov.«

### 8.9 Paginacija

- Pod seznamom: »1–25 od 312«, *Prejšnja*, »Stran 2 od 13«, *Naslednja*, izbira velikosti strani (25, 50, 100). Vse v `nav` z dostopnim imenom »Strani rezultatov«.
- Ob menjavi strani se fokus premakne na naslov seznama in seznam se pomakne na vrh. Izbor kontaktov se ohrani čez strani.

### 8.10 Dialog

- Nativni `<dialog>` odprt s `showModal()` **ali** shadcn *Dialog* / *Alert Dialog* – v celotni aplikaciji samo en način (13.4). Naslov je `h2`, povezan z dostopnim imenom dialoga. Pri nativnem dialogu brez `role="dialog"`, `aria-modal` in lastne ujetosti fokusa – to zagotovi brskalnik, prav tako vrnitev fokusa na sprožilni gumb; pri shadcn to zagotovi komponenta.
- `surface`, rob `border`, zaobljenost 6 px, senca `float`, ozadje `rgb(0 0 0 / 0.4)` brez zameglitve. Največja širina 480 px (obrazci 560 px); na telefonu čez celo širino z odmikom 16 px.
- Zapiranje z *Esc* in gumbom *Prekliči*; klik ob dialog zapre samo informativne dialoge, nikoli obrazca z neshranjenimi spremembami.
- Drsenje v dialogu ne drsi strani pod njim (`overscroll-behavior: contain` na dialogu in ozadju).

### 8.11 Potrditveni dialog za nevarne operacije

Obvezen za: izbris kontakta (tudi množični), združevanje, rollback, odstranitev člana, spremembo vloge, zapuščanje skupine, arhiviranje, prenos lastništva, izbris skupine in izbris računa.

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

- **Uspeh:** obvestilo spodaj desno (na telefonu spodaj na sredini, nad akcijsko vrstico): ikona kljukice, kratko besedilo, gumb »Zapri obvestilo«. Izvedeno kot `popover="manual"` z `role="status"` ali s shadcn *Sonner* (z gumbom za zapiranje, 13.4); izgine po 5 s, ne pa, dokler je nad njim miška ali fokus. Več obvestil se zloži eno nad drugo.
- Obvestilo z razveljavitvijo se ne uporablja – za razveljavitev obstaja rollback v revizijski sledi.
- **Napaka akcije** (npr. strežnik zavrne zahtevo): sporočilo ostane na mestu akcije nad obrazcem ali seznamom (`role="alert"`, ozadje `danger-soft`, rob na levi 4 px `danger`, ikona in besedilo), z gumbom *Poskusi znova*, kjer je smiselno. Napaka nikoli ni samo obvestilo, ki izgine.
- **Opozorilo stanja** (arhivirano, brez povezave, konflikt): enak vzorec v `warning`.

### 8.14 Konflikt verzij

Ob sočasni spremembi (optimistično zaklepanje) obrazec ostane odprt z vnesenimi podatki, nad njim pa opozorilo: »Kontakt je medtem spremenil(a) ‹ime› ob 14.32.« Možnosti:

- *Prikaži razlike* – razkrije preglednico *Polje · Tvoja vrednost · Trenutna vrednost*;
- *Uporabi trenutno različico* – zavrže tvoje spremembe in naloži trenutno stanje;
- *Shrani moje spremembe* – ponovno pošlje tvoje vrednosti nad trenutno različico.

Nič se ne prepiše tiho. Enak vzorec velja za sočasne spremembe članov (npr. vloga je bila medtem spremenjena).

### 8.15 Prazna stanja, nalaganje, brez povezave

- **Prazno stanje:** naslov in en stavek, zakaj je prazno, ter naslednji korak, ki ga uporabnik sme narediti (»Ta skupina še nima kontaktov.« + *Nov kontakt*; bralec dobi samo razlago). Za prazen zadetek iskanja: »Ni kontaktov, ki ustrezajo filtrom.« + *Počisti filtre*. Brez ilustracij.
- **Nalaganje:** seznam obdrži prejšnjo vsebino z oznako »Nalagam…« in `aria-busy="true"`; ob prvem nalaganju so vrstice mirni sivi nadomestki brez bleščanja. Nalagalnik se pokaže šele po 300 ms, da hitri odgovori ne utripajo.
- **Brez povezave (PWA):** pasica pod zgornjo vrstico »Ni povezave – podatki niso na voljo.« Akcije, ki potrebujejo strežnik, ostanejo vidne, ob kliku pa pojasnijo, zakaj ne delujejo. Podatki kontaktov se ne predpomnijo.

### 8.16 Meniji

- Meni dejanj vrstice, meni računa in preklop skupine so gumb s `popover` ali shadcn *Dropdown Menu* (13.4). Elementi menija so gumbi ali povezave; zapiranje z *Esc* in klikom drugam, fokus se vrne na gumb. Puščice premikajo fokus med elementi.
- Meni se ob robu zaslona obrne navzgor ali v levo, da se ne odreže.

## 9. Zasloni

Vsak zaslon ima svojo pot in naslov strani (`<title>`: »‹Zaslon› – ‹skupina› – Kontakti«).

### 9.1 Prijava

Na sredini »papirja« bela kartica (največ 400 px): besedni znak *Kontakti* (`xxl`), stavek »Kontakti tvojih projektov in podjetij, na enem mestu.«, gumb **»Prijava z Googlom«** po Googlovih smernicah za gumb za prijavo (bel gumb z logotipom G). Pod kartico preklop jezika *Slovenščina · English*. Ob neuspešni prijavi sporočilo napake v kartici. Registracija se zgodi ob prvi prijavi; gesel aplikacija nima.

### 9.2 Skupine

- Naslov »Skupine« in primarna akcija *Nova skupina*.
- Skupine v razdelkih po vlogi (*Lastnik*, *Admin*, *Urednik*, *Bralec*), vsak razdelek ima naslov `h2` in število. Skupina je vrstica: jeziček, naslov, opis (ena vrstica, skrajšan), število kontaktov.
- Povezava *Arhivirane skupine* vodi na enak seznam arhiviranih skupin z oznako *Arhivirano*; trajno arhivirane skupine imajo opombo »lastnik: izbrisan uporabnik«.
- *Nova skupina* odpre dialog: *Naslov* (obvezno), *Opis*, *Barva* (8 vzorcev, 4.2), *Ustvari skupino*. Po uspehu odpre novo skupino.

### 9.3 Kontakti skupine (glavni zaslon)

Glava skupine (7.1), orodna vrstica (*Iskanje*, *Filtri*, *Razvrsti*, *Nov kontakt*), uporabljeni filtri, preglednica (8.6), paginacija (8.9). Na ≥ 1280 px desno panel podrobnosti izbranega kontakta.

### 9.4 Kontakt – pogled in urejanje

- **Pogled:** naslov je ime in priimek (`xl`); seznam opredelitev *Naslov*, *E-naslov* (povezava `mailto:`), *Telefon* (povezava `tel:`); razdelek *Dodatni atributi* (Mono); razdelek *Značke*; povezava »Spremembe tega kontakta v revizijski sledi«. Akcije: *Uredi kontakt* (primarna), *Izbriši kontakt* (tiha, v `danger`).
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
3. **Povabi člana** (admin in višje) – *E-naslov* registriranega uporabnika in *Vloga* (izbirni gumbi samo vlog, nižjih od lastne), *Pošlji povabilo*. Če uporabnik ne obstaja, napaka ob polju.
4. **Upravljanje skupine** – ločeno z zgornjim robom; vsaka akcija ima en stavek razlage:
   - *Prenesi lastništvo* (lastnik; izbira člana; ti postaneš admin);
   - *Arhiviraj skupino* / *Odarhiviraj skupino* (lastnik);
   - *Zapusti skupino* (vsi razen lastnika; v trajno arhivirani skupini ne zadnji član);
   - *Izbriši skupino* (le edini član).

   Akcija, ki trenutno ni mogoča, ni izrisana; namesto nje je razlaga (npr. »Skupino lahko izbrišeš, ko si njen edini član.«).

### 9.8 Povabila

Seznam prejetih povabil: jeziček in naslov skupine, kdo vabi, ponujena vloga, datum. Akciji *Sprejmi povabilo* (primarna) in *Zavrni* (sekundarna, s potrditvijo). Po sprejetju obvestilo s povezavo »Odpri skupino«. Prazno stanje: »Nimaš novih povabil.«

### 9.9 Moj račun

1. **Profil** – ime in e-naslov iz Google računa (samo za branje).
2. **Videz** – *Jezik*: izbirna gumba *Slovenščina*, *English*; *Tema*: *Sistemska*, *Svetla*, *Temna*.
3. **Moji podatki** – razlaga, kaj izvoz vsebuje (članstva, povabila, osebni podatki, skupine v lasti), gumb *Prenesi moje podatke (JSON)*.
4. **Izbris računa** – razlaga posledic (podatki in povabila se izbrišejo; v arhiviranih skupinah in revizijskih sledeh bo prikazan »izbrisan uporabnik«; arhivirane skupine, v katerih si edini član, se izbrišejo). Če je uporabnik lastnik vsaj ene nearhivirane skupine, je namesto gumba seznam teh skupin s povezavami in navodilom »Prenesi lastništvo ali arhiviraj te skupine«. Sicer *Izbriši račun* s potrditvijo z vpisom e-naslova.
5. *Odjava*.

### 9.10 Stran ne obstaja

Naslov »Te strani ni«, stavek »Povezava je napačna ali pa stran ni več na voljo.«, povezava *Na seznam skupin*. Enaka stran se prikaže za skupino ali kontakt, do katerega uporabnik nima dostopa (strežnik vrne 404 in ne razkrije obstoja).

### 9.11 Arhivirana skupina

Vsi zasloni skupine so na voljo samo za branje. Pod glavo skupine je pasica (`warning-soft`, ikona arhiva):

- »Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.« + *Odarhiviraj skupino* (samo lastnik);
- pri trajno arhivirani skupini: »Skupina je trajno arhivirana, ker lastnik nima več računa.«

Akcije spreminjanja se ne izrišejo; v *Nastavitvah* ostaneta *Zapusti skupino* in *Izbriši skupino*, kjer ju pravila dovoljujejo.

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
- [ ] Vsak element, na katerega se sklicuje test, ima dostopno ime iz tabele v `plan.md` (testi iščejo samo po vlogah in dostopnih imenih).
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
- `display`: `standalone`; `background_color` = `#F6F5F1`; `theme_color` = `#1F4E8C`.
- Ikona: kvadrat v `accent` z belo stilizirano kartico z jezičkom; 192 px, 512 px in *maskable* različica. Brez prelivov in senc.
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
| `--k-surface` | `card`, `popover`, `secondary` | `bg-card` |
| `--k-sunken` | `muted`, `accent`, `sidebar-accent` | `bg-muted`, `hover:bg-accent` |
| `--k-text` | `foreground` in vsi `*-foreground` razen spodnjih | `text-foreground` |
| `--k-muted` | `muted-foreground` | `text-muted-foreground` |
| `--k-border` | `input` | `border-input` (meje kontrol, 3 : 1) |
| `--k-divider` | `border`, `sidebar-border` | `border-border` (ločila) |
| `--k-accent` | `primary`, `ring`, `sidebar-primary`, `sidebar-ring` | `bg-primary`, `outline-ring` |
| `--k-accent-hover` | `primary-hover` *(novo)* | `hover:bg-primary-hover` |
| `--k-on-accent` | `primary-foreground`, `sidebar-primary-foreground` | `text-primary-foreground` |
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
  --k-bg: light-dark(#F6F5F1, #161513);
  --k-surface: light-dark(#FFFFFF, #1F1E1B);
  /* … vsi žetoni iz 4.1 in 4.2 … */

  /* aliasi shadcn/ui – blok .dark, ki ga ustvari shadcn init, se izbriše */
  --background: var(--k-bg);
  --card: var(--k-surface);
  --primary: var(--k-accent);
  --input: var(--k-border);
  --border: var(--k-divider);
  --ring: var(--k-accent);
  --radius: 0.375rem;
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
  --shadow-float: 0 8px 24px rgb(0 0 0 / 0.16);
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
  --radius-sm: 4px;  --radius-md: 4px;  --radius-lg: 6px;
  --radius-xl: 6px;  --radius-2xl: 6px; /* nič bolj okroglega od 6 px */
}
```

- Lestvica razmikov ostane privzeta (`--spacing: 0.25rem` = korak 4 px iz 6).
- Prelomne točke ostanejo privzete in se ujemajo s 7.2: `md` 48 rem (768 px), `lg` 64 rem (1024 px), `xl` 80 rem (1280 px); `2xl` se ne uporablja.
- `rounded-full` je dovoljen samo za izbirne gumbe (`radio`), ne za gumbe in značke.

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

Za vsak vzorec se v funkcionalnosti 000 izbere **en** način (nativni element ali shadcn) in zabeleži v `DECISIONS.md`; mešanja ni.

**Obvezna prilagoditev vsake prevzete komponente** (preveri se pri pregledu kode):

1. Ikone `lucide-react` se zamenjajo s Tabler Icons (13.5).
2. Fokus: `focus-visible:ring-[3px] focus-visible:ring-ring/50` se zamenja s skupnim razredom fokusa iz 13.3 (polprosojen obroč nima zadostnega kontrasta).
3. Besedilo v poljih in gumbih je `text-base` (16 px) na vseh širinah; `md:text-sm` se odstrani.
4. Višina kontrol `h-11 pointer-coarse:h-12`; odstranijo se `shadow-*` in zaobljenosti nad `rounded-lg`.
5. Vsa vgrajena angleška besedila (npr. skriti »Close« v *Dialog*, »More pages« v *Pagination*) gredo prek i18n.
6. *Alert Dialog*: ob odprtju je fokus na *Prekliči*; nevarni gumb uporablja `bg-destructive`.
7. *Sonner*: `closeButton`, trajanje 5000 ms, položaj spodaj desno (pod `md` spodaj na sredini), brez `richColors` – barve iz žetonov.
8. *Skeleton*: brez `animate-pulse` (8.15).

### 13.5 Ikone in logotip

- **Ikone:** Tabler Icons (`@tabler/icons-react`, obrisne, debelina 1,75), samo kjer pomagajo: stanja (napaka, uspeh, arhiv), razvrščanje, meni dejanj, zapri. Velikost 20 px, vedno `aria-hidden="true"` ob besedilu.
- **Logotip:** besedni znak »Kontakti« v Atkinson Hyperlegible Next 700 z jezičkom v `primary`; ločen logotip ni predviden.
