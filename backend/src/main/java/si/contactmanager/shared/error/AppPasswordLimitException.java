package si.contactmanager.shared.error;

/** Uporabnik ima že največ aktivnih gesel za aplikacijo – {@code 409 APP_PASSWORD_LIMIT} (FR-014-21). */
public class AppPasswordLimitException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AppPasswordLimitException() {
        super("app password limit");
    }
}
