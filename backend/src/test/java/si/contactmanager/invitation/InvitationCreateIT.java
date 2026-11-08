package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.invitation.support.InvitationFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Pošiljanje povabila {@code POST /api/groups/{groupId}/invitations} (FR-006-02, FR-006-04; plan.md). */
class InvitationCreateIT extends ApiTest {

    private GroupFixtures groups;
    private InvitationFixtures invitations;

    @BeforeEach
    void setUp() {
        groups = new GroupFixtures(jdbc);
        invitations = new InvitationFixtures(jdbc);
    }

    private static String body(String email, String role) {
        return "{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}";
    }

    @Test
    @Tag("FR-006-02")
    void ownerInvitesARegisteredUserAsAdmin() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(groups.userId(owner.uid()), "Projekt FERI");
        String inviteeEmail = groups.email(invitee.uid());

        HttpResponse<String> response = post(
                "/api/groups/" + group + "/invitations",
                owner.idToken(),
                body(" " + inviteeEmail.toUpperCase() + " ", "ADMIN"));

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> created = json(response.body());
        assertThat(created)
                .containsEntry("inviteeEmail", inviteeEmail)
                .containsEntry("role", "ADMIN")
                .containsEntry("canWithdraw", true)
                .containsKey("createdAt")
                .containsKey("id");
        assertThat(created.get("invitedBy")).isEqualTo(Map.of("name", "Ana Novak", "email", groups.email(owner.uid())));
        assertThat(jdbc.queryForObject("select inviter_id from invitation where group_id = ?", Long.class, group))
                .isEqualTo(groups.userId(owner.uid()));
        assertThat(invitations.count(group)).isEqualTo(1);
        assertThat(invitations.memberRole(group, groups.userId(invitee.uid()))).isEmpty();
    }

    @Test
    @Tag("FR-006-02")
    void adminInvitesAsEditorAndViewer() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Eva Urednik");
        SignedIn viewer = registeredUser("Vid Bralec");
        UUID group = groups.createGroup(groups.userId(owner.uid()), "Projekt FERI");
        groups.addMember(group, groups.userId(admin.uid()), "ADMIN");

        HttpResponse<String> asEditor = post(
                "/api/groups/" + group + "/invitations", admin.idToken(), body(groups.email(editor.uid()), "EDITOR"));
        HttpResponse<String> asViewer = post(
                "/api/groups/" + group + "/invitations", admin.idToken(), body(groups.email(viewer.uid()), "VIEWER"));

        assertThat(asEditor.statusCode()).isEqualTo(201);
        assertThat(json(asEditor.body())).containsEntry("role", "EDITOR").containsEntry("canWithdraw", true);
        assertThat(asViewer.statusCode()).isEqualTo(201);
        assertThat(json(asViewer.body())).containsEntry("role", "VIEWER").containsEntry("canWithdraw", true);
    }

    @Test
    @Tag("FR-006-02")
    void inviteeSeesThePendingInvitationInTheirList() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(groups.userId(owner.uid()), "Projekt FERI");

        post("/api/groups/" + group + "/invitations", owner.idToken(), body(groups.email(invitee.uid()), "EDITOR"));

        Map<String, Object> list =
                json(get("/api/invitations", invitee.idToken()).body());
        assertThat(list).containsEntry("total", 1);
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 1);
    }

    @Test
    @Tag("FR-006-02")
    void aFormerMemberCanBeInvitedAgain() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn former = registeredUser("Bivši Član");
        UUID group = groups.createGroup(groups.userId(owner.uid()), "Projekt FERI");
        groups.addMember(group, groups.userId(former.uid()), "EDITOR");
        invitations.removeMember(group, groups.userId(former.uid()));

        HttpResponse<String> response = post(
                "/api/groups/" + group + "/invitations", owner.idToken(), body(groups.email(former.uid()), "VIEWER"));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(invitations.count(group)).isEqualTo(1);
    }
}
