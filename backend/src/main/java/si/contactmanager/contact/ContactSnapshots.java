package si.contactmanager.contact;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Branje in uveljavljanje stanj več kontaktov skupine (research R-04, R-12). */
@Component
public class ContactSnapshots {

    /** Stanja izbranih kontaktov skupine; kontakti, ki jih ni, manjkajo v odgovoru. */
    public Map<UUID, ContactState> load(UUID groupId, Collection<UUID> ids) {
        return Map.of();
    }
}
