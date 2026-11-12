package si.contactmanager.account;

import java.util.List;

/** Telo {@code GET /api/me/deletion-blockers} (contracts/openapi.yaml). */
public record DeletionBlockers(List<BlockingGroup> groups) {}
