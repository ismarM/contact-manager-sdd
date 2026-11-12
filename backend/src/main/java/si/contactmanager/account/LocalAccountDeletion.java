package si.contactmanager.account;

import org.springframework.stereotype.Component;

/** Lokalni izbris v eni kratki transakciji (R-04, R-05). Ogrodje – vedenje pride z implementacijo. */
@Component
class LocalAccountDeletion {

    /** Vrne Firebase UID izbrisanega uporabnika. */
    String execute(long user, String email) {
        throw new UnsupportedOperationException("not implemented: LocalAccountDeletion.execute (FR-012-13)");
    }
}
