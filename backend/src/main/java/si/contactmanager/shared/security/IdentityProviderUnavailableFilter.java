package si.contactmanager.shared.security;

import com.nimbusds.jose.KeySourceException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.web.filter.OncePerRequestFilter;
import si.contactmanager.shared.error.ErrorResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * Ključev Googla za preverjanje podpisa žetona ni mogoče dobiti (omrežje, DNS, izpad): to ni napaka uporabnika ali
 * kode, zato odgovor ni {@code 500}, ampak {@code 503 IDENTITY_PROVIDER_UNAVAILABLE} z {@code Retry-After}. Teče pred
 * {@code BearerTokenAuthenticationFilter}, ki izjemo sicer vrže naprej. Neveljaven žeton ostane 401 (ta filter ga ne
 * vidi).
 */
public final class IdentityProviderUnavailableFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(IdentityProviderUnavailableFilter.class);
    private static final ErrorResponse UNAVAILABLE = new ErrorResponse("IDENTITY_PROVIDER_UNAVAILABLE");

    private final JsonMapper json;

    public IdentityProviderUnavailableFilter(JsonMapper json) {
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            chain.doFilter(request, response);
        } catch (AuthenticationServiceException e) {
            if (!keysUnavailable(e)) {
                throw e;
            }
            LOG.warn("Identity provider keys unavailable: {}", rootMessage(e));
            if (response.isCommitted()) {
                return;
            }
            response.resetBuffer();
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setHeader("Retry-After", "5");
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            json.writeValue(response.getWriter(), UNAVAILABLE);
        }
    }

    static boolean keysUnavailable(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof KeySourceException) {
                return true;
            }
        }
        return false;
    }

    private static String rootMessage(Throwable error) {
        Throwable root = error;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName() + ": " + root.getMessage();
    }
}
