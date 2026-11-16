package si.contactmanager.contact;

import java.time.Instant;
import java.util.UUID;

/**
 * Kontakt skupine za iskanje dvojnikov (data-model.md – DuplicateCandidate): samo polja, ki jih ujemanje potrebuje;
 * {@code country} (koda ali {@code null}) določa območje za normalizacijo starega telefona pri primerjavi (016).
 */
record DuplicateCandidate(
        UUID id, String firstName, String lastName, String email, String phone, String country, Instant createdAt) {

    DuplicateCandidate(UUID id, String firstName, String lastName, String email, String phone, Instant createdAt) {
        this(id, firstName, lastName, email, phone, null, createdAt);
    }
}
