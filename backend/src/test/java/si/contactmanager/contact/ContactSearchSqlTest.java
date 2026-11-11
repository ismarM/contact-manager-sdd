package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.ContactQuery.Condition;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ContactQuery.Field;
import si.contactmanager.contact.ContactQuery.Kind;
import si.contactmanager.contact.ContactSearch.Sql;

/**
 * Varno sestavljanje poizvedb (research R-13; FR-008-14, FR-008-16): besedilo SQL je odvisno samo od <b>oblike</b>
 * poizvedbe (število besed, pogojev in značk, vrsta polj, smer), nikoli od vrednosti iz vnosa; vrednosti so parametri.
 * Test preverja to lastnost, ne notranje zgradbe SQL.
 */
@Tag("FR-008-14")
@Tag("FR-008-16")
class ContactSearchSqlTest {

    private static final UUID GROUP = UUID.fromString("0193c4a2-7a1f-7c3e-9b1a-c0ffee000001");

    /** Dolge vrednosti: njihov podniz ne sme biti v nobenem besedilu SQL. */
    private static final List<String> HOSTILE_LONG = List.of(
            "'; DROP TABLE contact;--", "\" OR 1=1 --", "x') OR ('1'='1", "a.b:c%25d", "COLLATE \"C\"", "ORDER BY 1");

    /** Z enojnimi znaki (veljavno besedilo SQL vsebuje npr. podčrtaje): preverjeno samo kot vrednosti parametrov. */
    private static final List<String> HOSTILE = java.util.stream.Stream.concat(
                    HOSTILE_LONG.stream(), List.of("%", "_", "\\").stream())
            .toList();

    /** Poizvedba z dano obliko; vse vrednosti so podane z argumenti. */
    private static ContactQuery shape(String word, String conditionValue, String attributeKey, String tag, Field sort) {
        return new ContactQuery(
                List.of(word, word + "2"),
                List.of(
                        new Condition(new Field(Kind.EMAIL, null), conditionValue),
                        new Condition(new Field(Kind.ATTRIBUTE, attributeKey), conditionValue)),
                List.of(tag),
                sort,
                Direction.DESC,
                1,
                25);
    }

    private static List<Sql> both(ContactQuery query) {
        return List.of(ContactSearch.page(GROUP, query), ContactSearch.count(GROUP, query));
    }

    @Test
    void sqlTextDoesNotDependOnValuesOnlyOnTheShape() {
        List<Sql> plain = both(shape("janez", "feri", "kompetenca", "vip", new Field(Kind.ATTRIBUTE, "podjetje")));

        for (String hostile : HOSTILE) {
            List<Sql> other = both(shape(
                    hostile,
                    hostile,
                    hostile.toLowerCase(),
                    hostile.toLowerCase(),
                    new Field(Kind.ATTRIBUTE, hostile.toLowerCase())));

            assertThat(other.get(0).text())
                    .as("page: " + hostile)
                    .isEqualTo(plain.get(0).text());
            assertThat(other.get(1).text())
                    .as("count: " + hostile)
                    .isEqualTo(plain.get(1).text());
        }
    }

    @Test
    void hostileValuesAreOnlyBoundParametersNeverPartOfTheText() {
        for (String hostile : HOSTILE) {
            ContactQuery query = shape(
                    hostile,
                    hostile,
                    hostile.toLowerCase(),
                    hostile.toLowerCase(),
                    new Field(Kind.ATTRIBUTE, hostile.toLowerCase()));

            for (Sql sql : both(query)) {
                if (HOSTILE_LONG.contains(hostile)) {
                    assertThat(sql.text()).as(hostile).doesNotContain(hostile);
                }
                assertThat(sql.parameters().values()).as(hostile).contains(hostile);
            }
        }
    }

    @Test
    void pageAndSizeDoNotEnterTheSqlText() {
        ContactQuery first = new ContactQuery(
                List.of("a"), List.of(), List.of(), new Field(Kind.LAST_NAME, null), Direction.ASC, 0, 25);
        ContactQuery other = new ContactQuery(
                List.of("a"), List.of(), List.of(), new Field(Kind.LAST_NAME, null), Direction.ASC, 7, 100);

        assertThat(ContactSearch.page(GROUP, other).text())
                .isEqualTo(ContactSearch.page(GROUP, first).text());
        assertThat(ContactSearch.page(GROUP, other).parameters().values()).contains(7L * 100);
    }

    @Test
    void groupIsAlwaysABoundParameter() {
        ContactQuery empty = new ContactQuery(
                List.of(), List.of(), List.of(), new Field(Kind.LAST_NAME, null), Direction.ASC, 0, 25);

        for (Sql sql : both(empty)) {
            assertThat(sql.parameters().values()).contains(GROUP);
            assertThat(sql.text()).doesNotContain(GROUP.toString());
        }
    }

    @Test
    void differentShapeGivesDifferentText() {
        ContactQuery oneWord = new ContactQuery(
                List.of("a"), List.of(), List.of(), new Field(Kind.LAST_NAME, null), Direction.ASC, 0, 25);
        ContactQuery twoWords = new ContactQuery(
                List.of("a", "b"), List.of(), List.of(), new Field(Kind.LAST_NAME, null), Direction.ASC, 0, 25);
        ContactQuery sorted =
                new ContactQuery(List.of("a"), List.of(), List.of(), new Field(Kind.EMAIL, null), Direction.ASC, 0, 25);
        ContactQuery descending = new ContactQuery(
                List.of("a"), List.of(), List.of(), new Field(Kind.LAST_NAME, null), Direction.DESC, 0, 25);
        ContactQuery tagged = new ContactQuery(
                List.of("a"), List.of(), List.of("vip"), new Field(Kind.LAST_NAME, null), Direction.ASC, 0, 25);

        List<String> texts = new ArrayList<>();
        for (ContactQuery query : List.of(oneWord, twoWords, sorted, descending, tagged)) {
            texts.add(ContactSearch.page(GROUP, query).text());
        }

        assertThat(texts).doesNotHaveDuplicates();
    }

    @Test
    void onlyKnownCollationsAppearInTheText() {
        ContactQuery query = shape("a", "b", "c", "d", new Field(Kind.PHONE, null));
        Pattern collation = Pattern.compile("COLLATE\\s+\"?(\\w+)\"?", Pattern.CASE_INSENSITIVE);

        for (Sql sql : both(query)) {
            Matcher matcher = collation.matcher(sql.text());
            while (matcher.find()) {
                assertThat(matcher.group(1)).isIn("sort_sl", "search_fold");
            }
        }
    }
}
