package si.contactmanager.audit;

import java.util.List;
import java.util.UUID;

/** Prizadeti kontakt v vnosu s spremenjenimi polji (contracts/openapi.yaml – ContactChange). */
public record ContactChangeView(UUID contactId, String displayName, Kind kind, List<ChangeField> fields) {

    /** ADDED: stolpec Prej prazen; REMOVED: stolpec Potem prazen. */
    public enum Kind {
        ADDED,
        REMOVED,
        CHANGED
    }
}
