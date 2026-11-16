package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.audit.support.HistoryApiTest;
import si.contactmanager.contact.ContactState;

/**
 * Obnova enega kontakta (FR-015-10 … FR-015-17): samo ta kontakt se spremeni, stari vnosi ostanejo, nov vnos {@code RESTORE}
 * ima pravega izvajalca; pravila, konflikti, združljivost z rollbackom skupine.
 */
class RestoreIT extends HistoryApiTest {

    private Map<String, Object> contentOf(UUID contact) {
        return audit.contactState(contact);
    }

    private List<Map<String, Object>> snapshotOfTrail(Scenario s) {
        return audit.entries(s.group()).stream()
                .map(e -> {
                    Map<String, Object> copy = new java.util.LinkedHashMap<>(e);
                    copy.put("changes", audit.changes((UUID) e.get("id")));
                    return copy;
                })
                .toList();
    }

    private Map<String, Object> bigEdit(Map<String, Object> detail) {
        Map<String, Object> values = withPhone(detail, "+38631999999");
        values.put("attributes", List.of(Map.of("key", "kompetenca", "value", "web dev")));
        values.put("tags", List.of("vip"));
        return values;
    }

    @Test
    @Tag("FR-015-12")
    void restoringAnOlderVersionChangesOnlyThisContactAndAddsOneRestoreEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> b = create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "+38690222222"));
        Map<String, Object> editedA = update(s, Who.ADMIN, idOf(a), bigEdit(a), versionOf(a));
        UUID createEntry = entryIds(s).get(0);
        Map<String, Object> bBefore = contentOf(idOf(b));
        Object createdAtBefore = contentOf(idOf(a)).get("created_at");
        List<Map<String, Object>> trailBefore = snapshotOfTrail(s);

        HttpResponse<String> response = restore(s, Who.EDITOR, idOf(a), restoreBody(createEntry, versionOf(editedA)));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        Map<String, Object> entry = json(response.body());
        assertThat(entry.get("action")).isEqualTo("RESTORE");
        assertThat(entry.get("contactCount")).isEqualTo(1);
        assertThat(asObject(entry.get("target")).get("entryId")).isEqualTo(createEntry.toString());
        Map<String, Object> restored = contentOf(idOf(a));
        assertThat(restored.get("phone")).isEqualTo("+38690111111");
        assertThat((List<?>) restored.get("attributes")).isEmpty();
        assertThat((List<?>) restored.get("tags")).isEmpty();
        assertThat(((Number) restored.get("version")).longValue()).isEqualTo(versionOf(editedA) + 1);
        assertThat(((Number) restored.get("updated_by")).longValue()).isEqualTo(s.id(Who.EDITOR));
        assertThat(restored.get("reverted_entry_id")).isNull();
        assertThat(restored.get("created_at")).isEqualTo(createdAtBefore);
        assertThat(contentOf(idOf(b))).isEqualTo(bBefore);
        List<Map<String, Object>> trailAfter = snapshotOfTrail(s);
        assertThat(trailAfter).hasSize(trailBefore.size() + 1);
        assertThat(trailAfter.subList(0, trailBefore.size())).isEqualTo(trailBefore);
        Map<String, Object> last = trailAfter.get(trailAfter.size() - 1);
        assertThat(last.get("action")).isEqualTo("RESTORE");
        assertThat(((Number) last.get("actor_id")).longValue()).isEqualTo(s.id(Who.EDITOR));
        assertThat(last.get("target_entry_id")).isEqualTo(createEntry);
        List<Map<String, Object>> changes = asObjects(last.get("changes"));
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0).get("contact_id").toString()).isEqualTo(idOf(a).toString());
        assertThat(audit.latestEntryId(s.group())).isEqualTo(last.get("id"));
        // Zgodovina kontakta kaže obnovo na vrhu.
        assertThat(asObjects(history(s, Who.VIEWER, idOf(a), "").get("items"))
                        .get(0)
                        .get("action"))
                .isEqualTo("RESTORE");
    }

    @Test
    @Tag("FR-015-13")
    void aVersionOlderThanTheRestoreIsAConflictForLaterEdits() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        restore(s, Who.EDITOR, idOf(a), restoreBody(entryIds(s).get(0), versionOf(edited)));
        int entries = audit.count(s.group());

        HttpResponse<String> stale = put(
                contactPath(s.group(), idOf(a)),
                s.token(Who.EDITOR),
                body(withVersion(withPhone(edited, "+38631555555"), versionOf(edited))));

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale.body()).get("code")).isEqualTo("VERSION_CONFLICT");
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }

    @Test
    @Tag("FR-015-14")
    void aDeletedContactIsRestoredWithTheSameIdAndContinuesItsTimeline() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        remove(s, Who.EDITOR, idOf(a), versionOf(edited));
        Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");
        List<Map<String, Object>> items = asObjects(history.get("items"));
        String lastEntry = (String) asObject(history.get("contact")).get("lastEntryId");
        String lastVersionEntry = (String) items.get(1).get("entryId");

        HttpResponse<String> response =
                restore(s, Who.EDITOR, idOf(a), restoreDeletedBody(lastVersionEntry, lastEntry));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        Map<String, Object> state = contentOf(idOf(a));
        assertThat(state.get("phone")).isEqualTo("+38631999999");
        assertThat((List<?>) state.get("tags")).isEqualTo(List.of("vip"));
        assertThat(((Number) state.get("version")).longValue()).isGreaterThan(versionOf(edited));
        List<Map<String, Object>> changes =
                audit.changes(UUID.fromString((String) json(response.body()).get("id")));
        assertThat(changes.get(0).get("before")).isNull();
        assertThat(changes.get(0).get("after")).isNotNull();
        Map<String, Object> after = history(s, Who.VIEWER, idOf(a), "");
        assertThat(asObject(after.get("contact")).get("status")).isEqualTo("ACTIVE");
        assertThat(asObjects(after.get("items")))
                .extracting(e -> e.get("action"))
                .containsExactly("RESTORE", "DELETE", "UPDATE", "CREATE");
    }

    @Test
    @Tag("FR-015-08")
    void theInitialVersionOfAContactThatPredatesTheTrailCanBeRestored() throws Exception {
        Scenario s = scenario();
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        Map<String, Object> detail =
                json(get(contactPath(s.group(), old), s.token(Who.VIEWER)).body());
        Map<String, Object> edited = update(s, Who.EDITOR, old, bigEdit(detail), versionOf(detail));

        HttpResponse<String> response = restore(s, Who.EDITOR, old, restoreBody("initial", versionOf(edited)));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        Map<String, Object> entry = json(response.body());
        assertThat(entry.get("targetInitial")).isEqualTo(true);
        assertThat(entry.get("target")).isNull();
        assertThat(contentOf(old).get("phone")).isNull();
        assertThat((List<?>) contentOf(old).get("attributes")).isEmpty();
    }

    @Test
    @Tag("FR-015-10")
    @Tag("FR-015-16")
    void rolesArchivedGroupAndValidationFollowTheCheckOrder() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        UUID first = entryIds(s).get(0);
        int entries = audit.count(s.group());
        Map<String, Object> ok = restoreBody(first, versionOf(edited));

        assertThat(restore(s, Who.VIEWER, idOf(a), ok).statusCode()).isEqualTo(403);
        assertThat(restore(s, Who.NON_MEMBER, idOf(a), ok).statusCode()).isEqualTo(404);
        assertThat(post(restorePath(s.group(), idOf(a)), null, body(ok)).statusCode())
                .isEqualTo(401);
        assertThat(restore(s, Who.EDITOR, UUID.randomUUID(), ok).statusCode()).isEqualTo(404);
        HttpResponse<String> noFrom = restore(s, Who.EDITOR, idOf(a), Map.of("version", versionOf(edited)));
        assertThat(noFrom.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(noFrom.body())).containsEntry("from", "REQUIRED");
        HttpResponse<String> noVersion = restore(s, Who.EDITOR, idOf(a), Map.of("from", first.toString()));
        assertThat(noVersion.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(noVersion.body())).containsEntry("version", "REQUIRED");
        assertThat(fieldErrors(restore(s, Who.EDITOR, idOf(a), Map.of("from", "nonsense"))
                        .body()))
                .containsEntry("from", "INVALID_VALUE");
        assertThat(restore(s, Who.EDITOR, idOf(a), restoreBody(UUID.randomUUID(), versionOf(edited)))
                        .statusCode())
                .isEqualTo(404);
        HttpResponse<String> stale = restore(s, Who.EDITOR, idOf(a), restoreBody(first, versionOf(edited) - 1));
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale.body()).get("code")).isEqualTo("VERSION_CONFLICT");
        assertThat(audit.count(s.group())).isEqualTo(entries);

        groups.archive(s.group());
        HttpResponse<String> archived = restore(s, Who.EDITOR, idOf(a), ok);
        assertThat(archived.statusCode()).isEqualTo(409);
        assertThat(json(archived.body()).get("code")).isEqualTo("GROUP_ARCHIVED");
        assertThat(restore(s, Who.VIEWER, idOf(a), ok).statusCode()).isEqualTo(403);
        assertThat(get(historyPath(s.group(), idOf(a)), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(200);
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }

    @Test
    @Tag("FR-015-14")
    void aMergedAwayContactCannotBeRestoredDirectly() throws Exception {
        Scenario s = scenario();
        Map<String, Object> keeper = create(s, Who.EDITOR, contactInput("Ana", "Ohranjena", "+38690111111"));
        Map<String, Object> removed = create(s, Who.EDITOR, contactInput("Ana", "Odstranjena", "+38690111111"));
        mergeInto(s, idOf(keeper), idOf(removed), s.id(Who.EDITOR));
        Map<String, Object> history = history(s, Who.VIEWER, idOf(removed), "");
        String last = (String) asObject(history.get("contact")).get("lastEntryId");
        String version = (String) asObjects(history.get("items")).get(1).get("entryId");
        int entries = audit.count(s.group());

        HttpResponse<String> response = restore(s, Who.EDITOR, idOf(removed), restoreDeletedBody(version, last));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body()).get("code")).isEqualTo("RESTORE_NOT_ALLOWED");
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(contacts.exists(idOf(removed))).isFalse();
    }

    @Test
    @Tag("FR-015-15")
    void restoringTheStateTheContactAlreadyHasChangesNothing() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        int entries = audit.count(s.group());

        HttpResponse<String> response =
                restore(s, Who.EDITOR, idOf(a), restoreBody(entryIds(s).get(0), versionOf(a)));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body()).get("code")).isEqualTo("RESTORE_NO_CHANGES");
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(((Number) contentOf(idOf(a)).get("version")).longValue()).isEqualTo(versionOf(a));
    }

    @Test
    @Tag("FR-015-11")
    @Tag("FR-015-14")
    void thePreviewListsTheChangesAndPossibleDuplicatesWithoutBlocking() throws Exception {
        Scenario s = scenario();
        Map<String, Object> inputA = contactInput("Ana", "Prva", "+38690111111");
        inputA.put("email", "ana@primer.si");
        Map<String, Object> a = create(s, Who.EDITOR, inputA);
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        UUID first = entryIds(s).get(0);
        Map<String, Object> liveInput = contactInput("Druga", "Ana", "+38690000000");
        liveInput.put("email", "ANA@primer.si ");
        create(s, Who.EDITOR, liveInput);

        Map<String, Object> live = json(get(previewPath(s.group(), idOf(a)) + "?from=" + first, s.token(Who.VIEWER))
                .body());
        remove(s, Who.EDITOR, idOf(a), versionOf(edited));
        String last = (String)
                asObject(history(s, Who.VIEWER, idOf(a), "").get("contact")).get("lastEntryId");
        Map<String, Object> deleted = json(get(previewPath(s.group(), idOf(a)) + "?from=" + first, s.token(Who.VIEWER))
                .body());

        assertThat(asObjects(live.get("changes")))
                .extracting(c -> c.get("field"))
                .containsExactly("PHONE", "ATTRIBUTE", "TAGS");
        assertThat(live.get("restorable")).isEqualTo(true);
        assertThat(asObjects(live.get("duplicates"))).isEmpty();
        assertThat(deleted.get("status")).isEqualTo("DELETED");
        assertThat(deleted.get("lastEntryId")).isEqualTo(last);
        assertThat(asObjects(deleted.get("duplicates"))).singleElement().satisfies(d -> {
            assertThat(d.get("reason")).isEqualTo("EMAIL");
            assertThat(d.get("displayName")).isEqualTo("Druga Ana");
        });
        // Opozorilo ne blokira obnove.
        HttpResponse<String> response = restore(s, Who.EDITOR, idOf(a), restoreDeletedBody(first, last));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    @Test
    @Tag("FR-015-14")
    void thePreviewOfAMergedContactIsNotRestorableAndOfTheSameStateHasNoChanges() throws Exception {
        Scenario s = scenario();
        Map<String, Object> keeper = create(s, Who.EDITOR, contactInput("Ana", "Ohranjena", "+38690111111"));
        Map<String, Object> removed = create(s, Who.EDITOR, contactInput("Ana", "Odstranjena", "+38690111111"));
        mergeInto(s, idOf(keeper), idOf(removed), s.id(Who.EDITOR));
        String version =
                (String) asObjects(history(s, Who.VIEWER, idOf(removed), "").get("items"))
                        .get(1)
                        .get("entryId");

        Map<String, Object> merged =
                json(get(previewPath(s.group(), idOf(removed)) + "?from=" + version, s.token(Who.VIEWER))
                        .body());
        Map<String, Object> same = json(get(
                        previewPath(s.group(), idOf(keeper)) + "?from="
                                + entryIds(s).get(0),
                        s.token(Who.VIEWER))
                .body());

        assertThat(merged.get("restorable")).isEqualTo(false);
        assertThat(merged.get("reason")).isEqualTo("MERGED");
        assertThat(same.get("restorable")).isEqualTo(false);
        assertThat(same.get("reason")).isEqualTo("NO_CHANGES");
    }

    @Test
    @Tag("FR-015-17")
    void theGroupRollbackStillWorksAndTreatsTheRestoreLikeAnyEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        List<UUID> entries = entryIds(s);
        restore(s, Who.EDITOR, idOf(a), restoreBody(entries.get(0), versionOf(edited)));
        assertThat(contentOf(idOf(a)).get("phone")).isEqualTo("+38690111111");

        // Rollback skupine na stanje po urejanju razveljavi obnovo.
        HttpResponse<String> rolledBack = rollback(s, Who.ADMIN, entries.get(1), audit.latestEntryId(s.group()));

        assertThat(rolledBack.statusCode()).as(rolledBack.body()).isEqualTo(201);
        assertThat(contentOf(idOf(a)).get("phone")).isEqualTo("+38631999999");
        // Obnova po rollbacku in rollback na vnos obnove (stanje takoj po obnovi) še vedno delujeta.
        UUID restoreEntry = entryIds(s).get(2);
        Map<String, Object> current =
                json(get(contactPath(s.group(), idOf(a)), s.token(Who.VIEWER)).body());
        HttpResponse<String> again = restore(s, Who.EDITOR, idOf(a), restoreBody(entries.get(0), versionOf(current)));
        assertThat(again.statusCode()).isEqualTo(201);
        HttpResponse<String> toRestore = rollback(s, Who.ADMIN, restoreEntry, audit.latestEntryId(s.group()));
        assertThat(toRestore.statusCode()).as(toRestore.body()).isIn(201, 409);
    }

    @Test
    @Tag("FR-015-12")
    void aFailureWhileWritingTheEntryChangesNothingAtAll() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        UUID first = entryIds(s).get(0);
        Map<String, Object> rowBefore = audit.contactState(idOf(a));
        int entries = audit.count(s.group());
        jdbc.execute("create function fail_restore() returns trigger language plpgsql as $$ begin"
                + " raise exception 'zapis vnosa ni uspel'; end $$");
        jdbc.execute("create trigger fail_restore before insert on audit_entry for each row"
                + " when (new.action = 'RESTORE') execute function fail_restore()");
        try {
            HttpResponse<String> response = restore(s, Who.EDITOR, idOf(a), restoreBody(first, versionOf(edited)));
            assertThat(response.statusCode()).isEqualTo(500);
        } finally {
            jdbc.execute("drop trigger fail_restore on audit_entry");
            jdbc.execute("drop function fail_restore()");
        }

        assertThat(audit.contactState(idOf(a))).isEqualTo(rowBefore);
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }

    @Test
    @Tag("FR-015-13")
    @Tag("FR-015-14")
    void theTokensOfADeletedAndOfALiveContactAreCheckedAgainstWhatTheContactIsNow() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        UUID created = entryIds(s).get(0);
        remove(s, Who.EDITOR, idOf(a), versionOf(a));
        Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");
        String last = (String) asObject(history.get("contact")).get("lastEntryId");
        int entries = audit.count(s.group());

        // Izbrisan kontakt: zastarel žeton, manjkajoč žeton, žeton obstoječega kontakta.
        HttpResponse<String> stale = restore(s, Who.EDITOR, idOf(a), restoreDeletedBody(created, created));
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale.body()).get("code")).isEqualTo("VERSION_CONFLICT");
        HttpResponse<String> missing = restore(s, Who.EDITOR, idOf(a), Map.of("from", created.toString()));
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(missing.body())).containsEntry("lastEntryId", "REQUIRED");
        HttpResponse<String> liveToken = restore(s, Who.EDITOR, idOf(a), restoreBody(created, 0));
        assertThat(liveToken.statusCode()).isEqualTo(409);
        assertThat(json(liveToken.body()).get("code")).isEqualTo("VERSION_CONFLICT");
        assertThat(audit.count(s.group())).isEqualTo(entries);

        // Obstoječ kontakt, ki ga je medtem obnovil drug uporabnik: žeton izbrisanega je konflikt.
        assertThat(restore(s, Who.ADMIN, idOf(a), restoreDeletedBody(created, last))
                        .statusCode())
                .isEqualTo(201);
        HttpResponse<String> late = restore(s, Who.EDITOR, idOf(a), restoreDeletedBody(created, last));
        assertThat(late.statusCode()).isEqualTo(409);
        assertThat(json(late.body()).get("code")).isEqualTo("VERSION_CONFLICT");
        assertThat(audit.count(s.group())).isEqualTo(entries + 1);
    }

    @Test
    @Tag("FR-015-10")
    void aViewerGetsForbiddenForADeletedContactAndNotFoundForAnUnknownOne() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        UUID created = entryIds(s).get(0);
        remove(s, Who.EDITOR, idOf(a), versionOf(a));
        String last = (String)
                asObject(history(s, Who.VIEWER, idOf(a), "").get("contact")).get("lastEntryId");
        int entries = audit.count(s.group());

        assertThat(restore(s, Who.VIEWER, idOf(a), restoreDeletedBody(created, last))
                        .statusCode())
                .isEqualTo(403);
        assertThat(restore(s, Who.VIEWER, UUID.randomUUID(), restoreDeletedBody(created, last))
                        .statusCode())
                .isEqualTo(404);
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(contacts.exists(idOf(a))).isFalse();
    }

    /** Kontakt izpred beleženja z atributom {@code key}, ki ga prvo urejanje odstrani; stanje s ključem je {@code initial}. */
    private UUID oldContactWithAttribute(Scenario s, String key, String value) throws Exception {
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        contacts.addAttribute(old, 0, key, value);
        Map<String, Object> detail =
                json(get(contactPath(s.group(), old), s.token(Who.VIEWER)).body());
        Map<String, Object> values = withPhone(detail, "+38631123456");
        values.put("attributes", List.of());
        update(s, Who.EDITOR, old, values, versionOf(detail));
        return old;
    }

    @Test
    @Tag("FR-015-12")
    @Tag("FR-013-08")
    void aVersionWithAReservedAttributeNameIsRejectedButHistoryStaysLiteral() throws Exception {
        Scenario s = scenario();
        UUID old = oldContactWithAttribute(s, "Država", "Slovenija");
        Map<String, Object> current =
                json(get(contactPath(s.group(), old), s.token(Who.VIEWER)).body());
        int entries = audit.count(s.group());
        Map<String, Object> rowBefore = contentOf(old);

        Map<String, Object> preview = json(get(previewPath(s.group(), old) + "?from=initial", s.token(Who.VIEWER))
                .body());
        HttpResponse<String> response = restore(s, Who.EDITOR, old, restoreBody("initial", versionOf(current)));

        assertThat(preview.get("restorable")).isEqualTo(false);
        assertThat(preview.get("reason")).isEqualTo("INVALID_STATE");
        assertThat(asObjects(preview.get("violations"))).singleElement().satisfies(v -> {
            assertThat(v.get("field")).isEqualTo("attributes[0].key");
            assertThat(v.get("code")).isEqualTo("RESERVED_KEY");
        });
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[0].key", "RESERVED_KEY");
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(contentOf(old)).isEqualTo(rowBefore);
        // Zgodovina ostane dobesedna: izhodiščna različica še vedno vsebuje stari atribut.
        Map<String, Object> initial = json(
                get(versionPath(s.group(), old, "initial"), s.token(Who.VIEWER)).body());
        assertThat(asObject(initial.get("state")).get("attributes").toString()).contains("Država");
    }

    @Test
    @Tag("FR-015-12")
    @Tag("FR-013-08")
    void aReservedNameTheContactStillHoldsIsKept() throws Exception {
        Scenario s = scenario();
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        contacts.addAttribute(old, 0, "Država", "Slovenija");
        Map<String, Object> detail =
                json(get(contactPath(s.group(), old), s.token(Who.VIEWER)).body());
        Map<String, Object> edited = update(s, Who.EDITOR, old, withPhone(detail, "+38631123456"), versionOf(detail));

        HttpResponse<String> response = restore(s, Who.EDITOR, old, restoreBody("initial", versionOf(edited)));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(contentOf(old).get("phone")).isNull();
        assertThat(contentOf(old).get("attributes").toString()).contains("Država");
    }

    @Test
    @Tag("FR-015-12")
    @Tag("FR-013-10")
    void restoredKeysAndTagsGetTheCanonicalSpellingOfTheGroupWhileTheRecordedVersionStaysLiteral() throws Exception {
        Scenario s = scenario();
        for (String name : List.of("Prvi", "Drugi")) {
            Map<String, Object> input = contactInput(name, "Kompetenten", "+38690000000");
            input.put("attributes", List.of(Map.of("key", "Kompetenca", "value", "web")));
            input.put("tags", List.of("VIP"));
            create(s, Who.EDITOR, input);
        }
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        contacts.addAttribute(old, 0, "kompetenca", "stara");
        contacts.addTag(old, 0, "vip");
        Map<String, Object> detail =
                json(get(contactPath(s.group(), old), s.token(Who.VIEWER)).body());
        Map<String, Object> values = withPhone(detail, "+38631123456");
        values.put("attributes", List.of());
        values.put("tags", List.of());
        Map<String, Object> edited = update(s, Who.EDITOR, old, values, versionOf(detail));

        Map<String, Object> preview = json(get(previewPath(s.group(), old) + "?from=initial", s.token(Who.VIEWER))
                .body());
        HttpResponse<String> response = restore(s, Who.EDITOR, old, restoreBody("initial", versionOf(edited)));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(asObjects(preview.get("changes")).toString())
                .contains("Kompetenca")
                .doesNotContain("kompetenca");
        Map<String, Object> state = contentOf(old);
        assertThat(state.get("attributes").toString()).contains("key=Kompetenca");
        assertThat(state.get("tags")).isEqualTo(List.of("VIP"));
        Map<String, Object> initial = json(
                get(versionPath(s.group(), old, "initial"), s.token(Who.VIEWER)).body());
        assertThat(asObject(initial.get("state")).get("attributes").toString()).contains("kompetenca");
        assertThat(asObject(initial.get("state")).get("tags")).isEqualTo(List.of("vip"));
    }

    @Test
    @Tag("FR-015-12")
    @Tag("FR-013-13")
    void aRecordedStateWithAnInvalidCountryOrTooLongCompanyIsRejected() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        ContactState before = snapshots.snapshot(s.group(), idOf(a));
        ContactState bad = new ContactState(
                before.firstName(),
                before.lastName(),
                before.address(),
                before.email(),
                before.phone(),
                "x".repeat(201),
                "ZZ",
                before.attributes(),
                before.tags(),
                before.version() + 1,
                before.createdAt(),
                before.updatedAt(),
                before.updatedById());
        UUID entry = new TransactionTemplate(transactions)
                .execute(status -> auditLog.record(
                        s.group(),
                        s.id(Who.EDITOR),
                        AuditAction.UPDATE,
                        List.of(new ContactChange(idOf(a), "Ana Prva", before, bad))));
        int entries = audit.count(s.group());

        HttpResponse<String> response = restore(s, Who.EDITOR, idOf(a), restoreBody(entry, versionOf(a)));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body()))
                .containsEntry("country", "INVALID_VALUE")
                .containsEntry("company", "TOO_LONG");
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }
}
