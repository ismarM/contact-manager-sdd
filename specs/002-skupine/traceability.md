# Traceability: Skupine kontaktov (002)

Stanje se posodobi pred sprejemom (workflow.md §4.4). *rdeč (pričakovano)* = test obstaja in pred implementacijo pade
zaradi manjkajočega vedenja (BE `501` ali `not implemented`, FE prazna komponenta, E2E manjkajoči element); *zelen* =
test prestane lokalno (BE Maven Surefire/Failsafe s Testcontainers in Firebase Auth Emulator, FE Vitest, E2E Playwright
proti Docker Compose pri 360/768/1280 px).

| FR-ID | Scenarij | Testi (datoteka › test) | Stanje |
|---|---|---|---|
| FR-002-01 | dialog *Nova skupina*, ustvarjanje, 401 | GroupCreateIT › creatorBecomesTheOnlyMemberWithRoleOwner, userWithoutPriorProfileSyncCanCreateAGroup, titlesAreNotUnique; GroupIsolationMatrixSecurityIT › userEndpointsRequireSignIn; NewGroupDialog.test.tsx › FR-002-01 (×4); Sidebar.test.tsx › FR-002-01; skupine.spec.ts › FR-002-01 … (×2) | zelen |
| FR-002-02 | pravila naslova, opisa, barve pri ustvarjanju in urejanju | GroupInputParserTest (×14); GroupCreateIT › invalidDataIsRejectedAndNothingIsCreated (×5), titleIsStoredTrimmed; GroupUpdateIT › invalidDataIsRejectedAndNothingChanges (×5); groupValidation.test.ts (×8); NewGroupDialog.test.tsx › FR-002-02 (×4); GroupDetailsSection.test.tsx › FR-002-02 (×3); skupine.spec.ts › FR-002-02 | zelen |
| FR-002-03 | ustvarjalec edini OWNER, privzeta tinta, obvestilo, odprta skupina | GroupColorTest (×3); GroupInputParserTest › createWithoutColorOrDescriptionUsesDefaults; GroupCreateIT › creatorBecomesTheOnlyMemberWithRoleOwner, groupWithoutColorGetsTinta; NewGroupDialog.test.tsx › FR-002-03 (×2); skupine.spec.ts › FR-002-01 FR-002-03 … | zelen |
| FR-002-04 | razdelki po vlogi, vrstica, paginacija, ICU red, brez arhiviranih in tujih | GroupListIT (×14 primerov); GroupsPage.test.tsx › FR-002-04 (×4 + axe); GroupSection.test.tsx (×4 + axe); skupine.spec.ts › FR-002-04 …, SC-002 | zelen |
| FR-002-05 | prazno stanje | GroupListIT › userWithoutGroupsGetsNoSections, userWithoutProfileGetsNoSections; GroupsPage.test.tsx › FR-002-05; skupine.spec.ts › FR-002-01 … FR-002-05 | zelen |
| FR-002-06 | stranski pas ≥ 1024 px, meni preklopa < 1024 px, največ 10, trenutna skupina | GroupListIT › groupsAreGroupedByRole…, eachSectionIsPaginatedSeparately (`size=10`); Sidebar.test.tsx (×6 + axe); GroupSwitcher.test.tsx (×4 + axe); skupine.spec.ts › FR-002-06 | zelen |
| FR-002-07 | glava (vloga »Vloga: …«, *Arhivirano*), navigacija razdelkov (povezave, ne zavihki) | GroupReadIT › memberReadsTheGroupWithOwnRole, archivedGroupCanStillBeRead; GroupIsolationMatrixSecurityIT (`GET`); GroupLayout.test.tsx › FR-002-07 (×5 + axe); skupine.spec.ts › FR-002-04 …, FR-002-07 FR-002-04 (320 px) | zelen |
| FR-002-08 | 404 za nečlana, neobstoječo in neveljavno skupino; »Te strani ni« | GroupReadIT › nonMemberAndMissingGroupGetTheSameEmpty404; GroupUpdateIT › missingOrMalformedGroupIs404WithEmptyBodyBeforeValidation; GroupIsolationMatrixSecurityIT (nečlan); GroupLayout.test.tsx › FR-002-08 (×3); skupine.spec.ts › FR-002-04 … FR-002-08 | zelen |
| FR-002-09 | naslovi strani sl/en | GroupsPage.test.tsx › FR-002-09; GroupLayout.test.tsx › FR-002-09; skupine.spec.ts › FR-002-09 SC-006, FR-002-09 FR-002-11 | zelen |
| FR-002-10 | podatki skupine za vse člane, brez obrazca za nižje vloge | GroupReadIT › memberReadsTheGroupWithOwnRole, lastEditorWhoDeletedTheAccountIsReportedAsNull, creatorWithoutNameIsReportedWithNullName; GroupIsolationMatrixSecurityIT (`GET`); GroupDetailsSection.test.tsx › FR-002-10 (×3); skupine.spec.ts › FR-002-04 … FR-002-10 | zelen |
| FR-002-11 | urejanje za ADMIN/OWNER nearhivirane; 403/409 GROUP_ARCHIVED | GroupUpdateIT › adminChangesTitleAndColor…, ownerClearsTheDescription, archivedIsCheckedBeforeVersion…; GroupIsolationMatrixSecurityIT (`PUT`); GroupDetailsSection.test.tsx › FR-002-11 (×4); skupine.spec.ts › FR-002-09 FR-002-11 | zelen |
| FR-002-12 | verzija, nespremenjeno shranjevanje, konflikt in razrešitev | GroupUpdateIT › savingUnchangedData…, staleVersionIsAConflict… (×2); GroupConcurrencyIT (×10); client.test.ts › FR-002-12 (×2); conflictMessage.test.ts (×5); GroupDetailsSection.test.tsx › FR-002-12 (×5); skupine.spec.ts › FR-002-12 | zelen |
| FR-002-13 | sporočila neuspeha brez kod, vnosi ostanejo | client.test.ts › FR-002-13; NewGroupDialog.test.tsx › FR-002-13 (×2); GroupsPage.test.tsx › FR-002-13; GroupDetailsSection.test.tsx › FR-002-13 (×5); skupine.spec.ts › FR-002-13 | zelen |

Pred implementacijo (commit `test(002)`) so bili vsi testi 002 rdeči iz pravega razloga; izjemi: `GroupColorTest` › `unknownOrWrongCaseNameIsNotAColor` in `defaultColorIsTinta` sta uspela že na ogrodju (`fromCode` vrne
prazno, `DEFAULT = TINTA` je del ogrodja T007); pozitivni primeri istega razreda padejo, zato vedenje ni predčasno
zadovoljeno. V matriki izolacije uspe 18 vrstic `401`, ki jih zagotavlja varnostni sloj iz 001.

Merila uspeha: SC-002 – skupine.spec.ts › SC-002 (100 skupin, < 2 s v brskalniku), GroupListIT (največ 100 na razdelek);
SC-003 – GroupReadIT, GroupIsolationMatrixSecurityIT; SC-004 – GroupConcurrencyIT; SC-005 – ročni preizkus (quickstart #11,
T050); SC-006 – axe v vseh funkcionalnih testih FE in v E2E v sl in en.

## Pregled testov

Neodvisen podagent `pregled-testov` (`.claude/agents/pregled-testov.md`), vsak krog nov primerek; dobil je mapo
`specs/002-skupine/`, seznam testnih datotek in podpore ter izpise zagonov.

| Krog | Izid | Ugotovitve | Odprava |
|---|---|---|---|
| 1 | ZAVRNJENO | (1) prazno stanje je zahtevalo odsotnost `h2`, plan predpisuje `heading` ravni 2; (2) prazno stanje iskano po golem besedilu; (3) `closest('[aria-busy]')` (CSS); (4) `findByText` za napako barve; (5) E2E axe ni pokril vseh stanj sl/en; (6) `PUT` na neobstoječo/neveljavno skupino ni preverjen | `heading` ravni 2 »Nimaš še nobene skupine.«; iskanje po vlogi; `getByRole('list', { busy: true })`; `toHaveAccessibleDescription`; axe v E2E za en prazen zaslon, dialog z napako, branje sl/en, konflikt en, arhivirana en, FR-002-13, 320 px, tipkovnica; nov test 404 za `PUT` (GroupUpdateIT). Priporočila: besedilo omrežne napake v E2E, vrstni red barv po imenih, `main` brez naslova tuje skupine |
| 2 | ZAVRNJENO | (1) obrazec *Podatki skupine*: brez 101/1001 znakov in brez prikaza strežniškega `400 errors[]` ob polju; (2) »Uporabi trenutno različico« ne preveri prevzema verzije | dva nova testa v GroupDetailsSection.test.tsx; test razrešitve po prevzemu shrani in preveri `version: 5`. Priporočila: `rowheader` ali `cell`, matrika pri `PUT 200` preveri spremenjeno vrstico, ohranjen naslov ob `400` barve, brez `tablist` |
| 3 | **SPREJETO** | ni | – |

**Priporočila kroga 3 (niso pogoj; test se po pregledu spremeni samo z vnosom v DECISIONS.md):** `changedAt = new Date()` v
GroupDetailsSection.test.tsx lahko ob polnoči sproži dodan datum v sporočilu (fiksen `now`); FE testi zaslona *Skupine*
ločijo zahtevke po `size=25`, kar zahteva izrecen `size`; besedilo obvestil se išče z `getByText` v regiji »Obvestila«
(skladno z R-11); E2E »admin spremeni naslov« ureja lastnik; E2E konflikta ne preveri gumba »Uporabi trenutno različico«;
GroupSwitcher ne preveri cilja »Vse skupine«; v en ni preverjen gumb "Close notification"; tipkarska napaka »ista koledarska
dan« v imenih testov conflictMessage.

## Spremembe po pregledu testov

| Datum | Datoteka | Sprememba | DECISIONS |
|---|---|---|---|
| 2026-11-06 | frontend/src/test/setup.ts (podpora testom) | jsdom nadomestek `Element.setPointerCapture` brez vedenja – Sonner ga kliče ob zapiranju obvestila; brez njega je Vitest javil neobravnavano napako, čeprav so asercije uspele | D-32 |

Testne datoteke in asercije po commitu `test(002)` niso spremenjene.

## Preverjanje

| Datum | Kaj | Rezultat |
|---|---|---|
| 2026-11-05 | `./verify.sh quick` pred spremembami 002 | zelen |
| 2026-11-06 | BE unit (`surefire:test`) | 22 padcev v 002 (`not implemented`, `fromCode`), 31 testov 000/001 zelenih |
| 2026-11-06 | BE integracijski (`failsafe@integration`) | 51 testov 002 pade s `501`; 30 testov 000/001 zelenih |
| 2026-11-06 | BE varnostni (`failsafe@security`) | matrika 002: 20 pade s `501`, 18 (`401`) zelenih; 50 testov 000/001 zelenih |
| 2026-11-06 | FE unit in funkcionalni (Vitest) | 16 + 87 padcev v 002 (`not implemented`, manjkajoči elementi); 57 + 50 testov 000/001 zelenih |
| 2026-11-06 | E2E (Compose `contact-manager-verify`, 3 širine) | 33 padcev v 002 (manjkajoči elementi); 99 testov 000/001 zelenih |
| 2026-11-06 | BE po implementaciji US1–US4 | unit 53, integracijski 81, varnostni 88 – vse uspe (prvi zagon brez popravkov kode zaledja) |
| 2026-11-06 | FE po implementaciji | unit 73, funkcionalni 137 – vse uspe; popravljeno v implementaciji: podvojeno obvestilo (Sonner predvaja aktivna obvestila novemu Toasterju → `toast.dismiss()` ob odstranitvi ogrodja) |
| 2026-11-06 | `./verify.sh full` | 1. zagon PADLO (funkcionalni FE: neobravnavana napaka `setPointerCapture` v jsdom); po D-32 **zelen** (227 s): E2E 132 (99 iz 000/001, 33 iz 002, tudi SC-002 < 2 s) |
