package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/**
 * Telo {@code 409 ATTRIBUTE_TYPE_CONFLICT} (016, FR-016-05): kontakti, katerih vrednost ni veljavna za novi tip
 * (največ 100) in skupno število takih kontaktov.
 */
public record TypeConflict(List<Item> contacts, long total) {

    /** Kontakt z vrednostjo, ki je novi tip ne sprejme. */
    public record Item(UUID contactId, String displayName, String value) {}
}
