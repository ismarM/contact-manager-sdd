package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessException;
import si.contactmanager.audit.support.AuditApiTest;

/** Nespremenljivost vnosov (FR-005-05): API nima operacij za spremembo, baza posodobitev zavrne, izbris skupine sled izbriše. */
@Tag("FR-005-05")
class AuditImmutabilityIT extends AuditApiTest {

    @ParameterizedTest(name = "{1} na vnos, {0}")
    @EnumSource(Who.class)
    void changingOrDeletingAnEntryIsMethodNotAllowedForEveryRoleAndNonMembers(Who who) throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        UUID entry = (UUID) audit.entries(s.group()).get(0).get("id");
        List<Map<String, Object>> changesBefore = audit.changes(entry);

        for (String method : List.of("PUT", "PATCH", "DELETE")) {
            HttpResponse<String> response = send(method, entryPath(s.group(), entry), s.token(who));

            assertThat(response.statusCode()).as(method).isEqualTo(405);
            assertThat(response.body()).as(method).isEmpty();
            assertThat(response.headers().firstValue("Allow"))
                    .as(method)
                    .hasValueSatisfying(allow -> assertThat(allow).contains("GET"));
        }

        assertThat(audit.count(s.group())).isEqualTo(1);
        assertThat(audit.changes(entry)).isEqualTo(changesBefore);
    }

    @ParameterizedTest(name = "{0} brez žetona")
    @ValueSource(strings = {"PUT", "PATCH", "DELETE"})
    void changingAnEntryWithoutATokenIsUnauthenticated(String method) throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        UUID entry = (UUID) audit.entries(s.group()).get(0).get("id");

        HttpResponse<String> response = send(method, entryPath(s.group(), entry), null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(json(response.body())).containsEntry("code", "UNAUTHENTICATED");
        assertThat(audit.count(s.group())).isEqualTo(1);
    }

    @Test
    void theDatabaseRejectsUpdatesOfEntriesAndChanges() throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 234 567"));
        UUID entry = (UUID) audit.entries(s.group()).get(0).get("id");
        List<Map<String, Object>> changesBefore = audit.changes(entry);
        Map<String, Object> entryBefore = audit.entries(s.group()).get(0);

        assertThatThrownBy(() -> jdbc.update("update audit_entry set contact_name = 'Drugo ime' where id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("update audit_entry set seq = seq + 10 where id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() ->
                        jdbc.update("update audit_change set display_name = 'Drugo ime' where entry_id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("update audit_change set after = '{}'::jsonb where entry_id = ?", entry))
                .isInstanceOf(DataAccessException.class);

        assertThat(audit.entries(s.group()).get(0)).isEqualTo(entryBefore);
        assertThat(audit.changes(entry)).isEqualTo(changesBefore);
    }

    @Test
    void deletingTheGroupDeletesItsTrailAndLeavesOtherGroupsAlone() throws Exception {
        Scenario s = scenario();
        UUID doomed = groups.createGroup(s.id(Who.OWNER), "Skupina za izbris");
        create(s, Who.EDITOR, contactInput("Drug", "Kontakt", "01 000 000"));
        post(contactsPath(doomed), s.token(Who.OWNER), body(contactInput("Janez", "Novak", "01 234 567")));
        post(contactsPath(doomed), s.token(Who.OWNER), body(contactInput("Ana", "Prva", "01 111 111")));
        UUID doomedEntry = (UUID) audit.entries(doomed).get(0).get("id");
        assertThat(audit.count(doomed)).isEqualTo(2);
        assertThat(audit.latestEntryId(doomed)).isNotNull();
        int survivors = audit.count(s.group());

        HttpResponse<String> response = delete("/api/groups/" + doomed, s.token(Who.OWNER));

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(audit.count(doomed)).isZero();
        assertThat(audit.changes(doomedEntry)).isEmpty();
        assertThat(audit.latestEntryId(doomed)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from audit_head where group_id = ?", Integer.class, doomed))
                .isZero();
        assertThat(audit.count(s.group())).isEqualTo(survivors).isEqualTo(1);
    }
}
