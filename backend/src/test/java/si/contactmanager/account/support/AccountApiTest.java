package si.contactmanager.account.support;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import si.contactmanager.audit.support.AuditFixtures;
import si.contactmanager.contact.support.ContactFixtures;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.invitation.support.InvitationFixtures;
import si.contactmanager.member.support.MemberFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/** Skupna osnova testov funkcionalnosti 012: fixtures in kratki klici treh endpointov (plan.md – Public Interfaces). */
public abstract class AccountApiTest extends ApiTest {

    protected GroupFixtures groups;
    protected InvitationFixtures invitations;
    protected MemberFixtures members;
    protected ContactFixtures contacts;
    protected AuditFixtures audit;
    protected AccountFixtures account;

    @BeforeEach
    void setUpAccountFixtures() {
        groups = new GroupFixtures(jdbc);
        invitations = new InvitationFixtures(jdbc);
        members = new MemberFixtures(jdbc);
        contacts = new ContactFixtures(jdbc);
        audit = new AuditFixtures(jdbc);
        account = new AccountFixtures(jdbc);
    }

    /** Noben test ne sme pustiti zamrznjenega emulatorja (R-13). */
    @AfterEach
    void emulatorRunning() {
        emulator().unpause();
    }

    protected long id(SignedIn user) {
        return groups.userId(user.uid());
    }

    protected String email(SignedIn user) {
        return groups.email(user.uid());
    }

    /** Nearhivirana skupina z lastnikom. */
    protected UUID activeGroup(SignedIn owner, String title) {
        return groups.createGroup(id(owner), title);
    }

    /** Arhivirana skupina z lastnikom. */
    protected UUID archivedGroup(SignedIn owner, String title) {
        UUID group = groups.createGroup(id(owner), title);
        groups.archive(group);
        return group;
    }

    protected static String deletionBody(String email) {
        return "{\"email\":\"" + email + "\"}";
    }

    /** {@code POST /api/me/deletion} s pravilnim e-naslovom uporabnika. */
    protected HttpResponse<String> deleteAccount(SignedIn user) throws IOException, InterruptedException {
        return post("/api/me/deletion", user.idToken(), deletionBody(email(user)));
    }

    protected HttpResponse<String> deleteAccount(SignedIn user, String typedEmail)
            throws IOException, InterruptedException {
        return post("/api/me/deletion", user.idToken(), deletionBody(typedEmail));
    }

    protected HttpResponse<String> export(SignedIn user) throws IOException, InterruptedException {
        return get("/api/me/export", user.idToken());
    }

    /** Kontakt kot dani član ({@code POST /api/groups/{groupId}/contacts}); vrne status. */
    protected int createContact(Object group, SignedIn as, String firstName) throws IOException, InterruptedException {
        return post("/api/groups/" + group + "/contacts", as.idToken(), "{\"firstName\":\"" + firstName + "\"}")
                .statusCode();
    }

    /** Imena izvajalcev iz revizijske sledi skupine ({@code GET …/audit}); {@code null} = izbrisan uporabnik. */
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

    protected static boolean isSuccess(HttpResponse<String> response) {
        return response.statusCode() == 204 || response.statusCode() == 202;
    }
}
