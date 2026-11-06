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

    /** Neobstoječa pot z veljavnim žetonom: 404 s praznim telesom (research R-10). */
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<Void> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
}
