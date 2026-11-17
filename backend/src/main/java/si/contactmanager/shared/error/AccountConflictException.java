package si.contactmanager.shared.error;

/** E-naslov je že pri profilu drugega Firebase UID – {@code 409 ACCOUNT_CONFLICT} (FR-017-11, feature-map §2.10). */
public class AccountConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AccountConflictException() {
        super("email already belongs to another account");
    }
}
