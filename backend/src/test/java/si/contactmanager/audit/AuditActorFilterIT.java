package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.HistoryApiTest;

/** Filter sledi po izvajalcu in seznam izvajalcev (FR-015-01 … FR-015-04, FR-015-21): člani, nekdanji člani, izbrisan uporabnik. */
class AuditActorFilterIT extends HistoryApiTest {

    private record Trail(
            Scenario s, Map<String, Object> byEditor, Map<String, Object> byAdmin, Map<String, Object> byOwner) {}

    private Trail trail() throws Exception {
        Scenario s = scenario();
        Map<String, Object> byEditor = create(s, Who.EDITOR, contactInput("Eva", "Urednikova", "+38690111111"));
        Map<String, Object> byAdmin = create(s, Who.ADMIN, contactInput("Aleš", "Adminov", "+38690222222"));
        Map<String, Object> byOwner = create(s, Who.OWNER, contactInput("Lea", "Lastnikova", "+38690333333"));
        update(s, Who.EDITOR, idOf(byAdmin), withPhone(byAdmin, "+38631000111"), versionOf(byAdmin));
        return new Trail(s, byEditor, byAdmin, byOwner);
    }

    private List<Map<String, Object>> actors(Scenario s) throws Exception {
        HttpResponse<String> response = get(actorsPath(s.group()), s.token(Who.VIEWER));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return asObjects(json(response.body()).get("items"));
    }

    private String tokenOf(List<Map<String, Object>> actors, String email) {
        return actors.stream()
                .filter(a -> a.get("user") != null
                        && email.equals(asObject(a.get("user")).get("email")))
                .map(a -> (String) a.get("id"))
                .findFirst()
                .orElseThrow();
    }

    private List<Map<String, Object>> entries(Scenario s, String query) throws Exception {
        HttpResponse<String> response = list(s, Who.VIEWER, query);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return asObjects(json(response.body()).get("items"));
    }

    @Test
    @Tag("FR-015-03")
    void theActorsOfTheTrailAreTheMembersWhoWroteEntriesWithOpaqueTokens() throws Exception {
        Trail t = trail();

        HttpResponse<String> response = get(actorsPath(t.s().group()), t.s().token(Who.VIEWER));
        List<Map<String, Object>> actors = asObjects(json(response.body()).get("items"));

        assertThat(actors).hasSize(3);
        assertThat(actors).extracting(a -> a.get("kind")).containsOnly("MEMBER");
        assertThat(actors)
                .extracting(a -> asObject(a.get("user")).get("email"))
                .containsExactlyInAnyOrder(
                        groups.email(t.s().users().get(Who.EDITOR).uid()),
                        groups.email(t.s().users().get(Who.ADMIN).uid()),
                        groups.email(t.s().users().get(Who.OWNER).uid()));
        for (Who who : List.of(Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            assertThat(response.body()).doesNotContain("\"id\":" + t.s().id(who) + ",");
        }
        assertThat(actors)
                .allSatisfy(
                        a -> assertThat(UUID.fromString((String) a.get("id"))).isNotNull());
    }

    @Test
    @Tag("FR-015-01")
    @Tag("FR-015-02")
    void filteringByActorShowsOnlyHisEntriesAlsoCombinedWithActionAndContact() throws Exception {
        Trail t = trail();
        String editor = tokenOf(
                actors(t.s()), groups.email(t.s().users().get(Who.EDITOR).uid()));

        List<Map<String, Object>> mine = entries(t.s(), "?actor=" + editor);
        List<Map<String, Object>> onlyUpdates = entries(t.s(), "?actor=" + editor + "&action=UPDATE");
        List<Map<String, Object>> onlyCreates = entries(t.s(), "?actor=" + editor + "&action=CREATE");
        List<Map<String, Object>> forContact = entries(t.s(), "?actor=" + editor + "&contact=" + idOf(t.byAdmin()));
        List<Map<String, Object>> otherContact = entries(t.s(), "?actor=" + editor + "&contact=" + idOf(t.byOwner()));

        assertThat(mine).extracting(e -> e.get("action")).containsExactly("UPDATE", "CREATE");
        assertThat(onlyUpdates).hasSize(1);
        assertThat(onlyCreates).hasSize(1);
        assertThat(forContact).extracting(e -> e.get("action")).containsExactly("UPDATE");
        assertThat(otherContact).isEmpty();
        Map<String, Object> page =
                json(list(t.s(), Who.VIEWER, "?actor=" + editor).body());
        assertThat(page.get("total")).isEqualTo(2);
        assertThat(asObject(page.get("actorFilter")).get("id")).isEqualTo(editor);
        // Najnovejši vnos celotne sledi ostane nefiltriran (FR-015-04).
        assertThat(page.get("latestEntryId"))
                .isEqualTo(audit.latestEntryId(t.s().group()).toString());
    }

    @Test
    @Tag("FR-015-03")
    void aFormerMemberStaysSelectableAndLabelled() throws Exception {
        Trail t = trail();
        String adminEmail = groups.email(t.s().users().get(Who.ADMIN).uid());
        jdbc.update("delete from group_member where group_id = ? and user_id = ?", t.s().group(), t.s().id(Who.ADMIN));

        List<Map<String, Object>> actors = actors(t.s());

        Map<String, Object> former = actors.stream()
                .filter(a -> "FORMER".equals(a.get("kind")))
                .findFirst()
                .orElseThrow();
        assertThat(asObject(former.get("user")).get("email")).isEqualTo(adminEmail);
        assertThat(actors.get(actors.size() - 1)).isSameAs(former);
        List<Map<String, Object>> his = entries(t.s(), "?actor=" + former.get("id"));
        assertThat(his)
                .hasSize(1)
                .first()
                .satisfies(e -> assertThat(e.get("contactName")).isEqualTo("Aleš Adminov"));
    }

    @Test
    @Tag("FR-015-01")
    @Tag("FR-015-03")
    void deletedUsersAreOneEntryAndTheirEntriesAreFilterable() throws Exception {
        Trail t = trail();
        jdbc.update("delete from app_user where id = ?", t.s().id(Who.OWNER));

        List<Map<String, Object>> actors = actors(t.s());

        assertThat(actors).extracting(a -> a.get("kind")).contains("DELETED");
        Map<String, Object> deleted = actors.get(actors.size() - 1);
        assertThat(deleted.get("id")).isEqualTo("deleted");
        assertThat(deleted.get("user")).isNull();
        List<Map<String, Object>> entries = entries(t.s(), "?actor=deleted");
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).get("actor")).isNull();
        assertThat(entries(t.s(), "?actor=deleted&action=UPDATE")).isEmpty();
    }

    @Test
    @Tag("FR-015-03")
    @Tag("FR-015-21")
    void aTokenOfAnotherGroupOrAnUnknownOneYieldsAnEmptyListAndAMalformedOneIsRejected() throws Exception {
        Trail t = trail();
        Trail other = trail();
        String foreign = tokenOf(
                actors(other.s()),
                groups.email(other.s().users().get(Who.EDITOR).uid()));

        assertThat(entries(t.s(), "?actor=" + foreign)).isEmpty();
        assertThat(entries(t.s(), "?actor=" + UUID.randomUUID())).isEmpty();
        assertThat(entries(t.s(), "?actor=deleted")).isEmpty();
        assertThat(list(t.s(), Who.VIEWER, "?actor=nonsense").statusCode()).isEqualTo(400);
        assertThat(actors(t.s()).toString())
                .doesNotContain(groups.email(other.s().users().get(Who.EDITOR).uid()));
    }
}
