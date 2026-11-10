package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Matrika »le nižjim od sebe« (SC-005, FR-007-03, FR-007-05): vsaka kombinacija vloge klicatelja × vloge cilja × dodeljene
 * vloge ({@code PUT}) oziroma klicatelja × cilja ({@code DELETE}) × stanje skupine ima **ročno napisan** pričakovani status
 * (dobesedna tabela, izpeljana iz spec.md, neodvisna od {@code MemberRules}). Velikost tabel se preveri: 128 in 32 vrstic.
 *
 * <p>Pri vsaki vrstici je cilj član z navedeno vlogo; ko sta klicatelj in cilj enake vloge, sta to različna uporabnika
 * (razen lastnika, ki je v skupini en – tam je cilj klicatelj sam). Enaka dodeljena vloga kot trenutna → 400.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MemberRoleMatrixSecurityIT extends MemberApiTest {

    /** klicatelj, cilj, dodeljena vloga, arhivirana, pričakovani status – 4 × 4 × 4 × 2 = 128 vrstic. */
    private static final List<String> PUT_ROWS = List.of(
            "OWNER, OWNER, OWNER, false, 403",
            "OWNER, OWNER, ADMIN, false, 403",
            "OWNER, OWNER, EDITOR, false, 403",
            "OWNER, OWNER, VIEWER, false, 403",
            "OWNER, ADMIN, OWNER, false, 403",
            "OWNER, ADMIN, ADMIN, false, 400",
            "OWNER, ADMIN, EDITOR, false, 200",
            "OWNER, ADMIN, VIEWER, false, 200",
            "OWNER, EDITOR, OWNER, false, 403",
            "OWNER, EDITOR, ADMIN, false, 200",
            "OWNER, EDITOR, EDITOR, false, 400",
            "OWNER, EDITOR, VIEWER, false, 200",
            "OWNER, VIEWER, OWNER, false, 403",
            "OWNER, VIEWER, ADMIN, false, 200",
            "OWNER, VIEWER, EDITOR, false, 200",
            "OWNER, VIEWER, VIEWER, false, 400",
            "ADMIN, OWNER, OWNER, false, 403",
            "ADMIN, OWNER, ADMIN, false, 403",
            "ADMIN, OWNER, EDITOR, false, 403",
            "ADMIN, OWNER, VIEWER, false, 403",
            "ADMIN, ADMIN, OWNER, false, 403",
            "ADMIN, ADMIN, ADMIN, false, 403",
            "ADMIN, ADMIN, EDITOR, false, 403",
            "ADMIN, ADMIN, VIEWER, false, 403",
            "ADMIN, EDITOR, OWNER, false, 403",
            "ADMIN, EDITOR, ADMIN, false, 403",
            "ADMIN, EDITOR, EDITOR, false, 400",
            "ADMIN, EDITOR, VIEWER, false, 200",
            "ADMIN, VIEWER, OWNER, false, 403",
            "ADMIN, VIEWER, ADMIN, false, 403",
            "ADMIN, VIEWER, EDITOR, false, 200",
            "ADMIN, VIEWER, VIEWER, false, 400",
            "EDITOR, OWNER, OWNER, false, 403",
            "EDITOR, OWNER, ADMIN, false, 403",
            "EDITOR, OWNER, EDITOR, false, 403",
            "EDITOR, OWNER, VIEWER, false, 403",
            "EDITOR, ADMIN, OWNER, false, 403",
            "EDITOR, ADMIN, ADMIN, false, 403",
            "EDITOR, ADMIN, EDITOR, false, 403",
            "EDITOR, ADMIN, VIEWER, false, 403",
            "EDITOR, EDITOR, OWNER, false, 403",
            "EDITOR, EDITOR, ADMIN, false, 403",
            "EDITOR, EDITOR, EDITOR, false, 403",
            "EDITOR, EDITOR, VIEWER, false, 403",
            "EDITOR, VIEWER, OWNER, false, 403",
            "EDITOR, VIEWER, ADMIN, false, 403",
            "EDITOR, VIEWER, EDITOR, false, 403",
            "EDITOR, VIEWER, VIEWER, false, 403",
            "VIEWER, OWNER, OWNER, false, 403",
            "VIEWER, OWNER, ADMIN, false, 403",
            "VIEWER, OWNER, EDITOR, false, 403",
            "VIEWER, OWNER, VIEWER, false, 403",
            "VIEWER, ADMIN, OWNER, false, 403",
            "VIEWER, ADMIN, ADMIN, false, 403",
            "VIEWER, ADMIN, EDITOR, false, 403",
            "VIEWER, ADMIN, VIEWER, false, 403",
            "VIEWER, EDITOR, OWNER, false, 403",
            "VIEWER, EDITOR, ADMIN, false, 403",
            "VIEWER, EDITOR, EDITOR, false, 403",
            "VIEWER, EDITOR, VIEWER, false, 403",
            "VIEWER, VIEWER, OWNER, false, 403",
            "VIEWER, VIEWER, ADMIN, false, 403",
            "VIEWER, VIEWER, EDITOR, false, 403",
            "VIEWER, VIEWER, VIEWER, false, 403",
            "OWNER, OWNER, OWNER, true, 403",
            "OWNER, OWNER, ADMIN, true, 403",
            "OWNER, OWNER, EDITOR, true, 403",
            "OWNER, OWNER, VIEWER, true, 403",
            "OWNER, ADMIN, OWNER, true, 403",
            "OWNER, ADMIN, ADMIN, true, 409",
            "OWNER, ADMIN, EDITOR, true, 409",
            "OWNER, ADMIN, VIEWER, true, 409",
            "OWNER, EDITOR, OWNER, true, 403",
            "OWNER, EDITOR, ADMIN, true, 409",
            "OWNER, EDITOR, EDITOR, true, 409",
            "OWNER, EDITOR, VIEWER, true, 409",
            "OWNER, VIEWER, OWNER, true, 403",
            "OWNER, VIEWER, ADMIN, true, 409",
            "OWNER, VIEWER, EDITOR, true, 409",
            "OWNER, VIEWER, VIEWER, true, 409",
            "ADMIN, OWNER, OWNER, true, 403",
            "ADMIN, OWNER, ADMIN, true, 403",
            "ADMIN, OWNER, EDITOR, true, 403",
            "ADMIN, OWNER, VIEWER, true, 403",
            "ADMIN, ADMIN, OWNER, true, 403",
            "ADMIN, ADMIN, ADMIN, true, 403",
            "ADMIN, ADMIN, EDITOR, true, 403",
            "ADMIN, ADMIN, VIEWER, true, 403",
            "ADMIN, EDITOR, OWNER, true, 403",
            "ADMIN, EDITOR, ADMIN, true, 403",
            "ADMIN, EDITOR, EDITOR, true, 409",
            "ADMIN, EDITOR, VIEWER, true, 409",
            "ADMIN, VIEWER, OWNER, true, 403",
            "ADMIN, VIEWER, ADMIN, true, 403",
            "ADMIN, VIEWER, EDITOR, true, 409",
            "ADMIN, VIEWER, VIEWER, true, 409",
            "EDITOR, OWNER, OWNER, true, 403",
            "EDITOR, OWNER, ADMIN, true, 403",
            "EDITOR, OWNER, EDITOR, true, 403",
            "EDITOR, OWNER, VIEWER, true, 403",
            "EDITOR, ADMIN, OWNER, true, 403",
            "EDITOR, ADMIN, ADMIN, true, 403",
            "EDITOR, ADMIN, EDITOR, true, 403",
            "EDITOR, ADMIN, VIEWER, true, 403",
            "EDITOR, EDITOR, OWNER, true, 403",
            "EDITOR, EDITOR, ADMIN, true, 403",
            "EDITOR, EDITOR, EDITOR, true, 403",
            "EDITOR, EDITOR, VIEWER, true, 403",
            "EDITOR, VIEWER, OWNER, true, 403",
            "EDITOR, VIEWER, ADMIN, true, 403",
            "EDITOR, VIEWER, EDITOR, true, 403",
            "EDITOR, VIEWER, VIEWER, true, 403",
            "VIEWER, OWNER, OWNER, true, 403",
            "VIEWER, OWNER, ADMIN, true, 403",
            "VIEWER, OWNER, EDITOR, true, 403",
            "VIEWER, OWNER, VIEWER, true, 403",
            "VIEWER, ADMIN, OWNER, true, 403",
            "VIEWER, ADMIN, ADMIN, true, 403",
            "VIEWER, ADMIN, EDITOR, true, 403",
            "VIEWER, ADMIN, VIEWER, true, 403",
            "VIEWER, EDITOR, OWNER, true, 403",
            "VIEWER, EDITOR, ADMIN, true, 403",
            "VIEWER, EDITOR, EDITOR, true, 403",
            "VIEWER, EDITOR, VIEWER, true, 403",
            "VIEWER, VIEWER, OWNER, true, 403",
            "VIEWER, VIEWER, ADMIN, true, 403",
            "VIEWER, VIEWER, EDITOR, true, 403",
            "VIEWER, VIEWER, VIEWER, true, 403");

    /** klicatelj, cilj, arhivirana, pričakovani status – 4 × 4 × 2 = 32 vrstic. */
    private static final List<String> DELETE_ROWS = List.of(
            "OWNER, OWNER, false, 403",
            "OWNER, ADMIN, false, 204",
            "OWNER, EDITOR, false, 204",
            "OWNER, VIEWER, false, 204",
            "ADMIN, OWNER, false, 403",
            "ADMIN, ADMIN, false, 403",
            "ADMIN, EDITOR, false, 204",
            "ADMIN, VIEWER, false, 204",
            "EDITOR, OWNER, false, 403",
            "EDITOR, ADMIN, false, 403",
            "EDITOR, EDITOR, false, 403",
            "EDITOR, VIEWER, false, 403",
            "VIEWER, OWNER, false, 403",
            "VIEWER, ADMIN, false, 403",
            "VIEWER, EDITOR, false, 403",
            "VIEWER, VIEWER, false, 403",
            "OWNER, OWNER, true, 403",
            "OWNER, ADMIN, true, 409",
            "OWNER, EDITOR, true, 409",
            "OWNER, VIEWER, true, 409",
            "ADMIN, OWNER, true, 403",
            "ADMIN, ADMIN, true, 403",
            "ADMIN, EDITOR, true, 409",
            "ADMIN, VIEWER, true, 409",
            "EDITOR, OWNER, true, 403",
            "EDITOR, ADMIN, true, 403",
            "EDITOR, EDITOR, true, 403",
            "EDITOR, VIEWER, true, 403",
            "VIEWER, OWNER, true, 403",
            "VIEWER, ADMIN, true, 403",
            "VIEWER, EDITOR, true, 403",
            "VIEWER, VIEWER, true, 403");

    private final Map<String, SignedIn> users = new java.util.HashMap<>();

    @BeforeAll
    void registerUsers() throws Exception {
        for (String name : List.of("OWNER", "ADMIN1", "ADMIN2", "EDITOR1", "EDITOR2", "VIEWER1", "VIEWER2")) {
            users.put(name, registeredUser(name));
        }
    }

    static Stream<Arguments> putRows() {
        return PUT_ROWS.stream().map(row -> Arguments.of((Object[]) row.split(", ")));
    }

    static Stream<Arguments> deleteRows() {
        return DELETE_ROWS.stream().map(row -> Arguments.of((Object[]) row.split(", ")));
    }

    @Test
    void literalTablesHaveTheFullNumberOfCombinations() {
        assertThat(PUT_ROWS).hasSize(128).doesNotHaveDuplicates();
        assertThat(DELETE_ROWS).hasSize(32).doesNotHaveDuplicates();
        assertThat(PUT_ROWS.stream().filter(row -> row.endsWith("200")).count()).isEqualTo(8);
        assertThat(PUT_ROWS.stream().filter(row -> row.endsWith("400")).count()).isEqualTo(5);
        assertThat(DELETE_ROWS.stream().filter(row -> row.endsWith("204")).count())
                .isEqualTo(5);
    }

    private record Setup(UUID group, SignedIn caller, SignedIn targetUser, UUID targetId) {}

    private Setup setUp(String caller, String target, boolean archived) {
        UUID group = groups.createGroup(id(users.get("OWNER")), "Matrika " + caller + target);
        for (String name : List.of("ADMIN1", "ADMIN2", "EDITOR1", "EDITOR2", "VIEWER1", "VIEWER2")) {
            groups.addMember(group, id(users.get(name)), name.substring(0, name.length() - 1));
        }
        String callerKey = caller.equals("OWNER") ? "OWNER" : caller + "1";
        String targetKey = target.equals("OWNER") ? "OWNER" : (target.equals(caller) ? target + "2" : target + "1");
        if (archived) {
            groups.archive(group);
        }
        SignedIn targetUser = users.get(targetKey);
        return new Setup(group, users.get(callerKey), targetUser, members.memberId(group, id(targetUser)));
    }

    /** Pričakovana koda napake po statusu (ročno): 403 FORBIDDEN, 409 GROUP_ARCHIVED, 400 VALIDATION_FAILED, uspeh brez kode. */
    private static String expectedCode(String status) {
        return switch (status) {
            case "403" -> "FORBIDDEN";
            case "409" -> "GROUP_ARCHIVED";
            case "400" -> "VALIDATION_FAILED";
            default -> null;
        };
    }

    private static String errorCode(HttpResponse<String> response) {
        return response.body().isEmpty() || response.statusCode() == 200
                ? null
                : (String) json(response.body()).get("code");
    }

    @Tag("FR-007-03")
    @ParameterizedTest(name = "PUT {0} → {1} v {2}, arhivirana {3}: {4}")
    @MethodSource("putRows")
    void roleChangeFollowsTheLiteralTable(String caller, String target, String newRole, String archived, String status)
            throws Exception {
        Setup s = setUp(caller, target, Boolean.parseBoolean(archived));
        long versionBefore = members.version(s.group(), id(s.targetUser()));
        String roleBefore = members.role(s.group(), id(s.targetUser())).orElseThrow();

        HttpResponse<String> response =
                changeRole(s.group(), s.caller(), s.targetId(), roleBody(newRole, versionBefore));

        assertThat(response.statusCode()).isEqualTo(Integer.parseInt(status));
        assertThat(errorCode(response)).isEqualTo(expectedCode(status));
        if (!status.equals("200")) {
            assertThat(members.role(s.group(), id(s.targetUser()))).contains(roleBefore);
            assertThat(members.version(s.group(), id(s.targetUser()))).isEqualTo(versionBefore);
        } else {
            assertThat(members.role(s.group(), id(s.targetUser()))).contains(newRole);
        }
        assertThat(members.ownerCount(s.group())).isEqualTo(1);
    }

    @Tag("FR-007-05")
    @ParameterizedTest(name = "DELETE {0} → {1}, arhivirana {2}: {3}")
    @MethodSource("deleteRows")
    void removalFollowsTheLiteralTable(String caller, String target, String archived, String status) throws Exception {
        Setup s = setUp(caller, target, Boolean.parseBoolean(archived));

        HttpResponse<String> response = remove(s.group(), s.caller(), s.targetId());

        assertThat(response.statusCode()).isEqualTo(Integer.parseInt(status));
        assertThat(errorCode(response)).isEqualTo(expectedCode(status));
        assertThat(members.role(s.group(), id(s.targetUser())).isPresent()).isEqualTo(!status.equals("204"));
    }

    @Test
    @Tag("FR-007-03")
    @Tag("FR-007-05")
    void aTargetPromotedInTheMeantimeIsManagedByItsCurrentRole() throws Exception {
        UUID group = groups.createGroup(id(users.get("OWNER")), "Medtem povišan");
        groups.addMember(group, id(users.get("ADMIN1")), "ADMIN");
        groups.addMember(group, id(users.get("EDITOR1")), "EDITOR");
        UUID editorId = members.memberId(group, id(users.get("EDITOR1")));
        // lastnik medtem povišuje urednika v admina; admin ima še staro sliko (verzija 0)
        assertThat(changeRole(group, users.get("OWNER"), editorId, roleBody("ADMIN", 0))
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> response = changeRole(group, users.get("ADMIN1"), editorId, roleBody("VIEWER", 1));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(members.role(group, id(users.get("EDITOR1")))).contains("ADMIN");
        assertThat(remove(group, users.get("ADMIN1"), editorId).statusCode()).isEqualTo(403);
    }
}
