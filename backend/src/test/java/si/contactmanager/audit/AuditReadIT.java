package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.audit.support.AuditApiTest;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.ContactState;

/** Branje sledi (FR-005-07, -08, -09, -10; SC-005): seznam, filtri, paginacija, en vnos in spremembe vnosa. */
class AuditReadIT extends AuditApiTest {

    @Autowired
    private AuditLog auditLog;

    @Autowired
    private PlatformTransactionManager transactions;

    /** {@code count} kontaktov, vsak en vnos {@code CREATE}; vrne id-je kontaktov po vrstnem redu. */
    private List<UUID> createMany(Scenario s, int count) throws Exception {
        List<UUID> ids = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            ids.add(idOf(create(s, Who.EDITOR, contactInput("Ime" + i, "Priimek" + i, "01 000 " + i))));
        }
        return ids;
    }

    private Map<String, Object> page(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        return json(response.body());
    }

    @Test
    @Tag("FR-005-07")
    void theListIsPagedNewestFirstWithTheEntryFields() throws Exception {
        Scenario s = scenario();
        createMany(s, 40);

        Map<String, Object> first = page(list(s, Who.VIEWER, ""));

        assertThat(first).containsEntry("total", 40).containsEntry("page", 0).containsEntry("size", 25);
        List<Map<String, Object>> items = asObjects(first.get("items"));
        assertThat(items).hasSize(25);
        List<Map<String, Object>> stored = audit.entries(s.group());
        assertThat(items.get(0)).containsEntry("id", stored.get(39).get("id").toString());
        assertThat(items.get(24)).containsEntry("id", stored.get(15).get("id").toString());
        Map<String, Object> newest = items.get(0);
        assertThat(newest.keySet())
                .containsExactlyInAnyOrder(
                        "id", "createdAt", "actor", "action", "contactCount", "contactName", "target", "targetInitial");
        assertThat(newest)
                .containsEntry("action", "CREATE")
                .containsEntry("contactCount", 1)
                .containsEntry("contactName", "Ime40 Priimek40")
                .containsEntry("target", null)
                .containsEntry("targetInitial", false);
        assertThat(Instant.parse((String) newest.get("createdAt"))).isNotNull();
        assertThat(asObject(newest.get("actor")))
                .containsEntry("name", "EDITOR")
                .containsEntry("email", groups.email(s.users().get(Who.EDITOR).uid()));
        assertThat(first.get("latestEntryId"))
                .isEqualTo(stored.get(39).get("id").toString());
        assertThat(first.get("contactFilter")).isNull();
    }

    @Test
    @Tag("FR-005-07")
    void pageSizesAndPagesBeyondTheEnd() throws Exception {
        Scenario s = scenario();
        createMany(s, 40);

        assertThat(asObjects(page(list(s, Who.VIEWER, "?size=50")).get("items")))
                .hasSize(40);
        assertThat(asObjects(page(list(s, Who.VIEWER, "?size=100")).get("items")))
                .hasSize(40);
        Map<String, Object> second = page(list(s, Who.VIEWER, "?page=1"));
        assertThat(second).containsEntry("total", 40).containsEntry("page", 1);
        assertThat(asObjects(second.get("items"))).hasSize(15);
        Map<String, Object> beyond = page(list(s, Who.VIEWER, "?page=5"));
        assertThat(beyond).containsEntry("total", 40);
        assertThat(asObjects(beyond.get("items"))).isEmpty();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"?size=10", "?size=", "?size=abc", "?page=-1", "?page=", "?page=abc"})
    @Tag("FR-005-07")
    void invalidPagingIsRejected(String query) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = list(s, Who.VIEWER, query);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body()))
                .containsEntry(query.startsWith("?size") ? "size" : "page", "INVALID_VALUE");
    }

    @Test
    @Tag("FR-005-14")
    void latestEntryIdIsTheNewestEntryOfTheWholeTrailEvenWhenAFilterHidesIt() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = createMany(s, 3);
        remove(s, Who.EDITOR, ids.get(0), 0);
        UUID newest = audit.latestEntryId(s.group());

        Map<String, Object> filtered = page(list(s, Who.VIEWER, "?action=CREATE"));

        assertThat(filtered).containsEntry("total", 3);
        assertThat(filtered.get("latestEntryId")).isEqualTo(newest.toString());
        assertThat(asObjects(filtered.get("items")))
                .extracting(i -> i.get("id"))
                .doesNotContain(newest.toString());
    }

    @Test
    @Tag("FR-005-07")
    void anEmptyTrailHasNoLatestEntry() throws Exception {
        Scenario s = scenario();

        Map<String, Object> empty = page(list(s, Who.VIEWER, ""));

        assertThat(empty).containsEntry("total", 0).containsEntry("latestEntryId", null);
        assertThat(asObjects(empty.get("items"))).isEmpty();
    }

    @Test
    @Tag("FR-005-02")
    void anEntryOfADeletedAccountHasNoActor() throws Exception {
        Scenario s = scenario();
        createMany(s, 1);

        jdbc.update("delete from app_user where id = ?", s.id(Who.EDITOR));

        Map<String, Object> item =
                asObjects(page(list(s, Who.VIEWER, "")).get("items")).get(0);
        assertThat(item).containsEntry("actor", null).containsEntry("contactName", "Ime1 Priimek1");
    }

    @Test
    @Tag("FR-005-09")
    void filtersByActionTypeAndByContact() throws Exception {
        Scenario s = scenario();
        Map<String, Object> janez = create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        Map<String, Object> ana = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> changed = valuesOf(janez);
        changed.put("phone", "031 111 222");
        Map<String, Object> updated = update(s, Who.EDITOR, idOf(janez), changed, versionOf(janez));
        remove(s, Who.EDITOR, idOf(ana), versionOf(ana));
        remove(s, Who.EDITOR, idOf(janez), versionOf(updated));

        Map<String, Object> deletes = page(list(s, Who.VIEWER, "?action=DELETE"));
        Map<String, Object> deletesAndUpdates = page(list(s, Who.VIEWER, "?action=DELETE&action=UPDATE"));
        Map<String, Object> janezOnly = page(list(s, Who.VIEWER, "?contact=" + idOf(janez)));

        assertThat(deletes).containsEntry("total", 2);
        assertThat(asObjects(deletes.get("items")))
                .extracting(i -> i.get("action"))
                .containsOnly("DELETE");
        assertThat(deletesAndUpdates).containsEntry("total", 3);
        assertThat(asObjects(deletesAndUpdates.get("items")))
                .extracting(i -> i.get("action"))
                .containsExactly("DELETE", "DELETE", "UPDATE");
        assertThat(janezOnly).containsEntry("total", 3);
        assertThat(asObjects(janezOnly.get("items")))
                .extracting(i -> i.get("action"))
                .containsExactly("DELETE", "UPDATE", "CREATE");
        assertThat(asObject(janezOnly.get("contactFilter")))
                .containsEntry("id", idOf(janez).toString())
                .containsEntry("displayName", "Janez Novak");
    }

    @Test
    @Tag("FR-005-09")
    void invalidFilterValuesAreRejected() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> action = list(s, Who.VIEWER, "?action=FOO");
        HttpResponse<String> contact = list(s, Who.VIEWER, "?contact=abc");

        assertThat(action.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(action.body())).containsEntry("action", "INVALID_VALUE");
        assertThat(contact.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(contact.body())).containsEntry("contact", "INVALID_VALUE");
    }

    @Test
    @Tag("FR-005-09")
    void aContactOfAnotherGroupGivesAnEmptyListWithoutItsData() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        Map<String, Object> foreign = asObject(
                json(post(contactsPath(other), s.token(Who.OWNER), body(contactInput("Tuj", "Kontakt", "01 999 999")))
                        .body()));
        create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));

        Map<String, Object> result = page(list(s, Who.VIEWER, "?contact=" + foreign.get("id")));

        assertThat(result).containsEntry("total", 0);
        assertThat(asObjects(result.get("items"))).isEmpty();
        assertThat(asObject(result.get("contactFilter")))
                .containsEntry("id", foreign.get("id"))
                .containsEntry("displayName", null);
    }

    @Test
    @Tag("FR-005-09")
    void aDeletedContactCanStillBeFiltered() throws Exception {
        Scenario s = scenario();
        Map<String, Object> janez = create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        remove(s, Who.EDITOR, idOf(janez), versionOf(janez));

        Map<String, Object> result = page(list(s, Who.VIEWER, "?contact=" + idOf(janez)));

        assertThat(result).containsEntry("total", 2);
        assertThat(asObject(result.get("contactFilter"))).containsEntry("displayName", "Janez Novak");
    }

    @ParameterizedTest(name = "arhivirana skupina, {0}")
    @EnumSource(
            value = Who.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    @Tag("FR-005-07")
    void anArchivedGroupTrailIsReadableByEveryMember(Who who) throws Exception {
        Scenario s = scenario();
        createMany(s, 2);
        groups.archive(s.group());

        Map<String, Object> result = page(list(s, who, ""));

        assertThat(result).containsEntry("total", 2);
    }

    @Test
    @Tag("FR-005-08")
    void oneEntryIsReadableAndAnEntryOfAnotherGroupIsNotFound() throws Exception {
        Scenario s = scenario();
        createMany(s, 1);
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        post(contactsPath(other), s.token(Who.OWNER), body(contactInput("Tuj", "Kontakt", "01 999 999")));
        UUID mine = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID foreign = (UUID) audit.entries(other).get(0).get("id");

        HttpResponse<String> own = get(entryPath(s.group(), mine), s.token(Who.VIEWER));
        HttpResponse<String> foreignEntry = get(entryPath(s.group(), foreign), s.token(Who.VIEWER));
        HttpResponse<String> malformed = get(entryPath(s.group(), "ni-uuid"), s.token(Who.VIEWER));
        HttpResponse<String> foreignChanges = get(entryPath(s.group(), foreign) + "/changes", s.token(Who.VIEWER));

        assertThat(own.statusCode()).isEqualTo(200);
        assertThat(json(own.body())).containsEntry("id", mine.toString()).containsEntry("action", "CREATE");
        assertThat(foreignEntry.statusCode()).isEqualTo(404);
        assertThat(foreignEntry.body()).isEmpty();
        assertThat(malformed.statusCode()).isEqualTo(404);
        assertThat(foreignChanges.statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-005-02")
    @Tag("FR-005-08")
    void changesListTheAffectedContactsWithOnlyTheChangedFields() throws Exception {
        Scenario s = scenario();
        Map<String, Object> janez = create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        Map<String, Object> changed = valuesOf(janez);
        changed.put("phone", "031 111 222");
        changed.put("attributes", List.of(Map.of("key", "kompetenca", "value", "web dev")));
        Map<String, Object> updated = update(s, Who.EDITOR, idOf(janez), changed, versionOf(janez));
        Map<String, Object> renamed = valuesOf(updated);
        renamed.put("lastName", "Kovač");
        update(s, Who.EDITOR, idOf(janez), renamed, versionOf(updated));
        remove(s, Who.EDITOR, idOf(janez), 2);
        List<Map<String, Object>> entries = audit.entries(s.group());

        Map<String, Object> added = changes(s, (UUID) entries.get(0).get("id"), "");
        Map<String, Object> edited = changes(s, (UUID) entries.get(1).get("id"), "");
        Map<String, Object> deleted = changes(s, (UUID) entries.get(3).get("id"), "");

        Map<String, Object> addedContact = asObjects(added.get("items")).get(0);
        assertThat(addedContact).containsEntry("kind", "ADDED").containsEntry("displayName", "Janez Novak");
        assertThat(asObjects(addedContact.get("fields")))
                .extracting(f -> f.get("field"))
                .containsExactly("FIRST_NAME", "LAST_NAME", "PHONE");
        assertThat(asObjects(addedContact.get("fields")))
                .extracting(f -> f.get("before"))
                .containsOnlyNulls();
        Map<String, Object> editedContact = asObjects(edited.get("items")).get(0);
        assertThat(editedContact).containsEntry("kind", "CHANGED");
        List<Map<String, Object>> editedFields = asObjects(editedContact.get("fields"));
        assertThat(editedFields).hasSize(2);
        assertThat(editedFields.get(0))
                .containsEntry("field", "PHONE")
                .containsEntry("key", null)
                .containsEntry("before", "01 234 567")
                .containsEntry("after", "031 111 222");
        assertThat(editedFields.get(1))
                .containsEntry("field", "ATTRIBUTE")
                .containsEntry("key", "kompetenca")
                .containsEntry("before", null)
                .containsEntry("after", "web dev");
        Map<String, Object> deletedContact = asObjects(deleted.get("items")).get(0);
        assertThat(deletedContact).containsEntry("kind", "REMOVED").containsEntry("displayName", "Janez Kovač");
        assertThat(asObjects(deletedContact.get("fields")))
                .extracting(f -> f.get("after"))
                .containsOnlyNulls();
        // Poznejše preimenovanje ne spremeni imena ob času vnosa.
        assertThat(asObjects(added.get("items")).get(0)).containsEntry("displayName", "Janez Novak");
    }

    private Map<String, Object> changes(Scenario s, UUID entry, String query) throws Exception {
        return page(get(entryPath(s.group(), entry) + "/changes" + query, s.token(Who.VIEWER)));
    }

    @Test
    @Tag("FR-005-08")
    void changesArePagedInTheOrderOfTheEntry() throws Exception {
        Scenario s = scenario();
        List<ContactChange> many = new ArrayList<>();
        for (int i = 1; i <= 30; i++) {
            many.add(new ContactChange(
                    UUID.randomUUID(),
                    "Kontakt " + i,
                    null,
                    new ContactState(
                            "Kontakt" + i,
                            null,
                            null,
                            null,
                            null,
                            List.<Attribute>of(),
                            List.of(),
                            0,
                            Instant.parse("2026-10-12T12:30:00Z"),
                            Instant.parse("2026-10-12T12:30:00Z"),
                            null)));
        }
        UUID entry = new TransactionTemplate(transactions)
                .execute(status -> auditLog.record(s.group(), s.id(Who.EDITOR), AuditAction.CREATE, many));

        Map<String, Object> first = changes(s, entry, "");
        Map<String, Object> second = changes(s, entry, "?page=1");

        assertThat(first).containsEntry("total", 30).containsEntry("size", 25);
        assertThat(asObjects(first.get("items"))).hasSize(25);
        assertThat(asObjects(first.get("items")).get(0)).containsEntry("displayName", "Kontakt 1");
        assertThat(asObjects(second.get("items"))).hasSize(5);
        assertThat(asObjects(second.get("items")).get(0)).containsEntry("displayName", "Kontakt 26");
        assertThat(get(entryPath(s.group(), entry) + "/changes?size=10", s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(400);
    }

    @Test
    @Tag("FR-005-07")
    void theFirstPageOfAHundredThousandEntriesLoadsInUnderTwoSeconds() throws Exception {
        Scenario s = scenario();
        audit.insertEntries(s.group(), s.id(Who.EDITOR), 100_000);
        List<Long> millis = new ArrayList<>();

        for (int i = 0; i < 5; i++) {
            Instant start = Instant.now();
            HttpResponse<String> response = list(s, Who.VIEWER, "");
            millis.add(Duration.between(start, Instant.now()).toMillis());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(json(response.body())).containsEntry("total", 100_000);
        }

        Collections.sort(millis);
        assertThat(millis.get(2)).as("mediana petih klicev v ms").isLessThan(2000);
    }

    @Test
    @Tag("FR-005-09")
    void theContactFilterIncludesMergeAndRollbackEntriesAndCombinesWithTheActionFilter() throws Exception {
        Scenario s = scenario();
        Map<String, Object> janez = create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        update(s, Who.EDITOR, idOf(janez), valuesOf(withPhone(janez, "02 222 222")), versionOf(janez));
        Map<String, Object> kept = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        ContactState keptState = new ContactState(
                "Ana",
                "Prva",
                null,
                null,
                "01 111 111",
                List.of(),
                List.of(),
                0,
                Instant.parse("2026-10-12T12:30:00Z"),
                Instant.parse("2026-10-12T12:30:00Z"),
                null);
        new TransactionTemplate(transactions)
                .executeWithoutResult(status -> auditLog.record(
                        s.group(),
                        s.id(Who.EDITOR),
                        AuditAction.MERGE,
                        List.of(
                                new ContactChange(idOf(kept), "Ana Prva", keptState, keptState),
                                new ContactChange(UUID.randomUUID(), "A. Prva", keptState, null))));
        rollbackToEntry(s, target);

        Map<String, Object> forJanez = page(list(s, Who.VIEWER, "?contact=" + idOf(janez)));
        Map<String, Object> forKept = page(list(s, Who.VIEWER, "?contact=" + idOf(kept)));
        Map<String, Object> janezRollbacks = page(list(s, Who.VIEWER, "?contact=" + idOf(janez) + "&action=ROLLBACK"));

        assertThat(asObjects(forJanez.get("items")))
                .extracting(i -> i.get("action"))
                .containsExactly("ROLLBACK", "UPDATE", "CREATE");
        assertThat(asObjects(forKept.get("items")))
                .extracting(i -> i.get("action"))
                .containsExactly("ROLLBACK", "MERGE", "CREATE");
        assertThat(janezRollbacks).containsEntry("total", 1);
    }

    private static Map<String, Object> withPhone(Map<String, Object> detail, String phone) {
        Map<String, Object> copy = new java.util.LinkedHashMap<>(detail);
        copy.put("phone", phone);
        return copy;
    }
}
