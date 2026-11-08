package si.contactmanager.audit;

/**
 * Spremenjeno polje kontakta (contracts/openapi.yaml – ChangeField); {@code before}/{@code after}: besedilo, seznam
 * ali null.
 */
public record ChangeField(Field field, String key, Object before, Object after) {

    /** Polja v vrstnem redu prikaza (R-03). */
    public enum Field {
        FIRST_NAME,
        LAST_NAME,
        ADDRESS,
        EMAIL,
        PHONE,
        ATTRIBUTE,
        TAGS
    }
}
