package si.contactmanager.shared.error;

import java.util.List;
import si.contactmanager.account.BlockingGroup;

/** Izbris računa lastnika nearhivirane skupine – {@code 409 OWNS_ACTIVE_GROUPS} s seznamom skupin (feature-map §2.10). */
public class OwnsActiveGroupsException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient List<BlockingGroup> groups;

    public OwnsActiveGroupsException(List<BlockingGroup> groups) {
        super("owns active groups");
        this.groups = List.copyOf(groups);
    }

    public List<BlockingGroup> groups() {
        return groups;
    }
}
