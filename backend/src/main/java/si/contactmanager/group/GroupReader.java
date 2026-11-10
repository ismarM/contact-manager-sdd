package si.contactmanager.group;

import org.springframework.stereotype.Component;
import si.contactmanager.group.GroupAccess.Membership;

/**
 * Javni vmesnik za branje skupine iz drugih paketov (007, research R-08a): delegira na paketni {@link GroupService},
 * brez spremembe vedenja ali pogodbe 002. Uporablja ga prenos lastništva za odgovor {@code GroupDetail}.
 */
@Component
public class GroupReader {

    private final GroupService service;

    GroupReader(GroupService service) {
        this.service = service;
    }

    /** Skupina z vlogo člana ({@code NotFoundException}, če članstva ni več). */
    public GroupDetail read(Membership membership) {
        return service.read(membership);
    }
}
