package si.contactmanager.support;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.ImageFromDockerfile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Firebase Auth Emulator prek Testcontainers (research R-05 v 000, R-09 v 001). Slika se zgradi iz
 * {@code firebase/Dockerfile}, ki ga uporablja tudi Docker Compose.
 */
public final class FirebaseEmulatorContainer extends GenericContainer<FirebaseEmulatorContainer> {

    public static final String PROJECT_ID = "demo-contact-manager";
    public static final int PORT = 9099;

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static FirebaseEmulatorContainer shared;

    private final HttpClient http = HttpClient.newHttpClient();

    /** En zagnan emulator za vse integracijske teste v istem procesu. */
    public static synchronized FirebaseEmulatorContainer shared() {
        if (shared == null) {
            shared = new FirebaseEmulatorContainer();
            shared.start();
        }
        return shared;
    }

    /**
     * Za {@code @DynamicPropertySource}: zaledje preverja žetone v načinu emulatorja za projekt {@link #PROJECT_ID}
     * (enako kot {@code FIREBASE_PROJECT_ID} in {@code FIREBASE_AUTH_EMULATOR_HOST} v Docker Compose).
     */
    public static void register(DynamicPropertyRegistry registry) {
        FirebaseEmulatorContainer emulator = shared();
        registry.add("firebase.project-id", () -> PROJECT_ID);
        registry.add("firebase.auth-emulator-host", () -> emulator.getHost() + ":" + emulator.getMappedPort(PORT));
    }

    /** Uporabnik emulatorja: ID žeton in Firebase UID (zahtevek {@code sub}). */
    public record SignedIn(String idToken, String uid) {}

    public FirebaseEmulatorContainer() {
        super(new ImageFromDockerfile("contact-manager-firebase-test", false)
                .withFileFromPath(
                        ".", Path.of("..", "firebase").toAbsolutePath().normalize()));
        withExposedPorts(PORT);
        waitingFor(Wait.forHttp("/").forPort(PORT).withStartupTimeout(Duration.ofSeconds(120)));
    }

    /** Osnovni URL emulatorja z gostitelja, npr. {@code http://localhost:32768}. */
    public String baseUrl() {
        return "http://" + getHost() + ":" + getMappedPort(PORT);
    }

    /** Ustvari uporabnika z e-naslovom in geslom ter vrne njegov ID žeton. */
    public String signUp(String email, String password) throws IOException, InterruptedException {
        Map<String, Object> body = Map.of("email", email, "password", password, "returnSecureToken", true);
        return post("accounts:signUp", body).get("idToken").asString();
    }

    /**
     * Prijava z Googlovim ponudnikom v emulatorju (nov Googlov račun z naključnim {@code sub}). {@code name} je lahko
     * {@code null} – račun brez imena.
     */
    public SignedIn signInWithGoogle(String email, String name) throws IOException, InterruptedException {
        return signInWithGoogle("google-" + UUID.randomUUID(), email, name);
    }

    /** Prijava z danim Googlovim računom ({@code googleSub}); ponovna prijava istega računa vrne istega uporabnika. */
    public SignedIn signInWithGoogle(String googleSub, String email, String name)
            throws IOException, InterruptedException {
        Map<String, Object> idToken = new LinkedHashMap<>();
        idToken.put("sub", googleSub);
        idToken.put("email", email);
        idToken.put("email_verified", true);
        if (name != null) {
            idToken.put("name", name);
        }
        String postBody = "id_token=" + URLEncoder.encode(JSON.writeValueAsString(idToken), StandardCharsets.UTF_8)
                + "&providerId=google.com";
        JsonNode response = post(
                "accounts:signInWithIdp",
                Map.of("postBody", postBody, "requestUri", "http://localhost", "returnSecureToken", true));
        return new SignedIn(
                response.get("idToken").asString(), response.get("localId").asString());
    }

    /** Spremeni ime in e-naslov uporabnika (kot sprememba v Googlovem računu) in vrne nov ID žeton. */
    public String updateUser(String idToken, String displayName, String email)
            throws IOException, InterruptedException {
        Map<String, Object> body =
                Map.of("idToken", idToken, "displayName", displayName, "email", email, "returnSecureToken", true);
        return post("accounts:update", body).get("idToken").asString();
    }

    /** Ustavi vsebnik emulatorja (zamrznitev procesov; omrežje ostane). Vedno v paru z {@link #unpause()}. */
    public void pause() {
        if (!isPaused()) {
            getDockerClient().pauseContainerCmd(getContainerId()).exec();
        }
    }

    public void unpause() {
        if (isPaused()) {
            getDockerClient().unpauseContainerCmd(getContainerId()).exec();
        }
    }

    public boolean isPaused() {
        return Boolean.TRUE.equals(getDockerClient()
                .inspectContainerCmd(getContainerId())
                .exec()
                .getState()
                .getPaused());
    }

    /** Izvede dejanje, medtem ko je emulator zamrznjen; vedno ga odmrzne (nikoli zamrznjen emulator po neuspelem testu). */
    public void paused(ThrowingRunnable action) throws Exception {
        pause();
        try {
            action.run();
        } finally {
            unpause();
        }
    }

    /** Dejanje, ki sme vreči izjemo. */
    @FunctionalInterface
    public interface ThrowingRunnable {
        void run() throws Exception;
    }

    /** Ali identiteta z danim UID-jem v emulatorju (še) obstaja ({@code accounts:lookup} z lastniškim žetonom). */
    public boolean identityExists(String uid) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        baseUrl() + "/identitytoolkit.googleapis.com/v1/projects/" + PROJECT_ID + "/accounts:lookup"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer owner")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(Map.of("localId", List.of(uid)))))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("accounts:lookup failed: " + response.statusCode() + " " + response.body());
        }
        JsonNode users = JSON.readTree(response.body()).get("users");
        return users != null && users.isArray() && users.size() > 0;
    }

    /** Neposredno izbriše identiteto v emulatorju kot administrator (priprava testnih stanj). */
    public void deleteIdentityAsOwner(String uid) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        baseUrl() + "/identitytoolkit.googleapis.com/v1/projects/" + PROJECT_ID + "/accounts:delete"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer owner")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(Map.of("localId", uid))))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200 && !response.body().contains("USER_NOT_FOUND")) {
            throw new IllegalStateException("accounts:delete failed: " + response.statusCode() + " " + response.body());
        }
    }

    private JsonNode post(String method, Map<String, Object> body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(baseUrl() + "/identitytoolkit.googleapis.com/v1/" + method + "?key=fake-api-key"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException(method + " failed: " + response.statusCode() + " " + response.body());
        }
        JsonNode json = JSON.readTree(response.body());
        if (!json.hasNonNull("idToken")) {
            throw new IllegalStateException(method + " response has no idToken");
        }
        return json;
    }
}
