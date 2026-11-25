# CardDAV (samo branje) – pogodba

Prijava: HTTP Basic, uporabniško ime = e-naslov računa, geslo = geslo za aplikacijo. Brez veljavne prijave → `401` + `WWW-Authenticate: Basic realm="Contact Manager", charset="UTF-8"`. Zaklep po FR-014-26 → `401`. Firebase JWT ali piškotek na teh poteh ne veljata.

| Metoda | Pot | Odgovor | FR-ID |
|---|---|---|---|
| GET, PROPFIND | /.well-known/carddav | `301` → `/dav/` (brez prijave) | FR-014-22 |
| OPTIONS | /dav/** | `200`, `DAV: 1, 3, addressbook`, `Allow: OPTIONS, GET, HEAD, PROPFIND, REPORT` | FR-014-22 |
| PROPFIND | /dav/ | `207`: `current-user-principal` = `/dav/principals/me/` | FR-014-22 |
| PROPFIND | /dav/principals/me/ | `207`: `principal-URL`, `displayname`, `CARD:addressbook-home-set` = `/dav/addressbooks/` | FR-014-22 |
| PROPFIND (0/1) | /dav/addressbooks/ | `207`: dom; pri Depth 1 en imenik za vsako skupino člana (tudi arhivirano) | FR-014-22 |
| PROPFIND (0/1) | /dav/addressbooks/{groupId}/ | `207`: `displayname`, `resourcetype`, `getctag`, `sync-token`, `supported-report-set`, `current-user-privilege-set` (read), `supported-address-data`; Depth 1 doda vizitke (`getetag`, `getcontenttype`) | FR-014-22, -23 |
| REPORT | /dav/addressbooks/{groupId}/ | `addressbook-multiget`, `addressbook-query` (vrne vse), `sync-collection` (spremembe od žetona; izbrisani kot `404`; neveljaven žeton → `403 valid-sync-token`) | FR-014-22, -23 |
| GET, HEAD | /dav/addressbooks/{groupId}/{contactId}.vcf | `200` vCard 3.0 + `ETag`; `If-None-Match` → `304` | FR-014-22 |
| PUT, DELETE, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, POST | /dav/** | `403` (`DAV:need-privileges`), nič se ne spremeni | FR-014-24 |
| katerakoli | tuja/neobstoječa skupina ali kontakt | `404` (po prijavi, pred `403`) | FR-014-22 |
| PROPFIND | Depth: infinity | `403` `propfind-finite-depth` | — |

Vrstni red preverjanj: `401` → `404` (vir ni viden) → `403` (pisanje). Članstvo se preveri ob vsakem zahtevku.
