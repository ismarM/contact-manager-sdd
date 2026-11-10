package si.contactmanager.shared.error;

/** Zadnji član trajno arhivirane skupine zapušča skupino – {@code 409 LAST_MEMBER_CANNOT_LEAVE} (feature-map §2.10). */
public class LastMemberCannotLeaveException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public LastMemberCannotLeaveException() {
        super("last member cannot leave");
    }
}
