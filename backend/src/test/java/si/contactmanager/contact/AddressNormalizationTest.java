package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Normalizacija strukturiranega naslova (016, FR-016-12, FR-016-15; research R-04). */
@Tag("FR-016-12")
@Tag("FR-016-15")
class AddressNormalizationTest {

    private static TypedValues.AddressResult run(
            String street, String extra, String postal, String city, String region, String country) {
        return TypedValues.normalizeAddress(new Address(street, extra, postal, city, region, country));
    }

    @Test
    void trimsCollapsesSpacesUppercasesPostalCodeAndCountry() {
        TypedValues.AddressResult result = run(
                "  Cesta   v  Mestni log 1 ", " 2. nadstropje ", " 1000 ", "  Ljubljana ", "  Osrednjeslovenska", "si");

        assertThat(result.valid()).isTrue();
        assertThat(result.address())
                .isEqualTo(new Address(
                        "Cesta v Mestni log 1", "2. nadstropje", "1000", "Ljubljana", "Osrednjeslovenska", "SI"));
    }

    @Test
    void postalCodeIsUppercasedAndKeptOtherwise() {
        assertThat(run(null, null, "sw1a 1aa", "London", null, "gb").address().postalCode())
                .isEqualTo("SW1A 1AA");
    }

    @Test
    void emptyPartsAreDropped() {
        TypedValues.AddressResult result = run("Cesta 1", "  ", "", null, " ", null);

        assertThat(result.address()).isEqualTo(new Address("Cesta 1", null, null, null, null, null));
    }

    @Test
    void streetOrCityIsRequired() {
        assertThat(run("Cesta 1", null, null, null, null, null).valid()).isTrue();
        assertThat(run(null, null, null, "Ljubljana", null, null).valid()).isTrue();
        assertThat(run(null, "dodatno", "1000", null, "regija", "SI").errors())
                .containsExactly(new FieldError("street", "REQUIRED"));
        assertThat(TypedValues.normalizeAddress(null).errors()).containsExactly(new FieldError("street", "REQUIRED"));
        assertThat(run(" ", " ", " ", " ", " ", " ").errors()).containsExactly(new FieldError("street", "REQUIRED"));
    }

    @Test
    void partLimitsAre200_200_20_100_100() {
        assertThat(run("s".repeat(200), "e".repeat(200), "p".repeat(20), "c".repeat(100), "r".repeat(100), "SI")
                        .valid())
                .isTrue();

        List<FieldError> errors = run(
                        "s".repeat(201), "e".repeat(201), "p".repeat(21), "c".repeat(101), "r".repeat(101), "SI")
                .errors();

        assertThat(errors)
                .containsExactlyInAnyOrder(
                        new FieldError("street", "TOO_LONG"),
                        new FieldError("extra", "TOO_LONG"),
                        new FieldError("postalCode", "TOO_LONG"),
                        new FieldError("city", "TOO_LONG"),
                        new FieldError("region", "TOO_LONG"));
    }

    @Test
    void unicodePartsAndCodePointLengthAreRespected() {
        assertThat(run("Šmartinska cesta 152", null, null, "Črnomelj", null, "SI")
                        .valid())
                .isTrue();
        String emoji = "😀".repeat(100);
        assertThat(run(null, null, null, emoji, null, null).valid()).isTrue();
        assertThat(run(null, null, null, emoji + "a", null, null).errors())
                .containsExactly(new FieldError("city", "TOO_LONG"));
    }

    @Test
    void countryMustBeAnIsoCode() {
        assertThat(run("Cesta 1", null, null, null, null, "XX").errors())
                .containsExactly(new FieldError("country", "INVALID_VALUE"));
        assertThat(run("Cesta 1", null, null, null, null, "Slovenija").errors())
                .containsExactly(new FieldError("country", "INVALID_VALUE"));
        assertThat(run("Cesta 1", null, null, null, null, " at ").address().country())
                .isEqualTo("AT");
    }

    @Test
    void normalizationIsIdempotent() {
        Address once = run(" Cesta  1 ", null, "sw1a 1aa", "London", null, "gb").address();

        assertThat(TypedValues.normalizeAddress(once).address()).isEqualTo(once);
    }
}
