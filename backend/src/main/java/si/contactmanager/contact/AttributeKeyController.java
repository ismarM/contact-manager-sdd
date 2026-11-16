package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Ključi atributov skupine (016; plan.md – Public Interfaces). Seznam: vsak član, tudi v arhivirani skupini (401 → 404
 * → 400). Sprememba tipa: urednik ali višje v nearhivirani skupini (401 → 404 → 403 → 409 {@code GROUP_ARCHIVED} →
 * 400 → 404 ključa → 409). Ključi so samo te skupine.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/attribute-keys")
class AttributeKeyController {

    private static final int Q_MAX = 50;
    private static final List<Integer> SIZES = List.of(25, 50, 100);

    private final AttributeKeyService service;
    private final GroupAccess access;
    private final JsonMapper json;

    AttributeKeyController(AttributeKeyService service, GroupAccess access, JsonMapper json) {
        this.service = service;
        this.access = access;
        this.json = json;
    }

    @GetMapping
    AttributeKeyPage list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        List<FieldError> errors = new ArrayList<>();
        String text = q == null ? "" : q.strip();
        if (text.codePointCount(0, text.length()) > Q_MAX) {
            errors.add(new FieldError("q", "TOO_LONG"));
        }
        int pageNumber = integer(page, "page", 0, errors);
        if (pageNumber < 0) {
            errors.add(new FieldError("page", "INVALID_VALUE"));
        }
        int pageSize = integer(size, "size", 25, errors);
        if (!SIZES.contains(pageSize)
                && errors.stream().noneMatch(e -> e.field().equals("size"))) {
            errors.add(new FieldError("size", "INVALID_VALUE"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.list(membership, text, pageNumber, pageSize);
    }

    @PostMapping("/change-type")
    AttributeKeyView changeType(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, true);
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            root = null;
        }
        if (root == null || !root.isObject()) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        List<FieldError> errors = new ArrayList<>();
        String key = null;
        JsonNode keyNode = root.get("key");
        if (keyNode == null
                || keyNode.isNull()
                || (keyNode.isString() && keyNode.asString().isBlank())) {
            errors.add(new FieldError("key", "REQUIRED"));
        } else if (!keyNode.isString()) {
            errors.add(new FieldError("key", "INVALID_VALUE"));
        } else {
            key = keyNode.asString().strip();
            if (ContactInputParser.length(key) > ContactInputParser.KEY_MAX) {
                errors.add(new FieldError("key", "TOO_LONG"));
            }
        }
        AttributeType type = null;
        JsonNode typeNode = root.get("type");
        if (typeNode == null || typeNode.isNull()) {
            errors.add(new FieldError("type", "REQUIRED"));
        } else {
            type = typeOf(typeNode);
            if (type == null) {
                errors.add(new FieldError("type", "INVALID_VALUE"));
            }
        }
        long version = 0;
        JsonNode versionNode = root.get("version");
        if (versionNode == null || versionNode.isNull()) {
            errors.add(new FieldError("version", "REQUIRED"));
        } else if (!versionNode.isIntegralNumber() || !versionNode.canConvertToLong() || versionNode.longValue() < 0) {
            errors.add(new FieldError("version", "INVALID_VALUE"));
        } else {
            version = versionNode.longValue();
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.changeType(membership, key, type, version);
    }

    private static AttributeType typeOf(JsonNode node) {
        if (node.isString()) {
            for (AttributeType type : AttributeType.values()) {
                if (type.name().equals(node.asString())) {
                    return type;
                }
            }
        }
        return null;
    }

    private static int integer(String value, String field, int fallback, List<FieldError> errors) {
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.strip());
        } catch (NumberFormatException e) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return fallback;
        }
    }
}
