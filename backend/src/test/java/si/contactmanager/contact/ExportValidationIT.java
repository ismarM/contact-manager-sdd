package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ExportApiTest;

/**
 * Preverjanje telesa izvoza (FR-010-13; research R-09): prazen izbor, več kot 10 000 identitet, neveljaven jezik in
 * preveč različnih ključev za en list so {@code 400 VALIDATION_FAILED} s telesom JSON, nikoli datoteka ali {@code 500}.
 */
@Tag("FR-010-13")
class ExportValidationIT extends ExportApiTest {

    /** Ključi »k00000« … razdeljeni po 50 na kontakt (kontakt n dobi ključe od 50·n); skupaj {@code total} ključev. */
    private void addKeys(UUID group, int total) {
        jdbc.update(
                "insert into contact_attribute (contact_id, position, key, key_norm, value)"
                        + " select c.id, n % 50, 'k' || lpad(n::text, 5, '0'), 'k' || lpad(n::text, 5, '0'), 'v'"
                        + " from generate_series(0, ? - 1) n"
                        + " join (select id, row_number() over (order by id) - 1 as rn from contact"
                        + " where group_id = ?) c on c.rn = n / 50",
                total, group);
    }

    private void assertValidationFailed(HttpResponse<byte[]> response, String field, String code) {
        assertThat(response.statusCode()).as(text(response)).isEqualTo(400);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("application/json");
        assertThat(json(text(response))).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(text(response))).containsEntry(field, code);
    }

    @Test
    void anEmptySelectionIsRequired() throws Exception {
        Scenario s = scenario();

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(), "sl"));

        assertValidationFailed(response, "contactIds", "REQUIRED");
        assertThat(json(text(response)))
                .isEqualTo(Map.of(
                        "code",
                        "VALIDATION_FAILED",
                        "errors",
                        List.of(Map.of("field", "contactIds", "code", "REQUIRED"))));
    }

    @Test
    void moreThanTenThousandIdentitiesAreTooMany() throws Exception {
        Scenario s = scenario();
        List<UUID> many =
                IntStream.rangeClosed(1, 10_001).mapToObj(i -> new UUID(0, i)).toList();

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(many, "sl"));

        assertValidationFailed(response, "contactIds", "TOO_MANY");
    }

    @Test
    void anInvalidLanguageIsRejected() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(a), "de"));

        assertValidationFailed(response, "language", "INVALID_VALUE");
    }

    @Test
    void tooManyDistinctKeysForOneSheetAreRejectedWithoutA500() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 330);
        addKeys(s.group(), 16_500);
        Snapshot before = readOnlySnapshot(s.group());

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(all, "sl"));

        assertValidationFailed(response, "contactIds", "TOO_MANY_COLUMNS");
        assertUnchanged(before, readOnlySnapshot(s.group()));
    }

    @Test
    void exactly16378DistinctKeysStillFitIntoTheSheetOf16384Columns() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 328);
        addKeys(s.group(), 16_378);

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(all, "sl"));

        assertThat(response.statusCode()).isEqualTo(200);
        var file = workbook(response);
        assertThat(file.columns()).isEqualTo(16_384);
        assertThat(file.rows()).hasSize(329);
    }

    @Test
    void invalidBodiesAreAlwaysJsonErrorsNeverAFile() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos");

        for (String body : List.of("ni json", "[]", "{}", "{\"contactIds\":[\"" + a + "\"]}")) {
            HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), body);
            assertThat(response.statusCode()).as(body).isEqualTo(400);
            assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("application/json");
            assertThat(json(text(response))).containsEntry("code", "VALIDATION_FAILED");
        }
    }
}
