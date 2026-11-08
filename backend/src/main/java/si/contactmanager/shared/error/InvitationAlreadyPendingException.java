package si.contactmanager.shared.error;

/** Povabljeni že ima čakajoče povabilo v skupino – {@code 409 INVITATION_ALREADY_PENDING} (feature-map §2.10). */
public class InvitationAlreadyPendingException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InvitationAlreadyPendingException() {
        super("invitation already pending");
    }
}
