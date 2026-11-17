package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/** Privzete vrednosti in preglasitev iz okolja za {@code maps.*} (016, FR-016-21, FR-016-23; research R-08). */
@Tag("FR-016-21")
@Tag("FR-016-23")
class MapsPropertiesTest {

    private static MapsProperties bind(Map<String, Object> environment) throws IOException {
        List<PropertySource<?>> yaml =
                new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yaml"));
        MutablePropertySources sources = new MutablePropertySources();
        sources.addFirst(new MapPropertySource("env", new HashMap<>(environment)));
        yaml.forEach(sources::addLast);
        return new Binder(ConfigurationPropertySources.from(sources), new PropertySourcesPlaceholdersResolver(sources))
                .bind("maps", MapsProperties.class)
                .get();
    }

    @Test
    void defaultsMatchTheResearchDecisions() throws IOException {
        MapsProperties maps = bind(Map.of());

        assertThat(maps.enabled()).isTrue();
        assertThat(maps.nominatimUrl()).isEqualTo("https://nominatim.openstreetmap.org");
        assertThat(maps.photonUrl()).isEqualTo("https://photon.komoot.io");
        assertThat(maps.tileUrl()).isEqualTo("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
        assertThat(maps.connectTimeout()).isEqualTo(Duration.ofSeconds(2));
        assertThat(maps.readTimeout()).isEqualTo(Duration.ofMillis(2500));
        assertThat(maps.locations().entries()).isEqualTo(1000);
        assertThat(maps.locations().ttl()).isEqualTo(Duration.ofHours(24));
        assertThat(maps.suggestions().entries()).isEqualTo(2000);
        assertThat(maps.suggestions().ttl()).isEqualTo(Duration.ofHours(1));
        assertThat(maps.tiles().maxCacheBytes()).isEqualTo(50L * 1024 * 1024);
        assertThat(maps.tiles().maxAge()).isEqualTo(Duration.ofDays(7));
        assertThat(maps.limits().nominatimPerSecond()).isEqualTo(1);
        assertThat(maps.limits().maxWait()).isEqualTo(Duration.ofSeconds(1));
        assertThat(maps.limits().photonPerSecond()).isEqualTo(5);
        assertThat(maps.limits().photonPerUserPerSecond()).isEqualTo(2);
        assertThat(maps.limits().tilesPerUserPerWindow()).isEqualTo(60);
        assertThat(maps.limits().tilesWindow()).isEqualTo(Duration.ofSeconds(10));
        assertThat(maps.limits().tilesPerSecond()).isEqualTo(20);
    }

    @Test
    void userAgentCarriesNoPersonalData() throws IOException {
        String userAgent = bind(Map.of()).userAgent();

        assertThat(userAgent).startsWith("ContactManager/").doesNotContain("@");
    }

    @Test
    void urlsAndSwitchAreOverridableFromTheEnvironment() throws IOException {
        MapsProperties maps = bind(Map.of(
                "MAPS_NOMINATIM_URL", "http://localhost:9001",
                "MAPS_PHOTON_URL", "http://localhost:9002",
                "MAPS_TILE_URL", "http://localhost:9003/{z}/{x}/{y}.png",
                "MAPS_ENABLED", "false"));

        assertThat(maps.nominatimUrl()).isEqualTo("http://localhost:9001");
        assertThat(maps.photonUrl()).isEqualTo("http://localhost:9002");
        assertThat(maps.tileUrl()).isEqualTo("http://localhost:9003/{z}/{x}/{y}.png");
        assertThat(maps.enabled()).isFalse();
    }

    @Test
    void invalidLimitsAreRejected() {
        assertThatThrownBy(
                        () -> new MapsProperties.Limits(0, Duration.ofSeconds(1), 5, 2, 60, Duration.ofSeconds(10), 20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MapsProperties.Cache(0, Duration.ofHours(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MapsProperties.Tiles(1, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
