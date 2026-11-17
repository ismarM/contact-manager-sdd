package si.contactmanager.shared.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.KeySourceException;
import java.net.UnknownHostException;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationServiceException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Regresija (017, ročni preizkus): backend v Dockerju ni mogel razrešiti www.googleapis.com (zastarel DNS), zato je
 * {@code PUT /api/me} po uspešni Google prijavi vrnil 500. Nedosegljivi ključi so 503, druge napake ostanejo.
 */
@Tag("FR-017-08")
class IdentityProviderUnavailableFilterTest {

    private final IdentityProviderUnavailableFilter filter =
            new IdentityProviderUnavailableFilter(JsonMapper.builder().build());

    @Test
    void unreachableKeySetIs503WithRetryAfterAndStableCode() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AuthenticationServiceException failure = new AuthenticationServiceException(
                "decode failed",
                new KeySourceException("Couldn't retrieve JWK set", new UnknownHostException("www.googleapis.com")));

        filter.doFilter(new MockHttpServletRequest("PUT", "/api/me"), response, (request, resp) -> {
            throw failure;
        });

        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getHeader("Retry-After")).isEqualTo("5");
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains("IDENTITY_PROVIDER_UNAVAILABLE");
    }

    @Test
    void otherAuthenticationServiceErrorsStayUnhandled() {
        AuthenticationServiceException failure = new AuthenticationServiceException("db down");

        assertThatThrownBy(() -> filter.doFilter(
                        new MockHttpServletRequest("GET", "/api/groups"),
                        new MockHttpServletResponse(),
                        (request, resp) -> {
                            throw failure;
                        }))
                .isSameAs(failure);
    }

    @Test
    void normalRequestPassesThrough() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest("GET", "/api/groups"), response, (request, resp) -> {});

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
