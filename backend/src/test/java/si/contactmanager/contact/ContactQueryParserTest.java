package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.ContactQuery.Condition;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ContactQuery.Field;
import si.contactmanager.contact.ContactQuery.Kind;
import si.contactmanager.contact.ContactQueryParser.Parsed;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčlenjevalnik parametrov iskanja (specs/008-iskanje/research.md R-06, R-07; data-model.md). Pričakovanja so
 * dobesedna, napisana iz specifikacije, ne izračunana z izvedbo. Obstoj ključa v skupini preverja servis (T049), ne
 * razčlenjevalnik.
 */
@Tag("FR-008-01")
@Tag("FR-008-02")
@Tag("FR-008-03")
@Tag("FR-008-04")
@Tag("FR-008-07")
@Tag("FR-008-08")
@Tag("FR-008-14")
class ContactQueryParserTest {

    private final ContactQueryParser parser = new ContactQueryParser();

    /** {@code params("tag", "a", "tag", "b", "q", "x")}: ponovljeni parametri ohranijo vrstni red. */
    private static Map<String, List<String>> params(String... pairs) {
        Map<String, List<String>> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.computeIfAbsent(pairs[i], key -> new ArrayList<>()).add(pairs[i + 1]);
        }
        return map;
    }

    private Parsed ok(String... pairs) {
        Parsed parsed = parser.parse(params(pairs));
        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.valid()).isTrue();
        return parsed;
    }

    private Map<String, String> errors(String... pairs) {
        Parsed parsed = parser.parse(params(pairs));
        assertThat(parsed.valid()).isFalse();
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError error : parsed.errors()) {
            errors.putIfAbsent(error.field(), error.code());
        }
        return errors;
    }

    private static Field field(Kind kind) {
        return new Field(kind, null);
    }

    private static Field attribute(String keyNorm) {
        return new Field(Kind.ATTRIBUTE, keyNorm);
    }

    @Test
    void withoutParametersEverythingIsDefault() {
        ContactQuery query = parser.parse(Map.of()).query();

        assertThat(query.words()).isEmpty();
        assertThat(query.conditions()).isEmpty();
        assertThat(query.tags()).isEmpty();
        assertThat(query.sort()).isEqualTo(field(Kind.LAST_NAME));
        assertThat(query.direction()).isEqualTo(Direction.ASC);
        assertThat(query.page()).isZero();
        assertThat(query.size()).isEqualTo(25);
    }

    @Test
    void unknownParametersAreIgnored() {
        ContactQuery query = ok("foo", "bar", "q", "a").query();

        assertThat(query.words()).containsExactly("a");
    }

    // --- q (FR-008-01, FR-008-02) ---

    @Test
    void searchStringIsTrimmedCollapsedAndSplitIntoWords() {
        assertThat(ok("q", "  janez   novak ").query().words()).containsExactly("janez", "novak");
        assertThat(ok("q", "a\tb\nc d").query().words()).containsExactly("a", "b", "c", "d");
    }

    @Test
    void searchStringOfOnlySpacesMeansNoSearch() {
        assertThat(ok("q", "     ").query().words()).isEmpty();
        assertThat(ok("q", "").query().words()).isEmpty();
    }

    @Test
    void specialCharactersStayLiteralWords() {
        assertThat(ok("q", "% _ * + ( \\").query().words()).containsExactly("%", "_", "*", "+", "(", "\\");
    }

    @Test
    void searchStringOfExactly200CharactersIsValidAnd201IsTooLong() {
        assertThat(ok("q", "a".repeat(200)).query().words()).hasSize(1);
        assertThat(errors("q", "a".repeat(201))).containsExactly(Map.entry("q", "TOO_LONG"));
    }

    @Test
    void lengthIsCountedInCodePointsNotUtf16Units() {
        assertThat(ok("q", "😀".repeat(200)).query().words()).hasSize(1);
        assertThat(errors("q", "😀".repeat(201))).containsEntry("q", "TOO_LONG");
    }

    @Test
    void wordMadeOnlyOfInvisibleCharactersIsDropped() {
        assertThat(ok("q", "\u200b").query().words()).isEmpty();
        assertThat(ok("q", "\u200b abc").query().words()).containsExactly("abc");
    }

    @Test
    void nulCharacterInSearchStringIsMalformedBeforeAnyOtherProcessing() {
        assertThat(errors("q", "a\u0000b")).containsExactly(Map.entry("q", "MALFORMED"));
        assertThat(errors("q", "\u0000")).containsExactly(Map.entry("q", "MALFORMED"));
    }

    // --- f (FR-008-03) ---

    @ParameterizedTest
    @CsvSource({
        "firstName,FIRST_NAME",
        "lastName,LAST_NAME",
        "address,ADDRESS",
        "email,EMAIL",
        "phone,PHONE",
    })
    void predefinedFieldsAreMapped(String name, Kind kind) {
        ContactQuery query = ok("f", name + ":vrednost").query();

        assertThat(query.conditions()).containsExactly(new Condition(field(kind), "vrednost"));
    }

    @Test
    void additionalAttributeKeyIsNormalizedToLowerCase() {
        assertThat(ok("f", "x.Kompetenca:web").query().conditions())
                .containsExactly(new Condition(attribute("kompetenca"), "web"));
        assertThat(ok("f", "x.kompetenca:web").query().conditions())
                .containsExactly(new Condition(attribute("kompetenca"), "web"));
    }

    @Test
    void separatorIsTheFirstColonAndTheValueMayContainColons() {
        assertThat(ok("f", "phone:041:123").query().conditions())
                .containsExactly(new Condition(field(Kind.PHONE), "041:123"));
    }

    @Test
    void percentAndColonInKeysAreEscapedAsPercentSequences() {
        assertThat(ok("f", "x.a%3Ab:v").query().conditions()).containsExactly(new Condition(attribute("a:b"), "v"));
        assertThat(ok("f", "x.a%25b:v").query().conditions()).containsExactly(new Condition(attribute("a%b"), "v"));
    }

    @Test
    void valueIsTrimmedAndOrderOfConditionsIsKept() {
        ContactQuery query = ok("f", "email:  feri.si  ", "f", "x.kompetenca:web", "f", "phone:041")
                .query();

        assertThat(query.conditions())
                .containsExactly(
                        new Condition(field(Kind.EMAIL), "feri.si"),
                        new Condition(attribute("kompetenca"), "web"),
                        new Condition(field(Kind.PHONE), "041"));
    }

    @Test
    void conditionErrorsAreReportedPerPositionInTheRequest() {
        assertThat(errors("f", "email:ok", "f", "brezdvopicja")).containsExactly(Map.entry("f[1]", "MALFORMED"));
        assertThat(errors("f", "x.a%zz:v")).containsExactly(Map.entry("f[0]", "MALFORMED"));
        assertThat(errors("f", "foo:x")).containsExactly(Map.entry("f[0]", "UNKNOWN_FIELD"));
        assertThat(errors("f", "email:")).containsExactly(Map.entry("f[0]", "REQUIRED"));
        assertThat(errors("f", "email:    ")).containsExactly(Map.entry("f[0]", "REQUIRED"));
    }

    @Test
    void conditionValueOf500CharactersIsValidAnd501IsTooLong() {
        assertThat(ok("f", "email:" + "a".repeat(500)).query().conditions()).hasSize(1);
        assertThat(errors("f", "email:" + "a".repeat(501))).containsExactly(Map.entry("f[0]", "TOO_LONG"));
    }

    @Test
    void tenConditionsAreValidAndElevenAreTooMany() {
        String[] ten = IntStream.range(0, 10)
                .boxed()
                .flatMap(i -> java.util.stream.Stream.of("f", "email:v" + i))
                .toArray(String[]::new);
        assertThat(ok(ten).query().conditions()).hasSize(10);

        String[] eleven = IntStream.range(0, 11)
                .boxed()
                .flatMap(i -> java.util.stream.Stream.of("f", "email:v" + i))
                .toArray(String[]::new);
        assertThat(errors(eleven)).containsEntry("f", "TOO_MANY");
    }

    @Test
    void nulCharacterInConditionValueOrKeyIsMalformed() {
        assertThat(errors("f", "email:a\u0000b")).containsExactly(Map.entry("f[0]", "MALFORMED"));
        assertThat(errors("f", "x.a\u0000b:v")).containsExactly(Map.entry("f[0]", "MALFORMED"));
    }

    // --- tag (FR-008-04) ---

    @Test
    void tagsAreNormalizedAndDuplicatesAreMerged() {
        assertThat(ok("tag", "vip", "tag", "VIP", "tag", "Konferenca2025")
                        .query()
                        .tags())
                .containsExactly("vip", "konferenca2025");
    }

    @Test
    void thirtyDistinctTagsAreValidAndThirtyOneAreTooMany() {
        String[] thirty = IntStream.range(0, 30)
                .boxed()
                .flatMap(i -> java.util.stream.Stream.of("tag", "t" + i))
                .toArray(String[]::new);
        assertThat(ok(thirty).query().tags()).hasSize(30);

        String[] thirtyOne = IntStream.range(0, 31)
                .boxed()
                .flatMap(i -> java.util.stream.Stream.of("tag", "t" + i))
                .toArray(String[]::new);
        assertThat(errors(thirtyOne)).containsEntry("tag", "TOO_MANY");
    }

    @Test
    void duplicatedTagsDoNotCountTowardsTheLimit() {
        String[] many = IntStream.range(0, 40)
                .boxed()
                .flatMap(i -> java.util.stream.Stream.of("tag", i % 2 == 0 ? "vip" : "VIP"))
                .toArray(String[]::new);

        assertThat(ok(many).query().tags()).containsExactly("vip");
    }

    @Test
    void emptyTagIsRequiredAndTagOf51CharactersIsTooLong() {
        assertThat(errors("tag", "ok", "tag", "")).containsExactly(Map.entry("tag[1]", "REQUIRED"));
        assertThat(ok("tag", "a".repeat(50)).query().tags()).hasSize(1);
        assertThat(errors("tag", "a".repeat(51))).containsExactly(Map.entry("tag[0]", "TOO_LONG"));
    }

    @Test
    void nulCharacterInTagIsMalformed() {
        assertThat(errors("tag", "a\u0000")).containsExactly(Map.entry("tag[0]", "MALFORMED"));
    }

    // --- sort, dir (FR-008-07) ---

    @ParameterizedTest
    @CsvSource({
        "lastName,LAST_NAME",
        "firstName,FIRST_NAME",
        "address,ADDRESS",
        "email,EMAIL",
        "phone,PHONE",
    })
    void sortFieldsAreMapped(String name, Kind kind) {
        assertThat(ok("sort", name).query().sort()).isEqualTo(field(kind));
    }

    @Test
    void sortByAdditionalAttributeUsesTheNormalizedKey() {
        assertThat(ok("sort", "x.Podjetje").query().sort()).isEqualTo(attribute("podjetje"));
    }

    @Test
    void unknownSortFieldIsAnError() {
        assertThat(errors("sort", "foo")).containsExactly(Map.entry("sort", "UNKNOWN_FIELD"));
        assertThat(errors("sort", "")).containsEntry("sort", "UNKNOWN_FIELD");
    }

    @Test
    void directionIsAscOrDescInLowerCaseOnly() {
        assertThat(ok("dir", "asc").query().direction()).isEqualTo(Direction.ASC);
        assertThat(ok("dir", "desc").query().direction()).isEqualTo(Direction.DESC);
    }

    @ParameterizedTest
    @ValueSource(strings = {"up", "ASC", "Desc", "", "1"})
    void anyOtherDirectionIsInvalid(String value) {
        assertThat(errors("dir", value)).containsExactly(Map.entry("dir", "INVALID_VALUE"));
    }

    // --- page, size (FR-008-08, D-43) ---

    @Test
    void pageAndSizeDefaultsAndValidValues() {
        assertThat(ok("page", "0", "size", "25").query().page()).isZero();
        assertThat(ok("page", "3", "size", "100").query().page()).isEqualTo(3);
        assertThat(ok("size", "50").query().size()).isEqualTo(50);
        assertThat(ok("page", "85899345").query().page()).isEqualTo(85899345);
    }

    @ParameterizedTest
    @ValueSource(strings = {"10", "0", "101", "abc", "", "-25", "25.5"})
    void unsupportedSizeIsInvalid(String value) {
        assertThat(errors("size", value)).containsExactly(Map.entry("size", "INVALID_VALUE"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "x", "", "1.5", "85899346", "99999999999"})
    void invalidPageIsRejected(String value) {
        assertThat(errors("page", value)).containsExactly(Map.entry("page", "INVALID_VALUE"));
    }

    // --- vse napake naenkrat (FR-008-14) ---

    @Test
    void allErrorsAreCollectedInOneAnswer() {
        Map<String, String> errors = errors("q", "a".repeat(201), "sort", "foo", "size", "7", "f", "email:");

        assertThat(errors)
                .containsEntry("q", "TOO_LONG")
                .containsEntry("sort", "UNKNOWN_FIELD")
                .containsEntry("size", "INVALID_VALUE")
                .containsEntry("f[0]", "REQUIRED")
                .hasSize(4);
    }

    @Test
    void validCombinationIsParsedCompletely() {
        ContactQuery query = ok(
                        "q",
                        "novak",
                        "f",
                        "phone:041",
                        "tag",
                        "vip",
                        "sort",
                        "email",
                        "dir",
                        "desc",
                        "page",
                        "2",
                        "size",
                        "50")
                .query();

        assertThat(query.words()).containsExactly("novak");
        assertThat(query.conditions()).containsExactly(new Condition(field(Kind.PHONE), "041"));
        assertThat(query.tags()).containsExactly("vip");
        assertThat(query.sort()).isEqualTo(field(Kind.EMAIL));
        assertThat(query.direction()).isEqualTo(Direction.DESC);
        assertThat(query.page()).isEqualTo(2);
        assertThat(query.size()).isEqualTo(50);
    }
}
