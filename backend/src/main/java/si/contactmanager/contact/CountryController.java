package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Prepoznavanje držav iz besedila (plan.md – REST endpoints; FR-013-19, -20): za prijavljenega uporabnika, brez
 * podatkov skupin, zato brez članstva. Nikoli ne spremeni podatkov.
 */
@RestController
@RequestMapping("/api/countries")
class CountryController {

    private static final int MAX_VALUES = 50;
    private static final int MAX_LENGTH = 100;

    /** Izid za eno vrednost; {@code code} samo pri {@code FOUND}, {@code candidates} samo pri {@code AMBIGUOUS}. */
    record Result(String input, String status, String code, List<String> candidates) {}

    record Results(List<Result> results) {}

    private final JsonMapper json;

    CountryController(JsonMapper json) {
        this.json = json;
    }

    @PostMapping("/resolve")
    Results resolve(@RequestBody(required = false) String body) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            throw malformed();
        }
        if (root == null || !root.isObject()) {
            throw malformed();
        }
        JsonNode values = root.get("values");
        if (values == null || values.isNull()) {
            throw new ValidationException(List.of(new FieldError("values", "REQUIRED")));
        }
        if (!values.isArray()) {
            throw new ValidationException(List.of(new FieldError("values", "INVALID_VALUE")));
        }
        List<FieldError> errors = new ArrayList<>();
        List<String> texts = new ArrayList<>();
        if (values.size() > MAX_VALUES) {
            errors.add(new FieldError("values", "TOO_MANY"));
        }
        for (int i = 0; i < values.size(); i++) {
            JsonNode value = values.get(i);
            if (!value.isString()) {
                errors.add(new FieldError("values[" + i + "]", "INVALID_VALUE"));
            } else if (value.asString().codePointCount(0, value.asString().length()) > MAX_LENGTH) {
                errors.add(new FieldError("values[" + i + "]", "TOO_LONG"));
            } else {
                texts.add(value.asString());
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        List<Result> results = new ArrayList<>();
        for (String text : texts) {
            results.add(
                    switch (CountryNames.resolve(text)) {
                        case CountryNames.Resolution.Found found -> new Result(text, "FOUND", found.code(), null);
                        case CountryNames.Resolution.Ambiguous ambiguous ->
                            new Result(text, "AMBIGUOUS", null, ambiguous.candidates());
                        case CountryNames.Resolution.Unknown unknown -> new Result(text, "UNKNOWN", null, null);
                    });
        }
        return new Results(results);
    }

    private static ValidationException malformed() {
        return new ValidationException(List.of(new FieldError("body", "MALFORMED")));
    }
}
