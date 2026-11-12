package si.contactmanager.contact;

import java.util.Optional;

/** Besedilo celice izvoza (010, FR-010-08, FR-010-09): prazno → brez celice, nevarni začetek → predpona {@code '}. */
final class CellText {

    private CellText() {}

    static Optional<String> of(String value) {
        throw new UnsupportedOperationException("CellText.of");
    }
}
