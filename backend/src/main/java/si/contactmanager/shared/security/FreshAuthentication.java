package si.contactmanager.shared.security;

import java.time.Duration;
import java.time.Instant;
import org.springframework.security.oauth2.jwt.Jwt;
import si.contactmanager.shared.error.ReauthenticationRequiredException;

/**
 * Ponovna avtentikacija pred občutljivimi operacijami (FR-017-12): zahtevek {@code auth_time} Firebase žetona
 * (čas zadnje prave prijave, ne osvežitve žetona) ne sme biti starejši od 300 s. Manjkajoč ali nerazumljiv zahtevek
 * velja za neveljaven čas, zato zahteva novo prijavo.
 */
public final class FreshAuthentication {

    static final String CLAIM = "auth_time";
    static final Duration MAX_AGE = Duration.ofSeconds(300);

    private FreshAuthentication() {}

    /** Vrže {@link ReauthenticationRequiredException}, če prijava ni dovolj sveža. */
    public static void require(Jwt jwt) {
        require(jwt, Instant.now());
    }

    static void require(Jwt jwt, Instant now) {
        if (!isFresh(jwt, now)) {
            throw new ReauthenticationRequiredException();
        }
    }

    static boolean isFresh(Jwt jwt, Instant now) {
        Object claim = jwt.getClaims().get(CLAIM);
        Instant authTime;
        if (claim instanceof Instant instant) {
            authTime = instant;
        } else if (claim instanceof Number number) {
            authTime = Instant.ofEpochSecond(number.longValue());
        } else {
            return false;
        }
        return !authTime.isBefore(now.minus(MAX_AGE)) && !authTime.isAfter(now.plusSeconds(60));
    }
}
