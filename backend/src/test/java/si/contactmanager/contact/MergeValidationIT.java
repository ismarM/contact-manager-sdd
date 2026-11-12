package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Validacija zahtevka za združitev (FR-011-13, FR-011-21; research R-07): neveljaven {@code result} in neveljaven
 * {@code contacts} dasta {@code 400 VALIDATION_FAILED} s poljem in kodo, nič se ne spremeni in vnosa sledi ni. Vrstni
 * red: zgradba zahtevka, nato verzija ({@code 409}), nato rezultat.
 */
@Tag("FR-011-13")
class MergeValidationIT extends DuplicateApiTest {

    record Case(String name, Map<String, Object> result, Map<String, String> expected) {
        @Override
        public String toString() {
            return name;
        }
    }

    private static Map<String, Object> valid() {
        return result("Janez", "Novak", null, null, null, null, null);
    }

    private static Map<String, Object> with(String field, Object value) {
        Map<String, Object> result = valid();
        result.put(field, value);
        return result;
    }

    private static List<String> tags(int count) {
        return IntStream.rangeClosed(1, count).mapToObj(i -> "t" + i).toList();
    }

    static Stream<Arguments> resultCases() {
        List<Map<String, String>> fiftyOne = IntStream.rangeClosed(1, 51)
                .mapToObj(i -> attribute("k" + i, "v"))
                .toList();
        return Stream.of(
                        new Case(
                                "brez imena in priimka",
                                result(null, null, null, null, null, null, null),
                                Map.of("result.firstName", "REQUIRED", "result.lastName", "REQUIRED")),
                        new Case("31 značk", with("tags", tags(31)), Map.of("result.tags", "TOO_MANY")),
                        new Case("51 atributov", with("attributes", fiftyOne), Map.of("result.attributes", "TOO_MANY")),
                        new Case(
                                "neveljaven e-naslov",
                                with("email", "ni-naslov"),
                                Map.of("result.email", "INVALID_VALUE")),
                        new Case("telefon s črkami", with("phone", "abc"), Map.of("result.phone", "INVALID_VALUE")),
                        new Case(
                                "vrednost atributa s 501 znaki",
                                with("attributes", List.of(attribute("Kompetenca", "x".repeat(501)))),
                                Map.of("result.attributes[0].value", "TOO_LONG")),
                        new Case(
                                "podvojena značka vip/VIP",
                                with("tags", List.of("vip", "VIP")),
                                Map.of("result.tags[1]", "DUPLICATE")),
                        new Case(
                                "rezerviran ključ atributa",
                                with("attributes", List.of(attribute("firstName", "x"))),
                                Map.of("result.attributes[0].key", "RESERVED_KEY")))
                .map(Arguments::of);
    }

    private void assertRejected(HttpResponse<String> response, Map<String, String> expected) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body())).containsAllEntriesOf(expected);
    }

    @ParameterizedTest(name = "result: {0}")
    @MethodSource("resultCases")
    void invalidResultIsRejectedWithFieldAndCodeAndNothingChanges(Case c) throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, "x@primer.si");
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(ids, c.result()));

        assertRejected(response, c.expected());
        assertUnchanged(before, snapshot(s.group()));
        assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
    }

    @Test
    @Tag("FR-011-21")
    void aSingleContactARepeatedIdentityAndElevenContactsAreRejected() throws Exception {
        Scenario s = scenario();
        List<UUID> eleven = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 11, "x@primer.si");
        UUID a = eleven.get(0);
        UUID b = eleven.get(1);
        String token = s.token(Who.EDITOR);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> single = merge(token, s.group(), mergeBody(List.of(contact(a, 0)), valid()));
        HttpResponse<String> repeated =
                merge(token, s.group(), mergeBody(List.of(contact(a, 0), contact(a, 0), contact(b, 0)), valid()));
        HttpResponse<String> tooMany = merge(token, s.group(), mergeBodyNow(eleven, valid()));

        assertRejected(single, Map.of("contacts", "REQUIRED"));
        assertRejected(repeated, Map.of("contacts[1].id", "DUPLICATE"));
        assertRejected(tooMany, Map.of("contacts", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
        assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
    }

    @Test
    @Tag("FR-011-16")
    void theStructureOfTheRequestIsCheckedBeforeTheVersion() throws Exception {
        Scenario s = scenario();
        List<UUID> eleven = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 11, "x@primer.si");
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UUID id : eleven) {
            rows.add(contact(id, 0));
        }
        contacts.editedByOther(eleven.get(0), s.id(Who.OWNER), "041 123 456");
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBody(rows, valid()));

        assertRejected(response, Map.of("contacts", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-011-16")
    void aStaleVersionIsReportedBeforeAnInvalidResult() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, "x@primer.si");
        Map<String, Object> body = mergeBodyNow(ids, result(null, null, null, null, null, null, null));
        contacts.editedByOther(ids.get(1), s.id(Who.OWNER), "041 123 456");
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), body);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "VERSION_CONFLICT");
        assertUnchanged(before, snapshot(s.group()));
        assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
    }
}
