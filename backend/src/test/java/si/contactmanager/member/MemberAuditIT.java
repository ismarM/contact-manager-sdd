package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Operacije nad člani ne pišejo v revizijsko sled (FR-007-12, FR-005-06, research R-09): uspešne in zavrnjene operacije
 * ne spremenijo {@code audit_entry}, {@code audit_head} niti odgovora sledi; imena bivših članov v sledi ostanejo.
 */
class MemberAuditIT extends MemberApiTest {

    private int heads(UUID group) {
        Integer count = jdbc.queryForObject("select count(*) from audit_head where group_id = ?", Integer.class, group);
        return count == null ? 0 : count;
    }

    @Test
    @Tag("FR-007-12")
    void successfulAndRejectedOperationsLeaveTheAuditTrailUntouched() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        SignedIn viewer = registeredUser("Dana Bralec");
        SignedIn leaver = registeredUser("Erik Odhajajoči");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID adminId = join(group, admin, "ADMIN");
        UUID editorId = join(group, editor, "EDITOR");
        UUID viewerId = join(group, viewer, "VIEWER");
        join(group, leaver, "VIEWER");
        assertThat(createContact(group, editor, "Janez")).isEqualTo(201);
        String trailBefore =
                get("/api/groups/" + group + "/audit", owner.idToken()).body();
        List<Map<String, Object>> snapshotBefore = members.auditSnapshot(group);
        int entriesBefore = members.auditEntryCount(group);
        int headsBefore = heads(group);

        // uspešne operacije
        assertThat(changeRole(group, owner, viewerId, roleBody("EDITOR", 0)).statusCode())
                .isEqualTo(200);
        assertThat(leave(group, leaver).statusCode()).isEqualTo(204);
        assertThat(transfer(group, owner, transferBody(adminId)).statusCode()).isEqualTo(200);
        assertThat(remove(group, admin, editorId).statusCode()).isEqualTo(204);
        // zavrnjene operacije: 403, 404, 409, 400
        assertThat(changeRole(group, viewer, adminId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(403);
        assertThat(remove(group, viewer, UUID.randomUUID()).statusCode()).isEqualTo(403);
        assertThat(remove(group, owner, UUID.randomUUID()).statusCode()).isEqualTo(404);
        assertThat(changeRole(group, admin, viewerId, roleBody("EDITOR", 1)).statusCode())
                .isEqualTo(400);
        assertThat(changeRole(group, admin, viewerId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(409);
        assertThat(leave(group, admin).statusCode()).isEqualTo(409);
        assertThat(transfer(group, admin, transferBody(UUID.randomUUID())).statusCode())
                .isEqualTo(409);
        assertThat(transfer(group, admin, "{}").statusCode()).isEqualTo(400);
        groups.archive(group);
        assertThat(remove(group, admin, viewerId).statusCode()).isEqualTo(409);

        assertThat(members.auditEntryCount(group)).isEqualTo(entriesBefore);
        assertThat(members.auditSnapshot(group)).isEqualTo(snapshotBefore);
        assertThat(heads(group)).isEqualTo(headsBefore);
        assertThat(get("/api/groups/" + group + "/audit", owner.idToken()).body())
                .isEqualTo(trailBefore);
    }

    @Test
    @Tag("FR-007-12")
    void namesOfRemovedFormerAndDemotedMembersStayInTheTrail() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn removed = registeredUser("Odstranjeni Urednik");
        SignedIn left = registeredUser("Odhajajoči Urednik");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID removedId = join(group, removed, "EDITOR");
        join(group, left, "EDITOR");
        assertThat(createContact(group, removed, "Prvi")).isEqualTo(201);
        assertThat(createContact(group, left, "Drugi")).isEqualTo(201);

        assertThat(remove(group, owner, removedId).statusCode()).isEqualTo(204);
        assertThat(leave(group, left).statusCode()).isEqualTo(204);

        assertThat(auditActorNames(group, owner)).contains("Odstranjeni Urednik", "Odhajajoči Urednik");
    }
}
