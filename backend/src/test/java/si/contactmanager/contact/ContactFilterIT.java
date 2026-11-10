package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactSearchApiTest;

/**
 * Filtri po atributih, dodatnih atributih in značkah ter njihova kombinacija z iskanjem (FR-008-03, FR-008-04,
 * FR-008-05; specs/008-iskanje/spec.md US2). Pričakovani zadetki so dobesedni.
 */
class ContactFilterIT extends ContactSearchApiTest {

    private UUID withAttribute(Scenario s, String first, String last, String key, String value) {
        UUID id = add(s, first, last);
        contacts.addAttribute(id, 0, key, value);
        return id;
    }

    @Test
    @Tag("FR-008-03")
    void conditionOnAdditionalAttributeContainsTheValueIgnoringCase() throws Exception {
        Scenario s = scenario();
        withAttribute(s, "A", "Prvi", "kompetenca", "web dev");
        withAttribute(s, "B", "Drugi", "kompetenca", "Web Design");
        withAttribute(s, "C", "Tretji", "kompetenca", "backend");

        assertThat(found(s, "f", "x.kompetenca:web")).containsExactlyInAnyOrder("A Prvi", "B Drugi");
        assertThat(found(s, "f", "x.kompetenca:WEB")).containsExactlyInAnyOrder("A Prvi", "B Drugi");
        assertThat(found(s, "f", "x.kompetenca:back")).containsExactly("C Tretji");
        assertThat(totalFor(s, "f", "x.kompetenca:web")).isEqualTo(2);
    }

    @Test
    @Tag("FR-008-03")
    void conditionValueIgnoresDiacritics() throws Exception {
        Scenario s = scenario();
        withAttribute(s, "A", "Prvi", "mesto", "Črnomelj");
        withAttribute(s, "B", "Drugi", "mesto", "Celje");

        assertThat(found(s, "f", "x.mesto:crn")).containsExactly("A Prvi");
        assertThat(found(s, "f", "x.mesto:ČRN")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-03")
    void attributeKeyIsMatchedIgnoringCase() throws Exception {
        Scenario s = scenario();
        withAttribute(s, "A", "Prvi", "Kompetenca", "web");
        withAttribute(s, "B", "Drugi", "podjetje", "web");

        assertThat(found(s, "f", "x.kompetenca:web")).containsExactly("A Prvi");
        assertThat(found(s, "f", "x.KOMPETENCA:web")).containsExactly("A Prvi");
        assertThat(found(s, "f", "x.Kompetenca:web")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-03")
    void contactWithoutTheKeyDoesNotMatch() throws Exception {
        Scenario s = scenario();
        withAttribute(s, "A", "Prvi", "kompetenca", "web");
        withAttribute(s, "B", "Drugi", "podjetje", "web agencija");
        add(s, "C", "Brez");

        assertThat(found(s, "f", "x.kompetenca:web")).containsExactly("A Prvi");
        assertThat(found(s, "f", "x.podjetje:web")).containsExactly("B Drugi");
    }

    @Test
    @Tag("FR-008-03")
    @Tag("FR-008-05")
    void conditionsOnDifferentFieldsMustAllHold() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "A", "Prvi", "a@feri.si", null, null);
        contacts.addAttribute(a, 0, "kompetenca", "web dev");
        UUID b = add(s, "B", "Drugi", "b@primer.si", null, null);
        contacts.addAttribute(b, 0, "kompetenca", "web design");
        UUID c = add(s, "C", "Tretji", "c@feri.si", null, null);
        contacts.addAttribute(c, 0, "kompetenca", "backend");

        assertThat(found(s, "f", "x.kompetenca:web", "f", "email:feri.si")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-03")
    @Tag("FR-008-05")
    void severalConditionsOnTheSameFieldAreCombinedWithAnd() throws Exception {
        Scenario s = scenario();
        withAttribute(s, "A", "Prvi", "kompetenca", "web dev");
        withAttribute(s, "B", "Drugi", "kompetenca", "web design");
        withAttribute(s, "C", "Tretji", "kompetenca", "mobile dev");

        assertThat(found(s, "f", "x.kompetenca:web", "f", "x.kompetenca:dev")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-03")
    void conditionsOnPredefinedFields() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", "Čeh", "ana@feri.si", "041 111 222", "Ulica 1");
        add(s, "Bojan", "Kralj", "bojan@primer.si", "031 333 444", "Cesta 2");

        assertThat(found(s, "f", "lastName:ceh")).containsExactly("Ana Čeh");
        assertThat(found(s, "f", "firstName:BOJ")).containsExactly("Bojan Kralj");
        assertThat(found(s, "f", "phone:041")).containsExactly("Ana Čeh");
        assertThat(found(s, "f", "phone:041 111")).containsExactly("Ana Čeh");
        assertThat(found(s, "f", "phone:041111")).isEmpty();
        assertThat(found(s, "f", "email:primer")).containsExactly("Bojan Kralj");
        assertThat(found(s, "f", "address:cesta")).containsExactly("Bojan Kralj");
    }

    @Test
    @Tag("FR-008-04")
    void tagsRequireEverySelectedTag() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "A", "Prvi");
        contacts.addTags(a, "konferenca2025", "vip");
        UUID b = add(s, "B", "Drugi");
        contacts.addTags(b, "vip");
        add(s, "C", "Tretji");

        assertThat(found(s, "tag", "vip", "tag", "konferenca2025")).containsExactly("A Prvi");
        assertThat(found(s, "tag", "vip")).containsExactlyInAnyOrder("A Prvi", "B Drugi");
        assertThat(found(s, "tag", "konferenca2025")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-04")
    void tagComparisonIgnoresCase() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "A", "Prvi");
        contacts.addTags(a, "VIP");
        add(s, "B", "Brez");

        assertThat(found(s, "tag", "vip")).containsExactly("A Prvi");
        assertThat(found(s, "tag", "Vip")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-04")
    void nonExistingTagGivesZeroResultsNotAnError() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "A", "Prvi");
        contacts.addTags(a, "vip");

        assertThat(search(s, "tag", "ne-obstaja").statusCode()).isEqualTo(200);
        assertThat(totalFor(s, "tag", "ne-obstaja")).isZero();
        assertThat(totalFor(s, "tag", "vip", "tag", "ne-obstaja")).isZero();
    }

    @Test
    @Tag("FR-008-04")
    void duplicatedTagsInTheRequestCountOnce() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "A", "Prvi");
        contacts.addTags(a, "vip");
        add(s, "B", "Brez");

        assertThat(found(s, "tag", "vip", "tag", "VIP", "tag", "vip")).containsExactly("A Prvi");
    }

    @Test
    @Tag("FR-008-05")
    void searchConditionAndTagsAreCombinedWithAnd() throws Exception {
        Scenario s = scenario();
        UUID a = add(s, "Janez", "Novak", null, "041 123 456", null);
        contacts.addTags(a, "vip");
        UUID b = add(s, "Janez", "Novak", null, "031 123 456", null);
        contacts.addTags(b, "vip");
        UUID c = add(s, "Janez", "Novak", null, "041 999 999", null);
        contacts.addTags(c, "drugo");
        UUID d = add(s, "Mojca", "Kralj", null, "041 111 111", null);
        contacts.addTags(d, "vip");

        assertThat(totalFor(s, "q", "novak", "f", "phone:041", "tag", "vip")).isEqualTo(1);
        assertThat(found(s, "q", "novak", "f", "phone:041", "tag", "vip")).containsExactly("Janez Novak");
        assertThat(totalFor(s, "q", "novak", "f", "phone:041")).isEqualTo(2);
        assertThat(totalFor(s, "f", "phone:041", "tag", "vip")).isEqualTo(2);
        assertThat(totalFor(s, "q", "kralj", "f", "phone:031", "tag", "vip")).isZero();
    }

    @Test
    @Tag("FR-008-03")
    void hostileValuesAreLiteralAndDoNotHarmTheDatabase() throws Exception {
        Scenario s = scenario();
        withAttribute(s, "A", "Odstotek", "popust", "100%");
        withAttribute(s, "B", "Navadni", "popust", "abc");

        assertThat(found(s, "f", "x.popust:%")).containsExactly("A Odstotek");
        assertThat(found(s, "f", "x.popust:_")).isEmpty();
        assertThat(search(s, "f", "x.popust:'; DROP TABLE contact;--").statusCode())
                .isEqualTo(200);
        assertThat(totalFor(s, "f", "x.popust:'; DROP TABLE contact;--")).isZero();
        assertThat(search(s, "tag", "'; DROP TABLE contact_tag;--").statusCode())
                .isEqualTo(200);
        assertThat(contacts.count(s.group())).isEqualTo(2);
        assertThat(found(s, "f", "x.popust:abc")).containsExactly("B Navadni");
    }
}
