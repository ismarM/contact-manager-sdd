package si.contactmanager.image;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.error.GooglePhotoUnavailableException;

/**
 * Prevzem slike Google računa (FR-018-20, FR-018-23, research R-06): naslov je samo {@code picture} iz preverjenega
 * žetona; {@link UrlGuard}, brez preusmeritev, časovne omejitve (povezava 3 s, celoten prevzem 5 s), meja velikosti in
 * tip vsebine. V dnevnik gre samo razlog, nikoli naslov.
 */
@Component
class GooglePhotoSource {

    private static final Logger LOG = LoggerFactory.getLogger(GooglePhotoSource.class);
    private static final java.util.regex.Pattern SIZE = java.util.regex.Pattern.compile("=s\\d+-c$");

    private final UrlGuard guard;
    private final HttpClient client;
    private final long maxBytes;
    private final Duration total;

    @Autowired
    GooglePhotoSource(ImageProperties properties) {
        this(
                new UrlGuard(properties.google().allowedHosts()),
                HttpClient.newBuilder()
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .connectTimeout(Duration.ofSeconds(3))
                        .build(),
                properties.maxBytes(),
                Duration.ofSeconds(5));
    }

    GooglePhotoSource(UrlGuard guard, HttpClient client, long maxBytes, Duration total) {
        this.guard = guard;
        this.client = client;
        this.maxBytes = maxBytes;
        this.total = total;
    }

    /** Bajti slike ali {@link GooglePhotoUnavailableException}; {@code picture == null} = žeton brez slike. */
    byte[] fetch(String picture) {
        URI uri;
        try {
            uri = guard.check(picture);
        } catch (UrlGuard.Rejected e) {
            throw unavailable(e.getMessage());
        }
        URI sized = URI.create(SIZE.matcher(uri.toString()).replaceFirst("=s512-c"));
        HttpRequest request = HttpRequest.newBuilder(sized)
                .timeout(total)
                .header("Accept", "image/jpeg, image/png")
                .GET()
                .build();
        CompletableFuture<byte[]> future = client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                .thenApply(this::read);
        try {
            return future.get(total.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw unavailable("časovna omejitev");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable("prekinjeno");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof GooglePhotoUnavailableException unavailable) {
                throw unavailable;
            }
            throw unavailable("napaka povezave");
        }
    }

    private byte[] read(HttpResponse<InputStream> response) {
        try (InputStream body = response.body()) {
            if (response.statusCode() != 200) {
                throw unavailable("odgovor " + response.statusCode());
            }
            String type = response.headers()
                    .firstValue("Content-Type")
                    .map(value -> value.split(";")[0].trim().toLowerCase(Locale.ROOT))
                    .orElse("");
            if (!type.equals("image/jpeg") && !type.equals("image/png")) {
                throw unavailable("vsebina ni slika");
            }
            long declared =
                    response.headers().firstValueAsLong("Content-Length").orElse(-1);
            if (declared > maxBytes) {
                throw unavailable("odgovor je prevelik");
            }
            byte[] bytes = body.readNBytes((int) maxBytes + 1);
            if (bytes.length > maxBytes) {
                throw unavailable("odgovor je prevelik");
            }
            return bytes;
        } catch (IOException e) {
            throw unavailable("napaka branja");
        }
    }

    private static GooglePhotoUnavailableException unavailable(String reason) {
        LOG.warn("Slika Google računa ni na voljo: {}", reason);
        return new GooglePhotoUnavailableException(reason);
    }
}
