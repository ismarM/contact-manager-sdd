package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Optimistično zaklepanje združitve (FR-011-16; SC-004): zastarela verzija ali kontakt, ki je medtem izginil, daje
 * {@code 409 VERSION_CONFLICT} brez sprememb; identiteta, ki ni nikoli bila kontakt skupine, daje {@code 404}.
 */
@Tag("FR-011-16")
@Tag("SC-004")
class MergeVersionConflictIT extends MergeApiTest {

    private static final String SHARED_EMAIL = "ana@primer.si";

    private Map<String, Object> contactOf(Scenario s, String last) throws Exception {
        return createContact(s, "Ana", last, SHARED_EMAIL, List.of(), List.of());
    }

    /** Drug urednik prek API-ja 004 spremeni telefon kontakta (verzija se poveča). */
    private void editedByAnotherEditor(Scenario s, Map<String, Object> contact) throws Exception {
        Map<String, Object> values = input((String) contact.get("firstName"), (String) contact.get("lastName"));
        values.put("email", SHARED_EMAIL);
        values.put("phone", "031 999 888");
        HttpResponse<String> response = put(
                contactPath(s.group(), contact.get("id")),
                s.token(Who.ADMIN),
                body(withVersion(values, ((Number) contact.get("version")).longValue())));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    }

    private Map<String, Object> mergedValues() {
        return simpleResult("Ana", "Prva", SHARED_EMAIL);
    }

    private void assertVersionConflict(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(codeOf(response)).isEqualTo("VERSION_CONFLICT");
    }

    @Test
    void aSecondContactEditedAfterTheComparisonWasOpenedGivesAVersionConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "Prva");
        Map<String, Object> b = contactOf(s, "Druga");
        List<Map<String, Object>> opened = List.of(ref(a), ref(b));
        editedByAnotherEditor(s, b);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBody(opened, mergedValues()));

        assertVersionConflict(response);
        assertUnchanged(before, snapshot(s.group()));
        assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
    }

    @Test
    void theKeptContactEditedAfterTheComparisonWasOpenedGivesAVersionConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "Prva");
        Map<String, Object> b = contactOf(s, "Druga");
        List<Map<String, Object>> opened = List.of(ref(a), ref(b));
        editedByAnotherEditor(s, a);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBody(opened, mergedValues()));

        assertVersionConflict(response);
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void aContactDeletedViaApi004MeanwhileIsAVersionConflictNotANotFoundAndTheCompareDropsIt() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "Prva");
        Map<String, Object> b = contactOf(s, "Druga");
        Map<String, Object> c = contactOf(s, "Tretja");
        List<Map<String, Object>> opened = List.of(ref(a), ref(b), ref(c));
        HttpResponse<String> deleted =
                delete(contactPath(s.group(), c.get("id")) + "?version=" + c.get("version"), s.token(Who.EDITOR));
        assertThat(deleted.statusCode()).as(deleted.body()).isEqualTo(204);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBody(opened, mergedValues()));

        assertVersionConflict(response);
        assertUnchanged(before, snapshot(s.group()));

        HttpResponse<String> reopened = compare(s.token(Who.EDITOR), s.group(), List.of(uuid(a), uuid(b), uuid(c)));
        assertThat(reopened.statusCode()).as(reopened.body()).isEqualTo(200);
        List<Map<String, Object>> remaining = asObjects(json(reopened.body()).get("contacts"));
        assertThat(remaining).extracting(contact -> contact.get("id")).containsExactly(a.get("id"), b.get("id"));

        HttpResponse<String> retry = merge(
                s.token(Who.EDITOR),
                s.group(),
                mergeBody(
                        List.of(
                                contact(uuid(a), ((Number) remaining.get(0).get("version")).longValue()),
                                contact(uuid(b), ((Number) remaining.get(1).get("version")).longValue())),
                        mergedValues()));
        assertThat(retry.statusCode()).as(retry.body()).isEqualTo(200);
        assertThat(json(retry.body())).containsEntry("mergedCount", 2).containsEntry("keptContactId", a.get("id"));
    }

    @Test
    void twoEditorsMergingTheSameContactsAtOnceGiveExactlyOneSuccessAndOneVersionConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "Prva");
        Map<String, Object> b = contactOf(s, "Druga");
        List<Map<String, Object>> opened = List.of(ref(a), ref(b));

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> merge(
                        s.token(Who.EDITOR), s.group(), mergeBody(opened, simpleResult("Ana", "Prva", SHARED_EMAIL))),
                () -> merge(
                        s.token(Who.ADMIN), s.group(), mergeBody(opened, simpleResult("Ana", "Druga", SHARED_EMAIL)))));

        List<Integer> statuses =
                responses.stream().map(HttpResponse::statusCode).sorted().toList();
        assertThat(statuses).as(responses.toString()).containsExactly(200, 409);
        for (HttpResponse<String> response : responses) {
            if (response.statusCode() == 409) {
                assertThat(codeOf(response)).isEqualTo("VERSION_CONFLICT");
            }
        }
        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(contacts.exists(uuid(a))).isTrue();
        assertThat(contacts.exists(uuid(b))).isFalse();
        assertThat(auditEntries(s.group(), "MERGE")).hasSize(1);
    }

    @Test
    void aContactThatWasNeverAContactOfTheGroupIsNotFoundNotAConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "Prva");
        UUID otherGroup = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        UUID foreign = contacts.insert(otherGroup, s.id(Who.OWNER), "Tuj", "Kontakt");
        Snapshot before = snapshot(s.group());
        Snapshot foreignBefore = snapshot(otherGroup);

        HttpResponse<String> response = merge(
                s.token(Who.EDITOR),
                s.group(),
                mergeBody(List.of(ref(a), contact(foreign, contacts.version(foreign))), mergedValues()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(404);
        assertUnchanged(before, snapshot(s.group()));
        assertUnchanged(foreignBefore, snapshot(otherGroup));
    }

    @Test
    void afterARollbackTheRestoredContactsHaveHigherVersionsSoAnOldMergeIsAVersionConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "Prva");
        Map<String, Object> b = contactOf(s, "Druga");
        List<Map<String, Object>> opened = List.of(ref(a), ref(b));
        UUID beforeMerge = audit.latestEntryId(s.group());
        HttpResponse<String> merged = merge(s.token(Who.EDITOR), s.group(), mergeBody(opened, mergedValues()));
        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(200);
        HttpResponse<String> rolledBack = rollback(s, Who.ADMIN, beforeMerge, audit.latestEntryId(s.group()));
        assertThat(rolledBack.statusCode()).as(rolledBack.body()).isEqualTo(201);
        assertThat(contacts.version(uuid(a))).isGreaterThan(((Number) a.get("version")).longValue());
        assertThat(contacts.version(uuid(b))).isGreaterThan(((Number) b.get("version")).longValue());
        Snapshot before = snapshot(s.group());

        HttpResponse<String> stale = merge(s.token(Who.EDITOR), s.group(), mergeBody(opened, mergedValues()));

        assertVersionConflict(stale);
        assertUnchanged(before, snapshot(s.group()));
    }
}
