package si.contactmanager.audit;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Razčlenjevanje skupnih parametrov novih endpointov 015 (strani 0-osne; velikosti 25, 50, 100; neveljaven id = 404). */
final class AuditParams {

    static final int DEFAULT_SIZE = 25;
    private static final Set<Integer> PAGE_SIZES = Set.of(25, 50, 100);

    private AuditParams() {}

    static UUID id(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }

    static Integer page(String value, List<FieldError> errors) {
        if (value == null) {
            return 0;
        }
        try {
            int number = Integer.parseInt(value);
            if (number >= 0) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError("page", "INVALID_VALUE"));
        return null;
    }

    static Integer size(String value, List<FieldError> errors) {
        if (value == null) {
            return DEFAULT_SIZE;
        }
        try {
            int number = Integer.parseInt(value);
            if (PAGE_SIZES.contains(number)) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError("size", "INVALID_VALUE"));
        return null;
    }
}
