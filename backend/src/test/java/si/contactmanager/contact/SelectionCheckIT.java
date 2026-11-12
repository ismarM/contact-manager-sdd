package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.BulkApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/**
 * Preverjanje sprememb izbora pred končno akcijo ({@code POST …/contacts/selection-check}; FR-009-18, Clarify Q2):
 * javijo se samo spremembe obstoja in ujemanja z iskanjem in filtri; endpoint samo bere.
 */
@Tag("FR-009-18")
class SelectionCheckIT extends BulkApiTest {

    private static final String TAG = "konferenca2025";

    private Map<String, Object> checkOk(Scenario s, Who who, Object request) throws Exception {
        HttpResponse<String> response = selectionCheck(s.token(who), s.group(), request);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json(response.body());
    }

    private static Map<String, Object> checkRequest(List<UUID> selected, Map<String, Object> query) {
        Map<String, Object> request = new java.util.LinkedHashMap<>();
        request.put("contactIds", ids(selected));
        request.put("queries", List.of(query));
        return request;
    }

    @Test
    void reportsDeletedNewlyMatchingAndNoLongerMatchingContactsOfAQuery() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        List<UUID> selected =
                new ArrayList<>(contacts.insertManyWithTagsAndAttributes(s.group(), owner, 12, List.of(TAG), Map.of()));
        UUID deleted = selected.get(0);
        UUID noLonger = selected.get(1);
        UUID excluded = contacts.insert(s.group(), owner, "Ročno", "Odznačen");
        contacts.addTag(excluded, 0, TAG);
        UUID newA = contacts.insert(s.group(), owner, "Nova", "Prva");
        UUID newB = contacts.insert(s.group(), owner, "Nova", "Druga");
        contacts.addTag(newA, 0, TAG);
        contacts.addTag(newB, 0, TAG);
        // Drug urednik: izbriše enega izbranih (004, vnos v sledi) in izbranemu odstrani značko.
        long version = contacts.version(deleted);
        assertThat(delete(contactPath(s.group(), deleted) + "?version=" + version, s.token(Who.ADMIN))
                        .statusCode())
                .isEqualTo(204);
        jdbc.update("delete from contact_tag where contact_id = ?", noLonger);
        Snapshot before = snapshot(s.group());

        Map<String, Object> answer =
                checkOk(s, Who.EDITOR, checkRequest(selected, checkQuery(List.of(TAG), selected, List.of(excluded))));

        assertThat(answer.get("changed")).isEqualTo(true);
        assertThat(asStrings(answer.get("missing"))).containsExactly(deleted.toString());
        List<Map<String, Object>> queries = asObjects(answer.get("queries"));
        assertThat(queries).hasSize(1);
        assertThat(asStrings(queries.get(0).get("newMatches")))
                .containsExactlyInAnyOrder(newA.toString(), newB.toString());
        assertThat(asStrings(queries.get(0).get("noLongerMatching"))).containsExactly(noLonger.toString());
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void aManuallyDeselectedContactIsNotReportedAsANewMatch() throws Exception {
        Scenario s = scenario();
        List<UUID> all =
                contacts.insertManyWithTagsAndAttributes(s.group(), s.id(Who.OWNER), 5, List.of(TAG), Map.of());
        List<UUID> selected = all.subList(0, 4);
        UUID excluded = all.get(4);

        Map<String, Object> answer =
                checkOk(s, Who.EDITOR, checkRequest(selected, checkQuery(List.of(TAG), selected, List.of(excluded))));

        assertThat(answer.get("changed")).isEqualTo(false);
        assertThat(asStrings(answer.get("missing"))).isEmpty();
        assertThat(asObjects(answer.get("queries")).get(0).get("newMatches")).isEqualTo(List.of());
        assertThat(asObjects(answer.get("queries")).get(0).get("noLongerMatching"))
                .isEqualTo(List.of());
    }

    @Test
    void aChangeOfAnotherFieldIsNotReportedWhenTheQueryStillMatches() throws Exception {
        Scenario s = scenario();
        List<UUID> selected = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            selected.add(
                    contacts.insert(s.group(), s.id(Who.OWNER), "Janez" + i, "Novak", null, "01 111 11" + i, null));
        }
        contacts.editedByOther(selected.get(0), s.id(Who.ADMIN), "031 999 888");
        Map<String, Object> query = checkQuery(List.of(), selected, List.of());
        query.put("q", "Novak");

        Map<String, Object> answer = checkOk(s, Who.EDITOR, checkRequest(selected, query));

        assertThat(answer.get("changed")).isEqualTo(false);
        assertThat(asStrings(answer.get("missing"))).isEmpty();
    }

    @Test
    void aManuallySelectedContactThatDoesNotMatchAnyFilterIsNotReported() throws Exception {
        Scenario s = scenario();
        UUID manual = contacts.insert(s.group(), s.id(Who.OWNER), "Ročno", "Izbran");
        List<UUID> tagged =
                contacts.insertManyWithTagsAndAttributes(s.group(), s.id(Who.OWNER), 3, List.of(TAG), Map.of());
        List<UUID> selected = new ArrayList<>(tagged);
        selected.add(manual);

        Map<String, Object> answer =
                checkOk(s, Who.EDITOR, checkRequest(selected, checkQuery(List.of(TAG), tagged, List.of())));

        assertThat(answer.get("changed")).isEqualTo(false);
        assertThat(asObjects(answer.get("queries")).get(0).get("noLongerMatching"))
                .isEqualTo(List.of());
    }

    @Test
    void severalQueriesAreCheckedSeparatelyAndAnsweredInTheOrderOfTheRequest() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        List<UUID> a = contacts.insertManyWithTagsAndAttributes(s.group(), owner, 3, List.of("tag-a"), Map.of());
        List<UUID> b = contacts.insertManyWithTagsAndAttributes(s.group(), owner, 2, List.of("tag-b"), Map.of());
        UUID manual = contacts.insert(s.group(), owner, "Ročno", "Izbran");
        UUID newA = contacts.insert(s.group(), owner, "Nova", "Prva");
        contacts.addTag(newA, 0, "tag-a");
        UUID newB = contacts.insert(s.group(), owner, "Nova", "Druga");
        contacts.addTag(newB, 0, "tag-b");
        // Kontakt iz prve poizvedbe ne ustreza več; druga poizvedba je brez izpada.
        jdbc.update("delete from contact_tag where contact_id = ?", a.get(1));
        // Ročno izbran kontakt (v nobeni poizvedbi) zdaj ustreza poizvedbi »tag-a«.
        contacts.addTag(manual, 0, "tag-a");
        List<UUID> selected = new ArrayList<>(a);
        selected.addAll(b);
        selected.add(manual);
        Map<String, Object> request = new java.util.LinkedHashMap<>();
        request.put("contactIds", ids(selected));
        request.put(
                "queries",
                List.of(checkQuery(List.of("tag-a"), a, List.of()), checkQuery(List.of("tag-b"), b, List.of())));
        Snapshot before = snapshot(s.group());

        Map<String, Object> answer = checkOk(s, Who.EDITOR, request);

        assertThat(answer.get("changed")).isEqualTo(true);
        assertThat(asStrings(answer.get("missing"))).isEmpty();
        List<Map<String, Object>> queries = asObjects(answer.get("queries"));
        assertThat(queries).hasSize(2);
        assertThat(asStrings(queries.get(0).get("newMatches"))).containsExactly(newA.toString());
        assertThat(asStrings(queries.get(0).get("noLongerMatching")))
                .containsExactly(a.get(1).toString());
        assertThat(asStrings(queries.get(1).get("newMatches"))).containsExactly(newB.toString());
        assertThat(asStrings(queries.get(1).get("noLongerMatching"))).isEmpty();
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-10")
    void anIdentityThatNeverExistedInTheGroupIsNotFound() throws Exception {
        Scenario s = scenario();
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");

        HttpResponse<String> response = selectionCheck(
                s.token(Who.EDITOR), s.group(), Map.of("contactIds", ids(List.of(mine, UUID.randomUUID()))));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Test
    @Tag("FR-009-04")
    void anEmptyListOfContactIdsIsRequired() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                selectionCheck(s.token(Who.EDITOR), s.group(), Map.of("contactIds", List.<String>of()));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "contactIds", "code", "REQUIRED"));
    }

    @Test
    void noQueriesStillReportsMissingContacts() throws Exception {
        Scenario s = scenario();
        UUID kept = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        UUID gone = contacts.insert(s.group(), s.id(Who.OWNER), "Mojca", "Kralj");
        contacts.deleteAsAudited(s.group(), s.id(Who.OWNER), gone);

        Map<String, Object> answer = checkOk(s, Who.EDITOR, Map.of("contactIds", ids(List.of(kept, gone))));

        assertThat(answer.get("changed")).isEqualTo(true);
        assertThat(asStrings(answer.get("missing"))).containsExactly(gone.toString());
    }

    @Test
    void aQueryInvalidByTheRulesOf008IsRejectedWithItsPrefixedField() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        Map<String, Object> query = checkQuery(List.of(), List.of(contact), List.of());
        query.put("f", List.of("foo:x"));
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                selectionCheck(s.token(Who.EDITOR), s.group(), checkRequest(List.of(contact), query));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(ContactSearchClient.errors(response.body())).containsEntry("queries[0].f[0]", "UNKNOWN_FIELD");
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void viewerAndArchivedGroupMayCheck() throws Exception {
        Scenario s = scenario();
        List<UUID> selected =
                contacts.insertManyWithTagsAndAttributes(s.group(), s.id(Who.OWNER), 3, List.of(TAG), Map.of());
        Object request = checkRequest(selected, checkQuery(List.of(TAG), selected, List.of()));

        assertThat(checkOk(s, Who.VIEWER, request).get("changed")).isEqualTo(false);
        groups.archive(s.group());
        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            assertThat(checkOk(s, who, request).get("changed")).as(who.name()).isEqualTo(false);
        }
    }

    @Test
    void anIdentityOfAnotherGroupInQueryContactIdsOrExcludedIdsIsNotFoundAndNothingChanges() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);

        for (Map<String, Object> query : List.of(
                checkQuery(List.of(TAG), List.of(mine, foreign), List.of()),
                checkQuery(List.of(TAG), List.of(mine), List.of(foreign)))) {
            HttpResponse<String> response =
                    selectionCheck(s.token(Who.EDITOR), s.group(), checkRequest(List.of(mine), query));

            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
    }
}
