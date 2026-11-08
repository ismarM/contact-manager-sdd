package si.contactmanager.audit;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
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
import si.contactmanager.audit.AuditRepository.Filter;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Endpointi revizijske sledi (plan.md – REST endpoints). Branje: {@link GroupAccess} z VIEWER (tudi v arhivirani
 * skupini); neveljaven {@code entryId} je 404. Rollback je dodan v US3.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/audit")
class AuditController {

    private static final int DEFAULT_SIZE = 25;
    private static final Set<Integer> PAGE_SIZES = Set.of(25, 50, 100);

    private final AuditService service;
    private final RollbackService rollbacks;
    private final GroupAccess access;
    private final JsonMapper json;

    AuditController(AuditService service, RollbackService rollbacks, GroupAccess access, JsonMapper json) {
        this.service = service;
        this.rollbacks = rollbacks;
        this.access = access;
        this.json = json;
    }

    /** Stran vnosov, najnovejši zgoraj (FR-005-07, -09, -10, -14). */
    @GetMapping
    AuditPage list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) List<String> action,
            @RequestParam(required = false) String contact) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = parsePage(page, errors);
        Integer pageSize = parseSize(size, errors);
        List<AuditAction> actions = parseActions(action, errors);
        UUID contactId = parseContact(contact, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.list(membership, new Filter(actions, contactId), pageNumber, pageSize);
    }

    /** En vnos (FR-005-12, FR-005-19). */
    @GetMapping("/{entryId}")
    AuditEntry get(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, @PathVariable String entryId) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        return service.entry(membership, parseEntry(entryId));
    }

    /** Prizadeti kontakti vnosa s spremenjenimi polji (FR-005-02, FR-005-08). */
    @GetMapping("/{entryId}/changes")
    ChangePage changes(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String entryId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID entry = parseEntry(entryId);
        service.entry(membership, entry);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = parsePage(page, errors);
        Integer pageSize = parseSize(size, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.changes(membership, entry, pageNumber, pageSize);
    }

    /**
     * Rollback na stanje takoj po vnosu (FR-005-11 … FR-005-15, -17). Vrstni red (R-09): 404 skupine ali vnosa → 403 →
     * GROUP_ARCHIVED → 400 → VERSION_CONFLICT → ROLLBACK_NO_CHANGES.
     */
    @PostMapping("/{entryId}/rollback")
    ResponseEntity<AuditEntry> rollback(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String entryId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID target = parseEntry(entryId);
        service.entry(membership, target);
        return perform(membership, target, body);
    }

    /** Rollback na {@code Začetno stanje} (FR-005-20). */
    @PostMapping("/initial-state/rollback")
    ResponseEntity<AuditEntry> rollbackInitial(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        return perform(membership, null, body);
    }

    private ResponseEntity<AuditEntry> perform(Membership membership, UUID target, String body) {
        if (!membership.role().atLeast(Role.ADMIN)) {
            throw new ForbiddenException();
        }
        if (membership.archived()) {
            throw new GroupArchivedException();
        }
        UUID latest = parseLatest(body);
        return ResponseEntity.status(HttpStatus.CREATED).body(rollbacks.rollback(membership, target, latest));
    }

    /** Telo {@code {"latestEntryId": uuid}}; manjka → REQUIRED, ni uuid → INVALID_VALUE, pokvarjeno → body MALFORMED. */
    private UUID parseLatest(String body) {
        if (body == null || body.isBlank()) {
            throw new ValidationException(List.of(new FieldError("latestEntryId", "REQUIRED")));
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
        JsonNode value = root.get("latestEntryId");
        if (value == null || value.isNull()) {
            throw new ValidationException(List.of(new FieldError("latestEntryId", "REQUIRED")));
        }
        if (!value.isString()) {
            throw new ValidationException(List.of(new FieldError("latestEntryId", "INVALID_VALUE")));
        }
        try {
            return UUID.fromString(value.asString());
        } catch (IllegalArgumentException e) {
            throw new ValidationException(List.of(new FieldError("latestEntryId", "INVALID_VALUE")));
        }
    }

    private static UUID parseEntry(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }

    private static Integer parsePage(String value, List<FieldError> errors) {
        if (value == null) {
            return 0;
        }
        try {
            int number = Integer.parseInt(value);
            if (number >= 0) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError("page", "INVALID_VALUE"));
        return null;
    }

    private static Integer parseSize(String value, List<FieldError> errors) {
        if (value == null) {
            return DEFAULT_SIZE;
        }
        try {
            int number = Integer.parseInt(value);
            if (PAGE_SIZES.contains(number)) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError("size", "INVALID_VALUE"));
        return null;
    }

    private static List<AuditAction> parseActions(List<String> values, List<FieldError> errors) {
        List<AuditAction> actions = new ArrayList<>();
        if (values == null) {
            return actions;
        }
        for (String value : values) {
            try {
                AuditAction parsed = AuditAction.valueOf(value);
                if (!actions.contains(parsed)) {
                    actions.add(parsed);
                }
            } catch (IllegalArgumentException e) {
                if (errors.stream().noneMatch(error -> error.field().equals("action"))) {
                    errors.add(new FieldError("action", "INVALID_VALUE"));
                }
            }
        }
        return actions;
    }

    private static UUID parseContact(String value, List<FieldError> errors) {
        if (value == null) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            errors.add(new FieldError("contact", "INVALID_VALUE"));
            return null;
        }
    }
}
