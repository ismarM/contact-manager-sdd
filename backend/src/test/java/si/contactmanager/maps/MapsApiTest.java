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
