package si.contactmanager.contact;

import java.util.Optional;

/** Normalizirani ključ ujemanja po kategoriji (FR-011-03 … FR-011-06, research R-03). Ogrodje: brez logike. */
final class DuplicateKeys {

    private DuplicateKeys() {}

    /** Ključ kategorije {@code name}, {@code email} ali {@code phone}; prazno = kontakt je izpuščen iz iskanja. */
    static Optional<String> key(String category, String first, String last, String email, String phone) {
        throw new UnsupportedOperationException("ni implementirano");
    }
}
