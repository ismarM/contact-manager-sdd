package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Pravila vrednosti po tipu (016, FR-016-02, -07, -08; data-model.md – Pravila po tipu). */
@Tag("FR-016-02")
@Tag("FR-016-07")
@Tag("FR-016-08")
class TypedValuesTest {

    private static TypedValues.Result run(AttributeType type, String raw) {
        return TypedValues.normalize(type, raw, "SI");
    }

    @Test
    void otherIsTrimmedAndBoundedTo500() {
        assertThat(run(AttributeType.OTHER, "  vrednost  ").value()).isEqualTo("vrednost");
        assertThat(run(AttributeType.OTHER, "x".repeat(500)).valid()).isTrue();
        assertThat(run(AttributeType.OTHER, "x".repeat(501)).error()).isEqualTo("TOO_LONG");
        assertThat(run(AttributeType.OTHER, "   ").error()).isEqualTo("REQUIRED");
        assertThat(run(AttributeType.OTHER, null).error()).isEqualTo("REQUIRED");
    }

    @Test
    void lengthIsCountedInCodePoints() {
        String emoji = "😀".repeat(500);
        assertThat(run(AttributeType.OTHER, emoji).valid()).isTrue();
        assertThat(run(AttributeType.OTHER, emoji + "a").error()).isEqualTo("TOO_LONG");
    }

    @Test
    void notesAreKeptVerbatimWithSpacesAndLineBreaks() {
        String notes = "  prva vrstica\n\n  druga <b>vrstica</b>  ";
        assertThat(run(AttributeType.NOTES, notes).value()).isEqualTo(notes);
        assertThat(run(AttributeType.NOTES, " \n\t ").error()).isEqualTo("REQUIRED");
        assertThat(run(AttributeType.NOTES, "x".repeat(501)).error()).isEqualTo("TOO_LONG");
        assertThat(run(AttributeType.NOTES, "x".repeat(500)).valid()).isTrue();
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "ana@primer.si|ana@primer.si",
                "  Ana.Novak@Primer.SI  |Ana.Novak@primer.si",
                "ana+oznaka@Sub.Primer.si|ana+oznaka@sub.primer.si",
            })
    void emailLowercasesOnlyTheDomain(String raw, String expected) {
        assertThat(run(AttributeType.EMAIL, raw).value()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ana", "ana@", "@primer.si", "ana@primer", "ana @primer.si", "ana@@primer.si"})
    void emailRejectsInvalidValues(String raw) {
        assertThat(run(AttributeType.EMAIL, raw).error()).isEqualTo("INVALID_VALUE");
    }

    @Test
    void emailBoundsTo254() {
        String local = "a".repeat(242);
        assertThat(run(AttributeType.EMAIL, local + "@primer.si").valid()).isTrue();
        assertThat(run(AttributeType.EMAIL, local + "x@primer.si").valid()).isTrue();
        assertThat(run(AttributeType.EMAIL, "a".repeat(250) + "@primer.si").error())
                .isEqualTo("TOO_LONG");
    }

    @Test
    void phoneUsesTheCountryOfTheContact() {
        assertThat(TypedValues.normalize(AttributeType.PHONE, "041 123 456", "SI")
                        .value())
                .isEqualTo("+38641123456");
        assertThat(TypedValues.normalize(AttributeType.PHONE, "(202) 555-0123", "US")
                        .value())
                .isEqualTo("+12025550123");
        assertThat(TypedValues.normalize(AttributeType.PHONE, "041 123 456", null)
                        .value())
                .isEqualTo("+38641123456");
        assertThat(run(AttributeType.PHONE, "abc").error()).isEqualTo("INVALID_VALUE");
        assertThat(run(AttributeType.PHONE, "123456789012345678901234567890123").error())
                .isEqualTo("TOO_LONG");
        assertThat(run(AttributeType.PHONE, " ").error()).isEqualTo("REQUIRED");
    }

    @Test
    void urlGetsHttpsAndLowercaseHost() {
        assertThat(run(AttributeType.URL, "Primer.SI/Pot").value()).isEqualTo("https://primer.si/Pot");
        assertThat(run(AttributeType.URL, "javascript:alert(1)").error()).isEqualTo("INVALID_VALUE");
        assertThat(run(AttributeType.URL, "https://primer.si/" + "a".repeat(500))
                        .error())
                .isEqualTo("TOO_LONG");
        assertThat(run(AttributeType.URL, "").error()).isEqualTo("REQUIRED");
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "2024-02-29|2024-02-29",
                "  1999-12-31 |1999-12-31",
                "0001-01-01|0001-01-01",
                "9999-12-31|9999-12-31",
            })
    void dateAcceptsOnlyIsoCalendarDates(String raw, String expected) {
        assertThat(run(AttributeType.DATE, raw).value()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "2023-02-29",
                "2024-13-01",
                "2024-00-10",
                "2024-04-31",
                "1.1.2024",
                "31. 12. 2024",
                "2024-1-1",
                "24-01-01",
                "0000-01-01",
                "10000-01-01",
                "danes",
                "2024-01-01T10:00",
            })
    void dateRejectsOtherFormatsAndImpossibleDates(String raw) {
        assertThat(run(AttributeType.DATE, raw).error()).isEqualTo("INVALID_VALUE");
    }

    @Test
    void unstructuredAddressTextUnifiesLineBreaksAndIsBoundedTo500() {
        assertThat(run(AttributeType.ADDRESS, " Cesta 1\r\n1000 Ljubljana ").value())
                .isEqualTo("Cesta 1\n1000 Ljubljana");
        assertThat(run(AttributeType.ADDRESS, "x".repeat(501)).error()).isEqualTo("TOO_LONG");
    }

    @ParameterizedTest
    @EnumSource(AttributeType.class)
    void everyTypeRejectsNull(AttributeType type) {
        assertThat(TypedValues.normalize(type, null, "SI").error()).isEqualTo("REQUIRED");
        assertThat(TypedValues.isValid(type, null, "SI")).isFalse();
    }

    @ParameterizedTest
    @EnumSource(
            value = AttributeType.class,
            names = {"OTHER", "NOTES", "ADDRESS"})
    void freeTextTypesAcceptAnyShortText(AttributeType type) {
        assertThat(TypedValues.isValid(type, "karkoli", null)).isTrue();
    }
}
