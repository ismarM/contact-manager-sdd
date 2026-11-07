package si.contactmanager.contact;

import java.util.List;

/** Stran kontaktov skupine (contracts/openapi.yaml – ContactPage). */
public record ContactPage(long total, int page, int size, List<ContactSummary> items) {}
