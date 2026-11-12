package si.contactmanager.account;

import java.time.Duration;

/** Odmik med ponovnimi poskusi brisanja identitete: {@code min(30 s · 2^attempts, 1 h)} (012, FR-012-18). */
final class IdentityRetryBackoff {

    private IdentityRetryBackoff() {}

    static Duration delay(int attempts) {
        throw new UnsupportedOperationException("not implemented: IdentityRetryBackoff.delay (FR-012-18)");
    }
}
