package si.contactmanager.contact;

import java.util.Optional;

/**
 * Besedilo celice izvoza (010, FR-010-08, FR-010-09; research R-07): prazno → brez celice; vrednost, ki se začne z
 * {@code = + - @}, tabulatorjem ali CR, dobi vodilni {@code '}, da je program za preglednice ne razume kot formule.
 */
final class CellText {

    private CellText() {}

    static Optional<String> of(String value) {
        if (value == null || value.isEmpty()) {
            return Optional.empty();
        }
        return switch (value.charAt(0)) {
            case '=', '+', '-', '@', '\t', '\r' -> Optional.of("'" + value);
            default -> Optional.of(value);
        };
    }
}
