package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.shared.error.RateLimitedException;

/** Drsno okno nalaganj (FR-018-15): 10 na minuto na uporabnika, uporabniki so med seboj neodvisni. */
@Tag("FR-018-15")
class UploadRateLimiterTest {

    /** Ura, ki jo test premika. */
    private static final class Ticking extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-16T10:00:00Z"));

        void advanceSeconds(long seconds) {
            now.updateAndGet(value -> value.plusSeconds(seconds));
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    }

    @Test
    void eleventhAttemptWithinAMinuteIsRateLimited() {
        UploadRateLimiter limiter = new UploadRateLimiter(10, new Ticking());

        for (int i = 0; i < 10; i++) {
            limiter.check("user:1");
        }

        assertThatThrownBy(() -> limiter.check("user:1")).isInstanceOf(RateLimitedException.class);
    }

    @Test
    void usersAreCountedIndependently() {
        UploadRateLimiter limiter = new UploadRateLimiter(2, new Ticking());
        limiter.check("user:1");
        limiter.check("user:1");

        assertThatCode(() -> limiter.check("user:2")).doesNotThrowAnyException();
        assertThatThrownBy(() -> limiter.check("user:1")).isInstanceOf(RateLimitedException.class);
    }

    @Test
    void windowSlidesAfterAMinute() {
        Ticking clock = new Ticking();
        UploadRateLimiter limiter = new UploadRateLimiter(2, clock);
        limiter.check("user:1");
        clock.advanceSeconds(30);
        limiter.check("user:1");

        assertThatThrownBy(() -> limiter.check("user:1")).isInstanceOf(RateLimitedException.class);

        clock.advanceSeconds(31); // prvi poskus je zdaj starejši od minute, drugi še ne
        limiter.check("user:1");
        assertThatThrownBy(() -> limiter.check("user:1")).isInstanceOf(RateLimitedException.class);
    }

    @Test
    void rejectedAttemptsDoNotExtendTheWindow() {
        Ticking clock = new Ticking();
        UploadRateLimiter limiter = new UploadRateLimiter(1, clock);
        limiter.check("user:1");
        clock.advanceSeconds(40);
        assertThatThrownBy(() -> limiter.check("user:1")).isInstanceOf(RateLimitedException.class);

        clock.advanceSeconds(21); // 61 s po prvem (uspelem) poskusu
        assertThatCode(() -> limiter.check("user:1")).doesNotThrowAnyException();
    }
}
