package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/** Poslana povabila skupine {@code GET /api/groups/{groupId}/invitations} (FR-006-13). */
@Tag("FR-006-13")
class OutgoingInvitationListIT extends InvitationApiTest {

    private static final TypeReference<List<Map<String, Object>>> ROWS = new TypeReference<>() {};

    private List<Map<String, Object>> items(HttpResponse<String> response) {
        return JSON.convertValue(json(response.body()).get("items"), ROWS);
    }

    @Test
    void adminAndOwnerSeeAllPendingInvitationsNewestFirst() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn one = registeredUser("Prvi Povabljen");
        SignedIn two = registeredUser("Drugi Povabljen");
        SignedIn three = registeredUser("Tretji Povabljen");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        OffsetDateTime now = OffsetDateTime.now();
        UUID a = invitations.invite(group, id(one), id(owner), "ADMIN", now.minusHours(3));
        UUID b = invitations.invite(group, id(two), id(admin), "EDITOR", now.minusHours(2));
        UUID c = invitations.invite(group, id(three), id(owner), "VIEWER", now.minusHours(1));

        for (SignedIn viewer : List.of(admin, owner)) {
            HttpResponse<String> response = get("/api/groups/" + group + "/invitations", viewer.idToken());

            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(json(response.body())).containsEntry("total", 3).containsEntry("page", 0);
            List<Map<String, Object>> items = items(response);
            assertThat(items).extracting(i -> i.get("id")).containsExactly(c.toString(), b.toString(), a.toString());
            assertThat(items.get(0))
                    .containsEntry("inviteeEmail", email(three))
                    .containsEntry("role", "VIEWER")
                    .containsEntry("invitedBy", Map.of("name", "Ana Novak", "email", email(owner)))
                    .containsKey("createdAt");
        }
    }

    @Test
    void canWithdrawIsAlwaysTrueForTheOwnerAndFalseForAdminInvitationsOfAnAdmin() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn one = registeredUser("Prvi");
        SignedIn two = registeredUser("Drugi");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        invitations.invite(group, id(one), id(owner), "ADMIN");
        invitations.invite(group, id(two), id(owner), "EDITOR");

        Map<String, Boolean> asOwner =
                canWithdraw(items(get("/api/groups/" + group + "/invitations", owner.idToken())));
        Map<String, Boolean> asAdmin =
                canWithdraw(items(get("/api/groups/" + group + "/invitations", admin.idToken())));

        assertThat(asOwner).containsEntry("ADMIN", true).containsEntry("EDITOR", true);
        assertThat(asAdmin).containsEntry("ADMIN", false).containsEntry("EDITOR", true);
    }

    private static Map<String, Boolean> canWithdraw(List<Map<String, Object>> items) {
        return items.stream().collect(java.util.stream.Collectors.toMap(i -> (String) i.get("role"), i ->
                (Boolean) i.get("canWithdraw")));
    }

    @Test
    void invitationsOfOtherGroupsAreNotIncludedAndAnEmptyGroupHasNone() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID empty = groups.createGroup(id(owner), "Prazna");
        UUID other = groups.createGroup(id(owner), "Druga");
        invitations.invite(other, id(invitee), id(owner), "VIEWER");

        HttpResponse<String> response = get("/api/groups/" + empty + "/invitations", owner.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("total", 0);
        assertThat(items(response)).isEmpty();
    }

    @Test
    void pagesOf25() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        for (int i = 0; i < 30; i++) {
            SignedIn invitee = registeredUser("Povabljen " + i);
            invitations.invite(group, id(invitee), id(owner), "VIEWER");
        }

        HttpResponse<String> first = get("/api/groups/" + group + "/invitations?size=25", owner.idToken());
        HttpResponse<String> second = get("/api/groups/" + group + "/invitations?page=1&size=25", owner.idToken());

        assertThat(items(first)).hasSize(25);
        assertThat(items(second)).hasSize(5);
        assertThat(json(second.body())).containsEntry("total", 30);
    }

    @Test
    void pageSizesFiftyAndHundredAreHonoured() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        for (int i = 0; i < 60; i++) {
            invitations.invite(group, id(registeredUser("Povabljen " + i)), id(owner), "VIEWER");
        }

        assertThat(items(get("/api/groups/" + group + "/invitations?size=50", owner.idToken())))
                .hasSize(50);
        assertThat(items(get("/api/groups/" + group + "/invitations?size=100", owner.idToken())))
                .hasSize(60);
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "page=x", "size=0", "size=101", "size=x"})
    void invalidPagingIs400(String query) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        HttpResponse<String> response = get("/api/groups/" + group + "/invitations?" + query, owner.idToken());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
    }

    @Test
    void deletedInviterIsNullAndDemotedOrRemovedInviterKeepsTheName() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn deleted = registeredUser("Izbrisan Povabitelj");
        SignedIn demoted = registeredUser("Znižan Povabitelj");
        SignedIn removed = registeredUser("Odstranjen Povabitelj");
        SignedIn one = registeredUser("Prvi");
        SignedIn two = registeredUser("Drugi");
        SignedIn three = registeredUser("Tretji");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(demoted), "ADMIN");
        groups.addMember(group, id(removed), "ADMIN");
        invitations.invite(group, id(one), id(deleted), "VIEWER");
        invitations.invite(group, id(two), id(demoted), "VIEWER");
        invitations.invite(group, id(three), id(removed), "VIEWER");

        invitations.deleteUser(id(deleted));
        invitations.setRole(group, id(demoted), "VIEWER");
        invitations.removeMember(group, id(removed));

        List<Map<String, Object>> items = items(get("/api/groups/" + group + "/invitations", owner.idToken()));
        assertThat(items).hasSize(3);
        Map<Object, Object> byInvitee = new java.util.HashMap<>();
        items.forEach(i -> byInvitee.put(i.get("inviteeEmail"), i.get("invitedBy")));
        assertThat(byInvitee.get(email(one))).isNull();
        assertThat(((Map<?, ?>) byInvitee.get(email(two))).get("name")).isEqualTo("Znižan Povabitelj");
        assertThat(((Map<?, ?>) byInvitee.get(email(three))).get("name")).isEqualTo("Odstranjen Povabitelj");
    }

    @Test
    void archivedAndPermanentlyArchivedGroupsStillListTheInvitations() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID archived = groups.createGroup(id(owner), "Arhivirana");
        UUID permanent = groups.createGroup(id(owner), "Trajna");
        groups.addMember(permanent, id(admin), "ADMIN");
        invitations.invite(archived, id(invitee), id(owner), "VIEWER");
        invitations.invite(permanent, id(invitee), id(owner), "VIEWER");
        groups.archive(archived);
        groups.makePermanentlyArchived(permanent);

        HttpResponse<String> asOwner = get("/api/groups/" + archived + "/invitations", owner.idToken());
        HttpResponse<String> asAdmin = get("/api/groups/" + permanent + "/invitations", admin.idToken());

        assertThat(asOwner.statusCode()).isEqualTo(200);
        assertThat(items(asOwner)).hasSize(1);
        assertThat(asAdmin.statusCode()).isEqualTo(200);
        assertThat(items(asAdmin)).hasSize(1);
    }
}
