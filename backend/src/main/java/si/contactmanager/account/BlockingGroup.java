package si.contactmanager.account;

import java.util.UUID;

/** Nearhivirana skupina v lasti, ki preprečuje izbris računa (FR-012-06). {@code id} je UUID skupine. */
public record BlockingGroup(UUID id, String title) {}
