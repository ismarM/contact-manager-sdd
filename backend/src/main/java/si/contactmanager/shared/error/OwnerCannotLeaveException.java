package si.contactmanager.shared.error;

/** Lastnik zapušča skupino – {@code 409 OWNER_CANNOT_LEAVE} (feature-map §2.10). */
public class OwnerCannotLeaveException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public OwnerCannotLeaveException() {
        super("owner cannot leave");
    }
}
