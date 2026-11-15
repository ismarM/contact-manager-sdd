package si.contactmanager.audit;

import si.contactmanager.group.UserRef;

/**
 * Izvajalec v sledi te skupine (015, contracts/openapi.yaml – Actor): {@code id} je žeton za filter (ali {@code deleted}),
 * {@code user == null} za izbrisanega uporabnika.
 */
public record ActorView(String id, Kind kind, UserRef user) {

    /** Trenutni član, nekdanji član (ni več v skupini) ali izbrisan uporabnik. */
    public enum Kind {
        MEMBER,
        FORMER,
        DELETED
    }

    /** Žeton filtra za vse izbrisane uporabnike. */
    public static final String DELETED_TOKEN = "deleted";
}
