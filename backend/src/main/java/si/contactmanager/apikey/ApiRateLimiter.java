package si.contactmanager.apikey;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Omejitev zahtev na API ključ (019, FR-019-16, research R-05): fiksno okno 60 s na {@code jti}, v pomnilniku (ena
 * instanca). Okna so poravnana na epoho; pretekla okna se čistijo ob prehodu v novo okno.
 */
class ApiRateLimiter {

    private static final long WINDOW_SECONDS = Duration.ofSeconds(60).toSeconds();

    /** Izid preverjanja: ali je zahteva dovoljena in koliko sekund do novega okna (vsaj 1). */
    record Decision(boolean allowed, long retryAfterSeconds) {}

    private static final class Window {
        final long index;
        final AtomicInteger count = new AtomicInteger();

        Window(long index) {
            this.index = index;
        }
    }

    private final int limit;
    private final ConcurrentHashMap<UUID, Window> windows = new ConcurrentHashMap<>();
    private long sweptIndex = Long.MIN_VALUE;

    ApiRateLimiter(int limit) {
        this.limit = limit;
    }

    Decision acquire(UUID keyId, Instant now) {
        long index = Math.floorDiv(now.getEpochSecond(), WINDOW_SECONDS);
        sweep(index);
        Window window = windows.compute(
                keyId, (id, current) -> current == null || current.index != index ? new Window(index) : current);
        boolean allowed = window.count.incrementAndGet() <= limit;
        long retryAfter = Math.max(1, (index + 1) * WINDOW_SECONDS - now.getEpochSecond());
        return new Decision(allowed, retryAfter);
    }

    private synchronized void sweep(long index) {
        if (index == sweptIndex) {
            return;
        }
        sweptIndex = index;
        windows.values().removeIf(window -> window.index != index);
    }
}
