package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ExportApiTest;

/**
 * Izvoz je branje (FR-010-14): po uspehu, {@code 400}, {@code 404} in {@code 409 EXPORT_EMPTY} so verzije vseh
 * kontaktov skupine, njihove vrednosti in število vnosov revizijske sledi enaki kot pred izvozom.
 */
@Tag("FR-010-14")
class ExportReadOnlyIT extends ExportApiTest {

    @Test
    void successDoesNotChangeAnyContactNorTheAuditTrail() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 5, List.of("vip"), Map.of("podjetje", "FERI"));
        Snapshot before = readOnlySnapshot(s.group());

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(all.subList(0, 3), "sl"));

        assertThat(response.statusCode()).isEqualTo(200);
        assertUnchanged(before, readOnlySnapshot(s.group()));
    }

    @Test
    void validationNotFoundAndEmptyAnswersDoNotChangeAnything() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        UUID gone = contacts.insert(s.group(), s.id(Who.OWNER), "Izbrisan", "Kontakt");
        long version = contacts.version(gone);
        assertThat(delete(contactPath(s.group(), gone) + "?version=" + version, s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);
        Snapshot before = readOnlySnapshot(s.group());

        HttpResponse<byte[]> invalid = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(), "sl"));
        HttpResponse<byte[]> unknown =
                export(s.token(Who.EDITOR), s.group(), exportBody(List.of(all.get(0), UUID.randomUUID()), "sl"));
        HttpResponse<byte[]> nonMember = export(s.token(Who.NON_MEMBER), s.group(), exportBody(all, "sl"));
        HttpResponse<byte[]> empty = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(gone), "sl"));

        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(unknown.statusCode()).isEqualTo(404);
        assertThat(nonMember.statusCode()).isEqualTo(404);
        assertThat(empty.statusCode()).isEqualTo(409);
        assertUnchanged(before, readOnlySnapshot(s.group()));
    }
}
