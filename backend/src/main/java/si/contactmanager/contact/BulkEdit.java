package si.contactmanager.contact;

import java.util.List;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Čista funkcija množičnega urejanja (research R-04). Ogrodje: izvedba v nalogi T032. */
public final class BulkEdit {

    private BulkEdit() {}

    /** Končno stanje kontakta: odstrani značke → dodaj značke → nastavi atribute. */
    public static ContactState apply(ContactState before, BulkEditInput edit) {
        throw new UnsupportedOperationException("T032");
    }

    /** Ali se vsebina (polja, atributi, značke v vrstnem redu) razlikuje; metapodatki se ne primerjajo. */
    public static boolean changed(ContactState before, ContactState after) {
        throw new UnsupportedOperationException("T032");
    }

    /** Napake končnega stanja: {@code tags} in {@code attributes} {@code TOO_MANY}. */
    public static List<FieldError> violations(ContactState after) {
        throw new UnsupportedOperationException("T032");
    }
}
