package si.contactmanager.invitation;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.account.UserDirectory;
import si.contactmanager.invitation.GroupInvitationController.Paging;
import si.contactmanager.invitation.InvitationService.AcceptOutcome;
import si.contactmanager.shared.error.AlreadyMemberException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Endpointi povabil, vezani na prijavljenega uporabnika (plan.md – REST endpoints). Uporabnik je vedno {@code sub} iz
 * žetona; vsaka poizvedba je omejena z {@code invitee_id} (FR-006-11, FR-006-12).
 */
@RestController
@RequestMapping("/api/invitations")
class InvitationController {

    private final InvitationService service;
    private final UserDirectory users;

    InvitationController(InvitationService service, UserDirectory users) {
        this.service = service;
        this.users = users;
    }

    /** Prejeta povabila (FR-006-05, FR-006-07); uporabnik brez profila ima prazen seznam. */
    @GetMapping
    ReceivedInvitations list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = Paging.parse(page, 0, 0, Integer.MAX_VALUE, "page", errors);
        Integer pageSize = Paging.parse(size, Paging.DEFAULT_SIZE, 1, Paging.MAX_SIZE, "size", errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        Optional<Long> user = users.find(jwt);
        return user.map(id -> service.listReceived(id, pageNumber, pageSize))
                .orElseGet(() -> new ReceivedInvitations(0, pageNumber, pageSize, List.of()));
    }

    /** Število povabil za zgornjo vrstico (FR-006-06). */
    @GetMapping("/count")
    InvitationCount count(@AuthenticationPrincipal Jwt jwt) {
        return users.find(jwt).map(service::countReceived).orElseGet(() -> new InvitationCount(0));
    }

    /** Sprejem (FR-006-08, FR-006-09): dovoljen tudi v arhivirano skupino; že član → 409 po potrditvi. */
    @PostMapping("/{invitationId}/accept")
    AcceptedInvitation accept(@AuthenticationPrincipal Jwt jwt, @PathVariable String invitationId) {
        var id = Paging.uuid(invitationId);
        long user = users.find(jwt).orElseThrow(NotFoundException::new);
        AcceptOutcome outcome = service.accept(user, id);
        if (outcome.accepted() == null) {
            throw new AlreadyMemberException();
        }
        return outcome.accepted();
    }

    /** Zavrnitev (FR-006-10): dovoljena tudi za arhivirano skupino. */
    @PostMapping("/{invitationId}/decline")
    ResponseEntity<Void> decline(@AuthenticationPrincipal Jwt jwt, @PathVariable String invitationId) {
        var id = Paging.uuid(invitationId);
        long user = users.find(jwt).orElseThrow(NotFoundException::new);
        service.decline(user, id);
        return ResponseEntity.noContent().build();
    }
}
