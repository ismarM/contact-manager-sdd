package si.contactmanager.contact;

import java.util.List;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Razčlenitev teles množičnih endpointov (research R-05); nikoli ne vrže. Ogrodje: izvedba v nalogi T031. */
public final class BulkInputParser {

    /** Rezultat: {@code value} je {@code null} ob kateri koli napaki. */
    public record Parsed<T>(T value, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public BulkInputParser() {}

    public Parsed<BulkEditInput> parseUpdate(String body) {
        throw new UnsupportedOperationException("T031");
    }

    public Parsed<BulkTarget> parseDelete(String body) {
        throw new UnsupportedOperationException("T031");
    }

    public Parsed<SelectionCheck.Request> parseCheck(String body) {
        throw new UnsupportedOperationException("T031");
    }
}
