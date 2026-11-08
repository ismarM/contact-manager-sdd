package si.contactmanager.audit;

import java.util.List;
import si.contactmanager.contact.ContactState;

/** Izpeljava spremenjenih polj iz stanj prej/potem (research R-03). */
final class ChangeDiff {

    private ChangeDiff() {}

    static List<ChangeField> fields(ContactState before, ContactState after) {
        return List.of();
    }
}
