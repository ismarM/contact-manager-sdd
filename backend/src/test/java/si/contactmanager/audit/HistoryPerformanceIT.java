package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.HistoryApiTest;

/**
 * Zmogljivost (SC-003, SC-007): prva stran zgodovine kontakta pri 100.000 vnosih in prva stran izbrisanih kontaktov pri
 * 10.000 izbrisanih; p95 pod 2 s. Podatki so vstavljeni neposredno v bazo.
 */
class HistoryPerformanceIT extends HistoryApiTest {

    private static final Duration LIMIT = Duration.ofSeconds(2);
    private static final int ROUNDS = 20;

    private long p95(Scenario s, String path) throws Exception {
        List<Long> times = new ArrayList<>();
        for (int i = 0; i < ROUNDS; i++) {
            long start = System.nanoTime();
            HttpResponse<String> response = get(path, s.token(Who.VIEWER));
            times.add((System.nanoTime() - start) / 1_000_000);
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        }
        Collections.sort(times);
        return times.get((int) Math.ceil(ROUNDS * 0.95) - 1);
    }

    @Test
    @Tag("SC-003")
    void theFirstPageOfAContactHistoryAppearsInUnderTwoSecondsWithHundredThousandEntries() throws Exception {
        Scenario s = scenario();
        audit.insertEntries(s.group(), s.id(Who.EDITOR), 100_000);
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        jdbc.update("analyze audit_entry");
        jdbc.update("analyze audit_change");
        // Še 30 sprememb istega kontakta, da ima stran vsebino.
        UUID contact = idOf(a);
        jdbc.update(
                "insert into audit_change (entry_id, position, contact_id, display_name, before, after)"
                        + " select e.id, 1, ?, 'Ana Prva', '{\"firstName\":\"A\",\"version\":0,\"createdAt\":\"2026-01-01T00:00:00Z\",\"updatedAt\":\"2026-01-01T00:00:00Z\",\"attributes\":[],\"tags\":[]}'::jsonb, '{\"firstName\":\"B\",\"version\":0,\"createdAt\":\"2026-01-01T00:00:00Z\",\"updatedAt\":\"2026-01-01T00:00:00Z\",\"attributes\":[],\"tags\":[]}'::jsonb"
                        + " from audit_entry e where e.group_id = ? order by e.seq desc offset 1 limit 30",
                contact,
                s.group());

        long millis = p95(s, historyPath(s.group(), contact));

        assertThat(millis).as("p95 [ms]").isLessThan(LIMIT.toMillis());
    }

    @Test
    @Tag("SC-007")
    void theFirstPageOfDeletedContactsAppearsInUnderTwoSecondsWithTenThousandDeleted() throws Exception {
        Scenario s = scenario();
        jdbc.update(
                "insert into audit_entry (group_id, seq, actor_id, action, contact_count, contact_name)"
                        + " select ?, g, ?, 'DELETE', 1, 'Kontakt ' || g from generate_series(1, 10000) g",
                s.group(),
                s.id(Who.EDITOR));
        jdbc.update(
                "insert into audit_change (entry_id, position, contact_id, display_name, before, after)"
                        + " select e.id, 0, uuidv7(), e.contact_name,"
                        + " jsonb_build_object('firstName', 'Kontakt', 'lastName', e.seq::text,"
                        + " 'email', 'k' || e.seq || '@primer.si'), null"
                        + " from audit_entry e where e.group_id = ?",
                s.group());
        jdbc.update(
                "insert into audit_head (group_id, last_seq, last_entry_id) select ?, e.seq, e.id from audit_entry e"
                        + " where e.group_id = ? order by e.seq desc limit 1",
                s.group(),
                s.group());
        jdbc.update("analyze audit_entry");
        jdbc.update("analyze audit_change");

        long plain = p95(s, deletedPath(s.group()));
        long searched = p95(s, deletedPath(s.group()) + "?q=k77");

        assertThat(deleted(s, Who.VIEWER, "").get("total")).isEqualTo(10_000);
        assertThat(plain).as("p95 brez iskanja [ms]").isLessThan(LIMIT.toMillis());
        assertThat(searched).as("p95 z iskanjem [ms]").isLessThan(LIMIT.toMillis());
    }
}
