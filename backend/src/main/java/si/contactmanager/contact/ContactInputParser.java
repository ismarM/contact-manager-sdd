package si.contactmanager.contact;

import java.util.List;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenitev telesa {@code POST}/{@code PUT …/contacts} (research R-06). OGRODJE: vrne prazen rezultat, vedenje pride
 * z implementacijo (tasks.md T032).
 */
public final class ContactInputParser {

    /** Rezultat: {@code input} je {@code null} ob kateri koli napaki; {@code version} je {@code null}, če ga ni. */
    public record Parsed(ContactInput input, Long version, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public ContactInputParser() {}

    public ContactInputParser(JsonMapper json) {}

    public Parsed parseCreate(String body) {
        return new Parsed(null, null, List.of());
    }

    public Parsed parseUpdate(String body) {
        return new Parsed(null, null, List.of());
    }
}
