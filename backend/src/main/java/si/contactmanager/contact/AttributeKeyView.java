package si.contactmanager.contact;

/** Ključ atributa skupine s tipom, številom kontaktov in verzijo (016; contracts/openapi.yaml – AttributeKey). */
public record AttributeKeyView(String key, AttributeType type, long contactCount, long version) {}
