package si.contactmanager.group;

import java.util.List;

/** Stran seznama arhiviranih skupin (contracts/openapi.yaml – ArchivedGroups). */
public record ArchivedGroups(long total, int page, int size, List<ArchivedGroupSummary> items) {}
