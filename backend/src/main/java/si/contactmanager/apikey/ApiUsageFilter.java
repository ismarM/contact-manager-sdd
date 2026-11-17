package si.contactmanager.apikey;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;
import si.contactmanager.shared.security.ApiKeyPrincipal;

/**
 * Šteje zahteve s veljavnim ključem na {@code /v1/**} po izidu (019, FR-019-20, research R-06). Zahteve brez
 * veljavnega ključa (401) in javni opis vmesnika se ne štejejo. Odgovor se zadrži v pomnilniku do štetja, zato je
 * zahteva v statistiki vidna, ko odjemalec prejme odgovor. Napaka štetja ne spremeni odgovora; šteje se samo
 * število, nikoli vsebina zahteve ali ključ.
 */
class ApiUsageFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(ApiUsageFilter.class);
    private static final String DESCRIPTION_PATH = "/v1/openapi.json";

    private final ApiUsageRepository usage;
    private final Clock clock;

    ApiUsageFilter(ApiUsageRepository usage, Clock clock) {
        this.usage = usage;
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return DESCRIPTION_PATH.equals(request.getRequestURI())
                || ApiKeyPrincipal.current().isEmpty();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        ApiKeyPrincipal principal = ApiKeyPrincipal.current().orElseThrow();
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
        try {
            chain.doFilter(request, wrapped);
        } catch (IOException | ServletException | RuntimeException e) {
            count(principal, request.getMethod(), HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            throw e;
        }
        count(principal, request.getMethod(), wrapped.getStatus());
        wrapped.copyBodyToResponse();
    }

    private void count(ApiKeyPrincipal principal, String method, int status) {
        try {
            usage.record(principal.keyId(), UsageOutcome.of(method, status), clock.instant());
        } catch (RuntimeException e) {
            LOG.warn(
                    "API key usage not counted: jti={} ({})",
                    principal.keyId(),
                    e.getClass().getSimpleName());
        }
    }
}
