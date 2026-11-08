package si.contactmanager.shared.error;

/** Rollback ne bi spremenil nobenega kontakta – {@code 409 ROLLBACK_NO_CHANGES} (feature-map §2.10). */
public class RollbackNoChangesException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public RollbackNoChangesException() {
        super("rollback would change nothing");
    }
}
