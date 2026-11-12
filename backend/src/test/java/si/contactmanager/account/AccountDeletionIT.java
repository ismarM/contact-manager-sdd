package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/**
 * Izbris računa (FR-012-07, -08, -11, -17): potrditev e-naslova, posledice za podatke uporabnika, stanji {@code 204}
 * in {@code 202}, drugi sočasni zahtevek in uporaba starega žetona.
 */
@Tag("FR-012-07")
@Tag("FR-012-08")
@Tag("FR-012-11")
@Tag("FR-012-17")
class AccountDeletionIT extends AccountApiTest {

    @Test
    void wrongOrMissingEmailIsRejectedWithValidationErrorAndNothingChanges() throws Exception {
        SignedIn pia = registeredUser("Pia Potrdi");
        SignedIn ana = registeredUser("Ana Skupina");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "EDITOR");

        HttpResponse<String> wrong = deleteAccount(pia, "drug@primer.si");
        HttpResponse<String> empty = post("/api/me/deletion", pia.idToken(), "{}");
        HttpResponse<String> blank = deleteAccount(pia, "   ");

        assertThat(wrong.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(wrong.body()).get("code").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(JSON.readTree(wrong.body()).get("errors").get(0).get("field").asString())
                .isEqualTo("email");
        assertThat(JSON.readTree(wrong.body()).get("errors").get(0).get("code").asString())
                .isEqualTo("MISMATCH");
        assertThat(empty.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(empty.body()).get("errors").get(0).get("code").asString())
                .isEqualTo("REQUIRED");
        assertThat(blank.statusCode()).isEqualTo(400);
        assertThat(account.appUserExists(pia.uid())).isTrue();
        assertThat(members.role(group, id(pia))).contains("EDITOR");
        assertThat(account.tombstone(pia.uid())).isEmpty();
    }

    @Test
    void confirmedDeletionRemovesAccountMembershipsAndReceivedInvitationsAndReturns204() throws Exception {
        SignedIn pia = registeredUser("Pia Izbris");
        SignedIn ana = registeredUser("Ana Ostane");
        UUID group = activeGroup(ana, "Skupina A");
        groups.addMember(group, id(pia), "EDITOR");
        UUID contact = contacts.insert(group, id(ana), "Kontakt", "Ostane");
        UUID other = activeGroup(ana, "Skupina B");
        invitations.invite(other, id(pia), id(ana), "VIEWER");
        UUID third = activeGroup(ana, "Skupina C");
        invitations.invite(third, id(pia), id(ana), "EDITOR");
        long piaId = id(pia);
        String typed = "  " + email(pia).toUpperCase() + "  ";

        HttpResponse<String> response = deleteAccount(pia, typed);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(account.appUserExists(pia.uid())).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from group_member where user_id = ?", Integer.class, piaId))
                .isZero();
        assertThat(invitations.countFor(piaId)).isZero();
        assertThat(groups.exists(group)).isTrue();
        assertThat(contacts.exists(contact)).isTrue();
        List<Map<String, Object>> tombstone = account.tombstone(pia.uid());
        assertThat(tombstone).hasSize(1);
        assertThat(tombstone.getFirst().get("provider_deleted_at")).isNotNull();
        assertThat(emulator().identityExists(pia.uid())).isFalse();
        assertThat(get("/api/groups", pia.idToken()).statusCode())
                .as("star žeton")
                .isEqualTo(401);
    }

    @Test
    void sentInvitationRemainsValidAndShowsDeletedSender() throws Exception {
        SignedIn pia = registeredUser("Pia Admin");
        SignedIn ana = registeredUser("Ana Lastnica");
        SignedIn cene = registeredUser("Cene Povabljen");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "ADMIN");
        invitations.invite(group, id(cene), id(pia), "VIEWER");

        assertThat(deleteAccount(pia).statusCode()).isIn(204, 202);

        JsonNode list = JSON.readTree(get("/api/invitations", cene.idToken()).body());
        assertThat(list.get("items")).hasSize(1);
        assertThat(list.get("items").get(0).get("invitedBy").isNull()).isTrue();
        String invitationId = list.get("items").get(0).get("id").asString();
        assertThat(post("/api/invitations/" + invitationId + "/accept", cene.idToken(), null)
                        .statusCode())
                .isEqualTo(200);
        assertThat(members.role(group, id(cene))).contains("VIEWER");
    }

    @Test
    void ownerOfAnActiveGroupIsRejectedWith409AndNothingChangesEvenWithAnArchivedGroupAlsoOwned() throws Exception {
        SignedIn pia = registeredUser("Pia Lastnica Aktivne");
        SignedIn ana = registeredUser("Ana Clan");
        UUID active = activeGroup(pia, "Aktivna");
        UUID archived = archivedGroup(pia, "Arhivirana");
        groups.addMember(archived, id(ana), "EDITOR");
        UUID contact = contacts.insert(archived, id(pia), "Ostane", "Kontakt");

        HttpResponse<String> response = deleteAccount(pia);

        assertThat(response.statusCode()).isEqualTo(409);
        JsonNode body = JSON.readTree(response.body());
        assertThat(body.get("code").asString()).isEqualTo("OWNS_ACTIVE_GROUPS");
        assertThat(body.get("groups")).hasSize(1);
        assertThat(body.get("groups").get(0).get("id").asString()).isEqualTo(active.toString());
        assertThat(body.get("groups").get(0).get("title").asString()).isEqualTo("Aktivna");
        assertThat(account.appUserExists(pia.uid())).isTrue();
        assertThat(members.role(active, id(pia))).contains("OWNER");
        assertThat(members.role(archived, id(pia))).contains("OWNER");
        assertThat(groups.exists(archived)).isTrue();
        assertThat(contacts.exists(contact)).isTrue();
        assertThat(account.tombstone(pia.uid())).isEmpty();
        assertThat(get("/api/groups", pia.idToken()).statusCode())
                .as("žeton še velja")
                .isEqualTo(200);
    }

    @Test
    void wrongEmailIsRejectedWith400EvenForTheOwnerOfAnActiveGroup() throws Exception {
        SignedIn pia = registeredUser("Pia Napačen E-naslov");
        activeGroup(pia, "Aktivna");

        HttpResponse<String> response = deleteAccount(pia, "drug@primer.si");

        assertThat(response.statusCode()).as("400 pred 409").isEqualTo(400);
        assertThat(JSON.readTree(response.body())
                        .get("errors")
                        .get(0)
                        .get("code")
                        .asString())
                .isEqualTo("MISMATCH");
        assertThat(account.appUserExists(pia.uid())).isTrue();
    }

    @Test
    void invitationOfADeletedSenderIntoAnArchivedGroupCanStillBeAccepted() throws Exception {
        SignedIn pia = registeredUser("Pia Pošiljateljica");
        SignedIn ana = registeredUser("Ana Lastnica Arhiva");
        SignedIn cene = registeredUser("Cene Sprejme");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "ADMIN");
        invitations.invite(group, id(cene), id(pia), "VIEWER");
        groups.archive(group);

        assertThat(deleteAccount(pia).statusCode()).isIn(204, 202);

        JsonNode list = JSON.readTree(get("/api/invitations", cene.idToken()).body());
        assertThat(list.get("items")).hasSize(1);
        assertThat(list.get("items").get(0).get("invitedBy").isNull()).isTrue();
        String invitationId = list.get("items").get(0).get("id").asString();
        assertThat(post("/api/invitations/" + invitationId + "/accept", cene.idToken(), null)
                        .statusCode())
                .as("sprejem v arhivirano skupino (006)")
                .isEqualTo(200);
        assertThat(members.role(group, id(cene))).contains("VIEWER");
    }

    @Test
    void identityProviderOutageGives202WithPendingTombstoneAndNoLocalData() throws Exception {
        SignedIn pia = registeredUser("Pia Izpad");
        SignedIn ana = registeredUser("Ana Izpad");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "EDITOR");
        String piaEmail = email(pia);
        long[] elapsedMillis = new long[1];
        AtomicReference<HttpResponse<String>> holder = new AtomicReference<>();

        emulator().paused(() -> {
            long started = System.nanoTime();
            holder.set(deleteAccount(pia));
            elapsedMillis[0] = (System.nanoTime() - started) / 1_000_000;
        });

        HttpResponse<String> response = holder.get();
        assertThat(response.statusCode()).isEqualTo(202);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("IDENTITY_DELETION_PENDING");
        assertThat(elapsedMillis[0]).as("odgovor ob izpadu").isLessThanOrEqualTo(9000);
        assertThat(account.appUserExists(pia.uid())).isFalse();
        assertThat(jdbc.queryForObject(
                        "select count(*) from group_member where group_id = ? and user_id <> ?",
                        Integer.class,
                        group,
                        id(ana)))
                .isZero();
        Map<String, Object> tombstone = account.tombstone(pia.uid()).getFirst();
        assertThat(tombstone.get("provider_deleted_at"))
                .as("brisanje pri ponudniku še čaka")
                .isNull();
        assertThat((Integer) tombstone.get("attempts")).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "select next_attempt_at > now() + interval '20 seconds' from deleted_identity where firebase_uid = ?",
                        Boolean.class,
                        pia.uid()))
                .as("odmik po prvem neuspehu (IdentityRetryBackoff: 30 s), ne zapadla vrstica")
                .isTrue();
        String lastError = (String) tombstone.get("last_error");
        assertThat(lastError)
                .isNotBlank()
                .doesNotContain(pia.uid())
                .doesNotContain(piaEmail)
                .doesNotContain("Pia Izpad");
        assertThat(get("/api/groups", pia.idToken()).statusCode()).isEqualTo(401);
    }

    @Test
    void anIdentityAlreadyDeletedAtTheProviderCountsAsSuccessAndGives204() throws Exception {
        SignedIn pia = registeredUser("Pia Že Izbrisana Identiteta");
        emulator().deleteIdentityAsOwner(pia.uid());
        assertThat(emulator().identityExists(pia.uid())).isFalse();

        HttpResponse<String> response = deleteAccount(pia);

        assertThat(response.statusCode())
                .as("USER_NOT_FOUND pri ponudniku = uspeh")
                .isEqualTo(204);
        Map<String, Object> tombstone = account.tombstone(pia.uid()).getFirst();
        assertThat(tombstone.get("provider_deleted_at")).isNotNull();
        assertThat(tombstone.get("attempts")).isEqualTo(0);
        assertThat(tombstone.get("last_error")).isNull();
    }

    @Test
    void malformedBodyAndUnknownFieldAreValidationErrorsOverHttp() throws Exception {
        SignedIn pia = registeredUser("Pia Telo");

        HttpResponse<String> malformed = post("/api/me/deletion", pia.idToken(), "ni json");
        HttpResponse<String> unknown =
                post("/api/me/deletion", pia.idToken(), "{\"email\":\"" + email(pia) + "\",\"force\":true}");

        assertThat(malformed.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(malformed.body())
                        .get("errors")
                        .get(0)
                        .get("field")
                        .asString())
                .isEqualTo("body");
        assertThat(JSON.readTree(malformed.body())
                        .get("errors")
                        .get(0)
                        .get("code")
                        .asString())
                .isEqualTo("MALFORMED");
        assertThat(unknown.statusCode()).isEqualTo(400);
        assertThat(JSON.readTree(unknown.body())
                        .get("errors")
                        .get(0)
                        .get("code")
                        .asString())
                .isEqualTo("UNKNOWN_FIELD");
        assertThat(account.appUserExists(pia.uid())).isTrue();
    }

    @Test
    void aReceivedInvitationOfADeletedSenderCanAlsoBeDeclined() throws Exception {
        SignedIn pia = registeredUser("Pia Zavrnitev");
        SignedIn ana = registeredUser("Ana Zavrnitev");
        SignedIn cene = registeredUser("Cene Zavrne");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "ADMIN");
        UUID invitation = invitations.invite(group, id(cene), id(pia), "VIEWER");

        assertThat(deleteAccount(pia).statusCode()).isIn(204, 202);

        assertThat(post("/api/invitations/" + invitation + "/decline", cene.idToken(), null)
                        .statusCode())
                .isEqualTo(204);
        assertThat(invitations.exists(invitation)).isFalse();
    }

    @Test
    void secondDeletionWithTheSameTokenAndExportAfterDeletionAreUnauthenticated() throws Exception {
        SignedIn pia = registeredUser("Pia Dvakrat");
        String ownEmail = email(pia);

        assertThat(deleteAccount(pia, ownEmail).statusCode()).isIn(204, 202);

        assertThat(post("/api/me/deletion", pia.idToken(), "{\"email\":\"" + ownEmail + "\"}")
                        .statusCode())
                .isEqualTo(401);
        assertThat(export(pia).statusCode()).isEqualTo(401);
    }
}
