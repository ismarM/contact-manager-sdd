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
 * Spremenjen izbor in tuje identitete ({@code bulk-update}, {@code bulk-delete}; FR-009-10, FR-009-11; research R-02):
 * obstoječ izbrisani kontakt skupine → {@code 409 SELECTION_CHANGED}, identiteta, ki ni nikoli bila kontakt skupine →
 * {@code 404}; vrstni red: 400 pred 409.
 */
class BulkSelectionChangedIT extends BulkApiTest {

    private void deleteViaApi(Scenario s, UUID id) throws Exception {
        long version = contacts.version(id);
        assertThat(delete(contactPath(s.group(), id) + "?version=" + version, s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);
    }

    @Test
    @Tag("FR-009-10")
    void twoContactsDeletedMeanwhileGiveSelectionChangedForUpdateAndDeleteAndNothingChanges() throws Exception {
        Scenario s = scenario();
        List<UUID> selected = contacts.insertMany(s.group(), s.id(Who.OWNER), 8);
        UUID goneA = selected.get(1);
        UUID goneB = selected.get(5);
        deleteViaApi(s, goneA);
        deleteViaApi(s, goneB);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> update =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(selected, "addTags", List.of("nova")));
        HttpResponse<String> delete = bulkDelete(s.token(Who.EDITOR), s.group(), request(selected));

        for (HttpResponse<String> response : List.of(update, delete)) {
            assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
            Map<String, Object> body = json(response.body());
            assertThat(body).containsEntry("code", "SELECTION_CHANGED");
            assertThat(idSet(body.get("missing"))).containsExactlyInAnyOrder(goneA.toString(), goneB.toString());
        }
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-10")
    void repeatingTheOperationWithoutTheMissingContactsSucceeds() throws Exception {
        Scenario s = scenario();
        List<UUID> selected = new ArrayList<>(contacts.insertMany(s.group(), s.id(Who.OWNER), 8));
        deleteViaApi(s, selected.get(0));
        deleteViaApi(s, selected.get(1));
        List<UUID> remaining = selected.subList(2, 8);

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(remaining, "addTags", List.of("nova")));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("changed", 6);
    }

    @Test
    @Tag("FR-009-11")
    void anIdentityOfAnotherGroupIsNotFoundAndNothingChangesInEitherGroup() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        groups.addMember(other, s.id(Who.EDITOR), "EDITOR");
        List<UUID> mine = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        List<UUID> selection = new ArrayList<>(mine);
        selection.add(foreign);
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);

        HttpResponse<String> update =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(selection, "addTags", List.of("nova")));
        HttpResponse<String> delete = bulkDelete(s.token(Who.EDITOR), s.group(), request(selection));

        for (HttpResponse<String> response : List.of(update, delete)) {
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
    }

    @Test
    @Tag("FR-009-11")
    void anInventedIdentityIsNotFound() throws Exception {
        Scenario s = scenario();
        List<UUID> selection = new ArrayList<>(contacts.insertMany(s.group(), s.id(Who.OWNER), 2));
        selection.add(UUID.randomUUID());
        Snapshot before = snapshot(s.group());

        HttpResponse<String> update =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(selection, "addTags", List.of("nova")));
        HttpResponse<String> delete = bulkDelete(s.token(Who.EDITOR), s.group(), request(selection));

        assertThat(update.statusCode()).isEqualTo(404);
        assertThat(delete.statusCode()).isEqualTo(404);
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-10")
    void aContactRemovedByAnAuditRollbackIsSelectionChangedNotNotFound() throws Exception {
        Scenario s = scenario();
        UUID a = UUID.fromString((String) createViaApi(s, input("Ana", "Prva")).get("id"));
        UUID afterFirst = audit.latestEntryId(s.group());
        UUID b = UUID.fromString(
                (String) createViaApi(s, input("Bojan", "Drugi")).get("id"));
        rollbackTo(s, afterFirst);
        assertThat(contacts.exists(b)).isFalse();
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(List.of(a, b), "addTags", List.of("nova")));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "SELECTION_CHANGED");
        assertThat(asStrings(body.get("missing"))).containsExactly(b.toString());
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-09")
    @Tag("FR-009-10")
    void aDictionaryViolationAndAMissingContactTogetherGiveValidationFailedFirst() throws Exception {
        Scenario s = scenario();
        UUID full = contacts.insert(s.group(), s.id(Who.OWNER), "Mojca", "Kralj");
        for (int i = 0; i < 30; i++) {
            contacts.addTag(full, i, "t" + i);
        }
        UUID gone = contacts.insert(s.group(), s.id(Who.OWNER), "Izbrisan", "Kontakt");
        deleteViaApi(s, gone);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(List.of(full, gone), "addTags", List.of("nova")));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertUnchanged(before, snapshot(s.group()));
    }
}
