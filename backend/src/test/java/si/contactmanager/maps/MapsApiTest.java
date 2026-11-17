package si.contactmanager.maps;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import si.contactmanager.contact.support.ContactApiTest;
import tools.jackson.databind.json.JsonMapper;

/**
 * Osnova testov kartografskega posrednika (016): zaledje kliče skupni {@link MapsFakeServer} namesto OSM (noben test
 * ne kliče pravega OSM), krajša časovna omejitev branja in sproščena globalna omejitev, da zaporedni testi ne tekmujejo;
 * omejitev na uporabnika ostane privzeta (2/s). Podrazredi si delijo isti kontekst Spring.
 */
public abstract class MapsApiTest extends ContactApiTest {

    protected static final MapsFakeServer FAKE = new MapsFakeServer();

    @DynamicPropertySource
    static void maps(DynamicPropertyRegistry registry) {
        registry.add("maps.photon-url", FAKE::url);
        registry.add("maps.nominatim-url", FAKE::url);
        registry.add("maps.tile-url", () -> FAKE.url() + "/tiles/{z}/{x}/{y}.png");
        registry.add("maps.read-timeout", () -> "600ms");
        registry.add("maps.limits.photon-per-second", () -> "100");
        registry.add("maps.limits.nominatim-per-second", () -> "100");
        registry.add("maps.limits.tiles-per-second", () -> "1000");
    }

    /** Najmanjša veljavna slika PNG (podpis in IHDR 1 × 1) za odgovore ploščic. */
    protected static final byte[] PNG = {
        (byte) 0x89,
        'P',
        'N',
        'G',
        0x0D,
        0x0A,
        0x1A,
        0x0A,
        0,
        0,
        0,
        0x0D,
        'I',
        'H',
        'D',
        'R',
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        8,
        6,
        0,
        0,
        0
    };

    /** Odgovor Nominatim {@code jsonv2} z enim zadetkom ({@code houseNumber == null}: brez hišne številke). */
    protected static MapsFakeServer.Response nominatim(double lat, double lon, int placeRank, String houseNumber) {
        Map<String, Object> address = houseNumber == null
                ? Map.of("city", "Ljubljana")
                : Map.of("house_number", houseNumber, "city", "Ljubljana");
        return MapsFakeServer.Response.json(JsonMapper.builder()
                .build()
                .writeValueAsString(List.of(Map.of(
                        "lat",
                        Double.toString(lat),
                        "lon",
                        Double.toString(lon),
                        "place_rank",
                        placeRank,
                        "address",
                        address))));
    }

    /** Odgovor Nominatim brez zadetka. */
    protected static MapsFakeServer.Response nominatimEmpty() {
        return MapsFakeServer.Response.json("[]");
    }

    /** Odgovor strežnika ploščic z danim {@code Cache-Control}. */
    protected static MapsFakeServer.Response tile(String cacheControl) {
        return MapsFakeServer.Response.png(PNG).withHeader("Cache-Control", cacheControl);
    }

    /** Naključna veljavna ploščica pri povečavi 19 (predpomnilnik je skupen vsem testom konteksta). */
    protected static String randomTile() {
        java.util.concurrent.ThreadLocalRandom random = java.util.concurrent.ThreadLocalRandom.current();
        return "19/" + random.nextInt(1 << 19) + "/" + random.nextInt(1 << 19);
    }

    @BeforeEach
    void resetFake() {
        FAKE.reset();
    }

    /** Zadetek Photon (GeoJSON {@code Feature}) z danimi lastnostmi. */
    protected static Map<String, Object> feature(Map<String, Object> properties) {
        return Map.of(
                "type",
                "Feature",
                "geometry",
                Map.of("type", "Point", "coordinates", List.of(14.5, 46.05)),
                "properties",
                properties);
    }

    /** Odgovor Photon z zadetki. */
    protected static MapsFakeServer.Response photon(List<Map<String, Object>> features) {
        return MapsFakeServer.Response.json(JsonMapper.builder()
                .build()
                .writeValueAsString(Map.of("type", "FeatureCollection", "features", new ArrayList<>(features))));
    }
}
