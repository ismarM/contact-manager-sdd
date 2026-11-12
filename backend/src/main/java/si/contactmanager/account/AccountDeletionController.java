package si.contactmanager.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Izbris računa (012). Ogrodje: {@code 501} do implementacije. */
@RestController
@RequestMapping("/api/me/deletion")
class AccountDeletionController {

    @PostMapping
    ResponseEntity<Void> delete(@RequestBody(required = false) String body) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
