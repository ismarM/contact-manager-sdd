package si.contactmanager.group;

import java.util.List;

/** Razdelek seznama po vlogi (contracts/openapi.yaml – GroupSection). */
public record GroupSection(Role role, long total, int page, int size, List<GroupSummary> items) {}
