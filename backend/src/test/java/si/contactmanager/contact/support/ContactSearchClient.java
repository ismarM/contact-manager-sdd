package si.contactmanager.contact.support;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Pomočniki testov iskanja (specs/008-iskanje/plan.md – Public Interfaces): sestavljanje poizvedbe z URL kodiranjem in
 * branje odgovora. Ne posnema strežnika; pričakovanja piše vsak test dobesedno.
 */
public final class ContactSearchClient {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private ContactSearchClient() {}

    public static String listPath(UUID group) {
        return "/api/groups/" + group + "/contacts";
    }

    public static String filtersPath(UUID group) {
        return "/api/groups/" + group + "/contact-filters";
    }

    /** {@code query("q", "feri", "tag", "vip")} → {@code ?q=feri&tag=vip}; vrednosti so URL kodirane (UTF-8). */
    public static String query(String... pairs) {
        if (pairs.length % 2 != 0) {
            throw new IllegalArgumentException("pričakovani pari ime, vrednost");
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < pairs.length; i += 2) {
            out.append(i == 0 ? '?' : '&')
                    .append(URLEncoder.encode(pairs[i], StandardCharsets.UTF_8))
                    .append('=')
                    .append(URLEncoder.encode(pairs[i + 1], StandardCharsets.UTF_8));
        }
        return out.toString();
    }

    public static Map<String, Object> page(String body) {
        return JSON.readValue(body, new TypeReference<Map<String, Object>>() {});
    }

    public static List<Map<String, Object>> items(String body) {
        return JSON.convertValue(page(body).get("items"), new TypeReference<List<Map<String, Object>>>() {});
    }

    /** Prikazna imena zadetkov po vrstnem redu odgovora. */
    public static List<String> names(String body) {
        return items(body).stream()
                .map(item -> (String) item.get("displayName"))
                .toList();
    }

    public static long total(String body) {
        return ((Number) page(body).get("total")).longValue();
    }

    /** Napake {@code field → code} iz telesa {@code 400 VALIDATION_FAILED} (prva napaka vsakega polja). */
    public static Map<String, String> errors(String body) {
        Map<String, String> errors = new LinkedHashMap<>();
        List<Map<String, Object>> list =
                JSON.convertValue(page(body).get("errors"), new TypeReference<List<Map<String, Object>>>() {});
        for (Map<String, Object> error : list) {
            errors.putIfAbsent((String) error.get("field"), (String) error.get("code"));
        }
        return errors;
    }

    /** Možnosti filtrov: {@code keys} ali {@code tags}. */
    public static List<String> options(String body, String name) {
        return JSON.convertValue(page(body).get(name), new TypeReference<List<String>>() {});
    }
}
