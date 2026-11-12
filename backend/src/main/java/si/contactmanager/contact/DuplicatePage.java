package si.contactmanager.contact;

import java.util.List;

/** Odgovor {@code GET …/duplicates} (data-model.md – DuplicatePage); {@code page} je 0-osno. */
public record DuplicatePage(String category, int total, int page, int size, List<DuplicateGroup> groups) {}
