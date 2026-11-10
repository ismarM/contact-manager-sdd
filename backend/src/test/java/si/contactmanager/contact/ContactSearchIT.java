package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/**
 * Prosto iskanje po predefiniranih atributih (FR-008-01, FR-008-02, FR-008-16; specs/008-iskanje/spec.md US1, Edge
 * Cases). Pričakovani zadetki so dobesedni, napisani iz specifikacije.
 */
class ContactSearchIT extends ContactSearchApiTest {

    @Test
    @Tag("FR-008-01")
    void searchFindsPartOfEmailAndReportsTheTotal() throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak", "janez@feri.si", null, null);
        add(s, "Mojca", "Kralj", "mojca@primer.si", null, null);

        HttpResponse<String> response = search(s, "q", "feri");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.names(response.body())).containsExactly("Janez Novak");
        assertThat(ContactSearchClient.total(response.body())).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource({
        "Janez,Novak,NOVAK,Janez Novak",
        "Janez,Novak,nov,Janez Novak",
        "Janez,Novak,JANEZ,Janez Novak",
    })
    @Tag("FR-008-01")
    @Tag("FR-008-02")
    void searchIgnoresCase(String first, String last, String q, String expected) throws Exception {
        Scenario s = scenario();
        add(s, first, last);
        add(s, "Mojca", "Kralj");

        assertThat(found(s, "q", q)).containsExactly(expected);
    }

    @ParameterizedTest
    @CsvSource({
        "Zupančič,ZUPANCIC",
        "Zupančič,zupanč",
        "Zupančič,ZUPANČ",
        "Zupančič,zupancic",
        "Ceh,čeh",
        "Čeh,ceh",
        "Šuligoj,suligoj",
        "Žagar,ZAGAR",
        "Müller,muller",
        "Đorđe,dorde",
    })
    @Tag("FR-008-02")
    void searchIgnoresDiacriticsInBothDirections(String lastName, String q) throws Exception {
        Scenario s = scenario();
        add(s, "Nekdo", lastName);
        add(s, "Drugi", "Neujemajoč");

        assertThat(found(s, "q", q)).containsExactly("Nekdo " + lastName);
    }

    @Test
    @Tag("FR-008-02")
    void everyWordMustBeInAtLeastOnePredefinedAttribute() throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak", "janez@feri.si", null, null);
        add(s, "Janez", "Kralj", "kralj@primer.si", null, null);

        assertThat(found(s, "q", "janez novak")).containsExactly("Janez Novak");
        // besedi sta v različnih atributih: ime in e-naslov
        assertThat(found(s, "q", "novak feri")).containsExactly("Janez Novak");
        assertThat(found(s, "q", "kralj feri")).isEmpty();
        assertThat(found(s, "q", "janez")).containsExactlyInAnyOrder("Janez Novak", "Janez Kralj");
        // vrstni red besed ni pomemben, presledki se združijo
        assertThat(found(s, "q", "  novak    janez ")).containsExactly("Janez Novak");
    }

    @Test
    @Tag("FR-008-01")
    void everyPredefinedAttributeIsSearched() throws Exception {
        Scenario s = scenario();
        add(s, "Ime1", "Priimek1", null, null, "Cesta na Rožnik 5, Ljubljana");
        add(s, "Ime2", "Priimek2", "oseba@feri.si", null, null);
        add(s, "Ime3", "Priimek3", null, "041 123 456", null);
        add(s, "Ime4", "Priimek4", null, null, null);

        assertThat(found(s, "q", "rožnik")).containsExactly("Ime1 Priimek1");
        assertThat(found(s, "q", "oseba@")).containsExactly("Ime2 Priimek2");
        assertThat(found(s, "q", "123 456")).containsExactly("Ime3 Priimek3");
        assertThat(found(s, "q", "Ime4")).containsExactly("Ime4 Priimek4");
        assertThat(found(s, "q", "priimek4")).containsExactly("Ime4 Priimek4");
    }

    @Test
    @Tag("FR-008-01")
    void additionalAttributesAndTagsAreNotPartOfFreeSearch() throws Exception {
        Scenario s = scenario();
        UUID id = add(s, "Janez", "Novak");
        contacts.addAttribute(id, 0, "kompetenca", "web dev");
        contacts.addTag(id, 0, "konferenca2025");

        assertThat(found(s, "q", "web dev")).isEmpty();
        assertThat(found(s, "q", "konferenca2025")).isEmpty();
        assertThat(found(s, "q", "kompetenca")).isEmpty();
        assertThat(found(s, "q", "janez")).containsExactly("Janez Novak");
    }

    @Test
    @Tag("FR-008-01")
    void emptyOrBlankSearchStringShowsEveryContact() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", "A");
        add(s, "Bojan", "B");

        assertThat(totalFor(s, "q", "")).isEqualTo(2);
        assertThat(totalFor(s, "q", "     ")).isEqualTo(2);
        assertThat(totalFor(s, "q", "\t  ")).isEqualTo(2);
    }

    @Test
    @Tag("FR-008-01")
    void specialCharactersAreSearchedLiterally() throws Exception {
        Scenario s = scenario();
        add(s, "A", "Odstotek", null, null, "Popust 100%");
        add(s, "B", "Podčrtaj", null, null, "ime a_b konec");
        add(s, "C", "Zvezdica", null, null, "x*y");
        add(s, "D", "Plus", null, null, "1+1=2");
        add(s, "E", "Oklepaj", null, null, "(skupaj)");
        add(s, "F", "Poševnica", null, null, "pot\\ena");
        add(s, "G", "Navadna", null, null, "abc xyz");

        assertThat(found(s, "q", "%")).containsExactly("A Odstotek");
        assertThat(found(s, "q", "_")).containsExactly("B Podčrtaj");
        assertThat(found(s, "q", "*")).containsExactly("C Zvezdica");
        assertThat(found(s, "q", "+")).containsExactly("D Plus");
        assertThat(found(s, "q", "(")).containsExactly("E Oklepaj");
        assertThat(found(s, "q", "\\")).containsExactly("F Poševnica");
        // ne delujejo kot nadomestni znaki: »a_b« ne najde »abc«, »x*y« ne najde »xyz«
        assertThat(found(s, "q", "a_b")).containsExactly("B Podčrtaj");
        assertThat(found(s, "q", "x*y")).containsExactly("C Zvezdica");
        assertThat(found(s, "q", "1%")).isEmpty();
    }

    @Test
    @Tag("FR-008-01")
    void phoneIsComparedLiterallyWithoutNormalization() throws Exception {
        Scenario s = scenario();
        add(s, "S", "Presledki", null, "041 123 456", null);
        add(s, "B", "Brez", null, "041123456", null);

        assertThat(found(s, "q", "041 123")).containsExactly("S Presledki");
        assertThat(found(s, "q", "041123")).containsExactly("B Brez");
    }

    @Test
    @Tag("FR-008-02")
    void punctuationAndSpacesStayMeaningfulInTheSearch() throws Exception {
        Scenario s = scenario();
        add(s, "Eva", "Novak-Kralj");

        assertThat(found(s, "q", "novak-kralj")).containsExactly("Eva Novak-Kralj");
        assertThat(found(s, "q", "novakkralj")).isEmpty();
    }

    @Test
    @Tag("FR-008-16")
    void searchOnlyReturnsContactsOfTheGroupInThePath() throws Exception {
        Scenario a = scenario();
        add(a, "Janez", "Novak");
        add(a, "Mojca", "Kralj");
        UUID other = groups.createGroup(a.id(Who.OWNER), "Skupina B");
        groups.addMember(other, a.id(Who.VIEWER), "VIEWER");
        contacts.insert(other, a.id(Who.OWNER), "Janez", "Kralj");

        assertThat(found(a, "q", "janez")).containsExactly("Janez Novak");
        HttpResponse<String> inOther =
                get(ContactSearchClient.listPath(other) + ContactSearchClient.query("q", "janez"), a.token(Who.VIEWER));
        assertThat(ContactSearchClient.names(inOther.body())).containsExactly("Janez Kralj");
        assertThat(ContactSearchClient.total(inOther.body())).isEqualTo(1);
    }

    @Test
    @Tag("FR-008-01")
    void withoutParametersTheAnswerIsTheUnfilteredPageOfFeature004() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", "B");
        add(s, "Bojan", "A");

        HttpResponse<String> response = get(ContactSearchClient.listPath(s.group()), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.names(response.body())).containsExactly("Bojan A", "Ana B");
        assertThat(ContactSearchClient.page(response.body())).containsOnlyKeys("total", "page", "size", "items");
    }

    @Test
    @Tag("FR-008-01")
    void everyRoleMayUseTheSearch() throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak");
        add(s, "Mojca", "Kralj");

        for (Who who : new Who[] {Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER}) {
            HttpResponse<String> response = search(s, who, "q", "novak");
            assertThat(response.statusCode()).as(who.name()).isEqualTo(200);
            assertThat(ContactSearchClient.names(response.body()))
                    .as(who.name())
                    .containsExactly("Janez Novak");
        }
    }
}
