package si.contactmanager.shared.error;

/** Vloga člana je pod najnižjo dovoljeno – {@code 403 FORBIDDEN} (feature-map §2.2, D-25). */
public class ForbiddenException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ForbiddenException() {
        super("forbidden");
    }
}
