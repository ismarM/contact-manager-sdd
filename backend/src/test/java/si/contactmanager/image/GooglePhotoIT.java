package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Slika Google računa (FR-018-20, FR-018-23) brez omrežja: strežnik naslov prebere samo iz {@code picture} v žetonu;
 * viri so lokalni strežnik, ki ga prava zaščita ne bi dovolila, zato je v testu zamenjana samo zaščita naslova
 * ({@link UrlGuard}) – prevzem, preusmeritve, omejitve velikosti in časa ter obdelava so pravi.
 */
@Tag("FR-018-20")
@Tag("FR-018-23")
@Import(GooglePhotoIT.Config.class)
class GooglePhotoIT extends ImageApiTest {

    private static final HttpServer SERVER = start();
    private static final List<String> REQUESTED = new CopyOnWriteArrayList<>();

    private static HttpServer start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
            server.createContext("/ok", exchange -> {
                REQUESTED.add(exchange.getRequestURI().toString());
                respond(exchange, 200, "image/jpeg", TestImages.jpeg(640, 480));
            });
            server.createContext("/redirect", exchange -> {
                REQUESTED.add(exchange.getRequestURI().toString());
                exchange.getResponseHeaders().add("Location", "http://localhost:" + port() + "/ok");
                exchange.sendResponseHeaders(302, -1);
                exchange.close();
            });
            server.createContext("/big", exchange -> respond(exchange, 200, "image/jpeg", new byte[6 * 1024 * 1024]));
            server.createContext("/junk", exchange -> respond(exchange, 200, "image/jpeg", "ni slika".getBytes()));
            server.createContext("/html", exchange -> respond(exchange, 200, "text/html", "<html/>".getBytes()));
            server.createContext("/slow", exchange -> {
                try {
                    Thread.sleep(4_000);
                    respond(exchange, 200, "image/jpeg", TestImages.jpeg(64, 64));
                } catch (InterruptedException | IOException e) {
                    Thread.currentThread().interrupt();
                }
            });
            server.setExecutor(Executors.newCachedThreadPool());
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static int port() {
        return SERVER.getAddress().getPort();
    }

    private static void respond(HttpExchange exchange, int status, String type, byte[] body) throws IOException {
        exchange.getResponseHeaders().add("Content-Type", type);
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
        exchange.close();
    }

    /** Pravi prevzem, a zaščita naslova dovoli samo lokalni strežnik testa (razreševanje je javen naslov). */
    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        GooglePhotoSource testGooglePhotoSource() {
            UrlGuard guard = new UrlGuard(
                    List.of("^localhost$"),
                    host -> {
                        try {
                            return List.of(InetAddress.getByName("142.250.74.33"));
                        } catch (java.net.UnknownHostException e) {
                            throw new IllegalStateException(e);
                        }
                    },
                    "http",
                    port());
            HttpClient client = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .connectTimeout(Duration.ofSeconds(3))
                    .build();
            return new GooglePhotoSource(guard, client, 5L * 1024 * 1024, Duration.ofSeconds(2));
        }
    }

    @BeforeEach
    void clear() {
        REQUESTED.clear();
    }

    private static String src(String path) {
        return "http://localhost:" + port() + path;
    }

    private String withPicture(SignedIn user, String picture) {
        return Tokens.withClaims(user.idToken(), claims -> {
            if (picture != null) {
                claims.put("picture", picture);
            }
        });
    }

    private HttpResponse<String> google(String token) throws Exception {
        return Http.send("POST", url("/api/me/photo/google"), Http.bearer(token));
    }

    @Test
    void picturesFromTheTokenIsFetchedProcessedAndStored() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = google(withPicture(ana, src("/ok=s96-c")));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsOnlyKeys("photoRevision").containsEntry("photoRevision", 1);
        assertThat(REQUESTED).containsExactly("/ok=s512-c");
        HttpResponse<byte[]> photo = download("/api/me/photo?size=512", ana.idToken());
        assertThat(photo.statusCode()).isEqualTo(200);
        assertThat(photo.headers().firstValue("Content-Type")).hasValue("image/jpeg");
        assertThat(imageCount("kind = 'USER' and user_id = ?", groups.userId(ana.uid())))
                .isEqualTo(1);
    }

    @Test
    void secondImportReplacesThePhotoAndRaisesTheRevision() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        HttpResponse<String> response = google(withPicture(ana, src("/ok")));

        assertThat(json(response.body())).containsEntry("photoRevision", 2);
        assertThat(imageCount("kind = 'USER' and user_id = ?", groups.userId(ana.uid())))
                .isEqualTo(1);
    }

    @Test
    void tokenWithoutAPictureIsUnavailableAndNothingIsRequested() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = google(withPicture(ana, null));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsOnlyKeys("code").containsEntry("code", "GOOGLE_PHOTO_UNAVAILABLE");
        assertThat(REQUESTED).isEmpty();
        assertThat(imageCount("kind = 'USER' and user_id = ?", groups.userId(ana.uid())))
                .isZero();
    }

    @Test
    void addressFromTheClientIsNeverUsed() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        String token = withPicture(ana, null);

        HttpResponse<String> withBody = Http.send(
                "POST", url("/api/me/photo/google"), Http.bearer(token), "{\"picture\":\"" + src("/ok") + "\"}");
        HttpResponse<String> withQuery = Http.send(
                "POST", url("/api/me/photo/google?picture=" + src("/ok") + "&url=" + src("/ok")), Http.bearer(token));
        HttpResponse<String> withHeader = Http.send(
                "POST",
                url("/api/me/photo/google"),
                Map.of("Authorization", "Bearer " + token, "X-Picture", src("/ok"), "Referer", src("/ok")));

        for (HttpResponse<String> response : List.of(withBody, withQuery, withHeader)) {
            assertThat(response.statusCode()).isEqualTo(409);
            assertThat(json(response.body())).containsEntry("code", "GOOGLE_PHOTO_UNAVAILABLE");
        }
        assertThat(REQUESTED).isEmpty();
        assertThat(imageCount("kind = 'USER' and user_id = ?", groups.userId(ana.uid())))
                .isZero();
    }

    @Test
    void addressesOutsideTheAllowedHostsAreUnavailableWithoutAnyRequest() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        for (String picture : List.of(
                "http://127.0.0.1:" + port() + "/ok",
                "http://evil.example:" + port() + "/ok",
                "http://localhost:" + (port() + 1) + "/ok",
                "https://localhost:" + port() + "/ok",
                "http://user@localhost:" + port() + "/ok",
                "http://169.254.169.254/latest/meta-data/",
                "file:///etc/passwd")) {
            HttpResponse<String> response = google(withPicture(ana, picture));
            assertThat(response.statusCode()).as(picture).isEqualTo(409);
            assertThat(json(response.body())).containsEntry("code", "GOOGLE_PHOTO_UNAVAILABLE");
        }
        assertThat(REQUESTED).isEmpty();
    }

    @Test
    void redirectOversizedNonImageAndSlowResponsesAreUnavailableAndKeepTheExistingPhoto() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));
        byte[] before = download("/api/me/photo", ana.idToken()).body();

        for (String path : List.of("/redirect", "/big", "/junk", "/html", "/slow", "/missing")) {
            HttpResponse<String> response = google(withPicture(ana, src(path)));
            assertThat(response.statusCode()).as(path).isEqualTo(409);
            assertThat(json(response.body())).as(path).containsEntry("code", "GOOGLE_PHOTO_UNAVAILABLE");
        }

        assertThat(REQUESTED).containsExactly("/redirect");
        assertThat(download("/api/me/photo", ana.idToken()).body()).isEqualTo(before);
        assertThat(revisionOf("kind = 'USER' and user_id = ?", groups.userId(ana.uid())))
                .isEqualTo(1L);
    }

    @Test
    void googleImportCountsAgainstTheUploadRateLimit() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        String token = withPicture(ana, src("/junk"));
        for (int i = 1; i <= 10; i++) {
            assertThat(google(token).statusCode()).as("poskus " + i).isEqualTo(409);
        }

        HttpResponse<String> limited = google(withPicture(ana, src("/ok")));

        assertThat(limited.statusCode()).isEqualTo(429);
        assertThat(json(limited.body())).containsEntry("code", "RATE_LIMITED");
        assertThat(uploadMe(ana.idToken(), TestImages.jpeg(100, 100)).statusCode())
                .isEqualTo(429);
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        HttpResponse<String> response = Http.send("POST", url("/api/me/photo/google"), Map.of());

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(REQUESTED).isEmpty();
    }
}
