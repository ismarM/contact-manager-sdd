package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/** Zahtevek in odgovor {@code POST …/contacts/selection-check} (data-model.md – SelectionCheck). */
public final class SelectionCheck {

    private SelectionCheck() {}

    /** Poizvedba »Izberi vse zadetke« z identitetami, ki jih je dodala, in ročno odznačenimi. */
    public record Query(String q, List<String> f, List<String> tag, List<UUID> contactIds, List<UUID> excludedIds) {}

    public record Request(List<UUID> contactIds, List<Query> queries) {}

    public record QueryResult(List<UUID> newMatches, List<UUID> noLongerMatching) {}

    public record Result(boolean changed, List<UUID> missing, List<QueryResult> queries) {}
}
