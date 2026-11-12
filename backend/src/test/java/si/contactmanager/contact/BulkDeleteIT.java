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

/** Množični izbris ({@code POST …/contacts/bulk-delete}; FR-009-13): izbrani izginejo z otroki, ostali ostanejo. */
@Tag("FR-009-13")
class BulkDeleteIT extends BulkApiTest {

    @Test
    void deletesTheSelectedContactsWithTheirChildrenAndLeavesTheOthersUntouched() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 6, List.of("vip", "a"), Map.of("podjetje", "FERI"));
        List<UUID> selected = all.subList(0, 3);
        List<UUID> kept = all.subList(3, 6);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(selected));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("deleted", 3);
        for (UUID id : selected) {
            assertThat(contacts.exists(id)).isFalse();
            assertThat(contacts.tagsOf(id)).isEmpty();
            assertThat(contacts.attributeRows(id)).isZero();
        }
        Snapshot after = snapshot(s.group());
        for (UUID id : kept) {
            assertThat(after.rows().get(id)).isEqualTo(before.rows().get(id));
            assertThat(after.tags().get(id)).isEqualTo(before.tags().get(id));
            assertThat(after.attributes().get(id)).isEqualTo(before.attributes().get(id));
        }
        assertThat(contacts.count(s.group())).isEqualTo(3);
    }

    @Test
    void aDuplicateIdentityIsCountedOnce() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 4);
        List<UUID> request = new ArrayList<>(all.subList(0, 3));
        request.add(all.get(0));
        request.add(all.get(1));

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(request));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("deleted", 3);
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    void anEmptySelectionIsRejectedAndNothingIsDeleted() throws Exception {
        Scenario s = scenario();
        contacts.insertMany(s.group(), s.id(Who.OWNER), 2);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(List.of()));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "contactIds", "code", "REQUIRED"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void aDeletedContactCanBeRestoredByARollbackToTheEntryRightBeforeTheDeletion() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Janez", "Novak");
        input.put("phone", "01 234 567");
        input.put("tags", List.of("vip", "konferenca2025"));
        input.put("attributes", List.of(Map.of("key", "Oddelek", "value", "IT")));
        UUID a = UUID.fromString((String) createViaApi(s, input).get("id"));
        UUID b = UUID.fromString(
                (String) createViaApi(s, input("Mojca", "Kralj")).get("id"));
        UUID beforeDeletion = audit.latestEntryId(s.group());
        Map<String, Object> restoredA = contacts.row(a);

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(List.of(a, b)));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(contacts.exists(a)).isFalse();
        rollbackTo(s, beforeDeletion);

        assertThat(contacts.exists(a)).isTrue();
        assertThat(contacts.exists(b)).isTrue();
        Map<String, Object> row = contacts.row(a);
        assertThat(row.get("first_name")).isEqualTo(restoredA.get("first_name"));
        assertThat(row.get("phone")).isEqualTo("01 234 567");
        assertThat(contacts.tagsOf(a)).containsExactly("vip", "konferenca2025");
        assertThat(contacts.attributesOf(a)).containsExactly(Map.of("key", "Oddelek", "value", "IT"));
    }
}
