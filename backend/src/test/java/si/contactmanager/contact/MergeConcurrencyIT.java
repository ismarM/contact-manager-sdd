package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Sočasnost združitve (FR-011-15, FR-011-16; SC-004): prekrivajoče se združitve, posamično in množično urejanje,
 * arhiviranje ter rollback se izvedejo zaporedno brez zastoja in brez tihe izgube. Vsi kontakti nastanejo prek API-ja
 * 004, zato je njihov izbris v sledi (neznan kontakt bi dal {@code 404}).
 */
@Tag("FR-011-15")
@Tag("FR-011-16")
class MergeConcurrencyIT extends MergeApiTest {

    private static final String EMAIL = "ana@primer.si";

    private Map<String, Object> contactOf(Scenario s, String last) throws Exception {
        return createContact(s, "Ana", last, EMAIL, List.of(), List.of());
    }

    private static List<Integer> sortedStatuses(List<HttpResponse<String>> responses) {
        return responses.stream().map(HttpResponse::statusCode).sorted().toList();
    }

    @RepeatedTest(20)
    void twoMergesWithAnOverlappingContactNeverDeadlockAndExactlyOneSucceeds() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "A");
        Map<String, Object> b = contactOf(s, "B");
        Map<String, Object> c = contactOf(s, "C");
        Map<String, Object> d = contactOf(s, "D");
        Map<String, Object> e = contactOf(s, "E");
        List<Map<String, Object>> first = List.of(ref(a), ref(b), ref(c));
        List<Map<String, Object>> second = List.of(ref(c), ref(d), ref(e));

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> merge(s.token(Who.EDITOR), s.group(), mergeBody(first, simpleResult("Ana", "A", EMAIL))),
                () -> merge(s.token(Who.ADMIN), s.group(), mergeBody(second, simpleResult("Ana", "C", EMAIL)))));

        assertThat(sortedStatuses(responses)).as(responses.toString()).containsExactly(200, 409);
        for (HttpResponse<String> response : responses) {
            if (response.statusCode() == 409) {
                assertThat(codeOf(response)).isEqualTo("VERSION_CONFLICT");
            }
        }
        // Skladno stanje: združeni sta natanko dve od petih, drugi trije kontakti so nedotaknjeni, en vnos MERGE.
        assertThat(contacts.count(s.group())).isEqualTo(3);
        assertThat(auditEntries(s.group(), "MERGE")).hasSize(1);
        boolean firstWon = !contacts.exists(uuid(b));
        if (firstWon) {
            assertThat(contacts.exists(uuid(a))).isTrue();
            assertThat(contacts.exists(uuid(c))).isFalse();
            assertThat(contacts.exists(uuid(d))).isTrue();
            assertThat(contacts.exists(uuid(e))).isTrue();
        } else {
            assertThat(contacts.exists(uuid(a))).isTrue();
            assertThat(contacts.exists(uuid(b))).isTrue();
            assertThat(contacts.exists(uuid(c))).isTrue();
            assertThat(contacts.exists(uuid(d))).isFalse();
            assertThat(contacts.exists(uuid(e))).isFalse();
        }
    }

    @RepeatedTest(5)
    void aMergeRacingWithASingleEditOfTheKeptContactWithTheOldVersionNeverLosesAnythingSilently() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "A");
        Map<String, Object> b = contactOf(s, "B");
        Map<String, Object> values = input("Ana", "A");
        values.put("email", EMAIL);
        values.put("phone", "031 999 888");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> merge(
                        s.token(Who.EDITOR),
                        s.group(),
                        mergeBody(List.of(ref(a), ref(b)), simpleResult("Ana", "A", EMAIL))),
                () -> put(
                        contactPath(s.group(), a.get("id")),
                        s.token(Who.ADMIN),
                        body(withVersion(values, ((Number) a.get("version")).longValue())))));

        HttpResponse<String> merged = responses.get(0);
        HttpResponse<String> edited = responses.get(1);
        assertThat(sortedStatuses(responses)).as(responses.toString()).containsExactly(200, 409);
        if (merged.statusCode() == 200) {
            assertThat(codeOf(edited)).isEqualTo("VERSION_CONFLICT");
            assertThat(contacts.exists(uuid(b))).isFalse();
            assertThat(contacts.row(uuid(a)).get("phone")).isNull();
            assertThat(auditEntries(s.group(), "MERGE")).hasSize(1);
        } else {
            assertThat(codeOf(merged)).isEqualTo("VERSION_CONFLICT");
            assertThat(contacts.exists(uuid(b))).isTrue();
            assertThat(contacts.row(uuid(a)).get("phone")).isEqualTo("031 999 888");
            assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
        }
    }

    @RepeatedTest(5)
    void aMergeRacingWithABulkUpdateOverAnOverlappingContactIsSerializedWithoutDeadlock() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "A");
        Map<String, Object> b = contactOf(s, "B");
        UUID other = uuid(contactOf(s, "D"));

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> merge(
                        s.token(Who.EDITOR),
                        s.group(),
                        mergeBody(List.of(ref(a), ref(b)), simpleResult("Ana", "A", EMAIL))),
                () -> bulkUpdate(
                        s.token(Who.ADMIN), s.group(), request(List.of(uuid(b), other), "addTags", List.of("nova")))));

        HttpResponse<String> merged = responses.get(0);
        HttpResponse<String> bulk = responses.get(1);
        assertThat(sortedStatuses(responses)).as(responses.toString()).containsExactly(200, 409);
        if (merged.statusCode() == 200) {
            // Združitev je bila prva: množično urejanje je videlo izbrisan B in ni spremenilo ničesar.
            assertThat(codeOf(bulk)).isEqualTo("SELECTION_CHANGED");
            assertThat(contacts.exists(uuid(b))).isFalse();
            assertThat(contacts.tagsOf(other)).isEmpty();
            assertThat(auditEntries(s.group(), "MERGE")).hasSize(1);
        } else {
            // Množično urejanje je bilo prvo: B ima novo verzijo, zato je združitev s staro verzijo konflikt.
            assertThat(codeOf(merged)).isEqualTo("VERSION_CONFLICT");
            assertThat(contacts.exists(uuid(b))).isTrue();
            assertThat(contacts.tagsOf(uuid(b))).containsExactly("nova");
            assertThat(contacts.tagsOf(other)).containsExactly("nova");
            assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
        }
    }

    @RepeatedTest(5)
    void aMergeRacingWithArchivingEitherSucceedsBeforeItOrIsRejectedAsGroupArchived() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "A");
        Map<String, Object> b = contactOf(s, "B");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> merge(
                        s.token(Who.EDITOR),
                        s.group(),
                        mergeBody(List.of(ref(a), ref(b)), simpleResult("Ana", "A", EMAIL))),
                () -> post("/api/groups/" + s.group() + "/archive", s.token(Who.OWNER), null)));

        HttpResponse<String> merged = responses.get(0);
        assertThat(responses.get(1).statusCode()).as(responses.get(1).body()).isEqualTo(200);
        if (merged.statusCode() == 200) {
            assertThat(contacts.exists(uuid(b))).isFalse();
            assertThat(auditEntries(s.group(), "MERGE")).hasSize(1);
        } else {
            assertThat(merged.statusCode()).as(merged.body()).isEqualTo(409);
            assertThat(codeOf(merged)).isEqualTo("GROUP_ARCHIVED");
            assertThat(contacts.exists(uuid(a))).isTrue();
            assertThat(contacts.exists(uuid(b))).isTrue();
            assertThat(contacts.version(uuid(a))).isEqualTo(((Number) a.get("version")).longValue());
            assertThat(contacts.version(uuid(b))).isEqualTo(((Number) b.get("version")).longValue());
            assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
        }
    }

    @RepeatedTest(5)
    void aMergeRacingWithARollbackIsSerializedAndTheLoserGetsAVersionConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactOf(s, "A");
        Map<String, Object> b = contactOf(s, "B");
        UUID target = audit.latestEntryId(s.group());
        Map<String, Object> values = input("Ana", "A");
        values.put("email", EMAIL);
        values.put("phone", "031 999 888");
        HttpResponse<String> edit = put(
                contactPath(s.group(), a.get("id")),
                s.token(Who.EDITOR),
                body(withVersion(values, ((Number) a.get("version")).longValue())));
        assertThat(edit.statusCode()).as(edit.body()).isEqualTo(200);
        UUID latest = audit.latestEntryId(s.group());
        List<Map<String, Object>> opened = List.of(contact(uuid(a), contacts.version(uuid(a))), ref(b));

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> merge(s.token(Who.EDITOR), s.group(), mergeBody(opened, simpleResult("Ana", "A", EMAIL))),
                () -> rollback(s, Who.ADMIN, target, latest)));

        HttpResponse<String> merged = responses.get(0);
        HttpResponse<String> rolledBack = responses.get(1);
        if (merged.statusCode() == 200) {
            assertThat(rolledBack.statusCode()).as(rolledBack.body()).isEqualTo(409);
            assertThat(codeOf(rolledBack)).isEqualTo("VERSION_CONFLICT");
            assertThat(contacts.exists(uuid(b))).isFalse();
            assertThat(auditEntries(s.group(), "ROLLBACK")).isEmpty();
        } else {
            assertThat(rolledBack.statusCode()).as(rolledBack.body()).isEqualTo(201);
            assertThat(merged.statusCode()).as(merged.body()).isEqualTo(409);
            assertThat(codeOf(merged)).isEqualTo("VERSION_CONFLICT");
            assertThat(contacts.exists(uuid(b))).isTrue();
            assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
        }
    }
}
