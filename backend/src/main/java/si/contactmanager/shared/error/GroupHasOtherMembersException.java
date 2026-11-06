package si.contactmanager.shared.error;

/** Izbris skupine z več kot enim članom – {@code 409 GROUP_HAS_OTHER_MEMBERS} (feature-map §2.10). */
public class GroupHasOtherMembersException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public GroupHasOtherMembersException() {
        super("group has other members");
    }
}
