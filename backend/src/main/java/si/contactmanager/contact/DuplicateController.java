package si.contactmanager.contact;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.Role;

/**
 * Endpointi dvojnikov (plan.md – REST endpoints). Ogrodje: pravice po feature-map §2.2 delujejo (401 → 404 → 403 →
 * 409 {@code GROUP_ARCHIVED}), poslovna logika pa vrne {@code 501}.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/duplicates")
class DuplicateController {

    private final GroupAccess access;

    DuplicateController(GroupAccess access) {
        this.access = access;
    }

    @GetMapping
    DuplicatePage search(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        access.require(jwt, groupId, Role.EDITOR, true);
        throw notImplemented();
    }

    @GetMapping("/compare")
    Comparison compare(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        access.require(jwt, groupId, Role.EDITOR, true);
        throw notImplemented();
    }

    @PostMapping("/merge")
    MergeResult merge(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        access.require(jwt, groupId, Role.EDITOR, true);
        throw notImplemented();
    }

    private static ResponseStatusException notImplemented() {
        return new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED);
    }
}
