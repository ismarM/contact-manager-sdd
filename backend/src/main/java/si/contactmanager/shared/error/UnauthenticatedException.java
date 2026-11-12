package si.contactmanager.shared.error;

/** Uporabnik ne obstaja več (npr. sočasni izbris) – {@code 401 UNAUTHENTICATED} (012, FR-012-15). */
public class UnauthenticatedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public UnauthenticatedException() {
        super("unauthenticated");
    }
}
