package si.contactmanager.contact;

import java.util.List;

/** Besedila datoteke izvoza po jeziku (010, FR-010-03, FR-010-04; research R-08): zaprta preslikava {@code sl}/{@code en}. */
final class ExportLabels {

    /** Glava: predefinirani stolpci pred ključi atributov in stolpec značk za njimi. */
    record Headers(List<String> leading, String tags) {}

    private ExportLabels() {}

    static String sheetName(String language) {
        return "en".equals(language) ? "Contacts" : "Kontakti";
    }

    static Headers headers(String language) {
        if ("en".equals(language)) {
            return new Headers(List.of("First name", "Last name", "Address", "Email", "Phone"), "Tags");
        }
        return new Headers(List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon"), "Značke");
    }
}
