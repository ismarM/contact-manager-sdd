package si.contactmanager.maps;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Nastavitve kartografskega posrednika (016, research R-08; vrednosti v {@code application.yaml}). Vse so nastavljive
 * iz okolja; {@code enabled=false} izklopi vse zunanje klice (lokacija in ploščice 503, predlogi prazni).
 *
 * @param nominatimUrl osnovni naslov Nominatim (iskanje lokacije)
 * @param photonUrl osnovni naslov Photon (samodokončanje)
 * @param tileUrl predloga ploščic z {@code {z}}, {@code {x}}, {@code {y}}
 * @param userAgent glava {@code User-Agent} zahtev OSM (brez osebnih podatkov)
 */
@ConfigurationProperties("maps")
public record MapsProperties(
        boolean enabled,
        String nominatimUrl,
        String photonUrl,
        String tileUrl,
        String userAgent,
        Duration connectTimeout,
        Duration readTimeout,
        Cache locations,
        Cache suggestions,
        Tiles tiles,
        Limits limits) {

    /** Predpomnilnik z omejitvijo števila vnosov in življenjsko dobo. */
    public record Cache(int entries, Duration ttl) {

        public Cache {
            if (entries < 1 || ttl == null || ttl.isNegative() || ttl.isZero()) {
                throw new IllegalArgumentException("maps cache needs entries >= 1 and a positive ttl");
            }
        }
    }

    /** Predpomnilnik ploščic: skupna velikost v bajtih in zgornja meja {@code max-age}. */
    public record Tiles(long maxCacheBytes, Duration maxAge) {

        public Tiles {
            if (maxCacheBytes < 1 || maxAge == null || maxAge.isNegative() || maxAge.isZero()) {
                throw new IllegalArgumentException("maps.tiles needs max-cache-bytes >= 1 and a positive max-age");
            }
        }
    }

    /** Omejitve pogostosti (en primerek zaledja, v pomnilniku). */
    public record Limits(
            int nominatimPerSecond,
            Duration maxWait,
            int photonPerSecond,
            int photonPerUserPerSecond,
            int tilesPerUserPerWindow,
            Duration tilesWindow,
            int tilesPerSecond) {

        public Limits {
            if (nominatimPerSecond < 1
                    || photonPerSecond < 1
                    || photonPerUserPerSecond < 1
                    || tilesPerUserPerWindow < 1
                    || tilesPerSecond < 1
                    || maxWait == null
                    || maxWait.isNegative()
                    || tilesWindow == null
                    || tilesWindow.isNegative()
                    || tilesWindow.isZero()) {
                throw new IllegalArgumentException("maps.limits needs positive rates and windows");
            }
        }
    }

    public MapsProperties {
        if (connectTimeout == null || readTimeout == null || connectTimeout.isNegative() || readTimeout.isNegative()) {
            throw new IllegalArgumentException("maps timeouts must be set and not negative");
        }
        if (userAgent == null || userAgent.isBlank()) {
            throw new IllegalArgumentException("maps.user-agent must be set");
        }
    }
}
