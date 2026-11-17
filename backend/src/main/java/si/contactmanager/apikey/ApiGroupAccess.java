package si.contactmanager.apikey;

import org.springframework.stereotype.Component;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.security.ApiKeyPrincipal;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;

/**
 * Dostop do skupine prek API ključa (019, research R-03; FR-019-07, -09, -13). Vrstni red: nečlan 404 → skupina izven
 * obsega ključa 404 → učinkovita vloga = min(trenutna vloga, kapica ključa) pod {@code lowest} 403 → pisanje v
 * arhivirani skupini 409. Vrne članstvo z <b>učinkovito</b> vlogo, zato storitve domene ostanejo nespremenjene.
 */
@Component
public class ApiGroupAccess {

    private final GroupAccess groups;

    ApiGroupAccess(GroupAccess groups) {
        this.groups = groups;
    }

    public Membership require(ApiKeyPrincipal principal, String groupId, Role lowest, boolean write) {
        Membership membership = groups.membership(principal.userId(), groupId);
        Permission permission =
                principal.scope().permission(membership.groupId()).orElseThrow(NotFoundException::new);
        Role effective = effectiveRole(membership.role(), permission);
        if (!effective.atLeast(lowest)) {
            throw new ForbiddenException();
        }
        if (write && membership.archived()) {
            throw new GroupArchivedException();
        }
        return new Membership(
                membership.groupId(),
                membership.userId(),
                effective,
                membership.archived(),
                membership.permanentlyArchived());
    }

    /** Ključ nikoli ne da več pravic, kot jih ima uporabnik: {@code READ} omeji vlogo na VIEWER. */
    static Role effectiveRole(Role role, Permission permission) {
        return permission == Permission.READ ? Role.VIEWER : role;
    }
}
