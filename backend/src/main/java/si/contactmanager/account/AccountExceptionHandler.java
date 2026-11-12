package si.contactmanager.account;

import java.sql.SQLException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import si.contactmanager.shared.error.ErrorResponse;
import si.contactmanager.shared.error.OwnsActiveGroupsException;
import si.contactmanager.shared.error.UnauthenticatedException;

/**
 * Obravnava napak funkcionalnosti 012 (409 OWNS_ACTIVE_GROUPS, 401). {@code ApiExceptionHandler} se ne spreminja
 * (research R-14); velja samo za krmilnike tega paketa.
 */
@RestControllerAdvice(basePackageClasses = AccountExceptionHandler.class)
class AccountExceptionHandler {

    /** Telo {@code 409 OWNS_ACTIVE_GROUPS} s seznamom skupin, ki preprečujejo izbris (contracts/openapi.yaml). */
    record OwnsActiveGroups(String code, List<BlockingGroup> groups) {}

    /** Uporabnika ni več (izvoz, drugi sočasni izbris) – {@code 401 UNAUTHENTICATED} (FR-012-15). */
    @ExceptionHandler(UnauthenticatedException.class)
    ResponseEntity<ErrorResponse> unauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("UNAUTHENTICATED"));
    }

    @ExceptionHandler(OwnsActiveGroupsException.class)
    ResponseEntity<OwnsActiveGroups> ownsActiveGroups(OwnsActiveGroupsException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new OwnsActiveGroups("OWNS_ACTIVE_GROUPS", exception.groups()));
    }

    /**
     * Sprožilec {@code app_user_not_deleted} (SQLSTATE {@code CM401}): računa z UID-jem iz nadgrobnika ni mogoče znova
     * ustvariti (FR-012-14, FR-012-18) → 401. Vsaka druga neznana napaka SQL ostane 500.
     */
    @ExceptionHandler(UncategorizedSQLException.class)
    ResponseEntity<ErrorResponse> uncategorized(UncategorizedSQLException exception) {
        SQLException cause = exception.getSQLException();
        if (cause != null && "CM401".equals(cause.getSQLState())) {
            return unauthenticated();
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
}
