package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import si.contactmanager.shared.security.ApiKeyPrincipal;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;

/** {@link ApiUsageFilter} (019, FR-019-20): štetje po izidu, brez štetja brez ključa in za opis, napaka štetja ne vpliva. */
@Tag("FR-019-20")
class ApiUsageFilterTest {

    private static final Instant NOW = Instant.parse("2026-11-16T10:15:00Z");

    private final ApiUsageRepository usage = mock(ApiUsageRepository.class);
    private final ApiUsageFilter filter = new ApiUsageFilter(usage, Clock.fixed(NOW, ZoneOffset.UTC));
    private final UUID keyId = UUID.randomUUID();

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void authenticate() {
        ApiKeyPrincipal principal = new ApiKeyPrincipal(1, keyId, "Ključ", Scope.allGroups(Permission.READ));
        SecurityContextHolder.getContext()
                .setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of()));
    }

    private MockHttpServletResponse run(String method, String path, int status, String body) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> {
            ((jakarta.servlet.http.HttpServletResponse) res).setStatus(status);
            res.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
            res.flushBuffer();
        });
        return response;
    }

    @Test
    void countsByOutcomeAndKeepsTheResponseIntact() throws Exception {
        authenticate();

        MockHttpServletResponse response = run("POST", "/v1/groups/x/contacts", 201, "{\"a\":1}");

        verify(usage).record(keyId, UsageOutcome.WRITE_OK, NOW);
        assertThat(response.getStatus()).isEqualTo(201);
        assertThat(response.getContentAsString()).isEqualTo("{\"a\":1}");
    }

    @Test
    void countingFailureDoesNotChangeTheResponse() throws Exception {
        authenticate();
        doThrow(new IllegalStateException("baza")).when(usage).record(any(), any(), any());

        MockHttpServletResponse response = run("GET", "/v1/groups", 200, "{\"items\":[]}");

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).isEqualTo("{\"items\":[]}");
    }

    @Test
    void withoutAValidKeyNothingIsCounted() throws Exception {
        MockHttpServletResponse response = run("GET", "/v1/groups", 401, "{\"code\":\"UNAUTHENTICATED\"}");

        verify(usage, never()).record(any(), any(), any());
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).isEqualTo("{\"code\":\"UNAUTHENTICATED\"}");
    }

    @Test
    void theDescriptionIsNotCountedEvenWithAValidKey() throws Exception {
        authenticate();

        run("GET", "/v1/openapi.json", 200, "{}");

        verify(usage, never()).record(any(), any(), any());
    }

    @Test
    void anExceptionIsCountedAsAnErrorAndRethrown() throws Exception {
        authenticate();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/v1/groups");

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
                            throw new IllegalStateException("napaka");
                        }))
                .isInstanceOf(IllegalStateException.class);

        verify(usage).record(eq(keyId), eq(UsageOutcome.ERROR), eq(NOW));
    }
}
