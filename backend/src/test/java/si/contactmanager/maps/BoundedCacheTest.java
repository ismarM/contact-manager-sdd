package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Omejen predpomnilnik (016, FR-016-22; research R-08): LRU, življenjska doba, meja teže, brez trajnosti. */
@Tag("FR-016-22")
class BoundedCacheTest {

    private final AtomicLong now = new AtomicLong();

    private BoundedCache<String, String> cache(int entries, Duration ttl) {
        return new BoundedCache<>(entries, Long.MAX_VALUE, null, ttl, now::get);
    }

    @Test
    void returnsWhatWasStoredUntilTheEntryExpires() {
        BoundedCache<String, String> cache = cache(10, Duration.ofHours(1));
        cache.put("a", "1");

        assertThat(cache.get("a")).contains("1");
        now.addAndGet(Duration.ofMinutes(59).toNanos());
        assertThat(cache.get("a")).contains("1");
        now.addAndGet(Duration.ofMinutes(1).toNanos());
        assertThat(cache.get("a")).isEmpty();
        assertThat(cache.size()).isZero();
    }

    @Test
    void evictsTheLeastRecentlyUsedEntryOverTheEntryLimit() {
        BoundedCache<String, String> cache = cache(2, Duration.ofHours(1));
        cache.put("a", "1");
        cache.put("b", "2");
        assertThat(cache.get("a")).contains("1");

        cache.put("c", "3");

        assertThat(cache.get("b")).isEmpty();
        assertThat(cache.get("a")).contains("1");
        assertThat(cache.get("c")).contains("3");
        assertThat(cache.size()).isEqualTo(2);
    }

    @Test
    void weightLimitEvictsOldestEntriesAndRejectsTooHeavyValues() {
        BoundedCache<String, byte[]> cache =
                new BoundedCache<>(100, 10, value -> value.length, Duration.ofHours(1), now::get);
        cache.put("a", new byte[4]);
        cache.put("b", new byte[4]);
        cache.put("c", new byte[4]);

        assertThat(cache.get("a")).isEmpty();
        assertThat(cache.weight()).isEqualTo(8);

        cache.put("huge", new byte[11]);

        assertThat(cache.get("huge")).isEmpty();
        assertThat(cache.weight()).isEqualTo(8);
    }

    @Test
    void replacingAKeyAdjustsTheWeight() {
        BoundedCache<String, byte[]> cache =
                new BoundedCache<>(100, 100, value -> value.length, Duration.ofHours(1), now::get);
        cache.put("a", new byte[40]);
        cache.put("a", new byte[10]);

        assertThat(cache.weight()).isEqualTo(10);
        assertThat(cache.size()).isEqualTo(1);
    }

    @Test
    void perEntryTtlIsCappedByTheDefault() {
        BoundedCache<String, String> cache = cache(10, Duration.ofHours(1));
        cache.put("short", "1", Duration.ofMinutes(1));
        cache.put("long", "2", Duration.ofDays(30));

        now.addAndGet(Duration.ofMinutes(2).toNanos());
        assertThat(cache.get("short")).isEmpty();
        assertThat(cache.get("long")).contains("2");
        now.addAndGet(Duration.ofHours(1).toNanos());
        assertThat(cache.get("long")).isEmpty();
    }

    @Test
    void anEntryWithoutPositiveTtlIsNotStored() {
        BoundedCache<String, String> cache = cache(10, Duration.ofHours(1));

        cache.put("a", "1", Duration.ZERO);

        assertThat(cache.get("a")).isEmpty();
    }

    @Test
    void expiredEntriesAreSweptOnInsertSoMemoryDoesNotGrow() {
        BoundedCache<String, String> cache = cache(10, Duration.ofMinutes(1));
        for (int i = 0; i < 6; i++) {
            cache.put("k" + i, "v");
        }
        now.addAndGet(Duration.ofMinutes(2).toNanos());

        cache.put("fresh", "v");

        assertThat(cache.size()).isEqualTo(1);
        assertThat(cache.get("fresh")).contains("v");
    }

    @Test
    void clearEmptiesTheCacheAndRejectsInvalidLimits() {
        BoundedCache<String, String> cache = cache(10, Duration.ofHours(1));
        cache.put("a", "1");
        cache.clear();

        assertThat(cache.size()).isZero();
        assertThat(cache.weight()).isZero();
        assertThatThrownBy(() -> new BoundedCache<String, String>(0, Duration.ofHours(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BoundedCache<String, String>(1, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
