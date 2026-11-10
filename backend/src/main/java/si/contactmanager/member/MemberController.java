package si.contactmanager.member;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.GroupDetail;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Endpointi članov skupine (plan.md – REST endpoints). Dostop in vloge preveri {@link GroupAccess} (401 → 404 → 403);
 * arhiviranost, verzijo in podatke presoja servis pod zaklepom skupine. {@code memberId} se razčleni šele po dostopu,
 * da VIEWER/EDITOR vedno dobita 403 (research R-05, vrstice A1).
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class MemberController {

    private static final int DEFAULT_SIZE = 25;
    private static final int MAX_SIZE = 100;

    private final MemberService service;
    private final GroupAccess access;
    private final MemberInputParser parser;

    MemberController(MemberService service, GroupAccess access, JsonMapper json) {
        this.service = service;
        this.access = access;
        this.parser = new MemberInputParser(json);
    }

    /** Seznam članov (FR-007-01, FR-007-02): vsi člani, tudi v arhivirani skupini. */
    @GetMapping("/members")
    Members list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String lang) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = parseInt(page, 0, 0, Integer.MAX_VALUE, "page", errors);
        Integer pageSize = parseInt(size, DEFAULT_SIZE, 1, MAX_SIZE, "size", errors);
        String collation = collation(lang, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.list(membership, pageNumber, pageSize, collation);
    }

    /** Sprememba vloge (FR-007-03, FR-007-04); najnižja vloga ADMIN, arhiviranost presoja servis pod zaklepom. */
    @PutMapping("/members/{memberId}")
    Member changeRole(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String memberId,
            @RequestBody(required = false) String body) {
        MemberInputParser.ParsedRole parsed = parser.parseRole(body);
        Membership membership = access.require(jwt, groupId, Role.ADMIN, false);
        return service.changeRole(membership, uuid(memberId), parsed);
    }

    /** Odstranitev člana (FR-007-05). */
    @DeleteMapping("/members/{memberId}")
    ResponseEntity<Void> remove(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, @PathVariable String memberId) {
        Membership membership = access.require(jwt, groupId, Role.ADMIN, false);
        service.remove(membership, uuid(memberId));
        return ResponseEntity.noContent().build();
    }

    /** Zapustitev skupine (FR-007-06 … FR-007-08): vsak član, tudi v arhivirani skupini. */
    @PostMapping("/leave")
    ResponseEntity<Void> leave(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        service.leave(membership);
        return ResponseEntity.noContent().build();
    }

    /** Prenos lastništva (FR-007-09): samo lastnik; odgovor je skupina z novo vlogo klicatelja. */
    @PostMapping("/ownership-transfer")
    GroupDetail transfer(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        MemberInputParser.ParsedTransfer parsed = parser.parseTransfer(body);
        Membership membership = access.require(jwt, groupId, Role.OWNER, false);
        return service.transferOwnership(membership, parsed);
    }

    /** Neveljaven uuid je vedno 404 (obstoj se ne razkrije). */
    private static UUID uuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
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

    /** ICU kolaciji iz migracije V3; ime v SQL je vedno iz tega zaprtega seznama. */
    private static String collation(String lang, List<FieldError> errors) {
        if (lang == null || lang.equals("en")) {
            return "title_en";
        }
        if (lang.equals("sl")) {
            return "title_sl";
        }
        errors.add(new FieldError("lang", "INVALID_VALUE"));
        return "title_en";
    }
}
