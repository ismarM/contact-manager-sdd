package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;

/** Revizijska sled po izbrisu računa izvajalca (FR-012-12, SC-005): »izbrisan uporabnik«, sled nespremenjena. */
@Tag("FR-012-12")
class AccountDeletionAuditIT extends AccountApiTest {

    private List<Map<String, Object>> entries(UUID group, SignedIn as) throws Exception {
        JsonNode json = JSON.readTree(
                get("/api/groups/" + group + "/audit", as.idToken()).body());
        return JSON.convertValue(json.get("items"), new TypeReference<>() {});
    }

    private List<List<Map<String, Object>>> snapshotChanges(UUID group) {
        return audit.entries(group).stream()
                .map(entry -> audit.changes((UUID) entry.get("id")))
                .toList();
    }

    @Test
    void actorBecomesDeletedUserWhileStatesAndCountStayUnchangedAndNoEntryIsAdded() throws Exception {
        SignedIn ana = registeredUser("Ana Lastnica");
        SignedIn pia = registeredUser("Pia Izvajalka");
        UUID group = activeGroup(ana, "Skupina F");
        groups.addMember(group, id(pia), "EDITOR");
        assertThat(createContact(group, pia, "Prvi")).isEqualTo(201);
        assertThat(createContact(group, pia, "Drugi")).isEqualTo(201);
        assertThat(createContact(group, ana, "Tretji")).isEqualTo(201);
        List<Map<String, Object>> before = entries(group, ana);
        List<List<Map<String, Object>>> changesBefore = snapshotChanges(group);
        UUID namesake = contacts.insert(group, id(ana), "Pia", "Izvajalka", email(pia), null, null);
        Map<String, Object> namesakeBefore = contacts.row(namesake);
        jdbc.update(
                "update group_member set updated_by = ? where group_id = ? and user_id = ?", id(pia), group, id(ana));
        assertThat(auditActorNames(group, ana)).contains("Pia Izvajalka", "Ana Lastnica");
        int entriesBefore = audit.count(group);
        long piaId = id(pia);

        assertThat(deleteAccount(pia).statusCode()).isIn(204, 202);

        List<Map<String, Object>> after = entries(group, ana);
        assertThat(after).hasSameSizeAs(before);
        for (int i = 0; i < before.size(); i++) {
            Map<String, Object> was = before.get(i);
            Map<String, Object> now = after.get(i);
            assertThat(now.get("id")).isEqualTo(was.get("id"));
            assertThat(now.get("contactName")).isEqualTo(was.get("contactName"));
            boolean byPia = was.get("actor") != null
                    && "Pia Izvajalka"
                            .equals(JSON.convertValue(was.get("actor"), new TypeReference<Map<String, Object>>() {})
                                    .get("name"));
            if (byPia) {
                assertThat(now.get("actor"))
                        .as("izvajalec je izbrisan uporabnik")
                        .isNull();
            } else {
                assertThat(now.get("actor")).isEqualTo(was.get("actor"));
            }
        }
        assertThat(audit.count(group))
                .as("izbris računa ne ustvari vnosa (§2.7)")
                .isEqualTo(entriesBefore);
        assertThat(snapshotChanges(group))
                .as("stanja prej/potem so nespremenjena")
                .isEqualTo(changesBefore);
        assertThat(contacts.row(namesake))
                .as("kontakt z imenom in e-naslovom izbrisanega ostane")
                .isEqualTo(namesakeBefore);
        assertThat(jdbc.queryForObject(
                        "select updated_by from group_member where group_id = ? and user_id = ?",
                        Long.class,
                        group,
                        id(ana)))
                .isNull();
        assertThat(jdbc.queryForObject("select count(*) from audit_entry where actor_id = ?", Integer.class, piaId))
                .isZero();
        assertThat(auditActorNames(group, ana)).doesNotContain("Pia Izvajalka");
    }

    @Test
    void otherReferencesToTheDeletedUserBecomeNullAndAuditStaysImmutable() throws Exception {
        SignedIn ana = registeredUser("Ana Druga");
        SignedIn pia = registeredUser("Pia Druga");
        UUID group = activeGroup(ana, "Skupina G");
        groups.addMember(group, id(pia), "ADMIN");
        UUID contact = contacts.insert(group, id(pia), "Uredil", "Pia");
        groups.setUpdatedBy(group, id(pia));
        UUID invited = activeGroup(ana, "Skupina H");
        SignedIn cene = registeredUser("Cene Druga");
        UUID invitation = invitations.invite(invited, id(cene), id(pia), "VIEWER");
        audit.insertEntries(group, id(pia), 2);

        assertThat(deleteAccount(pia).statusCode()).isIn(204, 202);

        assertThat(jdbc.queryForObject("select updated_by from contact where id = ?", Long.class, contact))
                .isNull();
        assertThat(jdbc.queryForObject("select updated_by from contact_group where id = ?", Long.class, group))
                .isNull();
        assertThat(jdbc.queryForObject("select inviter_id from invitation where id = ?", Long.class, invitation))
                .isNull();
        assertThat(jdbc.queryForObject(
                        "select count(*) from audit_entry where group_id = ? and actor_id is null",
                        Integer.class,
                        group))
                .isEqualTo(2);
        assertThatThrownBy(() -> jdbc.update("update audit_entry set contact_name = 'x' where group_id = ?", group))
                .as("sled ostane nespremenljiva (FR-005-05)")
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
}
