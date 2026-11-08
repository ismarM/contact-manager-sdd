package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.AuditApiTest;

/**
 * Sočasnost rollbacka (FR-005-13, FR-005-14): optimistično zaklepanje na najnovejši vnos celotne sledi, izključitev
 * s sočasnimi pisanji in arhiviranjem, veriga stanj ostane skladna, brez zastojev.
 */
class AuditRollbackConcurrencyIT extends AuditApiTest {

    /** Zažene naloge hkrati (vrata) in vrne rezultate po vrstnem redu; zastoj bi presegel časovno mejo. */
    private static <T> List<T> concurrently(List<Callable<T>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CyclicBarrier barrier = new CyclicBarrier(tasks.size());
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    barrier.await(30, TimeUnit.SECONDS);
                    return task.call();
                }));
            }
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get(60, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    /** Za vsak kontakt velja: {@code before} vsakega vnosa je enak {@code after} prejšnjega vnosa istega kontakta. */
    private void assertChainIsConsistent(UUID group) {
        Map<Object, Object> lastAfter = new HashMap<>();
        for (Map<String, Object> entry : audit.entries(group)) {
            for (Map<String, Object> change : audit.changes((UUID) entry.get("id"))) {
                Object contact = change.get("contact_id");
                if (lastAfter.containsKey(contact)) {
                    assertThat(change.get("before"))
                            .as("before vnosa %s kontakta %s", entry.get("seq"), contact)
                            .isEqualTo(lastAfter.get(contact));
                }
                lastAfter.put(contact, change.get("after"));
            }
        }
    }

    @Test
    @Tag("FR-005-14")
    void aLatestEntryIdThatIsNoLongerTheNewestIsAConflictWhateverTheNewerEntryConcerns() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        UUID seen = audit.latestEntryId(s.group());
        // Drug član medtem naredi vnos o drugem kontaktu (ki ga filter odjemalca ne bi pokazal).
        create(s, Who.ADMIN, contactInput("Bojan", "Drugi", "01 222 222"));
        UUID newest = audit.latestEntryId(s.group());
        int entries = audit.count(s.group());

        HttpResponse<String> response = rollback(s, Who.ADMIN, target, seen);

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VERSION_CONFLICT");
        assertThat(asObject(body.get("current"))).containsEntry("latestEntryId", newest.toString());
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(contacts.version(idOf(a))).isEqualTo(1);
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    private Map<String, Object> contactValues(Map<String, Object> detail, String phone) {
        Map<String, Object> values = valuesOf(detail);
        values.put("phone", phone);
        return values;
    }

    @RepeatedTest(10)
    @Tag("FR-005-14")
    void twoAdminsConfirmingTheSameRollbackGiveExactlyOneSuccess() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        UUID latest = audit.latestEntryId(s.group());

        List<HttpResponse<String>> results = concurrently(
                List.of(() -> rollback(s, Who.ADMIN, target, latest), () -> rollback(s, Who.OWNER, target, latest)));

        assertThat(results).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(201, 409);
        HttpResponse<String> failed =
                results.stream().filter(r -> r.statusCode() == 409).findFirst().orElseThrow();
        assertThat(json(failed.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(audit.count(s.group())).isEqualTo(3);
        assertThat(audit.entries(s.group()).get(2)).containsEntry("action", "ROLLBACK");
        assertChainIsConsistent(s.group());
    }

    @RepeatedTest(10)
    @Tag("FR-005-13")
    void aConcurrentEditAndARollbackAreSerialised() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> second = update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        UUID latest = audit.latestEntryId(s.group());

        List<HttpResponse<String>> results = concurrently(List.of(
                () -> rollback(s, Who.ADMIN, target, latest),
                () -> put(
                        contactPath(s.group(), idOf(a)),
                        s.token(Who.EDITOR),
                        body(withVersion(contactValues(second, "03 333 333"), versionOf(second))))));

        HttpResponse<String> rolledBack = results.get(0);
        HttpResponse<String> edited = results.get(1);
        if (edited.statusCode() == 200) {
            // Urejanje je uspelo pred rollbackom: najnovejši vnos se je spremenil.
            assertThat(rolledBack.statusCode()).isEqualTo(409);
            assertThat(json(rolledBack.body())).containsEntry("code", "VERSION_CONFLICT");
        } else {
            // Rollback je uspel pred urejanjem: verzija kontakta je zastarela.
            assertThat(rolledBack.statusCode()).isEqualTo(201);
            assertThat(edited.statusCode()).isEqualTo(409);
            assertThat(json(edited.body())).containsEntry("code", "VERSION_CONFLICT");
        }
        assertChainIsConsistent(s.group());
    }

    @RepeatedTest(10)
    @Tag("FR-005-13")
    void aConcurrentArchiveAndARollbackNeverChangeAnArchivedGroup() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        UUID latest = audit.latestEntryId(s.group());

        List<HttpResponse<String>> results = concurrently(List.of(
                () -> rollback(s, Who.ADMIN, target, latest),
                () -> post("/api/groups/" + s.group() + "/archive", s.token(Who.OWNER), null)));

        HttpResponse<String> rolledBack = results.get(0);
        assertThat(results.get(1).statusCode()).isIn(200, 204);
        if (rolledBack.statusCode() == 409) {
            assertThat(json(rolledBack.body())).containsEntry("code", "GROUP_ARCHIVED");
            assertThat(audit.count(s.group())).isEqualTo(2);
            assertThat(contacts.row(idOf(a)).get("phone")).isEqualTo("02 222 222");
        } else {
            assertThat(rolledBack.statusCode()).isEqualTo(201);
            assertThat(audit.count(s.group())).isEqualTo(3);
        }
        assertChainIsConsistent(s.group());
    }
}
