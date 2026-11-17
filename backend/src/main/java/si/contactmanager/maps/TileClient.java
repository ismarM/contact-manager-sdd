package si.contactmanager.maps;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.error.MapServiceUnavailableException;

/**
 * Ploščice podlage zemljevida prek našega strežnika (016, FR-016-21, FR-016-23; research R-08, R-09): brskalnik nikoli
 * ne kliče strežnika ploščic. Storitev prejme samo koordinate ploščice (brez podatkov uporabnika, piškotkov in {@code
 * Referer}). Predpomnilnik v pomnilniku do {@code maxCacheBytes}, življenjska doba po {@code max-age} storitve (največ
 * {@code tiles.maxAge}); omejitev na uporabnika (vsaka zahteva) in globalno (samo klici storitve). Napaka, časovna
 * omejitev, omejitev ali izklop → {@link MapServiceUnavailableException}.
 */
@Component
public class TileClient {

    private static final Logger LOG = LoggerFactory.getLogger(TileClient.class);

    /** Največja povečava ploščic OSM. */
    static final int MAX_ZOOM = 19;

    /** Ploščica PNG največ 1 MB; večji odgovor ni ploščica. */
    private static final int MAX_TILE_BYTES = 1 << 20;

    private static final Pattern MAX_AGE = Pattern.compile("max-age\\s*=\\s*(\\d+)");

    /** Ploščica in trenutek, ko poteče v predpomnilniku (za {@code Cache-Control} odgovora). */
    public record Tile(byte[] body, long expiresAtMillis) {

        /** Preostala življenjska doba v sekundah (vsaj 0). */
        public long maxAgeSeconds(long nowMillis) {
            return Math.max(0, (expiresAtMillis - nowMillis) / 1000);
        }
    }

    private final MapsProperties properties;
    private final HttpClient http;
    private final BoundedCache<String, Tile> cache;
    private final RateLimiter global;
    private final RateLimiter.Keyed<String> perUser;

    @Autowired
    public TileClient(MapsProperties properties) {
        this(
                properties,
                HttpClient.newBuilder()
                        .connectTimeout(properties.connectTimeout())
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    TileClient(MapsProperties properties, HttpClient http) {
        this.properties = properties;
        this.http = http;
        this.cache = new BoundedCache<>(
                100_000,
                properties.tiles().maxCacheBytes(),
                tile -> tile.body().length,
                properties.tiles().maxAge(),
                System::nanoTime);
        this.global = new RateLimiter(properties.limits().tilesPerSecond(), Duration.ofSeconds(1));
        this.perUser = new RateLimiter.Keyed<>(
                properties.limits().tilesPerUserPerWindow(), properties.limits().tilesWindow());
    }

    /** Ali so koordinate veljavne ploščice: {@code 0 ≤ z ≤ 19}, {@code 0 ≤ x, y < 2^z}. */
    static boolean valid(int z, int x, int y) {
        if (z < 0 || z > MAX_ZOOM) {
            return false;
        }
        int size = 1 << z;
        return x >= 0 && x < size && y >= 0 && y < size;
    }

    /** Ploščica {@code z/x/y} (že preverjena) za uporabnika {@code user}. */
    public Tile tile(String user, int z, int x, int y) {
        if (!properties.enabled() || !perUser.tryAcquire(user)) {
            throw new MapServiceUnavailableException();
        }
        String key = z + "/" + x + "/" + y;
        Optional<Tile> cached = cache.get(key);
        if (cached.isPresent()) {
            return cached.get();
        }
        if (!global.tryAcquire()) {
            throw new MapServiceUnavailableException();
        }
        HttpResponse<byte[]> response = fetch(z, x, y);
        byte[] body = response.body();
        String type = response.headers().firstValue("Content-Type").orElse("");
        if (body == null || body.length == 0 || body.length > MAX_TILE_BYTES || !type.startsWith("image/png")) {
            LOG.warn("Ploščice: neveljaven odgovor storitve");
            throw new MapServiceUnavailableException();
        }
        Duration ttl = ttl(response.headers().firstValue("Cache-Control").orElse(null));
        Tile tile = new Tile(body, System.currentTimeMillis() + ttl.toMillis());
        cache.put(key, tile, ttl);
        return tile;
    }

    /** {@code max-age} storitve, omejen na {@code tiles.maxAge}; brez njega največja dovoljena doba. */
    Duration ttl(String cacheControl) {
        Duration max = properties.tiles().maxAge();
        if (cacheControl == null) {
            return max;
        }
        Matcher m = MAX_AGE.matcher(cacheControl);
        if (!m.find()) {
            return max;
        }
        try {
            Duration age = Duration.ofSeconds(Long.parseLong(m.group(1)));
            return age.isZero() ? Duration.ofSeconds(1) : age.compareTo(max) > 0 ? max : age;
        } catch (NumberFormatException e) {
            return max;
        }
    }

    private HttpResponse<byte[]> fetch(int z, int x, int y) {
        URI uri = URI.create(properties
                .tileUrl()
                .replace("{z}", Integer.toString(z))
                .replace("{x}", Integer.toString(x))
                .replace("{y}", Integer.toString(y)));
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(properties.readTimeout())
                .header("User-Agent", properties.userAgent())
                .header("Accept", "image/png")
                .GET()
                .build();
        try {
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                LOG.warn("Ploščice: storitev je vrnila stanje {}", response.statusCode());
                throw new MapServiceUnavailableException();
            }
            return response;
        } catch (IOException e) {
            LOG.warn("Ploščice: storitev ni dosegljiva ({})", e.getClass().getSimpleName());
            throw new MapServiceUnavailableException();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MapServiceUnavailableException();
        }
    }
}
