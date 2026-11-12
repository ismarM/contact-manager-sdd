package si.contactmanager.shared.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.UUID;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Telo {@code 400} množične operacije: napake zahtevka in neobvezno napake po kontaktih (research R-06); {@code
 * contacts} je izpuščen, kadar je zahtevek neveljaven.
 */
public record BulkValidationError(
        String code,
        List<FieldError> errors,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<ContactErrors> contacts) {

    /** Napake končnega stanja enega kontakta. */
    public record ContactErrors(UUID contactId, String displayName, List<FieldError> errors) {}
}
