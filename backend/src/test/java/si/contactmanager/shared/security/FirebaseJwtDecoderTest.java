package si.contactmanager.shared.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

/**
 * Preverjanje ID žetonov Firebase (FR-001-07, research R-01). Podpis produkcijskega načina se preveri z lokalno
 * ustvarjenim ključem RSA (ne z zunanjo storitvijo); način emulatorja sprejme samo nepodpisane žetone. Vsak test
 * zavrnitve najprej preveri, da je enak žeton brez napake sprejet.
 */
@Tag("FR-001-07")
class FirebaseJwtDecoderTest {

    static final String PROJECT = "demo-contact-manager";
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    static final RSAKey KEY = generateKey("google-key");
    static final RSAKey OTHER_KEY = generateKey("google-key");

    static JWTClaimsSet.Builder validClaims() {
        return new JWTClaimsSet.Builder()
                .issuer("https://securetoken.google.com/" + PROJECT)
                .audience(PROJECT)
                .subject("uid-ana")
                .issueTime(Date.from(NOW.minusSeconds(30)))
                .expirationTime(Date.from(NOW.plusSeconds(3570)))
                .claim("auth_time", NOW.minusSeconds(30).getEpochSecond())
                .claim("email", "ana@primer.si")
                .claim("name", "Ana Novak");
    }

    static String signed(RSAKey key, UnaryOperator<JWTClaimsSet.Builder> change) {
        try {
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.RS256)
                            .keyID(key.getKeyID())
                            .type(JOSEObjectType.JWT)
                            .build(),
                    change.apply(validClaims()).build());
            jwt.sign(new RSASSASigner(key));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String unsigned(UnaryOperator<JWTClaimsSet.Builder> change) {
        return new PlainJWT(change.apply(validClaims()).build()).serialize();
    }

    static RSAKey generateKey(String keyId) {
        try {
            return new RSAKeyGenerator(2048).keyID(keyId).generate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Nested
    class Production {

        final JwtDecoder decoder =
                FirebaseJwtDecoder.production(PROJECT, new ImmutableJWKSet<>(new JWKSet(KEY.toPublicJWK())), CLOCK);

        void assertRejected(String invalid) {
            assertThat(decoder.decode(signed(KEY, c -> c)).getSubject())
                    .as("veljaven žeton je sprejet")
                    .isEqualTo("uid-ana");
            assertThatThrownBy(() -> decoder.decode(invalid)).isInstanceOf(JwtException.class);
        }

        @Test
        void validSignedTokenIsAcceptedAndCarriesUserFromToken() {
            Jwt jwt = decoder.decode(signed(KEY, c -> c));

            assertThat(jwt.getSubject()).isEqualTo("uid-ana");
            assertThat(jwt.getClaimAsString("email")).isEqualTo("ana@primer.si");
            assertThat(jwt.getClaimAsString("name")).isEqualTo("Ana Novak");
        }

        @Test
        void tokenSignedWithAnotherKeyIsRejected() {
            assertRejected(signed(OTHER_KEY, c -> c));
        }

        @Test
        void tamperedPayloadIsRejected() {
            String[] valid = signed(KEY, c -> c).split("\\.");
            String[] other = signed(KEY, c -> c.subject("uid-bojan")).split("\\.");
            assertRejected(valid[0] + "." + other[1] + "." + valid[2]);
        }

        @Test
        void unsignedTokenIsRejected() {
            assertRejected(unsigned(c -> c));
        }

        @Test
        void tokenFromAnotherIssuerIsRejected() {
            assertRejected(signed(KEY, c -> c.issuer("https://securetoken.google.com/drug-projekt")));
        }

        @Test
        void tokenForAnotherProjectIsRejected() {
            assertRejected(signed(KEY, c -> c.audience("drug-projekt")));
        }

        @Test
        void expiredTokenIsRejected() {
            assertRejected(signed(
                    KEY,
                    c -> c.issueTime(Date.from(NOW.minusSeconds(7200)))
                            .expirationTime(Date.from(NOW.minusSeconds(3600)))));
        }

        @Test
        void tokenIssuedInTheFutureIsRejected() {
            assertRejected(signed(
                    KEY,
                    c -> c.issueTime(Date.from(NOW.plusSeconds(3600)))
                            .expirationTime(Date.from(NOW.plusSeconds(7200)))));
        }

        @Test
        void tokenWithoutSubjectIsRejected() {
            assertRejected(signed(KEY, c -> c.subject("")));
        }

        @Test
        void tokenWithoutEmailIsRejected() {
            assertRejected(signed(KEY, c -> c.claim("email", null)));
        }

        @Test
        void malformedTokenIsRejected() {
            assertRejected("not-a-jwt");
        }
    }

    @Nested
    class Emulator {

        final JwtDecoder decoder = FirebaseJwtDecoder.emulator(PROJECT, CLOCK);

        void assertRejected(String invalid) {
            assertThat(decoder.decode(unsigned(c -> c)).getSubject())
                    .as("veljaven nepodpisan žeton emulatorja je sprejet")
                    .isEqualTo("uid-ana");
            assertThatThrownBy(() -> decoder.decode(invalid)).isInstanceOf(JwtException.class);
        }

        @Test
        void unsignedEmulatorTokenIsAccepted() {
            Jwt jwt = decoder.decode(unsigned(c -> c));

            assertThat(jwt.getSubject()).isEqualTo("uid-ana");
            assertThat(jwt.getClaimAsString("email")).isEqualTo("ana@primer.si");
        }

        @Test
        void signedTokenIsRejectedInEmulatorMode() {
            assertRejected(signed(KEY, c -> c));
        }

        @Test
        void tokenForAnotherProjectIsRejected() {
            assertRejected(unsigned(c -> c.audience("drug-projekt")));
        }

        @Test
        void tokenFromAnotherIssuerIsRejected() {
            assertRejected(unsigned(c -> c.issuer("https://securetoken.google.com/drug-projekt")));
        }

        @Test
        void expiredTokenIsRejected() {
            assertRejected(unsigned(c ->
                    c.issueTime(Date.from(NOW.minusSeconds(7200))).expirationTime(Date.from(NOW.minusSeconds(3600)))));
        }

        @Test
        void tokenWithoutEmailIsRejected() {
            assertRejected(unsigned(c -> c.claim("email", null)));
        }
    }
}
