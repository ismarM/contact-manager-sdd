package si.contactmanager.audit;

import java.util.List;

/** Stran sprememb vnosa (contracts/openapi.yaml – ChangePage). */
public record ChangePage(long total, int page, int size, List<ContactChangeView> items) {}
