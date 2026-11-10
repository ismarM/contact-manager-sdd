package si.contactmanager.member;

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
 * Endpointi članov skupine (plan.md – REST endpoints). Ogrodje (007, T006): vsi vrnejo 501, dokler jih ne
 * implementirajo naloge zgodb US1–US5.
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class MemberController {

    @GetMapping("/members")
    ResponseEntity<Void> list(@PathVariable String groupId) {
        return notImplemented();
    }

    @PutMapping("/members/{memberId}")
    ResponseEntity<Void> changeRole(@PathVariable String groupId, @PathVariable String memberId) {
        return notImplemented();
    }

    @DeleteMapping("/members/{memberId}")
    ResponseEntity<Void> remove(@PathVariable String groupId, @PathVariable String memberId) {
        return notImplemented();
    }

    @PostMapping("/leave")
    ResponseEntity<Void> leave(@PathVariable String groupId) {
        return notImplemented();
    }

    @PostMapping("/ownership-transfer")
    ResponseEntity<Void> transfer(@PathVariable String groupId) {
        return notImplemented();
    }

    private static ResponseEntity<Void> notImplemented() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
