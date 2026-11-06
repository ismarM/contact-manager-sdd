package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.group.GroupInputParser.Parsed;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Pravila podatkov skupine (FR-002-02, FR-002-03; feature-map §2.6, research R-07): naslov obrezan, 1–100 znakov; opis
 * do 1000 znakov, prazen = brez opisa; barva ena od osmih imen, pri ustvarjanju privzeto tinta. Znaki so kodne točke.
 */
class GroupInputParserTest {

    private final GroupInputParser parser = new GroupInputParser();

    private static String repeat(String text, int times) {
        return text.repeat(times);
    }

    private static String create(String title, String description, String color) {
        return "{\"title\":" + quote(title) + ",\"description\":" + quote(description) + ",\"color\":" + quote(color)
                + "}";
    }

    private static String quote(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    @Test
    @Tag("FR-002-02")
    void titleIsTrimmed() {
        Parsed parsed = parser.parseCreate(create("  Projekt  ", null, "mah"));

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.input().title()).isEqualTo("Projekt");
        assertThat(parsed.input().color()).isEqualTo(GroupColor.MAH);
    }

    @Test
    @Tag("FR-002-02")
    void emptyOrBlankTitleIsRequired() {
        assertThat(parser.parseCreate(create("", null, null)).errors())
                .containsExactly(new FieldError("title", "REQUIRED"));
        assertThat(parser.parseCreate(create("   ", null, null)).errors())
                .containsExactly(new FieldError("title", "REQUIRED"));
        assertThat(parser.parseCreate("{}").errors()).containsExactly(new FieldError("title", "REQUIRED"));
    }

    @Test
    @Tag("FR-002-02")
    void titleLengthLimitIsHundredCharactersAfterTrim() {
        Parsed hundred = parser.parseCreate(create(" " + repeat("a", 100) + " ", null, null));
        assertThat(hundred.errors()).isEmpty();
        assertThat(hundred.input().title()).hasSize(100);

        assertThat(parser.parseCreate(create(repeat("a", 101), null, null)).errors())
                .containsExactly(new FieldError("title", "TOO_LONG"));
    }

    @Test
    @Tag("FR-002-02")
    void lengthIsCountedInCodePoints() {
        // 100 emotikonov (izven BMP) je 200 enot UTF-16, a 100 znakov.
        Parsed emoji = parser.parseCreate(create(repeat("😀", 100), repeat("😀", 1000), null));

        assertThat(emoji.errors()).isEmpty();
        assertThat(parser.parseCreate(create(repeat("😀", 101), null, null)).errors())
                .containsExactly(new FieldError("title", "TOO_LONG"));
    }

    @Test
    @Tag("FR-002-02")
    void descriptionLimitIsThousandCharacters() {
        assertThat(parser.parseCreate(create("X", repeat("b", 1000), null)).errors())
                .isEmpty();
        assertThat(parser.parseCreate(create("X", repeat("b", 1001), null)).errors())
                .containsExactly(new FieldError("description", "TOO_LONG"));
    }

    @Test
    @Tag("FR-002-02")
    void emptyOrBlankDescriptionMeansNoDescriptionAndIsNotTrimmedOtherwise() {
        assertThat(parser.parseCreate(create("X", "", null)).input().description())
                .isNull();
        assertThat(parser.parseCreate(create("X", "   ", null)).input().description())
                .isNull();
        assertThat(parser.parseCreate(create("X", " opis ", null)).input().description())
                .isEqualTo(" opis ");
    }

    @Test
    @Tag("FR-002-02")
    void unknownOrWrongCaseColorIsInvalid() {
        assertThat(parser.parseCreate(create("X", null, "blue")).errors())
                .containsExactly(new FieldError("color", "INVALID_VALUE"));
        assertThat(parser.parseCreate(create("X", null, "Mah")).errors())
                .containsExactly(new FieldError("color", "INVALID_VALUE"));
    }

    @Test
    @Tag("FR-002-03")
    void createWithoutColorOrDescriptionUsesDefaults() {
        Parsed missing = parser.parseCreate("{\"title\":\"X\"}");
        Parsed nulls = parser.parseCreate(create("X", null, null));

        assertThat(missing.errors()).isEmpty();
        assertThat(missing.input().color()).isEqualTo(GroupColor.TINTA);
        assertThat(missing.input().description()).isNull();
        assertThat(nulls.input().color()).isEqualTo(GroupColor.TINTA);
    }

    @Test
    @Tag("FR-002-02")
    void updateRequiresAllFieldsIncludingVersion() {
        Parsed parsed = parser.parseUpdate("{}");

        assertThat(parsed.errors())
                .containsExactlyInAnyOrder(
                        new FieldError("title", "REQUIRED"),
                        new FieldError("description", "REQUIRED"),
                        new FieldError("color", "REQUIRED"),
                        new FieldError("version", "REQUIRED"));
        assertThat(parsed.version()).isNull();
    }

    @Test
    @Tag("FR-002-02")
    void updateWithNullDescriptionAndVersionIsValid() {
        Parsed parsed = parser.parseUpdate("{\"title\":\"X\",\"description\":null,\"color\":\"rja\",\"version\":7}");

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.version()).isEqualTo(7L);
        assertThat(parsed.input().description()).isNull();
        assertThat(parsed.input().color()).isEqualTo(GroupColor.RJA);
    }

    @Test
    @Tag("FR-002-02")
    void updateNullColorIsInvalidAndVersionMustBeAnInteger() {
        Parsed parsed = parser.parseUpdate("{\"title\":\"X\",\"description\":null,\"color\":null,\"version\":\"3\"}");

        assertThat(parsed.errors())
                .containsExactlyInAnyOrder(
                        new FieldError("color", "REQUIRED"), new FieldError("version", "INVALID_VALUE"));
        assertThat(parser.parseUpdate("{\"title\":\"X\",\"description\":null,\"color\":\"mah\",\"version\":1.5}")
                        .errors())
                .containsExactly(new FieldError("version", "INVALID_VALUE"));
    }

    @Test
    @Tag("FR-002-02")
    void unknownFieldIsReported() {
        assertThat(parser.parseCreate("{\"title\":\"X\",\"owner\":\"ana\"}").errors())
                .containsExactly(new FieldError("owner", "UNKNOWN_FIELD"));
    }

    @Test
    @Tag("FR-002-02")
    void malformedBodyIsReportedAsBody() {
        assertThat(parser.parseCreate("{ni json").errors()).containsExactly(new FieldError("body", "MALFORMED"));
        assertThat(parser.parseCreate("[]").errors()).containsExactly(new FieldError("body", "MALFORMED"));
        assertThat(parser.parseUpdate("").errors()).containsExactly(new FieldError("body", "MALFORMED"));
    }

    @Test
    @Tag("FR-002-02")
    void allErrorsAreReportedTogetherAndParserNeverThrows() {
        Parsed parsed = parser.parseCreate(create("", repeat("b", 1001), "blue"));

        assertThat(parsed.errors())
                .containsExactlyInAnyOrder(
                        new FieldError("title", "REQUIRED"),
                        new FieldError("description", "TOO_LONG"),
                        new FieldError("color", "INVALID_VALUE"));
        assertThat(parsed.valid()).isFalse();
    }
}
