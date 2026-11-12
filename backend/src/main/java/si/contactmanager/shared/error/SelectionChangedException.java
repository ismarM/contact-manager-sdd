package si.contactmanager.shared.error;

import java.util.List;
import java.util.UUID;

/** Izbrani kontakti skupine, ki ne obstajajo več; rokovalnik (T033) vrne {@code 409 SELECTION_CHANGED}. */
public class SelectionChangedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient List<UUID> missing;

    public SelectionChangedException(List<UUID> missing) {
        super("selection changed");
        this.missing = List.copyOf(missing);
    }

    public List<UUID> missing() {
        return missing;
    }
}
