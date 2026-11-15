package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ImportApiTest;
import si.contactmanager.support.Http;

/**
 * Izvoz vizitk (FR-014-10, -11, -12; SC-003, SC-007): izbor po pravilih 010 in en kontakt; matrika izolacije (401,
 * 404 nečlan in tuj kontakt, 200 vsi člani tudi v arhivirani skupini); izvoz → uvoz ohrani vse vrednosti.
 */
@Tag("FR-014-10")
@Tag("FR-014-11")
@Tag("FR-014-12")
class VcardExportIT extends ImportApiTest {

    private HttpResponse<byte[]> exportVcard(String token, UUID group, Object body) throws Exception {
        return send(exportPath(group) + "/vcard", token, body(body));
    }

    private HttpResponse<String> one(String token, UUID group, Object contact, String language) throws Exception {
        String query = language == null ? "" : "?language=" + language;
        return Http.send(
                "GET",
                url(contactPath(group, contact) + "/vcard" + query),
                token == null ? Map.of() : Http.bearer(token));
    }

    @Test
    void theSelectionIsExportedInListOrderAsVcard30() throws Exception {
        Scenario s = scenario();
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Zupan");
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", "ana@primer.si", "041 1", "Ulica 1\nKranj");
        contacts.setCompanyAndCountry(a, "Žaga, d.o.o.", "AT");
        contacts.addAttribute(a, 0, "Vloga", "mentor");
        contacts.addTags(a, "alumni", "konferenca2025");

        HttpResponse<byte[]> response =
                exportVcard(s.token(Who.VIEWER), s.group(), exportBody(List.of(b, a), "lastName", "asc", "sl"));

        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type"))
                .hasValueSatisfying(t -> assertThat(t).startsWith("text/vcard"));
        assertThat(response.headers().firstValue("X-Export-Count")).contains("2");
        String vcf = new String(response.body(), StandardCharsets.UTF_8);
        assertThat(vcf.indexOf("FN:Ana Kos")).isLessThan(vcf.indexOf("FN:Bor Zupan"));
        assertThat(vcf)
                .contains("VERSION:3.0", "EMAIL;TYPE=internet:ana@primer.si", "ORG:Žaga\\, d.o.o.")
                .contains("CATEGORIES:alumni,konferenca2025", "X-CM-CC=AT", "Avstrija", "UID:urn:uuid:" + a);
    }

    @Test
    @Tag("SC-003")
    void anExportedFileImportsBackIntoIdenticalContacts() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Čeh", "Šuštar", "c@primer.si", "+386 1", "A\nB; c, d");
        contacts.setCompanyAndCountry(a, "-Podjetje", "SI");
        for (int i = 0; i < 50; i++) {
            contacts.addAttribute(a, i, "Ključ " + i, i % 2 == 0 ? "=A" + i + ";\\x," : "+1 " + i);
        }
        String[] tags = new String[30];
        for (int i = 0; i < 30; i++) {
            tags[i] = "z" + i;
        }
        contacts.addTags(a, tags);
        UUID other = groups.createGroup(s.id(Who.OWNER), "Prazna");
        byte[] file = exportVcard(s.token(Who.OWNER), s.group(), exportBody(List.of(a), "sl"))
                .body();

        Map<String, Object> parsed =
                json(parse(s.token(Who.OWNER), other, file, "VCF", "sl").body());
        Map<String, Object> candidate = asObjects(parsed.get("candidates")).get(0);
        candidate.put("country", candidate.remove("countryText"));
        HttpResponse<String> created = commit(s.token(Who.OWNER), other, "VCF", List.of(candidate));

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        UUID copy = UUID.fromString((String)
                json(get(contactsPath(other), s.token(Who.OWNER)).body()).entrySet().stream()
                        .filter(e -> e.getKey().equals("items"))
                        .map(e -> asObjects(e.getValue()).get(0).get("id"))
                        .findFirst()
                        .orElseThrow());
        Map<String, Object> original =
                json(get(contactPath(s.group(), a), s.token(Who.OWNER)).body());
        Map<String, Object> imported =
                json(get(contactPath(other, copy), s.token(Who.OWNER)).body());
        for (String field : List.of(
                "firstName", "lastName", "address", "email", "phone", "company", "country", "attributes", "tags")) {
            assertThat(imported.get(field)).as(field).isEqualTo(original.get(field));
        }
    }

    @Test
    void oneContactIsExportedAndAForeignOrMissingContactIsNotFound() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");
        contacts.setCompanyAndCountry(a, null, "AT");
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        HttpResponse<String> en = one(s.token(Who.VIEWER), s.group(), a, "en");

        assertThat(en.statusCode()).isEqualTo(200);
        assertThat(en.body()).contains("FN:Ana Kos", "Austria");
        assertThat(one(s.token(Who.VIEWER), s.group(), foreign, null).statusCode())
                .isEqualTo(404);
        assertThat(one(s.token(Who.VIEWER), s.group(), UUID.randomUUID(), null).statusCode())
                .isEqualTo(404);
        assertThat(one(s.token(Who.VIEWER), s.group(), "ni-uuid", null).statusCode())
                .isEqualTo(404);
    }

    static Stream<Who> everyone() {
        return Stream.of(Who.values());
    }

    @ParameterizedTest(name = "{0}, arhivirana")
    @EnumSource(Who.class)
    @Tag("SC-007")
    void isolationMatrixInAnArchivedGroup(Who who) throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");
        groups.archive(s.group());
        Snapshot before = snapshot(s.group());

        HttpResponse<byte[]> selection = exportVcard(s.token(who), s.group(), exportBody(List.of(a), "sl"));
        HttpResponse<String> single = one(s.token(who), s.group(), a, "sl");

        int expected = who == Who.NON_MEMBER ? 404 : 200;
        assertThat(selection.statusCode()).isEqualTo(expected);
        assertThat(single.statusCode()).isEqualTo(expected);
        assertUnchanged(before, snapshot(s.group()));
    }

    @ParameterizedTest
    @MethodSource("everyone")
    void anUnauthenticatedCallerGetsUnauthorized(Who who) throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");

        assertThat(exportVcard(null, s.group(), exportBody(List.of(a), "sl")).statusCode())
                .isEqualTo(401);
        assertThat(one(null, s.group(), a, null).statusCode()).isEqualTo(401);
        assertThat(one("not-a-jwt", s.group(), a, null).statusCode())
                .as(who.name())
                .isEqualTo(401);
    }

    @Test
    void anEmptySelectionAndAForeignIdentityFollowTheExcelRules() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        UUID deleted = contacts.insert(s.group(), s.id(Who.OWNER), "Izbrisan", "Kontakt");
        contacts.deleteAsAudited(s.group(), s.id(Who.OWNER), deleted);

        assertThat(exportVcard(s.token(Who.VIEWER), s.group(), exportBody(List.of(foreign), "sl"))
                        .statusCode())
                .isEqualTo(404);
        HttpResponse<byte[]> empty = exportVcard(s.token(Who.VIEWER), s.group(), exportBody(List.of(deleted), "sl"));
        assertThat(empty.statusCode()).isEqualTo(409);
        assertThat(text(empty)).contains("EXPORT_EMPTY");
    }
}
