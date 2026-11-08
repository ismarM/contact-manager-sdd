package si.contactmanager.contact;

import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/** Oznaka »Povrnjeno« na kontaktu (contracts/openapi.yaml – RevertInfo, FR-005-19). */
public record RevertInfo(
        UUID rollbackEntryId,
        Instant rolledBackAt,
        UserRef rolledBackBy,
        UUID targetEntryId,
        Instant targetAt,
        boolean targetInitial) {}
