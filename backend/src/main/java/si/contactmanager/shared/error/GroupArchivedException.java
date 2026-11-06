package si.contactmanager.shared.error;

/** Pisanje v arhivirani skupini – {@code 409 GROUP_ARCHIVED} (feature-map §2.2, §2.4). */
public class GroupArchivedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public GroupArchivedException() {
        super("group archived");
    }
}
