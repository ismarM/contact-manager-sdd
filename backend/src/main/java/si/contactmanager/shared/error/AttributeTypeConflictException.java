package si.contactmanager.shared.error;

/**
 * Sprememba tipa ključa atributa bi pustila neveljavne vrednosti (016, FR-016-05): {@code 409 ATTRIBUTE_TYPE_CONFLICT}
 * s podrobnostmi ({@code total} in največ 100 kontaktov). Podrobnosti so neprosojne, da {@code shared} ne zavisi od
 * funkcionalnosti.
 */
public class AttributeTypeConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient Object details;

    public AttributeTypeConflictException(Object details) {
        super("attribute type conflict");
        this.details = details;
    }

    public Object details() {
        return details;
    }
}
