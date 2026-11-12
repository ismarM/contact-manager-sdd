package si.contactmanager.contact;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.Role;

/**
 * Endpointi izbora in množičnega urejanja (plan.md – REST endpoints). Ogrodje (tasks T005): dostop do skupine
 * deluje (401, 404), nato {@code 501}; izvedba v nalogah T037, T042, T044, T045, T047.
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class BulkController {

    private final GroupAccess access;

    BulkController(GroupAccess access) {
        this.access = access;
    }

    @GetMapping("/contact-ids")
    ResponseEntity<Void> contactIds(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        access.require(jwt, groupId, Role.VIEWER, false);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @PostMapping("/contacts/selection-check")
    ResponseEntity<Void> selectionCheck(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        access.require(jwt, groupId, Role.VIEWER, false);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @PostMapping("/contacts/bulk-update")
    ResponseEntity<Void> bulkUpdate(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        access.require(jwt, groupId, Role.VIEWER, false);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @PostMapping("/contacts/bulk-delete")
    ResponseEntity<Void> bulkDelete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        access.require(jwt, groupId, Role.VIEWER, false);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
