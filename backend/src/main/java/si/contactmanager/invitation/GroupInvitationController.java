package si.contactmanager.invitation;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
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
import si.contactmanager.invitation.InvitationInputParser.Parsed;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Endpointi povabil, vezani na skupino (plan.md – REST endpoints). Dostop in vloge preveri {@link GroupAccess}; napake
 * razčlenjevanja telesa se vržejo šele v servisu po preverjanjih 401 → 404 → 403 → 409 (feature-map §2.2).
 */
@RestController
@RequestMapping("/api/groups/{groupId}/invitations")
class GroupInvitationController {

    private final InvitationService service;
    private final GroupAccess access;
    private final InvitationInputParser parser;

    GroupInvitationController(InvitationService service, GroupAccess access, JsonMapper json) {
        this.service = service;
        this.access = access;
        this.parser = new InvitationInputParser(json);
    }

    /** Pošiljanje povabila (FR-006-02, FR-006-03): najnižja vloga ADMIN; arhivirano preveri servis pod zaklepom. */
    @PostMapping
    ResponseEntity<OutgoingInvitation> send(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Parsed parsed = parser.parse(body);
        Membership membership = access.require(jwt, groupId, Role.ADMIN, false);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.send(membership, parsed));
    }

    /** Čakajoča povabila skupine (FR-006-13); dovoljeno tudi v arhivirani skupini. */
    @GetMapping
    OutgoingInvitations list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        Membership membership = access.require(jwt, groupId, Role.ADMIN, false);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = Paging.parse(page, 0, 0, Integer.MAX_VALUE, "page", errors);
        Integer pageSize = Paging.parse(size, Paging.DEFAULT_SIZE, 1, Paging.MAX_SIZE, "size", errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.listOutgoing(membership, pageNumber, pageSize);
    }

    /** Umik povabila (FR-006-14, FR-006-16); dovoljeno tudi v arhivirani skupini. */
    @DeleteMapping("/{invitationId}")
    ResponseEntity<Void> withdraw(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, @PathVariable String invitationId) {
        Membership membership = access.require(jwt, groupId, Role.ADMIN, false);
        service.withdraw(membership, Paging.uuid(invitationId));
        return ResponseEntity.noContent().build();
    }

    /** Skupne pomožne metode obeh kontrolerjev. */
    static final class Paging {

        static final int DEFAULT_SIZE = 25;
        static final int MAX_SIZE = 100;

        private Paging() {}

        static Integer parse(String value, int fallback, int min, int max, String field, List<FieldError> errors) {
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

        /** Neveljaven uuid je vedno 404 (obstoj se ne razkrije). */
        static UUID uuid(String value) {
            try {
                return UUID.fromString(value);
            } catch (IllegalArgumentException e) {
                throw new NotFoundException();
            }
        }
    }
}
