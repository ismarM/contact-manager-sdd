package si.contactmanager.group;

import java.util.List;

/** Odgovor {@code GET /api/groups} (contracts/openapi.yaml – GroupSections). */
public record GroupSections(List<GroupSection> sections) {}
