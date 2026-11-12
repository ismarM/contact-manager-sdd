package si.contactmanager.contact;

import java.util.List;

/** Odgovor {@code GET …/duplicates/compare} (data-model.md – Comparison). */
public record Comparison(List<CompareContact> contacts) {}
