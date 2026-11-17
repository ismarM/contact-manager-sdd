package si.contactmanager.shared.error;

/** Preveč zahtevkov ali zasedena obdelava – {@code 429 RATE_LIMITED} (018, research R-03, R-09). */
public class RateLimitedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public RateLimitedException() {
        super("rate limited");
    }
}
