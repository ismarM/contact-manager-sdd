package si.contactmanager.shared.error;

/** Povabljeni nima profila – {@code 409 INVITEE_NOT_REGISTERED} (feature-map §2.10). */
public class InviteeNotRegisteredException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InviteeNotRegisteredException() {
        super("invitee not registered");
    }
}
