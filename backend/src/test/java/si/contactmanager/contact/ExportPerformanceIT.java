package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ExportApiTest;

/**
 * Zmogljivost izvoza 10 000 kontaktov (SC-002, FR-010-13; research R-11): vsak kontakt ima 5 dodatnih atributov (20
 * različnih ključev) in 3 značke; 2 ogrevalna in 10 merjenih izvozov, p95 po najbližjem rangu pod 10 000 ms do zadnjega
 * bajta (brez omrežja).
 */
@Tag("SC-002")
@Tag("FR-010-13")
class ExportPerformanceIT extends ExportApiTest {

    private static final long LIMIT_MS = 10_000;

    private static long percentile(List<Long> sorted, double p) {
        int rank = (int) Math.ceil(p * sorted.size());
        return sorted.get(Math.max(0, rank - 1));
    }

    @Test
    void tenThousandContactsAreExportedWithin10Seconds() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 10_000, List.of("t1", "t2", "t3"), Map.of());
        jdbc.update(
                "insert into contact_attribute (contact_id, position, key, key_norm, value)"
                        + " select c.id, j, 'k' || lpad(((c.rn + j) % 20)::text, 2, '0'),"
                        + " 'k' || lpad(((c.rn + j) % 20)::text, 2, '0'), 'vrednost ' || c.rn"
                        + " from (select id, row_number() over (order by id) as rn from contact where group_id = ?) c"
                        + " cross join generate_series(0, 4) j",
                s.group());
        String token = s.token(Who.VIEWER);
        String request = body(exportBody(all, "sl"));

        for (int i = 0; i < 2; i++) {
            assertThat(send(exportPath(s.group()), token, request).statusCode()).isEqualTo(200);
        }
        List<Long> durations = new ArrayList<>();
        HttpResponse<byte[]> last = null;
        for (int i = 0; i < 10; i++) {
            long start = System.nanoTime();
            last = send(exportPath(s.group()), token, request);
            durations.add((System.nanoTime() - start) / 1_000_000);
            assertThat(last.statusCode()).isEqualTo(200);
        }
        Collections.sort(durations);
        long p50 = percentile(durations, 0.5);
        long p95 = percentile(durations, 0.95);
        long max = durations.get(durations.size() - 1);

        assertThat(workbook(last).rows()).hasSize(10_001);
        System.out.printf(
                "ExportPerformanceIT SC-002: izvoz 10000 kontaktov (5 atributov, 3 značke) p50=%d ms, p95=%d ms,"
                        + " največ=%d ms%n",
                p50, p95, max);
        assertThat(p95).as("p95 izvoza 10 000 kontaktov (ms)").isLessThan(LIMIT_MS);
    }
}
