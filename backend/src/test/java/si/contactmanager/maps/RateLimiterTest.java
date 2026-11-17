package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Omejevalnik pogostosti (016, FR-016-22, FR-016-23; research R-08): vedro žetonov, čakanje do meje, na ključ. */
@Tag("FR-016-22")
@Tag("FR-016-23")
class RateLimiterTest {

    private final AtomicLong now = new AtomicLong(1_000_000_000L);
    private final List<Long> slept = new ArrayList<>();

    private RateLimiter limiter(int permits, Duration window) {
        return new RateLimiter(permits, window, now::get, nanos -> {
            slept.add(nanos);
            now.addAndGet(nanos);
        });
    }

    @Test
    void allowsABurstUpToThePermitsThenRejects() {
        RateLimiter limiter = limiter(5, Duration.ofSeconds(1));

        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryAcquire()).isTrue();
        }
        assertThat(limiter.tryAcquire()).isFalse();
    }

    @Test
    void tokensComeBackWithTimeButNeverAboveTheCapacity() {
        RateLimiter limiter = limiter(2, Duration.ofSeconds(1));
        assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isFalse();

        now.addAndGet(Duration.ofMillis(500).toNanos());
        assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isFalse();

        now.addAndGet(Duration.ofSeconds(60).toNanos());
        assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isTrue();
        assertThat(limiter.tryAcquire()).isFalse();
    }

    @Test
    void acquireWaitsForATokenWithinTheLimit() {
        RateLimiter limiter = limiter(1, Duration.ofSeconds(1));
        assertThat(limiter.acquire(Duration.ofSeconds(1))).isTrue();
        assertThat(slept).isEmpty();

        assertThat(limiter.acquire(Duration.ofSeconds(1))).isTrue();

        assertThat(slept).hasSize(1);
        assertThat(slept.get(0))
                .isBetween(
                        Duration.ofMillis(990).toNanos(),
                        Duration.ofMillis(1000).toNanos());
    }

    @Test
    void acquireRefusesWhenTheWaitWouldBeLongerThanAllowedAndKeepsNoReservation() {
        RateLimiter limiter = limiter(1, Duration.ofSeconds(1));
        assertThat(limiter.acquire(Duration.ofSeconds(1))).isTrue();

        assertThat(limiter.acquire(Duration.ofMillis(100))).isFalse();
        assertThat(slept).isEmpty();

        now.addAndGet(Duration.ofSeconds(1).toNanos());
        assertThat(limiter.tryAcquire()).isTrue();
    }

    @Test
    void reservedTokensQueueFurtherCallers() {
        RateLimiter limiter = limiter(1, Duration.ofSeconds(1));
        assertThat(limiter.acquire(Duration.ofSeconds(2))).isTrue();
        assertThat(limiter.acquire(Duration.ofSeconds(2))).isTrue();
        assertThat(limiter.acquire(Duration.ofSeconds(2))).isTrue();

        assertThat(slept).hasSize(2);
    }

    @Test
    void keyedLimiterGivesEachKeyItsOwnBucket() {
        RateLimiter.Keyed<String> keyed = new RateLimiter.Keyed<>(2, Duration.ofSeconds(1), now::get);

        assertThat(keyed.tryAcquire("ana")).isTrue();
        assertThat(keyed.tryAcquire("ana")).isTrue();
        assertThat(keyed.tryAcquire("ana")).isFalse();
        assertThat(keyed.tryAcquire("bor")).isTrue();
        assertThat(keyed.size()).isEqualTo(2);

        now.addAndGet(Duration.ofSeconds(1).toNanos());
        assertThat(keyed.tryAcquire("ana")).isTrue();
    }

    @Test
    void invalidArgumentsAreRejected() {
        assertThatThrownBy(() -> new RateLimiter(0, Duration.ofSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RateLimiter(1, Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
    }
}
