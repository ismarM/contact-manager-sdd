package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenitev telesa {@code POST}/{@code PUT …/contacts} (research R-06, feature-map §2.6): vrednosti obrezane, prazna
 * neobvezna polja {@code null}, dolžine v kodnih točkah, prelomi vrstic naslova poenoteni v {@code \n}; vsaj ime ali
 * priimek; atributi (do 50, ključ 1–50, vrednost 1–500, ključ edinstven ne glede na velikost črk, ne ime
 * predefiniranega polja) in značke (do 30, 1–50 znakov, brez presledkov, edinstvene ne glede na velikost črk). Popolnoma
 * prazna vrstica atributa se ne shrani. Nikoli ne vrže: napake podatkov se po feature-map §2.2 sporočijo šele po
 * preverjanju dostopa, arhiviranosti in verzije.
 */
public final class ContactInputParser {

    static final int NAME_MAX = 100;
    static final int ADDRESS_MAX = 300;
    static final int EMAIL_MAX = 254;
    static final int PHONE_MAX = 30;
    static final int KEY_MAX = 50;
    static final int VALUE_MAX = 500;
    static final int TAG_MAX = 50;
    static final int ATTRIBUTES_MAX = 50;
    static final int TAGS_MAX = 30;

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern PHONE = Pattern.compile("^[0-9+\\-()/ ]+$");
    private static final Pattern WHITESPACE = Pattern.compile("\\s");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    /** Imena predefiniranih polj v obeh jezikih (normalizirana: male črke, en presledek). */
    private static final Set<String> RESERVED_KEYS = Set.of(
            "ime",
            "first name",
            "priimek",
            "last name",
            "naslov",
            "address",
            "e-naslov",
            "email",
            "e-mail",
            "telefon",
            "phone");

    private static final Set<String> CREATE_FIELDS =
            Set.of("firstName", "lastName", "address", "email", "phone", "attributes", "tags");
    private static final Set<String> UPDATE_FIELDS =
            Set.of("firstName", "lastName", "address", "email", "phone", "attributes", "tags", "version");

    /** Rezultat: {@code input} je {@code null} ob kateri koli napaki; {@code version} je {@code null}, če ga ni. */
    public record Parsed(ContactInput input, Long version, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    private final JsonMapper json;

    public ContactInputParser() {
        this(JsonMapper.builder().build());
    }

    public ContactInputParser(JsonMapper json) {
        this.json = json;
    }

    public Parsed parseCreate(String body) {
        return parse(body, false);
    }

    public Parsed parseUpdate(String body) {
        return parse(body, true);
    }

    /** Normalizirana oblika ključa atributa ali značke za primerjavo ne glede na velikost črk. */
    static String normalize(String text) {
        return text.toLowerCase(Locale.ROOT);
    }

    private Parsed parse(String body, boolean update) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            return malformed();
        }
        if (root == null || !root.isObject()) {
            return malformed();
        }
        List<FieldError> errors = new ArrayList<>();
        Set<String> allowed = update ? UPDATE_FIELDS : CREATE_FIELDS;
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!allowed.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        String firstName = text(root, "firstName", NAME_MAX, errors);
        String lastName = text(root, "lastName", NAME_MAX, errors);
        if (firstName == null && lastName == null && !hasError(errors, "firstName") && !hasError(errors, "lastName")) {
            errors.add(new FieldError("firstName", "REQUIRED"));
            errors.add(new FieldError("lastName", "REQUIRED"));
        }
        String address = text(root, "address", ADDRESS_MAX, errors);
        String email = text(root, "email", EMAIL_MAX, errors);
        if (email != null && !hasError(errors, "email") && !EMAIL.matcher(email).matches()) {
            errors.add(new FieldError("email", "INVALID_VALUE"));
        }
        String phone = text(root, "phone", PHONE_MAX, errors);
        if (phone != null && !hasError(errors, "phone") && !PHONE.matcher(phone).matches()) {
            errors.add(new FieldError("phone", "INVALID_VALUE"));
        }
        List<Attribute> attributes = attributes(root, errors);
        List<String> tags = tags(root, errors);
        Long version = update ? version(root, errors) : null;
        ContactInput input = errors.isEmpty()
                ? new ContactInput(firstName, lastName, address, email, phone, attributes, tags)
                : null;
        return new Parsed(input, version, List.copyOf(errors));
    }

    /** Neobvezno besedilno polje: obrezano, prazno = {@code null}; naslov s poenotenimi prelomi vrstic. */
    private static String text(JsonNode root, String field, int max, List<FieldError> errors) {
        JsonNode node = root.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isString()) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return null;
        }
        String value = node.asString().replace("\r\n", "\n").replace('\r', '\n').strip();
        if (value.isEmpty()) {
            return null;
        }
        if (length(value) > max) {
            errors.add(new FieldError(field, "TOO_LONG"));
        }
        return value;
    }

    private static List<Attribute> attributes(JsonNode root, List<FieldError> errors) {
        JsonNode node = root.get("attributes");
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError("attributes", "INVALID_VALUE"));
            return List.of();
        }
        List<Attribute> attributes = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        int index = 0;
        for (JsonNode row : node) {
            String prefix = "attributes[" + index + "]";
            index++;
            if (!row.isObject()) {
                errors.add(new FieldError(prefix, "INVALID_VALUE"));
                continue;
            }
            for (Map.Entry<String, JsonNode> property : row.properties()) {
                if (!property.getKey().equals("key") && !property.getKey().equals("value")) {
                    errors.add(new FieldError(prefix + "." + property.getKey(), "UNKNOWN_FIELD"));
                }
            }
            String key = rowText(row, "key", prefix, errors);
            String value = rowText(row, "value", prefix, errors);
            if (key != null && key.isEmpty() && value != null && value.isEmpty()) {
                // Popolnoma prazna vrstica se ne shrani (Edge Cases).
                continue;
            }
            if (key != null) {
                String normalized = normalize(key);
                if (key.isEmpty()) {
                    errors.add(new FieldError(prefix + ".key", "REQUIRED"));
                } else if (length(key) > KEY_MAX) {
                    errors.add(new FieldError(prefix + ".key", "TOO_LONG"));
                } else if (RESERVED_KEYS.contains(SPACES.matcher(normalized).replaceAll(" "))) {
                    errors.add(new FieldError(prefix + ".key", "RESERVED_KEY"));
                } else if (!keys.add(normalized)) {
                    errors.add(new FieldError(prefix + ".key", "DUPLICATE"));
                }
            }
            if (value != null) {
                if (value.isEmpty()) {
                    errors.add(new FieldError(prefix + ".value", "REQUIRED"));
                } else if (length(value) > VALUE_MAX) {
                    errors.add(new FieldError(prefix + ".value", "TOO_LONG"));
                }
            }
            attributes.add(new Attribute(key, value));
        }
        if (attributes.size() > ATTRIBUTES_MAX) {
            errors.add(new FieldError("attributes", "TOO_MANY"));
        }
        return List.copyOf(attributes.stream()
                .filter(a -> a.key() != null && a.value() != null)
                .toList());
    }

    /** Besedilo v vrstici atributa: obrezano, manjkajoče = prazno; ne-niz je napaka ({@code null}). */
    private static String rowText(JsonNode row, String field, String prefix, List<FieldError> errors) {
        JsonNode node = row.get(field);
        if (node == null || node.isNull()) {
            return "";
        }
        if (!node.isString()) {
            errors.add(new FieldError(prefix + "." + field, "INVALID_VALUE"));
            return null;
        }
        return node.asString().strip();
    }

    private static List<String> tags(JsonNode root, List<FieldError> errors) {
        JsonNode node = root.get("tags");
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError("tags", "INVALID_VALUE"));
            return List.of();
        }
        List<String> tags = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int index = 0;
        for (JsonNode item : node) {
            String field = "tags[" + index + "]";
            index++;
            if (!item.isString()) {
                errors.add(new FieldError(field, "INVALID_VALUE"));
                continue;
            }
            String tag = item.asString().strip();
            if (tag.isEmpty()) {
                errors.add(new FieldError(field, "REQUIRED"));
            } else if (WHITESPACE.matcher(tag).find()) {
                errors.add(new FieldError(field, "INVALID_VALUE"));
            } else if (length(tag) > TAG_MAX) {
                errors.add(new FieldError(field, "TOO_LONG"));
            } else if (!seen.add(normalize(tag))) {
                errors.add(new FieldError(field, "DUPLICATE"));
            }
            tags.add(tag);
        }
        if (tags.size() > TAGS_MAX) {
            errors.add(new FieldError("tags", "TOO_MANY"));
        }
        return List.copyOf(tags);
    }

    private static Long version(JsonNode root, List<FieldError> errors) {
        JsonNode node = root.get("version");
        if (node == null || node.isNull()) {
            errors.add(new FieldError("version", "REQUIRED"));
            return null;
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong()) {
            errors.add(new FieldError("version", "INVALID_VALUE"));
            return null;
        }
        return node.longValue();
    }

    private static boolean hasError(List<FieldError> errors, String field) {
        return errors.stream().anyMatch(e -> e.field().equals(field));
    }

    private static int length(String text) {
        return text.codePointCount(0, text.length());
    }

    private static Parsed malformed() {
        return new Parsed(null, null, List.of(new FieldError("body", "MALFORMED")));
    }
}
