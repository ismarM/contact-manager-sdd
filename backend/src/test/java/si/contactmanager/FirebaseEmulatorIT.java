package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import si.contactmanager.support.FirebaseEmulatorContainer;
import si.contactmanager.support.Http;
import si.contactmanager.support.PostgresContainer;

/**
 * Veriga za 001: emulator izda ID žeton brez pravih ključev (FR-000-04). V 000 zaledje žetonov še ne preverja, zato
 * tudi zahtevek z žetonom dobi 401 (FR-000-10, research R-04).
 */
@Tag("FR-000-04")
@Tag("FR-000-10")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FirebaseEmulatorIT {

    static final FirebaseEmulatorContainer EMULATOR = new FirebaseEmulatorContainer();

    static {
        EMULATOR.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        PostgresContainer.register(registry);
    }

    @LocalServerPort
    int port;

    @Test
    void emulatorIssuesIdTokenForDemoProject() throws Exception {
        String token = EMULATOR.signUp("ana@primer.si", "geslo-123456");

        String[] parts = token.split("\\.");
        assertThat(parts.length).isGreaterThanOrEqualTo(2);
        String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        assertThat(Http.compact(payload)).contains("\"aud\":\"" + FirebaseEmulatorContainer.PROJECT_ID + "\"");
    }

    @Test
    void apiRejectsEmulatorTokenWith401InScaffold() throws Exception {
        String token = EMULATOR.signUp("bojan@primer.si", "geslo-123456");

        HttpResponse<String> response = Http.send(
                "GET", "http://localhost:" + port + "/api/anything", Map.of("Authorization", "Bearer " + token));

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(Http.compact(response.body())).isEqualTo("{\"code\":\"UNAUTHENTICATED\"}");
    }
}
