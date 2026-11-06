package si.contactmanager.support;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Osnova integracijskih in varnostnih testov API-ja 001: zaledje na naključnih vratih, PostgreSQL (Testcontainers) in
 * Firebase Auth Emulator; zaledje preverja žetone v načinu emulatorja.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class ApiTest {

    protected static final JsonMapper JSON = JsonMapper.builder().build();

    @DynamicPropertySource
    static void infrastructure(DynamicPropertyRegistry registry) {
        PostgresContainer.register(registry);
        FirebaseEmulatorContainer.register(registry);
    }

    @LocalServerPort
    protected int port;

    @Autowired
    protected JdbcTemplate jdbc;

    protected static FirebaseEmulatorContainer emulator() {
        return FirebaseEmulatorContainer.shared();
    }

    /** Nov Googlov račun z edinstvenim e-naslovom (baza je skupna vsem testom). */
    protected static SignedIn newGoogleUser(String name) throws IOException, InterruptedException {
        return emulator().signInWithGoogle(uniqueEmail(), name);
    }

    protected static String uniqueEmail() {
        return "u-" + UUID.randomUUID() + "@primer.si";
    }

    protected HttpResponse<String> put(String path, String token, String jsonBody)
            throws IOException, InterruptedException {
        Map<String, String> headers = token == null ? Map.of() : Http.bearer(token);
        return Http.send("PUT", url(path), headers, jsonBody);
    }

    protected HttpResponse<String> get(String path, String token) throws IOException, InterruptedException {
        Map<String, String> headers = token == null ? Map.of() : Http.bearer(token);
        return Http.send("GET", url(path), headers);
    }

    protected HttpResponse<String> post(String path, String token, String jsonBody)
            throws IOException, InterruptedException {
        Map<String, String> headers = token == null ? Map.of() : Http.bearer(token);
        return Http.send("POST", url(path), headers, jsonBody);
    }

    /** Nov Googlov račun, ki se je že prijavil v aplikacijo ({@code PUT /api/me} – profil obstaja). */
    protected SignedIn registeredUser(String name) throws IOException, InterruptedException {
        SignedIn user = newGoogleUser(name);
        int status = put("/api/me", user.idToken(), null).statusCode();
        if (status != 201) {
            throw new IllegalStateException("PUT /api/me vrnil " + status);
        }
        return user;
    }

    protected String url(String path) {
        return "http://localhost:" + port + path;
    }

    protected static Map<String, Object> json(String body) {
        return JSON.readValue(body, new TypeReference<Map<String, Object>>() {});
    }

    /** Vrstice profila za dani Firebase UID (name, email, language, theme, updated_at). */
    protected List<Map<String, Object>> profileRows(String uid) {
        return jdbc.queryForList(
                "select name, email, language, theme, updated_at from app_user where firebase_uid = ?", uid);
    }

    protected int profileCount() {
        Integer count = jdbc.queryForObject("select count(*) from app_user", Integer.class);
        return count == null ? 0 : count;
    }
}
