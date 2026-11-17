package si.contactmanager.shared.error;

/** Občutljiva operacija zahteva svežo prijavo – {@code 403 REAUTHENTICATION_REQUIRED} (FR-017-12). */
public class ReauthenticationRequiredException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ReauthenticationRequiredException() {
        super("recent authentication required");
    }
}
