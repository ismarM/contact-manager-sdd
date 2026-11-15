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
 * Zgodovina, ogled različic in primerjava kontakta (FR-015-05 … FR-015-09): izpeljano iz sledi 005, tudi za izbrisane in
 * združene kontakte.
 */
class ContactHistoryIT extends HistoryApiTest {

    private Map<String, Object> edited(
            Map<String, Object> detail, String phone, List<Map<String, String>> attributes, List<String> tags) {
        Map<String, Object> values = withPhone(detail, phone);
        values.put("attributes", attributes);
        values.put("tags", tags);
        return values;
    }

    @Test
    @Tag("FR-015-05")
    @Tag("FR-015-06")
    void theTimelineListsEveryChangeOfTheContactNewestFirstWithActorKindAndChangedFields() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "01 222 222"));
        Map<String, Object> second = update(s, Who.ADMIN, idOf(a), withPhone(a, "031 999 999"), versionOf(a));
        update(
                s,
                Who.EDITOR,
                idOf(a),
                edited(second, "031 999 999", List.of(Map.of("key", "oddelek", "value", "IT")), List.of("vip")),
                versionOf(second));

        Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");

        List<Map<String, Object>> items = asObjects(history.get("items"));
        assertThat(history.get("total")).isEqualTo(3);
        assertThat(items).extracting(e -> e.get("kind")).containsExactly("CHANGED", "CHANGED", "ADDED");
        assertThat(items).extracting(e -> e.get("action")).containsExactly("UPDATE", "UPDATE", "CREATE");
        assertThat(asObject(items.get(1).get("actor")).get("email"))
                .isEqualTo(groups.email(s.users().get(Who.ADMIN).uid()));
        List<Map<String, Object>> newestFields = asObjects(items.get(0).get("fields"));
        assertThat(newestFields).extracting(f -> f.get("field")).containsExactly("ATTRIBUTE", "TAGS");
        assertThat(asObjects(items.get(1).get("fields"))).singleElement().satisfies(f -> {
            assertThat(f.get("field")).isEqualTo("PHONE");
            assertThat(f.get("before")).isEqualTo("01 111 111");
            assertThat(f.get("after")).isEqualTo("031 999 999");
        });
        assertThat(items).allSatisfy(e -> assertThat(e.get("entryId")).isNotNull());
        Map<String, Object> contact = asObject(history.get("contact"));
        assertThat(contact.get("status")).isEqualTo("ACTIVE");
        assertThat(contact.get("displayName")).isEqualTo("Ana Prva");
        assertThat(contact.get("version")).isEqualTo(2);
        assertThat(contact.get("hasInitial")).isEqualTo(false);
    }

    @Test
    @Tag("FR-015-06")
    @Tag("FR-015-18")
    void aBulkEntryShowsOnlyTheChangeOfThisContactAndLinksToTheWholeEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> b = create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "01 222 222"));
        List<ContactChange> changes = new java.util.ArrayList<>();
        for (Map<String, Object> contact : List.of(a, b)) {
            ContactState before = snapshots.snapshot(s.group(), idOf(contact));
            ContactState after = new ContactState(
                    before.firstName(),
                    before.lastName(),
                    before.address(),
                    before.email(),
                    "031 000 000",
                    before.company(),
                    before.country(),
                    before.attributes(),
                    before.tags(),
                    before.version() + 1,
                    before.createdAt(),
                    before.updatedAt(),
                    before.updatedById());
            changes.add(new ContactChange(idOf(contact), (String) contact.get("displayName"), before, after));
        }
        UUID bulk = new TransactionTemplate(transactions)
                .execute(status -> auditLog.record(s.group(), s.id(Who.EDITOR), AuditAction.UPDATE, changes));

        Map<String, Object> history = history(s, Who.VIEWER, idOf(b), "");

        Map<String, Object> newest = asObjects(history.get("items")).get(0);
        assertThat(newest.get("entryId")).isEqualTo(bulk.toString());
        assertThat(newest.get("entryContactCount")).isEqualTo(2);
        assertThat(newest.get("displayName")).isEqualTo("Bojan Drugi");
        assertThat(asObjects(newest.get("fields"))).singleElement().satisfies(f -> {
            assertThat(f.get("field")).isEqualTo("PHONE");
            assertThat(f.get("after")).isEqualTo("031 000 000");
        });
    }

    @Test
    @Tag("FR-015-07")
    void aDeletedContactKeepsItsHistoryAndEndsWithTheRemoval() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> updated = update(s, Who.EDITOR, idOf(a), withPhone(a, "031 999 999"), versionOf(a));
        remove(s, Who.EDITOR, idOf(a), versionOf(updated));

        Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");

        Map<String, Object> contact = asObject(history.get("contact"));
        List<Map<String, Object>> items = asObjects(history.get("items"));
        assertThat(contact.get("status")).isEqualTo("DELETED");
        assertThat(contact.get("version")).isNull();
        assertThat(contact.get("lastEntryId")).isEqualTo(items.get(0).get("entryId"));
        assertThat(items).extracting(e -> e.get("kind")).containsExactly("REMOVED", "CHANGED", "ADDED");
        assertThat(items.get(0).get("hasVersion")).isEqualTo(false);
        assertThat(items.get(1).get("hasVersion")).isEqualTo(true);
    }

    @Test
    @Tag("FR-015-07")
    void aMergedAwayContactShowsWhereItWasMergedAndTheKeeperShowsTheMerge() throws Exception {
        Scenario s = scenario();
        Map<String, Object> keeper = create(s, Who.EDITOR, contactInput("Ana", "Ohranjena", "01 111 111"));
        Map<String, Object> removed = create(s, Who.EDITOR, contactInput("Ana", "Odstranjena", "01 111 111"));
        mergeInto(s, idOf(keeper), idOf(removed), s.id(Who.EDITOR));

        Map<String, Object> removedHistory = history(s, Who.VIEWER, idOf(removed), "");
        Map<String, Object> keeperHistory = history(s, Who.VIEWER, idOf(keeper), "");

        assertThat(asObject(removedHistory.get("contact")).get("status")).isEqualTo("MERGED");
        Map<String, Object> last = asObjects(removedHistory.get("items")).get(0);
        assertThat(last.get("kind")).isEqualTo("REMOVED");
        assertThat(last.get("action")).isEqualTo("MERGE");
        assertThat(asObject(last.get("mergedInto")).get("contactId"))
                .isEqualTo(idOf(keeper).toString());
        Map<String, Object> keeperLast = asObjects(keeperHistory.get("items")).get(0);
        assertThat(keeperLast.get("action")).isEqualTo("MERGE");
        assertThat(keeperLast.get("entryContactCount")).isEqualTo(2);
        assertThat(asObject(keeperHistory.get("contact")).get("status")).isEqualTo("ACTIVE");
    }

    @Test
    @Tag("FR-015-07")
    void aContactThatPredatesTheTrailHasAnEmptyTimelineAndNoInitialVersionUntilItIsChanged() throws Exception {
        Scenario s = scenario();
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");

        Map<String, Object> empty = history(s, Who.VIEWER, old, "");

        assertThat(empty.get("total")).isEqualTo(0);
        assertThat(asObjects(empty.get("items"))).isEmpty();
        assertThat(asObject(empty.get("contact")).get("status")).isEqualTo("ACTIVE");
        HttpResponse<String> missingInitial = get(versionPath(s.group(), old, "initial"), s.token(Who.VIEWER));
        assertThat(missingInitial.statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-015-05")
    void thePageSizeIsLimitedToTheCommonVocabularyAndPagingWorks() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> current = a;
        for (int i = 0; i < 26; i++) {
            current = update(
                    s,
                    Who.EDITOR,
                    idOf(a),
                    withPhone(current, "031 000 " + String.format("%03d", i)),
                    versionOf(current));
        }

        assertThat(get(historyPath(s.group(), idOf(a)) + "?size=30", s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(400);
        Map<String, Object> first = history(s, Who.VIEWER, idOf(a), "");
        Map<String, Object> second = history(s, Who.VIEWER, idOf(a), "?page=1");
        assertThat(first.get("total")).isEqualTo(27);
        assertThat(asObjects(first.get("items"))).hasSize(25);
        assertThat(asObjects(second.get("items"))).hasSize(2);
        assertThat(asObjects(second.get("items")).get(1).get("action")).isEqualTo("CREATE");
    }

    @Test
    @Tag("FR-015-08")
    void aVersionShowsTheStateRightAfterTheEntryAndTheInitialStateOfAPreExistingContact() throws Exception {
        Scenario s = scenario();
        UUID old = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        Map<String, Object> detail =
                json(get(contactPath(s.group(), old), s.token(Who.VIEWER)).body());
        Map<String, Object> changed = update(s, Who.EDITOR, old, withPhone(detail, "031 123 456"), versionOf(detail));
        update(s, Who.EDITOR, old, withPhone(changed, "031 777 777"), versionOf(changed));
        List<UUID> entries = entryIds(s);

        Map<String, Object> initial = json(
                get(versionPath(s.group(), old, "initial"), s.token(Who.VIEWER)).body());
        Map<String, Object> afterFirst = json(get(versionPath(s.group(), old, entries.get(0)), s.token(Who.VIEWER))
                .body());
        Map<String, Object> current = json(
                get(versionPath(s.group(), old, "current"), s.token(Who.VIEWER)).body());

        assertThat(asObject(initial.get("state")).get("phone")).isNull();
        assertThat(initial.get("createdAt")).isNull();
        assertThat(asObject(afterFirst.get("state")).get("phone")).isEqualTo("031 123 456");
        assertThat(afterFirst.get("ref")).isEqualTo(entries.get(0).toString());
        assertThat(afterFirst.get("action")).isEqualTo("UPDATE");
        assertThat(asObject(current.get("state")).get("phone")).isEqualTo("031 777 777");
        assertThat(history(s, Who.VIEWER, old, "").get("contact"))
                .extracting(c -> asObject(c).get("hasInitial"))
                .isEqualTo(true);
    }

    @Test
    @Tag("FR-015-08")
    void aVersionOfAnotherContactOrAnEntryWithoutAStateIsNotFound() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> b = create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "01 222 222"));
        UUID entryOfB = entryIds(s).get(1);
        remove(s, Who.EDITOR, idOf(b), versionOf(b));
        UUID removal = entryIds(s).get(2);

        assertThat(get(versionPath(s.group(), idOf(a), entryOfB), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
        assertThat(get(versionPath(s.group(), idOf(b), removal), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
        assertThat(get(versionPath(s.group(), idOf(b), "current"), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
        assertThat(get(versionPath(s.group(), idOf(a), "nonsense"), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-015-09")
    void comparingTwoVersionsListsBasicFieldsAttributesAndTags() throws Exception {
        Scenario s = scenario();
        Map<String, Object> inputA = contactInput("Ana", "Prva", "01 111 111");
        inputA.put("tags", List.of("vip"));
        Map<String, Object> a = create(s, Who.EDITOR, inputA);
        update(
                s,
                Who.EDITOR,
                idOf(a),
                edited(
                        a,
                        "031 999 999",
                        List.of(Map.of("key", "kompetenca", "value", "web dev")),
                        List.of("konferenca")),
                versionOf(a));
        List<UUID> entries = entryIds(s);

        HttpResponse<String> response = get(
                comparePath(s.group(), idOf(a)) + "?from=" + entries.get(0) + "&to=" + entries.get(1),
                s.token(Who.VIEWER));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> compare = json(response.body());
        List<Map<String, Object>> changes = asObjects(compare.get("changes"));
        assertThat(changes).extracting(c -> c.get("field")).containsExactly("PHONE", "ATTRIBUTE", "TAGS");
        assertThat(changes.get(1).get("key")).isEqualTo("kompetenca");
        assertThat(changes.get(1).get("before")).isNull();
        assertThat(changes.get(2).get("before")).isEqualTo(List.of("vip"));
        assertThat(changes.get(2).get("after")).isEqualTo(List.of("konferenca"));
        assertThat(asObject(compare.get("from")).get("ref"))
                .isEqualTo(entries.get(0).toString());
        // Primerjava s trenutnim stanjem.
        HttpResponse<String> withCurrent =
                get(comparePath(s.group(), idOf(a)) + "?from=" + entries.get(0) + "&to=current", s.token(Who.VIEWER));
        assertThat(withCurrent.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(withCurrent.body()).get("changes"))).hasSize(3);
    }

    @Test
    @Tag("FR-015-09")
    void comparingAVersionWithItselfOrWithMissingParametersIsRejected() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID entry = entryIds(s).get(0);
        String path = comparePath(s.group(), idOf(a));

        assertThat(get(path + "?from=" + entry + "&to=" + entry, s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(400);
        assertThat(get(path + "?from=" + entry, s.token(Who.VIEWER)).statusCode())
                .isEqualTo(400);
        assertThat(get(path + "?from=" + entry + "&to=" + UUID.randomUUID(), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-015-18")
    void anEntryOfAnUnknownKindIsStillShownWithItsChangedFields() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID entry = entryIds(s).get(0);
        jdbc.update("alter table audit_entry disable trigger audit_entry_immutable");
        try {
            jdbc.update("alter table audit_entry drop constraint audit_entry_action_check");
            jdbc.update("update audit_entry set action = 'IMPORT' where id = ?", entry);
            Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");
            assertThat(asObjects(history.get("items")).get(0).get("action")).isEqualTo("IMPORT");
            assertThat(asObjects(history.get("items")).get(0).get("fields")).isNotNull();
        } finally {
            jdbc.update("update audit_entry set action = 'CREATE' where id = ?", entry);
            jdbc.update("alter table audit_entry add constraint audit_entry_action_check check (action in"
                    + " ('CREATE', 'UPDATE', 'DELETE', 'MERGE', 'ROLLBACK', 'RESTORE'))");
            jdbc.update("alter table audit_entry enable trigger audit_entry_immutable");
        }
    }
}
