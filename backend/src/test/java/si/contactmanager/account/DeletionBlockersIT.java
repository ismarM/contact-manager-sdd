package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/** Skupine, ki preprečujejo izbris računa (FR-012-06, SC-007). */
@Tag("FR-012-06")
class DeletionBlockersIT extends AccountApiTest {

    private List<String> titles(SignedIn user) throws Exception {
        HttpResponse<String> response = get("/api/me/deletion-blockers", user.idToken());
        assertThat(response.statusCode()).as("GET /api/me/deletion-blockers").isEqualTo(200);
        JsonNode groups = JSON.readTree(response.body()).get("groups");
        List<String> titles = new java.util.ArrayList<>();
        groups.forEach(group -> titles.add(group.get("title").asString()));
        return titles;
    }

    @Test
    void onlyActiveGroupsOwnedByTheUserBlockAndAreSortedByTitle() throws Exception {
        SignedIn pia = registeredUser("Pia Lastnica");
        SignedIn ana = registeredUser("Ana Druga");
        UUID klub = activeGroup(pia, "Klub");
        UUID feri = activeGroup(pia, "Projekt FERI");
        activeGroup(pia, "Čebelarji");
        archivedGroup(pia, "Arhivirana v lasti");
        UUID asAdmin = activeGroup(ana, "Kot admin");
        groups.addMember(asAdmin, id(pia), "ADMIN");
        UUID asEditor = activeGroup(ana, "Kot urednik");
        groups.addMember(asEditor, id(pia), "EDITOR");
        UUID asViewer = activeGroup(ana, "Kot bralec");
        groups.addMember(asViewer, id(pia), "VIEWER");
        activeGroup(ana, "Tuja skupina");

        HttpResponse<String> response = get("/api/me/deletion-blockers", pia.idToken());

        assertThat(titles(pia)).containsExactly("Čebelarji", "Klub", "Projekt FERI");
        JsonNode first = JSON.readTree(response.body()).get("groups").get(1);
        assertThat(first.get("id").asString()).isEqualTo(klub.toString());
        assertThat(JSON.readTree(response.body()).get("groups").get(2).get("id").asString())
                .isEqualTo(feri.toString());
        assertThat(response.body()).doesNotContain("userId").doesNotContain(String.valueOf(id(pia)) + ",");
    }

    @Test
    void listIsEmptyWhenAllOwnedGroupsAreArchivedAndAfterOwnershipTransfer() throws Exception {
        SignedIn pia = registeredUser("Pia Brez");
        SignedIn ana = registeredUser("Ana Prevzame");
        UUID one = activeGroup(pia, "Ena");
        UUID two = activeGroup(pia, "Dve");
        groups.addMember(two, id(ana), "ADMIN");
        assertThat(titles(pia)).containsExactly("Dve", "Ena");

        // prenos lastništva (007) in arhiviranje (003)
        UUID anaMember = members.memberId(two, id(ana));
        assertThat(post(
                                "/api/groups/" + two + "/ownership-transfer",
                                pia.idToken(),
                                "{\"memberId\":\"" + anaMember + "\"}")
                        .statusCode())
                .isEqualTo(200);
        assertThat(titles(pia)).containsExactly("Ena");
        groups.archive(one);

        assertThat(titles(pia)).isEmpty();
    }
}
