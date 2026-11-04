package si.contactmanager.support;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/** Preprost odjemalec HTTP za integracijske teste (brez dodatnih knjižnic). */
public final class Http {

    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private Http() {}

    public static HttpResponse<String> send(String method, String url, Map<String, String> headers)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .method(method, HttpRequest.BodyPublishers.noBody());
        headers.forEach(builder::header);
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    public static HttpResponse<String> get(String url) throws IOException, InterruptedException {
        return send("GET", url, Map.of());
    }

    /** JSON brez presledkov, za primerjavo celotnega telesa. */
    public static String compact(String json) {
        return json.replaceAll("\\s", "");
    }
}
