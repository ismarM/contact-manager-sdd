package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Besedila datoteke izvoza po jeziku (FR-010-03, FR-010-04; research R-08): dobesedna imena lista in glave. */
class ExportLabelsTest {

    @Test
    @Tag("FR-010-03")
    @Tag("FR-010-04")
    void slovenianSheetNameAndHeaders() {
        assertThat(ExportLabels.sheetName("sl")).isEqualTo("Kontakti");
        ExportLabels.Headers headers = ExportLabels.headers("sl");

        assertThat(headers.leading()).containsExactly("Ime", "Priimek", "Naslov", "E-naslov", "Telefon");
        assertThat(headers.tags()).isEqualTo("Značke");
    }

    @Test
    @Tag("FR-010-04")
    void englishSheetNameAndHeaders() {
        assertThat(ExportLabels.sheetName("en")).isEqualTo("Contacts");
        ExportLabels.Headers headers = ExportLabels.headers("en");

        assertThat(headers.leading()).containsExactly("First name", "Last name", "Address", "Email", "Phone");
        assertThat(headers.tags()).isEqualTo("Tags");
    }
}
