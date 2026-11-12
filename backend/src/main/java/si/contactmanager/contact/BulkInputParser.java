package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import si.contactmanager.contact.BulkEditInput.AttributeSet;
import si.contactmanager.contact.BulkEditInput.Field;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenitev teles množičnih endpointov (research R-05, data-model.md); nikoli ne vrže. Vrednosti so obrezane, prazna
 * vrednost atributa pomeni odstranitev, pravila vrednosti so slovar §2.6 iz {@link ContactInputParser}. Napake
 * podatkov se po feature-map §2.2 sporočijo šele po preverjanju dostopa (to opravi klicatelj).
 */
public final class BulkInputParser {

    /** Največ identitet v izboru (FR-009-04). */
    public static final int MAX_IDS = 10_000;

    static final int MAX_QUERIES = 20;
    static final int MAX_ATTRIBUTES = 10;

    private static final Pattern UUID_TEXT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Set<String> UPDATE_FIELDS = Set.of("contactIds", "addTags", "removeTags", "attributes");
    private static final Set<String> DELETE_FIELDS = Set.of("contactIds");
    private static final Set<String> CHECK_FIELDS = Set.of("contactIds", "queries");
    private static final Set<String> QUERY_FIELDS = Set.of("q", "f", "tag", "contactIds", "excludedIds");
    private static final Set<String> ATTRIBUTE_FIELDS = Set.of("field", "key", "value");

    /** Rezultat: {@code value} je {@code null} ob kateri koli napaki. */
    public record Parsed<T>(T value, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    private final JsonMapper json;
    private final ContactQueryParser queryParser = new ContactQueryParser();

    public BulkInputParser() {
        this(JsonMapper.builder().build());
    }

    public BulkInputParser(JsonMapper json) {
        this.json = json;
    }

    public Parsed<BulkEditInput> parseUpdate(String body) {
        List<FieldError> errors = new ArrayList<>();
        JsonNode root = root(body, errors);
        if (root == null) {
            return failed(errors);
        }
        unknown(root, UPDATE_FIELDS, "", errors);
        List<UUID> ids = ids(root.get("contactIds"), "contactIds", true, errors);
        int before = errors.size();
        List<String> addTags = tags(root.get("addTags"), "addTags", errors);
        List<String> removeTags = tags(root.get("removeTags"), "removeTags", errors);
        Set<String> added = new HashSet<>();
        addTags.forEach(t -> added.add(ContactInputParser.normalize(t)));
        for (int i = 0; i < removeTags.size(); i++) {
            if (added.contains(ContactInputParser.normalize(removeTags.get(i)))) {
                errors.add(new FieldError("removeTags[" + i + "]", "DUPLICATE"));
            }
        }
        List<AttributeSet> attributes = attributes(root.get("attributes"), errors);
        if (errors.size() == before && addTags.isEmpty() && removeTags.isEmpty() && attributes.isEmpty()) {
            errors.add(new FieldError("body", "EMPTY_OPERATION"));
        }
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(new BulkEditInput(ids, addTags, removeTags, attributes), List.of());
    }

    public Parsed<BulkTarget> parseDelete(String body) {
        List<FieldError> errors = new ArrayList<>();
        JsonNode root = root(body, errors);
        if (root == null) {
            return failed(errors);
        }
        unknown(root, DELETE_FIELDS, "", errors);
        List<UUID> ids = ids(root.get("contactIds"), "contactIds", true, errors);
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(new BulkTarget(ids), List.of());
    }

    public Parsed<SelectionCheck.Request> parseCheck(String body) {
        List<FieldError> errors = new ArrayList<>();
        JsonNode root = root(body, errors);
        if (root == null) {
            return failed(errors);
        }
        unknown(root, CHECK_FIELDS, "", errors);
        List<UUID> ids = ids(root.get("contactIds"), "contactIds", true, errors);
        List<SelectionCheck.Query> queries = new ArrayList<>();
        JsonNode node = root.get("queries");
        if (node != null && !node.isNull()) {
            if (!node.isArray()) {
                errors.add(new FieldError("queries", "INVALID_VALUE"));
            } else {
                if (node.size() > MAX_QUERIES) {
                    errors.add(new FieldError("queries", "TOO_MANY"));
                }
                int index = 0;
                long added = 0;
                long excluded = 0;
                for (JsonNode item : node) {
                    SelectionCheck.Query query = query(item, "queries[" + index + "]", errors);
                    index++;
                    if (query != null) {
                        added += query.contactIds().size();
                        excluded += query.excludedIds().size();
                        queries.add(query);
                    }
                }
                if (added > MAX_IDS || excluded > MAX_IDS) {
                    errors.add(new FieldError("queries", "TOO_MANY"));
                }
            }
        }
        if (!errors.isEmpty()) {
            return failed(errors);
        }
        return new Parsed<>(new SelectionCheck.Request(ids, List.copyOf(queries)), List.of());
    }

    /**
     * Veljavne identitete iz poljubnega telesa za korak 2 (404 pred 403): iz {@code contactIds} in, če jih je, iz
     * {@code queries[].contactIds} in {@code queries[].excludedIds}; neveljavni zapisi se preskočijo, napake poroča
     * šele razčlenjevalnik. Pri več kot {@code limit} različnih identitetah vrne {@code null} (razčlenjevalnik bo telo
     * zavrnil, baza se ne obišče, R-15).
     */
    public Set<UUID> identities(String body, boolean withQueries, int limit) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            return Set.of();
        }
        if (root == null || !root.isObject()) {
            return Set.of();
        }
        Set<UUID> found = new LinkedHashSet<>();
        if (!collect(root.get("contactIds"), found, limit)) {
            return null;
        }
        JsonNode queries = root.get("queries");
        if (withQueries && queries != null && queries.isArray()) {
            for (JsonNode query : queries) {
                if (query.isObject()
                        && (!collect(query.get("contactIds"), found, limit)
                                || !collect(query.get("excludedIds"), found, limit))) {
                    return null;
                }
            }
        }
        return found;
    }

    private static boolean collect(JsonNode list, Set<UUID> found, int limit) {
        if (list == null || !list.isArray()) {
            return true;
        }
        for (JsonNode item : list) {
            if (item.isString() && UUID_TEXT.matcher(item.asString()).matches()) {
                found.add(UUID.fromString(item.asString()));
                if (found.size() > limit) {
                    return false;
                }
            }
        }
        return true;
    }

    private JsonNode root(String body, List<FieldError> errors) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            root = null;
        }
        if (root == null || !root.isObject()) {
            errors.add(new FieldError("body", "MALFORMED"));
            return null;
        }
        return root;
    }

    private static <T> Parsed<T> failed(List<FieldError> errors) {
        return new Parsed<>(null, List.copyOf(errors));
    }

    private static void unknown(JsonNode node, Set<String> allowed, String prefix, List<FieldError> errors) {
        for (Map.Entry<String, JsonNode> property : node.properties()) {
            if (!allowed.contains(property.getKey())) {
                errors.add(new FieldError(prefix + property.getKey(), "UNKNOWN_FIELD"));
            }
        }
    }

    /** Identitete: UUID, podvojene zlite, 1–10 000 (ob {@code required} vsaj ena). */
    private static List<UUID> ids(JsonNode node, String field, boolean required, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            if (required) {
                errors.add(new FieldError(field, "REQUIRED"));
            }
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return List.of();
        }
        Set<UUID> ids = new LinkedHashSet<>();
        int index = 0;
        for (JsonNode item : node) {
            if (!item.isString() || !UUID_TEXT.matcher(item.asString()).matches()) {
                errors.add(new FieldError(field + "[" + index + "]", "INVALID_VALUE"));
            } else {
                ids.add(UUID.fromString(item.asString()));
            }
            index++;
        }
        if (ids.size() > MAX_IDS) {
            errors.add(new FieldError(field, "TOO_MANY"));
        } else if (required && ids.isEmpty() && node.size() == 0) {
            errors.add(new FieldError(field, "REQUIRED"));
        }
        return List.copyOf(ids);
    }

    /** Seznam značk: do 30, vsaka 1–50 znakov brez presledkov; podvojene (ne glede na velikost črk) se zlijejo. */
    private static List<String> tags(JsonNode node, String field, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return List.of();
        }
        if (node.size() > ContactInputParser.TAGS_MAX) {
            errors.add(new FieldError(field, "TOO_MANY"));
        }
        List<String> tags = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int index = 0;
        for (JsonNode item : node) {
            String name = field + "[" + index + "]";
            index++;
            if (!item.isString()) {
                errors.add(new FieldError(name, "INVALID_VALUE"));
                continue;
            }
            String tag = item.asString().strip();
            if (tag.isEmpty()) {
                errors.add(new FieldError(name, "REQUIRED"));
            } else if (ContactInputParser.WHITESPACE.matcher(tag).find()) {
                errors.add(new FieldError(name, "INVALID_VALUE"));
            } else if (ContactInputParser.length(tag) > ContactInputParser.TAG_MAX) {
                errors.add(new FieldError(name, "TOO_LONG"));
            } else if (seen.add(ContactInputParser.normalize(tag))) {
                tags.add(tag);
            }
        }
        return List.copyOf(tags);
    }

    private static List<AttributeSet> attributes(JsonNode node, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError("attributes", "INVALID_VALUE"));
            return List.of();
        }
        if (node.size() > MAX_ATTRIBUTES) {
            errors.add(new FieldError("attributes", "TOO_MANY"));
        }
        List<AttributeSet> result = new ArrayList<>();
        Set<String> used = new HashSet<>();
        int index = 0;
        for (JsonNode row : node) {
            String prefix = "attributes[" + index + "]";
            index++;
            if (!row.isObject()) {
                errors.add(new FieldError(prefix, "INVALID_VALUE"));
                continue;
            }
            unknown(row, ATTRIBUTE_FIELDS, prefix + ".", errors);
            Field field = field(row.get("field"), prefix, errors);
            String key = key(row.get("key"), field, prefix, used, errors);
            if (field != null && field != Field.CUSTOM && !used.add(field.name())) {
                errors.add(new FieldError(prefix + ".field", "DUPLICATE"));
            }
            String value = value(row.get("value"), field, prefix, errors);
            if (field != null && value != null) {
                result.add(new AttributeSet(field, field == Field.CUSTOM ? key : null, value));
            }
        }
        return List.copyOf(result);
    }

    private static Field field(JsonNode node, String prefix, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError(prefix + ".field", "REQUIRED"));
            return null;
        }
        String text = node.isString() ? node.asString() : "";
        Field field = switch (text) {
            case "address" -> Field.ADDRESS;
            case "email" -> Field.EMAIL;
            case "phone" -> Field.PHONE;
            case "custom" -> Field.CUSTOM;
            default -> null;
        };
        if (field == null) {
            errors.add(new FieldError(prefix + ".field", "INVALID_VALUE"));
        }
        return field;
    }

    /** Ključ: obvezen samo pri {@code custom}, pri predefiniranih poljih ni dovoljen (D-75). */
    private static String key(JsonNode node, Field field, String prefix, Set<String> used, List<FieldError> errors) {
        String name = prefix + ".key";
        boolean present = node != null && !node.isNull();
        if (present && !node.isString()) {
            errors.add(new FieldError(name, "INVALID_VALUE"));
            return null;
        }
        String key = present ? node.asString().strip() : "";
        if (field == null) {
            return null;
        }
        if (field != Field.CUSTOM) {
            if (!key.isEmpty()) {
                errors.add(new FieldError(name, "INVALID_VALUE"));
            }
            return null;
        }
        String normalized = ContactInputParser.normalize(key);
        if (key.isEmpty()) {
            errors.add(new FieldError(name, "REQUIRED"));
        } else if (ContactInputParser.length(key) > ContactInputParser.KEY_MAX) {
            errors.add(new FieldError(name, "TOO_LONG"));
        } else if (ContactInputParser.RESERVED_KEYS.contains(
                ContactInputParser.SPACES.matcher(normalized).replaceAll(" "))) {
            errors.add(new FieldError(name, "RESERVED_KEY"));
        } else if (!used.add("custom:" + normalized)) {
            errors.add(new FieldError(name, "DUPLICATE"));
        }
        return key;
    }

    /** Vrednost: obrezana, prazna je veljavna (odstrani / izprazni); neprazna po pravilih slovarja polja. */
    private static String value(JsonNode node, Field field, String prefix, List<FieldError> errors) {
        String name = prefix + ".value";
        if (node == null || node.isNull()) {
            errors.add(new FieldError(name, "REQUIRED"));
            return null;
        }
        if (!node.isString()) {
            errors.add(new FieldError(name, "INVALID_VALUE"));
            return null;
        }
        String value = node.asString().replace("\r\n", "\n").replace('\r', '\n').strip();
        if (value.isEmpty() || field == null) {
            return value;
        }
        int length = ContactInputParser.length(value);
        switch (field) {
            case ADDRESS -> {
                if (length > ContactInputParser.ADDRESS_MAX) {
                    errors.add(new FieldError(name, "TOO_LONG"));
                }
            }
            case EMAIL -> {
                if (length > ContactInputParser.EMAIL_MAX) {
                    errors.add(new FieldError(name, "TOO_LONG"));
                } else if (!ContactInputParser.EMAIL.matcher(value).matches()) {
                    errors.add(new FieldError(name, "INVALID_VALUE"));
                }
            }
            case PHONE -> {
                if (length > ContactInputParser.PHONE_MAX) {
                    errors.add(new FieldError(name, "TOO_LONG"));
                } else if (!ContactInputParser.PHONE.matcher(value).matches()) {
                    errors.add(new FieldError(name, "INVALID_VALUE"));
                }
            }
            case CUSTOM -> {
                if (length > ContactInputParser.VALUE_MAX) {
                    errors.add(new FieldError(name, "TOO_LONG"));
                }
            }
        }
        return value;
    }

    /** Poizvedba izbora; napake pravil 008 imajo predpono {@code queries[i].}. */
    private SelectionCheck.Query query(JsonNode node, String prefix, List<FieldError> errors) {
        if (!node.isObject()) {
            errors.add(new FieldError(prefix, "INVALID_VALUE"));
            return null;
        }
        unknown(node, QUERY_FIELDS, prefix + ".", errors);
        int before = errors.size();
        Map<String, List<String>> parameters = new LinkedHashMap<>();
        String q = null;
        JsonNode qNode = node.get("q");
        if (qNode != null && !qNode.isNull()) {
            if (qNode.isString()) {
                q = qNode.asString();
                parameters.put("q", List.of(q));
            } else {
                errors.add(new FieldError(prefix + ".q", "INVALID_VALUE"));
            }
        }
        List<String> f = strings(node.get("f"), prefix + ".f", errors);
        List<String> tag = strings(node.get("tag"), prefix + ".tag", errors);
        parameters.put("f", f);
        parameters.put("tag", tag);
        if (errors.size() == before) {
            for (FieldError error : queryParser.parse(parameters).errors()) {
                errors.add(new FieldError(prefix + "." + error.field(), error.code()));
            }
        }
        List<UUID> contactIds = ids(node.get("contactIds"), prefix + ".contactIds", false, errors);
        List<UUID> excluded = ids(node.get("excludedIds"), prefix + ".excludedIds", false, errors);
        return errors.size() == before ? new SelectionCheck.Query(q, f, tag, contactIds, excluded) : null;
    }

    private static List<String> strings(JsonNode node, String field, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return List.of();
        }
        List<String> values = new ArrayList<>();
        int index = 0;
        for (JsonNode item : node) {
            if (item.isString()) {
                values.add(item.asString());
            } else {
                errors.add(new FieldError(field + "[" + index + "]", "INVALID_VALUE"));
            }
            index++;
        }
        return List.copyOf(values);
    }
}
