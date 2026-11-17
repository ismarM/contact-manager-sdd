package si.contactmanager.contact;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Oblike naslovov po državah (016, research R-04): tabela {@code fmt} iz {@code address-formats.json} (kopija v
 * frontendu, test enakosti). Uporaba: razčlenjen naslov kot besedilo (sprememba tipa ključa, Excel). Prazni deli in
 * ločila ob njih odpadejo; država je zadnja vrstica (ime v slovenščini).
 */
public final class AddressFormats {

    private static final Pattern SPACES = Pattern.compile("[ \\t]+");
    private static final Pattern EDGE_PUNCTUATION = Pattern.compile("^[\\s,\\-]+|[\\s,\\-]+$");

    private static final String DEFAULT;
    private static final Map<String, String> FORMATS = new HashMap<>();

    static {
        try (InputStream in = AddressFormats.class.getResourceAsStream("/address-formats.json")) {
            if (in == null) {
                throw new IllegalStateException("address-formats.json manjka");
            }
            JsonNode root = JsonMapper.builder().build().readTree(in);
            DEFAULT = root.get("default").asString();
            for (Map.Entry<String, JsonNode> entry : root.get("formats").properties()) {
                FORMATS.put(entry.getKey(), entry.getValue().asString());
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private AddressFormats() {}

    /** Oblika države ({@code fmt}); neznana ali manjkajoča država: privzeta. */
    static String format(String country) {
        return country == null ? DEFAULT : FORMATS.getOrDefault(country, DEFAULT);
    }

    /** Naslov v vrsticah po pravilih države, država kot zadnja vrstica (slovensko ime). */
    public static String text(Address address) {
        return text(address, "sl");
    }

    /** Naslov v vrsticah po pravilih države; {@code language} za ime države ({@code sl} ali {@code en}). */
    public static String text(Address address, String language) {
        String fmt = format(address.country());
        String street = join(address.street(), address.extra());
        List<String> lines = new ArrayList<>();
        for (String line : fmt.split("%n", -1)) {
            String filled = line.replace("%A", street)
                    .replace("%Z", nonNull(address.postalCode()))
                    .replace("%C", nonNull(address.city()))
                    .replace("%S", nonNull(address.region()));
            // Ločila ob praznih delih (npr. », « pred manjkajočo regijo) odpadejo.
            for (String part : filled.split("\n", -1)) {
                String clean = EDGE_PUNCTUATION
                        .matcher(SPACES.matcher(part).replaceAll(" ").replace(" ,", ","))
                        .replaceAll("");
                if (!clean.isEmpty()) {
                    lines.add(clean);
                }
            }
        }
        if (address.country() != null) {
            lines.add(CountryNames.display(address.country(), language));
        }
        return String.join("\n", lines);
    }

    private static String join(String street, String extra) {
        if (street == null) {
            return nonNull(extra);
        }
        return extra == null ? street : street + "\n" + extra;
    }

    private static String nonNull(String value) {
        return value == null ? "" : value;
    }
}
