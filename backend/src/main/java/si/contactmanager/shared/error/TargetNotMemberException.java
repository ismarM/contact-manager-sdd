package si.contactmanager.shared.error;

/** Cilj prenosa lastništva ni član skupine – {@code 409 TARGET_NOT_MEMBER} (feature-map §2.10). */
public class TargetNotMemberException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public TargetNotMemberException() {
        super("target not member");
    }
}
