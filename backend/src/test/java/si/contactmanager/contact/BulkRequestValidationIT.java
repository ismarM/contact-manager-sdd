package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
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
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Validacija zahtevkov množičnih endpointov prek HTTP (research R-05, contracts/openapi.yaml; FR-009-04, -06, -07, -08,
 * -13, -18): neveljaven zahtevek → {@code 400 VALIDATION_FAILED} s poljem in kodo, nič se ne spremeni, vnosa sledi ni.
 */
class BulkRequestValidationIT extends BulkApiTest {

    record Case(String name, Map<String, Object> fields, String field, String code) {
        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<Arguments> updateCases() {
        return Stream.of(
                        new Case(
                                "značka s presledkom",
                                Map.of("addTags", List.of("dve besedi")),
                                "addTags[0]",
                                "INVALID_VALUE"),
                        new Case(
                                "značka z 51 znaki",
                                Map.of("addTags", List.of("z".repeat(51))),
                                "addTags[0]",
                                "TOO_LONG"),
                        new Case("prazna značka", Map.of("addTags", List.of("")), "addTags[0]", "REQUIRED"),
                        new Case(
                                "ista značka v dodaj in odstrani",
                                Map.of("addTags", List.of("VIP"), "removeTags", List.of("vip")),
                                "removeTags[0]",
                                "DUPLICATE"),
                        new Case(
                                "več kot 30 značk",
                                Map.of(
                                        "addTags",
                                        IntStream.rangeClosed(1, 31)
                                                .mapToObj(i -> "t" + i)
                                                .toList()),
                                "addTags",
                                "TOO_MANY"),
                        new Case(
                                "rezerviran ključ E-naslov",
                                Map.of("attributes", List.of(attributeSet("custom", "E-naslov", "x"))),
                                "attributes[0].key",
                                "RESERVED_KEY"),
                        new Case(
                                "rezerviran ključ phone",
                                Map.of("attributes", List.of(attributeSet("custom", "phone", "x"))),
                                "attributes[0].key",
                                "RESERVED_KEY"),
                        new Case(
                                "ključ pri predefiniranem polju (e-naslov)",
                                Map.of("attributes", List.of(attributeSet("email", "podjetje", "a@b.si"))),
                                "attributes[0].key",
                                "INVALID_VALUE"),
                        new Case(
                                "več kot 10 atributov",
                                Map.of(
                                        "attributes",
                                        IntStream.rangeClosed(1, 11)
                                                .mapToObj(i -> attributeSet("custom", "k" + i, "v"))
                                                .toList()),
                                "attributes",
                                "TOO_MANY"))
                .map(Arguments::of);
    }

    @ParameterizedTest(name = "bulk-update: {0}")
    @MethodSource("updateCases")
    @Tag("FR-009-06")
    @Tag("FR-009-07")
    @Tag("FR-009-08")
    void invalidUpdateRequestsAreRejectedWithFieldAndCode(Case c) throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        Snapshot before = snapshot(s.group());
        Object[] fields = c.fields().entrySet().stream()
                .flatMap(e -> Stream.of(e.getKey(), e.getValue()))
                .toArray();

        HttpResponse<String> response = bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, fields));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VALIDATION_FAILED");
        assertThat(asObjects(body.get("errors"))).contains(Map.of("field", c.field(), "code", c.code()));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-04")
    @Tag("FR-009-13")
    void bulkDeleteRejectsMoreThanTenThousandIdentitiesAndDeletesNothing() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 10_001);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(all));

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VALIDATION_FAILED");
        assertThat(asObjects(body.get("errors"))).contains(Map.of("field", "contactIds", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-04")
    @Tag("FR-009-18")
    void selectionCheckRejectsMoreThanTenThousandIdentities() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 10_001);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = selectionCheck(s.token(Who.EDITOR), s.group(), request(all));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "contactIds", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-18")
    void selectionCheckRejectsMoreThanTwentyQueries() throws Exception {
        Scenario s = scenario();
        UUID one = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        Snapshot before = snapshot(s.group());
        List<Map<String, Object>> queries = IntStream.rangeClosed(1, 21)
                .mapToObj(i -> checkQuery(List.of("t" + i), List.of(), List.of()))
                .toList();

        HttpResponse<String> response =
                selectionCheck(s.token(Who.EDITOR), s.group(), request(List.of(one), "queries", queries));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "queries", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-18")
    void selectionCheckRejectsMoreThanTenThousandIdentitiesSummedOverQueries() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 10_001);
        Snapshot before = snapshot(s.group());
        List<Map<String, Object>> queries = List.of(
                checkQuery(List.of("a"), all.subList(0, 5_000), List.of()),
                checkQuery(List.of("b"), all.subList(5_000, 10_001), List.of()));

        HttpResponse<String> response =
                selectionCheck(s.token(Who.EDITOR), s.group(), request(all.subList(0, 10), "queries", queries));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "queries", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }
}
