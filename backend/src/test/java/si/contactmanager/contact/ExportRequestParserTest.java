package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.BulkInputParser.Parsed;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ContactQuery.Field;
import si.contactmanager.contact.ContactQuery.Kind;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Razčlenitev telesa izvoza (FR-010-07, FR-010-13; data-model.md – ExportRequest): dobesedni primeri kod in polj
 * napak; razčlenjevalnik nikoli ne vrže.
 */
class ExportRequestParserTest {

    private static final String ONE = "\"0193a5b0-7c1e-7d4a-9a51-1f2e3d4c5b6a\"";

    private final ExportRequestParser parser = new ExportRequestParser();

    private static String ids(int count) {
        return IntStream.range(0, count)
                .mapToObj(i -> "\"" + new UUID(0, i + 1) + "\"")
                .collect(Collectors.joining(",", "[", "]"));
    }

    private static String body(String fields) {
        return "{\"contactIds\":[" + ONE + "]" + (fields.isEmpty() ? "" : "," + fields) + "}";
    }

    private static boolean has(Parsed<?> parsed, String field, String code) {
        return parsed.errors().contains(new FieldError(field, code));
    }

    private Parsed<ExportRequest> parse(String json) {
        return parser.parse(json);
    }

    @Test
    @Tag("FR-010-13")
    void contactIdsAreRequiredAndNotEmpty() {
        assertThat(has(parse("{\"language\":\"sl\"}"), "contactIds", "REQUIRED"))
                .isTrue();
        assertThat(has(parse("{\"contactIds\":[],\"language\":\"sl\"}"), "contactIds", "REQUIRED"))
                .isTrue();
    }

    @Test
    @Tag("FR-010-13")
    void atMostTenThousandDistinctIdentitiesAfterMergingDuplicates() {
        assertThat(has(parse("{\"contactIds\":" + ids(10_001) + ",\"language\":\"sl\"}"), "contactIds", "TOO_MANY"))
                .isTrue();
        Parsed<ExportRequest> exactly = parse("{\"contactIds\":" + ids(10_000) + ",\"language\":\"sl\"}");
        assertThat(exactly.valid()).isTrue();
        assertThat(exactly.value().contactIds()).hasSize(10_000);

        // 10 000 različnih + ena podvojena (prva ponovljena) = 10 001 zapisov, a 10 000 po zlitju
        String list = ids(10_000).replaceFirst("\\]$", ",\"" + new UUID(0, 1) + "\"]");
        Parsed<ExportRequest> merged = parse("{\"contactIds\":" + list + ",\"language\":\"sl\"}");
        assertThat(merged.valid()).isTrue();
        assertThat(merged.value().contactIds()).hasSize(10_000);
    }

    @Test
    @Tag("FR-010-13")
    void aNonUuidIdentityIsInvalid() {
        Parsed<ExportRequest> parsed = parse("{\"contactIds\":[" + ONE + ",\"ni-uuid\"],\"language\":\"sl\"}");

        assertThat(has(parsed, "contactIds[1]", "INVALID_VALUE")).isTrue();
    }

    @Test
    @Tag("FR-010-07")
    void sortDefaultsToLastNameAscending() {
        Parsed<ExportRequest> parsed = parse(body("\"language\":\"sl\""));

        assertThat(parsed.valid()).isTrue();
        assertThat(parsed.value().sort()).isEqualTo(new Field(Kind.LAST_NAME, null));
        assertThat(parsed.value().dir()).isEqualTo(Direction.ASC);
        assertThat(parsed.value().language()).isEqualTo("sl");
    }

    @Test
    @Tag("FR-010-07")
    void sortAndDirectionAreParsedLikeInTheList() {
        Parsed<ExportRequest> email = parse(body("\"sort\":\"email\",\"dir\":\"desc\",\"language\":\"en\""));
        assertThat(email.valid()).isTrue();
        assertThat(email.value().sort()).isEqualTo(new Field(Kind.EMAIL, null));
        assertThat(email.value().dir()).isEqualTo(Direction.DESC);
        assertThat(email.value().language()).isEqualTo("en");

        Parsed<ExportRequest> attribute = parse(body("\"sort\":\"attr:kompetenca\",\"language\":\"sl\""));
        assertThat(attribute.valid()).isTrue();
        assertThat(attribute.value().sort()).isEqualTo(new Field(Kind.ATTRIBUTE, "kompetenca"));
    }

    @Test
    @Tag("FR-010-07")
    void anInvalidSortOrDirectionIsRejected() {
        assertThat(has(parse(body("\"sort\":\"nekaj\",\"language\":\"sl\"")), "sort", "INVALID_VALUE"))
                .isTrue();
        assertThat(has(parse(body("\"dir\":\"gor\",\"language\":\"sl\"")), "dir", "INVALID_VALUE"))
                .isTrue();
    }

    @Test
    @Tag("FR-010-04")
    void languageIsRequiredAndSlOrEn() {
        assertThat(has(parse(body("")), "language", "REQUIRED")).isTrue();
        assertThat(has(parse(body("\"language\":\"de\"")), "language", "INVALID_VALUE"))
                .isTrue();
    }

    @Test
    @Tag("FR-010-13")
    void anUnknownFieldIsRejectedByName() {
        assertThat(has(parse(body("\"language\":\"sl\",\"foo\":1")), "foo", "UNKNOWN_FIELD"))
                .isTrue();
    }

    @Test
    @Tag("FR-010-13")
    void aBodyThatIsNotAJsonObjectIsMalformedAndNeverThrows() {
        assertThat(has(parse("[1,2]"), "body", "MALFORMED")).isTrue();
        assertThat(has(parse("ni json"), "body", "MALFORMED")).isTrue();
        assertThat(has(parse(""), "body", "MALFORMED")).isTrue();
        assertThat(has(parse(null), "body", "MALFORMED")).isTrue();
    }
}
