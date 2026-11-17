package si.contactmanager.image;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.error.RateLimitedException;

/**
 * Drsno okno nalaganj na uporabnika (research R-09): največ {@code limit} poskusov na minuto, vključno z neuspelimi in
 * z Google prevzemom. Stanje je v pomnilniku enega primerka (pri več primerkih bi bila potrebna skupna shramba).
 */
@Component
class UploadRateLimiter {

    private static final long WINDOW_MILLIS = 60_000L;

    private final int limit;
    private final Clock clock;
    private final ConcurrentMap<String, Deque<Long>> attempts = new ConcurrentHashMap<>();

    @Autowired
    UploadRateLimiter(ImageProperties properties) {
        this(properties.uploadPerMinute(), Clock.systemUTC());
    }

    UploadRateLimiter(int limit, Clock clock) {
        this.limit = limit;
        this.clock = clock;
    }

    /** Zabeleži poskus; {@link RateLimitedException}, če je okno polno (poskus se tedaj ne šteje). */
    void check(String key) {
        long now = clock.millis();
        boolean[] allowed = new boolean[1];
        attempts.compute(key, (k, window) -> {
            Deque<Long> times = window == null ? new ArrayDeque<>() : window;
            while (!times.isEmpty() && now - times.peekFirst() >= WINDOW_MILLIS) {
                times.pollFirst();
            }
            if (times.size() < limit) {
                times.addLast(now);
                allowed[0] = true;
            }
            return times.isEmpty() ? null : times;
        });
        if (!allowed[0]) {
            throw new RateLimitedException();
        }
    }
}
