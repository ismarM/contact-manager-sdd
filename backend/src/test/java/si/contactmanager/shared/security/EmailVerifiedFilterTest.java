package si.contactmanager.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import tools.jackson.databind.json.JsonMapper;

@Tag("FR-017-02")
class EmailVerifiedFilterTest {

    private final EmailVerifiedFilter filter =
            new EmailVerifiedFilter(JsonMapper.builder().build());

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void verifiedTokenPasses() throws Exception {
        authenticate(Map.of("email_verified", true));

        Result result = run("PUT", "/api/me");

        assertThat(result.passed).isTrue();
        assertThat(result.response.getStatus()).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"false", "missing", "string-true", "number-1"})
    void unverifiedTokenIsRejectedWith403AndChainIsNotCalled(String variant) throws Exception {
        Map<String, Object> claims = new HashMap<>();
        switch (variant) {
            case "false" -> claims.put("email_verified", false);
            case "string-true" -> claims.put("email_verified", "true");
            case "number-1" -> claims.put("email_verified", 1);
            default -> {}
        }
        authenticate(claims);

        Result result = run("GET", "/api/groups");

        assertThat(result.passed).isFalse();
        assertThat(result.response.getStatus()).isEqualTo(403);
        assertThat(result.response.getContentType()).startsWith("application/json");
        assertThat(result.response.getContentAsString()).isEqualTo("{\"code\":\"EMAIL_NOT_VERIFIED\"}");
    }

    @Test
    void healthIsExemptForUnverifiedToken() throws Exception {
        authenticate(Map.of("email_verified", false));

        assertThat(run("GET", "/api/health").passed).isTrue();
        assertThat(run("POST", "/api/health").passed).isFalse();
        assertThat(run("GET", "/api/health/x").passed).isFalse();
    }

    @Test
    void withoutJwtAuthenticationTheFilterDoesNothing() throws Exception {
        // Brez prijave (401 določi avtorizacija) in drugačna prijava (npr. geslo za aplikacijo) – filter ne posega.
        assertThat(run("GET", "/api/groups").passed).isTrue();
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken("app-password", null, List.of()));
        assertThat(run("GET", "/api/groups").passed).isTrue();
    }

    private static void authenticate(Map<String, Object> extraClaims) {
        Jwt.Builder builder = Jwt.withTokenValue("t")
                .header("alg", "none")
                .subject("uid-1")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(600))
                .claim("email", "ana@primer.si");
        extraClaims.forEach(builder::claim);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(builder.build()));
    }

    private Result run(String method, String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean passed = new AtomicBoolean();
        filter.doFilter(request, response, (req, res) -> passed.set(true));
        return new Result(passed.get(), response);
    }

    private record Result(boolean passed, MockHttpServletResponse response) {}
}
