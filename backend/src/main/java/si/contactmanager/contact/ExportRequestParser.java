package si.contactmanager.contact;

import java.util.Set;
import java.util.UUID;
import si.contactmanager.contact.BulkInputParser.Parsed;
import tools.jackson.databind.json.JsonMapper;

/** Razčlenitev telesa izvoza (010, data-model.md – ExportRequest); nikoli ne vrže. */
public final class ExportRequestParser {

    public ExportRequestParser() {
        this(JsonMapper.builder().build());
    }

    public ExportRequestParser(JsonMapper json) {}

    public Parsed<ExportRequest> parse(String body) {
        throw new UnsupportedOperationException("ExportRequestParser.parse");
    }

    /** Veljavne identitete za korak 404; pri več kot 10 000 različnih {@code null}. */
    public Set<UUID> identities(String body) {
        throw new UnsupportedOperationException("ExportRequestParser.identities");
    }
}
