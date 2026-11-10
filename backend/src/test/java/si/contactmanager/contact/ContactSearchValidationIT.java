package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/**
 * Neveljavni parametri iskanja (FR-008-14; research R-06): {@code 400 VALIDATION_FAILED} z napakami po poljih, enak
 * odgovor za ključ iz druge skupine, nobenega {@code 500} za vrinjene vrednosti.
 */
@Tag("FR-008-14")
class ContactSearchValidationIT extends ContactSearchApiTest {

    private static Map<String, String> expected(String... pairs) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(pairs[i], pairs[i + 1]);
        }
        return map;
    }

    private static Arguments row(String[] query, Map<String, String> errors) {
        return Arguments.of(String.join("&", query), query, errors);
    }

    private static String[] repeat(String name, String valuePrefix, int times) {
        List<String> pairs = new ArrayList<>();
        for (int i = 0; i < times; i++) {
            pairs.add(name);
            pairs.add(valuePrefix + i);
        }
        return pairs.toArray(String[]::new);
    }

    static Stream<Arguments> invalid() {
        return Stream.of(
                row(new String[] {"q", "a".repeat(201)}, expected("q", "TOO_LONG")),
                row(new String[] {"q", "a\u0000b"}, expected("q", "MALFORMED")),
                row(new String[] {"f", "foo:x"}, expected("f[0]", "UNKNOWN_FIELD")),
                row(new String[] {"f", "x.neobstaja:x"}, expected("f[0]", "UNKNOWN_FIELD")),
                row(new String[] {"f", "brezdvopicja"}, expected("f[0]", "MALFORMED")),
                row(new String[] {"f", "x.a%zz:v"}, expected("f[0]", "MALFORMED")),
                row(new String[] {"f", "email:"}, expected("f[0]", "REQUIRED")),
                row(new String[] {"f", "email:   "}, expected("f[0]", "REQUIRED")),
                row(new String[] {"f", "email:" + "a".repeat(501)}, expected("f[0]", "TOO_LONG")),
                row(new String[] {"f", "email:a\u0000b"}, expected("f[0]", "MALFORMED")),
                row(repeat("f", "email:v", 11), expected("f", "TOO_MANY")),
                row(repeat("tag", "t", 31), expected("tag", "TOO_MANY")),
                row(new String[] {"tag", "a".repeat(51)}, expected("tag[0]", "TOO_LONG")),
                row(new String[] {"tag", ""}, expected("tag[0]", "REQUIRED")),
                row(new String[] {"tag", "a\u0000"}, expected("tag[0]", "MALFORMED")),
                row(new String[] {"sort", "foo"}, expected("sort", "UNKNOWN_FIELD")),
                row(new String[] {"sort", "x.neobstaja"}, expected("sort", "UNKNOWN_FIELD")),
                row(new String[] {"dir", "up"}, expected("dir", "INVALID_VALUE")),
                row(new String[] {"dir", "ASC"}, expected("dir", "INVALID_VALUE")),
                row(new String[] {"size", "10"}, expected("size", "INVALID_VALUE")),
                row(new String[] {"size", ""}, expected("size", "INVALID_VALUE")),
                row(new String[] {"size", "101"}, expected("size", "INVALID_VALUE")),
                row(new String[] {"page", "-1"}, expected("page", "INVALID_VALUE")),
                row(new String[] {"page", "abc"}, expected("page", "INVALID_VALUE")),
                row(new String[] {"page", ""}, expected("page", "INVALID_VALUE")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalid")
    void invalidParametersAreRejectedWithTheExpectedFieldError(String label, String[] query, Map<String, String> errors)
            throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak");

        HttpResponse<String> response = search(s, query);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(ContactSearchClient.errors(response.body())).containsExactlyEntriesOf(errors);
    }

    @Test
    void allErrorsAreReportedInOneAnswer() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                search(s, "q", "a".repeat(201), "sort", "foo", "size", "7", "dir", "up", "page", "-3", "tag", "");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(ContactSearchClient.errors(response.body()))
                .containsEntry("q", "TOO_LONG")
                .containsEntry("sort", "UNKNOWN_FIELD")
                .containsEntry("size", "INVALID_VALUE")
                .containsEntry("dir", "INVALID_VALUE")
                .containsEntry("page", "INVALID_VALUE")
                .containsEntry("tag[0]", "REQUIRED");
    }

    @Test
    void theLimitsThemselvesAreValid() throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak");
        List<String> ten = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            ten.addAll(List.of("f", "email:v" + i));
        }
        List<String> thirty = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            thirty.addAll(List.of("tag", "t" + i));
        }

        assertThat(search(s, "q", "a".repeat(200)).statusCode()).isEqualTo(200);
        assertThat(search(s, "f", "email:" + "a".repeat(500)).statusCode()).isEqualTo(200);
        assertThat(search(s, ten.toArray(String[]::new)).statusCode()).isEqualTo(200);
        assertThat(search(s, thirty.toArray(String[]::new)).statusCode()).isEqualTo(200);
        assertThat(search(s, "tag", "a".repeat(50)).statusCode()).isEqualTo(200);
        for (String size : List.of("25", "50", "100")) {
            assertThat(search(s, "size", size).statusCode()).isEqualTo(200);
        }
    }

    @Test
    void aKeyThatExistsOnlyInAnotherGroupGivesTheSameAnswerAsAKeyThatExistsNowhere() throws Exception {
        Scenario a = scenario();
        add(a, "Janez", "Novak");
        UUID other = groups.createGroup(a.id(Who.OWNER), "Skupina B");
        UUID foreign = contacts.insert(other, a.id(Who.OWNER), "Tuj", "Kontakt");
        contacts.addAttribute(foreign, 0, "skrivno", "x");
        contacts.addTags(foreign, "tajno");

        for (String[] pair : new String[][] {{"f", "x.%s:x"}, {"sort", "x.%s"}}) {
            HttpResponse<String> inOtherGroup = search(a, pair[0], pair[1].formatted("skrivno"));
            HttpResponse<String> nowhere = search(a, pair[0], pair[1].formatted("ne-obstaja-nikjer"));

            assertThat(inOtherGroup.statusCode()).isEqualTo(400);
            assertThat(inOtherGroup.body()).isEqualTo(nowhere.body());
            assertThat(inOtherGroup.body()).doesNotContain("skrivno").doesNotContain("Kontakt");
        }
        // značka druge skupine ni polje: veljavna zahteva z 0 zadetki
        HttpResponse<String> tag = search(a, "tag", "tajno");
        assertThat(tag.statusCode()).isEqualTo(200);
        assertThat(ContactSearchClient.total(tag.body())).isZero();
    }

    @Test
    void errorBodyDoesNotEchoTheSubmittedValues() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                search(s, "f", "foo:zelo-posebna-vrednost-123", "sort", "zelo-posebno-polje-456");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body())
                .doesNotContain("zelo-posebna-vrednost-123")
                .doesNotContain("zelo-posebno-polje-456");
    }

    @Test
    void injectedValuesAreHandledLiterallyAndNeverCauseAServerError() throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak");
        UUID attributeOwner = add(s, "Ana", "Kralj");
        contacts.addAttribute(attributeOwner, 0, "kompetenca", "web");
        List<String> hostile = List.of(
                "'; DROP TABLE contact;--", "\" OR 1=1 --", "x') OR ('1'='1", "%", "_", "\\", "'", "COLLATE \"C\"");

        for (String value : hostile) {
            assertThat(search(s, "q", value).statusCode()).as("q " + value).isEqualTo(200);
            assertThat(search(s, "f", "email:" + value).statusCode())
                    .as("f " + value)
                    .isEqualTo(200);
            assertThat(search(s, "f", "x.kompetenca:" + value).statusCode())
                    .as("fx " + value)
                    .isEqualTo(200);
            assertThat(search(s, "tag", value).statusCode()).as("tag " + value).isEqualTo(200);
            // vrinjen ključ je neobstoječe polje: 400, nikoli 500
            assertThat(search(s, "f", "x." + value + ":a").statusCode())
                    .as("key " + value)
                    .isEqualTo(400);
            assertThat(search(s, "sort", "x." + value).statusCode())
                    .as("sort " + value)
                    .isEqualTo(400);
        }
        assertThat(contacts.count(s.group())).isEqualTo(2);
        assertThat(found(s, "q", "novak")).containsExactly("Janez Novak");
        assertThat(totalFor(s)).isEqualTo(2);
    }

    @Test
    void unknownExtraParametersAreIgnored() throws Exception {
        Scenario s = scenario();
        add(s, "Janez", "Novak");
        add(s, "Mojca", "Kralj");

        assertThat(found(s, "foo", "bar", "lang", "en", "q", "novak")).containsExactly("Janez Novak");
    }
}
