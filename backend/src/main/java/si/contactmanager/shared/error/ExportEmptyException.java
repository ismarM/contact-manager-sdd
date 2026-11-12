package si.contactmanager.shared.error;

/** Noben od izbranih kontaktov ne obstaja več – {@code 409 EXPORT_EMPTY}, datoteka se ne ustvari (FR-010-11). */
public class ExportEmptyException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ExportEmptyException() {
        super("export empty");
    }
}
