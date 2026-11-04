package si.contactmanager.shared.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Preslikava napak v odgovore API (feature-map.md §2.2). */
@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(ValidationException.class)
    ResponseEntity<ValidationError> validation(ValidationException exception) {
        return ResponseEntity.badRequest().body(ValidationError.of(exception.errors()));
    }

    /** Neobstoječa pot z veljavnim žetonom: 404 s praznim telesom (research R-10). */
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<Void> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
}
