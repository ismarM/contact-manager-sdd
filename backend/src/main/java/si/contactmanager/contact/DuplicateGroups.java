package si.contactmanager.contact;

import java.util.List;

/** Grupiranje, razvrščanje in izrez strani skupin dvojnikov (FR-011-07, research R-04). Ogrodje: brez logike. */
final class DuplicateGroups {

    private DuplicateGroups() {}

    /** Skupine kategorije {@code category} iz kontaktov skupine; {@code page} je 0-osno, {@code size} 25, 50 ali 100. */
    static DuplicatePage build(String category, List<DuplicateCandidate> candidates, int page, int size) {
        throw new UnsupportedOperationException("ni implementirano");
    }
}
