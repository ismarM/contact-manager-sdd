package si.contactmanager.contact;

import java.util.List;

/** Besedila datoteke izvoza po jeziku (010, FR-010-03, FR-010-04; research R-08). */
final class ExportLabels {

    /** Glava: predefinirani stolpci pred ključi atributov in stolpec značk za njimi. */
    record Headers(List<String> leading, String tags) {}

    private ExportLabels() {}

    static String sheetName(String language) {
        throw new UnsupportedOperationException("ExportLabels.sheetName");
    }

    static Headers headers(String language) {
        throw new UnsupportedOperationException("ExportLabels.headers");
    }
}
