package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.contact.support.ExportApiTest;
import si.contactmanager.contact.support.XlsxReader.Workbook;

/**
 * Izvoz izbranih kontaktov v {@code .xlsx} (FR-010-02 … FR-010-09; SC-003): datoteka se vedno prebere nazaj z drugo
 * knjižnico in primerja se celotna tabela z dobesedno pričakovano.
 */
@Tag("FR-010-02")
@Tag("FR-010-03")
class ExportIT extends ExportApiTest {

    private static final List<String> HEADER_SL = List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "Značke");

    private HttpResponse<byte[]> exportOk(Scenario s, Object body) throws Exception {
        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), body);
        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        return response;
    }

    private UUID contact(Scenario s, String first, String last) {
        return contacts.insert(s.group(), s.id(Who.OWNER), first, last);
    }

    private static List<String> row(String... cells) {
        return List.of(cells);
    }

    private static List<List<String>> table(List<String> header, List<List<String>> rows) {
        List<List<String>> all = new ArrayList<>();
        all.add(header);
        all.addAll(rows);
        return all;
    }

    // --- izbor in oblika ------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-010-04")
    @Tag("FR-010-07")
    void exportsExactlyTheSelectedContactsWithTheFixedColumns() throws Exception {
        Scenario s = scenario();
        UUID ana = contacts.insert(
                s.group(), s.id(Who.OWNER), "Ana", "Kos", "ana@primer.si", "041 111 111", "Glavni trg 1");
        UUID bor = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Zupan", "bor@primer.si", null, null);
        UUID cene = contacts.insert(s.group(), s.id(Who.OWNER), "Cene", "Čeh", null, "02 222 222", null);
        contact(s, "Dana", "Novak");
        contact(s, "Eva", "Horvat");

        HttpResponse<byte[]> response = exportOk(s, exportBody(List.of(ana, bor, cene), "sl"));

        assertThat(response.headers().firstValue("Content-Type")).contains(XLSX);
        assertThat(response.headers().firstValue("X-Export-Count")).contains("3");
        assertThat(response.headers().firstValue("X-Export-Skipped")).contains("0");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        Workbook file = workbook(response);
        assertThat(file.sheetNames()).containsExactly("Kontakti");
        assertThat(file.rows())
                .isEqualTo(table(
                        HEADER_SL,
                        List.of(
                                row("Cene", "Čeh", "", "", "02 222 222", ""),
                                row("Ana", "Kos", "Glavni trg 1", "ana@primer.si", "041 111 111", ""),
                                row("Bor", "Zupan", "", "bor@primer.si", "", ""))));
    }

    @Test
    @Tag("FR-010-04")
    void englishHeadersAndSheetName() throws Exception {
        Scenario s = scenario();
        UUID ana = contact(s, "Ana", "Kos");

        Workbook file = workbook(exportOk(s, exportBody(List.of(ana), "en")));

        assertThat(file.sheetNames()).containsExactly("Contacts");
        assertThat(file.rows())
                .isEqualTo(table(
                        List.of("First name", "Last name", "Address", "Email", "Phone", "Tags"),
                        List.of(row("Ana", "Kos", "", "", "", ""))));
    }

    // --- dodatni atributi -----------------------------------------------------------------------------------------

    @Test
    @Tag("FR-010-05")
    void oneColumnPerCustomKeyOfTheExportedContactsOnly() throws Exception {
        Scenario s = scenario();
        UUID a = contact(s, "Ana", "Avsec");
        contacts.addAttribute(a, 0, "kompetenca", "web dev");
        contacts.addAttribute(a, 1, "Oddelek", "IT");
        UUID b = contact(s, "Bor", "Bizjak");
        contacts.addAttribute(b, 0, "podjetje", "FERI");
        UUID notSelected = contact(s, "Cene", "Cerar");
        contacts.addAttribute(notSelected, 0, "hobi", "tek");

        Workbook file = workbook(exportOk(s, exportBody(List.of(a, b), "sl")));

        assertThat(file.rows())
                .isEqualTo(table(
                        List.of(
                                "Ime",
                                "Priimek",
                                "Naslov",
                                "E-naslov",
                                "Telefon",
                                "kompetenca",
                                "Oddelek",
                                "podjetje",
                                "Značke"),
                        List.of(
                                row("Ana", "Avsec", "", "", "", "web dev", "IT", "", ""),
                                row("Bor", "Bizjak", "", "", "", "", "", "FERI", ""))));
    }

    @Test
    @Tag("FR-010-05")
    @Tag("FR-010-04")
    void keysAreOrderedByTheSloveneAlphabetInBothLanguages() throws Exception {
        Scenario s = scenario();
        UUID a = contact(s, "Ana", "Avsec");
        contacts.addAttribute(a, 0, "Šola", "FERI");
        contacts.addAttribute(a, 1, "datum", "1. 1.");
        contacts.addAttribute(a, 2, "čas", "10:00");
        contacts.addAttribute(a, 3, "cena", "5");

        Workbook sl = workbook(exportOk(s, exportBody(List.of(a), "sl")));
        Workbook en = workbook(exportOk(s, exportBody(List.of(a), "en")));

        assertThat(sl.rows().get(0))
                .containsExactly(
                        "Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "cena", "čas", "datum", "Šola", "Značke");
        assertThat(sl.rows().get(1)).containsExactly("Ana", "Avsec", "", "", "", "5", "10:00", "1. 1.", "FERI", "");
        assertThat(en.rows().get(0))
                .containsExactly(
                        "First name", "Last name", "Address", "Email", "Phone", "cena", "čas", "datum", "Šola", "Tags");
    }

    @Test
    @Tag("FR-010-05")
    void keysThatDifferOnlyInCaseShareOneColumnWithTheSpellingOfTheFirstRow() throws Exception {
        Scenario s = scenario();
        UUID first = contact(s, "Ana", "Avsec");
        contacts.addAttribute(first, 0, "Kompetenca", "web dev");
        UUID second = contact(s, "Zala", "Zorko");
        contacts.addAttribute(second, 0, "kompetenca", "java");

        Workbook file = workbook(exportOk(s, exportBody(List.of(second, first), "sl")));

        assertThat(file.rows())
                .isEqualTo(table(
                        List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "Kompetenca", "Značke"),
                        List.of(
                                row("Ana", "Avsec", "", "", "", "web dev", ""),
                                row("Zala", "Zorko", "", "", "", "java", ""))));
    }

    @Test
    @Tag("FR-010-05")
    @Tag("FR-010-06")
    void aCustomKeyNamedZnackeIsASeparateColumnAndTheTagsColumnIsLast() throws Exception {
        Scenario s = scenario();
        UUID a = contact(s, "Ana", "Avsec");
        contacts.addAttribute(a, 0, "Značke", "ročno");
        contacts.addTag(a, 0, "vip");

        Workbook file = workbook(exportOk(s, exportBody(List.of(a), "sl")));

        assertThat(file.rows())
                .isEqualTo(table(
                        List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "Značke", "Značke"),
                        List.of(row("Ana", "Avsec", "", "", "", "ročno", "vip"))));
    }

    // --- značke ---------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-010-06")
    void tagsAreJoinedInSloveneAlphabeticalOrderAndAContactWithoutTagsHasAnEmptyCell() throws Exception {
        Scenario s = scenario();
        UUID tagged = contact(s, "Ana", "Avsec");
        contacts.addTags(tagged, "konferenca2025", "Alumni", "ne_obveščaj");
        UUID plain = contact(s, "Bor", "Bizjak");

        Workbook file = workbook(exportOk(s, exportBody(List.of(tagged, plain), "sl")));

        assertThat(file.rows())
                .isEqualTo(table(
                        HEADER_SL,
                        List.of(
                                row("Ana", "Avsec", "", "", "", "Alumni, konferenca2025, ne_obveščaj"),
                                row("Bor", "Bizjak", "", "", "", ""))));
    }

    // --- vrstni red -----------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-010-07")
    void rowsFollowTheSortOfTheListByEmailDescending() throws Exception {
        Scenario s = scenario();
        List<UUID> all = new ArrayList<>();
        all.add(contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", "d@primer.si", null, null));
        all.add(contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Zupan", "a@primer.si", null, null));
        all.add(contacts.insert(s.group(), s.id(Who.OWNER), "Cene", "Čeh", "c@primer.si", null, null));
        all.add(contacts.insert(s.group(), s.id(Who.OWNER), "Dana", "Novak", "b@primer.si", null, null));
        HttpResponse<String> list = get(
                ContactSearchClient.listPath(s.group()) + ContactSearchClient.query("sort", "email", "dir", "desc"),
                s.token(Who.EDITOR));
        assertThat(list.statusCode()).isEqualTo(200);

        Workbook file = workbook(exportOk(s, exportBody(all, "email", "desc", "sl")));

        List<String> exported =
                file.rows().stream().skip(1).map(r -> r.get(0) + " " + r.get(1)).toList();
        assertThat(exported).isEqualTo(ContactSearchClient.names(list.body()));
        assertThat(file.rows().stream().skip(1).map(r -> r.get(3)).toList())
                .containsExactly("d@primer.si", "c@primer.si", "b@primer.si", "a@primer.si");
    }

    @Test
    @Tag("FR-010-07")
    void withoutSortRowsAreByLastNameThenFirstNameInTheSloveneAlphabet() throws Exception {
        Scenario s = scenario();
        List<UUID> all = List.of(
                contact(s, "A", "Žagar"), contact(s, "B", "Zupan"), contact(s, "C", "Čeh"), contact(s, "D", "Cene"));

        Workbook file = workbook(exportOk(s, exportBody(all, "sl")));

        assertThat(file.rows().stream().skip(1).map(r -> r.get(1)).toList())
                .containsExactly("Cene", "Čeh", "Zupan", "Žagar");
    }

    @Test
    @Tag("FR-010-07")
    void aSortKeyThatNoContactHasIsNotAnErrorRowsFallBackToLastNameThenFirstName() throws Exception {
        Scenario s = scenario();
        List<UUID> all = List.of(contact(s, "Bojan", "Novak"), contact(s, "Ana", "Novak"), contact(s, "Cene", "Kos"));

        Workbook plain = workbook(exportOk(s, exportBody(all, "sl")));
        Workbook unknown = workbook(exportOk(s, exportBody(all, "attr:neobstaja", "asc", "sl")));

        assertThat(unknown.rows().stream()
                        .skip(1)
                        .map(r -> r.get(0) + " " + r.get(1))
                        .toList())
                .containsExactly("Cene Kos", "Ana Novak", "Bojan Novak");
        assertThat(unknown.rows()).isEqualTo(plain.rows());
    }

    // --- besedilo -------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-010-08")
    void everyCellIsTextWithTheValueVerbatimAndNoFormulas() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "007", "Bond", null, "041 123 456", "Trg 1\nMaribor");

        Workbook file = workbook(exportOk(s, exportBody(List.of(a), "sl")));

        assertThat(file.rows())
                .isEqualTo(table(HEADER_SL, List.of(row("007", "Bond", "Trg 1\nMaribor", "", "041 123 456", ""))));
        assertThat(file.allText()).isTrue();
        assertThat(file.hasFormula()).isFalse();
    }

    @Test
    @Tag("FR-010-02")
    void aContactChangedAfterTheSelectionIsExportedInItsCurrentState() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", null, "041 111 111", null);
        jdbc.update("update contact set phone = '041 999 999', version = version + 1 where id = ?", a);

        Workbook file = workbook(exportOk(s, exportBody(List.of(a), "sl")));

        assertThat(file.rows()).isEqualTo(table(HEADER_SL, List.of(row("Ana", "Kos", "", "", "041 999 999", ""))));
    }

    // --- zaščita pred formulami (FR-010-09, SC-004) ----------------------------------------------------------------

    @Test
    @Tag("FR-010-09")
    @Tag("SC-004")
    void valuesThatLookLikeFormulasAreWrittenAsTextWithALeadingApostrophe() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(
                s.group(),
                s.id(Who.OWNER),
                "=HYPERLINK(\"http://x\",\"klik\")",
                "Test",
                null,
                "+386 41 123 456",
                "-Glavni trg 1");
        contacts.addAttribute(a, 0, "opomba", "@SUM(A1)");

        Workbook file = workbook(exportOk(s, exportBody(List.of(a), "sl")));

        assertThat(file.rows())
                .isEqualTo(table(
                        List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "opomba", "Značke"),
                        List.of(row(
                                "'=HYPERLINK(\"http://x\",\"klik\")",
                                "Test",
                                "'-Glavni trg 1",
                                "",
                                "'+386 41 123 456",
                                "'@SUM(A1)",
                                ""))));
        assertThat(file.allText()).isTrue();
        assertThat(file.hasFormula()).isFalse();
    }

    @Test
    @Tag("FR-010-09")
    @Tag("SC-004")
    void tabCarriageReturnAreProtectedAndALeadingSpaceBeforeEqualsStaysVerbatim() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), " =1", "Test", null, "\tx", "\rx");

        Workbook file = workbook(exportOk(s, exportBody(List.of(a), "sl")));

        assertThat(file.rows()).isEqualTo(table(HEADER_SL, List.of(row(" =1", "Test", "'\rx", "", "'\tx", ""))));
        assertThat(file.allText()).isTrue();
        assertThat(file.hasFormula()).isFalse();
    }

    @Test
    @Tag("FR-010-09")
    @Tag("SC-004")
    void aCustomKeyThatLooksLikeAFormulaIsProtectedInTheHeaderToo() throws Exception {
        Scenario s = scenario();
        UUID a = contact(s, "Ana", "Kos");
        contacts.addAttribute(a, 0, "=ključ", "x");

        Workbook file = workbook(exportOk(s, exportBody(List.of(a), "sl")));

        assertThat(file.rows().get(0))
                .containsExactly("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "'=ključ", "Značke");
        assertThat(file.rows().get(1)).containsExactly("Ana", "Kos", "", "", "", "x", "");
        assertThat(file.hasFormula()).isFalse();
    }
}
