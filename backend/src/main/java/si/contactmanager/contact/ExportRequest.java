package si.contactmanager.contact;

import java.util.List;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ContactQuery.Field;

/** Veljavno telo izvoza (010, data-model.md): identitete brez podvojenih, razvrstitev kot v 008 in jezik datoteke. */
public record ExportRequest(List<java.util.UUID> contactIds, Field sort, Direction dir, String language) {

    public ExportRequest {
        contactIds = List.copyOf(contactIds);
    }
}
