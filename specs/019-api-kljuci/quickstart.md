# Quickstart: API ključi (019)

Predpogoj: `compose` sistem teče (`API_KEY_SIGNING_SECRET` v `.env`, npr. `openssl rand -base64 32`), uporabnik je
prijavljen in je urednik skupine Klub.

1. *Moj račun* → *API ključi* → *Ustvari ključ*: »Nočni izvoz«, Klub = branje in pisanje, 90 dni. Ključ `cmk_…` je
   prikazan enkrat (*Kopiraj*); po zaprtju je na seznamu s `cmk_…xxxxxx`, »še ni uporabljen«.
2. `curl -H "Authorization: Bearer $KEY" http://localhost:8080/v1/groups` → 200, samo Klub z vlogo.
3. `curl -H "Authorization: Bearer $KEY" "http://localhost:8080/v1/groups/$G/contacts?q=novak&size=50"` → enako kot
   seznam v aplikaciji.
4. `POST /v1/groups/$G/contacts` → 201; v revizijski sledi vnos »prek API ključa »Nočni izvoz««.
5. Isti ključ na `GET /api/groups` → 401; Firebase žeton na `/v1/groups` → 401.
6. 121 zahtev v minuti → zadnja `429 RATE_LIMITED` z `Retry-After`.
7. *Statistika* ključa: danes uspešne/napake/zavrnitve; graf in tabela za 7/30 dni.
8. *Prekliči* (potrditev) → naslednja zahteva 401; ključ »preklican«.
9. Neprijavljen: `/api-docs` → stran API, *Prenesi opis vmesnika* (`/v1/openapi.json`).

Preverjanje: `./verify.sh quick`; ciljani IT `./mvnw -q -B verify -Dit.test='Api*IT,*ApiKey*IT'`;
E2E `npx playwright test api-kljuci.spec.ts --project=w360 --project=w1280`.
