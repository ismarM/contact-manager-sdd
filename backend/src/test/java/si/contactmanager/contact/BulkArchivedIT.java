package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Množične operacije v arhivirani skupini (FR-009-15; SC-003): pisanje {@code 409 GROUP_ARCHIVED} za urednika in višje,
 * {@code 403} za bralca, branje ({@code contact-ids}, {@code selection-check}) za vse člane.
 */
@Tag("FR-009-15")
class BulkArchivedIT extends BulkApiTest {

    private void assertWritesRejected(Scenario s, List<UUID> all) throws Exception {
        Snapshot before = snapshot(s.group());
        for (Who who : List.of(Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            HttpResponse<String> update = bulkUpdate(s.token(who), s.group(), request(all, "addTags", List.of("nova")));
            HttpResponse<String> delete = bulkDelete(s.token(who), s.group(), request(all));
            for (HttpResponse<String> response : List.of(update, delete)) {
                assertThat(response.statusCode()).as(who.name()).isEqualTo(409);
                assertThat(json(response.body())).as(who.name()).isEqualTo(java.util.Map.of("code", "GROUP_ARCHIVED"));
            }
        }
        HttpResponse<String> viewerUpdate =
                bulkUpdate(s.token(Who.VIEWER), s.group(), request(all, "addTags", List.of("nova")));
        HttpResponse<String> viewerDelete = bulkDelete(s.token(Who.VIEWER), s.group(), request(all));
        for (HttpResponse<String> response : List.of(viewerUpdate, viewerDelete)) {
            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(json(response.body())).containsEntry("code", "FORBIDDEN");
        }
        assertUnchanged(before, snapshot(s.group()));
    }

    private void assertReadsAllowed(Scenario s, List<UUID> all) throws Exception {
        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            HttpResponse<String> ids = contactIds(s.token(who), s.group());
            HttpResponse<String> check = selectionCheck(s.token(who), s.group(), request(all));
            assertThat(ids.statusCode()).as(who.name()).isEqualTo(200);
            assertThat(check.statusCode()).as(who.name() + " " + check.body()).isEqualTo(200);
        }
    }

    @Test
    void anArchivedGroupRejectsWritingAndAllowsReading() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 5);
        groups.archive(s.group());

        assertWritesRejected(s, all);
        assertReadsAllowed(s, all);
    }

    @Test
    void aPermanentlyArchivedGroupBehavesTheSame() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 5);
        groups.makePermanentlyArchived(s.group());

        assertWritesRejected(s, all);
        assertReadsAllowed(s, all);
    }

    /** Vrstni red preverjanj (R-02, T044): 403 oziroma 409 GROUP_ARCHIVED pred 400 za neveljavno telo. */
    @ParameterizedTest(name = "neveljavno telo, {0}")
    @EnumSource(
            value = Who.class,
            names = {"VIEWER", "EDITOR"})
    void permissionAndArchivedChecksComeBeforeBodyValidation(Who who) throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        groups.archive(s.group());
        Snapshot before = snapshot(s.group());

        HttpResponse<String> update =
                bulkUpdate(s.token(who), s.group(), request(all, "addTags", List.of("neveljavna znacka")));
        HttpResponse<String> delete = bulkDelete(s.token(who), s.group(), "{\"contactIds\":[\"ni-uuid\"]}");

        for (HttpResponse<String> response : List.of(update, delete)) {
            if (who == Who.VIEWER) {
                assertThat(response.statusCode()).isEqualTo(403);
                assertThat(json(response.body())).containsEntry("code", "FORBIDDEN");
            } else {
                assertThat(response.statusCode()).isEqualTo(409);
                assertThat(json(response.body())).isEqualTo(java.util.Map.of("code", "GROUP_ARCHIVED"));
            }
        }
        assertUnchanged(before, snapshot(s.group()));
    }
}
