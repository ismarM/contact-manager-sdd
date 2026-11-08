package si.contactmanager.shared.error;

/** Povabljeni je že član skupine – {@code 409 ALREADY_MEMBER} (feature-map §2.10). */
public class AlreadyMemberException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AlreadyMemberException() {
        super("already member");
    }
}
