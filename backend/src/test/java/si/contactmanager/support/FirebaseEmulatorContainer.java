package si.contactmanager.support;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.ImageFromDockerfile;

/**
 * Firebase Auth Emulator prek Testcontainers (research R-05). Slika se zgradi iz {@code firebase/Dockerfile}, ki ga
 * uporablja tudi Docker Compose.
 */
public final class FirebaseEmulatorContainer extends GenericContainer<FirebaseEmulatorContainer> {

    public static final String PROJECT_ID = "demo-contact-manager";
    public static final int PORT = 9099;

    private static final Pattern ID_TOKEN = Pattern.compile("\"idToken\"\\s*:\\s*\"([^\"]+)\"");

    private final HttpClient http = HttpClient.newHttpClient();

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

    /** Ustvari uporabnika v emulatorju in vrne njegov ID žeton. */
    public String signUp(String email, String password) throws IOException, InterruptedException {
        String body = "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"returnSecureToken\":true}";
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(baseUrl() + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("signUp failed: " + response.statusCode() + " " + response.body());
        }
        Matcher matcher = ID_TOKEN.matcher(response.body());
        if (!matcher.find()) {
            throw new IllegalStateException("signUp response has no idToken");
        }
        return matcher.group(1);
    }
}
