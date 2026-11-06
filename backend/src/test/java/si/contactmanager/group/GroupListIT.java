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
 * Seznam mojih nearhiviranih skupin po vlogah {@code GET /api/groups} (FR-002-04, FR-002-05, FR-002-06; plan.md – REST
 * endpoints): vrstni red razdelkov, paginacija po razdelkih, abecedni red po jeziku vmesnika (ICU, D-28).
 */
class GroupListIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {};

    private static List<Map<String, Object>> sections(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("status seznama skupin").isEqualTo(200);
        return JSON.convertValue(json(response.body()).get("sections"), LIST);
    }

    private static List<Map<String, Object>> items(Map<String, Object> section) {
        return JSON.convertValue(section.get("items"), LIST);
    }

    private static List<String> titles(Map<String, Object> section) {
        return items(section).stream().map(item -> (String) item.get("title")).toList();
    }

    @Test
    @Tag("FR-002-05")
    void userWithoutGroupsGetsNoSections() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = get("/api/groups", ana.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).isEqualTo(Map.of("sections", List.of()));
    }

    @Test
    @Tag("FR-002-05")
    void userWithoutProfileGetsNoSections() throws Exception {
        SignedIn fresh = newGoogleUser("Brez profila");

        HttpResponse<String> response = get("/api/groups", fresh.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).isEqualTo(Map.of("sections", List.of()));
    }

    @Test
    @Tag("FR-002-04")
    @Tag("FR-002-06")
    void groupsAreGroupedByRoleInFixedOrderWithoutArchivedOrForeignGroups() throws Exception {
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

        HttpResponse<String> response = get("/api/groups?lang=sl", ana.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        List<Map<String, Object>> sections = sections(response);
        assertThat(sections).extracting(s -> s.get("role")).containsExactly("OWNER", "ADMIN", "VIEWER");
        assertThat(sections).extracting(s -> s.get("total")).containsExactly(2, 1, 1);
        assertThat(sections).extracting(s -> s.get("page")).containsOnly(0);
        assertThat(sections).extracting(s -> s.get("size")).containsOnly(25);
        assertThat(titles(sections.get(0))).containsExactly("Alfa", "Beta");
        assertThat(titles(sections.get(1))).containsExactly("Cvet");
        assertThat(titles(sections.get(2))).containsExactly("Delta");
        Map<String, Object> beta = items(sections.get(0)).get(1);
        assertThat(beta)
                .containsOnlyKeys("id", "title", "description", "color", "contactCount")
                .containsEntry("description", "Opis B")
                .containsEntry("color", "mah")
                .containsEntry("contactCount", 0);
        assertThat(UUID.fromString((String) beta.get("id"))).isNotNull();
    }

    @Test
    @Tag("FR-002-04")
    void eachSectionIsPaginatedSeparately() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        for (int i = 1; i <= 30; i++) {
            fixtures.createGroup(anaId, "Skupina %02d".formatted(i));
        }

        Map<String, Object> first =
                sections(get("/api/groups?lang=sl", ana.idToken())).getFirst();
        HttpResponse<String> secondResponse = get("/api/groups?role=OWNER&page=1&lang=sl", ana.idToken());
        Map<String, Object> second = sections(secondResponse).getFirst();

        assertThat(first)
                .containsEntry("role", "OWNER")
                .containsEntry("total", 30)
                .containsEntry("page", 0);
        assertThat(items(first)).hasSize(25);
        assertThat(secondResponse.statusCode()).isEqualTo(200);
        assertThat(sections(secondResponse)).hasSize(1);
        assertThat(second).containsEntry("total", 30).containsEntry("page", 1).containsEntry("size", 25);
        List<String> all = new ArrayList<>(titles(first));
        all.addAll(titles(second));
        assertThat(all)
                .containsExactlyElementsOf(IntStream.rangeClosed(1, 30)
                        .mapToObj("Skupina %02d"::formatted)
                        .toList());

        Map<String, Object> ten =
                sections(get("/api/groups?size=10&lang=sl", ana.idToken())).getFirst();
        assertThat(items(ten)).hasSize(10);
        assertThat(ten).containsEntry("size", 10).containsEntry("total", 30);
    }

    @Test
    @Tag("FR-002-04")
    void sectionForARoleWithoutGroupsIsEmpty() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        fixtures.createGroup(fixtures.userId(ana.uid()), "Samo lastnik");

        HttpResponse<String> response = get("/api/groups?role=EDITOR", ana.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(sections(response)).isEmpty();
    }

    @Test
    @Tag("FR-002-04")
    void titlesAreSortedByTheRulesOfTheInterfaceLanguage() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        for (String title : List.of("Zebra", "Šola", "Cesta", "Žaba", "Dom", "Čebela", "Sova")) {
            fixtures.createGroup(anaId, title);
        }

        List<String> slovenian =
                titles(sections(get("/api/groups?lang=sl", ana.idToken())).getFirst());
        List<String> english =
                titles(sections(get("/api/groups?lang=en", ana.idToken())).getFirst());

        assertThat(slovenian).containsExactly("Cesta", "Čebela", "Dom", "Sova", "Šola", "Zebra", "Žaba");
        assertThat(english).containsExactly("Čebela", "Cesta", "Dom", "Šola", "Sova", "Žaba", "Zebra");
    }

    @Test
    @Tag("FR-002-04")
    void equalTitlesArePagedStablyWithoutDuplicatesOrGaps() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        long anaId = fixtures.userId(ana.uid());
        Set<UUID> created = new HashSet<>();
        for (int i = 0; i < 30; i++) {
            created.add(fixtures.createGroup(anaId, "Enak naslov"));
        }

        Set<Object> seen = new HashSet<>();
        for (int page = 0; page < 2; page++) {
            Map<String, Object> section = sections(
                            get("/api/groups?role=OWNER&page=" + page + "&lang=sl", ana.idToken()))
                    .getFirst();
            items(section).forEach(item -> assertThat(seen.add(item.get("id"))).isTrue());
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
        "page=-1&role=OWNER, page",
        "role=OWNERX, role",
        "lang=de, lang",
        "page=1, page"
    })
    @Tag("FR-002-04")
    void invalidParametersAreRejected(String query, String field) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = get("/api/groups?" + query, ana.idToken());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body()))
                .containsEntry("code", "VALIDATION_FAILED")
                .containsEntry("errors", List.of(Map.of("field", field, "code", "INVALID_VALUE")));
    }
}
