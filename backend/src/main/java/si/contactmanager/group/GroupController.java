package si.contactmanager.group;

import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.account.UserDirectory;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.GroupInputParser.Parsed;
import si.contactmanager.group.GroupRepository.Collation;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Endpointi skupin (plan.md – REST endpoints). {@code groupId} je niz, ki ga razčleni {@link GroupAccess} (research
 * R-01); vloge in stanje skupine preveri samo {@link GroupAccess}.
 */
@RestController
@RequestMapping("/api/groups")
class GroupController {

    private static final int DEFAULT_SIZE = 25;
    private static final int MAX_SIZE = 100;

    private final GroupService service;
    private final GroupAccess access;
    private final UserDirectory users;
    private final GroupInputParser parser;

    GroupController(GroupService service, GroupAccess access, UserDirectory users, JsonMapper json) {
        this.service = service;
        this.access = access;
        this.users = users;
        this.parser = new GroupInputParser(json);
    }

    /** Ustvarjanje skupine (FR-002-01, FR-002-02, FR-002-03). */
    @PostMapping
    ResponseEntity<GroupDetail> create(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String body) {
        Parsed parsed = parser.parseCreate(body);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(parsed.input(), users.ensure(jwt)));
    }

    /** Moje nearhivirane skupine po vlogah (FR-002-04, FR-002-05, FR-002-06). */
    @GetMapping
    GroupSections list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String lang) {
        List<FieldError> errors = new ArrayList<>();
        Role sectionRole = parseRole(role, errors);
        Integer pageNumber = parseInt(page, 0, 0, Integer.MAX_VALUE, "page", errors);
        Integer pageSize = parseInt(size, DEFAULT_SIZE, 1, MAX_SIZE, "size", errors);
        Collation collation = parseLang(lang, errors);
        if (sectionRole == null && pageNumber != null && pageNumber != 0) {
            errors.add(new FieldError("page", "INVALID_VALUE"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return users.find(jwt)
                .map(user -> service.list(user, sectionRole, pageNumber, pageSize, collation))
                .orElseGet(() -> new GroupSections(List.of()));
    }

    /** Glava in Podatki skupine (FR-002-07, FR-002-08, FR-002-10); dovoljeno tudi v arhivirani skupini. */
    @GetMapping("/{groupId}")
    GroupDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        return service.read(membership);
    }

    /** Urejanje podatkov skupine (FR-002-02, FR-002-11, FR-002-12). */
    @PutMapping("/{groupId}")
    GroupDetail update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Parsed parsed = parser.parseUpdate(body);
        Membership membership = access.require(jwt, groupId, Role.ADMIN, true);
        return service.update(membership, parsed);
    }

    /** Seznam arhiviranih skupin (FR-003-07, FR-003-08). */
    @GetMapping("/archived")
    ArchivedGroups archived(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String lang) {
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = parseInt(page, 0, 0, Integer.MAX_VALUE, "page", errors);
        Integer pageSize = parseInt(size, DEFAULT_SIZE, 1, MAX_SIZE, "size", errors);
        Collation collation = parseLang(lang, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return users.find(jwt)
                .map(user -> service.listArchived(user, pageNumber, pageSize, collation))
                .orElseGet(() -> new ArchivedGroups(0, pageNumber, pageSize, List.of()));
    }

    /** Arhiviranje skupine (FR-003-01): samo lastnik. */
    @PostMapping("/{groupId}/archive")
    GroupDetail archive(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        return service.archive(access.require(jwt, groupId, Role.OWNER, true));
    }

    /** Odarhiviranje skupine (FR-003-06, FR-003-08): samo lastnik; trajno arhivirana skupina lastnika nima → 403. */
    @PostMapping("/{groupId}/unarchive")
    GroupDetail unarchive(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        return service.unarchive(access.require(jwt, groupId, Role.OWNER, false));
    }

    /** Izbris skupine (FR-003-09, FR-003-11): pravila po vlogi in številu članov preveri {@link GroupService}. */
    @DeleteMapping("/{groupId}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        service.delete(access.require(jwt, groupId, Role.VIEWER, false));
        return ResponseEntity.noContent().build();
    }

    private static Role parseRole(String value, List<FieldError> errors) {
        if (value == null) {
            return null;
        }
        try {
            return Role.valueOf(value);
        } catch (IllegalArgumentException e) {
            errors.add(new FieldError("role", "INVALID_VALUE"));
            return null;
        }
    }

    private static Integer parseInt(
            String value, int fallback, int min, int max, String field, List<FieldError> errors) {
        if (value == null) {
            return fallback;
        }
        try {
            int number = Integer.parseInt(value);
            if (number >= min && number <= max) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError(field, "INVALID_VALUE"));
        return null;
    }

    private static Collation parseLang(String value, List<FieldError> errors) {
        if (value == null || value.equals("en")) {
            return Collation.EN;
        }
        if (value.equals("sl")) {
            return Collation.SL;
        }
        errors.add(new FieldError("lang", "INVALID_VALUE"));
        return Collation.EN;
    }
}
