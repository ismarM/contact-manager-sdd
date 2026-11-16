package si.contactmanager.shared.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import si.contactmanager.shared.error.ErrorResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * Potrjen e-naslov je pogoj za ves API (FR-017-02, FR-017-04, research R-01). Teče za
 * {@code BearerTokenAuthenticationFilter}: veljaven žeton brez {@code email_verified=true} dobi {@code 403
 * EMAIL_NOT_VERIFIED}, preden zahtevek doseže kontroler – tudi {@code PUT /api/me}, zato profil pred potrditvijo ne
 * nastane. Neveljaven ali manjkajoč žeton ostane 401 (filter ga ne vidi). Izjema je javni {@code GET /api/health};
 * {@code /dav/**} ima svojo verigo (gesla za aplikacijo, 014) in ga filter ne zadeva.
 */
public final class EmailVerifiedFilter extends OncePerRequestFilter {

    static final String CLAIM = "email_verified";
    private static final ErrorResponse EMAIL_NOT_VERIFIED = new ErrorResponse("EMAIL_NOT_VERIFIED");
    private static final RequestMatcher HEALTH =
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.GET, "/api/health");

    private final JsonMapper json;

    public EmailVerifiedFilter(JsonMapper json) {
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.getPrincipal() instanceof Jwt jwt
                && !isVerified(jwt)
                && !HEALTH.matches(request)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            json.writeValue(response.getWriter(), EMAIL_NOT_VERIFIED);
            return;
        }
        chain.doFilter(request, response);
    }

    /** Samo logična vrednost {@code true}; manjkajoč zahtevek, {@code false} ali niz ni potrditev. */
    static boolean isVerified(Jwt jwt) {
        return Boolean.TRUE.equals(jwt.getClaims().get(CLAIM));
    }
}
