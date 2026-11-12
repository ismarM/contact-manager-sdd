package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.MergeInputParser.Parsed;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčlenitev telesa {@code merge} in parametra {@code ids} (FR-011-13, FR-011-21; research R-06, R-07): dobesedni
 * primeri kod in polj napak; razčlenjevalnik nikoli ne vrže.
 */
class MergeInputParserTest {

    private static final String RESULT = "{\"firstName\":\"Janez\",\"lastName\":\"Novak\"}";

    private final MergeInputParser parser = new MergeInputParser();

    private static UUID id(int n) {
        return new UUID(0, n);
    }

    private static String row(int n) {
        return "{\"id\":\"" + id(n) + "\",\"version\":0}";
    }

    private static String rows(int count) {
        return IntStream.rangeClosed(1, count)
                .mapToObj(MergeInputParserTest::row)
                .collect(Collectors.joining(","));
    }

    private static String body(String contacts, String result) {
        return "{\"contacts\":[" + contacts + "],\"result\":" + result + "}";
    }

    private static String withRows(String contacts) {
        return body(contacts, RESULT);
    }

    private static boolean has(Parsed<?> parsed, String field, String code) {
        return parsed.errors().contains(new FieldError(field, code));
    }

    private Parsed<MergeInput> merge(String body) {
        return parser.parseMerge(body);
    }

    private Parsed<List<UUID>> ids(String... values) {
        return parser.parseIds(List.of(values));
    }

    // --- merge: zgradba ---------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-011-13")
    void aBodyThatIsNotAJsonObjectIsMalformed() {
        for (String text : new String[] {"", "ni json", "[1,2]", "\"niz\"", "42", "null", "{\"contacts\":"}) {
            Parsed<MergeInput> parsed = merge(text);
            assertThat(has(parsed, "body", "MALFORMED")).as(text).isTrue();
            assertThat(parsed.value()).as(text).isNull();
        }
        assertThat(has(parser.parseMerge(null), "body", "MALFORMED")).isTrue();
    }

    @Test
    @Tag("FR-011-13")
    void aValidBodyIsParsed() {
        Parsed<MergeInput> parsed = merge(withRows(rows(2)));

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.valid()).isTrue();
        assertThat(parsed.value().contacts())
                .containsExactly(new MergeInput.Target(id(1), 0), new MergeInput.Target(id(2), 0));
        assertThat(parsed.value().result().firstName()).isEqualTo("Janez");
        assertThat(parsed.value().result().lastName()).isEqualTo("Novak");
    }

    @Test
    @Tag("FR-011-13")
    @Tag("FR-011-21")
    void contactsMustHaveBetweenTwoAndTenElements() {
        assertThat(has(merge("{\"result\":" + RESULT + "}"), "contacts", "REQUIRED"))
                .isTrue();
        assertThat(has(merge(withRows("")), "contacts", "REQUIRED")).isTrue();
        assertThat(has(merge(withRows(rows(1))), "contacts", "REQUIRED")).isTrue();
        assertThat(merge(withRows(rows(2))).errors()).isEmpty();
        assertThat(merge(withRows(rows(10))).errors()).isEmpty();
        assertThat(has(merge(withRows(rows(11))), "contacts", "TOO_MANY")).isTrue();
    }

    @Test
    @Tag("FR-011-13")
    void aRepeatedIdIsRejectedOnTheSecondOccurrence() {
        Parsed<MergeInput> parsed = merge(withRows(row(1) + "," + row(1)));

        assertThat(has(parsed, "contacts[1].id", "DUPLICATE")).isTrue();
        assertThat(parsed.value()).isNull();
    }

    @Test
    @Tag("FR-011-13")
    void anIdThatIsNotAUuidIsInvalid() {
        Parsed<MergeInput> parsed = merge(withRows("{\"id\":\"ni-uuid\",\"version\":0}," + row(2)));

        assertThat(has(parsed, "contacts[0].id", "INVALID_VALUE")).isTrue();
    }

    @Test
    @Tag("FR-011-13")
    void theVersionIsRequiredAndMustBeANonNegativeInteger() {
        String first = "{\"id\":\"" + id(1) + "\"";
        assertThat(has(merge(withRows(first + "}," + row(2))), "contacts[0].version", "REQUIRED"))
                .isTrue();
        for (String bad : new String[] {"-1", "1.5", "\"3\"", "true"}) {
            Parsed<MergeInput> parsed = merge(withRows(first + ",\"version\":" + bad + "}," + row(2)));
            assertThat(has(parsed, "contacts[0].version", "INVALID_VALUE"))
                    .as(bad)
                    .isTrue();
        }
    }

    @Test
    @Tag("FR-011-13")
    void resultIsRequired() {
        assertThat(has(merge("{\"contacts\":[" + rows(2) + "]}"), "result", "REQUIRED"))
                .isTrue();
    }

    @Test
    @Tag("FR-011-13")
    void unknownFieldsAreRejectedAtTheTopLevelAndInsideResult() {
        assertThat(has(
                        merge("{\"contacts\":[" + rows(2) + "],\"result\":" + RESULT + ",\"foo\":1}"),
                        "foo",
                        "UNKNOWN_FIELD"))
                .isTrue();
        assertThat(has(
                        merge(body(rows(2), "{\"firstName\":\"Janez\",\"lastName\":\"Novak\",\"foo\":1}")),
                        "result.foo",
                        "UNKNOWN_FIELD"))
                .isTrue();
    }

    @Test
    @Tag("FR-011-13")
    void resultErrorsOfTheContactRulesGetTheResultPrefix() {
        Parsed<MergeInput> noName = merge(body(rows(2), "{}"));
        assertThat(has(noName, "result.firstName", "REQUIRED")).isTrue();
        assertThat(has(noName, "result.lastName", "REQUIRED")).isTrue();

        String tags =
                IntStream.rangeClosed(1, 31).mapToObj(i -> "\"z" + i + "\"").collect(Collectors.joining(","));
        Parsed<MergeInput> tooManyTags =
                merge(body(rows(2), "{\"firstName\":\"A\",\"lastName\":\"B\",\"tags\":[" + tags + "]}"));
        assertThat(has(tooManyTags, "result.tags", "TOO_MANY")).isTrue();

        Parsed<MergeInput> sameKey = merge(body(
                rows(2),
                "{\"firstName\":\"A\",\"lastName\":\"B\",\"attributes\":"
                        + "[{\"key\":\"Kompetenca\",\"value\":\"x\"},{\"key\":\"kompetenca\",\"value\":\"y\"}]}"));
        assertThat(has(sameKey, "result.attributes[1].key", "DUPLICATE")).isTrue();
        assertThat(sameKey.errors().stream().map(FieldError::field)).allMatch(field -> field.startsWith("result."));
    }

    // --- ids za compare ---------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-011-21")
    void commasAndARepeatedParameterGiveTheSameList() {
        String a = id(1).toString();
        String b = id(2).toString();
        String c = id(3).toString();

        Parsed<List<UUID>> commas = ids(a + "," + b + "," + c);
        Parsed<List<UUID>> repeated = ids(a, b, c);
        Parsed<List<UUID>> mixed = ids(a + "," + b, c);

        assertThat(commas.errors()).isEmpty();
        assertThat(commas.value()).containsExactly(id(1), id(2), id(3));
        assertThat(repeated.value()).isEqualTo(commas.value());
        assertThat(mixed.value()).isEqualTo(commas.value());
    }

    @Test
    @Tag("FR-011-21")
    void idsMustHaveBetweenTwoAndTenElements() {
        String eleven =
                IntStream.rangeClosed(1, 11).mapToObj(i -> id(i).toString()).collect(Collectors.joining(","));
        String ten =
                IntStream.rangeClosed(1, 10).mapToObj(i -> id(i).toString()).collect(Collectors.joining(","));

        assertThat(has(ids(eleven), "ids", "TOO_MANY")).isTrue();
        assertThat(ids(ten).errors()).isEmpty();
        assertThat(has(ids(id(1).toString()), "ids", "REQUIRED")).isTrue();
        assertThat(has(parser.parseIds(List.of()), "ids", "REQUIRED")).isTrue();
    }

    @Test
    @Tag("FR-011-21")
    void aRepeatedIdAndANonUuidAreRejected() {
        assertThat(has(ids(id(1) + "," + id(1)), "ids", "DUPLICATE")).isTrue();
        assertThat(has(ids(id(1) + ",ni-uuid"), "ids", "INVALID_VALUE")).isTrue();
    }
}
