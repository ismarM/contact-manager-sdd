package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Normalizacija telefona (016, FR-016-08, research R-02): E.164, država kontakta, pripona, kratke številke. */
@Tag("FR-016-08")
class PhoneNormalizerTest {

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "041 123 456|SI|+38641123456",
                "041123456|SI|+38641123456",
                "+386 41 123 456|SI|+38641123456",
                "00386 41 123 456|SI|+38641123456",
                "(01) 234 56 78|SI|+38612345678",
                "01/234-56-78|SI|+38612345678",
                "041 123 456|null|+38641123456",
                "041 123 456|XX|+38641123456",
                "+1 (202) 555-0123|SI|+12025550123",
                "(202) 555-0123|US|+12025550123",
                "030 123456|DE|+4930123456",
                "01 234 56 78 int. 12|SI|+38612345678;ext=12",
                "01 234 56 78 x 345|SI|+38612345678;ext=345",
                "01 234 56 78;ext=7|SI|+38612345678;ext=7",
                "01 234 56 78 #9|SI|+38612345678;ext=9",
                "112|SI|112",
                "112|null|112",
                "  041 123 456  |SI|+38641123456",
            })
    void normalizesToCanonicalForm(String raw, String country, String expected) {
        assertThat(PhoneNormalizer.normalize(raw, "null".equals(country) ? null : country))
                .contains(expected);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "   ",
                "abc",
                "041 ABC 456",
                "1-800-FLOWERS",
                "123",
                "041 123",
                "+386",
                "+999 12345",
                "041 123 456 789 012 345",
                "01 234 56 78 int. 1234567890",
                "041 123 456 !",
                "++386 41 123 456",
            })
    void rejectsInvalidNumbers(String raw) {
        assertThat(PhoneNormalizer.normalize(raw, "SI")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"+386 41 123 456", "041 123 456", "00386 41 123 456"})
    void isIdempotentOnItsOwnOutput(String raw) {
        String once = PhoneNormalizer.normalize(raw, "SI").orElseThrow();
        assertThat(PhoneNormalizer.normalize(once, "SI")).contains(once);
    }

    @ParameterizedTest
    @ValueSource(strings = {"01 234 56 78", "041 123 456"})
    void countryOfTheContactDecidesTheRegionOfANationalNumber(String raw) {
        assertThat(PhoneNormalizer.normalize(raw, "SI").orElseThrow()).startsWith("+386");
        assertThat(PhoneNormalizer.normalize(raw, "AT")).isNotEqualTo(PhoneNormalizer.normalize(raw, "SI"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"112", "113", "116 111"})
    void validShortNumbersAreStoredAsDigits(String raw) {
        assertThat(PhoneNormalizer.normalize(raw, "SI")).hasValue(raw.replace(" ", ""));
    }
}
