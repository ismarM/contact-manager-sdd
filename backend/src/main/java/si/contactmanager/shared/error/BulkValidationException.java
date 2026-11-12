package si.contactmanager.shared.error;

import java.util.List;
import si.contactmanager.shared.error.BulkValidationError.ContactErrors;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Neveljavna množična operacija; rokovalnik (T033) vrne {@link BulkValidationError}. */
public class BulkValidationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient List<FieldError> errors;
    private final transient List<ContactErrors> contacts;

    public BulkValidationException(List<FieldError> errors, List<ContactErrors> contacts) {
        super("bulk validation failed");
        this.errors = List.copyOf(errors);
        this.contacts = List.copyOf(contacts);
    }

    public List<FieldError> errors() {
        return errors;
    }

    public List<ContactErrors> contacts() {
        return contacts;
    }
}
