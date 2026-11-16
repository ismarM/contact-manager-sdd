package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Nadomestni strežnik OSM za teste (016): beleži zahteve, šteje klice, zakasni in zamenja odgovore. */
@Tag("FR-016-21")
class MapsFakeServerTest {

    private final MapsFakeServer server = new MapsFakeServer();
    private final HttpClient client = HttpClient.newHttpClient();

    @AfterEach
    void stop() {
        server.close();
    }

    private HttpResponse<String> get(String pathAndQuery, String... headers) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(server.url() + pathAndQuery));
        if (headers.length > 0) {
            builder.headers(headers);
        }
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void recordsPathQueryAndHeadersAndCountsCalls() throws Exception {
        server.respond(MapsFakeServer.Response.json("[]"));

        HttpResponse<String> response = get("/search?q=Cesta%201&format=jsonv2", "User-Agent", "ContactManager/1.0");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("[]");
        assertThat(server.count()).isEqualTo(1);
        assertThat(server.count("/search")).isEqualTo(1);
        assertThat(server.count("/api")).isZero();
        MapsFakeServer.Request request = server.requests().get(0);
        assertThat(request.path()).isEqualTo("/search");
        assertThat(request.query()).isEqualTo("q=Cesta%201&format=jsonv2");
        assertThat(request.headers()).containsEntry("user-agent", "ContactManager/1.0");
    }

    @Test
    void defaultsTo404AndResetForgetsRequestsAndResponses() throws Exception {
        assertThat(get("/x").statusCode()).isEqualTo(404);
        server.respond(MapsFakeServer.Response.status(503));
        assertThat(get("/x").statusCode()).isEqualTo(503);

        server.reset();

        assertThat(server.count()).isZero();
        assertThat(get("/x").statusCode()).isEqualTo(404);
    }

    @Test
    void handlerChoosesTheResponsePerRequestAndCanDelay() throws Exception {
        server.handler(request -> request.path().equals("/slow")
                ? MapsFakeServer.Response.json("{}").delayed(Duration.ofMillis(300))
                : MapsFakeServer.Response.png(new byte[] {1, 2, 3}));

        long start = System.nanoTime();
        assertThat(get("/slow").statusCode()).isEqualTo(200);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isGreaterThanOrEqualTo(Duration.ofMillis(250));
        HttpResponse<byte[]> tile = client.send(
                HttpRequest.newBuilder(URI.create(server.url() + "/t.png")).build(),
                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(tile.headers().firstValue("content-type")).contains("image/png");
        assertThat(tile.body()).containsExactly(1, 2, 3);
    }
}
