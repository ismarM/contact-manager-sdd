package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ImportApiTest;

/**
 * Uvoz kontaktov (FR-014-02 … -09, -13; SC-002, SC-003, SC-008): razčlenitev Excela in vizitk, predogled (napake,
 * države, dvojniki, kanonični zapis), atomarna potrditev z enim vnosom sledi {@code IMPORT}, ki ga rollback povrne.
 */
@Tag("FR-014-02")
@Tag("FR-014-03")
@Tag("FR-014-05")
@Tag("FR-014-09")
class ImportIT extends ImportApiTest {

    @Test
    void anExportedSheetIsParsedWithMappedHeadersAndUnprotectedValues() throws Exception {
        Scenario s = scenario();
        byte[] file = xlsx(List.of(
                List.of("Ime", "Priimek", "E-naslov", "Država", "Značke", "Vloga", "", "Opombe"),
                List.of("Ana", "Kos", "ana@primer.si", "Avstrija", "a, b", "'=HYPERLINK(\"x\")", "skrito", "'zdravo"),
                List.of("", "", "", "", "", "", "", ""),
                List.of("Bor", "Zupan", "", "", "", "+1", "", "")));

        HttpResponse<String> response = parse(s.token(Who.EDITOR), s.group(), file, "XLSX", "sl");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(body.get("sheetCount")).isEqualTo(1);
        assertThat(asStrings(body.get("headers")))
                .containsExactly("Ime", "Priimek", "E-naslov", "Država", "Značke", "Vloga", "Opombe");
        assertThat(asObjects(body.get("suggestedMapping")).stream().map(m -> m.get("target")))
                .containsExactly("FIRST_NAME", "LAST_NAME", "EMAIL", "COUNTRY", "TAGS", "ATTRIBUTE", "ATTRIBUTE");
        List<Map<String, Object>> rows = asObjects(body.get("rows"));
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).get("rowNumber")).isEqualTo(2);
        assertThat(asStrings(rows.get(0).get("cells")))
                .containsExactly("Ana", "Kos", "ana@primer.si", "Avstrija", "a, b", "=HYPERLINK(\"x\")", "'zdravo");
        assertThat(rows.get(1).get("rowNumber")).isEqualTo(4);
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    void englishHeadersMapAndFurtherSheetsAreCounted() throws Exception {
        Scenario s = scenario();
        byte[] file = xlsx(
                List.of(
                        List.of("first name", "LAST NAME", "Company", "Tags", "Email"),
                        List.of("A", "B", "C", "d", "e")),
                3);

        Map<String, Object> body =
                json(parse(s.token(Who.EDITOR), s.group(), file, "XLSX", null).body());

        assertThat(body.get("sheetCount")).isEqualTo(3);
        assertThat(asObjects(body.get("suggestedMapping")).stream().map(m -> m.get("target")))
                .containsExactly("FIRST_NAME", "LAST_NAME", "COMPANY", "TAGS", "EMAIL");
    }

    @Test
    void badFilesAreRejectedWithAReasonAndNothingChanges() throws Exception {
        Scenario s = scenario();
        List<List<String>> tooMany = new ArrayList<>();
        tooMany.add(List.of("Ime"));
        for (int i = 0; i <= XlsxSheetReader.MAX_ROWS; i++) {
            tooMany.add(List.of("Ime" + i));
        }

        assertFileError(parse(s.token(Who.EDITOR), s.group(), "Ime;Priimek".getBytes(), "XLSX", "sl"), "NOT_XLSX");
        assertFileError(parse(s.token(Who.EDITOR), s.group(), xlsx(tooMany), "XLSX", "sl"), "TOO_MANY_ROWS");
        assertFileError(
                parse(s.token(Who.EDITOR), s.group(), xlsx(List.of(List.of(), List.of("a"))), "XLSX", "sl"),
                "NO_HEADER");
        assertFileError(
                parse(s.token(Who.EDITOR), s.group(), new byte[10 * 1024 * 1024 + 10], "XLSX", "sl"), "FILE_TOO_LARGE");
        assertFileError(parse(s.token(Who.EDITOR), s.group(), "kontakt".getBytes(), "VCF", "sl"), "NOT_VCF");
        assertThat(fieldErrors(parse(s.token(Who.EDITOR), s.group(), "x".getBytes(), null, "sl")
                        .body()))
                .containsEntry("format", "REQUIRED");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    void aZipBombOrADoctypeIsRejectedOverHttpWithoutChanges() throws Exception {
        Scenario s = scenario();
        java.io.ByteArrayOutputStream bomb = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(bomb)) {
            zip.putNextEntry(new java.util.zip.ZipEntry("xl/workbook.xml"));
            zip.write(new byte[10]);
            zip.putNextEntry(new java.util.zip.ZipEntry("xl/worksheets/sheet1.xml"));
            byte[] zeros = new byte[1024 * 1024];
            for (int i = 0; i < 110; i++) {
                zip.write(zeros);
            }
        }
        byte[] doctype = XlsxSheetReaderTest.withDoctype(
                xlsx(List.of(List.of("Ime"), List.of("Ana"))), "xl/worksheets/sheet1.xml");

        assertFileError(parse(s.token(Who.EDITOR), s.group(), bomb.toByteArray(), "XLSX", "sl"), "NOT_XLSX");
        HttpResponse<String> xxe = parse(s.token(Who.EDITOR), s.group(), doctype, "XLSX", "sl");
        assertFileError(xxe, "NOT_XLSX");
        assertThat(xxe.body()).doesNotContain("XXE-ZNAK");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    void aVcardFileIsParsedIntoCandidatesInTheInterfaceLanguage() throws Exception {
        Scenario s = scenario();
        byte[] file = VcardMappingTest.resource("cases/phone-30.vcf").getBytes(StandardCharsets.UTF_8);

        HttpResponse<String> response = parse(s.token(Who.EDITOR), s.group(), file, "VCF", "sl");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(asStrings(body.get("omitted"))).containsExactly("PHOTO");
        List<Map<String, Object>> candidates = asObjects(body.get("candidates"));
        assertThat(candidates).hasSize(2);
        assertThat(asObjects(candidates.get(0).get("attributes")).get(0))
                .isEqualTo(Map.of("key", "E-naslov 2", "type", "EMAIL", "value", "janez@delo.si"));
    }

    @Test
    void thePreviewReportsErrorsCountriesDuplicatesAndCanonicalKeysWithoutChanges() throws Exception {
        Scenario s = scenario();
        UUID ana = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", "ana@primer.si", null, null);
        contacts.addAttribute(ana, 0, "Kompetenca", "java");
        int entries = audit.count(s.group());
        List<Map<String, Object>> candidates = new ArrayList<>();
        Map<String, Object> valid = person("Bor", "Zupan");
        valid.put("countryText", "Slovenija");
        valid.put("attributes", List.of(Map.of("key", "kompetenca", "value", "c")));
        candidates.add(valid);
        Map<String, Object> badEmail = person("Cene", "Novak");
        badEmail.put("email", "ni-email");
        candidates.add(badEmail);
        candidates.add(Map.of("countryText", "Kongo"));
        Map<String, Object> sameEmail = person("Druga", "Ana");
        sameEmail.put("email", "ANA@primer.si");
        sameEmail.put("countryText", "Atlantida");
        candidates.add(sameEmail);
        candidates.add(person("Bor", "Zupan"));
        Map<String, Object> reserved = person("Eva", "Erjavec");
        reserved.put("attributes", List.of(Map.of("key", "Podjetje", "value", "x")));
        candidates.add(reserved);

        HttpResponse<String> response = preview(s.token(Who.EDITOR), s.group(), candidates);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<Map<String, Object>> rows = asObjects(json(response.body()).get("rows"));
        assertThat(rows).hasSize(6);
        assertThat(asObjects(rows.get(0).get("errors"))).isEmpty();
        assertThat(asObject(rows.get(0).get("country")))
                .containsEntry("status", "FOUND")
                .containsEntry("code", "SI");
        assertThat(asStrings(asObject(rows.get(0).get("normalized")).get("attributeKeys")))
                .containsExactly("Kompetenca");
        assertThat(rows.get(0).get("duplicate")).isNull();
        assertThat(asObjects(rows.get(1).get("errors")))
                .containsExactly(Map.of("field", "email", "code", "INVALID_VALUE"));
        assertThat(asObjects(rows.get(2).get("errors")).stream().map(e -> e.get("field")))
                .contains("firstName", "lastName");
        assertThat(asObject(rows.get(2).get("country"))).containsEntry("status", "AMBIGUOUS");
        assertThat(asStrings(asObject(rows.get(2).get("country")).get("candidates")))
                .contains("CD", "CG");
        assertThat(asObject(rows.get(3).get("duplicate")))
                .containsEntry("reason", "EMAIL")
                .containsEntry("contactName", "Ana Kos");
        assertThat(asObject(rows.get(3).get("country"))).containsEntry("status", "UNKNOWN");
        assertThat(asObject(rows.get(4).get("duplicate")))
                .containsEntry("reason", "NAME")
                .containsEntry("inFileIndex", 0);
        assertThat(asObjects(rows.get(5).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].key", "code", "RESERVED_KEY"));
        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }

    @Test
    @Tag("SC-008")
    void aConfirmedImportCreatesAllContactsWithOneImportEntryThatRollbackReverts() throws Exception {
        Scenario s = scenario();
        createViaApi(s, input("Prej", "Obstoječ"));
        UUID before = audit.latestEntryId(s.group());
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < 118; i++) {
            Map<String, Object> contact = person("Ime" + i, "Priimek" + i);
            contact.put("country", "AT");
            contact.put("company", "Žaga");
            contact.put("attributes", List.of(Map.of("key", "Formula", "value", "=SUM(1)")));
            contact.put("tags", List.of("uvoz"));
            list.add(contact);
        }

        HttpResponse<String> response = commit(s.token(Who.EDITOR), s.group(), "XLSX", list);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(json(response.body()).get("created")).isEqualTo(118);
        assertThat(contacts.count(s.group())).isEqualTo(119);
        List<Map<String, Object>> entries = audit.entries(s.group());
        Map<String, Object> last = entries.get(entries.size() - 1);
        assertThat(last.get("action")).isEqualTo("IMPORT");
        assertThat(((Number) last.get("contact_count")).intValue()).isEqualTo(118);
        assertThat(last.get("id").toString()).isEqualTo(json(response.body()).get("auditEntryId"));

        rollbackTo(s, before);

        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    void anInvalidRowRejectsTheWholeImportAndTheServerNeverTrustsThePreview() throws Exception {
        Scenario s = scenario();
        Map<String, Object> countryText = person("A", "B");
        countryText.put("countryText", "Avstrija");
        Map<String, Object> badCountry = person("C", "D");
        badCountry.put("country", "XX");
        Map<String, Object> reserved = person("E", "F");
        reserved.put("attributes", List.of(Map.of("key", "country", "value", "x")));
        Map<String, Object> tooLong = person("x".repeat(101), "G");

        HttpResponse<String> response = commit(
                s.token(Who.EDITOR),
                s.group(),
                "XLSX",
                List.of(person("Ok", "Kontakt"), countryText, badCountry, reserved, tooLong));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body()))
                .containsEntry("contacts[1].countryText", "UNKNOWN_FIELD")
                .containsEntry("contacts[2].country", "INVALID_VALUE")
                .containsEntry("contacts[3].attributes[0].key", "RESERVED_KEY")
                .containsEntry("contacts[4].firstName", "TOO_LONG");
        assertThat(contacts.count(s.group())).isZero();
        assertThat(audit.count(s.group())).isZero();
    }

    @Test
    void requestLimitsAreValidated() throws Exception {
        Scenario s = scenario();
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i <= ImportInputParser.MAX_CONTACTS; i++) {
            many.add(person("A", "B" + i));
        }

        assertThat(fieldErrors(commit(s.token(Who.EDITOR), s.group(), "XLSX", List.of())
                        .body()))
                .containsEntry("contacts", "REQUIRED");
        assertThat(fieldErrors(commit(s.token(Who.EDITOR), s.group(), "CSV", List.of(person("A", "B")))
                        .body()))
                .containsEntry("source", "INVALID_VALUE");
        assertThat(fieldErrors(
                        commit(s.token(Who.EDITOR), s.group(), "XLSX", many).body()))
                .containsEntry("contacts", "TOO_MANY");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("SC-002")
    void tenThousandContactsAreImportedInTime() throws Exception {
        Scenario s = scenario();
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < 10_000; i++) {
            Map<String, Object> contact = person("Ime" + i, "Priimek" + i);
            contact.put("email", "k" + i + "@primer.si");
            contact.put("attributes", List.of(Map.of("key", "Vloga", "value", "v" + i)));
            contact.put("tags", List.of("t" + (i % 10)));
            list.add(contact);
        }
        List<Map<String, Object>> candidates = new ArrayList<>(list);

        long previewStart = System.nanoTime();
        HttpResponse<String> preview = preview(s.token(Who.EDITOR), s.group(), candidates);
        long previewMs = (System.nanoTime() - previewStart) / 1_000_000;
        long start = System.nanoTime();
        HttpResponse<String> response = commit(s.token(Who.EDITOR), s.group(), "XLSX", list);
        long ms = (System.nanoTime() - start) / 1_000_000;

        assertThat(preview.statusCode()).isEqualTo(200);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(contacts.count(s.group())).isEqualTo(10_000);
        assertThat(previewMs).as("predogled 10 000 (ms)").isLessThan(10_000);
        assertThat(ms).as("potrditev 10 000 (ms)").isLessThan(30_000);
    }

    private static void assertFileError(HttpResponse<String> response, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("file", code);
    }
}
