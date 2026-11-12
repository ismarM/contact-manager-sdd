package si.contactmanager.contact;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.Role;

/** Izvoz izbranih kontaktov v Excel (010, plan.md – REST endpoints). Ogrodje: 401/404 delujeta, nato 501. */
@RestController
@RequestMapping("/api/groups/{groupId}")
class ExportController {

    private final GroupAccess access;

    ExportController(GroupAccess access) {
        this.access = access;
    }

    @PostMapping("/contacts/export")
    ResponseEntity<Void> export(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        access.require(jwt, groupId, Role.VIEWER, false);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
