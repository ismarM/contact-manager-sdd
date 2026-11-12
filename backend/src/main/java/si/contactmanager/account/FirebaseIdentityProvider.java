package si.contactmanager.account;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import si.contactmanager.shared.security.FirebaseProperties;
import tools.jackson.databind.json.JsonMapper;

/**
 * Brisanje identitete prek Identity Toolkit REST {@code accounts:delete} (D-73, research R-06). Emulator
 * ({@code firebase.auth-emulator-host}): {@code http://{host}/identitytoolkit.googleapis.com/…}; produkcija:
 * {@code https://identitytoolkit.googleapis.com/…}. Vedno z OAuth 2.0 žetonom iz {@link AccessTokenSource}, nikoli z ID
 * žetonom uporabnika. Dnevnik ne vsebuje UID-a, žetonov, telesa odgovora ali sporočil izjem (samo kode).
 */
final class FirebaseIdentityProvider implements IdentityProvider {

    private static final Logger LOG = LoggerFactory.getLogger(FirebaseIdentityProvider.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final HttpClient http;
    private final AccessTokenSource tokens;
    private final IdentityDeletionProperties properties;
    private final URI endpoint;

    FirebaseIdentityProvider(
            HttpClient http,
            AccessTokenSource tokens,
            IdentityDeletionProperties properties,
            FirebaseProperties firebase) {
        this.http = http;
        this.tokens = tokens;
        this.properties = properties;
        String base = firebase.emulator()
                ? "http://" + firebase.authEmulatorHost() + "/identitytoolkit.googleapis.com"
                : "https://identitytoolkit.googleapis.com";
        this.endpoint = URI.create(base + "/v1/projects/" + firebase.projectId() + "/accounts:delete");
    }

    @Override
    public Result deleteWithDetail(String uid) {
        String token;
        try {
            token = tokens.token();
        } catch (IOException | RuntimeException e) {
            LOG.error(
                    "Pridobitev OAuth žetona za brisanje identitete ni uspela ({})",
                    e.getClass().getSimpleName());
            return new Result(Outcome.MISCONFIGURED, "NO_CREDENTIALS");
        }
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(properties.requestTimeout())
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(java.util.Map.of("localId", uid))))
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            return retry("TIMEOUT");
        } catch (IOException e) {
            return retry("NETWORK");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return retry("INTERRUPTED");
        }
        int status = response.statusCode();
        if (status == 200) {
            return Result.of(Outcome.DELETED);
        }
        if (status == 400 && response.body() != null && response.body().contains("USER_NOT_FOUND")) {
            return Result.of(Outcome.NOT_FOUND);
        }
        if (status == 401 || status == 403) {
            LOG.error("Firebase je zavrnil poverilnice za brisanje identitete (HTTP {})", status);
            return new Result(Outcome.MISCONFIGURED, "HTTP_" + status);
        }
        if (status == 429) {
            return retry("HTTP_429");
        }
        return retry(status >= 500 ? "HTTP_5XX" : "HTTP_" + status);
    }

    private static Result retry(String error) {
        LOG.warn("Brisanje identitete pri ponudniku ni uspelo ({}), ponovni poskus pozneje", error);
        return new Result(Outcome.RETRY, error);
    }
}
