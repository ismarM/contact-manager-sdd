package si.contactmanager.group;

import java.util.List;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčlenitev telesa {@code POST}/{@code PUT /api/groups} (research R-07): vrne podatke, poslano verzijo in vse napake po
 * poljih; nikoli ne vrže. Ogrodje (T007): implementacija v T029.
 */
public final class GroupInputParser {

    /** Rezultat: {@code input} in {@code version} sta {@code null}, kadar polja ni bilo mogoče prebrati. */
    public record Parsed(GroupInput input, Long version, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public Parsed parseCreate(String body) {
        throw new UnsupportedOperationException("not implemented");
    }

    public Parsed parseUpdate(String body) {
        throw new UnsupportedOperationException("not implemented");
    }
}
