package si.contactmanager.shared.error;

/** Uporabnik ima že največ aktivnih API ključev – {@code 409 API_KEY_LIMIT} (019, FR-019-01). */
public class ApiKeyLimitException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ApiKeyLimitException() {
        super("api key limit");
    }
}
