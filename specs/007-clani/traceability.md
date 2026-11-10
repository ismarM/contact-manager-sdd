# Sledljivost: Člani skupine (007)

Vsak FR-ID → scenarij → testi (datoteka › ime testa) → stanje. Stanje po fazi Testi: testi so napisani in padejo zaradi manjkajočega vedenja
(`501` iz ogrodja `MemberController`, prazne komponente, `not implemented`); izjeme so navedene v razdelku *Testi, ki že uspejo*.
Stanje se posodobi po implementaciji (T045).

| FR-ID | Scenarij | Testi (BE › FE › E2E) | Stanje |
|---|---|---|---|
| FR-007-01 | Seznam članov po vlogi in imenu, »(ti)«, paginacija, arhivirana, trajno arhivirana | `MemberListIT`, `MemberIsolationMatrixSecurityIT` › `MembersSection.test` › `clani.spec` | pade (pričakovano) |
| FR-007-02 | Meni dejanj samo ob strogo nižjih, lastnik/admin, nearhivirana | `MemberRulesTest`, `MemberListIT` (`canManage`) › `MembersSection.test` › `clani.spec` | pade (pričakovano) |
| FR-007-03 | Sprememba vloge, »le nižjim od sebe«, dovoljene vloge, 400 | `MemberRoleChangeIT`, `MemberRoleMatrixSecurityIT`, `MemberRulesTest`, `MemberInputParserTest`, `MemberIsolationMatrixSecurityIT` › `ChangeRoleDialog.test` › `clani.spec` | pade (pričakovano) |
| FR-007-04 | Optimistično zaklepanje, `VERSION_CONFLICT`, razrešitev | `MemberRoleChangeIT`, `MemberConcurrencyIT`, `MemberLockingIT`, `MemberMigrationIT` › `ChangeRoleDialog.test` › `clani.spec` | pade (pričakovano); `MemberMigrationIT` uspe (V7 je ogrodje) |
| FR-007-05 | Odstranitev člana, izguba dostopa, 404 po odstranitvi | `MemberRemoveIT`, `MemberRoleMatrixSecurityIT`, `FormerMemberSecurityIT`, `MemberIsolationMatrixSecurityIT`, `MemberAuditIT` › `RemoveMemberDialog.test` › `clani.spec` | pade (pričakovano) |
| FR-007-06 | Zapuščanje skupine, tudi arhivirane | `MemberLeaveIT`, `FormerMemberSecurityIT`, `MemberIsolationMatrixSecurityIT` › `LeaveGroup.test` › `clani.spec` | pade (pričakovano) |
| FR-007-07 | Lastnik ne more zapustiti (`OWNER_CANNOT_LEAVE`) | `MemberLeaveIT`, `MemberIsolationMatrixSecurityIT` › `LeaveGroup.test` › `clani.spec` | pade (pričakovano) |
| FR-007-08 | Zadnji član trajno arhivirane skupine (`LAST_MEMBER_CANNOT_LEAVE`), sočasnost | `MemberLeaveIT`, `MemberConcurrencyIT`, `MemberLockingIT` › `LeaveGroup.test` › `clani.spec` | pade (pričakovano) |
| FR-007-09 | Prenos lastništva, atomarnost, `TARGET_NOT_MEMBER`, potrditev z naslovom | `OwnershipTransferIT`, `MemberConcurrencyIT`, `MemberLockingIT`, `MemberInputParserTest`, `MemberIsolationMatrixSecurityIT` › `TransferOwnership.test` › `clani.spec` | pade (pričakovano) |
| FR-007-10 | Arhivirana skupina: `GROUP_ARCHIVED` za spremembo vloge, odstranitev, prenos; zapuščanje dovoljeno | `MemberRoleChangeIT`, `MemberRemoveIT`, `OwnershipTransferIT`, `MemberLeaveIT`, `MemberIsolationMatrixSecurityIT`, `MemberRoleMatrixSecurityIT` › `MembersSection.test`, `TransferOwnership.test` › `clani.spec` | pade (pričakovano) |
| FR-007-11 | Sporočila uspeha in neuspeha brez tehničnih kod, sl/en | – › `MembersSection.test`, `ChangeRoleDialog.test`, `RemoveMemberDialog.test`, `LeaveGroup.test`, `TransferOwnership.test` › `clani.spec` | pade (pričakovano) |
| FR-007-12 | Brez zapisov v revizijsko sled; imena bivših članov ostanejo | `MemberAuditIT`, `MemberRemoveIT`, `MemberLeaveIT` › – › `clani.spec` | pade (pričakovano); `MemberArchitectureTest` uspe (varovalo) |

Merljiva merila: SC-001 – `FormerMemberSecurityIT`; SC-002 – `MemberConcurrencyIT`, `MemberLockingIT`; SC-003 – `MemberConcurrencyIT`,
`MemberLockingIT`, `OwnershipTransferIT`; SC-004 – `clani.spec` (sprememba vloge v štirih dejanjih); SC-005 – `MemberRulesTest`,
`MemberRoleMatrixSecurityIT` (ročne dobesedne tabele 64/32/4 in 128/32); SC-006 – axe v vseh FE testih in E2E v sl in en pri 360/768/1280 px (in 320 px).

## Testi, ki že uspejo pred implementacijo (zavestne izjeme, D-59)

- `MemberMigrationIT` (4 testi): migracija V7 je del ogrodja (T001), zato preverjanje V6 → V7 z obstoječimi podatki uspe že zdaj.
- `MemberArchitectureTest › memberPackageDoesNotUseAudit`: arhitekturno varovalo (D-59, brez oznake FR-ID, dinamičen pregled vseh razredov paketa); ogrodje paketa `member` ne uporablja `audit`.
- 30 + 6 vrstic `MemberIsolationMatrixSecurityIT` (neprijavljen, pokvarjen in potekel žeton → `401`): privzeta zavrnitev Spring Security velja za nove poti že ob ogrodju.
- `MemberRulesTest › literalTablesHaveTheFullNumberOfCombinations`, `MemberRoleMatrixSecurityIT › literalTablesHaveTheFullNumberOfCombinations`: meta-test velikosti ročnih tabel.
- `MemberRulesTest`, `MemberInputParserTest`: ogrodje meče `UnsupportedOperationException`, zato padejo vse vrstice (razen meta-testa velikosti tabel).

## Odstopanja od tasks.md (testna faza)

- BE testi uporabljajo dodatno osnovo `member/support/MemberApiTest` (kratki klici petih endpointov, `GroupFixtures`, `InvitationFixtures`,
  `MemberFixtures`), ki je ni v T003; vsebuje samo pomožne klice HTTP, brez logike.
- FE: v `test/membersApi.ts` je poleg T004 še `renderMembersApp` (združi `mockMembersApi` in `renderGroupsApp`) ter privzeti rokovalnik
  `GET /api/groups/:groupId/members` v `test/msw.ts`.
- E2E: `auditCount` se uporablja iz obstoječega `support/audit.ts` (T005 ga ne podvaja).
- `ProfileIT › concurrentFirstSignInsCreateExactlyOneProfile` (001) je pri enem zagonu padel (`500, 201`); test je neodvisen od V7 in je po ponovitvi zelen
  (glej poročilo faze Testi).

## Pregled testov

Agent `pregled-testov` (workflow §4.2): krogi 1–7 ZAVRNJENO (vsakič s popravki testov: selektorji, angleška besedila FR-007-11, sočasni primeri T017, `lang`, axe v E2E, napačne strani v E2E), **krog 8 SPREJETO** (nov agent).
Priporočila kroga 8 (brez vpliva na izid): axe v en za poglede lastnika/admina v E2E, fokus po menjavi strani paginacije, natančen zapis časa v opozorilu konflikta, opis ogrodja v T006 (meče `UnsupportedOperationException`).
