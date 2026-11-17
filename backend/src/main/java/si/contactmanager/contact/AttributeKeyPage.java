package si.contactmanager.contact;

import java.util.List;

/** Stran ključev atributov skupine (016; contracts/openapi.yaml – AttributeKeyPage). */
public record AttributeKeyPage(List<AttributeKeyView> items, int page, int size, long total) {}
