package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.apikey.support.ApiV1Test;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;

/** Seznam skupin prek API ključa (FR-019-06, -09): obseg ključa, članstvo ob zahtevi, paginacija. */
@Tag("FR-019-06")
@Tag("FR-019-09")
class ApiGroupIT extends ApiV1Test {

    private static List<Map<String, Object>> items(String body) {
        return asObjects(json(body).get("items"));
    }

    private static List<String> titles(String body) {
        return items(body).stream().map(item -> (String) item.get("title")).toList();
    }

    @Test
    void keyForOneGroupListsOnlyThatGroupWithDataAndUsersRole() throws Exception {
        Scenario s = scenario();
        groups.createGroup(s.id(Who.EDITOR), "Druga skupina");
        groups.addMember(groups.createGroup(s.id(Who.OWNER), "Neizbrana", null, "mah"), s.id(Who.EDITOR), "EDITOR");
        String key = keyFor(s, Who.EDITOR, Permission.READ, s.group());

        HttpResponse<String> response = v1("GET", groupsV1(), key);

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> page = json(response.body());
        assertThat(page).containsOnlyKeys("total", "page", "size", "items");
        assertThat(((Number) page.get("total")).longValue()).isEqualTo(1);
        assertThat(page).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(items(response.body())).hasSize(1);
        Map<String, Object> group = items(response.body()).getFirst();
        assertThat(group).containsOnlyKeys("id", "title", "description", "color", "archived", "role");
        assertThat(group)
                .containsEntry("id", s.group().toString())
                .containsEntry("title", "Projekt FERI")
                .containsEntry("color", "mah")
                .containsEntry("archived", false)
                .containsEntry("role", "EDITOR");
        assertThat(group.get("description")).isNull();
    }

    @Test
    void allMyGroupsKeyIncludesGroupsCreatedLaterAndArchivedOnes() throws Exception {
        Scenario s = scenario();
        String key = allKey(s, Who.OWNER, Permission.READ);
        assertThat(titles(v1("GET", groupsV1(), key).body())).containsExactly("Projekt FERI");

        UUID later = groups.createGroup(s.id(Who.OWNER), "Pozneje ustvarjena");
        groups.archive(later);
        HttpResponse<String> response = v1("GET", groupsV1(), key);

        assertThat(titles(response.body())).containsExactly("Pozneje ustvarjena", "Projekt FERI");
        Map<String, Object> archived = items(response.body()).getFirst();
        assertThat(archived).containsEntry("archived", true).containsEntry("role", "OWNER");
    }

    @Test
    void removedMemberNoLongerSeesTheGroupAndOtherGroupsStillWork() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga");
        groups.addMember(other, s.id(Who.VIEWER), "VIEWER");
        String key = keyFor(s, Who.VIEWER, Permission.READ, s.group(), other);
        assertThat(titles(v1("GET", groupsV1(), key).body())).containsExactly("Druga", "Projekt FERI");

        jdbc.update("delete from group_member where group_id = ? and user_id = ?", s.group(), s.id(Who.VIEWER));
        HttpResponse<String> response = v1("GET", groupsV1(), key);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(titles(response.body())).containsExactly("Druga");
    }

    @Test
    void groupsArePagedAndSortedByTitle() throws Exception {
        Scenario s = scenario();
        groups.createGroup(s.id(Who.OWNER), "Alfa");
        groups.createGroup(s.id(Who.OWNER), "Beta");
        String key = allKey(s, Who.OWNER, Permission.READ);

        HttpResponse<String> first = v1("GET", groupsV1() + "?page=0&size=2", key);
        HttpResponse<String> second = v1("GET", groupsV1() + "?page=1&size=2", key);

        assertThat(titles(first.body())).containsExactly("Alfa", "Beta");
        assertThat(titles(second.body())).containsExactly("Projekt FERI");
        assertThat(json(first.body())).containsEntry("size", 2);
        assertThat(((Number) json(second.body()).get("total")).longValue()).isEqualTo(3);
    }

    @Test
    void sizeAboveHundredOrInvalidPageIsAValidationError() throws Exception {
        Scenario s = scenario();
        String key = allKey(s, Who.OWNER, Permission.READ);

        for (String query : List.of("?size=101", "?size=0", "?page=-1", "?page=x")) {
            HttpResponse<String> response = v1("GET", groupsV1() + query, key);
            assertThat(response.statusCode()).as(query).isEqualTo(400);
            assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        }
        assertThat(v1("GET", groupsV1() + "?size=100", key).statusCode()).isEqualTo(200);
    }
}
