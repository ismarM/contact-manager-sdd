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
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/**
 * Iskanje po nazivu v {@code GET /api/groups} in {@code GET /api/groups/archived} (FR-017-14, -15, -16, -18): brez
 * razlike velikosti črk in šumnikov, posebni znaki dobesedno, {@code total} = zadetki, tuje skupine se ne razkrijejo.
 */
class GroupSearchIT extends ApiTest {

    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {};

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private Map<String, Object> ok(String path, String token) throws Exception {
        HttpResponse<String> response = get(path, token);
        assertThat(response.statusCode()).as(path).isEqualTo(200);
        return json(response.body());
    }

    private static List<Map<String, Object>> sections(Map<String, Object> body) {
        return JSON.convertValue(body.get("sections"), LIST);
    }

    private static List<String> titles(Map<String, Object> holder) {
        return JSON.convertValue(holder.get("items"), LIST).stream()
                .map(item -> (String) item.get("title"))
                .toList();
    }

    @Test
    @Tag("FR-017-14")
    @Tag("FR-017-18")
    void findsGroupOnThirdPageOfOneHundredWithinTimeLimit() throws Exception {
        SignedIn ana = registeredUser("Ana Iskanje");
        long anaId = fixtures.userId(ana.uid());
        IntStream.range(0, 100).forEach(i -> fixtures.createGroup(anaId, "Skupina %03d".formatted(i)));
        fixtures.createGroup(anaId, "Šolski krožek");

        long start = System.nanoTime();
        Map<String, Object> body = ok("/api/groups?q=" + "%C5%A0olski", ana.idToken());
        long millis = (System.nanoTime() - start) / 1_000_000;

        Map<String, Object> owner = sections(body).getFirst();
        assertThat(owner).containsEntry("total", 1);
        assertThat(titles(owner)).containsExactly("Šolski krožek");
        assertThat(millis).as("SC-005: iskanje pod 300 ms").isLessThan(300);
        Map<String, Object> all = ok("/api/groups?role=OWNER&size=25&page=3&q=skupina", ana.idToken());
        assertThat(sections(all).getFirst()).containsEntry("total", 100);
        assertThat(titles(sections(all).getFirst())).hasSize(25).contains("Skupina 075");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"SOLSKI", "solski", "%C5%A0olski", "%C5%A1olSKI", "kro%C5%BEek", "krozek", "%20%20krozek%20"})
    @Tag("FR-017-14")
    void matchesWithoutCaseAndDiacritics(String q) throws Exception {
        SignedIn ana = registeredUser("Ana Črke");
        fixtures.createGroup(fixtures.userId(ana.uid()), "Šolski krožek");
        fixtures.createGroup(fixtures.userId(ana.uid()), "Druga");

        Map<String, Object> owner =
                sections(ok("/api/groups?q=" + q, ana.idToken())).getFirst();

        assertThat(titles(owner)).containsExactly("Šolski krožek");
    }

    @Test
    @Tag("FR-017-14")
    void specialCharactersAreLiteral() throws Exception {
        SignedIn ana = registeredUser("Ana Posebni");
        long anaId = fixtures.userId(ana.uid());
        fixtures.createGroup(anaId, "Navadna");
        fixtures.createGroup(anaId, "Druga skupina");

        assertThat(sections(ok("/api/groups?q=" + "%25", ana.idToken()))).isEmpty();
        fixtures.createGroup(anaId, "Popust 50% in_več \\ konec");
        assertThat(titles(sections(ok("/api/groups?q=50%25", ana.idToken())).getFirst()))
                .containsExactly("Popust 50% in_več \\ konec");
        assertThat(titles(sections(ok("/api/groups?q=in_ve", ana.idToken())).getFirst()))
                .containsExactly("Popust 50% in_več \\ konec");
        assertThat(sections(ok("/api/groups?q=_", ana.idToken())).getFirst()).containsEntry("total", 1);
        assertThat(titles(sections(ok("/api/groups?q=%5C", ana.idToken())).getFirst()))
                .containsExactly("Popust 50% in_več \\ konec");
    }

    @Test
    @Tag("FR-017-14")
    void emptyOrBlankQueryMeansNoSearchAndNoMatchIs200() throws Exception {
        SignedIn ana = registeredUser("Ana Prazno");
        fixtures.createGroup(fixtures.userId(ana.uid()), "Edina");

        assertThat(sections(ok("/api/groups?q=", ana.idToken()))).hasSize(1);
        assertThat(sections(ok("/api/groups?q=%20%20", ana.idToken()))).hasSize(1);
        assertThat(sections(ok("/api/groups?q=nicneobstaja", ana.idToken()))).isEmpty();
        assertThat(ok("/api/groups/archived?q=nicneobstaja", ana.idToken()))
                .containsEntry("total", 0)
                .containsEntry("items", List.of());
    }

    @Test
    @Tag("FR-017-14")
    void tooLongQueryIs400AndExactlyOneHundredIsAccepted() throws Exception {
        SignedIn ana = registeredUser("Ana Dolgo");

        HttpResponse<String> tooLong = get("/api/groups?q=" + "a".repeat(101), ana.idToken());
        HttpResponse<String> limit = get("/api/groups?q=" + "a".repeat(100), ana.idToken());

        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(json(tooLong.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(tooLong.body()).contains("\"field\":\"q\"").contains("INVALID_VALUE");
        assertThat(limit.statusCode()).isEqualTo(200);
        assertThat(get("/api/groups/archived?q=" + "a".repeat(101), ana.idToken())
                        .statusCode())
                .isEqualTo(400);
    }

    @Test
    @Tag("FR-017-15")
    void totalCountsMatchesPerRoleAndManyRolesAreCombined() throws Exception {
        SignedIn ana = registeredUser("Ana Vloge");
        SignedIn bojan = registeredUser("Bojan Vloge");
        long anaId = fixtures.userId(ana.uid());
        long bojanId = fixtures.userId(bojan.uid());
        fixtures.createGroup(anaId, "Planinci");
        fixtures.createGroup(anaId, "Pevci");
        UUID asEditor = fixtures.createGroup(bojanId, "Planinski vodniki");
        fixtures.addMember(asEditor, anaId, "EDITOR");
        UUID otherArchived = fixtures.createGroup(anaId, "Arhiv planincev");
        UUID viewerArchived = fixtures.createGroup(bojanId, "Planinska arhiva");
        fixtures.addMember(viewerArchived, anaId, "VIEWER");
        fixtures.archive(otherArchived);
        fixtures.archive(viewerArchived);

        List<Map<String, Object>> sections = sections(ok("/api/groups?q=planin", ana.idToken()));

        assertThat(sections).extracting(s -> s.get("role")).containsExactly("OWNER", "EDITOR");
        assertThat(sections).extracting(s -> s.get("total")).containsExactly(1, 1);
        assertThat(ok("/api/groups/archived?q=PLANIN", ana.idToken())).containsEntry("total", 2);
        assertThat(ok("/api/groups/archived?q=planin&role=OWNER", ana.idToken()))
                .containsEntry("total", 1);
        assertThat(ok("/api/groups/archived?q=planin&role=OWNER&role=VIEWER", ana.idToken()))
                .containsEntry("total", 2);
        assertThat(get("/api/groups/archived?role=NEZNANA", ana.idToken()).statusCode())
                .isEqualTo(400);
    }

    @Test
    @Tag("FR-017-14")
    void anotherUsersGroupIsNeverRevealedBySearch() throws Exception {
        SignedIn ana = registeredUser("Ana Izolacija");
        SignedIn bojan = registeredUser("Bojan Izolacija");
        fixtures.createGroup(fixtures.userId(bojan.uid()), "Tajna skupina Zlatorog");
        UUID secretArchived = fixtures.createGroup(fixtures.userId(bojan.uid()), "Tajni arhiv Zlatorog");
        fixtures.archive(secretArchived);

        assertThat(sections(ok("/api/groups?q=zlatorog", ana.idToken()))).isEmpty();
        assertThat(ok("/api/groups/archived?q=zlatorog", ana.idToken()))
                .containsEntry("total", 0)
                .containsEntry("items", List.of());
        assertThat(sections(ok("/api/groups?q=zlatorog", bojan.idToken()))).hasSize(1);
    }
}
