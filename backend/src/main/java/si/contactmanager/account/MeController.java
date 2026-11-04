package si.contactmanager.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Profil prijavljenega uporabnika (plan.md – REST endpoints). Implementacija v T031 in T041. */
@RestController
@RequestMapping("/api/me")
class MeController {

    @PutMapping
    ResponseEntity<Profile> sync() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @PutMapping("/preferences")
    ResponseEntity<Profile> updatePreferences() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
