package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.shared.error.GooglePhotoUnavailableException;

/**
 * Prevzem slike Google računa (FR-018-20, FR-018-23) proti lokalnemu strežniku (brez omrežja): uspeh, preusmeritev,
 * prevelik odgovor, ne-slika, napaka strežnika, počasen odgovor in zavrnitev naslova. Razreševanje je nadomeščeno z
 * javnim naslovom, zato zaščita preveri samo obliko naslova; povezava gre na pravi {@code localhost}.
 */
@Tag("FR-018-23")
class GooglePhotoSourceTest {

    private static final long MAX_BYTES = 50_000;
    private static HttpServer server;
    private static final List<String> REQUESTED = new CopyOnWriteArrayList<>();

    @BeforeAll
    static void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/ok", exchange -> {
            REQUESTED.add(exchange.getRequestURI().toString());
            respond(exchange, 200, "image/jpeg", TestImages.jpeg(64, 64));
        });
        server.createContext(
                "/png", exchange -> respond(exchange, 200, "image/png; charset=binary", TestImages.png(64, 64)));
        server.createContext("/redirect", exchange -> {
            exchange.getResponseHeaders().add("Location", "http://localhost:" + port() + "/ok");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/big", exchange -> respond(exchange, 200, "image/jpeg", new byte[(int) MAX_BYTES + 10]));
        server.createContext("/html", exchange -> respond(exchange, 200, "text/html", "<html></html>".getBytes()));
        server.createContext("/svg", exchange -> respond(exchange, 200, "image/svg+xml", "<svg/>".getBytes()));
        server.createContext("/gone", exchange -> respond(exchange, 404, "image/jpeg", new byte[0]));
        server.createContext("/slow", exchange -> {
            try {
                Thread.sleep(3_000);
                respond(exchange, 200, "image/jpeg", TestImages.jpeg(64, 64));
            } catch (InterruptedException | IOException e) {
                Thread.currentThread().interrupt();
            }
        });
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
    }

    @AfterAll
    static void stopServer() {
        server.stop(0);
    }

    private static int port() {
        return server.getAddress().getPort();
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String type, byte[] body)
            throws IOException {
        exchange.getResponseHeaders().add("Content-Type", type);
        exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        }
        exchange.close();
    }

    private static GooglePhotoSource source(Duration total) {
        UrlGuard guard =
                new UrlGuard(List.of("^localhost$"), host -> List.of(address("142.250.74.33")), "http", port());
        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        return new GooglePhotoSource(guard, client, MAX_BYTES, total);
    }

    private static InetAddress address(String literal) {
        try {
            return InetAddress.getByName(literal);
        } catch (java.net.UnknownHostException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String url(String path) {
        return "http://localhost:" + port() + path;
    }

    @Test
    void goodJpegAndPngAreReturnedAsBytes() {
        GooglePhotoSource source = source(Duration.ofSeconds(5));

        assertThat(source.fetch(url("/ok"))).isEqualTo(TestImages.jpeg(64, 64));
        assertThat(source.fetch(url("/png"))).isEqualTo(TestImages.png(64, 64));
    }

    @Test
    void sizeSuffixIsReplacedWith512() {
        REQUESTED.clear();

        source(Duration.ofSeconds(5)).fetch(url("/ok=s96-c"));

        assertThat(REQUESTED).containsExactly("/ok=s512-c");
    }

    @Test
    void redirectIsNotFollowed() {
        REQUESTED.clear();

        assertThatThrownBy(() -> source(Duration.ofSeconds(5)).fetch(url("/redirect")))
                .isInstanceOf(GooglePhotoUnavailableException.class);
        assertThat(REQUESTED).isEmpty();
    }

    @Test
    void oversizedResponseIsRejected() {
        assertThatThrownBy(() -> source(Duration.ofSeconds(5)).fetch(url("/big")))
                .isInstanceOf(GooglePhotoUnavailableException.class);
    }

    @Test
    void nonImageContentAndErrorStatusAreRejected() {
        GooglePhotoSource source = source(Duration.ofSeconds(5));

        assertThatThrownBy(() -> source.fetch(url("/html"))).isInstanceOf(GooglePhotoUnavailableException.class);
        assertThatThrownBy(() -> source.fetch(url("/svg"))).isInstanceOf(GooglePhotoUnavailableException.class);
        assertThatThrownBy(() -> source.fetch(url("/gone"))).isInstanceOf(GooglePhotoUnavailableException.class);
    }

    @Test
    void slowResponseIsCutOffAtTheTimeLimit() {
        long start = System.nanoTime();

        assertThatThrownBy(() -> source(Duration.ofMillis(600)).fetch(url("/slow")))
                .isInstanceOf(GooglePhotoUnavailableException.class);

        assertThat((System.nanoTime() - start) / 1_000_000).isLessThan(2_500);
    }

    @Test
    void guardRejectionAndMissingPictureAreUnavailableWithoutAnyRequest() {
        REQUESTED.clear();
        GooglePhotoSource source = source(Duration.ofSeconds(5));

        assertThatThrownBy(() -> source.fetch(null)).isInstanceOf(GooglePhotoUnavailableException.class);
        assertThatThrownBy(() -> source.fetch("http://localhost:" + (port() + 1) + "/ok"))
                .isInstanceOf(GooglePhotoUnavailableException.class);
        assertThatThrownBy(() -> source.fetch("http://evil.example:" + port() + "/ok"))
                .isInstanceOf(GooglePhotoUnavailableException.class);
        assertThat(REQUESTED).isEmpty();
    }

    @Test
    void reasonDoesNotContainTheAddress() {
        assertThatThrownBy(() -> source(Duration.ofSeconds(5)).fetch("http://evil.example:" + port() + "/secret"))
                .isInstanceOf(GooglePhotoUnavailableException.class)
                .message()
                .doesNotContain("evil")
                .doesNotContain("secret");
    }
}
