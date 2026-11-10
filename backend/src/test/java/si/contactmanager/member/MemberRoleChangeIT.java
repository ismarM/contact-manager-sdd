package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/** Sprememba vloge {@code PUT /api/groups/{groupId}/members/{memberId}} (FR-007-03, FR-007-04, FR-007-10). */
class MemberRoleChangeIT extends MemberApiTest {

    private SignedIn owner;
    private SignedIn admin;
    private SignedIn editor;
    private SignedIn viewer;
    private UUID group;
    private UUID adminId;
    private UUID editorId;
    private UUID viewerId;

    private void setUp() throws Exception {
        owner = registeredUser("Ana Novak");
        admin = registeredUser("Bojan Kos");
        editor = registeredUser("Cene Urednik");
        viewer = registeredUser("Dana Bralec");
        group = groups.createGroup(id(owner), "Projekt FERI");
        adminId = join(group, admin, "ADMIN");
        editorId = join(group, editor, "EDITOR");
        viewerId = join(group, viewer, "VIEWER");
    }

    @ParameterizedTest(name = "lastnik: {0} → {1}")
    @CsvSource({"VIEWER, ADMIN", "VIEWER, EDITOR", "EDITOR, ADMIN", "EDITOR, VIEWER", "ADMIN, EDITOR", "ADMIN, VIEWER"})
    @Tag("FR-007-03")
    void ownerChangesTheRoleOfAnyLowerMember(String from, String to) throws Exception {
        setUp();
        SignedIn target = switch (from) {
            case "ADMIN" -> admin;
            case "EDITOR" -> editor;
            default -> viewer;
        };
        UUID memberId = members.memberId(group, id(target));

        HttpResponse<String> response = changeRole(group, owner, memberId, roleBody(to, 0));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("role", to).containsEntry("version", 1).containsEntry("id", memberId.toString());
        assertThat(body).containsEntry("email", email(target));
        assertThat(((Map<?, ?>) body.get("updatedBy")).get("email")).isEqualTo(email(owner));
        assertThat(body.get("updatedAt")).isNotNull();
        assertThat(members.role(group, id(target))).contains(to);
        assertThat(members.version(group, id(target))).isEqualTo(1);
        assertThat(members.updatedBy(group, id(target))).isEqualTo(id(owner));
    }

    @Test
    @Tag("FR-007-03")
    void aPromotedMemberImmediatelyHasTheNewPowers() throws Exception {
        setUp();

        assertThat(changeRole(group, owner, viewerId, roleBody("ADMIN", 0)).statusCode())
                .isEqualTo(200);

        // nov admin sme zdaj spremeniti vlogo urednika
        assertThat(changeRole(group, viewer, editorId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(200);
    }

    @ParameterizedTest(name = "admin: {0} → {1}")
    @CsvSource({"EDITOR, VIEWER", "VIEWER, EDITOR"})
    @Tag("FR-007-03")
    void adminChangesEditorsAndViewersWithinTheirOwnLimits(String from, String to) throws Exception {
        setUp();
        SignedIn target = from.equals("EDITOR") ? editor : viewer;

        HttpResponse<String> response = changeRole(group, admin, members.memberId(group, id(target)), roleBody(to, 0));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(members.role(group, id(target))).contains(to);
        assertThat(members.updatedBy(group, id(target))).isEqualTo(id(admin));
    }

    @ParameterizedTest(name = "admin dodeli {0}")
    @CsvSource({"ADMIN", "OWNER"})
    @Tag("FR-007-03")
    void adminCannotAssignAdminOrOwner(String role) throws Exception {
        setUp();

        HttpResponse<String> response = changeRole(group, admin, editorId, roleBody(role, 0));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(members.role(group, id(editor))).contains("EDITOR");
        assertThat(members.version(group, id(editor))).isZero();
    }

    @Test
    @Tag("FR-007-03")
    void ownerCannotAssignOwner() throws Exception {
        setUp();

        HttpResponse<String> response = changeRole(group, owner, viewerId, roleBody("OWNER", 0));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(members.role(group, id(viewer))).contains("VIEWER");
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-03")
    void adminCannotChangeAnotherAdminOrTheOwner() throws Exception {
        setUp();
        SignedIn second = registeredUser("Drugi Admin");
        UUID secondId = join(group, second, "ADMIN");
        UUID ownerId = members.memberId(group, id(owner));

        assertThat(changeRole(group, admin, secondId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, admin, ownerId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(403);
        assertThat(members.role(group, id(second))).contains("ADMIN");
        assertThat(members.role(group, id(owner))).contains("OWNER");
    }

    @Test
    @Tag("FR-007-03")
    void ownerAndAdminCannotChangeTheirOwnMembership() throws Exception {
        setUp();

        assertThat(changeRole(group, owner, members.memberId(group, id(owner)), roleBody("ADMIN", 0))
                        .statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, admin, adminId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(403);
        assertThat(members.role(group, id(owner))).contains("OWNER");
        assertThat(members.role(group, id(admin))).contains("ADMIN");
    }

    @Test
    @Tag("FR-007-03")
    void editorAndViewerCannotChangeAnyRole() throws Exception {
        setUp();

        for (SignedIn caller : List.of(editor, viewer)) {
            HttpResponse<String> response = changeRole(group, caller, viewerId, roleBody("EDITOR", 0));
            assertThat(response.statusCode()).as("%s", email(caller)).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
        assertThat(members.role(group, id(viewer))).contains("VIEWER");
    }

    @Test
    @Tag("FR-007-03")
    void unchangedMissingOrUnknownRoleIs400() throws Exception {
        setUp();

        HttpResponse<String> same = changeRole(group, owner, editorId, roleBody("EDITOR", 0));
        assertThat(same.statusCode()).isEqualTo(400);
        assertThat(json(same.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(json(same.body()).get("errors")).isEqualTo(List.of(Map.of("field", "role", "code", "UNCHANGED")));

        HttpResponse<String> missing = changeRole(group, owner, editorId, "{\"version\":0}");
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(json(missing.body()).get("errors")).isEqualTo(List.of(Map.of("field", "role", "code", "REQUIRED")));

        HttpResponse<String> unknown = changeRole(group, owner, editorId, roleBody("SUPERUSER", 0));
        assertThat(unknown.statusCode()).isEqualTo(400);
        assertThat(json(unknown.body()).get("errors"))
                .isEqualTo(List.of(Map.of("field", "role", "code", "INVALID_VALUE")));

        HttpResponse<String> noVersion = changeRole(group, owner, editorId, "{\"role\":\"VIEWER\"}");
        assertThat(noVersion.statusCode()).isEqualTo(400);
        assertThat(json(noVersion.body()).get("errors"))
                .isEqualTo(List.of(Map.of("field", "version", "code", "REQUIRED")));

        HttpResponse<String> malformed = changeRole(group, owner, editorId, "{ne json");
        assertThat(malformed.statusCode()).isEqualTo(400);
        assertThat(json(malformed.body()).get("errors"))
                .isEqualTo(List.of(Map.of("field", "body", "code", "MALFORMED")));
        assertThat(members.role(group, id(editor))).contains("EDITOR");
        assertThat(members.version(group, id(editor))).isZero();
    }

    @Test
    @Tag("FR-007-04")
    void staleVersionIs409WithTheCurrentMemberAndNothingChanges() throws Exception {
        setUp();
        // admin je urednika že znižal v bralca (verzija 0 → 1)
        assertThat(changeRole(group, admin, editorId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(200);

        HttpResponse<String> response = changeRole(group, owner, editorId, roleBody("ADMIN", 0));

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VERSION_CONFLICT");
        Map<String, Object> current = JSON.convertValue(body.get("current"), new TypeReference<>() {});
        assertThat(current).containsEntry("role", "VIEWER").containsEntry("version", 1);
        assertThat(((Map<?, ?>) current.get("updatedBy")).get("email")).isEqualTo(email(admin));
        assertThat(current.get("updatedAt")).isNotNull();
        assertThat(members.role(group, id(editor))).contains("VIEWER");
        assertThat(members.version(group, id(editor))).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-04")
    void repeatingTheChangeWithTheNewVersionSucceeds() throws Exception {
        setUp();
        assertThat(changeRole(group, admin, editorId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(200);

        HttpResponse<String> response = changeRole(group, owner, editorId, roleBody("ADMIN", 1));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("role", "ADMIN").containsEntry("version", 2);
    }

    @Test
    @Tag("FR-007-03")
    void unknownForeignOrInvalidMemberIdIs404ForAdminAndOwner() throws Exception {
        setUp();
        SignedIn otherOwner = registeredUser("Druga Lastnica");
        UUID other = groups.createGroup(id(otherOwner), "Druga");
        UUID foreign = members.memberId(other, id(otherOwner));

        for (Object unknown : List.of(UUID.randomUUID(), foreign, "ni-uuid")) {
            for (SignedIn caller : List.of(owner, admin)) {
                HttpResponse<String> response = changeRole(group, caller, unknown, roleBody("VIEWER", 0));
                assertThat(response.statusCode())
                        .as("%s %s", email(caller), unknown)
                        .isEqualTo(404);
                assertThat(response.body()).isEmpty();
            }
        }
        assertThat(members.role(other, id(otherOwner))).contains("OWNER");
    }

    @Test
    @Tag("FR-007-03")
    void editorAndViewerGet403EvenForUnknownForeignOrInvalidMemberId() throws Exception {
        setUp();
        SignedIn otherOwner = registeredUser("Druga Lastnica");
        UUID other = groups.createGroup(id(otherOwner), "Druga");
        UUID foreign = members.memberId(other, id(otherOwner));

        for (Object unknown : List.of(UUID.randomUUID(), foreign, "ni-uuid")) {
            for (SignedIn caller : List.of(editor, viewer)) {
                HttpResponse<String> response = changeRole(group, caller, unknown, roleBody("VIEWER", 0));
                assertThat(response.statusCode())
                        .as("%s %s", email(caller), unknown)
                        .isEqualTo(403);
                assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
            }
        }
    }

    @Test
    @Tag("FR-007-03")
    void authorizationOrderBeatsValidation() throws Exception {
        setUp();
        SignedIn stranger = registeredUser("Tujec");

        // nečlan: 404 pred 400; urednik: 403 pred 400; cilj višji: 403 pred 400; zastarela verzija + enaka vloga: 409
        // pred 400
        assertThat(changeRole(group, stranger, editorId, "{ne json").statusCode())
                .isEqualTo(404);
        assertThat(changeRole(group, editor, viewerId, "{ne json").statusCode()).isEqualTo(403);
        assertThat(changeRole(group, admin, members.memberId(group, id(owner)), "{ne json")
                        .statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, admin, editorId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(200);
        HttpResponse<String> stale = changeRole(group, owner, editorId, roleBody("VIEWER", 0));
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale.body())).containsEntry("code", "VERSION_CONFLICT");
    }

    @Test
    @Tag("FR-007-10")
    void archivedGroupRejectsRoleChangesWith409ButVerifiesTheRoleFirst() throws Exception {
        setUp();
        groups.archive(group);

        for (SignedIn caller : List.of(owner, admin)) {
            HttpResponse<String> response = changeRole(group, caller, viewerId, roleBody("EDITOR", 0));
            assertThat(response.statusCode()).as("%s", email(caller)).isEqualTo(409);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        }
        // 409 pred zastarelo verzijo in neveljavnim telesom
        assertThat(json(changeRole(group, owner, viewerId, roleBody("EDITOR", 7))
                        .body()))
                .isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(changeRole(group, owner, viewerId, "{ne json").statusCode()).isEqualTo(409);
        // urednik in bralec: 403; admin nad adminom: 403 (pred 409)
        assertThat(changeRole(group, editor, viewerId, roleBody("EDITOR", 0)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, viewer, editorId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, admin, members.memberId(group, id(owner)), roleBody("VIEWER", 0))
                        .statusCode())
                .isEqualTo(403);
        assertThat(members.role(group, id(viewer))).contains("VIEWER");
        assertThat(members.version(group, id(viewer))).isZero();
    }

    @Test
    @Tag("FR-007-10")
    void permanentlyArchivedGroupRejectsAdminWith409() throws Exception {
        setUp();
        groups.makePermanentlyArchived(group);

        HttpResponse<String> response = changeRole(group, admin, viewerId, roleBody("EDITOR", 0));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(members.role(group, id(viewer))).contains("VIEWER");
    }

    @Test
    @Tag("FR-007-03")
    void failedChangesNeverChangeRoleOrVersion() throws Exception {
        setUp();
        Map<String, Object> before = members.row(group, id(editor));

        assertThat(changeRole(group, admin, editorId, roleBody("ADMIN", 0)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, editor, editorId, roleBody("VIEWER", 0)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, owner, editorId, roleBody("EDITOR", 0)).statusCode())
                .isEqualTo(400);
        assertThat(changeRole(group, owner, editorId, roleBody("VIEWER", 99)).statusCode())
                .isEqualTo(409);

        assertThat(members.row(group, id(editor))).isEqualTo(before);
    }

    @Test
    @Tag("FR-007-03")
    @Tag("FR-007-04")
    void authorizationFailureBeatsAStaleVersion() throws Exception {
        setUp();
        SignedIn second = registeredUser("Drugi Admin");
        UUID secondId = join(group, second, "ADMIN");

        // zastarela verzija (99) ne sme prekriti 403: admin dodeli ADMIN; admin nad adminom; urednik in bralec
        HttpResponse<String> assignAdmin = changeRole(group, admin, editorId, roleBody("ADMIN", 99));
        assertThat(assignAdmin.statusCode()).isEqualTo(403);
        assertThat(json(assignAdmin.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(changeRole(group, admin, secondId, roleBody("VIEWER", 99)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, owner, viewerId, roleBody("OWNER", 99)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, editor, viewerId, roleBody("EDITOR", 99)).statusCode())
                .isEqualTo(403);
        assertThat(changeRole(group, viewer, editorId, roleBody("VIEWER", 99)).statusCode())
                .isEqualTo(403);
        assertThat(members.version(group, id(editor))).isZero();
    }

    @Test
    @Tag("FR-007-04")
    void aStaleVersionBeatsValidation() throws Exception {
        setUp();

        for (String body : List.of(
                "{\"role\":\"SUPERUSER\",\"version\":99}",
                "{\"version\":99}",
                "{\"role\":\"EDITOR\",\"version\":99}")) {
            HttpResponse<String> response = changeRole(group, owner, editorId, body);
            assertThat(response.statusCode()).as(body).isEqualTo(409);
            assertThat(json(response.body())).containsEntry("code", "VERSION_CONFLICT");
        }
    }

    @Test
    @Tag("FR-007-03")
    @Tag("FR-007-10")
    void aMissingTargetIs404BeforeArchivedAndBeforeValidation() throws Exception {
        setUp();
        groups.archive(group);

        for (SignedIn caller : List.of(owner, admin)) {
            assertThat(changeRole(group, caller, UUID.randomUUID(), roleBody("VIEWER", 0))
                            .statusCode())
                    .as("arhivirana, %s", email(caller))
                    .isEqualTo(404);
            assertThat(changeRole(group, caller, UUID.randomUUID(), "{ne json").statusCode())
                    .as("neveljavno telo, %s", email(caller))
                    .isEqualTo(404);
        }
    }
}
