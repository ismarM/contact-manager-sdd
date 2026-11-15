package si.contactmanager.audit;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.audit.HistoryViews.Compare;
import si.contactmanager.audit.HistoryViews.History;
import si.contactmanager.audit.HistoryViews.RestorePreview;
import si.contactmanager.audit.HistoryViews.Version;
import si.contactmanager.audit.RestoreService.Request;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Zgodovina, različice, primerjava, predogled in obnova kontakta (015, plan.md – REST endpoints). Branje: VIEWER, tudi v
 * arhivirani skupini. Obnova (§2.2): 404 skupine ali kontakta → 403 (pod EDITOR) → GROUP_ARCHIVED → 400 → 404 različice
 * → VERSION_CONFLICT → RESTORE_NOT_ALLOWED → RESTORE_NO_CHANGES.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/contacts/{contactId}")
class ContactHistoryController {

    private final ContactHistoryService service;
    private final RestoreService restores;
    private final GroupAccess access;
    private final JsonMapper json;

    ContactHistoryController(
            ContactHistoryService service, RestoreService restores, GroupAccess access, JsonMapper json) {
        this.service = service;
        this.restores = restores;
        this.access = access;
        this.json = json;
    }

    @GetMapping("/history")
    History history(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = AuditParams.id(contactId);
        service.known(membership, contact);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = AuditParams.page(page, errors);
        Integer pageSize = AuditParams.size(size, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.history(membership, contact, pageNumber, pageSize);
    }

    @GetMapping("/versions/{ref}")
    Version version(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @PathVariable String ref) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        return service.version(membership, AuditParams.id(contactId), ref);
    }

    @GetMapping("/compare")
    Compare compare(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = AuditParams.id(contactId);
        service.known(membership, contact);
        List<FieldError> errors = new ArrayList<>();
        if (from == null || from.isBlank()) {
            errors.add(new FieldError("from", "REQUIRED"));
        }
        if (to == null || to.isBlank()) {
            errors.add(new FieldError("to", "REQUIRED"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.compare(membership, contact, from, to);
    }

    @GetMapping("/restore-preview")
    RestorePreview preview(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String from) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = AuditParams.id(contactId);
        service.known(membership, contact);
        if (from == null || from.isBlank()) {
            throw new ValidationException(List.of(new FieldError("from", "REQUIRED")));
        }
        return service.preview(membership, contact, from);
    }

    @PostMapping("/restore")
    ResponseEntity<AuditEntry> restore(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = AuditParams.id(contactId);
        service.known(membership, contact);
        if (!membership.role().atLeast(Role.EDITOR)) {
            throw new ForbiddenException();
        }
        if (membership.archived()) {
            throw new GroupArchivedException();
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(restores.restore(membership, contact, parse(body)));
    }

    /** Telo {@code {"from", "version"?, "lastEntryId"?}}: manjkajoč {@code from} → REQUIRED, napačna oblika → INVALID_VALUE. */
    private Request parse(String body) {
        if (body == null || body.isBlank()) {
            throw new ValidationException(List.of(new FieldError("from", "REQUIRED")));
        }
        JsonNode root;
        try {
            root = json.readTree(body);
        } catch (RuntimeException e) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        if (root == null || !root.isObject()) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        List<FieldError> errors = new ArrayList<>();
        String from = null;
        JsonNode fromNode = root.get("from");
        if (fromNode == null || fromNode.isNull()) {
            errors.add(new FieldError("from", "REQUIRED"));
        } else if (!fromNode.isString() || !validRef(fromNode.asString())) {
            errors.add(new FieldError("from", "INVALID_VALUE"));
        } else {
            from = fromNode.asString();
        }
        Long version = null;
        JsonNode versionNode = root.get("version");
        if (versionNode != null && !versionNode.isNull()) {
            if (!versionNode.isIntegralNumber()) {
                errors.add(new FieldError("version", "INVALID_VALUE"));
            } else {
                version = versionNode.asLong();
            }
        }
        UUID last = null;
        JsonNode lastNode = root.get("lastEntryId");
        if (lastNode != null && !lastNode.isNull()) {
            try {
                last = lastNode.isString() ? UUID.fromString(lastNode.asString()) : null;
            } catch (IllegalArgumentException e) {
                last = null;
            }
            if (last == null) {
                errors.add(new FieldError("lastEntryId", "INVALID_VALUE"));
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return new Request(from, version, last);
    }

    private static boolean validRef(String ref) {
        if ("initial".equals(ref)) {
            return true;
        }
        try {
            UUID.fromString(ref);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
