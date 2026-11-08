package si.contactmanager.shared.error;

/** Povabilo samega sebe – {@code 409 CANNOT_INVITE_SELF} (feature-map §2.10). */
public class CannotInviteSelfException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public CannotInviteSelfException() {
        super("cannot invite self");
    }
}
