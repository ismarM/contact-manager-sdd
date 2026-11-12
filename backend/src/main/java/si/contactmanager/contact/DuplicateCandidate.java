package si.contactmanager.contact;

import java.time.Instant;
import java.util.UUID;

/** Kontakt skupine za iskanje dvojnikov (data-model.md – DuplicateCandidate): samo polja, ki jih ujemanje potrebuje. */
record DuplicateCandidate(UUID id, String firstName, String lastName, String email, String phone, Instant createdAt) {}
