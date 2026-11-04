package si.contactmanager.shared.error;

import java.util.List;

/** Telo {@code 400 VALIDATION_FAILED} z napakami po poljih (feature-map.md §2.2, contracts/openapi.yaml). */
public record ValidationError(String code, List<FieldError> errors) {

    public static final String VALIDATION_FAILED = "VALIDATION_FAILED";

    /** Napaka polja: {@code field} je ime polja ali {@code body}; {@code code} npr. INVALID_VALUE, REQUIRED. */
    public record FieldError(String field, String code) {}

    public static ValidationError of(List<FieldError> errors) {
        return new ValidationError(VALIDATION_FAILED, List.copyOf(errors));
    }
}
