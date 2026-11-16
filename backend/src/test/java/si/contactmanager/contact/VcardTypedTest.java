package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Tipi v preslikavi vCard (016, FR-016-24, -25) brez zaledja: pisalnik zapiše tipe in dele naslova, bralnik jih prebere
 * nazaj (krožna pot), tuja datoteka brez naših lastnosti dobi tipe po pravilih R-10.
 */
@Tag("FR-016-24")
@Tag("FR-016-25")
class VcardTypedTest {

    private static VcardContact contact(Address parts, String address, List<Attribute> attributes) {
        return new VcardContact(
                null, null, "Ana", "Kos", address, parts, null, null, null, "SI", attributes, List.of());
    }

    private static ImportCandidate roundTrip(VcardContact contact) throws Exception {
        String written = VcardWriter.write(List.of(contact), "sl");
        return VcardReader.read(written, "sl").candidates().get(0);
    }

    @Test
    void addressPartsSurviveTheRoundTripAndAStreetOnlyPartsAddressStaysStructured() throws Exception {
        Address full = new Address("Trg 1", "Vhod B", "1000", "Ljubljana", "Osrednjeslovenska", "SI");
        Address streetOnly = new Address("Trg 1\nvhod", null, null, null, null, null);

        ImportCandidate a = roundTrip(contact(full, null, List.of()));
        ImportCandidate b = roundTrip(contact(streetOnly, null, List.of()));

        assertThat(a.addressParts()).isEqualTo(full);
        assertThat(a.address()).isNull();
        assertThat(a.countryText()).isEqualTo("SI");
        assertThat(b.addressParts()).isEqualTo(new Address("Trg 1\nvhod", null, null, null, null, null));
    }

    @Test
    void anUnparsedAddressIsWrittenInTheStreetPartAndReadBackAsText() throws Exception {
        String written = VcardWriter.write(List.of(contact(null, "Trg 1\n1000 Ljubljana", List.of())), "sl");

        ImportCandidate read = VcardReader.read(written, "sl").candidates().get(0);

        assertThat(written).contains("ADR;X-CM-CC=SI:;;Trg 1\\n1000 Ljubljana;;;;Slovenija");
        assertThat(read.address()).isEqualTo("Trg 1\n1000 Ljubljana");
        assertThat(read.addressParts()).isNull();
    }

    @Test
    void everyTypeIsWrittenAsItsPropertyWithTheKeyLabelAndReadBackWithTheSameType() throws Exception {
        List<Attribute> attributes = List.of(
                new Attribute("Služba", AttributeType.PHONE, "+38612345678", null),
                new Attribute("Pisarna", AttributeType.EMAIL, "ana@delo.si", null),
                new Attribute(
                        "Vikend", AttributeType.ADDRESS, null, new Address("Gozdna 5", null, null, "Bled", null, "AT")),
                new Attribute("Dom", AttributeType.ADDRESS, "Stara cesta 3, Kranj", null),
                new Attribute("Splet", AttributeType.URL, "https://primer.si", null),
                new Attribute("Rojstvo", AttributeType.DATE, "1990-05-17", null),
                new Attribute("Opomba", AttributeType.NOTES, "Prva\nDruga; tretja, četrta \\", null),
                new Attribute("Vloga", AttributeType.OTHER, "mentor", null));
        VcardContact contact = contact(null, null, attributes);

        String written = VcardWriter.write(List.of(contact), "sl").replace("\r\n ", "");
        ImportCandidate read = roundTrip(contact);

        assertThat(written)
                .contains("attr1.TEL:+38612345678", "attr1.X-ABLabel:Služba", "attr1.X-CM-KEY:Služba")
                .contains("attr2.EMAIL:ana@delo.si")
                .contains("attr5.URL:https://primer.si")
                .contains("attr6.BDAY:1990-05-17")
                .contains("attr7.NOTE:Prva\\nDruga\\; tretja\\, četrta \\\\")
                .contains("attr8.X-CM-KEY:Vloga", "attr8.X-CM-VALUE:mentor");
        assertThat(read.attributes()).isEqualTo(attributes);
    }

    @Test
    void aForeignFileGetsTypesForExtraPropertiesAndKeepsAStreetOnlyAdrAsText() throws Exception {
        String vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bor Zupan\r\n"
                + "ADR:;;Glavni trg 1;;;;Slovenija\r\nADR:;;Druga cesta 2;Celje;;3000;Avstrija\r\n"
                + "TEL:041 555 666\r\nTEL:01 222 3333\r\nEMAIL:a@b.si\r\nEMAIL:c@d.si\r\n"
                + "BDAY:1985-02-03\r\nURL:https://bor.si\r\nNOTE:Pozdravi\r\nEND:VCARD\r\n";

        ImportCandidate read = VcardReader.read(vcf, "sl").candidates().get(0);

        assertThat(read.address()).isEqualTo("Glavni trg 1");
        assertThat(read.addressParts()).isNull();
        assertThat(read.attributes())
                .containsExactly(
                        new Attribute("E-naslov 2", AttributeType.EMAIL, "c@d.si", null),
                        new Attribute("Telefon 2", AttributeType.PHONE, "01 222 3333", null),
                        new Attribute("Naslov 2", AttributeType.ADDRESS, "Druga cesta 2, 3000 Celje, Avstrija", null),
                        new Attribute("Rojstni dan", AttributeType.DATE, "1985-02-03", null),
                        new Attribute("Spletna stran", AttributeType.URL, "https://bor.si", null),
                        new Attribute("Opomba", AttributeType.NOTES, "Pozdravi", null));
    }

    @Test
    void aLabelledGroupOfAnotherApplicationWithoutOurKeyIsNotAnAttribute() throws Exception {
        String vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bor Zupan\r\n"
                + "item1.TEL:041 555 666\r\nitem1.X-ABLabel:Mama\r\nEND:VCARD\r\n";

        ImportCandidate read = VcardReader.read(vcf, "sl").candidates().get(0);

        assertThat(read.phone()).isEqualTo("041 555 666");
        assertThat(read.attributes()).isEmpty();
    }
}
