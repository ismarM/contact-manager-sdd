package si.contactmanager.audit;

import java.util.UUID;
import si.contactmanager.contact.ContactState;

/**
 * Sprememba enega kontakta v vnosu (pogodba {@link AuditLog#record}). {@code before == null}: kontakt je nastal ali bil
 * obnovljen; {@code after == null}: kontakt je bil odstranjen.
 */
public record ContactChange(UUID contactId, String displayName, ContactState before, ContactState after) {}
