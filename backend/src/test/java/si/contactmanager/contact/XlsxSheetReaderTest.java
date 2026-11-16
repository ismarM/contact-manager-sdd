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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

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
    void aHighCompressionRatioBelowTheSizeLimitIsRejected() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("xl/workbook.xml"));
            zip.write(new byte[10]);
            zip.putNextEntry(new ZipEntry("xl/worksheets/sheet1.xml"));
            byte[] zeros = new byte[1024 * 1024];
            for (int i = 0; i < 20; i++) {
                zip.write(zeros);
            }
        }

        assertThat(20L * 1024 * 1024).isLessThan(XlsxGuard.MAX_UNCOMPRESSED);
        assertThatThrownBy(() -> XlsxGuard.check(out.toByteArray()))
                .isInstanceOf(XlsxGuard.Rejected.class)
                .hasMessage("NOT_XLSX");
    }

    /** XXE in razširjanje entitet: DTD v kateremkoli delu preglednice zavrne datoteko, preden jo prebere fastexcel. */
    @ParameterizedTest
    @ValueSource(strings = {"xl/worksheets/sheet1.xml", "xl/sharedStrings.xml"})
    void aDoctypeInAnyPartIsRejected(String part) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Workbook workbook = new Workbook(out, "test", "1.0");
        Worksheet sheet = workbook.newWorksheet("List1");
        sheet.value(0, 0, "Ime");
        sheet.value(1, 0, "Ana");
        workbook.finish();
        byte[] file = withDoctype(out.toByteArray(), part);

        assertThatThrownBy(() -> XlsxSheetReader.read(file))
                .isInstanceOf(XlsxGuard.Rejected.class)
                .hasMessage("NOT_XLSX");
    }

    /** Kopija arhiva, v kateri del {@code part} dobi DTD z notranjo entiteto z znanim nizom. */
    static final String DOCTYPE = "<!DOCTYPE x [<!ENTITY x \"XXE-ZNAK\">]>";

    static byte[] withDoctype(byte[] xlsx, String part) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        boolean found = false;
        java.nio.file.Path temp = java.nio.file.Files.createTempFile("xlsx", ".zip");
        try {
            java.nio.file.Files.write(temp, xlsx);
            try (java.util.zip.ZipFile in = new java.util.zip.ZipFile(temp.toFile());
                    ZipOutputStream zip = new ZipOutputStream(out)) {
                for (ZipEntry entry : java.util.Collections.list(in.entries())) {
                    byte[] content;
                    try (java.io.InputStream stream = in.getInputStream(entry)) {
                        content = stream.readAllBytes();
                    }
                    if (entry.getName().equals(part)) {
                        found = true;
                        String xml = new String(content, java.nio.charset.StandardCharsets.UTF_8);
                        int start = xml.startsWith("<?xml") ? xml.indexOf("?>") + 2 : 0;
                        xml = xml.substring(0, start) + DOCTYPE + xml.substring(start);
                        content = xml.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    }
                    zip.putNextEntry(new ZipEntry(entry.getName()));
                    zip.write(content);
                }
            }
        } finally {
            java.nio.file.Files.deleteIfExists(temp);
        }
        if (!found) {
            throw new IOException("ni dela " + part);
        }
        return out.toByteArray();
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
