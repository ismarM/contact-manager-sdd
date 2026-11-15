package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Rezervirana imena ključev (FR-013-08): nova imena veljajo samo za ključe, ki jih kontakt še nima. */
@Tag("FR-013-08")
class AttributeKeysTest {

    private static List<Attribute> attrs(String... keys) {
        return java.util.Arrays.stream(keys).map(k -> new Attribute(k, "v")).toList();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Država", "DRŽAVA", "country", "  Country ", "Podjetje", "company", "COMPANY"})
    void newReservedNamesAreRecognisedAfterNormalisation(String key) {
        assertThat(AttributeKeys.NEW_RESERVED).contains(AttributeKeys.reservedForm(key));
    }

    @Test
    void aNewReservedKeyIsAnErrorWithTheFieldOfTheRow() {
        List<FieldError> errors = AttributeKeys.reservedErrors(attrs("Vloga", "Država", "company"), Set.of());

        assertThat(errors)
                .containsExactly(
                        new FieldError("attributes[1].key", "RESERVED_KEY"),
                        new FieldError("attributes[2].key", "RESERVED_KEY"));
    }

    @Test
    void aKeyTheContactAlreadyHoldsIsAllowedIgnoringCase() {
        Set<String> held = AttributeKeys.normalizedKeys(attrs("Država", "Podjetje"));

        assertThat(AttributeKeys.reservedErrors(attrs("država", "PODJETJE", "Vloga"), held))
                .isEmpty();
        assertThat(AttributeKeys.reservedErrors(attrs("Country"), held))
                .containsExactly(new FieldError("attributes[0].key", "RESERVED_KEY"));
    }

    @Test
    void allReservedNamesAreTheOlderElevenPlusTheNewFour() {
        assertThat(AttributeKeys.ALL_RESERVED).hasSize(ContactInputParser.RESERVED_KEYS.size() + 4);
        assertThat(AttributeKeys.ALL_RESERVED).contains("ime", "phone", "država", "country", "podjetje", "company");
    }

    @Test
    void theOlderPredefinedNamesStayRejectedByTheParserNotByTheNewCheck() {
        assertThat(AttributeKeys.reservedErrors(attrs("Ime", "Telefon"), Set.of()))
                .isEmpty();
        assertThat(ContactInputParser.RESERVED_KEYS).contains("ime", "telefon");
    }
}
