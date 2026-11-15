package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ExportApiTest;
import si.contactmanager.contact.support.XlsxReader.Workbook;

/** Stolpca *Država* (ime v jeziku izvoza) in *Podjetje* v izvozu (FR-013-04). */
@Tag("FR-013-04")
class ExportNewFieldsIT extends ExportApiTest {

    private Workbook export(Scenario s, UUID contact, String language) throws Exception {
        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(contact), language));
        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        return workbook(response);
    }

    @Test
    void theNewColumnsFollowPhoneAndPrecedeAttributesAndTagsInSlovenian() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", "ana@primer.si", "041 111 111", "Trg 1");
        contacts.setCompanyAndCountry(id, "Acme d.o.o.", "AT");
        contacts.addAttribute(id, 0, "Vloga", "vodja");
        contacts.addTag(id, 0, "vip");

        Workbook book = export(s, id, "sl");

        assertThat(book.rows())
                .containsExactly(
                        List.of(
                                "Ime",
                                "Priimek",
                                "Naslov",
                                "E-naslov",
                                "Telefon",
                                "Država",
                                "Podjetje",
                                "Vloga",
                                "Značke"),
                        List.of(
                                "Ana",
                                "Kos",
                                "Trg 1",
                                "ana@primer.si",
                                "041 111 111",
                                "Avstrija",
                                "Acme d.o.o.",
                                "vodja",
                                "vip"));
        assertThat(book.allText()).isTrue();
        assertThat(book.hasFormula()).isFalse();
    }

    @Test
    void theEnglishFileUsesEnglishHeadersAndCountryNames() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");
        contacts.setCompanyAndCountry(id, "Acme", "SI");

        Workbook book = export(s, id, "en");

        assertThat(book.rows().get(0))
                .containsExactly("First name", "Last name", "Address", "Email", "Phone", "Country", "Company", "Tags");
        assertThat(book.rows().get(1)).containsExactly("Ana", "Kos", "", "", "", "Slovenia", "Acme", "");
    }

    @Test
    void aFormulaLikeCompanyIsWrittenAsTextNeverAsAFormula() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");
        contacts.setCompanyAndCountry(id, "=HYPERLINK(\"http://x\")", null);

        Workbook book = export(s, id, "sl");

        assertThat(book.hasFormula()).isFalse();
        // CellText predpne apostrof, da vrednost ostane besedilo (010).
        assertThat(book.rows().get(1).get(6)).isEqualTo("'=HYPERLINK(\"http://x\")");
    }
}
