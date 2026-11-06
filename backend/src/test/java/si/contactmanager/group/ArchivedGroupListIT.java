package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/**
 * Seznam arhiviranih skupin {@code GET /api/groups/archived} (FR-003-02, FR-003-07, FR-003-08; plan.md – REST
 * endpoints): samo arhivirane skupine članstva, en seznam z vlogo, abecedni red po jeziku (ICU, D-28), paginacija.
 */
class ArchivedGroupListIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {};

    private static List<Map<String, Object>> items(Map<String, Object> page) {
        return JSON.convertValue(page.get("items"), LIST);
    }

    private static List<String> titles(Map<String, Object> page) {
        return items(page).stream().map(item -> (String) item.get("title")).toList();
    }

    private Map<String, Object> archived(String token, String query) throws Exception {
        HttpResponse<String> response = get("/api/groups/archived" + query, token);
        assertThat(response.statusCode()).as("status seznama arhiviranih").isEqualTo(200);
        return json(response.body());
    }

    @Test
    @Tag("FR-003-07")
    void onlyArchivedGroupsOfTheUsersMembershipsAreListedWithTheirRole() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        long anaId = fixtures.userId(ana.uid());
        long bojanId = fixtures.userId(bojan.uid());
        UUID own = fixtures.createGroup(anaId, "Moja arhivirana", "Opis", "morje");
        UUID asEditor = fixtures.createGroup(bojanId, "Konferenca 2025");
        fixtures.addMember(asEditor, anaId, "EDITOR");
        fixtures.createGroup(anaId, "Aktivna");
        UUID foreign = fixtures.createGroup(bojanId, "Tuja arhivirana");
        fixtures.archive(own);
        fixtures.archive(asEditor);
        fixtures.archive(foreign);

        Map<String, Object> page = archived(ana.idToken(), "");

        assertThat(page).containsEntry("total", 2).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(titles(page)).containsExactly("Konferenca 2025", "Moja arhivirana");
        assertThat(items(page).get(0))
                .containsEntry("id", asEditor.toString())
                .containsEntry("role", "EDITOR")
                .containsEntry("permanentlyArchived", false)
                .containsEntry("contactCount", 0);
        assertThat(items(page).get(1))
                .containsEntry("role", "OWNER")
                .containsEntry("description", "Opis")
                .containsEntry("color", "morje");
    }

    @Test
    @Tag("FR-003-07")
    void userWithoutArchivedGroupsOrProfileGetsAnEmptyList() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn withoutProfile = newGoogleUser("Brez Profila");

        assertThat(items(archived(ana.idToken(), ""))).isEmpty();
        Map<String, Object> page = archived(withoutProfile.idToken(), "");
        assertThat(page).containsEntry("total", 0);
        assertThat(items(page)).isEmpty();
    }

    @Test
    @Tag("FR-003-08")
    void permanentlyArchivedGroupIsMarkedAsSuch() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Bralka");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Brez lastnika");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "VIEWER");
        UUID normal = fixtures.createGroup(fixtures.userId(eva.uid()), "Z lastnikom");
        fixtures.archive(normal);
        fixtures.makePermanentlyArchived(group);

        List<Map<String, Object>> rows = items(archived(eva.idToken(), ""));

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0)).containsEntry("title", "Brez lastnika").containsEntry("permanentlyArchived", true);
        assertThat(rows.get(0)).containsEntry("role", "VIEWER");
        assertThat(rows.get(1)).containsEntry("title", "Z lastnikom").containsEntry("permanentlyArchived", false);
    }

    @Test
    @Tag("FR-003-07")
    void titlesFollowTheLanguageRulesOfTheInterface() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        for (String title : List.of("Zebra", "Šola", "Cesta", "Žaba", "Dom", "Čebela", "Sova")) {
            fixtures.archive(fixtures.createGroup(anaId, title));
        }

        assertThat(titles(archived(ana.idToken(), "?lang=sl")))
                .containsExactly("Cesta", "Čebela", "Dom", "Sova", "Šola", "Zebra", "Žaba");
        assertThat(titles(archived(ana.idToken(), "?lang=en")))
                .containsExactly("Čebela", "Cesta", "Dom", "Šola", "Sova", "Žaba", "Zebra");
    }

    @Test
    @Tag("FR-003-07")
    void listIsPaginated() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        IntStream.rangeClosed(1, 30)
                .forEach(n -> fixtures.archive(fixtures.createGroup(anaId, "Skupina %03d".formatted(n))));

        Map<String, Object> first = archived(ana.idToken(), "");
        Map<String, Object> second = archived(ana.idToken(), "?page=1");
        Map<String, Object> big = archived(ana.idToken(), "?size=50");

        assertThat(first).containsEntry("total", 30).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(items(first)).hasSize(25);
        assertThat(titles(second))
                .containsExactly("Skupina 026", "Skupina 027", "Skupina 028", "Skupina 029", "Skupina 030");
        assertThat(second).containsEntry("page", 1);
        assertThat(items(big)).hasSize(30);
    }

    @ParameterizedTest
    @CsvSource({"size=0, size", "size=101, size", "size=abc, size", "page=-1, page", "lang=de, lang"})
    @Tag("FR-003-07")
    void invalidParametersAreRejected(String query, String field) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = get("/api/groups/archived?" + query, ana.idToken());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(response.body()).contains("\"" + field + "\"");
    }
}
