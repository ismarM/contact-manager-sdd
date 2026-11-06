package si.contactmanager.shared.error;

/** Vir ne obstaja ali uporabnik nima dostopa – {@code 404} brez telesa, obstoj se ne razkrije (feature-map §2.2). */
public class NotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public NotFoundException() {
        super("not found");
    }
}
