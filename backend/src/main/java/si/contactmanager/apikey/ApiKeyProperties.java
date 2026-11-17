package si.contactmanager.apikey;

import java.time.Duration;
import java.time.ZoneId;
import java.util.Base64;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Nastavitve API ključev (019, research R-01, R-05 … R-07). Podpisna skrivnost je obvezna (base64, vsaj 32 bajtov);
 * brez nje ali s prekratko vrednostjo zagon pade. Vrednost se nikoli ne izpiše.
 */
@ConfigurationProperties("api-keys")
public record ApiKeyProperties(String signingSecret, int rateLimit, ZoneId statsZone, Duration purgeInterval) {

    static final int MINIMUM_SECRET_BYTES = 32;

    public ApiKeyProperties {
        secretBytes(signingSecret);
        if (rateLimit < 1) {
            throw new IllegalArgumentException("api-keys.rate-limit must be at least 1");
        }
        if (statsZone == null) {
            throw new IllegalArgumentException("api-keys.stats-zone is required");
        }
        if (purgeInterval == null || purgeInterval.isNegative() || purgeInterval.isZero()) {
            throw new IllegalArgumentException("api-keys.purge-interval must be positive");
        }
    }

    /** Podpisni ključ HS256 (dekodirana skrivnost). */
    byte[] secretKey() {
        return secretBytes(signingSecret);
    }

    @Override
    public String toString() {
        return "ApiKeyProperties[signingSecret=***, rateLimit=" + rateLimit + ", statsZone=" + statsZone
                + ", purgeInterval=" + purgeInterval + "]";
    }

    private static byte[] secretBytes(String secret) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException(
                    "api-keys.signing-secret (API_KEY_SIGNING_SECRET) is required: openssl rand -base64 32");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(secret.strip());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("api-keys.signing-secret must be base64");
        }
        if (bytes.length < MINIMUM_SECRET_BYTES) {
            throw new IllegalArgumentException("api-keys.signing-secret must decode to at least 32 bytes");
        }
        return bytes;
    }
}
