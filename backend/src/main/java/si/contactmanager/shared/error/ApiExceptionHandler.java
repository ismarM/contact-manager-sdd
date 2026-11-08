package si.contactmanager.shared.error;

import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
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

    /** Nečlan ali neobstoječ vir: 404 s praznim telesom, enako kot neobstoječa pot (feature-map §2.2, 002 R-01). */
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<Void> notMember() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    /** Vloga pod najnižjo dovoljeno (D-25). */
    @ExceptionHandler(ForbiddenException.class)
    ResponseEntity<ErrorResponse> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse("FORBIDDEN"));
    }

    /** Pisanje v arhivirani skupini (feature-map §2.4). */
    @ExceptionHandler(GroupArchivedException.class)
    ResponseEntity<ErrorResponse> groupArchived() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("GROUP_ARCHIVED"));
    }

    /** Rollback bi bil brez učinka (feature-map §2.10). */
    @ExceptionHandler(RollbackNoChangesException.class)
    ResponseEntity<ErrorResponse> rollbackNoChanges() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("ROLLBACK_NO_CHANGES"));
    }

    /** Odarhiviranje nearhivirane skupine (feature-map §2.10). */
    @ExceptionHandler(GroupNotArchivedException.class)
    ResponseEntity<ErrorResponse> groupNotArchived() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("GROUP_NOT_ARCHIVED"));
    }

    /** Izbris skupine z drugimi člani (feature-map §2.10). */
    @ExceptionHandler(GroupHasOtherMembersException.class)
    ResponseEntity<ErrorResponse> groupHasOtherMembers() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("GROUP_HAS_OTHER_MEMBERS"));
    }

    /** Optimistično zaklepanje (feature-map §2.3): trenutno stanje za razrešitev v vmesniku. */
    @ExceptionHandler(VersionConflictException.class)
    ResponseEntity<VersionConflict> versionConflict(VersionConflictException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(VersionConflict.of(exception.current()));
    }

    /** Metoda za pot ne obstaja (npr. PUT/PATCH/DELETE vnosa sledi, FR-005-05): 405 s praznim telesom in glavo Allow. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<Void> methodNotAllowed(HttpRequestMethodNotSupportedException exception) {
        Set<HttpMethod> allowed = exception.getSupportedHttpMethods();
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (allowed != null && !allowed.isEmpty()) {
            response.allow(allowed.toArray(new HttpMethod[0]));
        }
        return response.build();
    }

    /** Neobstoječa pot z veljavnim žetonom: 404 s praznim telesom (research R-10). */
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<Void> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
}
