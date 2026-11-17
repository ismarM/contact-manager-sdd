package si.contactmanager.apikey;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import si.contactmanager.apikey.ApiKeyTokens.Verified;
import si.contactmanager.shared.security.ApiKeyPrincipal;

/**
 * Prijava z API ključem na {@code /v1/**} (019, research R-02; FR-019-17): samo glava {@code Authorization: Bearer cmk_…}.
 * Podpis in trditve preveri {@link ApiKeyTokens}, nato vrstico po {@code jti} (obstaja, isti lastnik, ni preklicana).
 * Uspeh nastavi {@link ApiKeyPrincipal}; vsak neuspeh pusti zahtevo neprijavljeno in veriga vrne
 * {@code 401 UNAUTHENTICATED}. Ključ se nikoli ne zapiše v dnevnik, samo {@code jti}.
 */
class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(ApiKeyAuthenticationFilter.class);
    private static final String BEARER = "Bearer ";

    private final ApiKeyTokens tokens;
    private final ApiKeyRepository keys;

    ApiKeyAuthenticationFilter(ApiKeyTokens tokens, ApiKeyRepository keys) {
        this.tokens = tokens;
        this.keys = keys;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        authenticate(request.getHeader(HttpHeaders.AUTHORIZATION)).ifPresent(principal -> {
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of()));
            SecurityContextHolder.setContext(context);
        });
        chain.doFilter(request, response);
    }

    private Optional<ApiKeyPrincipal> authenticate(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return Optional.empty();
        }
        Optional<Verified> verified =
                tokens.verify(authorization.substring(BEARER.length()).strip());
        if (verified.isEmpty()) {
            return Optional.empty();
        }
        Verified key = verified.get();
        Optional<String> name = keys.activeKeyName(key.keyId(), key.userId());
        if (name.isEmpty()) {
            LOG.info("API key rejected (revoked or deleted): jti={}", key.keyId());
            return Optional.empty();
        }
        return Optional.of(new ApiKeyPrincipal(key.userId(), key.keyId(), name.get(), key.scope()));
    }
}
