package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Dvojniki v arhivirani skupini (FR-011-19): iskanje, primerjava in združitev so za urednika in višje zavrnjeni z
 * {@code 409 GROUP_ARCHIVED} (tudi branje), za bralca {@code 403} (vloga pred arhiviranostjo); nič se ne spremeni.
 */
@Tag("FR-011-19")
class DuplicateArchivedIT extends DuplicateApiTest {

    private static final String EMAIL = "dvojnik@primer.si";

    private static Map<String, Object> merged() {
        return result("Janez", "Novak", null, null, null, null, null);
    }

    private HttpResponse<String> search(Scenario s, Who who) throws Exception {
        return duplicates(s.token(who), s.group(), "category", "email");
    }

    private void assertAllThreeRejected(Scenario s, List<UUID> ids, List<Who> writers) throws Exception {
        Snapshot before = snapshot(s.group());
        for (Who who : writers) {
            List<HttpResponse<String>> responses = List.of(
                    search(s, who),
                    compare(s.token(who), s.group(), ids),
                    merge(s.token(who), s.group(), mergeBodyNow(ids, merged())));
            for (HttpResponse<String> response : responses) {
                assertThat(response.statusCode())
                        .as(who + " " + response.body())
                        .isEqualTo(409);
                assertThat(json(response.body())).as(who.name()).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
            }
        }
        assertUnchanged(before, snapshot(s.group()));
    }

    private void assertViewerForbidden(Scenario s, List<UUID> ids) throws Exception {
        Snapshot before = snapshot(s.group());
        List<HttpResponse<String>> responses = List.of(
                search(s, Who.VIEWER),
                compare(s.token(Who.VIEWER), s.group(), ids),
                merge(s.token(Who.VIEWER), s.group(), mergeBodyNow(ids, merged())));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).as(response.body()).isEqualTo(403);
            assertThat(json(response.body())).containsEntry("code", "FORBIDDEN");
        }
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void anArchivedGroupRejectsAllThreeOperationsForEditorAndAbove() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, EMAIL);
        groups.archive(s.group());

        assertAllThreeRejected(s, ids, List.of(Who.EDITOR, Who.ADMIN, Who.OWNER));
        assertViewerForbidden(s, ids);
    }

    @Test
    void aPermanentlyArchivedGroupBehavesTheSame() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, EMAIL);
        groups.makePermanentlyArchived(s.group());

        // trajno arhivirana skupina nima več lastnika (kot v BulkArchivedIT, D-76)
        assertAllThreeRejected(s, ids, List.of(Who.EDITOR, Who.ADMIN));
        assertViewerForbidden(s, ids);
    }

    @Test
    void archivingBetweenOpeningTheComparisonAndMergingRejectsTheMergeAndChangesNothing() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, EMAIL);
        // telo z verzijami, kot jih je primerjava videla, preden je bila skupina arhivirana
        Map<String, Object> request = mergeBodyNow(ids, merged());
        groups.archive(s.group());
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), request);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertUnchanged(before, snapshot(s.group()));
        assertThat(audit.count(s.group())).isEqualTo(before.auditEntries());
        assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
    }

    @Test
    void afterUnarchivingAllThreeOperationsWorkAgain() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, EMAIL);
        groups.archive(s.group());
        assertThat(search(s, Who.EDITOR).statusCode()).isEqualTo(409);

        jdbc.update("update contact_group set archived_at = null where id = ?", s.group());

        HttpResponse<String> search = search(s, Who.EDITOR);
        assertThat(search.statusCode()).as(search.body()).isEqualTo(200);
        assertThat(asObjects(json(search.body()).get("groups"))).hasSize(1);
        HttpResponse<String> compare = compare(s.token(Who.EDITOR), s.group(), ids);
        assertThat(compare.statusCode()).as(compare.body()).isEqualTo(200);
        HttpResponse<String> merge = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(ids, merged()));
        assertThat(merge.statusCode()).as(merge.body()).isEqualTo(200);
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }
}
