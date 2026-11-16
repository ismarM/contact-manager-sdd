package si.contactmanager.apikey;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Telo {@code POST /api/me/api-keys} (019 contracts/openapi.yaml – ApiKeyCreate; FR-019-01): ime 1–50 znakov po
 * obrezovanju; izbrane skupine (1–50, brez podvojenih, pravica privzeto {@code READ}) ali {@code allGroups} z eno
 * pravico (privzeto {@code READ}); {@code expiresInDays} 30, 90 (privzeto, če polja ni), 365 ali {@code null} (brez
 * roka). Napake → {@link ValidationException} (400). Id skupine se tu ne razčleni: neveljaven ali tuj id je 404.
 */
final class ApiKeyInputParser {

    static final int NAME_MAX = 50;
    static final int GROUPS_MAX = ApiKeyTokens.MAX_GROUPS;
    static final int DEFAULT_DAYS = 90;
    private static final Set<Integer> DAYS = Set.of(30, 90, 365);
    private static final Set<String> FIELDS =
            Set.of("name", "allGroups", "allGroupsPermission", "groups", "expiresInDays");
    private static final Set<String> GROUP_FIELDS = Set.of("groupId", "permission");

    /** Izbrana skupina: id, kot ga je poslal odjemalec, in pravica. */
    record GroupChoice(String groupId, Permission permission) {}

    /** {@code allGroupsPermission} ≠ {@code null} pomeni »vse moje skupine«; {@code expiresInDays} {@code null} = brez roka. */
    record Input(String name, Permission allGroupsPermission, List<GroupChoice> groups, Integer expiresInDays) {}

    private ApiKeyInputParser() {}

    static Input parse(JsonMapper json, String body) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            throw invalid("body", "MALFORMED");
        }
        if (root == null || !root.isObject()) {
            throw invalid("body", "MALFORMED");
        }
        List<FieldError> errors = new ArrayList<>();
        for (var property : root.properties()) {
            if (!FIELDS.contains(property.getKey())) {
                errors.add(new FieldError(property.getKey(), "UNKNOWN_FIELD"));
            }
        }
        String name = name(root.get("name"), errors);
        boolean all = false;
        JsonNode allNode = root.get("allGroups");
        if (allNode != null && !allNode.isNull()) {
            if (allNode.isBoolean()) {
                all = allNode.booleanValue();
            } else {
                errors.add(new FieldError("allGroups", "INVALID_VALUE"));
            }
        }
        Permission allPermission = null;
        List<GroupChoice> groups = List.of();
        JsonNode groupsNode = root.get("groups");
        JsonNode permissionNode = root.get("allGroupsPermission");
        if (all) {
            allPermission = permission(permissionNode, "allGroupsPermission", errors);
            if (groupsNode != null && !groupsNode.isNull() && !(groupsNode.isArray() && groupsNode.isEmpty())) {
                errors.add(new FieldError("groups", "INVALID_VALUE"));
            }
        } else {
            if (permissionNode != null && !permissionNode.isNull()) {
                errors.add(new FieldError("allGroupsPermission", "INVALID_VALUE"));
            }
            groups = groups(groupsNode, errors);
        }
        Integer days = days(root, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return new Input(name, allPermission, groups, days);
    }

    private static String name(JsonNode node, List<FieldError> errors) {
        if (node != null && !node.isNull() && !node.isString()) {
            errors.add(new FieldError("name", "INVALID_VALUE"));
            return null;
        }
        String name = node == null || node.isNull() ? "" : node.asString().strip();
        if (name.isEmpty()) {
            errors.add(new FieldError("name", "REQUIRED"));
        } else if (name.codePointCount(0, name.length()) > NAME_MAX) {
            errors.add(new FieldError("name", "TOO_LONG"));
        }
        return name;
    }

    private static Permission permission(JsonNode node, String field, List<FieldError> errors) {
        if (node == null || node.isNull()) {
            return Permission.READ;
        }
        if (node.isString()) {
            for (Permission permission : Permission.values()) {
                if (permission.name().equals(node.asString())) {
                    return permission;
                }
            }
        }
        errors.add(new FieldError(field, "INVALID_VALUE"));
        return Permission.READ;
    }

    private static List<GroupChoice> groups(JsonNode node, List<FieldError> errors) {
        if (node == null || node.isNull() || (node.isArray() && node.isEmpty())) {
            errors.add(new FieldError("groups", "REQUIRED"));
            return List.of();
        }
        if (!node.isArray()) {
            errors.add(new FieldError("groups", "INVALID_VALUE"));
            return List.of();
        }
        if (node.size() > GROUPS_MAX) {
            errors.add(new FieldError("groups", "TOO_MANY"));
            return List.of();
        }
        List<GroupChoice> groups = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < node.size(); i++) {
            String prefix = "groups[" + i + "]";
            JsonNode item = node.get(i);
            if (!item.isObject()) {
                errors.add(new FieldError(prefix, "INVALID_VALUE"));
                continue;
            }
            for (var property : item.properties()) {
                if (!GROUP_FIELDS.contains(property.getKey())) {
                    errors.add(new FieldError(prefix + "." + property.getKey(), "UNKNOWN_FIELD"));
                }
            }
            JsonNode id = item.get("groupId");
            Permission permission = permission(item.get("permission"), prefix + ".permission", errors);
            if (id == null || id.isNull()) {
                errors.add(new FieldError(prefix + ".groupId", "REQUIRED"));
            } else if (!id.isString()) {
                errors.add(new FieldError(prefix + ".groupId", "INVALID_VALUE"));
            } else if (!seen.add(canonical(id.asString()))) {
                errors.add(new FieldError(prefix + ".groupId", "DUPLICATE"));
            } else {
                groups.add(new GroupChoice(id.asString(), permission));
            }
        }
        return groups;
    }

    private static Integer days(JsonNode root, List<FieldError> errors) {
        if (!root.has("expiresInDays")) {
            return DEFAULT_DAYS;
        }
        JsonNode node = root.get("expiresInDays");
        if (node.isNull()) {
            return null;
        }
        if (node.isIntegralNumber() && node.canConvertToInt() && DAYS.contains(node.intValue())) {
            return node.intValue();
        }
        errors.add(new FieldError("expiresInDays", "INVALID_VALUE"));
        return null;
    }

    /** Ista skupina v drugačnem zapisu (velike črke) je podvojena. */
    private static String canonical(String id) {
        try {
            return UUID.fromString(id).toString();
        } catch (IllegalArgumentException e) {
            return id.toLowerCase(Locale.ROOT);
        }
    }

    private static ValidationException invalid(String field, String code) {
        return new ValidationException(List.of(new FieldError(field, code)));
    }
}
