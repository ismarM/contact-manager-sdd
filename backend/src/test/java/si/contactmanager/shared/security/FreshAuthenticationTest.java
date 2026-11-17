package si.contactmanager.shared.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import si.contactmanager.shared.error.ReauthenticationRequiredException;

@Tag("FR-017-12")
class FreshAuthenticationTest {

    private static final Instant NOW = Instant.parse("2026-11-16T12:00:00Z");

    private static Jwt jwt(Map<String, Object> claims) {
        Map<String, Object> all = new java.util.HashMap<>(claims);
        all.put("sub", "uid");
        return new Jwt("t", NOW.minusSeconds(10), NOW.plusSeconds(3600), Map.of("alg", "RS256"), all);
    }

    @Test
    void exactlyAtLimitIsFreshOneSecondOverIsNot() {
        assertThat(FreshAuthentication.isFresh(
                        jwt(Map.of("auth_time", NOW.minusSeconds(300).getEpochSecond())), NOW))
                .isTrue();
        assertThat(FreshAuthentication.isFresh(
                        jwt(Map.of("auth_time", NOW.minusSeconds(301).getEpochSecond())), NOW))
                .isFalse();
    }

    @Test
    void recentIsFreshAndInstantClaimIsSupported() {
        assertThat(FreshAuthentication.isFresh(jwt(Map.of("auth_time", NOW.minusSeconds(5))), NOW))
                .isTrue();
    }

    @Test
    void missingOrMalformedClaimIsNotFresh() {
        assertThat(FreshAuthentication.isFresh(jwt(Map.of()), NOW)).isFalse();
        assertThat(FreshAuthentication.isFresh(jwt(Map.of("auth_time", "zdaj")), NOW))
                .isFalse();
    }

    @Test
    void farFutureClaimIsNotFresh() {
        assertThat(FreshAuthentication.isFresh(
                        jwt(Map.of("auth_time", NOW.plusSeconds(3600).getEpochSecond())), NOW))
                .isFalse();
    }

    @Test
    void requireThrowsOnlyWhenStale() {
        assertThatCode(() -> FreshAuthentication.require(jwt(Map.of("auth_time", NOW.getEpochSecond())), NOW))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> FreshAuthentication.require(jwt(Map.of()), NOW))
                .isInstanceOf(ReauthenticationRequiredException.class);
    }
}
