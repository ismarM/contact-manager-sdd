package si.contactmanager.group;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpointi skupin (plan.md – REST endpoints). {@code groupId} je niz, ki ga razčleni {@code GroupAccess} (research
 * R-01). Ogrodje (T007): vsi vrnejo 501; implementacija v US1–US4.
 */
@RestController
@RequestMapping("/api/groups")
class GroupController {

    @PostMapping
    ResponseEntity<Void> create() {
        return notImplemented();
    }

    @GetMapping
    ResponseEntity<Void> list() {
        return notImplemented();
    }

    @GetMapping("/{groupId}")
    ResponseEntity<Void> get(@PathVariable String groupId) {
        return notImplemented();
    }

    @PutMapping("/{groupId}")
    ResponseEntity<Void> update(@PathVariable String groupId) {
        return notImplemented();
    }

    private static ResponseEntity<Void> notImplemented() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
