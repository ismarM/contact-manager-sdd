---

description: "Naloge za 018 slike (ena prehod: koda in testi skupaj po zgodbah)"
---

# Tasks: Slike (profilne slike, slike skupin in kontaktov)

**Input**: `specs/018-slike/` (spec.md, plan.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md)

**Tests**: obvezni, pišejo se skupaj s kodo vsake zgodbe; brez ločene faze ali commita samo s testi (konstitucija §2.3).

## Format: `[ID] [P?] [Story] FR-IDs Opis`

- **[P]**: neodvisno od drugih nalog, brez skupnih datotek. Poti: BE `backend/src/main/java/si/contactmanager/…`, FE `frontend/src/…`, E2E `e2e/tests/…`.
- Migracija je `V14__slike.sql` (začasna št.; glej T093).

---

## Phase 1: Setup

- [ ] T001 — Zaledje: preveri ImageIO v `eclipse-temurin:21-jre-alpine`: kratek IT/E2E-pripravljen test `ImageRuntimeIT` (v Docker slike pretvori JPEG in PNG 64 × 64) in zapiši rezultat v research.md R-03; če ne dela, dodaj potrebne sistemske knjižnice v `backend/Dockerfile` (FR-018-14)
- [ ] T002 [P] — i18n: ključi `images.*` (avatar, naloži, zamenjaj, odstrani, predogled, obrezovanje, napake `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `FILE_TOO_LARGE`, `RATE_LIMITED`, `GOOGLE_PHOTO_UNAVAILABLE`, stavki sledi) v `frontend/src/i18n/sl.json` in `en.json` (FR-018-04, FR-018-21)
- [ ] T003 [P] — `frontend/nginx.conf`: tri lokacije za nalaganje (`/api/me/photo`, `/api/groups/{id}/photo`, `/api/groups/{id}/contacts/{id}/photo`) z `client_max_body_size 6m` pred `location /api/` (FR-018-15)
- [ ] T004 [P] — `backend/src/main/resources/application.yaml`: `images.max-bytes=5MB`, `images.max-side=4096`, `images.decode-side=2048`, `images.concurrent=2`, `images.upload-per-minute=10`, `images.google.allowed-hosts` (FR-018-15, FR-018-23)

---

## Phase 2: Foundational (blokira vse zgodbe)

**Purpose**: migracija, shramba, obdelava (US4), skupna komponenta prikaza in nalaganja.

- [ ] T010 FR-018-12, FR-018-19 — `V14__slike.sql`: tabeli `image` (`kind` USER|GROUP|CONTACT; `user_id` → `app_user` ON DELETE CASCADE; `group_id` → `contact_group` ON DELETE CASCADE; `contact_id` brez tujega ključa; `detached_at`; `revision bigint` od 1; `CHECK` po `kind`; delni `UNIQUE` `(user_id)` za USER, `(group_id)` za GROUP, `(group_id, contact_id)` za CONTACT) in `image_variant` (`image_id` ON DELETE CASCADE, `size smallint` 96|256|512, `content_type` `image/jpeg`|`image/png`, `data bytea`, PK `(image_id, size)`); stolpec `audit_entry.photo_change` `CHECK IN ('ADDED','REPLACED','REMOVED')`; sprožilca `AFTER DELETE ON contact` (nastavi `detached_at = now()`) in `AFTER INSERT ON contact` (`detached_at = NULL`), oba z `group_id` in `contact_id` v pogoju; razširi `CHECK` kontakta/sledi, če ga migracija zahteva
- [ ] T011 [P] FR-018-19 — BE `image/ImageStore.java` (vmesnik: `put`, `get(size)`, `delete`, `reassign`, `revisions`) in `image/PostgresImageStore.java` (JdbcClient, vedno z `group_id`/`user_id` v pogoju, `revision + 1` ob zamenjavi, `SELECT` samo zahtevane različice); IT `ImageStoreIT` (ena slika na lastnika, zamenjava, brisanje različic, samo zahtevana različica se prebere)
- [ ] T012 [P] FR-018-14, FR-018-15, FR-018-16 — BE `image/ImageProcessor.java`: branje z mejo 5 MB + 1, magični bajti JPEG/PNG, `ImageReader` samo za zaznani zapis, dimenzije iz glave pred dekodiranjem (≤ 4096 × 4096 in ≤ 16,8 Mpx), `setSourceSubsampling` = ⌈daljša stranica / 2048⌉, `ImageIO.setUseCache(false)`, semafor 2 dovoljenji (čakanje ≤ 5 s → `RATE_LIMITED`), sredinski kvadrat, pomanjšanje na 512/256/96 (nikoli povečava), izhod JPEG 0,85 (PNG pri prosojnosti) brez metapodatkov; vse izjeme dekodiranja → `INVALID_IMAGE`
- [ ] T013 [P] FR-018-16 — BE `image/ExifOrientation.java` (oznaka 0x0112 iz APP1 prvih 64 KB, obe vrstni redi bajtov, neveljavno = 1) in uporaba v T012 (rotacije/zrcaljenje 1–8)
- [ ] T014 FR-018-14, FR-018-15, FR-018-16 — testi obdelave `ImageProcessorTest`, `ExifOrientationTest`, `ImageProcessorMemoryTest`: JPEG in PNG (z in brez prosojnosti), orientacije 1–8 s preverjenimi barvnimi vogali, odstranitev EXIF/GPS/ICC/komentarja (izhod ne vsebuje `Exif`, GPS, XMP), izhodne velikosti; zloraba: lažna končnica in tip (`.png` z EXE/SVG/GIF/WebP/PDF vsebino), prazna datoteka, okrnjen JPEG in PNG, napačna zaglavja, CMYK JPEG, JPEG z okvarjenim EXIF segmentom, 5 MB + 1 bajt (`FILE_TOO_LARGE`), 4097 × 100 in 10 000 × 10 000 (`IMAGE_TOO_LARGE` pred dekodiranjem), »bomba« PNG; **pomnilnik**: dekodirana stranica ≤ 2048 pri 4096 × 4096 (JPEG, PNG, prepleten PNG) in otroški JVM z `-Xmx128m`, ki hkrati obdela dve sliki 4096 × 4096 brez `OutOfMemoryError`
- [ ] T015 [P] FR-018-15 — BE `image/UploadRateLimiter.java` (drsno okno 10/min/uporabnika, tudi za Google prevzem), `shared/error/RateLimitedException` + preslikava v `429 RATE_LIMITED` v `ApiExceptionHandler`, kode `INVALID_IMAGE`/`IMAGE_TOO_LARGE` kot polje `file` pod `VALIDATION_FAILED`; unit test `UploadRateLimiterTest` + `ImageErrorMappingTest`
- [ ] T016 [P] FR-018-22 — BE `image/ImageResponses.java`: odgovor slike z `Cache-Control: private, no-cache`, `ETag "<revision>-<size>"` (`If-None-Match` → 304), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, `Content-Disposition: inline`; unit test glav
- [ ] T017 [P] FR-018-22, FR-018-04 — FE `shared/images/imageCache.ts` (štetje referenc po ključu `pot + revision`, LRU 200, `URL.revokeObjectURL` ob izrivu in zadnji odmontaži, `clear()`, `clearGroup(groupId)`) in `useProtectedImage.ts` (`authFetchBlob`, `IntersectionObserver`, `401/403/404` odstrani vnos in vrne začetnice, brez zahtevka pri `photoRevision == null`); `imageCache.clear()` poveži z odjavo, `onSessionLost` in zamenjavo uporabnika v `features/auth/AuthProvider.tsx`; test `imageCache.test.ts`, `useProtectedImage.test.tsx` (MSW): števec `createObjectURL`/`revokeObjectURL` je po odjavi in odmontaži izenačen, nobenega aktivnega `blob:` po odjavi, izguba dostopa prikaže začetnice
- [ ] T018 [P] FR-018-21 — FE `shared/images/Avatar.tsx` (lastnosti `kind`, `name`, `colorSeed`, `size` 24/32/40/64/128, `src` iz `useProtectedImage`, začetnice (največ 2) v barvi iz 8 barv skupine design.md 4.2 kot besedilo in rob 1 px na `surface`, `alt` z imenom ali prazen, ko ime stoji ob avatarju) in `avatarColor.ts`; test `Avatar.test.tsx` (začetnice, barva po id, alt, vitest-axe)
- [ ] T019 FR-018-01, FR-018-04, FR-018-14 — FE `shared/images/ImageUploadDialog.tsx` + `CropCanvas.tsx` (design.md 8.10, 8.13): izbira datoteke ali povleci in spusti, predogled, kvadratni ali okrogel okvir, premik s povleko in puščicami, povečava z drsnikom in `+`/`−`, izvoz JPEG (PNG pri prosojnem viru) ≤ 1024 točk prek `createImageBitmap` z `imageOrientation: 'from-image'` (prebere tudi WebP), napredek, trajne napake z *Poskusi znova*, dokler nalaganje ne uspe, ostane stara slika; test `ImageUploadDialog.test.tsx` (izbira, obrezovanje s tipkovnico, napake po kodah, axe) in `imageApi.ts` (`upload`, `remove`, `photoPath`)
- [ ] T020 [P] — FE `shared/images/photoTypes.ts` in skupni testni pomočnik `frontend/src/test/imagesApi.ts` (MSW za vse poti slik, imena iz prevodov, §3.3)

---

## Phase 3: User Story 1 – Profilna slika uporabnika (P1) 🎯 MVP

**Goal**: nalaganje, zamenjava, odstranitev lastne slike; avatar v meniju računa, *Mojem računu* in seznamu članov.

**Independent Test**: uporabnik naloži sliko, jo vidi v meniju, zamenja in odstrani; drug uporabnik ne more spremeniti njegove slike.

- [ ] T030 [US1] FR-018-01, 02, 15, 16 — BE `image/MePhotoController.java` + `ImageService` (`PUT`, `GET`, `DELETE /api/me/photo`): multipart `file`, obdelava, `UploadRateLimiter`, zamenjava v transakciji, idempotenten `DELETE` (204); `Profile` dobi `photoRevision` (+ `ProfileRepository` in `MeController` brez drugih sprememb); IT `MePhotoIT` (nalaganje, zamenjava dvigne `revision`, stara slika ni več dostopna, odstranitev, `304` ob `If-None-Match`)
- [ ] T031 [P] [US1] FR-018-03, 22 — BE `GET /api/groups/{groupId}/members/{memberId}/photo` (`access.require(VIEWER)`, član mora biti v isti skupini, `404` sicer) + `Member.photoRevision` v `member/Member.java` in `MemberRepository.java`; IT `MemberPhotoIT`
- [ ] T032 [US1] FR-018-01..04 — FE: razdelek *Profilna slika* v `features/account/ProfilePhotoSection.tsx` (+ vstavitev v `AccountPage.tsx`), avatar v `shared/layout/AccountMenu.tsx`, avatar v `features/members/MemberCell.tsx`; `types.ts`/`api.ts` s `photoRevision`; testi `ProfilePhotoSection.test.tsx`, dopolnilo `MembersSection` testa (avatar s sliko in začetnicami), axe
- [ ] T033 [US1] FR-018-01, 02, 20 — E2E `e2e/tests/slike.spec.ts` (scenarij profilne slike: JPEG in PNG, obrezovanje s tipkovnico, zamenjava, odstranitev, avatar v meniju in v članih; `401` za zahtevek slike brez žetona; axe pri 360 in 1280 px) + `e2e/tests/support/images.ts` (testne datoteke, pomočniki)
- [ ] T034 [US1] FR-018-01, 02 — matrika (uporabniške poti): `MePhotoSecurityIT` za `GET`/`PUT`/`DELETE /api/me/photo`: neprijavljen (brez žetona, neveljaven, potekel) → `401`; drugi uporabnik ne vidi ali spreminja tuje slike (poti delujejo samo nad lastnim); `GET …/members/{memberId}/photo`: neprijavljen `401`, nečlan `404`, član druge skupine za memberId te skupine `404`, VIEWER+ `200`, arhivirana skupina `200`

---

## Phase 4: User Story 2 – Slika skupine (P1)

**Goal**: ADMIN/OWNER upravljata sliko skupine; vsi člani jo vidijo na seznamih, v glavi, preklopniku in nastavitvah.

**Independent Test**: admin naloži sliko; bralec jo vidi, a ne more spremeniti; nečlan ne dostopa.

- [ ] T040 [US2] FR-018-05, 06, 07, 08 — BE `image/GroupPhotoController.java` (`GET` VIEWER, `PUT`/`DELETE` ADMIN, `access.require(…, write=true)` za `409 GROUP_ARCHIVED`): del `version` (ali `?version=` pri `DELETE`) pred obdelavo preveri in poveča `contact_group.version` z `UPDATE … WHERE version = :v` (sicer `VERSION_CONFLICT` kot obstoječe), vrne `PhotoResult`; `photoRevision` v `GroupSummary`, `GroupDetail`, `ArchivedGroupSummary` (+ poizvedbe v `GroupRepository`); IT `GroupPhotoIT` (nalaganje, zamenjava, odstranitev, verzija, `VERSION_CONFLICT`, `ETag`)
- [ ] T041 [US2] FR-018-05..08, 21 — FE: razdelek *Slika skupine* v `features/groups/GroupDetailsSection.tsx` (le ADMIN/OWNER, tudi skrit pri arhivirani), avatar (kvadraten) v `GroupsPage.tsx`, `ArchivedGroupsList.tsx`, `GroupHeader.tsx`, `shared/layout/GroupSwitcher.tsx`; osvežitev verzije skupine po spremembi; testi (urednik in bralec akcij ne vidita, arhivirana skupina brez akcij, začetnice v barvi skupine), axe
- [ ] T042 [US2] FR-018-05..08 — matrika: `GroupPhotoSecurityIT` za vse tri vrstice (`GET` VIEWER, `PUT` ADMIN, `DELETE` ADMIN): neprijavljen (brez, neveljaven, potekel žeton) `401`; nečlan in neobstoječa skupina `404`; VIEWER in EDITOR za `PUT`/`DELETE` `403`; VIEWER+ za `GET` `200` (tudi arhivirana in trajno arhivirana); ADMIN in OWNER `2xx`; `PUT`/`DELETE` v arhivirani in trajno arhivirani skupini `409 GROUP_ARCHIVED`; `400` za neveljavno datoteko šele po `401 → 404 → 403 → 409`; zahtevek z znanim naslovom slike brez prijave ne vrne slike
- [ ] T043 [US2] FR-018-05, 06, 08 — E2E scenarij skupine v `e2e/tests/slike.spec.ts` (admin naloži, bralec vidi brez akcij, arhivirana, avatar na domači strani, 360 in 1280 px, axe)

---

## Phase 5: User Story 3 – Slika kontakta (P1)

**Goal**: urednik upravlja sliko kontakta; prikaz v seznamu, panelu, pogledu, obrazcu in primerjavi dvojnikov; vpliv na sled, obnovo, rollback in združevanje.

**Independent Test**: urednik naloži, zamenja, odstrani; sled to prikaže; izbris + obnova vrne sliko; združevanje ne podvaja.

- [ ] T050 [US3] FR-018-09, 10 — BE `image/ContactPhotoController.java` (`GET` VIEWER, `PUT`/`DELETE` EDITOR, `409 GROUP_ARCHIVED`): kontakt mora biti v skupini (`404` sicer, tudi za izbrisan kontakt); v **isti transakciji** zamenjava slike, `contact.version + 1` z `updated_at`/`updated_by`, `VERSION_CONFLICT` ob zastarelosti, vnos `UPDATE` v sledi prek `AuditLog` z `photo_change` ADDED/REPLACED/REMOVED in nespremenjenimi polji; `photoRevision` v `ContactSummary` in `ContactDetail` (poizvedbe v `ContactRepository`); IT `ContactPhotoIT`
- [ ] T051 [US3] FR-018-10, 17 — BE sled: `photoChange` v `audit/AuditEntry.java`, `AuditRepository`, `ContactHistoryRepository`/`HistoryViews`; `RestoreService` in `RollbackService` obravnavata vnos brez razlik polj kot »ni sprememb« (`RESTORE_NO_CHANGES` / `ROLLBACK_NO_CHANGES`) in ne spreminjata slike; IT `ContactPhotoAuditIT` (vnos in zgodovina vsebujeta `photoChange`, obnova stare različice obstoječega kontakta ne spremeni slike, rollback na tak vnos ne spremeni slike)
- [ ] T052 [US3] FR-018-10 — FE sled: `features/audit/auditSentence.ts`, `AuditEntryItem.tsx`, `AuditDetails.tsx`, `ChangeTable.tsx`, zgodovina kontakta (015): stavki »Dodana / Zamenjana / Odstranjena slika kontakta« tudi, ko so vsa druga polja nespremenjena; **nikoli** »Ni sprememb«; pri takem vnosu gumb obnove ni izrisan z razlago; testi `AuditPhotoChange.test.tsx` (vsi trije dogodki, vnos samo s sliko, pomešan vnos s poljem in sliko, axe)
- [ ] T053 [US3] FR-018-11 — BE združevanje: en klic `ImageStore.mergeInto(group, keeperId, loserIds)` v `contact/DuplicateService.merge` pred izbrisom poraženih (preživeli ohrani svojo; sicer prevzame sliko prvega poraženega z njo po starosti; slike drugih izbrisane; vnos `MERGE` brez slike); IT `ContactPhotoMergeIT` (preživeli s sliko, preživeli brez slike in dva poražena s slikama, noben nima slike, ni ostankov v `image`)
- [ ] T054 [US3] FR-018-12 — BE `image/ImageLifecycleIT`: izbris enega in **množični izbris** 50 kontaktov s slikami (`BulkService`), obnova izbrisanega kontakta (`RestoreService`, 015) vrne sliko, obnova kontakta brez slike ali s predhodno odstranjeno sliko brez napake, rollback skupine, ki kontakt odstrani in ponovno ustvari (slika sledi), rollback ne spremeni slike obstoječega kontakta, združevanje, uvoz (014) ustvari kontakte brez slik, izbris skupine (kaskada vključno z odklopljenimi slikami); **invarianta po vsakem testu**: za vsako vrstico `image` s `kind='CONTACT'` velja `detached_at IS NULL` natanko tedaj, ko kontakt obstaja v skupini, ni vrstic brez lastnika, izbrisan kontakt prek API vrne `404`; časovna meja: množični izbris 1000 kontaktov s sprožilci v razumnem času
- [ ] T055 [US3] FR-018-09, 21 — FE: razdelek slike v `features/contacts/ContactForm.tsx` (takojšnja sprememba prek API, posodobi verzijo obrazca, da shranjevanje polj ne sproži lažnega `VERSION_CONFLICT`), avatar v `ContactList.tsx`, `ContactView.tsx`, `features/duplicates/DuplicateCard.tsx` in `CompareColumns.tsx`; `types.ts`/`api.ts` s `photoRevision`; testi (seznam 100 vrstic: zahtevki samo za vidne z `photoRevision`, bralec brez akcij), axe
- [ ] T056 [US3] FR-018-09, 10 — matrika: `ContactPhotoSecurityIT` za `GET` (VIEWER), `PUT` (EDITOR), `DELETE` (EDITOR): neprijavljen (brez, neveljaven, potekel žeton) `401`; nečlan, neobstoječa skupina, **kontakt druge skupine pri članu skupine A**, neobstoječ in izbrisan kontakt `404`; VIEWER za `PUT`/`DELETE` `403`; VIEWER+ za `GET` `200` (tudi arhivirana, trajno arhivirana); EDITOR, ADMIN, OWNER za `PUT`/`DELETE` `2xx`; `PUT`/`DELETE` v arhivirani in trajno arhivirani `409 GROUP_ARCHIVED`; zastarela `version` `409 VERSION_CONFLICT`; abuse: datoteka z lažno vsebino, prevelika, brez dela `file` (`400 REQUIRED`), dva dela `file`
- [ ] T057 [US3] FR-018-09..12 — E2E: kontakt (nalaganje, seznam in pogled, zamenjava, odstranitev, sled prikaže dogodek, izbris in obnova vrneta sliko, združevanje, 360 in 1280 px, `@w768` za obrezovalnik, axe) v `e2e/tests/slike.spec.ts`

- [ ] T058 [US3] FR-018-13 — BE `ContactPhotoExportIT`: izvoz Excel, vCard (izbor in en kontakt), CardDAV (`PROPFIND`/`GET`) kontakta s sliko ne vsebuje slike (v vCard ni `PHOTO`), uvoz vCard s `PHOTO` slike ne ustvari (`omitted` ostane `PHOTO`); slike ne vplivajo na vsebino izvoza

---

## Phase 6: User Story 4 – Varna obdelava (P1)

**Goal**: pokrito s T012–T016 in T014. Preostali del povezav:

- [ ] T060 [US4] FR-018-14, 15 — povezovalni IT `ImageUploadAbuseIT` prek vseh treh končnih točk nalaganja (multipart brez dela `file`, dve datoteki, tip `image/png` z vsebino SVG, `.jpg` z vsebino GIF, 5 MB + 1, 10 nalaganj na minuto → 11. `429 RATE_LIMITED`): odgovori `400`/`429`, stanje baze nespremenjeno

---

## Phase 7: User Story 5 – Zasebnost, brisanje, prenosljivost (P2)

- [ ] T070 [US5] FR-018-18 — BE izvoz *Moji podatki*: polje `photo` (`contentType`, `base64` različice 512) v `account/MyData.java`, `MyDataRepository.java`, `ExportAssembler.java`; IT: izvoz vsebuje lastno sliko, ne vsebuje slik kontaktov in skupin; IT `AccountDeletionPhotoIT`: po izbrisu računa v `image` ni vrstice uporabnika, slike skupin in kontaktov, ki jih je naložil, ostanejo; FE `features/account/MyDataSection.tsx` omemba slike v razlagi (sl/en)
- [ ] T071 [US5] FR-018-19 — BE `ImageStorePortabilityTest`: obe vzporedni implementaciji vmesnika (Postgres in pomnilniška v testih) prestaneta isti nabor pogodbenih testov (`ImageStoreContract`); dokumentacija prehoda v `docs/decisions/2026-11-16-shramba-slik-v-bazi.md` (odločitev R-01, alternative, prehod na S3)

---

## Phase 8: User Story 6 – Slika Google računa (P3)

- [ ] T080 [P] [US6] FR-018-23 — BE `image/UrlGuard.java` (https, brez uporabniških podatkov, vrata 443, gostitelj po `images.google.allowed-hosts`, zavrnitev zanke, lokalnega, zasebnega, link-local, CGNAT, večpredvajanja, `0.0.0.0`, IPv6 ekvivalentov, IPv4-preslikanega IPv6); test `UrlGuardTest` s tabelo naslovov (vključno `169.254.169.254`, `localhost`, `127.1`, `[::1]`, `10.0.0.1`, `lh3.googleusercontent.com.evil.com`, `evil.com#lh3.googleusercontent.com`, `http://`, naslov z `@`)
- [ ] T081 [US6] FR-018-20, 23 — BE `image/GooglePhotoSource.java` (`HttpClient` brez sledenja preusmeritvam, povezava 3 s, zahtevek 5 s, branje toka z mejo 5 MB, `Content-Type` image/jpeg|png, zamenjava `=sNN-c` z `=s512-c`) in `POST /api/me/photo/google` v `MePhotoController` (naslov samo iz `jwt.getClaimAsString("picture")`, brez telesa; napaka → `409 GOOGLE_PHOTO_UNAVAILABLE`, razlog brez naslova v dnevnik); IT `GooglePhotoIT` z nadomestnim virom (brez omrežja): uspeh, žeton brez `picture`, naslov izven gostitelja, preusmeritev, prevelik odgovor, ne-slika, počasen odgovor, `RATE_LIMITED`; matrika: neprijavljen `401`
- [ ] T082 [US6] FR-018-20 — FE: gumb *Uporabi sliko Google računa* v `ProfilePhotoSection.tsx` samo, če Firebase uporabnik ima `photoURL` (samo boolean prek `features/auth/AuthGateway.ts`, naslov se ne nalaga ne pošilja); napaka `GOOGLE_PHOTO_UNAVAILABLE` razumljivo; test z MSW (gumb skrit brez slike, izrisan z njo, uspeh, napaka)

---

## Phase 9: Polish & cross-cutting

- [ ] T090 — `feature-map.md`: vrstica 018 v tabeli funkcionalnosti, kodi `GOOGLE_PHOTO_UNAVAILABLE` (409) in `RATE_LIMITED` (429, opomba v §2.2), pravilo slik v §2.6 (omejitve, ena slika na lastnika) in §2.7 (sprememba slike je vnos `UPDATE` z `photo_change`); `design.md`: kratek razdelek avatar in nalaganje slike (8.17) in posodobitev 9.9 (*Profilna slika*); `docs/decisions/2026-11-16-shramba-slik-v-bazi.md` (če še ni iz T071); spec.md popravi, če se je vedenje spremenilo
- [ ] T091 — Zaledje: izpolni matriko izolacije (pregled, da vsak redek v plan.md *Public Interfaces* ima naloge T034, T042, T056, T081) in `GroupIsolationMatrixSecurityIT`-slog po obstoječem vzorcu
- [ ] T092 — `./verify.sh quick` zelen; `./verify.sh backend` za IT in matriko; `./verify.sh e2e` (lahko samo `slike.spec.ts` in dimni testi, nato celoten e2e pred PR)
- [ ] T093 — **Številčenje migracij pred PR** (plan, dopolnitev 5): `git fetch origin`; največja številka v `origin/main`, v vejah/worktreejih 016 in 017 (`git ls-tree -r --name-only <veja> backend/src/main/resources/db/migration`); 018 = največja obstoječa ali načrtovana + 1, preimenuj `V14__slike.sql` po potrebi in posodobi sklice v data-model.md, plan.md; če 016 še nima migracije, to zapiši v PR; opis PR navaja vrstni red 016 → 017 → 018; ponovi preverjanje tik pred oddajo PR
- [ ] T094 — Uskladitev z `origin/main` (merge main v vejo), `quick` ponovno, lokalni E2E, opis PR (spremenjeni obstoječi testi z razlogom, predpostavke, neodpravljene ugotovitve `pregled-testov`); PR se ne združi

---

## Dependencies & Execution Order

- Setup (T001–T004) → Foundational (T010–T020) → zgodbe. US1 je MVP in uvede skupni mehanizem (prvi dokaz T001 in E2E T033).
- US2 in US3 sta neodvisni po Foundational; US3 (sled, združevanje, življenjski cikel) je najobsežnejša. US6 po US1 (uporablja isti endpoint in razdelek). US5 po US1 in US3.
- T014 in T017–T019 lahko tečejo vzporedno (različne datoteke). BE in FE delo posamezne zgodbe je neodvisno, dokler je pogodba `contracts/openapi.yaml` fiksna.

## Implementation Strategy

MVP: Foundational + US1; nato US2, US3 (jedro tveganja), US5, US6; Polish na koncu. Implement poteka v enem prehodu: koda in testi skupaj, po zgodbah; `./verify.sh quick` po vsaki zgodbi, `backend` po US2 in US3, `e2e` po US3 in pred PR.
