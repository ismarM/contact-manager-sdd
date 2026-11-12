package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Zmogljivost množičnih operacij nad 10 000 kontakti (SC-002, FR-009-04; research R-07): 2 ogrevalni in 20 merjenih
 * urejanj, 5 merjenih zavrnitev in en izbris; p95 po najbližjem rangu in vsaka zavrnitev pod 15 000 ms.
 */
@Tag("SC-002")
@Tag("FR-009-04")
class BulkPerformanceIT extends BulkApiTest {

    private static final long LIMIT_MS = 15_000;

    private static long percentile(List<Long> sorted, double p) {
        int rank = (int) Math.ceil(p * sorted.size());
        return sorted.get(Math.max(0, rank - 1));
    }

    private long timed(Runnable action) {
        long start = System.nanoTime();
        action.run();
        return (System.nanoTime() - start) / 1_000_000;
    }

    @Test
    void tenThousandContactsAreUpdatedRejectedAndDeletedWithin15Seconds() throws Exception {
        Scenario s = scenario();
        Map<String, String> attributes = new LinkedHashMap<>();
        attributes.put("k1", "v1");
        attributes.put("k2", "v2");
        attributes.put("k3", "v3");
        List<UUID> all = contacts.insertManyWithTagsAndAttributes(
                s.group(), s.id(Who.OWNER), 10_000, List.of("t1", "t2", "t3"), attributes);
        String token = s.token(Who.EDITOR);

        for (int i = 0; i < 2; i++) {
            runUpdate(token, s, all, i);
        }
        List<Long> durations = new ArrayList<>();
        for (int i = 2; i < 22; i++) {
            int round = i;
            durations.add(timed(() -> runUpdate(token, s, all, round)));
        }
        Collections.sort(durations);
        long p50 = percentile(durations, 0.5);
        long p95 = percentile(durations, 0.95);
        long max = durations.get(durations.size() - 1);

        // Zavrnitve: en kontakt ima 30 značk, dodajanje nove ga prekorači (FR-009-09) – nič se ne spremeni.
        UUID full = all.get(0);
        for (int i = 4; i <= 30; i++) {
            contacts.addTag(full, i - 1, "t" + i);
        }
        List<Long> rejections = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            rejections.add(timed(() -> {
                try {
                    HttpResponse<String> response =
                            bulkUpdate(token, s.group(), request(all, "addTags", List.of("nova")));
                    assertThat(response.statusCode()).isEqualTo(400);
                    assertThat(asObjects(json(response.body()).get("contacts"))).hasSize(1);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }));
        }
        long deleteMs = timed(() -> {
            try {
                HttpResponse<String> response = bulkDelete(token, s.group(), request(all));
                assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
                assertThat(json(response.body())).containsEntry("deleted", 10_000);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        System.out.printf(
                "BulkPerformanceIT SC-002: bulk-update 10000 kontaktov p50=%d ms, p95=%d ms, največ=%d ms;"
                        + " zavrnitve %s ms; bulk-delete %d ms%n",
                p50, p95, max, rejections, deleteMs);
        assertThat(p95).as("p95 množičnega urejanja").isLessThan(LIMIT_MS);
        assertThat(rejections).as("zavrnitve").allSatisfy(ms -> assertThat(ms).isLessThan(LIMIT_MS));
        assertThat(deleteMs).as("množični izbris").isLessThan(LIMIT_MS);
        assertThat(contacts.count(s.group())).isZero();
    }

    /** Izmenično doda (sode ponovitve) in odstrani (lihe) značko {@code meritev} vsem kontaktom. */
    private void runUpdate(String token, Scenario s, List<UUID> all, int round) {
        try {
            Map<String, Object> request = round % 2 == 0
                    ? request(all, "addTags", List.of("meritev"))
                    : request(all, "removeTags", List.of("meritev"));
            HttpResponse<String> response = bulkUpdate(token, s.group(), request);
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            assertThat(json(response.body())).containsEntry("changed", 10_000);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
