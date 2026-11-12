package si.contactmanager.account;

import java.util.List;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Telo {@code POST /api/me/deletion} (012, FR-012-07). Ogrodje – vedenje pride z implementacijo. */
final class DeleteAccountInputParser {

    /** {@code email} je vpisan e-naslov (neobrezan) ali {@code null}. */
    record ParsedDeletion(String email, List<FieldError> errors) {}

    private DeleteAccountInputParser() {}

    static ParsedDeletion parse(String body) {
        throw new UnsupportedOperationException("not implemented: DeleteAccountInputParser.parse (FR-012-07)");
    }

    /** Primerjava vpisanega e-naslova z e-naslovom računa: po obrezu in brez velikosti črk. */
    static boolean matches(String typed, String actual) {
        throw new UnsupportedOperationException("not implemented: DeleteAccountInputParser.matches (FR-012-07)");
    }
}
