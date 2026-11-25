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
 * {@code docker/firebase-emulator.Dockerfile}, ki ga uporablja tudi Docker Compose.
 */
public final class FirebaseEmulatorContainer extends GenericContainer<FirebaseEmulatorContainer> {

    public static final String PROJECT_ID = "demo-contact-manager";
    public static final int PORT = 9099;
    private static final Path DOCKER_DIR =
            Path.of("..", "docker").toAbsolutePath().normalize();

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
                .withFileFromPath("Dockerfile", DOCKER_DIR.resolve("firebase-emulator.Dockerfile"))
                .withFileFromPath("firebase.json", DOCKER_DIR.resolve("firebase.json")));
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

    /** Registracija z e-naslovom in geslom (017): ID žeton ima {@code email_verified=false}. */
    public SignedIn signUpWithPassword(String email, String password) throws IOException, InterruptedException {
        JsonNode response =
                post("accounts:signUp", Map.of("email", email, "password", password, "returnSecureToken", true));
        return new SignedIn(
                response.get("idToken").asString(), response.get("localId").asString());
    }

    /**
     * Doda geslo obstoječemu računu (017, research R-03) kot aplikacija v emulatorju: {@code accounts:update} z
     * {@code idToken}, e-naslovom računa in geslom (emulator EEP ne posnema in {@code accounts:signUp} z {@code idToken}
     * zavrne z EMAIL_EXISTS; pri pravem projektu z EEP aplikacija uporabi {@code signUp}). Pravi Firebase ob dodajanju
     * gesla postavi {@code emailVerified=false} (potrjeno pri pravem projektu); emulator tega ne stori, zato ga test
     * posnema z {@link #resetEmailVerification(String)}. Vrne {@code localId}.
     */
    public String linkPassword(String idToken, String email, String password) throws IOException, InterruptedException {
        return post(
                        "accounts:update",
                        Map.of(
                                "idToken", idToken,
                                "email", email,
                                "password", password,
                                "returnSecureToken", true))
                .get("localId")
                .asString();
    }

    /** Kot pravi Firebase ob dodajanju gesla: administrator postavi {@code emailVerified=false} (samo za ta UID). */
    public void resetEmailVerification(String uid) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        baseUrl() + "/identitytoolkit.googleapis.com/v1/projects/" + PROJECT_ID + "/accounts:update"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer owner")
                .POST(HttpRequest.BodyPublishers.ofString(
                        JSON.writeValueAsString(Map.of("localId", uid, "emailVerified", false))))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("accounts:update (admin) failed: " + response.body());
        }
    }

    /** Prijava z e-naslovom in geslom; nov ID žeton odraža trenutno stanje računa (npr. potrjen e-naslov). */
    public SignedIn signInWithPassword(String email, String password) throws IOException, InterruptedException {
        JsonNode response = post(
                "accounts:signInWithPassword", Map.of("email", email, "password", password, "returnSecureToken", true));
        return new SignedIn(
                response.get("idToken").asString(), response.get("localId").asString());
    }

    /**
     * Potrdi e-naslov kot uporabnik (017): pošlje potrditveno sporočilo ({@code VERIFY_EMAIL}), prebere kodo OOB iz
     * emulatorja in jo uporabi – enako kot klik povezave v sporočilu.
     */
    public void verifyEmail(String idToken, String email) throws IOException, InterruptedException {
        send("accounts:sendOobCode", Map.of("requestType", "VERIFY_EMAIL", "idToken", idToken));
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(baseUrl() + "/emulator/v1/projects/" + PROJECT_ID + "/oobCodes"))
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        String oobCode = null;
        for (JsonNode code : JSON.readTree(response.body()).get("oobCodes")) {
            if (email.equalsIgnoreCase(code.get("email").asString())
                    && "VERIFY_EMAIL".equals(code.get("requestType").asString())) {
                oobCode = code.get("oobCode").asString();
            }
        }
        if (oobCode == null) {
            throw new IllegalStateException("no VERIFY_EMAIL oobCode for " + email);
        }
        send("accounts:update", Map.of("oobCode", oobCode));
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

    /**
     * Spremeni ime in e-naslov uporabnika (kot sprememba v Googlovem računu) in vrne nov ID žeton. Google e-naslov je
     * potrjen; emulator ob spremembi e-naslova prek {@code accounts:update} potrditev odstrani, zato jo test kot
     * administrator znova nastavi in žeton osveži (017: zaledje nepotrjen e-naslov zavrne z 403).
     */
    public String updateUser(String idToken, String displayName, String email)
            throws IOException, InterruptedException {
        Map<String, Object> body =
                Map.of("idToken", idToken, "displayName", displayName, "email", email, "returnSecureToken", true);
        JsonNode updated = post("accounts:update", body);
        HttpRequest verify = HttpRequest.newBuilder(URI.create(
                        baseUrl() + "/identitytoolkit.googleapis.com/v1/projects/" + PROJECT_ID + "/accounts:update"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer owner")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(
                        Map.of("localId", updated.get("localId").asString(), "emailVerified", true))))
                .build();
        HttpResponse<String> verified = http.send(verify, HttpResponse.BodyHandlers.ofString());
        if (verified.statusCode() != 200) {
            throw new IllegalStateException("accounts:update (admin) failed: " + verified.body());
        }
        String form = "grant_type=refresh_token&refresh_token="
                + URLEncoder.encode(updated.get("refreshToken").asString(), StandardCharsets.UTF_8);
        HttpRequest refresh = HttpRequest.newBuilder(
                        URI.create(baseUrl() + "/securetoken.googleapis.com/v1/token?key=fake-api-key"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        HttpResponse<String> refreshed = http.send(refresh, HttpResponse.BodyHandlers.ofString());
        if (refreshed.statusCode() != 200) {
            throw new IllegalStateException("token refresh failed: " + refreshed.body());
        }
        return JSON.readTree(refreshed.body()).get("id_token").asString();
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
        JsonNode json = send(method, body);
        if (!json.hasNonNull("idToken")) {
            throw new IllegalStateException(method + " response has no idToken");
        }
        return json;
    }

    /** Klic REST API identitytoolkit emulatorja; odgovor ni nujno z žetonom (npr. {@code sendOobCode}). */
    private JsonNode send(String method, Map<String, Object> body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(baseUrl() + "/identitytoolkit.googleapis.com/v1/" + method + "?key=fake-api-key"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException(method + " failed: " + response.statusCode() + " " + response.body());
        }
        return JSON.readTree(response.body());
    }
}
