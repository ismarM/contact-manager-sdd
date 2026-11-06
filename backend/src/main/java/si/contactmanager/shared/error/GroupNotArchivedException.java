package si.contactmanager.shared.error;

/** Odarhiviranje skupine, ki ni arhivirana – {@code 409 GROUP_NOT_ARCHIVED} (feature-map §2.10). */
public class GroupNotArchivedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public GroupNotArchivedException() {
        super("group not archived");
    }
}
