package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Telesi {@code POST …/imports/preview} in {@code POST …/imports} (contracts/openapi.yaml). Potrditev ne zaupa
 * predogledu (research R-04): vsak kontakt gre skozi {@link ContactInputParser} (pravila 004/013; država samo kot
 * veljavna koda ISO, besedilo države je {@code UNKNOWN_FIELD}) in rezervirana imena; napake imajo predpono
 * {@code contacts[i].}.
 */
final class ImportInputParser {

    static final int MAX_CONTACTS = 10_000;

    enum Source {
        XLSX,
        VCF
    }

    record Commit(Source source, List<ContactInput> contacts) {}

    private final JsonMapper json;
    private final ContactInputParser contacts;

    ImportInputParser(JsonMapper json) {
        this.json = json;
        this.contacts = new ContactInputParser(json);
    }

    /** Kandidati predogleda (vsak element je lahko neveljaven – to pokaže predogled po vrsticah). */
    List<JsonNode> candidates(String body) {
        JsonNode root = tree(body);
        unknownFields(root, Set.of("candidates"));
        JsonNode list = root.get("candidates");
        return elements(list, "candidates");
    }

    Commit commit(String body) {
        JsonNode root = tree(body);
        unknownFields(root, Set.of("source", "contacts"));
        List<FieldError> errors = new ArrayList<>();
        Source source = null;
        JsonNode sourceNode = root.get("source");
        if (sourceNode == null || sourceNode.isNull()) {
            errors.add(new FieldError("source", "REQUIRED"));
        } else {
            try {
                source = Source.valueOf(sourceNode.isString() ? sourceNode.asString() : "");
            } catch (IllegalArgumentException e) {
                errors.add(new FieldError("source", "INVALID_VALUE"));
            }
        }
        List<JsonNode> nodes;
        try {
            nodes = elements(root.get("contacts"), "contacts");
        } catch (ValidationException e) {
            errors.addAll(e.errors());
            throw new ValidationException(errors);
        }
        List<ContactInput> inputs = new ArrayList<>(nodes.size());
        for (int i = 0; i < nodes.size(); i++) {
            String prefix = "contacts[" + i + "].";
            ContactInputParser.Parsed parsed = contacts.parseNode(nodes.get(i), false);
            for (FieldError error : parsed.errors()) {
                errors.add(new FieldError(prefix + error.field(), error.code()));
            }
            if (parsed.valid()) {
                for (FieldError error :
                        AttributeKeys.reservedErrors(parsed.input().attributes(), Set.of())) {
                    errors.add(new FieldError(prefix + error.field(), error.code()));
                }
                inputs.add(parsed.input());
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return new Commit(source, List.copyOf(inputs));
    }

    private JsonNode tree(String body) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        if (root == null || !root.isObject()) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        return root;
    }

    private static void unknownFields(JsonNode root, Set<String> allowed) {
        List<FieldError> errors = new ArrayList<>();
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!allowed.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
    }

    private static List<JsonNode> elements(JsonNode list, String field) {
        if (list == null || list.isNull() || (list.isArray() && list.isEmpty())) {
            throw new ValidationException(List.of(new FieldError(field, "REQUIRED")));
        }
        if (!list.isArray()) {
            throw new ValidationException(List.of(new FieldError(field, "INVALID_VALUE")));
        }
        if (list.size() > MAX_CONTACTS) {
            throw new ValidationException(List.of(new FieldError(field, "TOO_MANY")));
        }
        List<JsonNode> nodes = new ArrayList<>(list.size());
        list.forEach(nodes::add);
        return nodes;
    }
}
