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
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Zmogljivost iskanja dvojnikov nad 5000 kontakti (SC-002, FR-011-07): 1000 parov z enakim e-naslovom, imenom in
 * telefonom, vsak kontakt z dvema znački; po 2 ogrevalni in 20 merjenih iskanj za vsako kategorijo; p95 po najbližjem
 * rangu za prvo stran (25 skupin) pod 3000 ms.
 */
@Tag("SC-002")
@Tag("FR-011-07")
class DuplicatePerformanceIT extends DuplicateApiTest {

    private static final long LIMIT_MS = 3_000;
    private static final int PAIRS = 1_000;

    private static long percentile(List<Long> sorted, double p) {
        int rank = (int) Math.ceil(p * sorted.size());
        return sorted.get(Math.max(0, rank - 1));
    }

    private long search(String token, UUID group, String category) throws Exception {
        long start = System.nanoTime();
        HttpResponse<String> response = duplicates(token, group, "category", category);
        long ms = (System.nanoTime() - start) / 1_000_000;
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> page = json(response.body());
        assertThat(page).as(category).containsEntry("total", PAIRS);
        List<Map<String, Object>> groups = asObjects(page.get("groups"));
        assertThat(groups).as(category).hasSize(25);
        assertThat(groups).as(category).allSatisfy(g -> assertThat(g).containsEntry("size", 2));
        return ms;
    }

    @Test
    void searchingFiveThousandContactsTakesLessThanThreeSecondsAtP95() throws Exception {
        Scenario s = scenario();
        contacts.insertManyWithTagsAndAttributes(s.group(), s.id(Who.OWNER), 5_000, List.of("t1", "t2"), Map.of());
        // prvih 2000 kontaktov (po imenu) tvori 1000 parov z enakim e-naslovom, imenom in telefonom
        jdbc.update(
                "with ranked as (select id, row_number() over (order by first_name) rn from contact where group_id = ?)"
                        + " update contact c set email = 'par' || lpad(((r.rn - 1) / 2)::text, 4, '0') || '@primer.si',"
                        + " phone = '041 ' || lpad(((r.rn - 1) / 2)::text, 6, '0'),"
                        + " first_name = 'Par' || lpad(((r.rn - 1) / 2)::text, 4, '0'),"
                        + " last_name = 'Dvojnik' from ranked r where c.id = r.id and r.rn <= ?",
                s.group(),
                2 * PAIRS);
        String token = s.token(Who.EDITOR);

        Map<String, List<Long>> measured = new java.util.LinkedHashMap<>();
        for (String category : List.of("email", "name", "phone")) {
            for (int i = 0; i < 2; i++) {
                search(token, s.group(), category);
            }
            List<Long> durations = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                durations.add(search(token, s.group(), category));
            }
            Collections.sort(durations);
            measured.put(category, durations);
        }

        StringBuilder report = new StringBuilder();
        measured.forEach((category, durations) -> report.append(String.format(
                " %s p50=%d ms, p95=%d ms, največ=%d ms;",
                category,
                percentile(durations, 0.5),
                percentile(durations, 0.95),
                durations.get(durations.size() - 1))));
        System.out.printf(
                "DuplicatePerformanceIT SC-002: iskanje dvojnikov 5000 kontaktov (1000 skupin) –%s okolje: %d CPU, %s, Java %s%n",
                report,
                Runtime.getRuntime().availableProcessors(),
                System.getProperty("os.name"),
                System.getProperty("java.version"));
        measured.forEach((category, durations) -> assertThat(percentile(durations, 0.95))
                .as("p95 iskanja " + category)
                .isLessThan(LIMIT_MS));
    }
}
