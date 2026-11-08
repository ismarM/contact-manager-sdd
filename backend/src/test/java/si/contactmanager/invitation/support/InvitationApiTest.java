package si.contactmanager.invitation.support;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/** Skupna osnova testov povabil: {@link GroupFixtures}, {@link InvitationFixtures} in kratki klici API-ja. */
public abstract class InvitationApiTest extends ApiTest {

    protected GroupFixtures groups;
    protected InvitationFixtures invitations;

    @BeforeEach
    void setUpFixtures() {
        groups = new GroupFixtures(jdbc);
        invitations = new InvitationFixtures(jdbc);
    }

    protected long id(SignedIn user) {
        return groups.userId(user.uid());
    }

    protected String email(SignedIn user) {
        return groups.email(user.uid());
    }

    protected static String body(String email, String role) {
        return "{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}";
    }

    /** {@code POST /api/groups/{groupId}/invitations}. */
    protected HttpResponse<String> send(UUID group, SignedIn as, String email, String role)
            throws IOException, InterruptedException {
        return post("/api/groups/" + group + "/invitations", as.idToken(), body(email, role));
    }

    /** {@code DELETE /api/groups/{groupId}/invitations/{invitationId}}. */
    protected HttpResponse<String> withdraw(Object group, SignedIn as, Object invitation)
            throws IOException, InterruptedException {
        return Http.send(
                "DELETE", url("/api/groups/" + group + "/invitations/" + invitation), Http.bearer(as.idToken()));
    }

    protected HttpResponse<String> accept(Object invitation, SignedIn as) throws IOException, InterruptedException {
        return post("/api/invitations/" + invitation + "/accept", as.idToken(), null);
    }

    protected HttpResponse<String> decline(Object invitation, SignedIn as) throws IOException, InterruptedException {
        return post("/api/invitations/" + invitation + "/decline", as.idToken(), null);
    }
}
