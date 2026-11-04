# Research: Prijava, ogrodje aplikacije in Moj račun (001)

**Datum:** 2026-11-04 · **Vhod:** [spec.md](spec.md) (s *Clarifications* 2026-11-04), konstitucija 2.0.0,
`feature-map.md` §2.2 in §2.10, `design.md` 4.3, 7.1, 8.12, 8.13, 8.15, 8.16, 9.1, 9.9, 9.10, 13.4, 13.5, plan 000

Različice so preverjene v registrih npm in Maven Central na dan plana. Vsaka nova knjižnica dobi vnos v `DECISIONS.md`.

---

## R-01 Preverjanje žetonov na zaledju (FR-001-07)

- **Decision:** Spring Security **OAuth2 Resource Server** (`spring-boot-starter-security-oauth2-resource-server`
  4.1.2, Nimbus JOSE + JWT) z lastnim `JwtDecoder`:
  - **produkcijski način:** podpis RS256 po ključih JWK Firebase
    (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`), izdajatelj
    `https://securetoken.google.com/<projekt>`, občinstvo `<projekt>`, `exp`/`iat` (ura z 60-sekundnim zamikom),
    neprazen `sub`;
  - **način emulatorja** (samo, ko je nastavljena spremenljivka `FIREBASE_AUTH_EMULATOR_HOST`, kot v Compose):
    emulator izdaja **nepodpisane** žetone (`alg: none`), zato dekoder sprejme samo `alg: none`, podpisan žeton
    zavrne; vsi preverjeni zahtevki zahtevkov (`iss`, `aud`, `exp`, `iat`, `sub`) so enaki kot v produkciji.
  - Vsak neuspeh → `401 {"code":"UNAUTHENTICATED"}` (obstoječa vstopna točka iz 000).
  - Uporabnik zahtevka je vedno `sub` iz žetona (Firebase UID); `email` in `name` se bereta iz žetona. Žeton brez
    `email` se zavrne z `401` (profil ga zahteva; Googlov račun ga ima vedno).
- **Rationale:** standardna, vzdrževana knjižnica; preverjanje izdajatelja, občinstva in časa je deklarativno
  (`JwtValidators`). Firebase Admin SDK za Javo bere način emulatorja samo iz okoljske spremenljivke procesa, kar
  oteži integracijske teste v istem procesu, in prinese velik graf odvisnosti (gRPC, Guava). Podpisa nepodpisanih
  žetonov emulatorja ni mogoče preveriti v nobeni knjižnici, zato je ločen način nujen.
- **Preverjanje:** integracijski in varnostni testi tečejo proti emulatorju (izdan žeton, ponarejeni in spremenjeni
  žetoni – drug projekt, potekel, podpisan, pokvarjen); **podpis** produkcijskega načina preveri unit test z lokalno
  ustvarjenim ključem RSA (`FirebaseJwtDecoderTest`) – to ni zunanja storitev.
- **Alternatives:** Firebase Admin SDK (glej zgoraj); lastno razčlenjevanje JWT brez knjižnice (tveganje napak).

## R-02 Profil in registracija (FR-001-02, -03, -08, -19)

- **Decision:** tabela `app_user` (data-model.md), dostop prek `JdbcClient` z enim stavkom
  `INSERT … ON CONFLICT (firebase_uid) DO UPDATE … RETURNING`. Registracija in posodobitev imena/e-naslova se zgodita
  z `PUT /api/me` (idempotentna sinhronizacija), ki jo vmesnik pokliče vsakič, ko dobi prijavljenega uporabnika
  (prijava in nalaganje aplikacije s shranjeno sejo). Isti stavek z `COALESCE` shrani izbiro naprave samo v polja
  profila, ki so prazna (FR-001-19 b).
- **Rationale:** `ON CONFLICT` zagotovi natanko en profil tudi ob sočasnih prijavah (spec, scenarij FR-001-03/4) brez
  zaklepanja v aplikaciji; en zahtevek ob prijavi vrne profil z veljavno izbiro jezika in teme, zato vmesnik ne
  potrebuje še branja (`GET`). JPA za eno tabelo z nadgradnjo ne prinese ničesar.
- **Alternatives:** `POST` za registracijo + `GET` za branje (dva zahtevka, tekma pri sočasni prijavi); JPA
  `save()` (ne reši sočasnega vstavljanja).

## R-03 Izbira jezika in teme (FR-001-15 … -17, -19; D-19)

- **Decision:**
  - Brskalnik: `localStorage` ključa `language` (`sl`|`en`) in `theme` (`light`|`dark`); *Sistemska* ključ `theme`
    izbriše. Vrinjen skript v `index.html` (že obstaja za temo) nastavi `data-theme` pred izrisom; i18n ob zagonu
    vzame shranjen jezik, sicer jezik brskalnika (`detectLanguage`). Neznane vrednosti se prezrejo. Branje in pisanje
    sta v `try/catch` (zasebni način → vrednost velja do zaprtja strani).
  - Profil: stolpca `language`, `theme` (NULL = ni izbire). `PUT /api/me` pošlje izrecno izbiro naprave (ali `null`);
    zaledje jo shrani le v prazna polja; odgovor vsebuje veljavne vrednosti, ki jih vmesnik uveljavi in zapiše v
    `localStorage` (vrednost `null` ključ izbriše in vrne privzeto).
  - Sprememba v *Mojem računu* ali meniju računa: najprej se uveljavi in zapiše lokalno, nato `PUT /api/me/preferences`
    z obema vrednostma. Ob neuspehu ostane lokalno, vmesnik pokaže napako (R-08), ni ponovnega poskusa.
- **Rationale:** ena pot za vse vire (stran za prijavo, nalaganje, prijava, sprememba); `localStorage` ostane kopija
  za čas pred prijavo in po odjavi (konstitucija VI 1.1.0).

## R-04 Prijava v brskalniku in emulator (FR-001-01, -04, -05)

- **Decision:** Firebase JS SDK **`firebase` 13.2.0** (modularni `firebase/auth`), `GoogleAuthProvider` in
  **`signInWithPopup`**; obstojnost privzeta (`browserLocalPersistence`/IndexedDB). Konfiguracija ob gradnji
  (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_EMULATOR`);
  privzeto (Compose, testi) projekt `demo-contact-manager` in emulator.
  - **Emulator na istem izvoru:** vmesnik pokliče `connectAuthEmulator(auth, location.origin, { disableWarnings: true })`;
    nginx (in strežnik Vite v razvoju) posreduje `/identitytoolkit.googleapis.com/`, `/securetoken.googleapis.com/`
    in `/emulator/` na `auth:9099`. Service worker teh poti ne prestreže (`navigateFallbackDenylist`).
  - Napake: `auth/popup-closed-by-user`, `auth/cancelled-popup-request` → »Prijava je bila prekinjena. Poskusi znova.«;
    `auth/popup-blocked` → »Brskalnik je blokiral okno za prijavo. Dovoli pojavna okna za to stran in poskusi znova.«;
    `auth/network-request-failed` ali `navigator.onLine === false` → »Ni povezave. Preveri povezavo in poskusi
    znova.«; napaka `PUT /api/me` → odjava v SDK in »Prijava ni uspela. Poskusi znova.«. Vse v kartici, `role="alert"`.
- **Rationale:** pojavno okno ohrani stanje strani (ciljna pot) in deluje z emulatorjem brez piškotkov tretjih
  oseb; spec (*Edge Cases*) prepusti izbiro planu. Isti izvor ohrani obstoječi test FR-000-12 (vsi viri z istega
  izvora), brez dodatnih objavljenih vrat v `compose.verify.yaml`. Opozorilna pasica emulatorja bi v DOM dodala
  element brez prevoda, zato je izklopljena.
- **Alternatives:** `signInWithRedirect` (izguba stanja, odvisnost od piškotkov tretjih oseb); objava vrat emulatorja
  brskalniku (drug izvor, sprememba testa 000).

## R-05 Usmerjanje in zaščitene poti (FR-001-05, -06, -13)

- **Decision:** **`react-router` 8.5.1** (deklarativni način, `BrowserRouter`, `Routes`). Poti: `/login`, `/` (začetna
  stran, do 002 začasna vsebina), `/account`, `*` (*Te strani ni*). Zaščito izvede `RequireAuth`: dokler stanje prijave
  ni znano, se ne izriše nič (brez zaščitene vsebine); neprijavljen → `Navigate replace` na
  `/login?next=<pot+poizvedba>`. `safeNextPath()` sprejme samo pot, ki se začne z enim `/` (ne `//`, ne `/\`, brez
  sheme), sicer `/`. Prijavljen na `/login` → `next` oziroma `/`.
- **Rationale:** `next` v poizvedbi preživi osvežitev strani za prijavo in je preverljiv v testih; `replace`
  prepreči, da *Nazaj* vrne zaščiteno pot v zgodovino (FR-001-09).
- **Alternatives:** stanje usmerjevalnika (izgubi se ob osvežitvi); TanStack Router (nov koncept za ekipo).

## R-06 Odjava, potek seje in drugi zavihki (FR-001-09, -10)

- **Decision:** `AuthProvider` posluša `onAuthStateChanged` in hrani profil v pomnilniku. Ločimo:
  - **lokalna odjava** (*Odjava*): zastavica `signingOut`, `signOut()`, izbris profila iz pomnilnika, `navigate('/login',
    { replace: true })` brez sporočila;
  - **izguba seje brez lokalne odjave** – SDK sporoči `null` (odjava v drugem zavihku se prenese prek IndexedDB, žetona
    ni mogoče osvežiti), `getIdToken()` vrže napako ali zaledje vrne `401`: lokalno se počisti seja in profil, sledi
    `navigate('/login?reason=session-expired&next=<trenutna pot>', { replace: true })`.
  - Odjemalec API pred vsakim zahtevkom vzame žeton iz `auth.currentUser`; če ga ni, zahtevka **ne pošlje** in sproži
    izgubo seje (zato zahtevek po odjavi v drugem zavihku ne more ničesar spremeniti, tudi preden SDK sporoči `null`).
- **Rationale:** SDK sinhronizira stanje med zavihki istega izvora, zato je zavihek običajno odjavljen že pred
  interakcijo; preverjanje v odjemalcu zagotovi zahtevo »najpozneje ob prvi interakciji«.

## R-07 Meni računa in kontrole (FR-001-11, -12, -15, -17)

- **Decision:** meni računa s **shadcn *Dropdown Menu*** (D-15) – komponenta `frontend/src/shared/ui/dropdown-menu.tsx`
  na paketu **`radix-ui` 1.8.1**, prilagojena po design.md 13.4 (Tabler, fokus 13.3, `text-base`, `h-11`, brez senc
  razen `float`). Jezik v meniju je `DropdownMenuRadioGroup` (`menuitemradio`). V *Mojem računu* nativni izbirni
  gumbi v `fieldset` z `legend` (D-15: *Radio Group* nativni). Preklop jezika na strani za prijavo: dva gumba z
  `aria-pressed` v skupini »Jezik«. Imena jezikov so vedno v svojem jeziku (`lang="sl"`/`lang="en"`).
- **Gumb »Prijava z Googlom«:** po Googlovih smernicah – bela (`surface`) podlaga, rob, logotip G kot vrinjen SVG z
  barvami blagovne znamke Google. To je edina izjema od pravila »barve samo iz žetonov«; zahteva jo design.md 9.1,
  barve niso razredi Tailwind (lint jih ne zajame), logotip je `aria-hidden`.

## R-08 Sporočila (FR-001-04, -10, -19)

- **Decision:** napake prijave in obvestilo o poteku seje sta v kartici za prijavo (`role="alert"`, vzorec 8.13 –
  napaka `danger`, potek seje `warning`). Neuspelo shranjevanje izbire v račun: `role="alert"` v ogrodju takoj pod
  zgornjo vrstico (velja za meni računa in *Moj račun*), z gumbom »Zapri sporočilo«; ostane, dokler ga uporabnik ne
  zapre ali do naslednje uspešne spremembe.
- **Rationale:** napaka po 8.13 nikoli ni samo obvestilo, ki izgine; meni se ob izbiri zapre, zato je skupno mesto
  pod zgornjo vrstico vidno ne glede na to, od kod je sprememba prišla.

## R-09 Testi brez zunanjih storitev (konstitucija II)

- **Decision:**
  - BE integracijski in varnostni testi: Testcontainers (PostgreSQL) + emulator iz `firebase/Dockerfile`. Žetoni
    Googlovega ponudnika iz emulatorja z `accounts:signInWithIdp` (`providerId=google.com`, nepodpisan
    `id_token` z `sub`, `email`, `name`); sprememba imena/e-naslova v Googlu se simulira z `accounts:update` in novim
    žetonom. Ponarejeni žetoni se sestavijo v testu (drug `aud`, potekel `exp`, `alg: RS256` z naključnim podpisom).
  - FE testi (Vitest): API prek MSW; prijava prek vmesnika `AuthGateway` (`signInWithGoogle`, `signOut`,
    `onChange`, `getIdToken`), ki ga v testih nadomesti testna izvedba v pomnilniku – SDK Firebase se v jsdom ne
    naloži. To je dvojnik lastnega modula, ne zunanje storitve.
  - E2E (Playwright, Compose): prava prijava prek pojavnega okna emulatorja (gumbi in polja okna emulatorja po vlogah in
    oznakah); »druga naprava« = drug kontekst brskalnika; »drug zavihek« = druga stran v istem kontekstu.
- **Sprememba obstoječega testa:** `FirebaseEmulatorIT.apiRejectsEmulatorTokenWith401InScaffold` je opisal začasno
  vedenje 000 (»v 000 tudi z žetonom 401 – preverjanje žetonov doda 001«). FR-001-07 to vedenje spremeni, zato se test
  uskladi s specifikacijo (zahteva z veljavnim žetonom na neobstoječo pot → `404`, ne `401`) z vnosom v `DECISIONS.md`
  (workflow §2.2).

## R-10 Neobstoječe poti API za prijavljenega

- **Decision:** z veljavnim žetonom neobstoječa pot `/api/**` vrne `404` (privzeto vedenje Spring MVC), telo
  `{"code":"NOT_FOUND"}` se **ne** uvaja – telo je prazno. Brez žetona ostane `401` (FR-000-10, FR-001-07).
- **Rationale:** feature-map §2.10 kode za 404 ne določa; vmesnik pri 404 kode ne potrebuje.

## R-11 Nove odvisnosti (vnosi v DECISIONS.md)

| Paket | Različica | Namen |
|---|---|---|
| `spring-boot-starter-security-oauth2-resource-server` | 4.1.2 (BOM) | preverjanje JWT (R-01) |
| `firebase` | 13.2.0 | prijava z Googlom v brskalniku (R-04) |
| `react-router` | 8.5.1 | poti in zaščita (R-05); zahteva Node ≥ 22.22 (Docker `node:22-alpine` in CI `setup-node` 22 vzameta zadnjo 22.x) |
| `radix-ui` | 1.8.1 | osnova shadcn *Dropdown Menu* (R-07, D-15) |
