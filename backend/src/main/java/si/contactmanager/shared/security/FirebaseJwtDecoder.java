package si.contactmanager.shared.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTParser;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.jwt.MappedJwtClaimSetConverter;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Preverjanje ID žetonov Firebase (FR-001-07, research R-01).
 *
 * <ul>
 *   <li>produkcija: podpis RS256 po ključih JWK Googla;
 *   <li>emulator: samo nepodpisani žetoni ({@code alg: none}), ki jih izdaja Firebase Auth Emulator.
 * </ul>
 *
 * V obeh načinih: izdajatelj {@code https://securetoken.google.com/<projekt>}, občinstvo {@code <projekt>}, veljaven
 * {@code exp}, {@code iat} ne v prihodnosti (60 s zamika), neprazen {@code sub} in prisoten {@code email}.
 */
public final class FirebaseJwtDecoder {

    /** Javni ključi Googla za ID žetone Firebase. */
    public static final String GOOGLE_JWK_SET_URI =
            "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

    private static final Duration CLOCK_SKEW = Duration.ofSeconds(60);

    private FirebaseJwtDecoder() {}

    public static JwtDecoder production(String projectId, JWKSource<SecurityContext> keys, Clock clock) {
        DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
        processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keys));
        // Zahtevke preverijo validatorji Spring Security spodaj (z isto uro kot v načinu emulatorja).
        processor.setJWTClaimsSetVerifier((claims, context) -> {});
        NimbusJwtDecoder decoder = new NimbusJwtDecoder(processor);
        decoder.setJwtValidator(validator(projectId, clock));
        return decoder;
    }

    public static JwtDecoder emulator(String projectId, Clock clock) {
        OAuth2TokenValidator<Jwt> validator = validator(projectId, clock);
        MappedJwtClaimSetConverter claimsConverter = MappedJwtClaimSetConverter.withDefaults(Map.of());
        return token -> {
            JWT parsed;
            try {
                parsed = JWTParser.parse(token);
            } catch (ParseException e) {
                throw new BadJwtException("malformed token", e);
            }
            if (!(parsed instanceof PlainJWT)) {
                throw new BadJwtException("emulator mode accepts only unsigned emulator tokens");
            }
            Jwt jwt;
            try {
                Map<String, Object> claims =
                        claimsConverter.convert(parsed.getJWTClaimsSet().getClaims());
                jwt = Jwt.withTokenValue(token)
                        .headers(headers -> headers.putAll(parsed.getHeader().toJSONObject()))
                        .claims(values -> values.putAll(claims))
                        .build();
            } catch (ParseException | IllegalArgumentException e) {
                throw new BadJwtException("malformed claims", e);
            }
            OAuth2TokenValidatorResult result = validator.validate(jwt);
            if (result.hasErrors()) {
                throw new JwtValidationException("invalid token", result.getErrors());
            }
            return jwt;
        };
    }

    static OAuth2TokenValidator<Jwt> validator(String projectId, Clock clock) {
        JwtTimestampValidator timestamps = new JwtTimestampValidator(CLOCK_SKEW);
        timestamps.setClock(clock);
        return new DelegatingOAuth2TokenValidator<>(List.of(
                timestamps,
                new JwtIssuerValidator("https://securetoken.google.com/" + projectId),
                new JwtClaimValidator<List<String>>(
                        JwtClaimNames.AUD, audience -> audience != null && audience.contains(projectId)),
                new JwtClaimValidator<Instant>(JwtClaimNames.EXP, expiresAt -> expiresAt != null),
                new JwtClaimValidator<Instant>(
                        JwtClaimNames.IAT,
                        issuedAt -> issuedAt != null
                                && !issuedAt.isAfter(clock.instant().plus(CLOCK_SKEW))),
                new JwtClaimValidator<String>(JwtClaimNames.SUB, subject -> subject != null && !subject.isBlank()),
                FirebaseJwtDecoder::requireEmail));
    }

    private static OAuth2TokenValidatorResult requireEmail(Jwt jwt) {
        Object email = jwt.getClaims().get("email");
        return email instanceof String value && !value.isBlank()
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "email claim is required", null));
    }
}
