package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * Seznam mojih nearhiviranih skupin {@code GET /api/groups} (FR-020-10, FR-020-11; 020 plan.md – Public Interfaces): ena
 * stran čez vse vloge z vlogo na elementu, filter {@code role}, paginacija, abecedni red po jeziku vmesnika (ICU, D-28).
 */
class GroupListIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {};

    private static Map<String, Object> page(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("status seznama skupin").isEqualTo(200);
        return json(response.body());
    }

    private static List<Map<String, Object>> items(Map<String, Object> page) {
        return JSON.convertValue(page.get("items"), LIST);
    }

    private static List<String> titles(Map<String, Object> page) {
        return items(page).stream().map(item -> (String) item.get("title")).toList();
    }

    @Test
    @Tag("FR-020-10")
    void userWithoutGroupsGetsEmptyPage() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = get("/api/groups", ana.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).isEqualTo(Map.of("total", 0, "page", 0, "size", 25, "items", List.of()));
    }

    @Test
    @Tag("FR-020-10")
    void userWithoutProfileGetsEmptyPage() throws Exception {
        SignedIn fresh = newGoogleUser("Brez profila");

        HttpResponse<String> response = get("/api/groups", fresh.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).isEqualTo(Map.of("total", 0, "page", 0, "size", 25, "items", List.of()));
    }

    @Test
    @Tag("FR-020-10")
    @Tag("FR-020-11")
    void oneListAcrossRolesSortedByTitleWithoutArchivedOrForeignGroups() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        long anaId = fixtures.userId(ana.uid());
        long bojanId = fixtures.userId(bojan.uid());
        fixtures.createGroup(anaId, "Beta", "Opis B", "mah");
        fixtures.createGroup(anaId, "Alfa", null, "tinta");
        UUID admin = fixtures.createGroup(bojanId, "Cvet");
        fixtures.addMember(admin, anaId, "ADMIN");
        UUID viewer = fixtures.createGroup(bojanId, "Delta");
        fixtures.addMember(viewer, anaId, "VIEWER");
        UUID archived = fixtures.createGroup(bojanId, "Arhivirana");
        fixtures.addMember(archived, anaId, "ADMIN");
        fixtures.archive(archived);
        fixtures.createGroup(bojanId, "Tuja");

        Map<String, Object> body = page(get("/api/groups?lang=sl", ana.idToken()));

        assertThat(body).containsEntry("total", 4).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(titles(body)).containsExactly("Alfa", "Beta", "Cvet", "Delta");
        assertThat(items(body)).extracting(i -> i.get("role")).containsExactly("OWNER", "OWNER", "ADMIN", "VIEWER");
        Map<String, Object> beta = items(body).get(1);
        assertThat(beta)
                .containsOnlyKeys("id", "title", "description", "color", "contactCount", "photoRevision", "role")
                .containsEntry("description", "Opis B")
                .containsEntry("color", "mah")
                .containsEntry("contactCount", 0);
        assertThat(UUID.fromString((String) beta.get("id"))).isNotNull();
    }

    @Test
    @Tag("FR-020-11")
    void roleFilterNarrowsTheListAndTotal() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        long anaId = fixtures.userId(ana.uid());
        long bojanId = fixtures.userId(bojan.uid());
        fixtures.createGroup(anaId, "Moja");
        UUID editor = fixtures.createGroup(bojanId, "Urejam");
        fixtures.addMember(editor, anaId, "EDITOR");

        Map<String, Object> body = page(get("/api/groups?role=EDITOR", ana.idToken()));

        assertThat(body).containsEntry("total", 1);
        assertThat(titles(body)).containsExactly("Urejam");
        assertThat(items(body).getFirst()).containsEntry("role", "EDITOR");
    }

    @Test
    @Tag("FR-020-11")
    void paginationRunsAcrossRoles() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        long anaId = fixtures.userId(ana.uid());
        long bojanId = fixtures.userId(bojan.uid());
        for (int i = 1; i <= 30; i++) {
            UUID group = fixtures.createGroup(bojanId, "Skupina %02d".formatted(i));
            if (i % 2 == 0) {
                fixtures.addMember(group, anaId, i % 4 == 0 ? "EDITOR" : "VIEWER");
            } else {
                fixtures.addMember(group, anaId, "ADMIN");
            }
        }

        Map<String, Object> first = page(get("/api/groups?lang=sl", ana.idToken()));
        Map<String, Object> second = page(get("/api/groups?page=1&lang=sl", ana.idToken()));

        assertThat(first).containsEntry("total", 30).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(items(first)).hasSize(25);
        assertThat(second).containsEntry("total", 30).containsEntry("page", 1);
        List<String> all = new ArrayList<>(titles(first));
        all.addAll(titles(second));
        assertThat(all)
                .containsExactlyElementsOf(IntStream.rangeClosed(1, 30)
                        .mapToObj("Skupina %02d"::formatted)
                        .toList());
        assertThat(items(first).stream().map(i -> i.get("role")).distinct()).hasSizeGreaterThan(1);

        Map<String, Object> ten = page(get("/api/groups?size=10&lang=sl", ana.idToken()));
        assertThat(items(ten)).hasSize(10);
        assertThat(ten).containsEntry("size", 10).containsEntry("total", 30);
    }

    @Test
    @Tag("FR-020-11")
    void pageBeyondTheEndIsEmptyWithoutRoleFilter() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        fixtures.createGroup(fixtures.userId(ana.uid()), "Edina");

        Map<String, Object> body = page(get("/api/groups?page=3", ana.idToken()));

        assertThat(body).containsEntry("total", 1).containsEntry("page", 3);
        assertThat(items(body)).isEmpty();
    }

    @Test
    @Tag("FR-020-11")
    void roleWithoutGroupsGivesEmptyPage() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        fixtures.createGroup(fixtures.userId(ana.uid()), "Samo lastnik");

        Map<String, Object> body = page(get("/api/groups?role=EDITOR", ana.idToken()));

        assertThat(body).containsEntry("total", 0);
        assertThat(items(body)).isEmpty();
    }

    @Test
    @Tag("FR-020-11")
    void titlesAreSortedByTheRulesOfTheInterfaceLanguage() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        for (String title : List.of("Zebra", "Šola", "Cesta", "Žaba", "Dom", "Čebela", "Sova")) {
            fixtures.createGroup(anaId, title);
        }

        List<String> slovenian = titles(page(get("/api/groups?lang=sl", ana.idToken())));
        List<String> english = titles(page(get("/api/groups?lang=en", ana.idToken())));

        assertThat(slovenian).containsExactly("Cesta", "Čebela", "Dom", "Sova", "Šola", "Zebra", "Žaba");
        assertThat(english).containsExactly("Čebela", "Cesta", "Dom", "Šola", "Sova", "Žaba", "Zebra");
    }

    @Test
    @Tag("FR-020-11")
    void equalTitlesArePagedStablyWithoutDuplicatesOrGaps() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        Set<UUID> created = new HashSet<>();
        for (int i = 0; i < 30; i++) {
            created.add(fixtures.createGroup(anaId, "Enak naslov"));
        }

        Set<Object> seen = new HashSet<>();
        for (int page = 0; page < 2; page++) {
            Map<String, Object> body = page(get("/api/groups?role=OWNER&page=" + page + "&lang=sl", ana.idToken()));
            items(body).forEach(item -> assertThat(seen.add(item.get("id"))).isTrue());
        }
        assertThat(seen).hasSize(30);
        assertThat(seen.stream().map(id -> UUID.fromString((String) id)).toList())
                .containsExactlyInAnyOrderElementsOf(created);
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
        "size=0, size",
        "size=101, size",
        "size=abc, size",
        "page=-1, page",
        "role=OWNERX, role",
        "lang=de, lang",
    })
    @Tag("FR-020-11")
    void invalidParametersAreRejected(String query, String field) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = get("/api/groups?" + query, ana.idToken());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body()))
                .containsEntry("code", "VALIDATION_FAILED")
                .containsEntry("errors", List.of(Map.of("field", field, "code", "INVALID_VALUE")));
    }
}
