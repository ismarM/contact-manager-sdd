package si.contactmanager.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import si.contactmanager.shared.error.ErrorResponse;
import si.contactmanager.shared.error.UnauthenticatedException;

/**
 * Obravnava napak funkcionalnosti 012. {@code ApiExceptionHandler} se ne spreminja (research R-14). Za zdaj samo
 * {@code 401}, ko uporabnika ni več (izvoz); {@code 409 OWNS_ACTIVE_GROUPS} in SQLSTATE {@code CM401} pridejo z US2.
 */
@RestControllerAdvice(basePackageClasses = AccountExceptionHandler.class)
class AccountExceptionHandler {

    @ExceptionHandler(UnauthenticatedException.class)
    ResponseEntity<ErrorResponse> unauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("UNAUTHENTICATED"));
    }
}
