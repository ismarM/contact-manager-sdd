package si.contactmanager.member;

import java.util.List;
import si.contactmanager.group.Role;

/**
 * Pravilo »le nižjim od sebe« (feature-map §2.1) kot čiste funkcije. Ogrodje (007, T006): vedenje dodajo naloge
 * implementacije.
 */
final class MemberRules {

    private MemberRules() {}

    /** Ali sme klicatelj upravljati člana (meni dejanj): OWNER/ADMIN, strogo nižji cilj, nearhivirana skupina. */
    static boolean canManage(Role caller, Role target, boolean archived) {
        throw new UnsupportedOperationException("not implemented");
    }

    /** Vloge, ki jih klicatelj sme dodeliti (strogo nižje od svoje, brez OWNER). */
    static List<Role> assignable(Role caller) {
        throw new UnsupportedOperationException("not implemented");
    }

    /** Ali sme klicatelj spremeniti vlogo cilja v novo vlogo. */
    static boolean mayChange(Role caller, Role target, Role newRole) {
        throw new UnsupportedOperationException("not implemented");
    }
}
