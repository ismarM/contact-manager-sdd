package si.contactmanager.shared.error;

/** Zunanja kartografska storitev je nedosegljiva, počasna ali omejena (016, FR-016-23): {@code 503 MAP_SERVICE_UNAVAILABLE}. */
public class MapServiceUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public MapServiceUnavailableException() {
        super("map service unavailable");
    }
}
