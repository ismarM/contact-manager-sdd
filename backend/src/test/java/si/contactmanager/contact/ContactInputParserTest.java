package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.ContactInputParser.Parsed;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Razčlenitev in preverjanje telesa kontakta (FR-004-02; research R-06; feature-map §2.6). */
@Tag("FR-004-02")
class ContactInputParserTest {

    private final ContactInputParser parser = new ContactInputParser();

    private static String json(String fields) {
        return "{" + fields + "}";
    }

    private static Map<String, String> errors(Parsed parsed) {
        Map<String, String> map = new LinkedHashMap<>();
        for (FieldError error : parsed.errors()) {
            map.putIfAbsent(error.field(), error.code());
        }
        return map;
    }

    private static String repeat(String text, int times) {
        return text.repeat(times);
    }

    @Test
    void validInputIsTrimmedAndKeepsOrder() {
        Parsed parsed = parser.parseCreate(json("""
                "firstName":"  Janez ","lastName":"Novak","address":" Ulica 1\\n1000 Ljubljana ",
                "email":" janez@primer.si ","phone":" +386 (1) 234-56/7 ",
                "attributes":[{"key":" kompetenca ","value":" web dev "},{"key":"Oddelek","value":"IT"}],
                "tags":["ne_obveščaj","konferenca2025"]"""));

        assertThat(parsed.valid()).as(parsed.errors().toString()).isTrue();
        assertThat(parsed.input()).isNotNull();
        ContactInput input = parsed.input();
        assertThat(input.firstName()).isEqualTo("Janez");
        assertThat(input.lastName()).isEqualTo("Novak");
        assertThat(input.address()).isEqualTo("Ulica 1\n1000 Ljubljana");
        assertThat(input.email()).isEqualTo("janez@primer.si");
        assertThat(input.phone()).isEqualTo("+386 (1) 234-56/7");
        assertThat(input.attributes())
                .containsExactly(new Attribute("kompetenca", "web dev"), new Attribute("Oddelek", "IT"));
        assertThat(input.tags()).containsExactly("ne_obveščaj", "konferenca2025");
        assertThat(parsed.version()).isNull();
    }

    @Test
    void emptyOptionalFieldsBecomeNullAndListsDefaultToEmpty() {
        Parsed parsed =
                parser.parseCreate(json("\"firstName\":\"Janez\",\"lastName\":\"  \",\"email\":\"\",\"phone\":null"));

        assertThat(parsed.valid()).isTrue();
        assertThat(parsed.input()).isNotNull();
        assertThat(parsed.input().lastName()).isNull();
        assertThat(parsed.input().email()).isNull();
        assertThat(parsed.input().phone()).isNull();
        assertThat(parsed.input().address()).isNull();
        assertThat(parsed.input().attributes()).isEmpty();
        assertThat(parsed.input().tags()).isEmpty();
    }

    @Test
    void firstNameAloneOrLastNameAloneIsEnough() {
        Parsed first = parser.parseCreate(json("\"firstName\":\"Janez\""));
        Parsed last = parser.parseCreate(json("\"lastName\":\"Novak\""));

        assertThat(first.valid()).isTrue();
        assertThat(first.input()).isNotNull();
        assertThat(first.input().firstName()).isEqualTo("Janez");
        assertThat(first.input().lastName()).isNull();
        assertThat(last.valid()).isTrue();
        assertThat(last.input()).isNotNull();
        assertThat(last.input().lastName()).isEqualTo("Novak");
        assertThat(last.input().firstName()).isNull();
    }

    @Test
    void missingFirstAndLastNameIsRequiredOnBothFields() {
        Parsed parsed = parser.parseCreate(json("\"firstName\":\"  \",\"email\":\"a@b.si\""));

        assertThat(parsed.valid()).isFalse();
        assertThat(parsed.input()).isNull();
        assertThat(errors(parsed)).containsEntry("firstName", "REQUIRED").containsEntry("lastName", "REQUIRED");
    }

    @Test
    void lengthsAreMeasuredInCodePoints() {
        assertThat(parser.parseCreate(json("\"firstName\":\"" + repeat("č", 100) + "\""))
                        .valid())
                .isTrue();
        assertThat(parser.parseCreate(json("\"firstName\":\"" + repeat("😀", 100) + "\""))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"" + repeat("č", 101) + "\""))))
                .containsEntry("firstName", "TOO_LONG");
        assertThat(errors(parser.parseCreate(json("\"lastName\":\"" + repeat("a", 101) + "\""))))
                .containsEntry("lastName", "TOO_LONG");
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"address\":\"" + repeat("a", 300) + "\""))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"address\":\"" + repeat("a", 301) + "\""))))
                .containsEntry("address", "TOO_LONG");
    }

    @ParameterizedTest
    @ValueSource(strings = {"janez@", "janez", "@primer.si", "janez@primer", "ja nez@primer.si", "a@b@c.si"})
    void invalidEmailIsRejected(String email) {
        Parsed parsed = parser.parseCreate(json("\"firstName\":\"A\",\"email\":\"" + email + "\""));

        assertThat(errors(parsed)).containsEntry("email", "INVALID_VALUE");
    }

    @Test
    void emailLengthLimitIs254() {
        String exact = repeat("a", 244) + "@primer.si"; // 244 + 10 = 254
        assertThat(exact.codePointCount(0, exact.length())).isEqualTo(254);
        Parsed accepted = parser.parseCreate(json("\"firstName\":\"A\",\"email\":\"" + exact + "\""));
        assertThat(accepted.valid()).as(accepted.errors().toString()).isTrue();
        assertThat(accepted.input()).isNotNull();
        assertThat(accepted.input().email()).isEqualTo(exact);
        String tooLong = repeat("a", 245) + "@primer.si"; // 255
        assertThat(tooLong.codePointCount(0, tooLong.length())).isEqualTo(255);
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"email\":\"" + tooLong + "\""))))
                .containsEntry("email", "TOO_LONG");
    }

    @Test
    void phoneAllowsDigitsSpacesAndPunctuationOnly() {
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"phone\":\"+386 (1) 234-56/7\""))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"phone\":\"01 234 abc\""))))
                .containsEntry("phone", "INVALID_VALUE");
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"phone\":\"" + repeat("1", 30) + "\""))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"phone\":\"" + repeat("1", 31) + "\""))))
                .containsEntry("phone", "TOO_LONG");
    }

    @Test
    void attributeKeyAndValueLimits() {
        String ok = "{\"key\":\"" + repeat("k", 50) + "\",\"value\":\"" + repeat("v", 500) + "\"}";
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"attributes\":[" + ok + "]"))
                        .valid())
                .isTrue();

        Parsed longKey = parser.parseCreate(
                json("\"firstName\":\"A\",\"attributes\":[{\"key\":\"" + repeat("k", 51) + "\",\"value\":\"v\"}]"));
        assertThat(errors(longKey)).containsEntry("attributes[0].key", "TOO_LONG");
        Parsed longValue = parser.parseCreate(
                json("\"firstName\":\"A\",\"attributes\":[{\"key\":\"k\",\"value\":\"" + repeat("v", 501) + "\"}]"));
        assertThat(errors(longValue)).containsEntry("attributes[0].value", "TOO_LONG");
    }

    @Test
    void duplicateKeyIgnoringCaseIsRejectedOnTheSecondRow() {
        Parsed parsed = parser.parseCreate(json("""
                "firstName":"A","attributes":[{"key":"Kompetenca","value":"1"},{"key":"kompetenca","value":"2"}]"""));

        assertThat(errors(parsed))
                .containsOnlyKeys("attributes[1].key")
                .containsEntry("attributes[1].key", "DUPLICATE");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Telefon",
                "phone",
                "E-NASLOV",
                "email",
                "e-mail",
                "Ime",
                "first name",
                "First  Name",
                "priimek",
                "Last Name",
                "naslov",
                "Address"
            })
    void predefinedAttributeNamesAreReservedKeys(String key) {
        Parsed parsed = parser.parseCreate(
                json("\"firstName\":\"A\",\"attributes\":[{\"key\":\"" + key + "\",\"value\":\"v\"}]"));

        assertThat(errors(parsed)).containsEntry("attributes[0].key", "RESERVED_KEY");
    }

    @Test
    void completelyEmptyAttributeRowIsIgnoredButHalfEmptyRowIsAnError() {
        Parsed ignored = parser.parseCreate(json("""
                "firstName":"A","attributes":[{"key":"  ","value":""},{"key":"k","value":"v"}]"""));
        assertThat(ignored.valid()).isTrue();
        assertThat(ignored.input()).isNotNull();
        assertThat(ignored.input().attributes()).containsExactly(new Attribute("k", "v"));

        Parsed noValue =
                parser.parseCreate(json("\"firstName\":\"A\",\"attributes\":[{\"key\":\"k\",\"value\":\" \"}]"));
        assertThat(errors(noValue)).containsEntry("attributes[0].value", "REQUIRED");
        Parsed noKey = parser.parseCreate(json("\"firstName\":\"A\",\"attributes\":[{\"key\":\"\",\"value\":\"v\"}]"));
        assertThat(errors(noKey)).containsEntry("attributes[0].key", "REQUIRED");
    }

    @Test
    void atMostFiftyAttributesAndThirtyTags() {
        String attributes = IntStream.range(0, 50)
                .mapToObj(i -> "{\"key\":\"k" + i + "\",\"value\":\"v\"}")
                .collect(Collectors.joining(","));
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"attributes\":[" + attributes + "]"))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json(
                        "\"firstName\":\"A\",\"attributes\":[" + attributes + ",{\"key\":\"k50\",\"value\":\"v\"}]"))))
                .containsEntry("attributes", "TOO_MANY");

        String tags = IntStream.range(0, 30).mapToObj(i -> "\"t" + i + "\"").collect(Collectors.joining(","));
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[" + tags + "]"))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[" + tags + ",\"t30\"]"))))
                .containsEntry("tags", "TOO_MANY");
    }

    @Test
    void tagRules() {
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[\"moja znacka\"]"))))
                .containsEntry("tags[0]", "INVALID_VALUE");
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[\"a\\tb\"]"))))
                .containsEntry("tags[0]", "INVALID_VALUE");
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[\"  \"]"))))
                .containsEntry("tags[0]", "REQUIRED");
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[\"" + repeat("t", 51) + "\"]"))))
                .containsEntry("tags[0]", "TOO_LONG");
        assertThat(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[\"" + repeat("t", 50) + "\"]"))
                        .valid())
                .isTrue();
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":[\"vip\",\"VIP\"]"))))
                .containsOnlyKeys("tags[1]")
                .containsEntry("tags[1]", "DUPLICATE");
    }

    @Test
    void unknownFieldsAndMalformedBodyAreErrors() {
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"nickname\":\"x\""))))
                .containsEntry("nickname", "UNKNOWN_FIELD");
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"version\":1"))))
                .containsEntry("version", "UNKNOWN_FIELD");
        assertThat(errors(parser.parseCreate("{broken"))).containsEntry("body", "MALFORMED");
        assertThat(errors(parser.parseCreate("[]"))).containsEntry("body", "MALFORMED");
        assertThat(errors(parser.parseCreate(null))).containsEntry("body", "MALFORMED");
        assertThat(errors(parser.parseCreate(json("\"firstName\":5")))).containsEntry("firstName", "INVALID_VALUE");
        assertThat(errors(parser.parseCreate(json("\"firstName\":\"A\",\"tags\":\"vip\""))))
                .containsEntry("tags", "INVALID_VALUE");
    }

    @Test
    void updateRequiresIntegerVersion() {
        Parsed parsed = parser.parseUpdate(json("\"firstName\":\"A\",\"version\":3"));
        assertThat(parsed.valid()).isTrue();
        assertThat(parsed.version()).isEqualTo(3L);

        assertThat(errors(parser.parseUpdate(json("\"firstName\":\"A\"")))).containsEntry("version", "REQUIRED");
        assertThat(errors(parser.parseUpdate(json("\"firstName\":\"A\",\"version\":\"3\""))))
                .containsEntry("version", "INVALID_VALUE");
        assertThat(errors(parser.parseUpdate(json("\"firstName\":\"A\",\"version\":1.5"))))
                .containsEntry("version", "INVALID_VALUE");
    }

    @Test
    void updateKeepsTheSentVersionEvenWhenValuesAreInvalid() {
        Parsed parsed = parser.parseUpdate(json("\"email\":\"x\",\"version\":7"));

        assertThat(parsed.valid()).isFalse();
        assertThat(parsed.version()).isEqualTo(7L);
        List<String> fields = parsed.errors().stream().map(FieldError::field).toList();
        assertThat(fields).contains("email", "firstName", "lastName");
    }
}
