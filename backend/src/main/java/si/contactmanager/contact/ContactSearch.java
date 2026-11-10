package si.contactmanager.contact;

import java.util.Map;
import java.util.UUID;

/**
 * Gradnik poizvedb seznama kontaktov (specs/008-iskanje/research.md R-04, R-05, R-13): besedilo SQL iz zaprtih
 * fragmentov, vse vrednosti kot imenovani parametri.
 */
public final class ContactSearch {

    /** Besedilo SQL in imenovani parametri. */
    public record Sql(String text, Map<String, Object> parameters) {}

    private ContactSearch() {}

    /** Poizvedba strani kontaktov (brez značk strani). */
    public static Sql page(UUID group, ContactQuery query) {
        throw new UnsupportedOperationException("008-iskanje: še ni izvedeno");
    }

    /** Poizvedba skupnega števila zadetkov. */
    public static Sql count(UUID group, ContactQuery query) {
        throw new UnsupportedOperationException("008-iskanje: še ni izvedeno");
    }
}
