package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import si.contactmanager.support.Http;
import si.contactmanager.support.PostgresContainer;

/**
 * Privzeta zavrnitev (FR-000-10): vsaka pot /api razen /api/health brez veljavnega žetona vrne 401 UNAUTHENTICATED
 * (feature-map.md §2.2, vrstica 1). Logi brez žetonov in osebnih podatkov, z ID-jem zahtevka (FR-000-20).
 */
@Tag("FR-000-10")
@Tag("FR-000-20")
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DefaultDenySecurityIT {

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        PostgresContainer.register(registry);
    }

    @LocalServerPort
    int port;

    static Stream<Arguments> deniedRequests() {
        List<String> methods = List.of("GET", "POST", "PUT", "PATCH", "DELETE");
        List<String> paths = List.of("/api/anything", "/api/groups/1", "/api/groups/1/contacts");
        List<String> authorizations = Arrays.asList(null, "Bearer not-a-valid-token");
        return methods.stream()
                .flatMap(method -> paths.stream()
                        .flatMap(path -> authorizations.stream().map(auth -> Arguments.of(method, path, auth))));
    }

    @ParameterizedTest(name = "{0} {1} (Authorization: {2}) → 401")
    @MethodSource("deniedRequests")
    void everyApiPathExceptHealthIsDeniedWith401(String method, String path, String authorization) throws Exception {
        Map<String, String> headers = authorization == null ? Map.of() : Map.of("Authorization", authorization);

        HttpResponse<String> response = Http.send(method, "http://localhost:" + port + path, headers);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(Http.compact(response.body())).isEqualTo("{\"code\":\"UNAUTHENTICATED\"}");
        assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
    }

    @Test
    void healthIsPublic() throws Exception {
        HttpResponse<String> response = Http.get("http://localhost:" + port + "/api/health");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
    }

    @Test
    void logsCarryRequestIdAndNeverTokensOrQueryStrings(CapturedOutput output) throws Exception {
        String secret = "secret-token-" + UUID.randomUUID();

        HttpResponse<String> response = Http.send(
                "GET",
                "http://localhost:" + port + "/api/anything?email=ime@primer.si",
                Map.of("Authorization", "Bearer " + secret));

        String requestId = response.headers().firstValue("X-Request-Id").orElse(null);
        assertThat(requestId).as("X-Request-Id").isNotNull();
        String log = output.getAll();
        assertThat(log).doesNotContain(secret);
        assertThat(log).doesNotContain("ime@primer.si");
        List<String> requestLines =
                log.lines().filter(line -> line.contains("/api/anything")).toList();
        assertThat(requestLines).isNotEmpty();
        assertThat(requestLines).allSatisfy(line -> assertThat(line).contains(requestId));
    }
}
