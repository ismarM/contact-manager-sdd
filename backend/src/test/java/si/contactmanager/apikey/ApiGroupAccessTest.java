package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.security.ApiKeyPrincipal;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;

/**
 * Dostop do skupine prek API ključa (FR-019-07, -09, -13; research R-03): vrstni red 404 nečlan → 404 izven obsega →
 * 403 učinkovita vloga → 409 arhivirana; učinkovita vloga = min(vloga, pravica ključa).
 */
@Tag("FR-019-07")
@Tag("FR-019-09")
@Tag("FR-019-13")
class ApiGroupAccessTest {

    private static final long USER = 7;
    private static final UUID GROUP = UUID.fromString("0193c4a2-7a1f-7c3e-9b1a-000000000001");
    private static final UUID OTHER = UUID.fromString("0193c4a2-7a1f-7c3e-9b1a-000000000002");

    private final GroupAccess groups = mock(GroupAccess.class);
    private final ApiGroupAccess access = new ApiGroupAccess(groups);

    private static ApiKeyPrincipal key(Scope scope) {
        return new ApiKeyPrincipal(USER, UUID.randomUUID(), "Nočni izvoz", scope);
    }

    private static ApiKeyPrincipal key(Permission permission) {
        return key(Scope.groups(Map.of(GROUP, permission)));
    }

    private void member(Role role, boolean archived) {
        when(groups.membership(USER, GROUP.toString())).thenReturn(new Membership(GROUP, USER, role, archived, false));
    }

    @Test
    void nonMemberIsNotFoundEvenWithKeyForTheGroup() {
        when(groups.membership(USER, GROUP.toString())).thenThrow(new NotFoundException());

        assertThatThrownBy(() -> access.require(key(Permission.WRITE), GROUP.toString(), Role.VIEWER, false))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void groupOutsideKeyScopeIsNotFoundBeforeRoleAndArchive() {
        member(Role.VIEWER, true);
        ApiKeyPrincipal otherGroup = key(Scope.groups(Map.of(OTHER, Permission.WRITE)));

        assertThatThrownBy(() -> access.require(otherGroup, GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(NotFoundException.class);
    }

    @ParameterizedTest
    @EnumSource(Role.class)
    void readKeyCapsEveryRoleToViewer(Role role) {
        member(role, false);

        assertThat(access.require(key(Permission.READ), GROUP.toString(), Role.VIEWER, false)
                        .role())
                .isEqualTo(Role.VIEWER);
        assertThatThrownBy(() -> access.require(key(Permission.READ), GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(ForbiddenException.class);
    }

    @ParameterizedTest
    @EnumSource(Role.class)
    void writeKeyKeepsCurrentRole(Role role) {
        member(role, false);

        Membership membership = access.require(key(Permission.WRITE), GROUP.toString(), Role.VIEWER, false);

        assertThat(membership.role()).isEqualTo(role);
        assertThat(membership.groupId()).isEqualTo(GROUP);
        assertThat(membership.userId()).isEqualTo(USER);
    }

    @Test
    void viewerWithWriteKeyIsForbiddenToWrite() {
        member(Role.VIEWER, false);

        assertThatThrownBy(() -> access.require(key(Permission.WRITE), GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void roleLoweredAfterKeyCreationIsUsed() {
        member(Role.EDITOR, false);
        assertThat(access.require(key(Permission.WRITE), GROUP.toString(), Role.EDITOR, true)
                        .role())
                .isEqualTo(Role.EDITOR);

        member(Role.VIEWER, false);
        assertThatThrownBy(() -> access.require(key(Permission.WRITE), GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void forbiddenComesBeforeArchived() {
        member(Role.OWNER, true);

        assertThatThrownBy(() -> access.require(key(Permission.READ), GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> access.require(key(Permission.WRITE), GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(GroupArchivedException.class);
    }

    @Test
    void readingArchivedGroupIsAllowed() {
        member(Role.VIEWER, true);

        Membership membership = access.require(key(Permission.READ), GROUP.toString(), Role.VIEWER, false);

        assertThat(membership.archived()).isTrue();
    }

    @Test
    void allMyGroupsKeyCoversAnyMembershipWithItsPermission() {
        member(Role.ADMIN, false);

        assertThat(access.require(key(Scope.allGroups(Permission.WRITE)), GROUP.toString(), Role.EDITOR, true)
                        .role())
                .isEqualTo(Role.ADMIN);
        assertThatThrownBy(() ->
                        access.require(key(Scope.allGroups(Permission.READ)), GROUP.toString(), Role.EDITOR, true))
                .isInstanceOf(ForbiddenException.class);
    }
}
