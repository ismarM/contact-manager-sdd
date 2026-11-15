package si.contactmanager.audit;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.audit.DeletedContactRepository.Filter;
import si.contactmanager.audit.DeletedContactRepository.State;
import si.contactmanager.audit.HistoryViews.DeletedPage;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/** Seznam izbrisanih kontaktov (015, FR-015-22 … -24): VIEWER, tudi v arhivirani skupini; izpeljan iz sledi. */
@RestController
@RequestMapping("/api/groups/{groupId}/deleted-contacts")
class DeletedContactController {

    private static final int MAX_QUERY = 100;

    private final DeletedContactRepository repository;
    private final GroupAccess access;

    DeletedContactController(DeletedContactRepository repository, GroupAccess access) {
        this.repository = repository;
        this.access = access;
    }

    @GetMapping
    DeletedPage list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = AuditParams.page(page, errors);
        Integer pageSize = AuditParams.size(size, errors);
        State parsed = State.ALL;
        if (state != null) {
            try {
                parsed = State.valueOf(state.toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException e) {
                errors.add(new FieldError("state", "INVALID_VALUE"));
            }
        }
        String query = q == null ? "" : q.strip();
        if (query.length() > MAX_QUERY) {
            errors.add(new FieldError("q", "TOO_LONG"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        UUID group = membership.groupId();
        Filter filter = new Filter(query, parsed);
        return new DeletedPage(
                repository.count(group, filter),
                pageNumber,
                pageSize,
                repository.page(group, filter, pageSize, pageNumber));
    }
}
