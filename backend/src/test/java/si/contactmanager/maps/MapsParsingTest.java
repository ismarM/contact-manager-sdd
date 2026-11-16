package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Natančnost zadetka Nominatim, veljavnost ploščic in {@code max-age} (016, FR-016-21, FR-016-22; research R-08). */
class MapsParsingTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static AddressLocation parse(String body) {
        return NominatimClient.parse(JSON.readTree(body));
    }

    @Test
    void houseNumberWithRankAtLeast26IsExactOtherwiseApproximateAndNoHitIsNotFound() {
        assertThat(
                        parse(
                                "[{\"lat\":\"46.05\",\"lon\":\"14.5\",\"place_rank\":30,\"address\":{\"house_number\":\"1\"}}]"))
                .isEqualTo(new AddressLocation(AddressLocation.Status.EXACT, 46.05, 14.5));
        assertThat(parse(
                                "[{\"lat\":\"46.05\",\"lon\":\"14.5\",\"place_rank\":26,\"address\":{\"house_number\":\"1a\"}}]")
                        .status())
                .isEqualTo(AddressLocation.Status.EXACT);
        assertThat(parse(
                                "[{\"lat\":\"46.05\",\"lon\":\"14.5\",\"place_rank\":25,\"address\":{\"house_number\":\"1\"}}]")
                        .status())
                .isEqualTo(AddressLocation.Status.APPROXIMATE);
        assertThat(parse("[{\"lat\":46.05,\"lon\":14.5,\"place_rank\":30,\"address\":{\"road\":\"Cesta\"}}]"))
                .isEqualTo(new AddressLocation(AddressLocation.Status.APPROXIMATE, 46.05, 14.5));
        assertThat(parse("[{\"lat\":\"46.05\",\"lon\":\"14.5\"}]").status())
                .isEqualTo(AddressLocation.Status.APPROXIMATE);
        assertThat(parse("[]")).isEqualTo(new AddressLocation(AddressLocation.Status.NOT_FOUND, null, null));
    }

    @Test
    void invalidBodiesAreRejected() {
        assertThatThrownBy(() -> parse("{}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parse("[{\"lon\":\"14\"}]")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parse("[{\"lat\":\"x\",\"lon\":\"14\"}]"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parse("[{\"lat\":\"91\",\"lon\":\"14\"}]"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parse("[{\"lat\":\"46\",\"lon\":\"181\"}]"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void tileCoordinatesMustLieInsideTheZoomLevel() {
        assertThat(TileClient.valid(0, 0, 0)).isTrue();
        assertThat(TileClient.valid(19, (1 << 19) - 1, (1 << 19) - 1)).isTrue();
        assertThat(TileClient.valid(20, 0, 0)).isFalse();
        assertThat(TileClient.valid(-1, 0, 0)).isFalse();
        assertThat(TileClient.valid(2, 4, 0)).isFalse();
        assertThat(TileClient.valid(2, 0, 4)).isFalse();
        assertThat(TileClient.valid(2, -1, 0)).isFalse();
    }

    @Test
    void upstreamMaxAgeIsCappedAndMissingMeansTheCap() {
        MapsProperties properties = new MapsProperties(
                true,
                "http://127.0.0.1:1",
                "http://127.0.0.1:1",
                "http://127.0.0.1:1/{z}/{x}/{y}.png",
                "Test/1.0",
                Duration.ofSeconds(1),
                Duration.ofSeconds(1),
                new MapsProperties.Cache(10, Duration.ofHours(1)),
                new MapsProperties.Cache(10, Duration.ofHours(1)),
                new MapsProperties.Tiles(1000, Duration.ofDays(7)),
                new MapsProperties.Limits(1, Duration.ofSeconds(1), 1, 1, 60, Duration.ofSeconds(10), 20));
        TileClient client = new TileClient(properties);

        assertThat(client.ttl("public, max-age=3600")).isEqualTo(Duration.ofHours(1));
        assertThat(client.ttl("max-age=99999999")).isEqualTo(Duration.ofDays(7));
        assertThat(client.ttl(null)).isEqualTo(Duration.ofDays(7));
        assertThat(client.ttl("no-cache")).isEqualTo(Duration.ofDays(7));
        assertThat(client.ttl("max-age=0")).isEqualTo(Duration.ofSeconds(1));
    }
}
