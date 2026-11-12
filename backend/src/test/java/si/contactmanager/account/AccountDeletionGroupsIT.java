package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/** Posledice izbrisa računa za skupine po tabeli *Odločanje o skupinah ob izbrisu* v data-model.md (FR-012-09, -10). */
@Tag("FR-012-09")
@Tag("FR-012-10")
class AccountDeletionGroupsIT extends AccountApiTest {

    @Test
    void everyGroupKindIsHandledByItsRuleInOneDeletion() throws Exception {
        SignedIn x = registeredUser("Iks Izbrisan");
        SignedIn a = registeredUser("Ana Ostane");
        SignedIn b = registeredUser("Bojan Ostane");

        // arhivirana, x lastnik, drugi člani → trajno arhivirana
        UUID withOthers = archivedGroup(x, "Arhivirana z drugimi");
        groups.addMember(withOthers, id(a), "EDITOR");
        groups.addMember(withOthers, id(b), "VIEWER");
        UUID contactInOthers = contacts.insert(withOthers, id(a), "Ostane", "Kontakt");
        SignedIn c = registeredUser("Cene Povabljen");
        UUID inviteIntoOthers = invitations.invite(withOthers, id(c), id(x), "VIEWER");
        // arhivirana, x lastnik in edini član → izbrisana
        UUID soleOwned = archivedGroup(x, "Arhivirana edini član");
        UUID inviteIntoSole = invitations.invite(soleOwned, id(c), id(x), "VIEWER");
        UUID contactInSole = contacts.insert(soleOwned, id(x), "Izgine", "Kontakt");
        audit.insertEntries(soleOwned, id(x), 2);
        // trajno arhivirana, x edini član → izbrisana
        UUID permanentSole = activeGroup(a, "Trajno edini");
        groups.addMember(permanentSole, id(x), "VIEWER");
        groups.makePermanentlyArchived(permanentSole);
        // trajno arhivirana z več člani → ostane
        UUID permanentMany = activeGroup(a, "Trajno več");
        groups.addMember(permanentMany, id(x), "EDITOR");
        groups.addMember(permanentMany, id(b), "VIEWER");
        groups.makePermanentlyArchived(permanentMany);
        // arhivirana, x urednik, lastnik obstaja → ostane z istim lastnikom
        UUID ownerExists = archivedGroup(a, "Arhivirana z lastnikom");
        groups.addMember(ownerExists, id(x), "EDITOR");
        // nearhivirane, x kot ADMIN/EDITOR/VIEWER → samo članstvo
        UUID asAdmin = activeGroup(a, "Admin");
        groups.addMember(asAdmin, id(x), "ADMIN");
        UUID asEditor = activeGroup(a, "Urednik");
        groups.addMember(asEditor, id(x), "EDITOR");
        UUID asViewer = activeGroup(b, "Bralec");
        groups.addMember(asViewer, id(x), "VIEWER");

        HttpResponse<String> response = deleteAccount(x);

        assertThat(response.statusCode()).isIn(204, 202);
        // trajno arhivirana brez lastnika, člana in vlogi nespremenjeni, kontakti nespremenjeni
        assertThat(groups.exists(withOthers)).isTrue();
        assertThat(groups.archivedAt(withOthers)).isNotNull();
        assertThat(members.ownerCount(withOthers)).isZero();
        assertThat(members.role(withOthers, id(a))).contains("EDITOR");
        assertThat(members.role(withOthers, id(b))).contains("VIEWER");
        assertThat(contacts.exists(contactInOthers)).isTrue();
        // izbrisani z vsemi podatki
        assertThat(groups.exists(soleOwned)).isFalse();
        assertThat(contacts.exists(contactInSole)).isFalse();
        assertThat(audit.count(soleOwned)).isZero();
        assertThat(invitations.exists(inviteIntoSole))
                .as("povabila izbrisane skupine izginejo z njo")
                .isFalse();
        assertThat(groups.exists(permanentSole)).isFalse();
        // preostale
        assertThat(groups.exists(permanentMany)).isTrue();
        assertThat(members.count(permanentMany)).isEqualTo(1);
        assertThat(members.role(permanentMany, id(b))).contains("VIEWER");
        assertThat(groups.archivedAt(permanentMany)).as("ostane arhivirana").isNotNull();
        assertThat(members.ownerCount(permanentMany)).isZero();
        assertThat(groups.archivedAt(ownerExists)).as("ostane arhivirana").isNotNull();
        assertThat(members.role(ownerExists, id(a))).contains("OWNER");
        assertThat(members.count(ownerExists)).isEqualTo(1);
        for (UUID group : new UUID[] {asAdmin, asEditor, asViewer}) {
            assertThat(groups.exists(group)).isTrue();
            assertThat(members.ownerCount(group)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject(
                        "select count(*) from group_member where group_id in (?, ?)", Integer.class, asAdmin, asEditor))
                .isEqualTo(2);

        // povabilo v skupino, ki postane trajno arhivirana, ostane; sprejem sledi 006
        assertThat(invitations.exists(inviteIntoOthers)).isTrue();
        JsonNode received = JSON.readTree(get("/api/invitations", c.idToken()).body());
        assertThat(received.get("items")).hasSize(1);
        assertThat(received.get("items").get(0).get("invitedBy").isNull()).isTrue();
        assertThat(post(
                                "/api/invitations/"
                                        + received.get("items").get(0).get("id").asString() + "/accept",
                                c.idToken(),
                                null)
                        .statusCode())
                .isEqualTo(200);
        // lastnik je pri članu prikazan kot »izbrisan uporabnik« (007)
        assertThat(JSON.readTree(get("/api/groups/" + withOthers + "/members", a.idToken())
                                .body())
                        .get("deletedOwner")
                        .asBoolean())
                .isTrue();
        // trajno arhivirana skupina je pri drugem članu vidna brez lastnika (003)
        JsonNode archived =
                JSON.readTree(get("/api/groups/archived", a.idToken()).body());
        boolean found = false;
        for (JsonNode item : archived.get("items")) {
            if (withOthers.toString().equals(item.get("id").asString())) {
                found = true;
                assertThat(item.get("permanentlyArchived").asBoolean()).isTrue();
            }
        }
        assertThat(found).as("skupina v seznamu arhiviranih").isTrue();
    }
}
