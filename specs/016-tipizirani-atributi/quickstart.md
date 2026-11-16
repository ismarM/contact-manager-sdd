# Quickstart: preverjanje 016

Predpogoj: `./verify.sh quick` in `./verify.sh backend` zelena; za E2E sistem iz `compose.yaml` + `compose.verify.yaml` (zaledje kaže na `osm-stub`, brez pravih klicev OSM).

| # | Scenarij | Ukaz / pot | Pričakovano |
|---|---|---|---|
| 1 | Migracija na kopiji s podatki pred 016 | IT `TypedAttributesMigrationIT` | vsi ključi `OTHER`, naslovi nerazčlenjeni, verzije in vrednosti nespremenjene (FR-016-04, SC-007) |
| 2 | Normalizacija telefona v 5 oblikah, e-naslov, URL, datum, opombe | unit `PhoneNormalizerTest`, `TypedValuesTest`; IT `ContactTypedAttributesIT` | ena kanonična oblika (SC-001); neveljavno → `400 INVALID_VALUE` ob atributu |
| 3 | Sprememba tipa ključa (1 000 vrednosti, ena neveljavna, sočasno urejanje) | IT `ChangeAttributeTypeIT`, `AttributeTypeAuditIT` | vse ali nič, `409 ATTRIBUTE_TYPE_CONFLICT` s seznamom, `409 VERSION_CONFLICT`, en vnos `ATTRIBUTE_TYPE` (SC-004) |
| 4 | Matrika izolacije novih endpointov | `TypedAttributesSecurityIT`, `AttributeTypeIsolationMatrixSecurityIT`, `AddressLocationSecurityIT`, `AddressSuggestionsSecurityIT`, `MapTilesSecurityIT` | 401/404/403/2xx/409 po tabeli plan.md; brez klica nadomestnega OSM pri 401/404 (SC-008) |
| 5 | Posrednik OSM | IT `AddressLocationIT`, `AddressSuggestionsIT`, `MapTilesIT`, unit `RateLimiterTest`, `BoundedCacheTest` z `MapsFakeServer` | User-Agent brez e-naslova, samo besedilo naslova, predpomnilnik (2. klic ne doseže strežnika), omejitev → 503/[] (SC-006) |
| 6 | Iskanje telefona v 10 000 kontaktih | IT `PhoneSearchIT` | »041 123«, »041123«, »+38641« najdejo; < 1 s (SC-002) |
| 7 | Rollback na točko pred spremembo tipa in pred 016 | IT `RollbackAttributeTypeIT`, `RestoreTypedIT` | tip in vrednosti dobesedno |
| 8 | FE: izbira tipa, polja po tipih, sheme, zemljevid (MSW, axe) | `npx vitest run src/features/contacts/typed src/features/formats src/features/map src/features/attributes src/features/account` | brez kršitev axe; MSW `onUnhandledRequest: 'error'` |
| 9 | E2E | `npx playwright test tipizirani-atributi.spec.ts --project=w360 --project=w1280` | samodokončanje s tipkovnico, shema takoj povsod, zemljevid odpre/zapre z *Esc*, vse zahteve na izvor aplikacije (SC-005, SC-006) |
