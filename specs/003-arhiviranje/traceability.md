# Traceability: Arhiviranje in izbris skupine (003)

*rdeč (pričakovano)* = test obstaja in pred implementacijo pade zaradi manjkajočega vedenja; *zelen* = test prestane lokalno.

| FR-ID | Scenarij | Testi (datoteka › test) | Stanje |
|---|---|---|---|
| FR-003-01 | arhiviranje, dialog, 401/403/404/409 | GroupArchiveIT; ArchiveIsolationMatrixSecurityIT; GroupArchiveConcurrencyIT › exactlyOneOfTwoConcurrentArchivesWins; GroupManagementSection.test.tsx (arhiviranje); arhiviranje.spec.ts › FR-003-01 … | rdeč (pričakovano) |
| FR-003-02 | skupina izgine iz seznamov po vlogah | GroupArchiveIT › archivedGroupLeavesTheRoleSectionsButMembersStillReadIt; ArchivedGroupListIT; ArchivedNavigation.test.tsx | rdeč (pričakovano) |
| FR-003-03 | samo za branje, 403 pred 409 | ArchivedWriteRuleIT; ArchiveIsolationMatrixSecurityIT; GroupArchiveConcurrencyIT › editingRacingWithArchiving… | delno zelen (pravila 002) |
| FR-003-04 | brez akcij spreminjanja, 409 v obrazcu | ArchivedWriteRuleIT; ArchivedEditing.test.tsx; GroupManagementSection.test.tsx; arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-05 | pasica | ArchivedBanner.test.tsx; arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-06 | odarhiviranje | GroupUnarchiveIT; GroupArchiveConcurrencyIT › …Unarchives…; ArchivedBanner.test.tsx; GroupManagementSection.test.tsx (odarhiviranje); arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-07 | seznam arhiviranih, paginacija, prazno stanje | ArchivedGroupListIT; ArchivedGroupsPage.test.tsx; ArchivedNavigation.test.tsx; arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-08 | trajno arhivirana | GroupUnarchiveIT; GroupDeleteIT; ArchivedGroupListIT; ArchivedWriteRuleIT; ArchiveIsolationMatrixSecurityIT › permanentlyArchivedGroupMatrix; ArchivedBanner.test.tsx; ArchivedGroupsPage.test.tsx; arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-09 | izbris samo edinega člana | GroupDeleteIT; ArchiveIsolationMatrixSecurityIT; GroupManagementSection.test.tsx (izbris); arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-10 | gumb ali razlaga, dialog z vpisom naslova | GroupDeleteIT › canDeleteReflects…; GroupManagementSection.test.tsx (izbris); arhiviranje.spec.ts | rdeč (pričakovano) |
| FR-003-11 | po izbrisu 404, podatki izbrisani | GroupDeleteIT; GroupManagementSection.test.tsx; arhiviranje.spec.ts. Kontakti, sled, povabila: 004–006 (D-35 točka 5) | rdeč (pričakovano) |

## Pregled testov

| Krog | Izid | Ugotovitve |
|---|---|---|
| 1 | ZAVRNJENO | iskanje po golem besedilu (getByText); `region` »Upravljanje skupine« ni bil v planu; matrika brez trajno arhivirane skupine; ni testa velikosti strani; jeziček |
| 2 | ZAVRNJENO | v arhivirani skupini brez asercij za Izbriši/razlago pri `canDelete` |
| 3 | SPREJETO | priporočila (ne vplivajo na izid): sočasni izbris proti pridružitvi člana (006), dolg opis |
