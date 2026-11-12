package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.account.DeleteAccountInputParser.ParsedDeletion;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Telo izbrisa računa in primerjava e-naslova (FR-012-07). */
@Tag("FR-012-07")
class DeleteAccountInputParserTest {

    @Test
    void validBodyIsParsed() {
        ParsedDeletion parsed = DeleteAccountInputParser.parse("{\"email\":\"a@b.si\"}");

        assertThat(parsed.email()).isEqualTo("a@b.si");
        assertThat(parsed.errors()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"email\":null}", "{\"email\":\"\"}", "{\"email\":\"   \"}"})
    void missingNullOrBlankEmailIsRequired(String body) {
        assertThat(DeleteAccountInputParser.parse(body).errors()).containsExactly(new FieldError("email", "REQUIRED"));
    }

    @Test
    void unknownFieldIsReported() {
        ParsedDeletion parsed = DeleteAccountInputParser.parse("{\"email\":\"a@b.si\",\"force\":true}");

        assertThat(parsed.errors()).containsExactly(new FieldError("force", "UNKNOWN_FIELD"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "ni json", "[1,2]", "\"a@b.si\"", "{\"email\":"})
    void malformedBodyOrNonObjectIsMalformed(String body) {
        List<FieldError> errors = DeleteAccountInputParser.parse(body).errors();

        assertThat(errors).containsExactly(new FieldError("body", "MALFORMED"));
    }

    @Test
    void nonStringEmailIsNotAcceptedAsValidValue() {
        assertThat(DeleteAccountInputParser.parse("{\"email\":5}").errors()).isNotEmpty();
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "pia@primer.si|pia@primer.si|true",
                "pia@primer.si|PIA@PRIMER.SI|true",
                "pia@primer.si|pia@primer.org|false",
                "pia@primer.si|ana@primer.si|false",
                "pi a@primer.si|pia@primer.si|false",
                "|pia@primer.si|false"
            })
    void matchesTrimsAndIgnoresCase(String typed, String actual, boolean expected) {
        assertThat(DeleteAccountInputParser.matches(typed, actual)).isEqualTo(expected);
    }

    @org.junit.jupiter.api.Test
    void matchesTrimsTabsAndNewlines() {
        assertThat(DeleteAccountInputParser.matches("\tpia@primer.si\n", "pia@primer.si"))
                .isTrue();
    }
}
