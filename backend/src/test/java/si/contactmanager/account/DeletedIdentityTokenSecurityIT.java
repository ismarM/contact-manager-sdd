package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Stari ID žeton izbrisanega uporabnika (še ~1 h veljaven po podpisu) je zavrnjen povsod (FR-012-15, FR-012-18):
 * po izbrisu (204) in med čakanjem na brisanje identitete (202), tudi z novim žetonom iste identitete.
 */
@Tag("FR-012-15")
@Tag("FR-012-18")
@Import(SwitchableAccessTokens.class)
class DeletedIdentityTokenSecurityIT extends AccountApiTest {

    @AfterEach
    void resetCredentials() {
        SwitchableAccessTokens.reset();
    }

    private record Endpoint(String method, String path, String body) {}

    private static List<Endpoint> endpoints(UUID group) {
        return List.of(
                new Endpoint("GET", "/api/groups", null),
                new Endpoint("GET", "/api/groups/archived", null),
                new Endpoint("GET", "/api/groups/" + group, null),
                new Endpoint("GET", "/api/groups/" + group + "/contacts", null),
                new Endpoint("GET", "/api/groups/" + group + "/audit", null),
                new Endpoint("GET", "/api/groups/" + group + "/members", null),
                new Endpoint("GET", "/api/invitations", null),
                new Endpoint("GET", "/api/invitations/count", null),
                new Endpoint("PUT", "/api/me", null),
                new Endpoint("PUT", "/api/me/preferences", "{\"language\":\"sl\",\"theme\":null}"),
                new Endpoint("GET", "/api/me/export", null),
                new Endpoint("GET", "/api/me/deletion-blockers", null),
                new Endpoint("POST", "/api/me/deletion", "{\"email\":\"x@primer.si\"}"));
    }

    private void assertEverythingIsUnauthenticated(String token, UUID group) throws Exception {
        for (Endpoint endpoint : endpoints(group)) {
            HttpResponse<String> response =
                    Http.send(endpoint.method(), url(endpoint.path()), Http.bearer(token), endpoint.body());
            assertThat(response.statusCode())
                    .as("%s %s", endpoint.method(), endpoint.path())
                    .isEqualTo(401);
            assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("UNAUTHENTICATED");
        }
    }

    @Test
    void oldTokenIsRejectedOnEveryEndpointAfterASuccessfulDeletionAndOtherUsersAreUnaffected() throws Exception {
        SignedIn pia = registeredUser("Pia Stari Zeton");
        SignedIn ana = registeredUser("Ana Ostane");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "EDITOR");
        assertThat(get("/api/groups", pia.idToken()).statusCode())
                .as("pred izbrisom")
                .isEqualTo(200);
        String oldToken = pia.idToken();

        assertThat(deleteAccount(pia).statusCode()).isEqualTo(204);

        assertEverythingIsUnauthenticated(oldToken, group);
        assertThat(get("/api/groups", ana.idToken()).statusCode()).isEqualTo(200);
    }

    @Test
    void tokensAreRejectedWhileTheIdentityDeletionIsStillPendingEvenWithAFreshTokenOfTheSameIdentity()
            throws Exception {
        String sub = "google-" + UUID.randomUUID();
        String email = uniqueEmail();
        SignedIn pia = emulator().signInWithGoogle(sub, email, "Pia Čaka");
        assertThat(put("/api/me", pia.idToken(), null).statusCode()).isEqualTo(201);
        SignedIn ana = registeredUser("Ana Čaka");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "VIEWER");
        int[] status = new int[1];

        // D-77: stanje čakanja z neveljavnimi poverilnicami (resnični 401 emulatorja): identiteta zanesljivo ostane.
        SwitchableAccessTokens.useInvalidCredentials();
        status[0] = post("/api/me/deletion", pia.idToken(), deletionBody(email)).statusCode();

        assertThat(status[0]).isEqualTo(202);
        assertEverythingIsUnauthenticated(pia.idToken(), group);
        SignedIn fresh = emulator().signInWithGoogle(sub, email, "Pia Čaka");
        assertThat(fresh.uid()).as("identiteta še obstaja: isti UID").isEqualTo(pia.uid());
        assertEverythingIsUnauthenticated(fresh.idToken(), group);
        assertThat(account.appUserExists(pia.uid())).isFalse();
    }
}
