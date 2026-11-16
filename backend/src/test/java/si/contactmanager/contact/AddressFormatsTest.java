package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Naslov kot besedilo po pravilih države (016, research R-04; {@code address-formats.json}). */
@Tag("FR-016-12")
class AddressFormatsTest {

    @Test
    void sloveniaPutsThePostalCodeBeforeTheCityAndTheCountryLast() {
        Address address = new Address("Slovenska cesta 1", "3. nadstropje", "1000", "Ljubljana", null, "SI");

        assertThat(AddressFormats.text(address))
                .isEqualTo("Slovenska cesta 1\n3. nadstropje\n1000 Ljubljana\n" + CountryNames.display("SI", "sl"));
        assertThat(AddressFormats.text(address, "en")).endsWith("\nSlovenia");
    }

    @Test
    void unitedStatesUsesCityRegionPostalCodeAndDropsSeparatorsOfMissingParts() {
        assertThat(AddressFormats.text(new Address("5 Main Street", null, "62701", "Springfield", "IL", "US"), "en"))
                .isEqualTo("5 Main Street\nSpringfield, IL 62701\nUnited States");
        assertThat(AddressFormats.text(new Address(null, null, null, "Springfield", null, "US"), "en"))
                .isEqualTo("Springfield\nUnited States");
        assertThat(AddressFormats.text(new Address("5 Main Street", null, "62701", null, "IL", "US"), "en"))
                .isEqualTo("5 Main Street\nIL 62701\nUnited States");
    }

    @Test
    void unknownOrMissingCountryUsesTheDefaultFormat() {
        assertThat(AddressFormats.text(new Address("Ulica 2", null, "2000", "Maribor", null, null)))
                .isEqualTo("Ulica 2\n2000 Maribor");
        assertThat(AddressFormats.format("ZZ")).isEqualTo(AddressFormats.format(null));
        assertThat(AddressFormats.format("HU")).isEqualTo("%C%n%A%n%Z");
    }
}
