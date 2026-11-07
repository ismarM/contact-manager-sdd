package si.contactmanager.contact;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpointi kontaktov (plan.md – REST endpoints). OGRODJE: vsi vrnejo {@code 501}, vedenje pride z implementacijo
 * (tasks.md T029, T032, T033, T037, T039).
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class ContactController {

    @GetMapping("/contacts")
    ResponseEntity<Void> list(@PathVariable String groupId) {
        return notImplemented();
    }

    @GetMapping("/contacts/{contactId}")
    ResponseEntity<Void> get(@PathVariable String groupId, @PathVariable String contactId) {
        return notImplemented();
    }

    @PostMapping("/contacts")
    ResponseEntity<Void> create(@PathVariable String groupId) {
        return notImplemented();
    }

    @PutMapping("/contacts/{contactId}")
    ResponseEntity<Void> update(@PathVariable String groupId, @PathVariable String contactId) {
        return notImplemented();
    }

    @DeleteMapping("/contacts/{contactId}")
    ResponseEntity<Void> delete(@PathVariable String groupId, @PathVariable String contactId) {
        return notImplemented();
    }

    @GetMapping("/tags")
    ResponseEntity<Void> tags(@PathVariable String groupId) {
        return notImplemented();
    }

    private static ResponseEntity<Void> notImplemented() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
