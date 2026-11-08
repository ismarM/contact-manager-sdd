# Sledljivost: Povabila v skupino (006)

Vsak FR-ID → testi → stanje. Stanje po implementaciji: BE integracijski in varnostni (207 testov povabil) ter FE funkcionalni (87 testov povabil, vseh 479) so zeleni; E2E `povabila.spec` (21 primerov pri 360/768/1280 px) in celoten
nabor E2E (243) sta zelena.

| FR-ID | BE integracijski / varnostni | FE funkcionalni | E2E | Stanje |
|---|---|---|---|---|
| FR-006-01 | – | `InviteMemberSection.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-02 | `InvitationCreateIT`, `InvitationCreateRulesIT`, `InvitationAuditIT`, `InvitationIsolationMatrixSecurityIT` | `InviteMemberSection.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-03 | `InvitationInputParserTest`, `InvitationCreateRulesIT`, `InvitationConcurrencyIT` | `InviteMemberSection.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-04 | – | `InviteMemberSection.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-05 | `ReceivedInvitationListIT`, `ReceivedInvitationSecurityIT` | `InvitationsPage.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-06 | `ReceivedInvitationListIT` (count), `ReceivedInvitationSecurityIT` | `InvitationsLink.test`, `InvitationAccept.test`, `InvitationDecline.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-07 | `ReceivedInvitationListIT` | `InvitationsPage.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-08 | `InvitationAcceptIT`, `InvitationConcurrencyIT`, `InvitationAuditIT`, `ReceivedInvitationSecurityIT` | `InvitationAccept.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-09 | `InvitationAcceptIT`, `InvitationConcurrencyIT` | `InvitationAccept.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-10 | `InvitationDeclineIT`, `InvitationAuditIT`, `ReceivedInvitationSecurityIT` | `InvitationDecline.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-11 | `ReceivedInvitationSecurityIT`, `InvitationConcurrencyIT` | `InvitationAccept.test`, `InvitationDecline.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-12 | `ReceivedInvitationListIT`, `InvitationAcceptIT` | – | – | zelen (BE, FE) |
| FR-006-13 | `OutgoingInvitationListIT`, `InvitationIsolationMatrixSecurityIT` | `PendingInvitations.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-14 | `InvitationWithdrawIT`, `InvitationIsolationMatrixSecurityIT`, `InvitationAuditIT` | `PendingInvitations.test`, `WithdrawInvitation.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-15 | `InvitationWithdrawIT` | `WithdrawInvitation.test` | `povabila.spec` | zelen (BE, FE, E2E) |
| FR-006-16 | `InvitationWithdrawIT`, `InvitationConcurrencyIT` | `WithdrawInvitation.test` | `povabila.spec` | zelen (BE, FE, E2E) |

Merljiva merila: SC-001, SC-002, SC-007 – `povabila.spec`; SC-003 – `InviteMemberSection.test` (vseh pet razlogov v sl in en); SC-004 –
`ReceivedInvitationSecurityIT`, `InvitationIsolationMatrixSecurityIT`, `InvitationConcurrencyIT`; SC-005 – `InvitationsLink.test`,
`povabila.spec`; SC-006 – axe v vseh FE testih in E2E v sl in en.

## Odstopanja od tasks.md (testna faza)

- BE testi uporabljajo dodatno osnovo `invitation/support/InvitationApiTest` (kratki klici API-ja in `GroupFixtures` +
  `InvitationFixtures`), ki je ni v T003; vsebuje samo pomožne klice HTTP, brez logike.
- FE: v `test/invitationsApi.ts` je poleg T004 še `renderInvitationsApp` (združi `mockInvitationsApi` in `renderGroupsApp`).
- Preverjanje postavitve pod 640 px (zložena preglednica, brez vodoravnega drsenja) jsdom ne zmore; preverja ga E2E
  (`expectNoHorizontalScroll` pri 360 px), FE test preverja samo, da vrstice ostanejo dostopne kot preglednica.

## Pregled testov

Agent `pregled-testov` (neodvisen, vsak krog nov agent): štirje krogi, vsi ZAVRNJENO z ugotovitvami, ki so bile po vsakem krogu odpravljene.

1. Krog 1: selektorji po golem besedilu, nenatančen datum, manjkajoča izbira velikosti strani, neobstoječa skupina v matriki, vrstni red pri umiku → popravljeno.
2. Krog 2: prazno stanje preverjeno na tabeli, angleška besedila preverjanja, DELETE v matriki trajno arhivirane skupine → popravljeno.
3. Krog 3: test zavrnitev, ki je prestal pred implementacijo → statusi in kode; dodan test umik → sprejem.
4. Krog 4 (dodatni krog, odobril razvijalec): manjkajoče preverjanje osvežitve števila po 404 pri zavrnitvi → popravljeno; priporočila uvedena.

Zadnji popravek (krog 4) ni bil ponovno pregledan; razvijalec je odobril nadaljevanje z implementacijo.
