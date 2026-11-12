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
 * Izbrisani kontakti med izborom in izvozom (FR-010-11; research R-05): izpustijo se in štejejo v
 * {@code X-Export-Skipped}; če ne ostane noben, je {@code 409 EXPORT_EMPTY}; nikoli {@code SELECTION_CHANGED}.
 * Združevanje (011) še ni izvedeno; primer združenega kontakta doda 011 v ta razred (D-90).
 */
@Tag("FR-010-11")
class ExportSkippedIT extends ExportApiTest {

    private void deleteViaApi(Scenario s, UUID id) throws Exception {
        long version = contacts.version(id);
        assertThat(delete(contactPath(s.group(), id) + "?version=" + version, s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);
    }

    @Test
    void aDeletedContactIsSkippedAndCounted() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Avsec");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Bizjak");
        UUID c = contacts.insert(s.group(), s.id(Who.OWNER), "Cene", "Cerar");
        deleteViaApi(s, b);

        HttpResponse<byte[]> response = export(s.token(Who.VIEWER), s.group(), exportBody(List.of(a, b, c), "sl"));

        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        assertThat(response.headers().firstValue("X-Export-Count")).contains("2");
        assertThat(response.headers().firstValue("X-Export-Skipped")).contains("1");
        assertThat(workbook(response).rows())
                .containsExactly(
                        List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "Značke"),
                        List.of("Ana", "Avsec", "", "", "", ""),
                        List.of("Cene", "Cerar", "", "", "", ""));
    }

    @Test
    void aContactRemovedByAnAuditRollbackIsSkippedToo() throws Exception {
        Scenario s = scenario();
        UUID a = UUID.fromString((String) createViaApi(s, input("Ana", "Prva")).get("id"));
        UUID afterFirst = audit.latestEntryId(s.group());
        UUID b = UUID.fromString(
                (String) createViaApi(s, input("Bojan", "Drugi")).get("id"));
        rollbackTo(s, afterFirst);
        assertThat(contacts.exists(b)).isFalse();

        HttpResponse<byte[]> response = export(s.token(Who.VIEWER), s.group(), exportBody(List.of(a, b), "sl"));

        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        assertThat(response.headers().firstValue("X-Export-Count")).contains("1");
        assertThat(response.headers().firstValue("X-Export-Skipped")).contains("1");
        assertThat(workbook(response).rows()).hasSize(2);
    }

    @Test
    void ifAllSelectedContactsAreDeletedTheAnswerIs409ExportEmptyWithoutAFile() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        for (UUID id : all) {
            deleteViaApi(s, id);
        }
        Snapshot before = readOnlySnapshot(s.group());

        HttpResponse<byte[]> response = export(s.token(Who.VIEWER), s.group(), exportBody(all, "sl"));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("application/json");
        assertThat(json(text(response))).isEqualTo(Map.of("code", "EXPORT_EMPTY"));
        assertUnchanged(before, readOnlySnapshot(s.group()));
    }

    @Test
    void theAnswerIsNeverSelectionChanged() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Avsec");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Bizjak");
        deleteViaApi(s, b);

        HttpResponse<byte[]> some = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(a, b), "sl"));
        HttpResponse<byte[]> none = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(b), "sl"));

        assertThat(some.statusCode()).isEqualTo(200);
        assertThat(none.statusCode()).isEqualTo(409);
        assertThat(text(none)).doesNotContain("SELECTION_CHANGED");
    }
}
