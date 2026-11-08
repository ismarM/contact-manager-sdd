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

/** Prejeta povabila {@code GET /api/invitations} in {@code /count} (FR-006-05, FR-006-06, FR-006-07, FR-006-12). */
class ReceivedInvitationListIT extends InvitationApiTest {

    private static final TypeReference<List<Map<String, Object>>> ROWS = new TypeReference<>() {};

    private List<Map<String, Object>> items(Map<String, Object> page) {
        return JSON.convertValue(page.get("items"), ROWS);
    }

    @Test
    @Tag("FR-006-05")
    void listsOwnInvitationsNewestFirstWithGroupAndInviter() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID older = groups.createGroup(id(owner), "Starejša", null, "mah");
        UUID newer = groups.createGroup(id(owner), "Novejša", null, "morje");
        OffsetDateTime now = OffsetDateTime.now();
        UUID first = invitations.invite(older, id(invitee), id(owner), "VIEWER", now.minusHours(2));
        UUID second = invitations.invite(newer, id(invitee), id(owner), "EDITOR", now.minusHours(1));

        Map<String, Object> page =
                json(get("/api/invitations", invitee.idToken()).body());

        assertThat(page).containsEntry("total", 2).containsEntry("page", 0).containsEntry("size", 25);
        List<Map<String, Object>> items = items(page);
        assertThat(items).extracting(i -> i.get("id")).containsExactly(second.toString(), first.toString());
        assertThat(items.get(0))
                .containsEntry("role", "EDITOR")
                .containsKey("createdAt")
                .containsEntry(
                        "group",
                        Map.of("id", newer.toString(), "title", "Novejša", "color", "morje", "archived", false))
                .containsEntry("invitedBy", Map.of("name", "Ana Novak", "email", email(owner)));
    }

    @Test
    @Tag("FR-006-05")
    void otherUsersInvitationsAreNeverListed() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        SignedIn other = registeredUser("Drug Uporabnik");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        invitations.invite(group, id(other), id(owner), "VIEWER");

        assertThat(items(json(get("/api/invitations", invitee.idToken()).body())))
                .isEmpty();
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 0);
    }

    @Test
    @Tag("FR-006-05")
    void pagesOf25AndTheCount() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        for (int i = 0; i < 30; i++) {
            UUID group = groups.createGroup(id(owner), "Skupina " + i);
            invitations.invite(group, id(invitee), id(owner), "VIEWER");
        }

        Map<String, Object> first =
                json(get("/api/invitations?size=25", invitee.idToken()).body());
        Map<String, Object> second =
                json(get("/api/invitations?page=1&size=25", invitee.idToken()).body());

        assertThat(items(first)).hasSize(25);
        assertThat(items(second)).hasSize(5);
        assertThat(second).containsEntry("total", 30).containsEntry("page", 1);
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 30);
    }

    @Test
    @Tag("FR-006-05")
    void pageSizesFiftyAndHundredAreHonoured() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        for (int i = 0; i < 60; i++) {
            invitations.invite(groups.createGroup(id(owner), "Skupina " + i), id(invitee), id(owner), "VIEWER");
        }

        assertThat(items(json(get("/api/invitations?size=50", invitee.idToken()).body())))
                .hasSize(50);
        assertThat(items(
                        json(get("/api/invitations?size=100", invitee.idToken()).body())))
                .hasSize(60);
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "page=x", "size=0", "size=101", "size=x"})
    @Tag("FR-006-05")
    void invalidPagingIs400(String query) throws Exception {
        SignedIn invitee = registeredUser("Eva Povabljena");

        HttpResponse<String> response = get("/api/invitations?" + query, invitee.idToken());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
    }

    @Test
    @Tag("FR-006-06")
    void countIsZeroWithoutInvitationsAndWithoutProfile() throws Exception {
        SignedIn registered = registeredUser("Eva Povabljena");
        SignedIn noProfile = newGoogleUser("Brez Profila");

        assertThat(json(get("/api/invitations/count", registered.idToken()).body()))
                .isEqualTo(Map.of("count", 0));
        HttpResponse<String> count = get("/api/invitations/count", noProfile.idToken());
        assertThat(count.statusCode()).isEqualTo(200);
        assertThat(json(count.body())).isEqualTo(Map.of("count", 0));
        HttpResponse<String> list = get("/api/invitations", noProfile.idToken());
        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(items(json(list.body()))).isEmpty();
    }

    @Test
    @Tag("FR-006-07")
    @Tag("FR-006-12")
    void deletedInviterShowsAsNullButTheInvitationStays() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn inviter = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        invitations.invite(group, id(invitee), id(inviter), "EDITOR");

        invitations.deleteUser(id(inviter));

        List<Map<String, Object>> items =
                items(json(get("/api/invitations", invitee.idToken()).body()));
        assertThat(items).hasSize(1);
        assertThat(items.get(0)).containsKey("invitedBy").containsEntry("invitedBy", null);
    }

    @Test
    @Tag("FR-006-12")
    void demotedOrRemovedInviterDoesNotChangeTheInvitation() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn demoted = registeredUser("Bojan Kos");
        SignedIn removed = registeredUser("Cene Odstranjen");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(demoted), "ADMIN");
        groups.addMember(group, id(removed), "ADMIN");
        invitations.invite(group, id(invitee), id(demoted), "EDITOR");
        UUID other = groups.createGroup(id(owner), "Druga skupina");
        groups.addMember(other, id(removed), "ADMIN");
        invitations.invite(other, id(invitee), id(removed), "VIEWER");

        invitations.setRole(group, id(demoted), "VIEWER");
        invitations.removeMember(other, id(removed));

        List<Map<String, Object>> items =
                items(json(get("/api/invitations", invitee.idToken()).body()));
        assertThat(items).hasSize(2);
        assertThat(items)
                .extracting(i -> (String) ((Map<?, ?>) i.get("invitedBy")).get("name"))
                .containsExactlyInAnyOrder("Bojan Kos", "Cene Odstranjen");
    }

    @Test
    @Tag("FR-006-07")
    void archivedAndPermanentlyArchivedGroupsAreMarkedArchived() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID archived = groups.createGroup(id(owner), "Arhivirana");
        groups.archive(archived);
        UUID permanent = groups.createGroup(id(owner), "Trajna");
        groups.makePermanentlyArchived(permanent);
        invitations.invite(archived, id(invitee), id(owner), "VIEWER");
        invitations.invite(permanent, id(invitee), id(owner), "VIEWER");

        List<Map<String, Object>> items =
                items(json(get("/api/invitations", invitee.idToken()).body()));

        assertThat(items).hasSize(2);
        assertThat(items)
                .allSatisfy(i ->
                        assertThat(((Map<?, ?>) i.get("group")).get("archived")).isEqualTo(true));
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 2);
    }

    @Test
    @Tag("FR-006-05")
    void groupTitleAndColorAreAlwaysTheCurrentOnes() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Prvotni naslov", null, "tinta");
        invitations.invite(group, id(invitee), id(owner), "VIEWER");
        jdbc.update("update contact_group set title = 'Nov naslov', color = 'sliva' where id = ?", group);

        Map<String, Object> groupOfItem = JSON.convertValue(
                items(json(get("/api/invitations", invitee.idToken()).body()))
                        .get(0)
                        .get("group"),
                new TypeReference<Map<String, Object>>() {});

        assertThat(groupOfItem).containsEntry("title", "Nov naslov").containsEntry("color", "sliva");
    }

    @Test
    @Tag("FR-006-12")
    void deletedGroupAndDeletedInviteeLeaveNoInvitation() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        SignedIn leaving = registeredUser("Odhajajoči");
        UUID group = groups.createGroup(id(owner), "Za izbris");
        invitations.invite(group, id(invitee), id(owner), "VIEWER");
        UUID other = groups.createGroup(id(owner), "Drugo");
        UUID leavingInvitation = invitations.invite(other, id(leaving), id(owner), "VIEWER");

        int deleted = delete("/api/groups/" + group, owner.idToken()).statusCode();
        invitations.deleteUser(id(leaving));

        assertThat(deleted).isEqualTo(204);
        assertThat(items(json(get("/api/invitations", invitee.idToken()).body())))
                .isEmpty();
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 0);
        assertThat(invitations.exists(leavingInvitation)).isFalse();
    }

    private HttpResponse<String> delete(String path, String token) throws Exception {
        return si.contactmanager.support.Http.send("DELETE", url(path), si.contactmanager.support.Http.bearer(token));
    }
}
