package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.BulkEditInput.Field;
import si.contactmanager.contact.BulkInputParser.Parsed;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčlenitev teles množičnih endpointov (FR-009-04, FR-009-06 … FR-009-09; research R-05, data-model.md): dobesedni
 * primeri kod in polj napak; razčlenjevalnik nikoli ne vrže.
 */
class BulkInputParserTest {

    private static final String ONE = "\"0193a5b0-7c1e-7d4a-9a51-1f2e3d4c5b6a\"";

    private final BulkInputParser parser = new BulkInputParser();

    private static String ids(int count) {
        return IntStream.range(0, count)
                .mapToObj(i -> "\"" + new UUID(0, i + 1) + "\"")
                .collect(Collectors.joining(",", "[", "]"));
    }

    private static String update(String fields) {
        return "{\"contactIds\":[" + ONE + "]" + (fields.isEmpty() ? "" : "," + fields) + "}";
    }

    private static boolean has(Parsed<?> parsed, String field, String code) {
        return parsed.errors().contains(new FieldError(field, code));
    }

    private static boolean hasCode(Parsed<?> parsed, String code, String fieldPrefix) {
        return parsed.errors().stream()
                .anyMatch(e -> e.code().equals(code) && e.field().startsWith(fieldPrefix));
    }

    private Parsed<BulkEditInput> up(String body) {
        return parser.parseUpdate(body);
    }

    // --- contactIds -----------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-009-04")
    void contactIdsAreRequiredAndNotEmpty() {
        assertThat(has(up("{\"addTags\":[\"a\"]}"), "contactIds", "REQUIRED")).isTrue();
        assertThat(has(up("{\"contactIds\":[],\"addTags\":[\"a\"]}"), "contactIds", "REQUIRED"))
                .isTrue();
        assertThat(has(parser.parseDelete("{}"), "contactIds", "REQUIRED")).isTrue();
        assertThat(has(parser.parseDelete("{\"contactIds\":[]}"), "contactIds", "REQUIRED"))
                .isTrue();
    }

    @Test
    @Tag("FR-009-04")
    void tenThousandIdentitiesAreValidAndTenThousandAndOneAreTooMany() {
        Parsed<BulkTarget> ok = parser.parseDelete("{\"contactIds\":" + ids(10_000) + "}");
        Parsed<BulkTarget> tooMany = parser.parseDelete("{\"contactIds\":" + ids(10_001) + "}");

        assertThat(ok.valid()).as(ok.errors().toString()).isTrue();
        assertThat(ok.value().contactIds()).hasSize(10_000);
        assertThat(has(tooMany, "contactIds", "TOO_MANY")).isTrue();
        assertThat(tooMany.value()).isNull();
    }

    @Test
    @Tag("FR-009-04")
    void duplicateIdentitiesAreMergedBeforeTheLimitIsApplied() {
        String withDuplicate = ids(10_000).replaceFirst("\\]$", "," + "\"" + new UUID(0, 1) + "\"]");

        Parsed<BulkTarget> parsed = parser.parseDelete("{\"contactIds\":" + withDuplicate + "}");

        assertThat(parsed.valid()).as(parsed.errors().toString()).isTrue();
        assertThat(parsed.value().contactIds()).hasSize(10_000).doesNotHaveDuplicates();
    }

    @Test
    @Tag("FR-009-04")
    void anIdentityThatIsNotAUuidIsAnIndexedError() {
        Parsed<BulkTarget> parsed = parser.parseDelete("{\"contactIds\":[" + ONE + ",\"ni-uuid\"]}");

        assertThat(has(parsed, "contactIds[1]", "INVALID_VALUE")).isTrue();
        assertThat(parsed.value()).isNull();
    }

    // --- značke ---------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-009-08")
    void moreThanThirtyTagsInEitherListIsTooMany() {
        String thirtyOne =
                IntStream.rangeClosed(1, 31).mapToObj(i -> "\"t" + i + "\"").collect(Collectors.joining(",", "[", "]"));
        String thirty =
                IntStream.rangeClosed(1, 30).mapToObj(i -> "\"t" + i + "\"").collect(Collectors.joining(",", "[", "]"));

        assertThat(has(up(update("\"addTags\":" + thirtyOne)), "addTags", "TOO_MANY"))
                .isTrue();
        assertThat(has(up(update("\"removeTags\":" + thirtyOne)), "removeTags", "TOO_MANY"))
                .isTrue();
        assertThat(up(update("\"addTags\":" + thirty)).valid()).isTrue();
        assertThat(up(update("\"removeTags\":" + thirty)).valid()).isTrue();
    }

    @Test
    @Tag("FR-009-08")
    void aTagWithASpaceIsInvalidAnEmptyOneIsRequiredAndFiftyOneCharactersIsTooLong() {
        assertThat(has(up(update("\"addTags\":[\"dve besedi\"]")), "addTags[0]", "INVALID_VALUE"))
                .isTrue();
        assertThat(has(up(update("\"addTags\":[\"\"]")), "addTags[0]", "REQUIRED"))
                .isTrue();
        assertThat(has(up(update("\"addTags\":[\"a\",\"" + "x".repeat(51) + "\"]")), "addTags[1]", "TOO_LONG"))
                .isTrue();
        assertThat(has(up(update("\"removeTags\":[\"" + "x".repeat(51) + "\"]")), "removeTags[0]", "TOO_LONG"))
                .isTrue();
        assertThat(up(update("\"addTags\":[\"" + "x".repeat(50) + "\"]")).valid())
                .isTrue();
    }

    @Test
    @Tag("FR-009-08")
    void theSameTagInBothListsIgnoringCaseIsADuplicateOnRemoveTags() {
        Parsed<BulkEditInput> parsed = up(update("\"addTags\":[\"VIP\"],\"removeTags\":[\"vip\"]"));

        assertThat(has(parsed, "removeTags[0]", "DUPLICATE")).isTrue();
        assertThat(parsed.value()).isNull();
    }

    // --- atributi -------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-009-07")
    void moreThanTenAttributesIsTooManyAndTenIsValid() {
        String eleven = IntStream.rangeClosed(1, 11)
                .mapToObj(i -> "{\"field\":\"custom\",\"key\":\"k" + i + "\",\"value\":\"v\"}")
                .collect(Collectors.joining(",", "[", "]"));
        String ten = IntStream.rangeClosed(1, 10)
                .mapToObj(i -> "{\"field\":\"custom\",\"key\":\"k" + i + "\",\"value\":\"v\"}")
                .collect(Collectors.joining(",", "[", "]"));

        assertThat(has(up(update("\"attributes\":" + eleven)), "attributes", "TOO_MANY"))
                .isTrue();
        assertThat(up(update("\"attributes\":" + ten)).valid()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"firstName", "lastName", "foo", ""})
    @Tag("FR-009-07")
    void firstNameLastNameAndUnknownFieldsAreRejected(String field) {
        Parsed<BulkEditInput> parsed = up(update("\"attributes\":[{\"field\":\"" + field + "\",\"value\":\"x\"}]"));

        assertThat(has(parsed, "attributes[0].field", "INVALID_VALUE")).isTrue();
    }

    @Test
    @Tag("FR-009-07")
    void aCustomAttributeNeedsAKeyOfAtMostFiftyCharactersThatIsNotAPredefinedFieldName() {
        assertThat(has(
                        up(update("\"attributes\":[{\"field\":\"custom\",\"value\":\"x\"}]")),
                        "attributes[0].key",
                        "REQUIRED"))
                .isTrue();
        assertThat(has(
                        up(update("\"attributes\":[{\"field\":\"custom\",\"key\":\"" + "k".repeat(51)
                                + "\",\"value\":\"x\"}]")),
                        "attributes[0].key",
                        "TOO_LONG"))
                .isTrue();
        for (String reserved : List.of("E-naslov", "email", "Telefon", "Priimek", "first name")) {
            assertThat(has(
                            up(update("\"attributes\":[{\"field\":\"custom\",\"key\":\"" + reserved
                                    + "\",\"value\":\"x\"}]")),
                            "attributes[0].key",
                            "RESERVED_KEY"))
                    .as(reserved)
                    .isTrue();
        }
    }

    @Test
    @Tag("FR-009-07")
    void aKeyWithAPredefinedFieldIsRejected() {
        for (String field : List.of("address", "email", "phone")) {
            assertThat(has(
                            up(update("\"attributes\":[{\"field\":\"" + field
                                    + "\",\"key\":\"podjetje\",\"value\":\"x\"}]")),
                            "attributes[0].key",
                            "INVALID_VALUE"))
                    .as(field)
                    .isTrue();
        }
    }

    @Test
    @Tag("FR-009-07")
    void theSameCustomKeyIgnoringCaseOrTheSameFieldTwiceIsADuplicate() {
        Parsed<BulkEditInput> keys =
                up(update("\"attributes\":[{\"field\":\"custom\",\"key\":\"Podjetje\",\"value\":\"a\"},"
                        + "{\"field\":\"custom\",\"key\":\"podjetje\",\"value\":\"b\"}]"));
        Parsed<BulkEditInput> fields = up(
                update(
                        "\"attributes\":[{\"field\":\"phone\",\"value\":\"01 111\"},{\"field\":\"phone\",\"value\":\"02 222\"}]"));

        assertThat(hasCode(keys, "DUPLICATE", "attributes[1]")).isTrue();
        assertThat(hasCode(fields, "DUPLICATE", "attributes[1]")).isTrue();
    }

    @Test
    @Tag("FR-009-07")
    void valuesFollowTheDictionaryRulesOfThePredefinedField() {
        assertThat(has(
                        up(update("\"attributes\":[{\"field\":\"email\",\"value\":\"ni-veljaven\"}]")),
                        "attributes[0].value",
                        "INVALID_VALUE"))
                .isTrue();
        assertThat(has(
                        up(update("\"attributes\":[{\"field\":\"phone\",\"value\":\"abc\"}]")),
                        "attributes[0].value",
                        "INVALID_VALUE"))
                .isTrue();
        assertThat(has(
                        up(update("\"attributes\":[{\"field\":\"address\",\"value\":\"" + "a".repeat(301) + "\"}]")),
                        "attributes[0].value",
                        "TOO_LONG"))
                .isTrue();
        assertThat(has(
                        up(update("\"attributes\":[{\"field\":\"custom\",\"key\":\"k\",\"value\":\"" + "a".repeat(501)
                                + "\"}]")),
                        "attributes[0].value",
                        "TOO_LONG"))
                .isTrue();
        assertThat(up(update("\"attributes\":[{\"field\":\"address\",\"value\":\"" + "a".repeat(300) + "\"}]"))
                        .valid())
                .isTrue();
        assertThat(up(update("\"attributes\":[{\"field\":\"custom\",\"key\":\"k\",\"value\":\"" + "a".repeat(500)
                                + "\"}]"))
                        .valid())
                .isTrue();
    }

    @Test
    @Tag("FR-009-07")
    void aValueOfOnlySpacesIsEmptyAndThereforeAValidRemoval() {
        Parsed<BulkEditInput> parsed =
                up(update("\"attributes\":[{\"field\":\"custom\",\"key\":\" podjetje \",\"value\":\"   \"}]"));

        assertThat(parsed.valid()).as(parsed.errors().toString()).isTrue();
        BulkEditInput.AttributeSet set = parsed.value().attributes().get(0);
        assertThat(set.field()).isEqualTo(Field.CUSTOM);
        assertThat(set.key()).isEqualTo("podjetje");
        assertThat(set.value()).isEmpty();
    }

    @Test
    @Tag("FR-009-06")
    void aValidRequestIsParsedWithTrimmedValues() {
        Parsed<BulkEditInput> parsed = up(update("\"addTags\":[\" nova \"],\"removeTags\":[\"staro\"],"
                + "\"attributes\":[{\"field\":\"phone\",\"value\":\" 01 234 56 78 \"}]"));

        assertThat(parsed.valid()).as(parsed.errors().toString()).isTrue();
        BulkEditInput input = parsed.value();
        assertThat(input.contactIds()).containsExactly(UUID.fromString("0193a5b0-7c1e-7d4a-9a51-1f2e3d4c5b6a"));
        assertThat(input.addTags()).containsExactly("nova");
        assertThat(input.removeTags()).containsExactly("staro");
        assertThat(input.attributes())
                .containsExactly(new BulkEditInput.AttributeSet(Field.PHONE, null, "01 234 56 78"));
    }

    // --- telo -----------------------------------------------------------------------------------------------------

    @Test
    @Tag("FR-009-06")
    void aRequestWithNothingToAddRemoveOrSetIsAnEmptyOperation() {
        assertThat(has(up(update("")), "body", "EMPTY_OPERATION")).isTrue();
        assertThat(has(up(update("\"addTags\":[],\"removeTags\":[],\"attributes\":[]")), "body", "EMPTY_OPERATION"))
                .isTrue();
    }

    @Test
    @Tag("FR-009-06")
    void anUnknownBodyFieldIsRejected() {
        assertThat(has(up(update("\"foo\":1,\"addTags\":[\"a\"]")), "foo", "UNKNOWN_FIELD"))
                .isTrue();
        assertThat(has(parser.parseDelete("{\"contactIds\":[" + ONE + "],\"foo\":1}"), "foo", "UNKNOWN_FIELD"))
                .isTrue();
    }

    @Test
    @Tag("FR-009-06")
    void aBodyThatIsNotAJsonObjectIsMalformedAndNeverThrows() {
        for (String body : new String[] {"{broken", "", "[]", "\"x\"", "null"}) {
            assertThat(has(up(body), "body", "MALFORMED")).as(body).isTrue();
            assertThat(has(parser.parseDelete(body), "body", "MALFORMED"))
                    .as(body)
                    .isTrue();
            assertThat(has(parser.parseCheck(body), "body", "MALFORMED"))
                    .as(body)
                    .isTrue();
        }
        assertThat(has(up(null), "body", "MALFORMED")).isTrue();
    }

    // --- selection-check ------------------------------------------------------------------------------------------

    private static String query(String fields) {
        return "{" + fields + "}";
    }

    private static String check(String queries) {
        return "{\"contactIds\":[" + ONE + "],\"queries\":" + queries + "}";
    }

    @Test
    @Tag("FR-009-18")
    void checkAcceptsNoQueriesAndUpToTwentyOfThem() {
        String twenty = IntStream.range(0, 20)
                .mapToObj(i -> query("\"tag\":[\"t" + i + "\"],\"contactIds\":[],\"excludedIds\":[]"))
                .collect(Collectors.joining(",", "[", "]"));
        String twentyOne = IntStream.range(0, 21)
                .mapToObj(i -> query("\"tag\":[\"t" + i + "\"],\"contactIds\":[],\"excludedIds\":[]"))
                .collect(Collectors.joining(",", "[", "]"));

        assertThat(parser.parseCheck("{\"contactIds\":[" + ONE + "]}").valid()).isTrue();
        assertThat(parser.parseCheck(check("[]")).valid()).isTrue();
        assertThat(parser.parseCheck(check(twenty)).valid()).isTrue();
        assertThat(has(parser.parseCheck(check(twentyOne)), "queries", "TOO_MANY"))
                .isTrue();
    }

    @Test
    @Tag("FR-009-18")
    void theSumOfContactIdsAndOfExcludedIdsOverAllQueriesIsLimitedToTenThousand() {
        String half = ids(5_000);
        String halfMore = IntStream.range(5_000, 10_000)
                .mapToObj(i -> "\"" + new UUID(0, i + 1) + "\"")
                .collect(Collectors.joining(",", "[", "]"));
        String one = "[\"" + new UUID(0, 20_000) + "\"]";
        String ok = check("[" + query("\"contactIds\":" + half + ",\"excludedIds\":" + half) + ","
                + query("\"contactIds\":" + halfMore + ",\"excludedIds\":" + halfMore) + "]");
        String tooManyAdded = check("[" + query("\"contactIds\":" + half + ",\"excludedIds\":[]") + ","
                + query("\"contactIds\":" + halfMore + ",\"excludedIds\":[]") + ","
                + query("\"contactIds\":" + one + ",\"excludedIds\":[]") + "]");
        String tooManyExcluded = check("[" + query("\"contactIds\":[],\"excludedIds\":" + half) + ","
                + query("\"contactIds\":[],\"excludedIds\":" + halfMore) + ","
                + query("\"contactIds\":[],\"excludedIds\":" + one) + "]");

        assertThat(parser.parseCheck(ok).valid())
                .as(parser.parseCheck(ok).errors().toString())
                .isTrue();
        assertThat(has(parser.parseCheck(tooManyAdded), "queries", "TOO_MANY")).isTrue();
        assertThat(has(parser.parseCheck(tooManyExcluded), "queries", "TOO_MANY"))
                .isTrue();
    }

    @Test
    @Tag("FR-009-18")
    void aQueryErrorOf008CarriesThePrefixOfItsQuery() {
        Parsed<SelectionCheck.Request> parsed = parser.parseCheck(check("[" + query("\"tag\":[\"a\"],\"contactIds\":[]")
                + "," + query("\"f\":[\"foo:x\"],\"contactIds\":[]") + "]"));

        assertThat(has(parsed, "queries[1].f[0]", "UNKNOWN_FIELD")).isTrue();
        assertThat(parsed.value()).isNull();
    }

    @Test
    @Tag("FR-009-18")
    void aValidCheckIsParsedIntoItsQueries() {
        Parsed<SelectionCheck.Request> parsed = parser.parseCheck(check("["
                + query("\"q\":\"novak\",\"f\":[\"email:feri.si\"],\"tag\":[\"konferenca2025\"],\"contactIds\":[" + ONE
                        + "],\"excludedIds\":[]")
                + "]"));

        assertThat(parsed.valid()).as(parsed.errors().toString()).isTrue();
        SelectionCheck.Query q = parsed.value().queries().get(0);
        assertThat(q.q()).isEqualTo("novak");
        assertThat(q.f()).containsExactly("email:feri.si");
        assertThat(q.tag()).containsExactly("konferenca2025");
        assertThat(q.contactIds()).hasSize(1);
        assertThat(q.excludedIds()).isEmpty();
    }

    @Test
    @Tag("FR-009-07")
    void anAttributeWithoutAValueIsRequired() {
        assertThat(has(up(update("\"attributes\":[{\"field\":\"phone\"}]")), "attributes[0].value", "REQUIRED"))
                .isTrue();
    }
}
