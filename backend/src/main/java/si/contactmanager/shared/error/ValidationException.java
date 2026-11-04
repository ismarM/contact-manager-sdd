package si.contactmanager.shared.error;

import java.util.List;

/** Neveljavni podatki zahtevka; {@link ApiExceptionHandler} jih vrne kot {@code 400 VALIDATION_FAILED}. */
public class ValidationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient List<ValidationError.FieldError> errors;

    public ValidationException(List<ValidationError.FieldError> errors) {
        super("validation failed: " + errors);
        this.errors = List.copyOf(errors);
    }

    public List<ValidationError.FieldError> errors() {
        return errors;
    }
}
