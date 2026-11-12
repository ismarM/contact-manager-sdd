package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenjevalnik zahtevkov dvojnikov (FR-011-13, FR-011-21; research R-06, R-07): nikoli ne vrže, napake vrne kot
 * {@code FieldError}. Rezultat združitve se preveri z istimi pravili kot ustvarjanje kontakta (004), napake dobijo
 * predpono {@code result.}.
 */
public final class MergeInputParser {

    /** Največ kontaktov v primerjavi in združitvi (D-93, FR-011-21). */
    public static final int MAX_CONTACTS = 10;

    private static final int MIN_CONTACTS = 2;
    private static final Set<String> MERGE_FIELDS = Set.of("contacts", "result");
    private static final Pattern UUID_TEXT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    /** Rezultat: {@code value} je {@code null} ob kateri koli napaki. */
    public record Parsed<T>(T value, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    private final JsonMapper json;
    private final ContactInputParser contactParser;

    public MergeInputParser() {
        this(JsonMapper.builder().build());
    }

    public MergeInputParser(JsonMapper json) {
        this.json = json;
        this.contactParser = new ContactInputParser(json);
    }

    /** Telo {@code merge}: {@code contacts} (2–10) in {@code result}. */
    public Parsed<MergeInput> parseMerge(String body) {
        JsonNode root = root(body);
        if (root == null) {
            return failed(List.of(new FieldError("body", "MALFORMED")));
        }
        List<FieldError> errors = new ArrayList<>();
        List<MergeInput.Target> targets = structure(root, errors);
        ContactInput result = result(root.get("result"), errors);
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(new MergeInput(List.copyOf(targets), result), List.of());
    }

    /**
     * Samo zgradba telesa (korak 400 pred preverjanjem verzij): neznana polja na vrhu in {@code contacts}; vrednosti
     * {@code result} se ne preverjajo (to je zadnji korak, {@link #parseResult}).
     */
    public Parsed<List<MergeInput.Target>> parseTargets(String body) {
        JsonNode root = root(body);
        if (root == null) {
            return failed(List.of(new FieldError("body", "MALFORMED")));
        }
        List<FieldError> errors = new ArrayList<>();
        List<MergeInput.Target> targets = structure(root, errors);
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(List.copyOf(targets), List.of());
    }

    /** Samo {@code result} (slovar podatkov kot pri ustvarjanju kontakta); napake imajo predpono {@code result.}. */
    public Parsed<ContactInput> parseResult(String body) {
        JsonNode root = root(body);
        if (root == null) {
            return failed(List.of(new FieldError("body", "MALFORMED")));
        }
        List<FieldError> errors = new ArrayList<>();
        ContactInput result = result(root.get("result"), errors);
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(result, List.of());
    }

    private JsonNode root(String body) {
        try {
            JsonNode root = json.readTree(body == null ? "" : body);
            return root != null && root.isObject() ? root : null;
        } catch (JacksonException e) {
            return null;
        }
    }

    private List<MergeInput.Target> structure(JsonNode root, List<FieldError> errors) {
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!MERGE_FIELDS.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        return targets(root.get("contacts"), errors);
    }

    /**
     * Veljavne identitete iz parametra {@code ids} za korak 404 (pred 403); pri več kot {@link #MAX_CONTACTS}
     * različnih vrne {@code null} (baza se ne obišče).
     */
    public Set<UUID> identities(List<String> values) {
        Set<UUID> found = new LinkedHashSet<>();
        for (String value : values == null ? List.<String>of() : values) {
            for (String part : value.split(",", -1)) {
                String text = part.strip();
                if (UUID_TEXT.matcher(text).matches()) {
                    found.add(UUID.fromString(text));
                    if (found.size() > MAX_CONTACTS) {
                        return null;
                    }
                }
            }
        }
        return found;
    }

    /** Vrednosti parametra {@code ids} (ponovljen parameter ali vejice): 2–10 različnih UUID. */
    public Parsed<List<UUID>> parseIds(List<String> values) {
        List<FieldError> errors = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        Set<UUID> seen = new LinkedHashSet<>();
        int count = 0;
        boolean invalid = false;
        boolean duplicate = false;
        for (String value : values == null ? List.<String>of() : values) {
            for (String part : value.split(",", -1)) {
                String text = part.strip();
                if (text.isEmpty()) {
                    continue;
                }
                count++;
                if (!UUID_TEXT.matcher(text).matches()) {
                    invalid = true;
                    continue;
                }
                UUID id = UUID.fromString(text);
                if (!seen.add(id)) {
                    duplicate = true;
                } else {
                    ids.add(id);
                }
            }
        }
        if (count > MAX_CONTACTS) {
            errors.add(new FieldError("ids", "TOO_MANY"));
        }
        if (invalid) {
            errors.add(new FieldError("ids", "INVALID_VALUE"));
        }
        if (duplicate) {
            errors.add(new FieldError("ids", "DUPLICATE"));
        }
        if (count < MIN_CONTACTS && errors.isEmpty()) {
            errors.add(new FieldError("ids", "REQUIRED"));
        }
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(List.copyOf(ids), List.of());
    }

    /**
     * Veljavne identitete iz telesa za korak 404 (pred 403): neveljavni zapisi se preskočijo (napake poroča
     * razčlenjevalnik). Pri več kot {@link #MAX_CONTACTS} različnih vrne {@code null}: baza se ne obišče (R-07).
     */
    public Set<UUID> identities(String body) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            return Set.of();
        }
        JsonNode list = root == null || !root.isObject() ? null : root.get("contacts");
        Set<UUID> found = new LinkedHashSet<>();
        if (list == null || !list.isArray()) {
            return found;
        }
        for (JsonNode item : list) {
            JsonNode id = item.isObject() ? item.get("id") : null;
            if (id != null && id.isString() && UUID_TEXT.matcher(id.asString()).matches()) {
                found.add(UUID.fromString(id.asString()));
                if (found.size() > MAX_CONTACTS) {
                    return null;
                }
            }
        }
        return found;
    }

    private List<MergeInput.Target> targets(JsonNode node, List<FieldError> errors) {
        List<MergeInput.Target> targets = new ArrayList<>();
        if (node == null || node.isNull() || !node.isArray() || node.isEmpty()) {
            errors.add(new FieldError(
                    "contacts", node != null && !node.isNull() && !node.isArray() ? "INVALID_VALUE" : "REQUIRED"));
            return targets;
        }
        if (node.size() > MAX_CONTACTS) {
            errors.add(new FieldError("contacts", "TOO_MANY"));
        } else if (node.size() < MIN_CONTACTS) {
            errors.add(new FieldError("contacts", "REQUIRED"));
        }
        Set<UUID> seen = new LinkedHashSet<>();
        int index = 0;
        for (JsonNode item : node) {
            String prefix = "contacts[" + index + "]";
            index++;
            if (!item.isObject()) {
                errors.add(new FieldError(prefix, "INVALID_VALUE"));
                continue;
            }
            UUID id = id(item.get("id"), prefix + ".id", errors);
            if (id != null && !seen.add(id)) {
                errors.add(new FieldError(prefix + ".id", "DUPLICATE"));
                id = null;
            }
            Long version = version(item.get("version"), prefix + ".version", errors);
            if (id != null && version != null) {
                targets.add(new MergeInput.Target(id, version));
            }
        }
        return targets;
    }

    private static UUID id(JsonNode node, String field, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError(field, "REQUIRED"));
            return null;
        }
        if (!node.isString() || !UUID_TEXT.matcher(node.asString()).matches()) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return null;
        }
        return UUID.fromString(node.asString());
    }

    private static Long version(JsonNode node, String field, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError(field, "REQUIRED"));
            return null;
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.longValue() < 0) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return null;
        }
        return node.longValue();
    }

    private ContactInput result(JsonNode node, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError("result", "REQUIRED"));
            return null;
        }
        if (!node.isObject()) {
            errors.add(new FieldError("result", "INVALID_VALUE"));
            return null;
        }
        ContactInputParser.Parsed parsed = contactParser.parseCreate(json.writeValueAsString(node));
        for (FieldError error : parsed.errors()) {
            errors.add(new FieldError("result." + error.field(), error.code()));
        }
        return parsed.input();
    }

    private static <T> Parsed<T> failed(List<FieldError> errors) {
        return new Parsed<>(null, List.copyOf(errors));
    }
}
