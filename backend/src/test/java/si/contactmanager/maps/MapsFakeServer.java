package si.contactmanager.maps;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.function.Function;

/**
 * Nadomestni strežnik OSM za teste zaledja (016, tasks T008): JDK {@link HttpServer} na prostih vratih brez odvisnosti.
 * Nadzor odgovora (stanje, telo, zakasnitev), beleženje zahtev (pot, poizvedba, glave) in štetje klicev; noben test ne
 * kliče pravega OSM. Odgovor določa funkcija {@link #handler}; privzeto {@code 404}.
 */
public final class MapsFakeServer implements AutoCloseable {

    /** Prejeta zahteva; imena glav so z malimi črkami. */
    public record Request(String method, String path, String query, Map<String, String> headers) {}

    /** Odgovor; {@code delay} zadrži odgovor (preizkus časovnih omejitev). */
    public record Response(int status, String contentType, byte[] body, Duration delay) {

        public static Response json(String body) {
            return new Response(200, "application/json", body.getBytes(StandardCharsets.UTF_8), Duration.ZERO);
        }

        public static Response status(int status) {
            return new Response(status, "text/plain", new byte[0], Duration.ZERO);
        }

        public static Response png(byte[] body) {
            return new Response(200, "image/png", body, Duration.ZERO);
        }

        public Response delayed(Duration delay) {
            return new Response(status, contentType, body, delay);
        }
    }

    private final HttpServer server;
    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private volatile Function<Request, Response> handler = request -> Response.status(404);

    public MapsFakeServer() {
        try {
            server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/", this::handle);
        server.start();
    }

    /** Osnovni naslov, npr. {@code http://127.0.0.1:41234}. */
    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Določi odgovore; zamenja prejšnjega. */
    public MapsFakeServer handler(Function<Request, Response> handler) {
        this.handler = handler;
        return this;
    }

    /** Vsi zahtevki z istim odgovorom. */
    public MapsFakeServer respond(Response response) {
        return handler(request -> response);
    }

    public List<Request> requests() {
        return List.copyOf(requests);
    }

    /** Število prejetih zahtev; 0 pomeni, da zunanja storitev ni bila poklicana. */
    public int count() {
        return requests.size();
    }

    public int count(String pathPrefix) {
        return (int) requests.stream()
                .filter(request -> request.path().startsWith(pathPrefix))
                .count();
    }

    /** Pozabi zahteve in odgovore (nov test). */
    public void reset() {
        requests.clear();
        handler = request -> Response.status(404);
    }

    private void handle(HttpExchange exchange) throws IOException {
        Map<String, String> headers = new LinkedHashMap<>();
        exchange.getRequestHeaders()
                .forEach((name, values) -> headers.put(name.toLowerCase(), String.join(",", values)));
        Request request = new Request(
                exchange.getRequestMethod(),
                exchange.getRequestURI().getRawPath(),
                exchange.getRequestURI().getRawQuery(),
                headers);
        requests.add(request);
        Response response = handler.apply(request);
        if (!response.delay().isZero()) {
            try {
                Thread.sleep(response.delay());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        exchange.getResponseHeaders().set("Content-Type", response.contentType());
        boolean noBody = response.body().length == 0;
        exchange.sendResponseHeaders(response.status(), noBody ? -1 : response.body().length);
        if (!noBody) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(response.body());
            }
        }
        exchange.close();
    }

    @Override
    public void close() {
        server.stop(0);
        ((java.util.concurrent.ExecutorService) server.getExecutor()).shutdownNow();
    }
}
