package si.contactmanager.audit;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Endpointi revizijske sledi (plan.md – REST endpoints). Ogrodje: vsi vrnejo 501. */
@RestController
@RequestMapping("/api/groups/{groupId}/audit")
class AuditController {

    @GetMapping
    ResponseEntity<Void> list(@PathVariable String groupId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @GetMapping("/{entryId}")
    ResponseEntity<Void> get(@PathVariable String groupId, @PathVariable String entryId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @GetMapping("/{entryId}/changes")
    ResponseEntity<Void> changes(@PathVariable String groupId, @PathVariable String entryId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @PostMapping("/{entryId}/rollback")
    ResponseEntity<Void> rollback(@PathVariable String groupId, @PathVariable String entryId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @PostMapping("/initial-state/rollback")
    ResponseEntity<Void> rollbackInitial(@PathVariable String groupId) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
