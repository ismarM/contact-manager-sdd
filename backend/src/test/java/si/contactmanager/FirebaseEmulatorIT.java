package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer;
import si.contactmanager.support.Http;

/**
 * Veriga emulatorja (FR-000-04): emulator izda ID žeton brez pravih ključev. Od 001 zaledje veljaven žeton sprejme
 * (FR-001-07); prej je ta test preverjal začasno vedenje 000 (vedno 401) – sprememba v DECISIONS.md (D-22).
 */
@Tag("FR-000-04")
@Tag("FR-001-07")
class FirebaseEmulatorIT extends ApiTest {

    @Test
    void emulatorIssuesIdTokenForDemoProject() throws Exception {
        String token = emulator().signUp(uniqueEmail(), "geslo-123456");

        String[] parts = token.split("\\.");
        assertThat(parts.length).isGreaterThanOrEqualTo(2);
        String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        assertThat(Http.compact(payload)).contains("\"aud\":\"" + FirebaseEmulatorContainer.PROJECT_ID + "\"");
    }

    @Test
    void apiAcceptsEmulatorTokenFromGoogleSignIn() throws Exception {
        String token = newGoogleUser("Bojan Kos").idToken();

        HttpResponse<String> response = put("/api/me", token, null);

        assertThat(response.statusCode()).isIn(200, 201);
    }

    @Test
    void unknownApiPathWithValidTokenIsNotFound() throws Exception {
        String token = newGoogleUser("Bojan Kos").idToken();

        HttpResponse<String> response = Http.send("GET", url("/api/anything"), Http.bearer(token));

        assertThat(response.statusCode()).isEqualTo(404);
    }
}
