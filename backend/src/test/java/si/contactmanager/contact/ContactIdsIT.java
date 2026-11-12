package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.BulkApiTest;
import si.contactmanager.contact.support.ContactSearchClient;

/**
 * »Izberi vse zadetke«: {@code GET …/contact-ids} (FR-009-03, FR-009-04; contracts/openapi.yaml – ContactIds): zadetki
 * iskanja in filtrov 008, meja 10 000, samo identitete te skupine.
 */
class ContactIdsIT extends BulkApiTest {

    private Map<String, Object> ok(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json(response.body());
    }

    @Test
    @Tag("FR-009-03")
    void returnsExactlyTheIdentitiesOfAllMatchesOfTheFilter() throws Exception {
        Scenario s = scenario();
        List<UUID> tagged = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 312, List.of("konferenca2025"), Map.of());
        contacts.insertMany(s.group(), s.id(Who.OWNER), 20);

        Map<String, Object> answer = ok(contactIds(s.token(Who.VIEWER), s.group(), "tag", "konferenca2025"));

        assertThat(answer.get("total")).isEqualTo(312);
        assertThat(answer.get("truncated")).isEqualTo(false);
        List<String> ids = asStrings(answer.get("ids"));
        assertThat(ids).hasSize(312).doesNotHaveDuplicates();
        assertThat(new HashSet<>(ids)).isEqualTo(new HashSet<>(ids(tagged)));
    }

    @Test
    @Tag("FR-009-03")
    void searchTextAndFieldFiltersHaveTheSameMeaningAsInTheList() throws Exception {
        Scenario s = scenario();
        UUID novak = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak", "janez@feri.si", null, null);
        UUID kralj = contacts.insert(s.group(), s.id(Who.OWNER), "Mojca", "Kralj", "mojca@feri.si", null, null);
        contacts.insert(s.group(), s.id(Who.OWNER), "Peter", "Horvat", "peter@primer.si", null, null);

        Map<String, Object> byText = ok(contactIds(s.token(Who.VIEWER), s.group(), "q", "novak"));
        Map<String, Object> byField = ok(contactIds(s.token(Who.VIEWER), s.group(), "f", "email:feri.si"));

        assertThat(byText.get("total")).isEqualTo(1);
        assertThat(asStrings(byText.get("ids"))).containsExactly(novak.toString());
        assertThat(byField.get("total")).isEqualTo(2);
        assertThat(asStrings(byField.get("ids"))).containsExactlyInAnyOrder(novak.toString(), kralj.toString());
    }

    @Test
    @Tag("FR-009-03")
    void withoutParametersAllContactsOfTheGroupAreReturned() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 30);

        Map<String, Object> answer = ok(contactIds(s.token(Who.VIEWER), s.group()));

        assertThat(answer.get("total")).isEqualTo(30);
        assertThat(new HashSet<>(asStrings(answer.get("ids")))).isEqualTo(new HashSet<>(ids(all)));
    }

    @Test
    @Tag("FR-009-03")
    void contactsOfAnotherGroupAreNeverReturned() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        List<UUID> mine = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 3, List.of("konferenca2025"), Map.of());
        List<UUID> foreign = contacts.insertManyWithTagsAndAttributes(
                other, s.id(Who.OWNER), 5, List.of("konferenca2025"), Map.of());

        Map<String, Object> answer = ok(contactIds(s.token(Who.OWNER), s.group(), "tag", "konferenca2025"));

        assertThat(answer.get("total")).isEqualTo(3);
        Set<String> returned = new HashSet<>(asStrings(answer.get("ids")));
        assertThat(returned).isEqualTo(new HashSet<>(ids(mine)));
        assertThat(returned).doesNotContainAnyElementsOf(ids(foreign));
    }

    @Test
    @Tag("FR-009-04")
    void tenThousandMatchesAreReturnedInFull() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 10_000, List.of("konferenca2025"), Map.of());

        Map<String, Object> answer = ok(contactIds(s.token(Who.EDITOR), s.group(), "tag", "konferenca2025"));

        assertThat(answer.get("total")).isEqualTo(10_000);
        assertThat(answer.get("truncated")).isEqualTo(false);
        assertThat(new HashSet<>(asStrings(answer.get("ids")))).isEqualTo(new HashSet<>(ids(all)));
    }

    @Test
    @Tag("FR-009-04")
    void moreThanTenThousandMatchesGiveTotalTruncatedAndNoIdentities() throws Exception {
        Scenario s = scenario();
        contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 10_001, List.of("konferenca2025"), Map.of());

        Map<String, Object> answer = ok(contactIds(s.token(Who.EDITOR), s.group(), "tag", "konferenca2025"));

        assertThat(answer.get("total")).isEqualTo(10_001);
        assertThat(answer.get("truncated")).isEqualTo(true);
        assertThat(asStrings(answer.get("ids"))).isEmpty();
    }

    @Test
    @Tag("FR-009-03")
    void anInvalidFilterIsRejectedWithTheFieldErrorOf008() throws Exception {
        Scenario s = scenario();
        contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        HttpResponse<String> response = contactIds(s.token(Who.VIEWER), s.group(), "f", "foo:x");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(ContactSearchClient.errors(response.body())).containsEntry("f[0]", "UNKNOWN_FIELD");
    }

    @Test
    @Tag("FR-009-03")
    void pagingAndSortingParametersDoNotChangeTheResult() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 60);

        Map<String, Object> answer = ok(contactIds(
                s.token(Who.VIEWER), s.group(), "page", "2", "size", "25", "sort", "lastName", "dir", "desc"));

        assertThat(answer.get("total")).isEqualTo(60);
        assertThat(answer.get("truncated")).isEqualTo(false);
        assertThat(new HashSet<>(asStrings(answer.get("ids")))).isEqualTo(new HashSet<>(ids(all)));
    }

    @Test
    @Tag("FR-009-03")
    void searchTextOverTwoHundredCharactersAndMoreThanThirtyTagsAreRejectedByTheRulesOf008() throws Exception {
        Scenario s = scenario();
        contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        HttpResponse<String> longText = contactIds(s.token(Who.VIEWER), s.group(), "q", "a".repeat(201));
        String[] tags = new String[62];
        for (int i = 0; i < 31; i++) {
            tags[2 * i] = "tag";
            tags[2 * i + 1] = "t" + i;
        }
        HttpResponse<String> manyTags = contactIds(s.token(Who.VIEWER), s.group(), tags);

        assertThat(longText.statusCode()).isEqualTo(400);
        assertThat(ContactSearchClient.errors(longText.body())).containsEntry("q", "TOO_LONG");
        assertThat(manyTags.statusCode()).isEqualTo(400);
        assertThat(ContactSearchClient.errors(manyTags.body())).containsEntry("tag", "TOO_MANY");
    }

    @Test
    @Tag("FR-009-03")
    void everyRoleReadsTheSameAnswerInAnArchivedGroup() throws Exception {
        Scenario s = scenario();
        contacts.insertManyWithTagsAndAttributes(s.group(), s.id(Who.OWNER), 7, List.of("vip"), Map.of());
        Map<String, Object> active = ok(contactIds(s.token(Who.VIEWER), s.group(), "tag", "vip"));
        groups.archive(s.group());

        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            Map<String, Object> answer = ok(contactIds(s.token(who), s.group(), "tag", "vip"));
            assertThat(answer.get("total")).as(who.name()).isEqualTo(7);
            assertThat(new HashSet<>(asStrings(answer.get("ids"))))
                    .as(who.name())
                    .isEqualTo(new HashSet<>(asStrings(active.get("ids"))));
        }
    }
}
