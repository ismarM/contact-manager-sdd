package si.contactmanager.maps;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import si.contactmanager.contact.Address;
import si.contactmanager.shared.error.MapServiceUnavailableException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Lokacija naslova prek storitve Nominatim (016, FR-016-21 … FR-016-23; research R-08). Razčlenjen naslov gre kot
 * strukturirana poizvedba, nerazčlenjen kot {@code q}; storitev prejme samo besedilo naslova in jezik (brez podatkov
 * uporabnika ali kontakta, brez piškotkov in {@code Referer}). Predpomnilnik v pomnilniku (24 h), globalno 1 zahteva/s
 * s čakanjem največ {@code maxWait}. Napaka, časovna omejitev, omejitev ali izklop → {@link
 * MapServiceUnavailableException}. Besedilo naslova in koordinate se nikoli ne beležijo in ne shranijo trajno.
 */
@Component
public class NominatimClient {

    private static final Logger LOG = LoggerFactory.getLogger(NominatimClient.class);

    /** Zadetki z nižjim rangom (kraj, četrt, ulica brez stavbe) so približni (research R-08). */
    static final int EXACT_RANK = 26;

    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final MapsProperties properties;
    private final HttpClient http;
    private final BoundedCache<String, AddressLocation> cache;
    private final RateLimiter global;

    @Autowired
    public NominatimClient(MapsProperties properties) {
        this(
                properties,
                HttpClient.newBuilder()
                        .connectTimeout(properties.connectTimeout())
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    NominatimClient(MapsProperties properties, HttpClient http) {
        this.properties = properties;
        this.http = http;
        this.cache = new BoundedCache<>(
                properties.locations().entries(), properties.locations().ttl());
        this.global = new RateLimiter(properties.limits().nominatimPerSecond(), Duration.ofSeconds(1));
    }

    /** Lokacija razčlenjenega naslova (strukturirana poizvedba). */
    public AddressLocation locate(Address address, String language) {
        Map<String, String> params = new LinkedHashMap<>();
        put(params, "street", address.street());
        put(params, "postalcode", address.postalCode());
        put(params, "city", address.city());
        put(params, "state", address.region());
        if (address.country() != null) {
            params.put("countrycodes", address.country().toLowerCase(Locale.ROOT));
        }
        return locate(params, language);
    }

    /** Lokacija nerazčlenjenega naslova (prosto besedilo {@code q}). */
    public AddressLocation locate(String text, String language) {
        Map<String, String> params = new LinkedHashMap<>();
        put(params, "q", text);
        return locate(params, language);
    }

    private AddressLocation locate(Map<String, String> params, String language) {
        if (!properties.enabled()) {
            throw new MapServiceUnavailableException();
        }
        StringBuilder query = new StringBuilder();
        params.forEach((name, value) ->
                query.append(name).append('=').append(encode(value)).append('&'));
        query.append("format=jsonv2&addressdetails=1&limit=1&accept-language=").append(language);
        // Ključ iz nekodiranih vrednosti: velikost črk ne šteje (tudi pri šumnikih).
        String key = (params + "|" + language).toLowerCase(Locale.ROOT);
        Optional<AddressLocation> cached = cache.get(key);
        if (cached.isPresent()) {
            return cached.get();
        }
        if (!global.acquire(properties.limits().maxWait())) {
            throw new MapServiceUnavailableException();
        }
        String body = fetch(query.toString(), language);
        AddressLocation location;
        try {
            location = parse(JSON.readTree(body));
        } catch (JacksonException | IllegalArgumentException e) {
            LOG.warn("Nominatim: neveljaven odgovor storitve");
            throw new MapServiceUnavailableException();
        }
        cache.put(key, location);
        return location;
    }

    private String fetch(String query, String language) {
        URI uri = URI.create(trimSlash(properties.nominatimUrl()) + "/search?" + query);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(properties.readTimeout())
                .header("User-Agent", properties.userAgent())
                .header("Accept", "application/json")
                .header("Accept-Language", language)
                .GET()
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                // Brez poizvedbe: vsebuje besedilo naslova (FR-016-23).
                LOG.warn("Nominatim: storitev je vrnila stanje {}", response.statusCode());
                throw new MapServiceUnavailableException();
            }
            return response.body();
        } catch (IOException e) {
            LOG.warn("Nominatim: storitev ni dosegljiva ({})", e.getClass().getSimpleName());
            throw new MapServiceUnavailableException();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MapServiceUnavailableException();
        }
    }

    /**
     * Prvi zadetek odgovora {@code jsonv2}: brez zadetka {@code NOT_FOUND}; z rangom pod {@value #EXACT_RANK} ali brez
     * hišne številke {@code APPROXIMATE}; sicer {@code EXACT}.
     */
    static AddressLocation parse(JsonNode root) {
        if (root == null || !root.isArray()) {
            throw new IllegalArgumentException("odgovor ni seznam");
        }
        if (root.isEmpty()) {
            return new AddressLocation(AddressLocation.Status.NOT_FOUND, null, null);
        }
        JsonNode hit = root.get(0);
        double lat = coordinate(hit.get("lat"), 90);
        double lon = coordinate(hit.get("lon"), 180);
        JsonNode rank = hit.get("place_rank");
        JsonNode details = hit.get("address");
        boolean number = details != null
                && details.get("house_number") != null
                && !details.get("house_number").asString("").isBlank();
        boolean exact = rank != null && rank.isNumber() && rank.asInt() >= EXACT_RANK && number;
        return new AddressLocation(exact ? AddressLocation.Status.EXACT : AddressLocation.Status.APPROXIMATE, lat, lon);
    }

    private static double coordinate(JsonNode node, double limit) {
        if (node == null) {
            throw new IllegalArgumentException("ni koordinate");
        }
        double value = node.isNumber() ? node.asDouble() : Double.parseDouble(node.asString());
        if (!Double.isFinite(value) || Math.abs(value) > limit) {
            throw new IllegalArgumentException("koordinata izven obsega");
        }
        return value;
    }

    private static void put(Map<String, String> params, String name, String value) {
        if (value != null && !value.isBlank()) {
            params.put(name, SPACES.matcher(value.strip()).replaceAll(" "));
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String trimSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
