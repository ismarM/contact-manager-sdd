package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Povabila ne pišejo v revizijsko sled (FR-005-06, research R-10): pošiljanje, sprejem, zavrnitev, umik in
 * {@code 409 ALREADY_MEMBER} ne spremenijo vrstic {@code audit_entry}, {@code audit_head} niti odgovora sledi.
 */
@Tag("FR-006-02")
@Tag("FR-006-08")
@Tag("FR-006-10")
@Tag("FR-006-14")
class InvitationAuditIT extends InvitationApiTest {

    private int heads(UUID group) {
        Integer count = jdbc.queryForObject("select count(*) from audit_head where group_id = ?", Integer.class, group);
        return count == null ? 0 : count;
    }

    @Test
    void sendAcceptDeclineWithdrawAndAlreadyMemberLeaveTheAuditTrailUntouched() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn accepting = registeredUser("Prva Povabljena");
        SignedIn declining = registeredUser("Druga Povabljena");
        SignedIn withdrawn = registeredUser("Tretja Povabljena");
        SignedIn member = registeredUser("Četrta Članica");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        assertThat(post("/api/groups/" + group + "/contacts", owner.idToken(), "{\"firstName\":\"Janez\"}")
                        .statusCode())
                .isEqualTo(201);
        String trailBefore =
                get("/api/groups/" + group + "/audit", owner.idToken()).body();
        int entriesBefore = invitations.auditEntryCount(group);
        int headsBefore = heads(group);

        UUID first = UUID.fromString((String)
                json(send(group, owner, email(accepting), "EDITOR").body()).get("id"));
        UUID second = UUID.fromString((String)
                json(send(group, owner, email(declining), "VIEWER").body()).get("id"));
        UUID third = UUID.fromString((String)
                json(send(group, owner, email(withdrawn), "VIEWER").body()).get("id"));
        assertThat(accept(first, accepting).statusCode()).isEqualTo(200);
        assertThat(decline(second, declining).statusCode()).isEqualTo(204);
        assertThat(withdraw(group, owner, third).statusCode()).isEqualTo(204);
        groups.addMember(group, id(member), "VIEWER");
        UUID stale = invitations.invite(group, id(member), id(owner), "EDITOR");
        assertThat(accept(stale, member).statusCode()).isEqualTo(409);

        assertThat(invitations.auditEntryCount(group)).isEqualTo(entriesBefore);
        assertThat(heads(group)).isEqualTo(headsBefore);
        assertThat(get("/api/groups/" + group + "/audit", owner.idToken()).body())
                .isEqualTo(trailBefore);
    }
}
