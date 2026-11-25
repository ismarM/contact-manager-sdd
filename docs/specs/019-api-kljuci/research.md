# Research: API ključi (019)

## R-01 Poverilnica: podpisan JWT s predpono
- **Decision:** `cmk_` + JWT HS256 (Nimbus prek `spring-security-oauth2-jose`: `NimbusJwtEncoder` z `ImmutableSecret`,
  `NimbusJwtDecoder.withSecretKey`). Trditve in preverjanje: `docs/architecture-decisions.md#2026-11-16-api-kljuc-jwt`.
  Razred `ApiKeyTokens` (sign/verify) **ni** bean tipa `JwtDecoder` – `SecurityConfig` injicira edini `JwtDecoder`
  (Firebase) po tipu.
- **Rationale:** zahteva razvijalca (najpreprosteje, nič skrivnega v bazi); knjižnica je že v projektu.
- **Alternatives:** naključna skrivnost + SHA-256 (014), RS256 – zavrnjeno (glej odločitev).

## R-02 Ločena varnostna veriga `/v1/**`
- **Decision:** `ApiSecurityConfig` (paket `apikey`) `@Order(2)` (CardDAV ima `@Order(1)`, `SecurityConfig` ostane
  privzeta veriga za vse ostalo), `securityMatcher("/v1/**")`, STATELESS, `csrf`/`cors`/`httpBasic`/`formLogin`
  izklopljeni, brez `oauth2ResourceServer`. Filtri: `ApiKeyAuthenticationFilter` → `ApiUsageFilter` →
  `ApiRateLimitFilter`. `GET /v1/openapi.json` je `permitAll`. Neuspeh: `401 {"code":"UNAUTHENTICATED"}`.
- Ključ samo v `Authorization: Bearer cmk_…`; ključ v poizvedbi ali drugi glavi se ignorira → `401`. Celoten ključ se
  nikoli ne beleži; v dnevnik gre samo `jti`.
- **Alternatives:** isti `/api` z drugim filtrom – zavrnjeno v posvetu (ločen imenski prostor, preprostejša matrika).

## R-03 Dostop do skupine prek ključa
- **Decision:** `ApiGroupAccess.require(principal, groupId, lowest, write)`: id skupine → članstvo
  (`GroupAccess.membership(userId, groupId)`, nova javna metoda brez preverjanja vloge; 404) → skupina v obsegu ključa
  (404) → učinkovita vloga = min(vloga, kapica ključa: `READ`→VIEWER, `WRITE`→brez kapice) → pod `lowest` 403 →
  `write` v arhivirani 409. Vrne `GroupAccess.Membership` z učinkovito vlogo, zato `ContactService`
  (`requireWritable`, `create`, `update`, `delete`, `list`, `read`) ostane nespremenjen.
- Kontrolerji API so v paketih domene (`contact/ApiContactController`, `group/ApiGroupController`), ker so storitve
  paketno zasebne; razčlenjevalniki vhoda (`ContactInputParser`, `ContactQueryParser`) so isti.

## R-04 Oznaka ključa v revizijski sledi
- **Decision:** `audit_entry.api_key_name` (posnetek imena). `AuditRepository.insert` ga vzame iz
  `ApiKeyPrincipal.current()` (nov record v `shared/security`, bere `SecurityContextHolder`) – storitve se ne
  spremenijo. V14 nadomesti funkcijo `audit_entry_immutable`: pri `actor_id → NULL` (izbris računa) sme
  `api_key_name` postati `NULL` in ga sprožilec sam počisti.
- **Alternatives:** FK na `api_key` – zavrnjeno (čiščenje po 90 dneh bi kršilo nespremenljivost sledi).

## R-05 Omejitev pogostosti
- **Decision:** `ApiRateLimiter` v pomnilniku: fiksno 60-sekundno okno na `jti`, 120 zahtev, `Clock` za teste;
  preseženo → `429 {"code":"RATE_LIMITED"}` + glava `Retry-After` (sekunde do konca okna). En primerek zaledja
  (enako kot omejevalnik OSM 016). Okna starejša od 2 min se počistijo ob dostopu.
- **Alternatives:** vedro žetonov (`maps.RateLimiter`) – ne pove časa do ponovnega poskusa; stanje v bazi – nepotrebno.

## R-06 Statistika uporabe
- **Decision:** tabela `api_key_usage` po **urah** (`hour` = začetek ure UTC) s števci `read_ok`, `write_ok`,
  `errors`, `rate_limited`. `ApiUsageFilter` po odgovoru (v `finally`) v eni kratki transakciji naredi
  `INSERT … ON CONFLICT DO UPDATE` in posodobi `api_key.last_used_at`. Razvrstitev: 2xx + GET → `read_ok`, 2xx + drugo
  → `write_ok`, 429 → `rate_limited`, drugo (4xx, 5xx) → `errors`. Zahteve brez veljavnega ključa (401) se ne štejejo.
- Dnevi: seštevek ur po pasu `api-keys.stats-zone` (privzeto `Europe/Ljubljana`); »24 ur« = zadnjih 24 ur po urah.
  Obdobje 7 ali 30 dni; manjkajoči dnevi z 0 (zapolni zaledje).
- **Alternatives:** dnevni števci – ne dajo točnih 24 ur; asinhrono štetje – SC-007 (1 min) izpolni tudi sinhrono.

## R-07 Hramba in čiščenje
- **Decision:** `ApiKeyPurgeJob` (`@Scheduled`, `api-keys.purge-interval`, privzeto 1 h): izbriše ključe s
  `coalesce(revoked_at, expires_at) < now() - 90 dni` (kaskadno statistiko) in vrstice `api_key_usage` starejše od
  90 dni. Seznam ključev skrije, kar je starejše od 90 dni, tudi če čiščenje še ni teklo.

## R-08 Strojno berljiv opis
- **Decision:** ročno vzdrževan `backend/src/main/resources/api/openapi-v1.json` (OpenAPI 3.1), postrežen na
  `GET /v1/openapi.json`. `ApiDescriptionIT` primerja množico (metoda, pot) iz opisa z dejanskimi preslikavami
  `RequestMappingHandlerMapping` pod `/v1` (v obe smeri). FE `apiOperations.ts` (seznam operacij na strani API) se v
  Vitest primerja z istim JSON (branje datoteke iz `../backend/...`).
- **Alternatives:** springdoc-openapi – nova odvisnost in ne pozna ročnih razčlenjevalnikov telesa; zavrnjeno.

## R-09 Upravljanje ključev pod `/api/me/api-keys`
- **Decision:** kot gesla 014: meja 10 aktivnih (aktiven = ni preklican in ni potekel) pod zaklepom vrstice
  `app_user`; preklic nastavi `revoked_at` (idempotentno, 204). Brez sveže prijave (017 `FreshAuthentication` se ne
  uporabi). `EmailVerifiedFilter` (017) velja kot za vse `/api/**`.
- Izbira skupin v obrazcu uporablja obstoječa `GET /api/groups` in `GET /api/groups/archived`.

## R-10 Stran API in povezave
- **Decision:** javna pot `/api-docs` (zunaj `RequireAuth`, lastna preprosta postavitev kot prijava); povezave s
  prijave in iz razdelka *API ključi*. Primeri kode v `<pre><code>` z gumbom *Kopiraj* (8.1), ovijanje vrstic
  (`whitespace-pre-wrap`, `break-all`) – brez vodoravnega drsenja. Graf statistike: lastni stolpci SVG/CSS iz žetonov
  (design.md 13.4 izključuje *Chart*) + enakovredna tabela.
- nginx in Vite posredujeta `/v1/` na zaledje (`frontend/nginx.conf`, `frontend/vite.config.ts`).
