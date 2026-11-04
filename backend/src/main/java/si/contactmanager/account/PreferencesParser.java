package si.contactmanager.account;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Branje telesa {@code {"language": …, "theme": …}} (contracts/openapi.yaml – Preferences): obe polji obvezni,
 * {@code null} dovoljen, druga polja niso dovoljena. Vse napake se zberejo v en {@code 400 VALIDATION_FAILED}.
 */
final class PreferencesParser {

    private static final Set<String> FIELDS = Set.of("language", "theme");

    private final JsonMapper json;

    PreferencesParser(JsonMapper json) {
        this.json = json;
    }

    Preferences parse(String body) {
        JsonNode root;
        try {
            root = json.readTree(body);
        } catch (JacksonException e) {
            throw invalid("body", "MALFORMED");
        }
        if (root == null || !root.isObject()) {
            throw invalid("body", "MALFORMED");
        }
        List<FieldError> errors = new ArrayList<>();
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!FIELDS.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        Language language = read(root, "language", Language::fromCode, errors);
        Theme theme = read(root, "theme", Theme::fromCode, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return new Preferences(language, theme);
    }

    private static <T> T read(
            JsonNode root, String field, Function<String, Optional<T>> fromCode, List<FieldError> errors) {
        if (!root.has(field)) {
            errors.add(new FieldError(field, "REQUIRED"));
            return null;
        }
        JsonNode value = root.get(field);
        if (value.isNull()) {
            return null;
        }
        Optional<T> parsed = value.isString() ? fromCode.apply(value.asString()) : Optional.empty();
        if (parsed.isEmpty()) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return null;
        }
        return parsed.get();
    }

    private static ValidationException invalid(String field, String code) {
        return new ValidationException(List.of(new FieldError(field, code)));
    }
}
