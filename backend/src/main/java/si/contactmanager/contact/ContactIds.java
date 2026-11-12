package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/**
 * Odgovor {@code GET …/contact-ids} (contracts/openapi.yaml – ContactIds): pri več kot 10 000 zadetkih je {@code ids}
 * prazen in {@code truncated} resničen.
 */
public record ContactIds(long total, boolean truncated, List<UUID> ids) {}
