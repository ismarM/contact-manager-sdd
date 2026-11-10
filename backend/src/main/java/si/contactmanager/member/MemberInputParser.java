package si.contactmanager.member;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenitev teles {@code PUT …/members/{memberId}} in {@code POST …/ownership-transfer} (research R-05, R-06).
 * Nikoli ne vrže: napake podatkov se sporočijo šele po preverjanju dostopa in verzije (feature-map §2.2).
 */
final class MemberInputParser {

    private static final Set<String> ROLE_FIELDS = Set.of("role", "version");
    private static final Set<String> TRANSFER_FIELDS = Set.of("memberId");
    private static final Set<String> ROLES = Set.of("VIEWER", "EDITOR", "ADMIN", "OWNER");

    /** Rezultat razčlenjevanja vloge: {@code role} je znana vloga ali {@code null}. */
    record ParsedRole(String role, Long version, List<FieldError> errors) {}

    /** Rezultat razčlenjevanja prenosa: {@code memberId} ali {@code null}. */
    record ParsedTransfer(UUID memberId, List<FieldError> errors) {}

    private final JsonMapper json;

    MemberInputParser() {
        this(JsonMapper.builder().build());
    }

    MemberInputParser(JsonMapper json) {
        this.json = json;
    }

    ParsedRole parseRole(String body) {
        JsonNode root = object(body);
        if (root == null) {
            return new ParsedRole(null, null, malformed());
        }
        List<FieldError> errors = unknownFields(root, ROLE_FIELDS);
        String role = role(root.get("role"), errors);
        Long version = version(root.get("version"), errors);
        return new ParsedRole(role, version, List.copyOf(errors));
    }

    ParsedTransfer parseTransfer(String body) {
        JsonNode root = object(body);
        if (root == null) {
            return new ParsedTransfer(null, malformed());
        }
        List<FieldError> errors = unknownFields(root, TRANSFER_FIELDS);
        UUID memberId = null;
        JsonNode node = root.get("memberId");
        if (node == null || node.isNull()) {
            errors.add(new FieldError("memberId", "REQUIRED"));
        } else if (!node.isString()) {
            errors.add(new FieldError("memberId", "INVALID_VALUE"));
        } else {
            try {
                memberId = UUID.fromString(node.asString());
            } catch (IllegalArgumentException e) {
                errors.add(new FieldError("memberId", "INVALID_VALUE"));
            }
        }
        return new ParsedTransfer(errors.isEmpty() ? memberId : null, List.copyOf(errors));
    }

    private JsonNode object(String body) {
        try {
            JsonNode root = json.readTree(body == null ? "" : body);
            return root != null && root.isObject() ? root : null;
        } catch (JacksonException e) {
            return null;
        }
    }

    private static List<FieldError> malformed() {
        return List.of(new FieldError("body", "MALFORMED"));
    }

    private static List<FieldError> unknownFields(JsonNode root, Set<String> known) {
        List<FieldError> errors = new ArrayList<>();
        for (Map.Entry<String, JsonNode> property : root.properties()) {
            if (!known.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        return errors;
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

    private static Long version(JsonNode node, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            errors.add(new FieldError("version", "REQUIRED"));
            return null;
        }
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.asLong() < 0) {
            errors.add(new FieldError("version", "INVALID_VALUE"));
            return null;
        }
        return node.asLong();
    }
}
