package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import si.contactmanager.apikey.ApiKeyTokens.Verified;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeySigningSecret;

/** Žeton API ključa (FR-019-01, -04, -17; research R-01): krožna pot in vsaka oblika ponaredbe → zavrnjen. */
@Tag("FR-019-01")
@Tag("FR-019-04")
@Tag("FR-019-17")
class ApiKeyTokensTest {

    private static final Instant NOW = Instant.parse("2026-11-16T10:00:00Z");
    private static final String SECRET = ApiKeySigningSecret.random();
    private static final UUID GROUP = UUID.fromString("0193c4a2-7a1f-7c3e-9b1a-000000000001");
    private static final UUID KEY = UUID.fromString("0193c4a2-7a1f-7c3e-9b1a-0000000000aa");
    private static final Scope READ_ONE = Scope.groups(Map.of(GROUP, Permission.READ));

    private static ApiKeyTokens tokens(String secret, Instant now) {
        return new ApiKeyTokens(
                new ApiKeyProperties(secret, 120, ZoneId.of("Europe/Ljubljana"), Duration.ofHours(1)),
                Clock.fixed(now, ZoneOffset.UTC));
    }

    private static final ApiKeyTokens TOKENS = tokens(SECRET, NOW);

    private static String issue(Scope scope, Instant expiresAt) {
        return TOKENS.issue(42, KEY, scope, NOW.minusSeconds(60), expiresAt);
    }

    /** Žeton, podpisan s pravo skrivnostjo, a s poljubnimi trditvami (za napačen aud/iss/scp). */
    private static String signed(Consumer<JwtClaimsSet.Builder> change) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer("contact-manager")
                .audience(List.of("contact-manager-api"))
                .subject("42")
                .id(KEY.toString())
                .issuedAt(NOW.minusSeconds(60))
                .expiresAt(NOW.plusSeconds(3600))
                .claim("scp", Map.of("all", "READ"));
        change.accept(claims);
        NimbusJwtEncoder encoder = new NimbusJwtEncoder(
                new ImmutableSecret<>(new SecretKeySpec(Base64.getDecoder().decode(SECRET), "HmacSHA256")));
        return "cmk_"
                + encoder.encode(JwtEncoderParameters.from(
                                JwsHeader.with(MacAlgorithm.HS256).build(), claims.build()))
                        .getTokenValue();
    }

    private static String b64(String json) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void roundTripCarriesOwnerKeyScopeAndExpiry() {
        Instant expires = NOW.plus(Duration.ofDays(90));
        String key = issue(READ_ONE, expires);

        assertThat(key).startsWith("cmk_eyJ");
        assertThat(TOKENS.verify(key)).contains(new Verified(42, KEY, READ_ONE, expires));
    }

    @Test
    void roundTripForAllGroupsAndManyGroups() {
        Map<UUID, Permission> groups = new LinkedHashMap<>();
        for (int i = 0; i < 50; i++) {
            groups.put(UUID.randomUUID(), i % 2 == 0 ? Permission.READ : Permission.WRITE);
        }
        Scope many = Scope.groups(groups);

        assertThat(TOKENS.verify(issue(Scope.allGroups(Permission.WRITE), null)))
                .map(Verified::scope)
                .contains(Scope.allGroups(Permission.WRITE));
        assertThat(TOKENS.verify(issue(many, null))).map(Verified::scope).contains(many);
    }

    @Test
    void keyWithoutExpiryIsValidLater() {
        String key = issue(READ_ONE, null);

        assertThat(tokens(SECRET, NOW.plus(Duration.ofDays(3650))).verify(key))
                .hasValueSatisfying(verified -> assertThat(verified.expiresAt()).isNull());
    }

    @Test
    void expiredKeyIsRejected() {
        String key = issue(READ_ONE, NOW.plus(Duration.ofDays(30)));

        assertThat(tokens(SECRET, NOW.plus(Duration.ofDays(30)).minusSeconds(1)).verify(key))
                .isPresent();
        assertThat(tokens(SECRET, NOW.plus(Duration.ofDays(30)).plusSeconds(1)).verify(key))
                .isEmpty();
    }

    @Test
    void forgedSignatureIsRejected() {
        String key = issue(READ_ONE, null);
        String[] parts = key.split("\\.");
        char last = parts[2].charAt(0);
        String forged = parts[0] + "." + parts[1] + "." + (last == 'A' ? 'B' : 'A') + parts[2].substring(1);

        assertThat(TOKENS.verify(forged)).isEmpty();
    }

    @Test
    void changedClaimsWithOriginalSignatureAreRejected() {
        String key = issue(READ_ONE, null);
        String[] parts = key.split("\\.");
        String payload = b64("{\"iss\":\"contact-manager\",\"aud\":\"contact-manager-api\",\"sub\":\"43\",\"jti\":\""
                + KEY + "\",\"scp\":{\"all\":\"WRITE\"}}");

        assertThat(TOKENS.verify(parts[0] + "." + payload + "." + parts[2])).isEmpty();
    }

    @Test
    void keySignedWithOtherSecretIsRejected() {
        String key = tokens(ApiKeySigningSecret.random(), NOW).issue(42, KEY, READ_ONE, NOW, null);

        assertThat(TOKENS.verify(key)).isEmpty();
    }

    @Test
    void missingOrWrongPrefixIsRejected() {
        String key = issue(READ_ONE, null);
        String jwt = key.substring(4);

        assertThat(TOKENS.verify(jwt)).isEmpty();
        assertThat(TOKENS.verify("CMK_" + jwt)).isEmpty();
        assertThat(TOKENS.verify("cmx_" + jwt)).isEmpty();
        assertThat(TOKENS.verify("cmk_")).isEmpty();
        assertThat(TOKENS.verify("cmk_nesmisel")).isEmpty();
        assertThat(TOKENS.verify(null)).isEmpty();
    }

    @Test
    void unsignedAlgNoneIsRejected() {
        String payload = b64("{\"iss\":\"contact-manager\",\"aud\":\"contact-manager-api\",\"sub\":\"42\",\"jti\":\""
                + KEY + "\",\"scp\":{\"all\":\"WRITE\"}}");

        assertThat(TOKENS.verify("cmk_" + b64("{\"alg\":\"none\",\"typ\":\"JWT\"}") + "." + payload + "."))
                .isEmpty();
    }

    @Test
    void wrongAudienceOrIssuerIsRejected() {
        assertThat(TOKENS.verify(signed(claims -> {}))).isPresent();
        assertThat(TOKENS.verify(signed(claims -> claims.audience(List.of("demo-contact-manager")))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.issuer("https://securetoken.google.com/demo"))))
                .isEmpty();
    }

    @Test
    void invalidScopeOrIdentityIsRejected() {
        assertThat(TOKENS.verify(signed(claims -> claims.claims(map -> map.remove("scp")))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.claim("scp", Map.of("all", "ADMIN")))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.claim("scp", Map.of("all", "read")))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.claim("scp", Map.of("groups", Map.of())))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.claim("scp", Map.of("groups", Map.of("ni-uuid", "READ"))))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims ->
                        claims.claim("scp", Map.of("all", "READ", "groups", Map.of(GROUP.toString(), "READ"))))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.claim("scp", "READ")))).isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.subject("uid-firebase"))))
                .isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.id("ni-uuid")))).isEmpty();
        assertThat(TOKENS.verify(signed(claims -> claims.claims(map -> map.remove("jti")))))
                .isEmpty();
    }

    @Test
    void firebaseStyleTokenIsRejected() {
        String header = b64("{\"alg\":\"RS256\",\"kid\":\"firebase\",\"typ\":\"JWT\"}");
        String payload = b64("{\"iss\":\"https://securetoken.google.com/demo-contact-manager\","
                + "\"aud\":\"demo-contact-manager\",\"sub\":\"uid\",\"exp\":"
                + NOW.plusSeconds(3600).getEpochSecond()
                + "}");
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[256]);

        assertThat(TOKENS.verify(header + "." + payload + "." + signature)).isEmpty();
        assertThat(TOKENS.verify("cmk_" + header + "." + payload + "." + signature))
                .isEmpty();
    }
}
