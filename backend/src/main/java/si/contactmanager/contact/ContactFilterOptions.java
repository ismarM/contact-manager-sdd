package si.contactmanager.contact;

import java.util.List;

/** Možnosti filtrov skupine (contracts/openapi.yaml – ContactFilterOptions): dodatni ključi in značke skupine. */
public record ContactFilterOptions(List<String> keys, List<String> tags) {}
