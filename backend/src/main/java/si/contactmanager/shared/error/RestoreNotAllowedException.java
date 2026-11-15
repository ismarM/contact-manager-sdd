package si.contactmanager.shared.error;

/** Kontakt je bil z združevanjem odstranjen in ga ni mogoče neposredno obnoviti – {@code 409 RESTORE_NOT_ALLOWED}. */
public class RestoreNotAllowedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public RestoreNotAllowedException() {
        super("merged contact cannot be restored directly");
    }
}
