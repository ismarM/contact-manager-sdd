package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactSearchApiTest;

/**
 * Iskanje telefona po števkah (016, FR-016-10, SC-002; research R-06): »041 123«, »041123« in »+38641« najdejo
 * {@code +38641123456} v predefiniranem polju in v atributu tipa {@code PHONE}; e-naslov brez razlike velikosti črk.
 */
@Tag("FR-016-10")
class PhoneSearchIT extends ContactSearchApiTest {

    @Test
    void anyWrittenFormOfThePhoneFindsTheContact() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", "Novak", null, "+38641123456", null);
        add(s, "Boris", "Zupan", null, "+38631999888", null);

        for (String query : List.of("041 123", "041123", "+38641", "38641123", "(041)123")) {
            assertThat(found(s, "q", query)).as(query).containsExactly("Ana Novak");
        }
        assertThat(found(s, "q", "031 999")).containsExactly("Boris Zupan");
    }

    @Test
    void aPhoneAttributeIsFoundByDigitsButAnOtherAttributeIsNot() throws Exception {
        Scenario s = scenario();
        UUID ana = add(s, "Ana", "Novak");
        UUID boris = add(s, "Boris", "Zupan");
        contacts.addAttribute(ana, 0, "mobilni", "+38641123456");
        contacts.addAttribute(boris, 0, "koda", "+38641123456");
        jdbc.update("insert into attribute_key (group_id, key_norm, type) values (?, 'mobilni', 'PHONE')", s.group());
        jdbc.update("insert into attribute_key (group_id, key_norm) values (?, 'koda')", s.group());

        assertThat(found(s, "q", "041 123")).containsExactly("Ana Novak");
    }

    @Test
    void anEmailAttributeIsFoundWithoutRegardToCase() throws Exception {
        Scenario s = scenario();
        UUID ana = add(s, "Ana", "Novak");
        contacts.addAttribute(ana, 0, "pošta", "ana@Delo.si");
        jdbc.update("insert into attribute_key (group_id, key_norm, type) values (?, 'pošta', 'EMAIL')", s.group());

        assertThat(found(s, "q", "DELO.si")).containsExactly("Ana Novak");
    }

    @Test
    void searchOverTenThousandContactsIsFast() throws Exception {
        Scenario s = scenario();
        contacts.insertDistribution(s.group(), s.id(Who.OWNER), 10_000);
        jdbc.update("update contact set phone = '+38641' || right(phone, 6) where group_id = ?", s.group());
        search(s, "q", "041 000"); // ogrevanje

        long start = System.nanoTime();
        long total = totalFor(s, "q", "041 123");
        long millis = (System.nanoTime() - start) / 1_000_000;

        assertThat(total).isPositive();
        assertThat(millis).as("trajanje iskanja v ms").isLessThan(1000);
    }
}
