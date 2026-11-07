package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;

/** Predlogi značk skupine prek {@code GET /api/groups/{groupId}/tags?q=} (FR-004-04). */
@Tag("FR-004-04")
class ContactTagSuggestionsIT extends ContactApiTest {

    private static String tagsPath(UUID group, String query) {
        return "/api/groups/" + group + "/tags" + query;
    }

    private static List<String> tags(HttpResponse<String> response) {
        return asStrings(json(response.body()).get("tags"));
    }

    private void tag(UUID group, long user, String first, String... tags) {
        UUID id = contacts.insert(group, user, first, "Test");
        for (int i = 0; i < tags.length; i++) {
            contacts.addTag(id, i, tags[i]);
        }
    }

    @Test
    void suggestsOnlyTagsOfThisGroupStartingWithTheQueryIgnoringCaseSorted() throws Exception {
        Scenario a = scenario();
        UUID b = groups.createGroup(a.id(Who.OWNER), "Skupina B");
        tag(a.group(), a.id(Who.OWNER), "Ana", "vip", "ne_obveščaj");
        tag(a.group(), a.id(Who.OWNER), "Bojan", "VIP2", "konferenca2025");
        tag(b, a.id(Who.OWNER), "Cene", "tajno", "vizija");

        HttpResponse<String> byV = get(tagsPath(a.group(), "?q=v"), a.token(Who.EDITOR));
        HttpResponse<String> byT = get(tagsPath(a.group(), "?q=t"), a.token(Who.EDITOR));
        HttpResponse<String> bySecretGroup = get(tagsPath(b, "?q=t"), a.token(Who.OWNER));

        assertThat(byV.statusCode()).isEqualTo(200);
        assertThat(json(byV.body())).containsOnlyKeys("tags");
        assertThat(tags(byV)).containsExactly("vip", "VIP2");
        assertThat(tags(byT)).isEmpty();
        assertThat(tags(bySecretGroup)).containsExactly("tajno");
    }

    @Test
    void tagDifferingOnlyInCaseIsOneSuggestionInTheExistingForm() throws Exception {
        Scenario s = scenario();
        tag(s.group(), s.id(Who.OWNER), "Ana", "Konferenca");
        tag(s.group(), s.id(Who.OWNER), "Bojan", "konferenca");

        HttpResponse<String> response = get(tagsPath(s.group(), "?q=KON"), s.token(Who.EDITOR));

        // research R-07: prikazana je oblika z najstarejšim kontaktom.
        assertThat(tags(response)).containsExactly("Konferenca");
    }

    @Test
    void tagDifferingOnlyInCaseFromAnExistingGroupTagIsAllowedOnANewContact() throws Exception {
        Scenario s = scenario();
        tag(s.group(), s.id(Who.OWNER), "Ana", "vip");

        Map<String, Object> created = createViaApi(s, withTags("Bojan", "VIP"));

        assertThat(created).containsEntry("tags", List.of("VIP"));
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    @Test
    void withoutQueryAtMostTwentyDistinctTagsAreReturned() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 25; i++) {
            tag(s.group(), s.id(Who.OWNER), "Kontakt " + i, "tag" + String.format("%02d", i));
        }

        HttpResponse<String> response = get(tagsPath(s.group(), ""), s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(tags(response)).hasSize(20).doesNotHaveDuplicates().startsWith("tag00", "tag01");
    }

    @Test
    void deletedLastContactWithATagRemovesTheSuggestion() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createViaApi(s, withTags("Janez", "edinstvena"));
        UUID id = UUID.fromString((String) created.get("id"));
        assertThat(tags(get(tagsPath(s.group(), "?q=edin"), s.token(Who.EDITOR))))
                .containsExactly("edinstvena");

        assertThat(delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);

        assertThat(tags(get(tagsPath(s.group(), "?q=edin"), s.token(Who.EDITOR))))
                .isEmpty();
    }

    private Map<String, Object> withTags(String first, String... tags) {
        Map<String, Object> input = input(first, "Test");
        input.put("tags", List.of(tags));
        return input;
    }

    @Test
    void editorAdminAndOwnerMayAskViewerMayNot() throws Exception {
        Scenario s = scenario();
        tag(s.group(), s.id(Who.OWNER), "Ana", "vip");

        for (Who who : List.of(Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            assertThat(get(tagsPath(s.group(), "?q=v"), s.token(who)).statusCode())
                    .as(who.name())
                    .isEqualTo(200);
        }
        assertThat(get(tagsPath(s.group(), "?q=v"), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(403);
        assertThat(get(tagsPath(s.group(), "?q=v"), s.token(Who.NON_MEMBER)).statusCode())
                .isEqualTo(404);
    }
}
