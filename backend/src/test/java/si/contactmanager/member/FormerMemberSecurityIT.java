package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * SC-001: po odstranitvi ali zapustitvi 100 % zahtevkov bivšega člana za skupino vrne 404 (prazno telo) – pri vsakem
 * endpointu skupine 002–007. Seznam poti je iz plan.md (*Public Interfaces*) funkcionalnosti 002–007.
 */
@Tag("FR-007-05")
@Tag("FR-007-06")
class FormerMemberSecurityIT extends MemberApiTest {

    enum Exit {
        REMOVED,
        LEFT
    }

    private record Call(String method, String path, String body) {}

    private static List<Call> calls(UUID group, UUID contact, UUID entry, UUID invitation, UUID member) {
        String g = "/api/groups/" + group;
        return List.of(
                new Call("GET", g, null),
                new Call("PUT", g, "{\"title\":\"X\",\"color\":\"tinta\",\"version\":0}"),
                new Call("POST", g + "/archive", null),
                new Call("POST", g + "/unarchive", null),
                new Call("DELETE", g, null),
                new Call("GET", g + "/contacts", null),
                new Call("POST", g + "/contacts", "{\"firstName\":\"Novi\"}"),
                new Call("GET", g + "/contacts/" + contact, null),
                new Call("PUT", g + "/contacts/" + contact, "{\"firstName\":\"X\",\"version\":0}"),
                new Call("DELETE", g + "/contacts/" + contact + "?version=0", null),
                new Call("GET", g + "/tags", null),
                new Call("GET", g + "/audit", null),
                new Call("GET", g + "/audit/" + entry, null),
                new Call("GET", g + "/audit/" + entry + "/changes", null),
                new Call("POST", g + "/audit/" + entry + "/rollback", null),
                new Call("POST", g + "/audit/initial-state/rollback", null),
                new Call("GET", g + "/invitations", null),
                new Call("POST", g + "/invitations", "{\"email\":\"x@primer.si\",\"role\":\"VIEWER\"}"),
                new Call("DELETE", g + "/invitations/" + invitation, null),
                new Call("GET", g + "/members", null),
                new Call("PUT", g + "/members/" + member, "{\"role\":\"VIEWER\",\"version\":0}"),
                new Call("DELETE", g + "/members/" + member, null),
                new Call("POST", g + "/leave", null),
                new Call("POST", g + "/ownership-transfer", "{\"memberId\":\"" + member + "\"}"));
    }

    @ParameterizedTest
    @EnumSource(Exit.class)
    void aFormerMemberGets404EverywhereAndTheGroupDisappearsFromTheirLists(Exit exit) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn former = registeredUser("Bivši član");
        SignedIn invitee = registeredUser("Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID formerId = join(group, former, "EDITOR");
        assertThat(createContact(group, owner, "Janez")).isEqualTo(201);
        UUID contact = jdbc.queryForObject("select id from contact where group_id = ?", UUID.class, group);
        UUID entry = jdbc.queryForObject("select id from audit_entry where group_id = ? limit 1", UUID.class, group);
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "VIEWER");
        UUID ownerMember = members.memberId(group, id(owner));
        assertThat(get("/api/groups", former.idToken()).body()).contains(group.toString());
        if (exit == Exit.REMOVED) {
            assertThat(remove(group, owner, formerId).statusCode()).isEqualTo(204);
        } else {
            assertThat(leave(group, former).statusCode()).isEqualTo(204);
        }

        for (Call call : calls(group, contact, entry, invitation, ownerMember)) {
            HttpResponse<String> response =
                    Http.send(call.method(), url(call.path()), Http.bearer(former.idToken()), call.body());
            assertThat(response.statusCode())
                    .as("%s %s", call.method(), call.path())
                    .isEqualTo(404);
            assertThat(response.body()).as("%s %s", call.method(), call.path()).isEmpty();
        }
        HttpResponse<String> overview = get("/api/groups", former.idToken());
        HttpResponse<String> archivedOverview = get("/api/groups/archived", former.idToken());
        assertThat(overview.statusCode()).isEqualTo(200);
        assertThat(archivedOverview.statusCode()).isEqualTo(200);
        assertThat(overview.body()).doesNotContain(group.toString());
        assertThat(archivedOverview.body()).doesNotContain(group.toString());
        assertThat(groups.exists(group)).isTrue();
        assertThat(invitations.exists(invitation)).isTrue();
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(Exit.class)
    void aFormerMemberInvitedAgainBecomesAMemberWithTheNewRole(Exit exit) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn former = registeredUser("Bivši član");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID formerId = join(group, former, "EDITOR");
        if (exit == Exit.REMOVED) {
            assertThat(remove(group, owner, formerId).statusCode()).isEqualTo(204);
        } else {
            assertThat(leave(group, former).statusCode()).isEqualTo(204);
        }
        UUID invitation = invitations.invite(group, id(former), id(owner), "VIEWER");

        assertThat(post("/api/invitations/" + invitation + "/accept", former.idToken(), null)
                        .statusCode())
                .isEqualTo(200);

        assertThat(get("/api/groups/" + group, former.idToken()).statusCode()).isEqualTo(200);
        assertThat(members.role(group, id(former))).contains("VIEWER");
    }
}
