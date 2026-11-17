package si.contactmanager.maps;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import si.contactmanager.contact.Address;
import si.contactmanager.contact.CountryNames;
import si.contactmanager.contact.TypedValues;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Samodokončanje naslova prek storitve Photon (016, FR-016-13, FR-016-23; research R-08). Storitev prejme samo
 * besedilo naslova in jezik (brez podatkov uporabnika ali kontakta, brez piškotkov in {@code Referer}); predlogi so
 * prednostno v državi {@code country}. Predpomnilnik v pomnilniku (1 h), omejitev globalno in na uporabnika. Napaka,
 * časovna omejitev, omejitev pogostosti ali izklop vrnejo prazen seznam. Besedilo naslova se nikoli ne beleži.
 */
@Component
public class PhotonClient {

    private static final Logger LOG = LoggerFactory.getLogger(PhotonClient.class);

    /** Največ predlogov v odgovoru. */
    static final int MAX = 5;

    /** Toliko zadetkov zahtevamo, da lahko predloge v državi kontakta postavimo naprej. */
    private static final int FETCH = 10;

    /** Države, kjer je hišna številka pred ulico. */
    private static final Set<String> NUMBER_FIRST = Set.of("US", "CA", "GB", "AU", "NZ", "IE", "FR");

    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final MapsProperties properties;
    private final HttpClient http;
    private final BoundedCache<String, List<AddressSuggestion>> cache;
    private final RateLimiter global;
    private final RateLimiter.Keyed<Long> perUser;

    @Autowired
    public PhotonClient(MapsProperties properties) {
        this(
                properties,
                HttpClient.newBuilder()
                        .connectTimeout(properties.connectTimeout())
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    PhotonClient(MapsProperties properties, HttpClient http) {
        this.properties = properties;
        this.http = http;
        this.cache = new BoundedCache<>(
                properties.suggestions().entries(), properties.suggestions().ttl());
        this.global = new RateLimiter(properties.limits().photonPerSecond(), Duration.ofSeconds(1));
        this.perUser = new RateLimiter.Keyed<>(properties.limits().photonPerUserPerSecond(), Duration.ofSeconds(1));
    }

    /**
     * Do 5 predlogov za {@code query} (že preverjen: 3–300 znakov). {@code country}: prednostna država (koda ISO ali
     * {@code null}); {@code language}: {@code sl} ali {@code en}.
     */
    public List<AddressSuggestion> suggest(long userId, String query, String country, String language) {
        if (!properties.enabled()) {
            return List.of();
        }
        String text = SPACES.matcher(query.strip()).replaceAll(" ");
        String key = text.toLowerCase(Locale.ROOT) + "\u0000" + (country == null ? "" : country) + "\u0000" + language;
        Optional<List<AddressSuggestion>> cached = cache.get(key);
        if (cached.isPresent()) {
            return cached.get();
        }
        if (!perUser.tryAcquire(userId) || !global.tryAcquire()) {
            return List.of();
        }
        Optional<String> body = fetch(text, language);
        if (body.isEmpty()) {
            return List.of();
        }
        List<AddressSuggestion> suggestions;
        try {
            suggestions = parse(JSON.readTree(body.get()), country, language);
        } catch (JacksonException | IllegalArgumentException e) {
            LOG.warn("Photon: neveljaven odgovor storitve");
            return List.of();
        }
        cache.put(key, suggestions);
        return suggestions;
    }

    private Optional<String> fetch(String text, String language) {
        URI uri = URI.create(trimSlash(properties.photonUrl()) + "/api?q=" + encode(text) + "&limit=" + FETCH + "&lang="
                + ("en".equals(language) ? "en" : "default"));
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
                // Brez naslova zahteve: poizvedba vsebuje besedilo naslova (FR-016-23).
                LOG.warn("Photon: storitev je vrnila stanje {}", response.statusCode());
                return Optional.empty();
            }
            return Optional.of(response.body());
        } catch (IOException e) {
            LOG.warn("Photon: storitev ni dosegljiva ({})", e.getClass().getSimpleName());
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    /** Predlogi iz odgovora GeoJSON: veljavni naslovi (ulica ali kraj), brez ponovitev, najprej v državi. */
    static List<AddressSuggestion> parse(JsonNode root, String country, String language) {
        JsonNode features = root.get("features");
        if (features == null || !features.isArray()) {
            throw new IllegalArgumentException("odgovor brez features");
        }
        List<AddressSuggestion> preferred = new ArrayList<>();
        List<AddressSuggestion> others = new ArrayList<>();
        Set<Address> seen = new LinkedHashSet<>();
        for (JsonNode feature : features) {
            JsonNode p = feature.get("properties");
            if (p == null || !p.isObject()) {
                continue;
            }
            Address address = address(p);
            if (address == null || !seen.add(address)) {
                continue;
            }
            AddressSuggestion suggestion = AddressSuggestion.of(label(p, address, language), address);
            if (country != null && country.equals(address.country())) {
                preferred.add(suggestion);
            } else {
                others.add(suggestion);
            }
        }
        preferred.addAll(others);
        return List.copyOf(preferred.subList(0, Math.min(MAX, preferred.size())));
    }

    private static Address address(JsonNode p) {
        String type = text(p, "type");
        String name = text(p, "name");
        String code = text(p, "countrycode");
        String country = code == null ? null : code.toUpperCase(Locale.ROOT);
        if (country != null && !CountryNames.isValid(country)) {
            country = null;
        }
        String number = text(p, "housenumber");
        String streetName = text(p, "street");
        if (streetName == null && ("street".equals(type) || "house".equals(type))) {
            streetName = name;
        }
        String street = streetName == null
                ? null
                : number == null
                        ? streetName
                        : NUMBER_FIRST.contains(country) ? number + " " + streetName : streetName + " " + number;
        String city = text(p, "city");
        if (city == null && "city".equals(type)) {
            city = name;
        }
        if (city == null) {
            city = text(p, "locality");
        }
        TypedValues.AddressResult result = TypedValues.normalizeAddress(
                new Address(street, null, text(p, "postcode"), city, text(p, "state"), country));
        return result.valid() ? result.address() : null;
    }

    /** Berljiva oznaka: ime kraja ali stavbe (če ni del naslova), ulica, poštna številka s krajem, država. */
    private static String label(JsonNode p, Address address, String language) {
        List<String> parts = new ArrayList<>();
        String name = text(p, "name");
        if (name != null
                && !name.equals(address.city())
                && (address.street() == null || !address.street().contains(name))) {
            parts.add(name);
        }
        if (address.street() != null) {
            parts.add(address.street());
        }
        String place = String.join(
                        " ",
                        address.postalCode() == null ? "" : address.postalCode(),
                        address.city() == null ? "" : address.city())
                .strip();
        if (!place.isEmpty()) {
            parts.add(place);
        }
        if (address.country() != null) {
            parts.add(CountryNames.display(address.country(), language));
        }
        return String.join(", ", parts);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString()) {
            return null;
        }
        String text = value.asString().strip();
        return text.isEmpty() ? null : text;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String trimSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
