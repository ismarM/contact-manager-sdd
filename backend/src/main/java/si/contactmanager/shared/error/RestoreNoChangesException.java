package si.contactmanager.shared.error;

/** Obnova ne bi spremenila nobenega polja kontakta – {@code 409 RESTORE_NO_CHANGES} (feature-map §2.10). */
public class RestoreNoChangesException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public RestoreNoChangesException() {
        super("restore would change nothing");
    }
}
