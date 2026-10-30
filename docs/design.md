# Oblikovni jezik »Jasno« – Contact Manager

**Status:** Osnutek v0.1 (2026-10-30) – izhodišče, ki ga bova dopolnjevala.  
**Velja za:** celoten React frontend (namizje, tablica, mobilni telefon, nameščen PWA).  
**Povezano:** [`project-brief.md`](project-brief.md) §3.4

Ime »Jasno« povzema cilj: vmesnik naj bo **jasen na prvi pogled** – manj gumbov, manj odločitev, nič skritega. Konkurenčna prednost pred CRM sistemi je enostavnost, zato je vsak element utemeljen z vprašanjem »ali uporabnik to res potrebuje tukaj?«.

---

## 1. Načela

1. **Vsebina pred okrasjem.** Kontakti so v ospredju; okvirji, sence in barve služijo le orientaciji.
2. **Ena glavna akcija na zaslon.** Vsak zaslon ima en jasno poudarjen primarni gumb (npr. *Nov kontakt*). Ostale akcije so sekundarne.
3. **Vedno veš, kje si.** Trenutna skupina in tvoja vloga v njej (OWNER/MEMBER) sta vedno vidni.
4. **Nič se ne zgodi potiho.** Vsaka sprememba ima povratno informacijo (toast, stanje gumba); konflikti verzij in napake so razloženi z rešitvijo, ne s kodo napake.
5. **Varno brisanje in združevanje.** Nepovratne ali obsežne akcije zahtevajo potrditev, ki pove posledice.
6. **Dostopno privzeto.** Dostopnost (WCAG 2.2 AA) ni dodatek; komponenta brez podpore tipkovnici in bralniku zaslona ni dokončana.
7. **Mobilno enakovredno.** Na telefonu so na voljo vse funkcije, le razporejene drugače.

## 2. Design tokeni

Tokeni so definirani kot CSS spremenljivke (`--cm-*`). Komponente ne uporabljajo neposrednih barv ali velikosti.

### 2.1 Barve

Kontrastna razmerja so preverjena (WCAG 2.x formula) na ozadju `bg` / `surface`.

| Token | Svetli način | Temni način | Uporaba | Kontrast (svetli / temni, na `bg`) |
|---|---|---|---|---|
| `--cm-bg` | `#FFFFFF` | `#111318` | ozadje strani | – |
| `--cm-surface` | `#F5F7FA` | `#1A1E25` | kartice, stranski pas, vrstice ob prehodu | – |
| `--cm-text` | `#16191F` | `#E7E9ED` | osnovno besedilo | 17,6 / 15,3 |
| `--cm-text-muted` | `#566070` | `#A4ADBB` | pomožno besedilo, oznake | 6,4 / 8,2 |
| `--cm-border` | `#7D8796` | `#6B7484` | robovi vnosnih polj in kontrol | 3,6 / 3,9 |
| `--cm-divider` | `#DCE1E8` | `#2C323C` | ločilne črte (dekorativne) | – |
| `--cm-primary` | `#1D5BB8` | `#86B4FF` | primarni gumbi, povezave, fokus | 6,5 / 8,8 |
| `--cm-on-primary` | `#FFFFFF` | `#0A1528` | besedilo na primarni barvi | 6,5 / 8,7 |
| `--cm-danger` | `#B3261E` | `#FF8F87` | brisanje, napake | 6,5 / 8,4 |
| `--cm-success` | `#1B7340` | `#6CD39A` | uspešne akcije | 5,9 / 10,1 |
| `--cm-warning` | `#8A5300` | `#F0BE55` | konflikt verzij, opozorila | 6,3 / 10,8 |
| `--cm-tag-bg` | `#E7EEF9` | `#1F3354` | ozadje značke | – |
| `--cm-tag-text` | `#163F7D` | `#C9DCFF` | besedilo značke | 8,8 / 9,1 (na `tag-bg`) |

Pravila:
- Barva **nikoli ni edini nosilec pomena** (napaka ima ikono in besedilo, izbrana vrstica ima kljukico).
- Temni način sledi `prefers-color-scheme`; uporabnik ga lahko ročno preklopi.
- `theme_color` v PWA manifestu = `--cm-primary` (svetli način).

### 2.2 Tipografija

- **Pisava:** sistemski sklad – `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (hitro, brez prenosa, dobra podpora šumnikom).
- **Velikosti** (v `rem`, osnova 16 px; uporabnik lahko poveča do 200 %):

| Token | Velikost | Uporaba |
|---|---|---|
| `--cm-font-xs` | 0,75 rem | števci, metapodatki (redko) |
| `--cm-font-sm` | 0,875 rem | pomožno besedilo, značke |
| `--cm-font-md` | 1 rem | osnovno besedilo, vnosna polja |
| `--cm-font-lg` | 1,25 rem | naslovi razdelkov |
| `--cm-font-xl` | 1,5 rem | naslov strani |

- Višina vrstice 1,5 za besedilo, 1,25 za naslove. Teža samo 400 in 600.
- Vnosna polja imajo na mobilnih napravah najmanj 16 px, da brskalnik ne povečuje strani.

### 2.3 Razmiki, robovi, sence

- **Razmiki:** lestvica s korakom 4 px – `--cm-space-1` (4) … `--cm-space-2` (8), `-3` (12), `-4` (16), `-6` (24), `-8` (32).
- **Zaobljenost:** `--cm-radius-sm` 6 px (vnosna polja, gumbi), `--cm-radius-md` 10 px (kartice, dialogi), `--cm-radius-full` (značke).
- **Sence:** samo dve – `--cm-shadow-1` (kartice ob prehodu), `--cm-shadow-2` (dialogi, meniji). V temnem načinu namesto senc svetlejša površina.

### 2.4 Gibanje

- Trajanje 150–200 ms, `ease-out`. Animiramo samo prozornost in premik, nikoli postavitve.
- Ob `prefers-reduced-motion: reduce` so animacije izklopljene.

## 3. Postavitev in odzivnost

| Prelomna točka | Širina | Postavitev |
|---|---|---|
| `sm` | < 640 px (od 320 px) | ena kolona; zgornja vrstica z izbiro skupine; seznam kartic; primarna akcija kot plavajoči gumb spodaj desno; obrazci in podrobnosti čez cel zaslon |
| `md` | 640–1023 px | ena kolona s širšimi karticami ali kompaktno preglednico; podrobnosti kot spodnji/stranski panel |
| `lg` | ≥ 1024 px | stranski pas (skupine) + preglednica kontaktov + panel s podrobnostmi kontakta na desni |

- Brez vodoravnega drsenja strani pri 320 px (WCAG 1.4.10 Reflow). Preglednica se pod `md` spremeni v seznam kartic.
- Upoštevamo varna območja (`env(safe-area-inset-*)`) za nameščen PWA na telefonih z zarezo.
- **Cilji za dotik:** najmanj 44 × 44 px na dotik (WCAG zahteva 24 × 24; midva ciljava na 44).

### Osnovni zasloni

1. **Prijava / registracija** – en stolpec, sredinsko, povezava za ponastavitev gesla.
2. **Seznam kontaktov** (glavni zaslon) – iskalno polje, filter po značkah, izbor s potrditvenimi polji, akcijska vrstica ob izboru (*Izvozi v Excel*, *Izbriši*), *Nov kontakt*.
3. **Kontakt** – podrobnosti, urejanje, značke, dodatna polja, zavihek *Zgodovina*.
4. **Dvojniki** – seznam predlogov; primerjava dveh kontaktov stolpec ob stolpcu (na mobilnem: polje za poljem) z izbiro vrednosti.
5. **Skupina** – naziv, seznam članov z vlogami; urejanje vidi samo OWNER.

## 4. Komponente

| Komponenta | Pravila |
|---|---|
| **Gumb** | Vrste: primarni, sekundarni, tihi (ghost), nevarni. Besedilo je glagol (»Shrani«, »Izvozi v Excel«). Ikona brez besedila samo z `aria-label`. Stanje nalaganja onemogoči ponovni klik. |
| **Vnosno polje** | Oznaka vedno vidna nad poljem (ne samo placeholder). Napaka pod poljem, povezana z `aria-describedby`, z ikono in besedilom. Obvezna polja označena z besedo, ne samo z zvezdico. |
| **Značka (chip)** | Zaobljena, `tag-bg`/`tag-text`. Odstranljiva značka ima gumb »Odstrani značko X«. |
| **Preglednica / kartica kontakta** | Prikaže ime in priimek, podjetje, e-pošto, značke. Celotna vrstica je povezava do kontakta; potrditveno polje je ločen cilj. |
| **Akcijska vrstica izbora** | Pojavi se ob izboru: »Izbranih: N«, *Izberi vse zadetke*, *Izvozi v Excel*, *Počisti izbor*. Sprememba števila se sporoči bralniku (`aria-live="polite"`). |
| **Dialog** | Nativni `<dialog>` z zadrževanjem fokusa, zapiranje z Esc, fokus se vrne na sprožilni element. Potrditveni dialog pove posledico (»Kontakt bo skrit iz seznama; zgodovina ostane.«). |
| **Toast** | Kratka potrditev uspeha, `role="status"`; samodejno izgine po ~5 s, a ne, če je fokus v njem. Napake niso toast, ampak ostanejo vidne ob mestu napake. |
| **Konflikt verzij** | Opozorilni panel: »Kontakt je medtem spremenil X.« Ponudi *Prikaži razlike*, *Ohrani moje*, *Prevzemi njihove*. |
| **Prazno stanje** | Pove, zakaj je prazno, in ponudi naslednji korak (»Ta skupina še nima kontaktov. Dodaj prvega.«). |
| **Brez povezave (PWA)** | Pasica na vrhu: »Ni povezave – podatki niso na voljo.« Akcije, ki potrebujejo strežnik, so onemogočene z razlago. |

## 5. Dostopnost (WCAG 2.2 AA) – kontrolni seznam za vsako komponento

- [ ] Uporabna samo s tipkovnico; logičen vrstni red fokusa; povezava *Preskoči na vsebino*.
- [ ] Viden fokus: obroba 2 px `--cm-primary` z odmikom 2 px, nikoli skrita (`outline: none` brez nadomestka je prepovedan).
- [ ] Semantični elementi (`button`, `a`, `nav`, `main`, `table`, `dialog`); ARIA samo, kjer HTML ne zadošča.
- [ ] Kontrast besedila ≥ 4,5 : 1, kontrol in ikon ≥ 3 : 1 – v obeh načinih.
- [ ] Cilji za dotik ≥ 44 × 44 px.
- [ ] Deluje pri povečavi 200 % in širini 320 px.
- [ ] Spremembe stanja (shranjeno, napaka, izbranih N) so sporočene bralniku zaslona.
- [ ] Jezik strani nastavljen (`<html lang>`).
- [ ] Avtomatski pregled z axe brez kritičnih napak; ročni preizkus s tipkovnico in bralnikom zaslona (NVDA ali VoiceOver/TalkBack).

## 6. Besedila in ton

- Kratko, neposredno, prijazno. Tikanje ali vikanje – **odprto vprašanje**.
- Napake povedo, kaj se je zgodilo in kaj narediti: »E-pošta ni veljavna. Primer: ime@podjetje.si« namesto »Neveljaven vnos«.
- Brez tehničnih kod v vmesniku (409, UUID …).

## 7. PWA identiteta

- `name`: »Contact Manager«, `short_name`: »Kontakti«.
- `display`: `standalone`; `background_color` = `--cm-bg`; `theme_color` = `--cm-primary`.
- Ikone: 192 px, 512 px in *maskable* različica; preprost znak (npr. stilizirana vizitka) v primarni barvi.

## 8. Odprta vprašanja

- Jezik vmesnika: samo slovenščina ali tudi angleščina (i18n)?
- Tikanje ali vikanje v besedilih?
- Ali uporabiva knjižnico dostopnih primitivov (npr. React Aria, Radix) ali lastne komponente?
- Logotip in ikone aplikacije.
- Ikonski set (npr. Lucide).
