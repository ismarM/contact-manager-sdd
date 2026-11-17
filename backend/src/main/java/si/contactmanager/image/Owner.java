package si.contactmanager.image;

import java.util.UUID;

/** Lastnik slike: uporabnik, skupina ali kontakt skupine (data-model.md – {@code image}). */
public record Owner(Kind kind, Long userId, UUID groupId, UUID contactId) {

    /** Vrsta lastnika; ime je vrednost stolpca {@code image.kind}. */
    public enum Kind {
        USER,
        GROUP,
        CONTACT
    }

    public static Owner user(long userId) {
        return new Owner(Kind.USER, userId, null, null);
    }

    public static Owner group(UUID groupId) {
        return new Owner(Kind.GROUP, null, groupId, null);
    }

    public static Owner contact(UUID groupId, UUID contactId) {
        return new Owner(Kind.CONTACT, null, groupId, contactId);
    }
}
