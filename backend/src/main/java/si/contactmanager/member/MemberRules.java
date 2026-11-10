package si.contactmanager.member;

import java.util.List;
import si.contactmanager.group.Role;

/**
 * Pravilo »le nižjim od sebe« (feature-map §2.1) kot čiste funkcije: brez stanja in brez dostopa do baze. Isto
 * pravilo uporabljajo pisalne operacije in izračun {@code canManage} v seznamu.
 */
final class MemberRules {

    private MemberRules() {}

    /** Ali sme klicatelj upravljati člana (meni dejanj): OWNER/ADMIN, strogo nižji cilj, nearhivirana skupina. */
    static boolean canManage(Role caller, Role target, boolean archived) {
        return !archived && caller.atLeast(Role.ADMIN) && target.compareTo(caller) < 0;
    }

    /** Vloge, ki jih klicatelj sme dodeliti (strogo nižje od svoje, brez OWNER); od najvišje do najnižje. */
    static List<Role> assignable(Role caller) {
        if (!caller.atLeast(Role.ADMIN)) {
            return List.of();
        }
        return List.of(Role.values()).reversed().stream()
                .filter(role -> role != Role.OWNER && role.compareTo(caller) < 0)
                .toList();
    }

    /** Ali sme klicatelj spremeniti vlogo cilja v novo vlogo. */
    static boolean mayChange(Role caller, Role target, Role newRole) {
        return caller.atLeast(Role.ADMIN)
                && target.compareTo(caller) < 0
                && assignable(caller).contains(newRole);
    }
}
