package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Branje Excela za uvoz (FR-014-02, -06, -08; research R-01): zaščita pred zip-bombo, glava, prazne vrstice, števila,
 * datumi, formule kot shranjena vrednost, odstranitev zaščitnega {@code '} in predlagana preslikava glav.
 */
@Tag("FR-014-02")
@Tag("FR-014-06")
@Tag("FR-014-08")
class XlsxSheetReaderTest {

    @Test
    void valuesAreReadAsStoredTextWithoutRecomputation() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Workbook workbook = new Workbook(out, "test", "1.0");
        Worksheet sheet = workbook.newWorksheet("List1");
        sheet.value(0, 0, "Ime");
        sheet.value(0, 1, "Telefon");
        sheet.value(0, 2, "Datum");
        sheet.value(0, 3, "Formula");
        sheet.value(1, 0, "'=HYPERLINK(\"x\")");
        sheet.value(1, 1, 41123456);
        sheet.value(1, 2, LocalDate.of(1990, 5, 17));
        sheet.style(1, 2).format("yyyy-mm-dd").set();
        sheet.formula(1, 3, "1+1");
        sheet.value(2, 0, "'zdravo");
        sheet.value(2, 1, 1.5);
        workbook.finish();

        XlsxSheetReader.Sheet1 read = XlsxSheetReader.read(out.toByteArray());

        assertThat(read.headers()).containsExactly("Ime", "Telefon", "Datum", "Formula");
        assertThat(read.rows().get(0).cells()).containsExactly("=HYPERLINK(\"x\")", "41123456", "1990-05-17", "");
        assertThat(read.rows().get(1).cells()).containsExactly("'zdravo", "1.5", "", "");
    }

    @Test
    void unprotectRemovesOnlyTheExportApostrophe() {
        assertThat(XlsxSheetReader.unprotect("'=A1")).isEqualTo("=A1");
        assertThat(XlsxSheetReader.unprotect("'+386")).isEqualTo("+386");
        assertThat(XlsxSheetReader.unprotect("'-x")).isEqualTo("-x");
        assertThat(XlsxSheetReader.unprotect("'@x")).isEqualTo("@x");
        assertThat(XlsxSheetReader.unprotect("'\tx")).isEqualTo("\tx");
        assertThat(XlsxSheetReader.unprotect("'abc")).isEqualTo("'abc");
        assertThat(XlsxSheetReader.unprotect("''=x")).isEqualTo("''=x");
    }

    @Test
    void aZipBombIsRejectedBeforeReading() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("xl/workbook.xml"));
            zip.write(new byte[10]);
            zip.putNextEntry(new ZipEntry("xl/worksheets/sheet1.xml"));
            byte[] zeros = new byte[1024 * 1024];
            for (int i = 0; i < 110; i++) {
                zip.write(zeros);
            }
        }

        assertThatThrownBy(() -> XlsxGuard.check(out.toByteArray()))
                .isInstanceOf(XlsxGuard.Rejected.class)
                .hasMessage("NOT_XLSX");
    }

    @Test
    void tooManyEntriesOrAMissingWorkbookAreRejected() throws IOException {
        ByteArrayOutputStream many = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(many)) {
            for (int i = 0; i <= XlsxGuard.MAX_ENTRIES; i++) {
                zip.putNextEntry(new ZipEntry("e" + i));
            }
        }
        ByteArrayOutputStream plain = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(plain)) {
            zip.putNextEntry(new ZipEntry("readme.txt"));
            zip.write("x".getBytes());
        }

        assertThatThrownBy(() -> XlsxGuard.check(many.toByteArray())).isInstanceOf(XlsxGuard.Rejected.class);
        assertThatThrownBy(() -> XlsxGuard.check(plain.toByteArray())).isInstanceOf(XlsxGuard.Rejected.class);
        assertThatThrownBy(() -> XlsxGuard.check("Ime;Priimek".getBytes())).isInstanceOf(XlsxGuard.Rejected.class);
    }

    @Test
    void headersOfTheExportAndReservedNamesMapToFields() {
        assertThat(HeaderMapping.suggest(List.of("ime", "Last name", "E-mail", "Država", "Država", "Kompetenca")))
                .extracting(HeaderMapping.Suggestion::target)
                .containsExactly(
                        HeaderMapping.Target.FIRST_NAME,
                        HeaderMapping.Target.LAST_NAME,
                        HeaderMapping.Target.EMAIL,
                        HeaderMapping.Target.COUNTRY,
                        HeaderMapping.Target.SKIP,
                        HeaderMapping.Target.ATTRIBUTE);
        assertThat(HeaderMapping.suggest(List.of("Kompetenca")).get(0).key()).isEqualTo("Kompetenca");
        assertThatCode(() -> HeaderMapping.suggest(List.of())).doesNotThrowAnyException();
    }
}
