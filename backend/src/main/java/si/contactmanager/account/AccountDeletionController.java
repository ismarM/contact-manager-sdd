package si.contactmanager.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.account.AccountDeletionService.DeletionResult;
import si.contactmanager.shared.error.ErrorResponse;

/**
 * Izbris računa (012, FR-012-05 … FR-012-18). Brez identifikatorja uporabnika v poti: izbris velja samo za
 * prijavljenega uporabnika (FR-012-16). {@code 204} = lokalni račun in identiteta izbrisana, {@code 202} =
 * lokalni izbris zaključen, brisanje identitete čaka na ponavljanje (FR-012-17).
 */
@RestController
@RequestMapping("/api/me/deletion")
class AccountDeletionController {

    private final AccountDeletionService service;

    AccountDeletionController(AccountDeletionService service) {
        this.service = service;
    }

    @PostMapping
    ResponseEntity<ErrorResponse> delete(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String body) {
        if (service.delete(jwt, body) == DeletionResult.DELETED) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new ErrorResponse("IDENTITY_DELETION_PENDING"));
    }
}
