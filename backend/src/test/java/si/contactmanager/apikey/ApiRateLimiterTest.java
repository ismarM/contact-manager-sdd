package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Fiksno okno 60 s na ključ (019, FR-019-16): meja, novo okno, Retry-After, ločeni ključi, sočasnost. */
@Tag("FR-019-16")
class ApiRateLimiterTest {

    private static final Instant START = Instant.parse("2026-11-16T10:00:00Z");

    @Test
    void allowsExactlyTheLimitAndRejectsTheNext() {
        ApiRateLimiter limiter = new ApiRateLimiter(3);
        UUID key = UUID.randomUUID();

        for (int i = 0; i < 3; i++) {
            assertThat(limiter.acquire(key, START).allowed()).isTrue();
        }
        assertThat(limiter.acquire(key, START).allowed()).isFalse();
        assertThat(limiter.acquire(key, START.plusSeconds(10)).allowed()).isFalse();
    }

    @Test
    void retryAfterIsSecondsToTheNextWindowAndAtLeastOne() {
        ApiRateLimiter limiter = new ApiRateLimiter(1);
        UUID key = UUID.randomUUID();

        assertThat(limiter.acquire(key, START.plusSeconds(15)).retryAfterSeconds())
                .isEqualTo(45);
        assertThat(limiter.acquire(key, START.plusSeconds(59)).retryAfterSeconds())
                .isEqualTo(1);
    }

    @Test
    void newWindowStartsFresh() {
        ApiRateLimiter limiter = new ApiRateLimiter(1);
        UUID key = UUID.randomUUID();
        limiter.acquire(key, START);
        assertThat(limiter.acquire(key, START.plusSeconds(1)).allowed()).isFalse();

        assertThat(limiter.acquire(key, START.plusSeconds(60)).allowed()).isTrue();
        assertThat(limiter.acquire(key, START.plusSeconds(61)).allowed()).isFalse();
    }

    @Test
    void keysAreLimitedIndependently() {
        ApiRateLimiter limiter = new ApiRateLimiter(1);
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        limiter.acquire(a, START);

        assertThat(limiter.acquire(a, START).allowed()).isFalse();
        assertThat(limiter.acquire(b, START).allowed()).isTrue();
    }

    @Test
    void concurrentRequestsNeverExceedTheLimit() throws Exception {
        ApiRateLimiter limiter = new ApiRateLimiter(50);
        UUID key = UUID.randomUUID();
        AtomicInteger allowed = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (int i = 0; i < 400; i++) {
                futures.add(pool.submit(() -> {
                    if (limiter.acquire(key, START).allowed()) {
                        allowed.incrementAndGet();
                    }
                }));
            }
            for (Future<?> future : futures) {
                future.get();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(allowed.get()).isEqualTo(50);
    }
}
