package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Prenos lastništva {@code POST /api/groups/{groupId}/ownership-transfer} (FR-007-09, FR-007-10). */
class OwnershipTransferIT extends MemberApiTest {

    private SignedIn owner;
    private SignedIn admin;
    private SignedIn editor;
    private SignedIn viewer;
    private UUID group;
    private UUID ownerId;
    private UUID adminId;
    private UUID editorId;
    private UUID viewerId;

    private void setUp() throws Exception {
        owner = registeredUser("Ana Novak");
        admin = registeredUser("Bojan Kos");
        editor = registeredUser("Cene Urednik");
        viewer = registeredUser("Dana Bralec");
        group = groups.createGroup(id(owner), "Projekt FERI");
        ownerId = members.memberId(group, id(owner));
        adminId = join(group, admin, "ADMIN");
        editorId = join(group, editor, "EDITOR");
        viewerId = join(group, viewer, "VIEWER");
    }

    @ParameterizedTest(name = "prenos na {0}")
    @ValueSource(strings = {"ADMIN", "EDITOR", "VIEWER"})
    @Tag("FR-007-09")
    void ownerTransfersToAnyOtherMemberAndBecomesAdmin(String role) throws Exception {
        setUp();
        SignedIn target = switch (role) {
            case "ADMIN" -> admin;
            case "EDITOR" -> editor;
            default -> viewer;
        };
        UUID targetId = members.memberId(group, id(target));
        long targetVersion = members.version(group, id(target));
        long ownerVersion = members.version(group, id(owner));

        HttpResponse<String> response = transfer(group, owner, transferBody(targetId));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("id", group.toString()).containsEntry("role", "ADMIN");
        assertThat(members.role(group, id(target))).contains("OWNER");
        assertThat(members.role(group, id(owner))).contains("ADMIN");
        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(members.version(group, id(target))).isEqualTo(targetVersion + 1);
        assertThat(members.version(group, id(owner))).isEqualTo(ownerVersion + 1);
        assertThat(members.updatedBy(group, id(target))).isEqualTo(id(owner));
    }

    @Test
    @Tag("FR-007-09")
    void theNewOwnerHasOwnerPowersAndTheOldOneOnlyAdminPowers() throws Exception {
        setUp();
        assertThat(transfer(group, owner, transferBody(viewerId)).statusCode()).isEqualTo(200);

        assertThat(post("/api/groups/" + group + "/archive", owner.idToken(), null)
                        .statusCode())
                .isEqualTo(403);
        assertThat(transfer(group, owner, transferBody(adminId)).statusCode()).isEqualTo(403);
        assertThat(post("/api/groups/" + group + "/archive", viewer.idToken(), null)
                        .statusCode())
                .isEqualTo(200);
    }

    @Test
    @Tag("FR-007-09")
    void nonOwnersCannotTransfer() throws Exception {
        setUp();

        for (SignedIn caller : List.of(admin, editor, viewer)) {
            HttpResponse<String> response = transfer(group, caller, transferBody(viewerId));
            assertThat(response.statusCode()).as("%s", email(caller)).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
        assertThat(members.role(group, id(owner))).contains("OWNER");
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-09")
    void missingSelfOrNonUuidTargetIs400() throws Exception {
        setUp();

        HttpResponse<String> missing = transfer(group, owner, "{}");
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(json(missing.body()).get("errors"))
                .isEqualTo(List.of(Map.of("field", "memberId", "code", "REQUIRED")));
        HttpResponse<String> self = transfer(group, owner, transferBody(ownerId));
        assertThat(self.statusCode()).isEqualTo(400);
        assertThat(json(self.body()).get("errors"))
                .isEqualTo(List.of(Map.of("field", "memberId", "code", "INVALID_VALUE")));
        HttpResponse<String> notUuid = transfer(group, owner, "{\"memberId\":\"ni-uuid\"}");
        assertThat(notUuid.statusCode()).isEqualTo(400);
        HttpResponse<String> malformed = transfer(group, owner, "{ne json");
        assertThat(malformed.statusCode()).isEqualTo(400);
        assertThat(json(malformed.body()).get("errors"))
                .isEqualTo(List.of(Map.of("field", "body", "code", "MALFORMED")));
        assertThat(members.role(group, id(owner))).contains("OWNER");
    }

    @Test
    @Tag("FR-007-09")
    void targetThatIsNotAMemberIs409AndNothingChanges() throws Exception {
        setUp();
        SignedIn otherOwner = registeredUser("Druga Lastnica");
        UUID other = groups.createGroup(id(otherOwner), "Druga");
        UUID foreign = members.memberId(other, id(otherOwner));
        UUID removed = editorId;
        assertThat(remove(group, owner, removed).statusCode()).isEqualTo(204);

        for (UUID target : List.of(UUID.randomUUID(), foreign, removed)) {
            HttpResponse<String> response = transfer(group, owner, transferBody(target));
            assertThat(response.statusCode()).as("%s", target).isEqualTo(409);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "TARGET_NOT_MEMBER"));
        }
        assertThat(members.role(group, id(owner))).contains("OWNER");
        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(members.role(other, id(otherOwner))).contains("OWNER");
    }

    @Test
    @Tag("FR-007-09")
    void onlyMemberOwnerTransferringToThemselvesIs400() throws Exception {
        SignedIn solo = registeredUser("Sama");
        UUID alone = groups.createGroup(id(solo), "Sama");

        HttpResponse<String> response = transfer(alone, solo, transferBody(members.memberId(alone, id(solo))));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(members.ownerCount(alone)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-09")
    void nonMembersGet404() throws Exception {
        setUp();
        SignedIn stranger = registeredUser("Tujec");

        HttpResponse<String> response = transfer(group, stranger, transferBody(viewerId));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(transfer(UUID.randomUUID(), stranger, transferBody(viewerId)).statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-007-09")
    void authorizationOrderIsKeptBeforeValidationAndTargetChecks() throws Exception {
        setUp();
        SignedIn stranger = registeredUser("Tujec");

        assertThat(transfer(group, stranger, "{ne json").statusCode()).isEqualTo(404);
        assertThat(transfer(group, admin, "{ne json").statusCode()).isEqualTo(403);
        groups.archive(group);
        // lastnik arhivirane skupine: 409 GROUP_ARCHIVED pred 400 in TARGET_NOT_MEMBER
        assertThat(json(transfer(group, owner, "{ne json").body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(json(transfer(group, owner, transferBody(UUID.randomUUID())).body()))
                .isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
    }

    @Test
    @Tag("FR-007-10")
    void archivedGroupRejectsTransferWith409AndNothingChanges() throws Exception {
        setUp();
        groups.archive(group);

        HttpResponse<String> response = transfer(group, owner, transferBody(viewerId));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(members.role(group, id(owner))).contains("OWNER");
        assertThat(members.role(group, id(viewer))).contains("VIEWER");
        for (SignedIn caller : List.of(admin, editor, viewer)) {
            assertThat(transfer(group, caller, transferBody(viewerId)).statusCode())
                    .isEqualTo(403);
        }
    }

    @Test
    @Tag("FR-007-10")
    void everyMemberOfAPermanentlyArchivedGroupGets403() throws Exception {
        setUp();
        groups.makePermanentlyArchived(group);

        for (SignedIn caller : List.of(admin, editor, viewer)) {
            HttpResponse<String> response = transfer(group, caller, transferBody(viewerId));
            assertThat(response.statusCode()).as("%s", email(caller)).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
        assertThat(members.ownerCount(group)).isZero();
    }

    @Test
    @Tag("FR-007-09")
    void aFailedTransferNeverLeavesTheGroupWithoutAnOwner() throws Exception {
        setUp();

        assertThat(transfer(group, owner, "{}").statusCode()).isEqualTo(400);
        assertThat(transfer(group, owner, transferBody(UUID.randomUUID())).statusCode())
                .isEqualTo(409);
        assertThat(transfer(group, admin, transferBody(viewerId)).statusCode()).isEqualTo(403);

        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(members.role(group, id(owner))).contains("OWNER");
    }
}
