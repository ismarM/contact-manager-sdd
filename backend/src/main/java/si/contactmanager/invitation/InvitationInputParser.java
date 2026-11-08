package si.contactmanager.invitation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenitev telesa {@code POST /api/groups/{groupId}/invitations} (research R-07): {@code email} obrezan, 1–254 znakov
 * (kodne točke), veljavna oblika; {@code role} je znana vloga (tudi {@code OWNER} in {@code ADMIN} – o njiju odloča
 * servis s 403). Nikoli ne vrže: napake podatkov se sporočijo šele po preverjanju dostopa (feature-map §2.2).
 */
public final class InvitationInputParser {

    static final int EMAIL_MAX = 254;

    private static final Set<String> FIELDS = Set.of("email", "role");
    private static final Set<String> ROLES = Set.of("VIEWER", "EDITOR", "ADMIN", "OWNER");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    /** Rezultat razčlenjevanja: {@code role} je znana vloga ali {@code null}; napake po poljih. */
    public record Parsed(String email, String role, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    private final JsonMapper json;

    public InvitationInputParser() {
        this(JsonMapper.builder().build());
    }

    public InvitationInputParser(JsonMapper json) {
        this.json = json;
    }

    public Parsed parse(String body) {
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
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!FIELDS.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        String email = email(root.get("email"), errors);
        String role = role(root.get("role"), errors);
        return new Parsed(errors.isEmpty() ? email : null, errors.isEmpty() ? role : null, List.copyOf(errors));
    }

    private static Parsed malformed() {
        return new Parsed(null, null, List.of(new FieldError("body", "MALFORMED")));
    }

    private static String email(JsonNode node, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError("email", "REQUIRED"));
            return null;
        }
        if (!node.isString()) {
            errors.add(new FieldError("email", "INVALID_VALUE"));
            return null;
        }
        String email = node.asString().strip();
        if (email.isEmpty()) {
            errors.add(new FieldError("email", "REQUIRED"));
        } else if (email.codePointCount(0, email.length()) > EMAIL_MAX) {
            errors.add(new FieldError("email", "TOO_LONG"));
        } else if (!EMAIL.matcher(email).matches()) {
            errors.add(new FieldError("email", "INVALID_VALUE"));
        } else {
            return email;
        }
        return null;
    }

    private static String role(JsonNode node, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError("role", "REQUIRED"));
            return null;
        }
        if (!node.isString() || !ROLES.contains(node.asString())) {
            errors.add(new FieldError("role", "INVALID_VALUE"));
            return null;
        }
        return node.asString();
    }
}
