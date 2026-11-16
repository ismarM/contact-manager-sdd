package si.contactmanager.audit;

/**
 * Spremenjeno polje kontakta (contracts/openapi.yaml – ChangeField); {@code before}/{@code after}: besedilo, seznam
 * ali null. Pri {@code ADDRESS} je to besedilo nerazčlenjenega naslova ali {@code Address} (deli); pri
 * {@code ATTRIBUTE} {@link AttributeValue} s tipom (016, FR-016-26).
 */
public record ChangeField(Field field, String key, Object before, Object after) {

    /** Polja v vrstnem redu prikaza (R-03). */
    public enum Field {
        FIRST_NAME,
        LAST_NAME,
        ADDRESS,
        EMAIL,
        PHONE,
        COUNTRY,
        COMPANY,
        ATTRIBUTE,
        TAGS
    }
}
