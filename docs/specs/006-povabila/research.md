# Research: Povabila v skupino (006)

**Datum:** 2026-11-08 · **Vhod:** [spec.md](spec.md) (s pojasnili 2026-11-08), konstitucija, `feature-map.md` §2.1, §2.2, §2.4–§2.6,
§2.8, §2.10, `design.md` 7.1, 8.4–8.6, 8.9–8.13, 8.15, 9.7, 9.8, plan in koda 001–005 (`UserDirectory`, `GroupAccess`, `GroupRepository.lockState`,
`AppShell`, `SettingsPage`, `SectionPagination`, `ContactInputParser`). Nove knjižnice niso potrebne. Odločitve so zapisane v `DECISIONS.md` D-55.
Nejasnosti (`NEEDS CLARIFICATION`) ni.

---

## R-01 Povabilo je vrstica, ki obstaja le, dokler čaka

- **Decision:** tabela `invitation` hrani samo čakajoča povabila. Sprejem, zavrnitev in umik vrstico izbrišejo; zgodovine ni.
- **Rationale:** spec (*Key Entities*): »Po sprejemu, zavrnitvi ali umiku povabilo preneha obstajati.« Izvoz 012 vsebuje samo čakajoča
  povabila; revizijska sled povabil ne beleži (FR-005-06). Brez stolpca `status` ni stanj, ki bi jih morali filtrirati v vsaki poizvedbi.
- **Alternatives:** stolpec `status` (`PENDING/ACCEPTED/DECLINED/WITHDRAWN`) – hrani podatke, ki jih noben FR ne bere, in otežuje GDPR
  (zgodovina, kdo je koga vabil); mehki izbris – enako.

## R-02 En čakajoči par z unikatnim ključem

- **Decision:** `UNIQUE (group_id, invitee_id)`. Pravila FR-006-03 se preverijo v vrstnem redu pod zaklepom vrstice skupine; ključ je
  varovalka baze – če bi do kršitve unikatnosti pri vstavljanju vseeno prišlo (npr. ob prihodnji poti brez zaklepa), se prevede v
  `409 INVITATION_ALREADY_PENDING`.
- **Rationale:** ker obdelana povabila izginejo (R-01), unikatnost para natančno izrazi pravilo »največ eno čakajoče povabilo«.
  Zaklep vrstice skupine (R-04) že serializira pošiljanja v isto skupino; ključ je varovalka baze.
- **Alternatives:** delni unikatni indeks s `status = 'PENDING'` (potreben le pri R-01 alternativi); samo preverjanje v aplikaciji (dirka).

## R-03 Reference na uporabnike namesto kopij osebnih podatkov

- **Decision:** `invitee_id bigint NOT NULL REFERENCES app_user ON DELETE CASCADE`, `inviter_id bigint REFERENCES app_user ON DELETE SET NULL`.
  E-naslov in ime se ob branju pridružita iz `app_user`. `inviter_id IS NULL` → `invitedBy: null` → »izbrisan uporabnik«.
- **Rationale:** izbris računa povabljenega izbriše njegova povabila (spec *Edge Cases*, FR-012-08) brez kode v 012; izbris povabitelja
  ohrani povabilo (FR-012-11) in anonimizira povabitelja (§2.5) – isti vzorec kot `contact_group.updated_by` (002) in `audit_entry.actor_id`
  (005). Znižanje ali odstranitev povabitelja iz skupine na povabilo ne vpliva, ker se `inviter_id` ne veže na članstvo.
- **Alternatives:** kopija e-naslova povabljenega v povabilu (podvojen osebni podatek, ostane po izbrisu); FK na `group_member` (povabilo bi
  izginilo z odstranitvijo povabitelja, kar spec prepoveduje).

## R-04 Zaklep vrstice skupine pri pošiljanju in sprejemu

- **Decision:** pošiljanje in sprejem v transakciji najprej zakleneta vrstico `contact_group` (`SELECT … FOR UPDATE`, kot `lockState` v 003),
  šele nato beremo ali pišemo `invitation` in `group_member`. Pošiljanje pod zaklepom ponovno preveri arhiviranost. Umik in zavrnitev
  zaklepa skupine ne potrebujeta: brišeta eno vrstico povabila z `DELETE … WHERE id = :id AND <lastništvo> RETURNING …`.
- **Rationale:** arhiviranje (003) in izbris skupine (003, šteje člane pod zaklepom – robni primer »med dialogom izbrisa se pridruži nov
  član«) zaklepata isto vrstico, zato se sprejem z njima ne prepleta; enak vrstni red zaklepov (skupina → povabilo) prepreči zastoje.
  Brez zaklepa bi sprejem lahko dodal člana v skupino, ki je bila v istem trenutku izbrisana z enim članom.
- **Alternatives:** `SERIALIZABLE` izolacija (ponovitve, drugačen vzorec od 002–005); zaklep samo povabila (ne pokrije izbrisa skupine).

## R-05 Sočasni odzivi: prvi zmaga, drugi dobi 404

- **Decision:** sprejem, zavrnitev in umik »prevzamejo« povabilo z `DELETE … RETURNING`; 0 vrstic → `404`. Sprejem: (1) poišče povabilo
  klicatelja (`404`, če ga ni), (2) zaklene skupino, (3) izbriše povabilo z `RETURNING role` (`404`, če ga je medtem obdelal drug zahtevek),
  (4) doda članstvo.
- **Rationale:** spec *Edge Cases* (»uspe samo prva akcija, druga vrne 404«) in *Assumptions* (optimistično zaklepanje se ne uporablja).
  `DELETE … RETURNING` je atomarna operacija PostgreSQL; drugi zahtevek čaka na zaklep vrstice in nato ne najde ničesar.
- **Alternatives:** verzija povabila (`409 VERSION_CONFLICT` – spec zahteva 404); `SELECT … FOR UPDATE` + `DELETE` (dve poizvedbi, isti učinek).

## R-06 `ALREADY_MEMBER` ob sprejemu potrdi izbris povabila

- **Decision:** če je povabljeni ob sprejemu že član, servis izbriše povabilo, transakcija se **potrdi**, kontroler pa vrne `409 ALREADY_MEMBER`.
  Servis vrne izid (`Accepted` / `AlreadyMember`) namesto izjeme znotraj transakcije; izjemo vrže kontroler po potrditvi.
- **Rationale:** FR-008: »vrne `409 ALREADY_MEMBER`, povabilo odstrani in obstoječe vloge ne spremeni«. Izjema v `@Transactional` metodi bi
  povzročila povrnitev in povabilo bi ostalo. Vstavljanje članstva je `INSERT … ON CONFLICT DO NOTHING`; 0 vrstic = že član.
- **Alternatives:** `noRollbackFor` na izjemi (skrita odvisnost od konfiguracije); dve transakciji (okno med njima).

## R-07 Preverjanje ponujene vloge pred stanjem skupine in podatki

- **Decision:** razčlenjevalnik prebere telo pred preverjanjem dostopa, vendar napake razvrsti po §2.2: če je `role` znana vloga
  (`VIEWER/EDITOR/ADMIN/OWNER`), ki ni strogo nižja od klicateljeve, je odgovor `403` (korak 3) – pred `409 GROUP_ARCHIVED` (korak 4) in
  pred napakami `400` za druga polja (korak 6). Manjkajoča ali neznana vrednost `role` je `400 role: REQUIRED / INVALID_VALUE`. E-naslov:
  obrez presledkov, prazen → `REQUIRED`, več kot 254 znakov → `TOO_LONG`, oblika kot pri kontaktu (`ContactInputParser.EMAIL`) → `INVALID_VALUE`; neznano polje → `UNKNOWN_FIELD`; neveljaven JSON → `body: MALFORMED`.
  Primerjava z uporabniki: `lower(email) = lower(:email)` (unikatni indeks `app_user_email_lower_key`, 001).
- **Rationale:** spec *Assumptions* (vrstni red) in negativni scenariji (»ADMIN ponudi ADMIN ali OWNER → 403«; »VIEWER/EDITOR arhivirane
  skupine → 403«). Kode polj so iste kot v 002/004, zato jih vmesnik prevede z obstoječimi pomočniki (`fieldErrors`).
- **Alternatives:** `OWNER` kot `400 INVALID_VALUE` (spec zahteva 403); preverjanje vloge po validaciji (krši §2.2).

## R-08 Število povabil v ogrodju: lahek endpoint in ponudnik konteksta

- **Decision:** `GET /api/invitations/count` → `{"count": n}`. `InvitationsProvider` v `AppShell` (ob `GroupsProvider`) naloži število ob
  prvem izrisu in ob vsaki spremembi `location.pathname`, ponudi `refresh()`; stran *Povabila* ga pokliče po sprejemu, zavrnitvi in
  odgovoru 404. Povezava `InvitationsLink` je v zgornji vrstici pred menijem računa; pod 640 px ikona `IconMail` in število (širina 320 px
  ob preklopu skupine in meniju računa).
- **Rationale:** FR-006-06 in *Assumptions* (osveževanje ob nalaganju in prehodu med stranmi, brez potiskanja). Seznam z `size=1` bi vrnil
  tudi `total`, a bi ob vsakem prehodu prenašal podatke skupine; ločen endpoint je ena poizvedba po indeksu `invitee_id`.
- **Alternatives:** periodično poizvedovanje (spec ga ne zahteva, nepotreben promet); število v `GET /api/me` (001; mešanje profila in povabil,
  `/api/me` se kliče le ob prijavi).

## R-09 Dostopna imena vrstičnih gumbov s predmetom

- **Decision:** gumbi v vrsticah imajo vidno kratko besedilo (»Sprejmi povabilo«, »Zavrni«, »Umakni povabilo«) in vizualno skrito
  nadaljevanje s skupino oziroma e-naslovom; dostopno ime se začne z vidnim besedilom (WCAG 2.5.3 *Label in Name*).
- **Rationale:** več povabil na strani pomeni več enakih gumbov; bralnik zaslona in testi (`getByRole('button', { name })`) ju morata
  razlikovati. Enak vzorec kot oznake vlog v 003 (predpona vizualno skrita).
- **Alternatives:** `aria-describedby` na vrstico (ime ostane podvojeno); `aria-label` brez vidnega besedila (krši 2.5.3).

## R-10 Povabila ne pišejo v revizijsko sled

- **Decision:** nobena operacija 006 ne vstavlja v `audit_entry` ali posodablja `audit_head`. `InvitationAuditIT` po pošiljanju, sprejemu,
  zavrnitvi in umiku preveri, da je sled skupine nespremenjena.
- **Rationale:** FR-005-06 in feature-map §2.7 – sled beleži samo spremembe kontaktov; spec *Assumptions* to izrecno zahteva od testov 006.
- **Alternatives:** beleženje članstev (ni zahtevano; pomenilo bi spremembo 005).

## R-11 Umik: pravilo po ponujeni vlogi, odziv `canWithdraw`

- **Decision:** `DELETE /api/groups/{groupId}/invitations/{invitationId}`: `GroupAccess.require(ADMIN, write = false)` (dovoljeno v
  arhivirani skupini), nato `SELECT role FROM invitation WHERE id AND group_id` (`404`), nato `403`, če je klicatelj ADMIN in `role = ADMIN`,
  nato `DELETE … RETURNING` (`404` ob sočasnem odzivu). Seznam vrne `canWithdraw` po istem pravilu, da vmesnik gumba ne izriše.
- **Rationale:** FR-006-14 (»le nižjim od sebe« glede na ponujeno vlogo, ne na povabitelja; D-54). V trajno arhivirani skupini ni lastnika,
  zato povabil z vlogo ADMIN ne umakne nihče (spec *Edge Cases*) – pravilo to da samo od sebe.
- **Alternatives:** pravilo po povabitelju (spec ga zavrača); `POST …/withdraw` (umik je izbris vira skupine; `DELETE` je naraven in idempotenten po 404).

## R-12 Testna priprava stanj

- **Decision:** BE: `InvitationFixtures` vstavi povabila neposredno v bazo (kot `GroupFixtures`, D-27); izbris povabitelja = `DELETE FROM app_user`
  (kaskada in `SET NULL` kot v 012). FE: MSW rokovalniki v `test/invitationsApi.ts` z notranjim stanjem (seznam, število, odzivi 404/409).
  E2E: dva uporabnika Auth Emulatorja (`uniqueUser`, `signIn`); povabilo nastane prek vmesnika, arhiviranje in izbrisan povabitelj prek
  SQL (`support/groups.ts`, nov `support/invitations.ts`).
- **Rationale:** konstitucija II (samo Emulator, Testcontainers, MSW); produkcijskih endpointov za teste ni.
- **Alternatives:** testni endpointi (prepovedani).
