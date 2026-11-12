package si.contactmanager.account;

import java.time.Duration;

/**
 * Odmik med ponovnimi poskusi brisanja identitete: {@code min(30 s · 2^attempts, 1 h)} (012, FR-012-18), kjer je
 * {@code attempts} število poskusov pred ravnokar neuspelim (prvi neuspeh: 0 → 30 s).
 */
final class IdentityRetryBackoff {

    private static final long BASE_SECONDS = 30;
    private static final long CAP_SECONDS = 3600;

    private IdentityRetryBackoff() {}

    static Duration delay(int attempts) {
        if (attempts >= 7) {
            return Duration.ofSeconds(CAP_SECONDS);
        }
        long seconds = BASE_SECONDS << Math.max(attempts, 0);
        return Duration.ofSeconds(Math.min(seconds, CAP_SECONDS));
    }
}
