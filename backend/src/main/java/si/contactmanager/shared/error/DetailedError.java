package si.contactmanager.shared.error;

/** Telo napake s kodo in podrobnostmi (016: {@code ATTRIBUTE_TYPE_CONFLICT}). */
public record DetailedError(String code, Object details) {}
