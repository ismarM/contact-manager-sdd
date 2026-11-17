package si.contactmanager.maps;

import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.LongSupplier;
import java.util.function.ToLongFunction;

/**
 * Omejen predpomnilnik v pomnilniku (016, research R-08): LRU z zgornjo mejo števila vnosov in skupne teže (npr. bajtov
 * ploščic) ter življenjsko dobo vnosa. Nič ni trajno; ob zagonu je prazen. Varen za sočasno uporabo.
 *
 * @param <K> ključ
 * @param <V> vrednost
 */
public final class BoundedCache<K, V> {

    private record Entry<V>(V value, long weight, long expiresAtNanos) {}

    private final int maxEntries;
    private final long maxWeight;
    private final ToLongFunction<V> weigher;
    private final Duration defaultTtl;
    private final LongSupplier nanoTime;
    private final LinkedHashMap<K, Entry<V>> entries = new LinkedHashMap<>(16, 0.75f, true);
    private long weight;

    /**
     * @param maxEntries največ vnosov
     * @param maxWeight največja skupna teža (po {@code weigher}); {@link Long#MAX_VALUE} = brez omejitve
     * @param weigher teža vrednosti; {@code null} = vsaka 1
     * @param ttl privzeta življenjska doba vnosa
     * @param nanoTime vir časa (testi uporabijo lažnega)
     */
    public BoundedCache(
            int maxEntries, long maxWeight, ToLongFunction<V> weigher, Duration ttl, LongSupplier nanoTime) {
        if (maxEntries < 1 || maxWeight < 1 || ttl == null || ttl.isNegative() || ttl.isZero()) {
            throw new IllegalArgumentException("predpomnilnik potrebuje pozitivne meje in življenjsko dobo");
        }
        this.maxEntries = maxEntries;
        this.maxWeight = maxWeight;
        this.weigher = weigher == null ? value -> 1 : weigher;
        this.defaultTtl = ttl;
        this.nanoTime = nanoTime;
    }

    /** Predpomnilnik samo s številom vnosov in življenjsko dobo. */
    public BoundedCache(int maxEntries, Duration ttl) {
        this(maxEntries, Long.MAX_VALUE, null, ttl, System::nanoTime);
    }

    /** Veljaven vnos (osveži vrstni red LRU) ali prazno; potekel vnos se odstrani. */
    public synchronized Optional<V> get(K key) {
        Entry<V> entry = entries.get(key);
        if (entry == null) {
            return Optional.empty();
        }
        if (nanoTime.getAsLong() - entry.expiresAtNanos() >= 0) {
            entries.remove(key);
            weight -= entry.weight();
            return Optional.empty();
        }
        return Optional.of(entry.value());
    }

    /** Shrani vrednost s privzeto življenjsko dobo. */
    public void put(K key, V value) {
        put(key, value, defaultTtl);
    }

    /**
     * Shrani vrednost z lastno življenjsko dobo (npr. {@code max-age} odgovora OSM, ne daljšo od privzete). Vrednost,
     * težja od meje, se ne shrani; sicer se po potrebi izrinejo najdlje neuporabljeni vnosi.
     */
    public synchronized void put(K key, V value, Duration ttl) {
        Duration effective = ttl.compareTo(defaultTtl) > 0 ? defaultTtl : ttl;
        long itemWeight = weigher.applyAsLong(value);
        Entry<V> old = entries.remove(key);
        if (old != null) {
            weight -= old.weight();
        }
        if (itemWeight > maxWeight || effective.isNegative() || effective.isZero()) {
            return;
        }
        entries.put(key, new Entry<>(value, itemWeight, nanoTime.getAsLong() + effective.toNanos()));
        weight += itemWeight;
        evict();
    }

    private void evict() {
        long now = nanoTime.getAsLong();
        Iterator<Map.Entry<K, Entry<V>>> iterator = entries.entrySet().iterator();
        while (iterator.hasNext() && (entries.size() > maxEntries || weight > maxWeight)) {
            Map.Entry<K, Entry<V>> eldest = iterator.next();
            weight -= eldest.getValue().weight();
            iterator.remove();
        }
        // Potekli vnosi ne smejo ostati v pomnilniku neomejeno dolgo: ob vsakem vnosu se pobere pregledan del.
        if (entries.size() > maxEntries / 2) {
            entries.values().removeIf(entry -> {
                boolean expired = now - entry.expiresAtNanos() >= 0;
                if (expired) {
                    weight -= entry.weight();
                }
                return expired;
            });
        }
    }

    public synchronized int size() {
        return entries.size();
    }

    /** Skupna teža vnosov (po {@code weigher}). */
    public synchronized long weight() {
        return weight;
    }

    public synchronized void clear() {
        entries.clear();
        weight = 0;
    }
}
