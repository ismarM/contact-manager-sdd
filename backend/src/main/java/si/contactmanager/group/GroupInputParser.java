package si.contactmanager.group;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenitev telesa {@code POST}/{@code PUT /api/groups} (research R-07, feature-map §2.6): naslov obrezan, 1–100
 * znakov; opis do 1000 znakov, prazen ali samo presledki = brez opisa; barva ena od osmih imen (pri ustvarjanju privzeto
 * tinta). Znaki so kodne točke. Vrne podatke, poslano verzijo in vse napake po poljih; nikoli ne vrže, ker se napake
 * podatkov po feature-map §2.2 sporočijo šele po preverjanju dostopa in verzije.
 */
public final class GroupInputParser {

    static final int TITLE_MAX = 100;
    static final int DESCRIPTION_MAX = 1000;

    private static final Set<String> CREATE_FIELDS = Set.of("title", "description", "color");
    private static final Set<String> UPDATE_FIELDS = Set.of("title", "description", "color", "version");

    /** Rezultat: {@code input} je {@code null} ob kateri koli napaki; {@code version} je {@code null}, če ga ni. */
    public record Parsed(GroupInput input, Long version, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    private final JsonMapper json;

    public GroupInputParser() {
        this(JsonMapper.builder().build());
    }

    public GroupInputParser(JsonMapper json) {
        this.json = json;
    }

    public Parsed parseCreate(String body) {
        return parse(body, false);
    }

    public Parsed parseUpdate(String body) {
        return parse(body, true);
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
        String title = title(root, errors);
        String description = description(root, update, errors);
        GroupColor color = color(root, update, errors);
        Long version = update ? version(root, errors) : null;
        GroupInput input = errors.isEmpty() ? new GroupInput(title, description, color) : null;
        return new Parsed(input, version, List.copyOf(errors));
    }

    private static String title(JsonNode root, List<FieldError> errors) {
        JsonNode node = root.get("title");
        if (node == null || node.isNull()) {
            errors.add(new FieldError("title", "REQUIRED"));
            return null;
        }
        if (!node.isString()) {
            errors.add(new FieldError("title", "INVALID_VALUE"));
            return null;
        }
        String title = node.asString().strip();
        if (title.isEmpty()) {
            errors.add(new FieldError("title", "REQUIRED"));
        } else if (length(title) > TITLE_MAX) {
            errors.add(new FieldError("title", "TOO_LONG"));
        }
        return title;
    }

    private static String description(JsonNode root, boolean update, List<FieldError> errors) {
        if (!root.has("description")) {
            if (update) {
                errors.add(new FieldError("description", "REQUIRED"));
            }
            return null;
        }
        JsonNode node = root.get("description");
        if (node.isNull()) {
            return null;
        }
        if (!node.isString()) {
            errors.add(new FieldError("description", "INVALID_VALUE"));
            return null;
        }
        String description = node.asString();
        if (description.isBlank()) {
            return null;
        }
        if (length(description) > DESCRIPTION_MAX) {
            errors.add(new FieldError("description", "TOO_LONG"));
        }
        return description;
    }

    private static GroupColor color(JsonNode root, boolean update, List<FieldError> errors) {
        JsonNode node = root.get("color");
        if (node == null || node.isNull()) {
            if (update) {
                errors.add(new FieldError("color", "REQUIRED"));
                return null;
            }
            return GroupColor.DEFAULT;
        }
        if (!node.isString()) {
            errors.add(new FieldError("color", "INVALID_VALUE"));
            return null;
        }
        return GroupColor.fromCode(node.asString()).orElseGet(() -> {
            errors.add(new FieldError("color", "INVALID_VALUE"));
            return null;
        });
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

    private static int length(String text) {
        return text.codePointCount(0, text.length());
    }

    private static Parsed malformed() {
        return new Parsed(null, null, List.of(new FieldError("body", "MALFORMED")));
    }
}
