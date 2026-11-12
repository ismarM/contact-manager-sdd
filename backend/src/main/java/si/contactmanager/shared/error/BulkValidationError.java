package si.contactmanager.shared.error;

import java.util.List;
import java.util.UUID;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Telo {@code 400} množične operacije: napake zahtevka in neobvezno napake po kontaktih (research R-06). */
public record BulkValidationError(String code, List<FieldError> errors, List<ContactErrors> contacts) {

    /** Napake končnega stanja enega kontakta. */
    public record ContactErrors(UUID contactId, String displayName, List<FieldError> errors) {}
}
