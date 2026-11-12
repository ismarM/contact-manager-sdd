package si.contactmanager.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Izvoz mojih podatkov in blokade izbrisa (012). Ogrodje: {@code 501} do implementacije. */
@RestController
@RequestMapping("/api/me")
class MyDataController {

    @GetMapping("/export")
    ResponseEntity<MyData> export() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    @GetMapping("/deletion-blockers")
    ResponseEntity<DeletionBlockers> deletionBlockers() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
