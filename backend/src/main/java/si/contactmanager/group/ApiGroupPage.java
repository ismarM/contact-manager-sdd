package si.contactmanager.group;

import java.util.List;

/** Stran seznama skupin v API (contracts/openapi.yaml – ApiGroupPage). */
public record ApiGroupPage(long total, int page, int size, List<ApiGroup> items) {}
