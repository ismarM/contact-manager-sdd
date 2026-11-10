package si.contactmanager.member.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.invitation.support.InvitationFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import tools.jackson.core.type.TypeReference;

/** Skupna osnova testov članov: fixtures in kratki klici petih endpointov 007 (plan.md – Public Interfaces). */
public abstract class MemberApiTest extends ApiTest {

    protected GroupFixtures groups;
    protected InvitationFixtures invitations;
    protected MemberFixtures members;

    @BeforeEach
    void setUpMemberFixtures() {
        groups = new GroupFixtures(jdbc);
        invitations = new InvitationFixtures(jdbc);
        members = new MemberFixtures(jdbc);
    }

    protected long id(SignedIn user) {
        return groups.userId(user.uid());
    }

    protected String email(SignedIn user) {
        return groups.email(user.uid());
    }

    /** Doda uporabnika v skupino z vlogo in vrne njegov {@code memberId}. */
    protected UUID join(UUID group, SignedIn user, String role) {
        groups.addMember(group, id(user), role);
        return members.memberId(group, id(user));
    }

    /** Elementi {@code items} iz odgovora seznama članov. */
    protected static List<Map<String, Object>> items(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("seznam članov").isEqualTo(200);
        return JSON.convertValue(json(response.body()).get("items"), new TypeReference<>() {});
    }

    /** Vrstica člana (po e-naslovu) iz odgovora seznama. */
    protected static Map<String, Object> row(HttpResponse<String> response, String email) {
        return items(response).stream()
                .filter(item -> email.equals(item.get("email")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("ni člana " + email));
    }

    /** Kontakt kot dani član ({@code POST /api/groups/{groupId}/contacts}); vrne status. */
    protected int createContact(Object group, SignedIn as, String firstName) throws IOException, InterruptedException {
        return post("/api/groups/" + group + "/contacts", as.idToken(), "{\"firstName\":\"" + firstName + "\"}")
                .statusCode();
    }

    /** Imena izvajalcev iz revizijske sledi skupine ({@code GET …/audit}). */
    protected List<String> auditActorNames(Object group, SignedIn as) throws IOException, InterruptedException {
        HttpResponse<String> response = get("/api/groups/" + group + "/audit", as.idToken());
        List<Map<String, Object>> entries =
                JSON.convertValue(json(response.body()).get("items"), new TypeReference<>() {});
        return entries.stream()
                .map(entry -> {
                    Map<String, Object> actor = JSON.convertValue(entry.get("actor"), new TypeReference<>() {});
                    return actor == null ? null : (String) actor.get("name");
                })
                .toList();
    }

    protected static String roleBody(String role, long version) {
        return "{\"role\":\"" + role + "\",\"version\":" + version + "}";
    }

    protected HttpResponse<String> list(Object group, SignedIn as, String query)
            throws IOException, InterruptedException {
        return get("/api/groups/" + group + "/members" + query, as == null ? null : as.idToken());
    }

    protected HttpResponse<String> list(Object group, SignedIn as) throws IOException, InterruptedException {
        return list(group, as, "");
    }

    /** {@code PUT /api/groups/{groupId}/members/{memberId}}. */
    protected HttpResponse<String> changeRole(Object group, SignedIn as, Object member, String body)
            throws IOException, InterruptedException {
        return put("/api/groups/" + group + "/members/" + member, as == null ? null : as.idToken(), body);
    }

    /** {@code DELETE /api/groups/{groupId}/members/{memberId}}. */
    protected HttpResponse<String> remove(Object group, SignedIn as, Object member)
            throws IOException, InterruptedException {
        return Http.send(
                "DELETE",
                url("/api/groups/" + group + "/members/" + member),
                as == null ? java.util.Map.of() : Http.bearer(as.idToken()));
    }

    /** {@code POST /api/groups/{groupId}/leave}. */
    protected HttpResponse<String> leave(Object group, SignedIn as) throws IOException, InterruptedException {
        return post("/api/groups/" + group + "/leave", as == null ? null : as.idToken(), null);
    }

    /** {@code POST /api/groups/{groupId}/ownership-transfer}. */
    protected HttpResponse<String> transfer(Object group, SignedIn as, String body)
            throws IOException, InterruptedException {
        return post("/api/groups/" + group + "/ownership-transfer", as == null ? null : as.idToken(), body);
    }

    protected static String transferBody(Object memberId) {
        return "{\"memberId\":\"" + memberId + "\"}";
    }
}
