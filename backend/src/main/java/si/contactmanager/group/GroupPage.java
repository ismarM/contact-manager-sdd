package si.contactmanager.group;

import java.util.List;

/** Odgovor {@code GET /api/groups} (020, contracts/openapi.yaml – GroupPage). */
public record GroupPage(long total, int page, int size, List<GroupSummary> items) {}
