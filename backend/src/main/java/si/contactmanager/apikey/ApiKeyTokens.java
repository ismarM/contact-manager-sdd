package si.contactmanager.apikey;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;

/**
 * Izdaja in preverjanje API ključev (019, research R-01; docs/decisions/2026-11-16-api-kljuc-jwt.md): {@code cmk_} +
 * JWT HS256 s trditvami {@code iss}, {@code aud}, {@code sub}, {@code jti}, {@code iat}, neobveznim {@code exp} in
 * obsegom {@code scp}. Namenoma <b>ni</b> bean tipa {@code JwtDecoder}: veriga {@code /api} injicira edini
 * {@code JwtDecoder} (Firebase) po tipu. Preverjanje vrstice (preklic, lastnik) opravi {@link ApiKeyAuthenticationFilter}.
 */
@Component
public class ApiKeyTokens {

    public static final String PREFIX = "cmk_";
    static final String ISSUER = "contact-manager";
    static final String AUDIENCE = "contact-manager-api";
    static final String SCOPE = "scp";
    static final int MAX_GROUPS = 50;

    /** Preverjen ključ: lastnik, id vrstice, obseg in rok (ali {@code null} brez roka). */
    public record Verified(long userId, UUID keyId, Scope scope, Instant expiresAt) {}

    private final NimbusJwtEncoder encoder;
    private final NimbusJwtDecoder decoder;

    @Autowired
    public ApiKeyTokens(ApiKeyProperties properties) {
        this(properties, Clock.systemUTC());
    }

    public ApiKeyTokens(ApiKeyProperties properties, Clock clock) {
        SecretKey key = new SecretKeySpec(properties.secretKey(), "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        this.decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ZERO);
        timestamps.setClock(clock);
        this.decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                timestamps, new JwtIssuerValidator(ISSUER), ApiKeyTokens::audience));
    }

    /** Nov ključ ({@code cmk_} + podpisan JWT); {@code expiresAt} {@code null} = brez roka. */
    public String issue(long userId, UUID keyId, Scope scope, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .audience(List.of(AUDIENCE))
                .subject(Long.toString(userId))
                .id(keyId.toString())
                .issuedAt(issuedAt)
                .claim(SCOPE, scopeClaim(scope));
        if (expiresAt != null) {
            claims.expiresAt(expiresAt);
        }
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
        return PREFIX
                + encoder.encode(JwtEncoderParameters.from(header, claims.build()))
                        .getTokenValue();
    }

    /**
     * Preveri predpono, podpis, {@code iss}, {@code aud}, {@code exp} in obliko trditev. Vsaka napaka → prazno (klicatelj
     * vrne 401); razlog se ne razkrije.
     */
    public Optional<Verified> verify(String apiKey) {
        if (apiKey == null || !apiKey.startsWith(PREFIX)) {
            return Optional.empty();
        }
        try {
            Jwt jwt = decoder.decode(apiKey.substring(PREFIX.length()));
            return Optional.of(new Verified(
                    Long.parseLong(jwt.getSubject()),
                    UUID.fromString(jwt.getId()),
                    parseScope(jwt.getClaims().get(SCOPE)),
                    jwt.getExpiresAt()));
        } catch (JwtException | IllegalArgumentException | NullPointerException | ClassCastException e) {
            return Optional.empty();
        }
    }

    private static OAuth2TokenValidatorResult audience(Jwt jwt) {
        List<String> audience = jwt.getAudience();
        return audience != null && audience.contains(AUDIENCE)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "aud", null));
    }

    private static Map<String, Object> scopeClaim(Scope scope) {
        if (scope.all() != null) {
            return Map.of("all", scope.all().name());
        }
        Map<String, String> groups = new LinkedHashMap<>();
        scope.groups().forEach((group, permission) -> groups.put(group.toString(), permission.name()));
        return Map.of("groups", groups);
    }

    private static Scope parseScope(Object claim) {
        if (!(claim instanceof Map<?, ?> scope) || scope.size() != 1) {
            throw new IllegalArgumentException("scp");
        }
        if (scope.get("all") instanceof String all) {
            return Scope.allGroups(Permission.valueOf(all));
        }
        if (!(scope.get("groups") instanceof Map<?, ?> groups) || groups.isEmpty() || groups.size() > MAX_GROUPS) {
            throw new IllegalArgumentException("scp");
        }
        Map<UUID, Permission> parsed = new LinkedHashMap<>();
        groups.forEach((group, permission) ->
                parsed.put(UUID.fromString((String) group), Permission.valueOf((String) permission)));
        return Scope.groups(parsed);
    }
}
