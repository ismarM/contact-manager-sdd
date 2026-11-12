package si.contactmanager.contact;

import java.util.List;

/** Skupina dvojnikov z vsaj dvema kontaktoma (data-model.md – DuplicateGroup); prvi kontakt je ohranjen ob združitvi. */
public record DuplicateGroup(Reason reason, int size, List<DuplicateContact> contacts) {

    /** Razlog ujemanja: kategorija in nenormalizirana vrednost prvega kontakta. */
    public record Reason(String category, String value) {}
}
