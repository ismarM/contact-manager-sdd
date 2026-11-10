package si.contactmanager.contact;

import java.util.List;
import java.util.Map;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčleni parametre iskanja (specs/008-iskanje/research.md R-06, R-07) v {@link ContactQuery} ali seznam napak po
 * poljih. Sprejme navaden {@code Map}, zato ni vezan na spletni sloj.
 */
public final class ContactQueryParser {

    /** Rezultat: poizvedba, kadar ni napak, sicer vse napake naenkrat. */
    public record Parsed(ContactQuery query, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public Parsed parse(Map<String, List<String>> parameters) {
        throw new UnsupportedOperationException("008-iskanje: še ni izvedeno");
    }
}
