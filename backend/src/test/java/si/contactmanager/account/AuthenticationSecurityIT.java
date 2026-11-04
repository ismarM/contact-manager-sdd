package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Varnostni test endpointov profila (FR-001-07, FR-001-08, FR-001-19; spec – Negative Scenarios): vsak endpoint × vsaka
 * vrsta neveljavne prijave → 401 UNAUTHENTICATED, profil se ne ustvari in ne spremeni. Endpointa nista vezana na
 * skupino, zato matrika izolacije skupin zanju nima vrstic (plan.md – Constitution Check III).
 */
@Tag("FR-001-07")
@Tag("FR-001-08")
@Tag("FR-001-19")
class AuthenticationSecurityIT extends ApiTest {

    /** Vrsta neveljavne prijave: iz veljavnega žetona emulatorja naredi glave zahtevka. */
    enum InvalidAuth {
        NO_TOKEN(token -> Map.of()),
        MALFORMED(token -> Map.of("Authorization", "Bearer not-a-jwt")),
        NOT_BEARER(token -> Map.of("Authorization", "Basic " + token)),
        FORGED_SIGNATURE(token -> Http.bearer(Tokens.withForgedSignature(token))),
        OTHER_PROJECT(token -> Http.bearer(Tokens.withClaims(token, claims -> {
            claims.put("aud", "drug-projekt");
            claims.put("iss", "https://securetoken.google.com/drug-projekt");
        }))),
        OTHER_AUDIENCE_ONLY(
                token -> Http.bearer(Tokens.withClaims(token, claims -> claims.put("aud", "drug-projekt")))),
        EXPIRED(token -> Http.bearer(Tokens.withClaims(token, claims -> {
            claims.put("iat", Tokens.epochSeconds(-7200));
            claims.put("auth_time", Tokens.epochSeconds(-7200));
            claims.put("exp", Tokens.epochSeconds(-3600));
        }))),
        WITHOUT_EMAIL(token -> Http.bearer(Tokens.withClaims(token, claims -> claims.remove("email"))));

        final Function<String, Map<String, String>> headers;

        InvalidAuth(Function<String, Map<String, String>> headers) {
            this.headers = headers;
        }
    }

    record Endpoint(String path, String body) {
        @Override
        public String toString() {
            return "PUT " + path;
        }
    }

    static final List<Endpoint> ENDPOINTS = List.of(
            new Endpoint("/api/me", "{\"language\":\"en\",\"theme\":\"dark\"}"),
            new Endpoint("/api/me/preferences", "{\"language\":\"en\",\"theme\":\"dark\"}"));

    static Stream<Arguments> invalidRequests() {
        return ENDPOINTS.stream()
                .flatMap(endpoint -> Stream.of(InvalidAuth.values()).map(auth -> Arguments.of(endpoint, auth)));
    }

    @ParameterizedTest(name = "{0} z {1} → 401, nič se ne spremeni")
    @MethodSource("invalidRequests")
    void invalidAuthenticationIsRejectedWithoutChanges(Endpoint endpoint, InvalidAuth auth) throws Exception {
        SignedIn existing = newGoogleUser("Obstoječa Uporabnica");
        HttpResponse<String> sync = put("/api/me", existing.idToken(), null);
        assertThat(sync.statusCode()).as("veljaven žeton je sprejet").isIn(200, 201);
        List<Map<String, Object>> before = profileRows(existing.uid());
        SignedIn fresh = newGoogleUser("Nova Uporabnica");
        int countBefore = profileCount();

        HttpResponse<String> onExisting =
                Http.send("PUT", url(endpoint.path()), auth.headers.apply(existing.idToken()), endpoint.body());
        HttpResponse<String> onFresh =
                Http.send("PUT", url(endpoint.path()), auth.headers.apply(fresh.idToken()), endpoint.body());

        for (HttpResponse<String> response : List.of(onExisting, onFresh)) {
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(Http.compact(response.body())).isEqualTo("{\"code\":\"UNAUTHENTICATED\"}");
            assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
        }
        assertThat(profileRows(existing.uid()))
                .as("obstoječi profil ni spremenjen")
                .isEqualTo(before);
        assertThat(profileRows(fresh.uid())).as("profil se ne ustvari").isEmpty();
        assertThat(profileCount()).isEqualTo(countBefore);
    }

    @Test
    void validEmulatorTokenIsAcceptedOnEveryEndpoint() throws Exception {
        SignedIn user = newGoogleUser("Ana Novak");

        for (Endpoint endpoint : ENDPOINTS) {
            HttpResponse<String> response = put(endpoint.path(), user.idToken(), endpoint.body());
            assertThat(response.statusCode()).as(endpoint.toString()).isBetween(200, 299);
        }
    }

    @Test
    void healthStaysPublic() throws Exception {
        HttpResponse<String> response = Http.get(url("/api/health"));

        assertThat(response.statusCode()).isEqualTo(200);
    }
}
