package si.contactmanager.apikey;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;
import si.contactmanager.shared.error.ErrorResponse;
import si.contactmanager.shared.security.ApiKeyPrincipal;
import tools.jackson.databind.json.JsonMapper;

/**
 * Omejitev 120 zahtev/min na ključ na {@code /v1/**} (019, FR-019-16): nad mejo {@code 429 RATE_LIMITED} z
 * {@code Retry-After} v sekundah. Stoji za {@link ApiUsageFilter}, zato se zavrnjena zahteva šteje kot
 * {@code rate_limited}; spletna aplikacija in drugi ključi niso prizadeti. Javni opis vmesnika se ne omejuje.
 */
class ApiRateLimitFilter extends OncePerRequestFilter {

    private static final ErrorResponse RATE_LIMITED = new ErrorResponse("RATE_LIMITED");
    private static final String DESCRIPTION_PATH = "/v1/openapi.json";

    private final ApiRateLimiter limiter;
    private final Clock clock;
    private final JsonMapper json;

    ApiRateLimitFilter(ApiRateLimiter limiter, Clock clock, JsonMapper json) {
        this.limiter = limiter;
        this.clock = clock;
        this.json = json;
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
        ApiRateLimiter.Decision decision = limiter.acquire(principal.keyId(), clock.instant());
        if (decision.allowed()) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(429);
        response.setHeader("Retry-After", Long.toString(decision.retryAfterSeconds()));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getWriter(), RATE_LIMITED);
    }
}
