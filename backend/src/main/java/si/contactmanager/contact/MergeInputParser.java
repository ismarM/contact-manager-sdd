package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.databind.json.JsonMapper;

/**
 * Razčlenjevalnik zahtevkov dvojnikov (FR-011-13, FR-011-21; research R-06, R-07): nikoli ne vrže, napake vrne kot
 * {@code FieldError}. Ogrodje: brez logike.
 */
public final class MergeInputParser {

    /** Rezultat: {@code value} je {@code null} ob kateri koli napaki. */
    public record Parsed<T>(T value, List<FieldError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public MergeInputParser() {
        this(JsonMapper.builder().build());
    }

    public MergeInputParser(JsonMapper json) {}

    /** Telo {@code merge}: {@code contacts} (2–10) in {@code result}. */
    public Parsed<MergeInput> parseMerge(String body) {
        throw new UnsupportedOperationException("ni implementirano");
    }

    /** Vrednosti parametra {@code ids} (ponovljen parameter ali vejice): 2–10 različnih UUID. */
    public Parsed<List<UUID>> parseIds(List<String> values) {
        throw new UnsupportedOperationException("ni implementirano");
    }
}
