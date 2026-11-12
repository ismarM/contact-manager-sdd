package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/**
 * Izvoz mojih podatkov (FR-012-01 … FR-012-03; SC-001, SC-002): popolnost, struktura po contracts/openapi.yaml,
 * glave, izpustitev tujih podatkov (kanarčki) in prazni seznami.
 */
@Tag("FR-012-01")
@Tag("FR-012-02")
@Tag("FR-012-03")
class MyDataExportIT extends AccountApiTest {

    private static final String CANARY_CONTACT = "KanarcekKontaktXq7";
    private static final String CANARY_MEMBER = "KanarcekClanZw3";

    private JsonNode tree(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("GET /api/me/export").isEqualTo(200);
        return JSON.readTree(response.body());
    }

    @Test
    void exportContainsAllOwnDataWithCodesAndWithoutForeignData() throws Exception {
        SignedIn pia = registeredUser("Pia Kos");
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn cene = registeredUser("Cene Kralj");
        SignedIn clan = registeredUser(CANARY_MEMBER);
        SignedIn gone = registeredUser("Dolgo Izbrisan");
        String goneEmail = email(gone);
        assertThat(put("/api/me/preferences", pia.idToken(), "{\"language\":\"en\",\"theme\":\"dark\"}")
                        .statusCode())
                .isEqualTo(200);

        UUID feri = activeGroup(pia, "Projekt FERI");
        jdbc.update("update contact_group set description = 'Skupni stiki', color = 'morje' where id = ?", feri);
        groups.addMember(feri, id(clan), "EDITOR");
        UUID archivedWithOwner = archivedGroup(ana, "Arhiv 2025");
        groups.addMember(archivedWithOwner, id(pia), "EDITOR");
        UUID permanent = activeGroup(ana, "Stara skupina");
        groups.addMember(permanent, id(pia), "VIEWER");
        groups.makePermanentlyArchived(permanent);
        UUID club = activeGroup(ana, "Klub");
        UUID society = activeGroup(gone, "Društvo");
        UUID receivedFromAna = invitations.invite(club, id(pia), id(ana), "EDITOR");
        UUID receivedFromGone = invitations.invite(society, id(pia), id(gone), "VIEWER");
        invitations.deleteUser(id(gone));
        UUID sentFeri = invitations.invite(feri, id(cene), id(pia), "VIEWER");
        UUID formerAdmin = activeGroup(ana, "Drugi");
        groups.addMember(formerAdmin, id(pia), "ADMIN");
        UUID sentDrugi = invitations.invite(formerAdmin, id(cene), id(pia), "EDITOR");
        invitations.removeMember(formerAdmin, id(pia));
        contacts.insert(feri, id(pia), CANARY_CONTACT, "Kontaktovic");
        audit.insertEntries(feri, id(pia), 3);

        LocalDate before = LocalDate.now(ZoneOffset.UTC);
        HttpResponse<String> response = export(pia);
        LocalDate after = LocalDate.now(ZoneOffset.UTC);
        JsonNode data = tree(response);

        String disposition =
                response.headers().firstValue("Content-Disposition").orElseThrow();
        assertThat(disposition).matches("attachment; filename=\"moji-podatki-\\d{4}-\\d{2}-\\d{2}\\.json\"");
        assertThat(disposition)
                .satisfiesAnyOf(
                        value -> assertThat(value).contains("moji-podatki-" + before + ".json"),
                        value -> assertThat(value).contains("moji-podatki-" + after + ".json"));
        assertThat(response.headers().firstValue("Cache-Control"))
                .hasValueSatisfying(value -> assertThat(value).contains("no-store"));
        assertThat(response.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
        assertThat(response.headers().firstValue("Content-Type"))
                .hasValueSatisfying(value -> assertThat(value).startsWith("application/json"));

        assertThat(data.get("formatVersion").asInt()).isEqualTo(1);
        Instant exportedAt = Instant.parse(data.get("exportedAt").asString());
        assertThat(exportedAt)
                .isBetween(Instant.now().minusSeconds(30), Instant.now().plusSeconds(1));
        JsonNode profile = data.get("profile");
        assertThat(fieldNames(profile)).containsExactlyInAnyOrder("name", "email", "registeredAt", "language", "theme");
        assertThat(profile.get("name").asString()).isEqualTo("Pia Kos");
        assertThat(profile.get("email").asString()).isEqualTo(email(pia));
        assertThat(instant(profile.get("registeredAt")))
                .isEqualTo(dbInstant("select created_at from app_user where firebase_uid = ?", pia.uid()));
        assertThat(profile.get("language").asString()).isEqualTo("en");
        assertThat(profile.get("theme").asString()).isEqualTo("dark");

        JsonNode memberships = data.get("memberships");
        assertThat(memberships).hasSize(3);
        for (JsonNode item : memberships) {
            assertThat(fieldNames(item)).containsExactlyInAnyOrder("groupTitle", "role", "joinedAt", "state");
        }
        assertThat(membership(memberships, "Projekt FERI")).containsExactly("OWNER", "ACTIVE");
        assertThat(membership(memberships, "Arhiv 2025")).containsExactly("EDITOR", "ARCHIVED");
        assertThat(membership(memberships, "Stara skupina")).containsExactly("VIEWER", "PERMANENTLY_ARCHIVED");
        assertThat(instant(byField(memberships, "groupTitle", "Projekt FERI").get("joinedAt")))
                .isEqualTo(dbInstant(
                        "select created_at from group_member where group_id = ? and user_id = ?", feri, id(pia)));
        assertThat(instant(byField(memberships, "groupTitle", "Arhiv 2025").get("joinedAt")))
                .isEqualTo(dbInstant(
                        "select created_at from group_member where group_id = ? and user_id = ?",
                        archivedWithOwner,
                        id(pia)));

        JsonNode received = data.get("receivedInvitations");
        assertThat(received).hasSize(2);
        for (JsonNode item : received) {
            assertThat(fieldNames(item)).containsExactlyInAnyOrder("groupTitle", "offeredRole", "sender", "createdAt");
        }
        JsonNode fromAna = byField(received, "groupTitle", "Klub");
        assertThat(fromAna.get("offeredRole").asString()).isEqualTo("EDITOR");
        assertThat(fromAna.get("sender").get("name").asString()).isEqualTo("Ana Novak");
        assertThat(fromAna.get("sender").get("deleted").asBoolean()).isFalse();
        assertThat(fieldNames(fromAna.get("sender"))).containsExactlyInAnyOrder("name", "deleted");
        assertThat(instant(fromAna.get("createdAt")))
                .isEqualTo(dbInstant("select created_at from invitation where id = ?", receivedFromAna));
        JsonNode fromGone = byField(received, "groupTitle", "Društvo");
        assertThat(fromGone.get("offeredRole").asString()).isEqualTo("VIEWER");
        assertThat(fromGone.get("sender").get("name").asString()).isEqualTo("izbrisan uporabnik");
        assertThat(fromGone.get("sender").get("deleted").asBoolean()).isTrue();
        assertThat(instant(fromGone.get("createdAt")))
                .isEqualTo(dbInstant("select created_at from invitation where id = ?", receivedFromGone));

        JsonNode sent = data.get("sentInvitations");
        assertThat(sent).hasSize(2);
        for (JsonNode item : sent) {
            assertThat(fieldNames(item))
                    .containsExactlyInAnyOrder("groupTitle", "offeredRole", "inviteeEmail", "createdAt");
        }
        JsonNode sentFeriItem = byField(sent, "groupTitle", "Projekt FERI");
        assertThat(sentFeriItem.get("inviteeEmail").asString()).isEqualTo(email(cene));
        assertThat(sentFeriItem.get("offeredRole").asString()).isEqualTo("VIEWER");
        assertThat(instant(sentFeriItem.get("createdAt")))
                .isEqualTo(dbInstant("select created_at from invitation where id = ?", sentFeri));
        JsonNode sentDrugiItem = byField(sent, "groupTitle", "Drugi");
        assertThat(sentDrugiItem.get("offeredRole").asString()).isEqualTo("EDITOR");
        assertThat(instant(sentDrugiItem.get("createdAt")))
                .isEqualTo(dbInstant("select created_at from invitation where id = ?", sentDrugi));

        JsonNode owned = data.get("ownedGroups");
        assertThat(owned).hasSize(1);
        assertThat(fieldNames(owned.get(0)))
                .containsExactlyInAnyOrder("title", "description", "color", "state", "createdAt");
        assertThat(owned.get(0).get("title").asString()).isEqualTo("Projekt FERI");
        assertThat(owned.get(0).get("description").asString()).isEqualTo("Skupni stiki");
        assertThat(owned.get(0).get("color").asString()).isEqualTo("morje");
        assertThat(owned.get(0).get("state").asString()).isEqualTo("ACTIVE");
        assertThat(instant(owned.get(0).get("createdAt")))
                .isEqualTo(dbInstant("select created_at from contact_group where id = ?", feri));

        // FR-012-03 (CR-04): kanarčki in tuji podatki niso v izvozu; izjemi sta samo ime pošiljatelja in e-naslov
        // povabljenega.
        String body = response.body();
        assertThat(body)
                .doesNotContain(CANARY_CONTACT)
                .doesNotContain(CANARY_MEMBER)
                .doesNotContain(email(clan))
                .doesNotContain(email(ana))
                .doesNotContain(goneEmail)
                .doesNotContain("Dolgo Izbrisan")
                .doesNotContain("Cene Kralj");
        assertThat(fieldNames(data))
                .containsExactlyInAnyOrder(
                        "formatVersion",
                        "exportedAt",
                        "profile",
                        "memberships",
                        "receivedInvitations",
                        "sentInvitations",
                        "ownedGroups");
        assertThat(body).doesNotContain("\"id\"").doesNotContain("memberId").doesNotContain("firebase");
    }

    @Test
    void newUserGetsProfileAndFourEmptyLists() throws Exception {
        SignedIn nova = registeredUser("Nova Uporabnica");

        JsonNode data = tree(export(nova));

        assertThat(data.get("profile").get("email").asString()).isEqualTo(email(nova));
        assertThat(data.get("profile").get("language").isNull()).isTrue();
        assertThat(data.get("profile").get("theme").isNull()).isTrue();
        for (String list : new String[] {"memberships", "receivedInvitations", "sentInvitations", "ownedGroups"}) {
            assertThat(data.get(list).isArray()).as(list).isTrue();
            assertThat(data.get(list)).as(list).isEmpty();
        }
    }

    @Test
    void exportOfOneHundredMembershipsAndFiftyInvitationsTakesAtMostFiveSeconds() throws Exception {
        SignedIn pia = registeredUser("Pia Mnogo");
        SignedIn ana = registeredUser("Ana Mnogo");
        for (int i = 0; i < 100; i++) {
            UUID group = activeGroup(ana, "Skupina " + i);
            groups.addMember(group, id(pia), "VIEWER");
        }
        for (int i = 0; i < 50; i++) {
            UUID group = activeGroup(ana, "Vabilo " + i);
            invitations.invite(
                    group, id(pia), id(ana), "VIEWER", OffsetDateTime.now().minusMinutes(i));
        }

        long started = System.nanoTime();
        JsonNode data = tree(export(pia));
        long millis = (System.nanoTime() - started) / 1_000_000;

        assertThat(data.get("memberships")).hasSize(100);
        assertThat(data.get("receivedInvitations")).hasSize(50);
        assertThat(millis).as("SC-001: čas izvoza").isLessThanOrEqualTo(5000);
    }

    private static Instant instant(JsonNode value) {
        return Instant.parse(value.asString()).truncatedTo(ChronoUnit.MILLIS);
    }

    private Instant dbInstant(String sql, Object... params) {
        OffsetDateTime value = jdbc.queryForObject(sql, OffsetDateTime.class, params);
        return value.toInstant().truncatedTo(ChronoUnit.MILLIS);
    }

    private static java.util.List<String> membership(JsonNode memberships, String title) {
        JsonNode item = byField(memberships, "groupTitle", title);
        return java.util.List.of(item.get("role").asString(), item.get("state").asString());
    }

    private static JsonNode byField(JsonNode array, String field, String value) {
        for (JsonNode item : array) {
            if (value.equals(item.get(field).asString())) {
                return item;
            }
        }
        throw new AssertionError("ni vnosa " + field + "=" + value);
    }

    private static java.util.List<String> fieldNames(JsonNode node) {
        java.util.List<String> names = new java.util.ArrayList<>();
        node.propertyNames().forEach(names::add);
        return names;
    }
}
