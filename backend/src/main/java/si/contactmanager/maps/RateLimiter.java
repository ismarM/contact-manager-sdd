package si.contactmanager.maps;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongConsumer;
import java.util.function.LongSupplier;

/**
 * Omejevalnik pogostosti z vedrom žetonov (016, research R-08): {@code permits} žetonov na {@code window}, vedro je
 * polno ob začetku (dovoljen je izbruh do {@code permits}). Brez čakanja ({@link #tryAcquire}) ali s čakanjem na žeton
 * do meje ({@link #acquire}). Ob preseganju se zahtevek zavrne, nikoli se ne čaka v neskončnost. Varen za sočasno
 * uporabo; en primerek zaledja (v pomnilniku).
 */
public final class RateLimiter {

    private final long capacity;
    private final double nanosPerToken;
    private final LongSupplier nanoTime;
    private final LongConsumer sleeper;
    private double tokens;
    private long lastRefill;

    public RateLimiter(int permits, Duration window) {
        this(permits, window, System::nanoTime, RateLimiter::sleepNanos);
    }

    RateLimiter(int permits, Duration window, LongSupplier nanoTime, LongConsumer sleeper) {
        if (permits < 1 || window == null || window.isNegative() || window.isZero()) {
            throw new IllegalArgumentException("omejevalnik potrebuje pozitivno število žetonov in okno");
        }
        this.capacity = permits;
        this.nanosPerToken = (double) window.toNanos() / permits;
        this.nanoTime = nanoTime;
        this.sleeper = sleeper;
        this.tokens = permits;
        this.lastRefill = nanoTime.getAsLong();
    }

    /** Vzame žeton, če je prost; sicer {@code false} brez čakanja. */
    public synchronized boolean tryAcquire() {
        refill();
        if (tokens >= 1) {
            tokens -= 1;
            return true;
        }
        return false;
    }

    /**
     * Počaka na žeton največ {@code maxWait}; {@code false}, če bi bilo čakanje daljše (žeton se v tem primeru ne
     * rezervira).
     */
    public boolean acquire(Duration maxWait) {
        long waitNanos;
        synchronized (this) {
            refill();
            if (tokens >= 1) {
                tokens -= 1;
                return true;
            }
            waitNanos = (long) Math.ceil((1 - tokens) * nanosPerToken);
            if (waitNanos > maxWait.toNanos()) {
                return false;
            }
            tokens -= 1; // rezervacija: vedro gre v dolg, ki ga poplača čas
        }
        sleeper.accept(waitNanos);
        return true;
    }

    private void refill() {
        long now = nanoTime.getAsLong();
        long elapsed = now - lastRefill;
        if (elapsed > 0) {
            tokens = Math.min(capacity, tokens + elapsed / nanosPerToken);
            lastRefill = now;
        }
    }

    private static void sleepNanos(long nanos) {
        try {
            Thread.sleep(Duration.ofNanos(nanos));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Omejevalnik na ključ (npr. uporabnika): vsak ključ ima svoje vedro. Neaktivni ključi (vedro spet polno) se
     * odstranijo, ko števec preseže mejo, da pomnilnik ne raste z uporabniki.
     *
     * @param <K> ključ
     */
    public static final class Keyed<K> {

        private static final int PURGE_THRESHOLD = 10_000;

        private final int permits;
        private final Duration window;
        private final LongSupplier nanoTime;
        private final ConcurrentHashMap<K, RateLimiter> limiters = new ConcurrentHashMap<>();

        public Keyed(int permits, Duration window) {
            this(permits, window, System::nanoTime);
        }

        Keyed(int permits, Duration window, LongSupplier nanoTime) {
            new RateLimiter(permits, window); // preveri argumente
            this.permits = permits;
            this.window = window;
            this.nanoTime = nanoTime;
        }

        /** Vzame žeton ključa, če je prost; sicer {@code false}. */
        public boolean tryAcquire(K key) {
            if (limiters.size() > PURGE_THRESHOLD) {
                limiters.values().removeIf(RateLimiter::idle);
            }
            return limiters.computeIfAbsent(
                            key, k -> new RateLimiter(permits, window, nanoTime, RateLimiter::sleepNanos))
                    .tryAcquire();
        }

        /** Število ključev z vedrom (za teste in nadzor pomnilnika). */
        public int size() {
            return limiters.size();
        }
    }

    private synchronized boolean idle() {
        refill();
        return tokens >= capacity;
    }
}
