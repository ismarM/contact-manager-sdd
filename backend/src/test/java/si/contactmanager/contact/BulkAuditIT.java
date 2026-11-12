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

/**
 * Revizijska sled množičnih operacij (FR-009-14; SC-004): natanko en vnos na operacijo s stanji prej in potem samo za
 * spremenjene kontakte; brez sprememb brez vnosa; rollback 005 povrne množično operacijo.
 */
@Tag("FR-009-14")
@Tag("SC-004")
class BulkAuditIT extends BulkApiTest {

    /** 12 kontaktov prek API-ja: prvih deset brez značk, zadnja dva že z značko {@code nova}. */
    private List<UUID> twelve(Scenario s) throws Exception {
        List<UUID> all = new ArrayList<>(createViaApi(s, 10, List.of()));
        all.addAll(createViaApi(s, 2, List.of("nova")));
        return all;
    }

    @Test
    void bulkUpdateWritesOneUpdateEntryWithBeforeAndAfterOfTheChangedContactsOnly() throws Exception {
        Scenario s = scenario();
        List<UUID> all = twelve(s);
        int entriesBefore = audit.count(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<Map<String, Object>> entries = audit.entries(s.group());
        assertThat(entries).hasSize(entriesBefore + 1);
        Map<String, Object> entry = entries.get(entries.size() - 1);
        assertThat(entry.get("action")).isEqualTo("UPDATE");
        assertThat(entry.get("contact_count")).isEqualTo(10);
        assertThat(((Number) entry.get("actor_id")).longValue()).isEqualTo(s.id(Who.EDITOR));
        assertThat(entry.get("created_at")).isNotNull();
        List<Map<String, Object>> changes = audit.changes((UUID) entry.get("id"));
        assertThat(changes).hasSize(10);
        assertThat(changes)
                .extracting(c -> c.get("contact_id"))
                .containsExactlyInAnyOrderElementsOf(all.subList(0, 10));
        assertThat(changes).extracting(c -> c.get("contact_id")).doesNotContainAnyElementsOf(all.subList(10, 12));
        for (Map<String, Object> change : changes) {
            assertThat(asObject(change.get("before")).get("tags")).isEqualTo(List.of());
            assertThat(asObject(change.get("after")).get("tags")).isEqualTo(List.of("nova"));
        }
    }

    @Test
    void theAuditListShowsOneEntryForTenEditedContacts() throws Exception {
        Scenario s = scenario();
        List<UUID> all = twelve(s);
        bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));

        HttpResponse<String> response = get("/api/groups/" + s.group() + "/audit?size=25", s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> newest =
                asObjects(json(response.body()).get("items")).get(0);
        assertThat(newest).containsEntry("action", "UPDATE").containsEntry("contactCount", 10);
        assertThat(asObject(newest.get("actor"))).containsEntry("name", "EDITOR");
    }

    @Test
    void anOperationWithoutChangedContactsWritesNoEntry() throws Exception {
        Scenario s = scenario();
        List<UUID> all = createViaApi(s, 3, List.of("nova"));
        int entriesBefore = audit.count(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("changed", 0);
        assertThat(audit.count(s.group())).isEqualTo(entriesBefore);
    }

    @Test
    void bulkDeleteWritesOneDeleteEntryWithTheStateOfAllDeletedContacts() throws Exception {
        Scenario s = scenario();
        List<UUID> all = createViaApi(s, 5, List.of("vip"));
        List<UUID> selected = all.subList(0, 3);
        int entriesBefore = audit.count(s.group());

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(selected));

        assertThat(response.statusCode()).isEqualTo(200);
        List<Map<String, Object>> entries = audit.entries(s.group());
        assertThat(entries).hasSize(entriesBefore + 1);
        Map<String, Object> entry = entries.get(entries.size() - 1);
        assertThat(entry.get("action")).isEqualTo("DELETE");
        assertThat(entry.get("contact_count")).isEqualTo(3);
        assertThat(((Number) entry.get("actor_id")).longValue()).isEqualTo(s.id(Who.EDITOR));
        List<Map<String, Object>> changes = audit.changes((UUID) entry.get("id"));
        assertThat(changes).extracting(c -> c.get("contact_id")).containsExactlyInAnyOrderElementsOf(selected);
        for (Map<String, Object> change : changes) {
            assertThat(change.get("after")).isNull();
            assertThat(asObject(change.get("before")).get("tags")).isEqualTo(List.of("vip"));
        }
    }

    @Test
    void aRollbackToTheEntryRightBeforeTheBulkUpdateRestoresAllTenContacts() throws Exception {
        Scenario s = scenario();
        List<UUID> all = twelve(s);
        UUID beforeBulk = audit.latestEntryId(s.group());
        bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));
        for (UUID id : all.subList(0, 10)) {
            assertThat(contacts.tagsOf(id)).containsExactly("nova");
        }

        rollbackTo(s, beforeBulk);

        for (UUID id : all.subList(0, 10)) {
            assertThat(contacts.tagsOf(id)).as(id.toString()).isEmpty();
        }
        for (UUID id : all.subList(10, 12)) {
            assertThat(contacts.tagsOf(id)).containsExactly("nova");
        }
    }
}
