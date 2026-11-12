package si.contactmanager.account;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Telo {@code POST /api/me/deletion} (012, FR-012-07): {@code {"email": "…"}}. Nikoli ne vrže; napake po poljih
 * ({@code REQUIRED}, {@code UNKNOWN_FIELD}, {@code body: MALFORMED}).
 */
final class DeleteAccountInputParser {

    /** {@code email} je vpisan e-naslov (neobrezan) ali {@code null}. */
    record ParsedDeletion(String email, List<FieldError> errors) {}

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private DeleteAccountInputParser() {}

    static ParsedDeletion parse(String body) {
        JsonNode root = object(body);
        if (root == null) {
            return new ParsedDeletion(null, List.of(new FieldError("body", "MALFORMED")));
        }
        List<FieldError> errors = new ArrayList<>();
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!"email".equals(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        JsonNode node = root.get("email");
        String email = null;
        if (node == null || node.isNull() || !node.isString() || node.asString().isBlank()) {
            errors.add(new FieldError("email", "REQUIRED"));
        } else {
            email = node.asString();
        }
        return new ParsedDeletion(errors.isEmpty() ? email : null, List.copyOf(errors));
    }

    /** Primerjava vpisanega e-naslova z e-naslovom računa: po obrezu in brez velikosti črk. */
    static boolean matches(String typed, String actual) {
        if (typed == null || actual == null) {
            return false;
        }
        return typed.strip().toLowerCase(Locale.ROOT).equals(actual.strip().toLowerCase(Locale.ROOT));
    }

    private static JsonNode object(String body) {
        try {
            JsonNode root = JSON.readTree(body == null ? "" : body);
            return root != null && root.isObject() ? root : null;
        } catch (JacksonException e) {
            return null;
        }
    }
}
