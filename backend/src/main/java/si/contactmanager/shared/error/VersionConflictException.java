package si.contactmanager.shared.error;

/**
 * Poslana verzija ni več trenutna – {@code 409 VERSION_CONFLICT} s trenutnim stanjem vira v {@code current}
 * (feature-map §2.3, design.md 8.14).
 */
public class VersionConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient Object current;

    public VersionConflictException(Object current) {
        super("version conflict");
        this.current = current;
    }

    public Object current() {
        return current;
    }
}
