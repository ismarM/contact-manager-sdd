package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
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
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Sočasnost množičnih operacij (FR-009-16; research R-03): prekrivajoči se operacije se izvedejo zaporedno brez
 * zastoja, sočasno arhiviranje in posamično urejanje (004) ne pustita napol uporabljenega stanja.
 */
@Tag("FR-009-16")
class BulkConcurrencyIT extends BulkApiTest {

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

    @RepeatedTest(20)
    void twoOverlappingBulkUpdatesBothSucceedAndTheOverlapGetsBothChangesWithoutDeadlock() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 750);
        List<UUID> first = all.subList(0, 500);
        List<UUID> second = all.subList(250, 750);
        int entriesBefore = audit.count(s.group());

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> bulkUpdate(s.token(Who.EDITOR), s.group(), request(first, "addTags", List.of("a"))),
                () -> bulkUpdate(s.token(Who.ADMIN), s.group(), request(second, "addTags", List.of("b")))));

        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            assertThat(json(response.body())).containsEntry("changed", 500);
        }
        for (int i = 0; i < 750; i++) {
            UUID id = all.get(i);
            List<String> tags = contacts.tagsOf(id);
            if (i < 250) {
                assertThat(tags).as("samo a, " + i).containsExactly("a");
                assertThat(contacts.version(id)).isEqualTo(1);
            } else if (i < 500) {
                assertThat(tags).as("oba, " + i).containsExactlyInAnyOrder("a", "b");
                assertThat(contacts.version(id)).isEqualTo(2);
            } else {
                assertThat(tags).as("samo b, " + i).containsExactly("b");
                assertThat(contacts.version(id)).isEqualTo(1);
            }
        }
        assertThat(audit.count(s.group())).isEqualTo(entriesBefore + 2);
    }

    @RepeatedTest(5)
    void aBulkUpdateRacingWithArchivingEitherSucceedsBeforeItOrIsRejectedWithoutAnyChange() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 500);
        int entriesBefore = audit.count(s.group());

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova"))),
                () -> post("/api/groups/" + s.group() + "/archive", s.token(Who.OWNER), null)));

        HttpResponse<String> update = responses.get(0);
        assertThat(responses.get(1).statusCode()).isEqualTo(200);
        if (update.statusCode() == 200) {
            for (UUID id : all) {
                assertThat(contacts.tagsOf(id)).containsExactly("nova");
            }
            assertThat(audit.count(s.group())).isEqualTo(entriesBefore + 1);
        } else {
            assertThat(update.statusCode()).as(update.body()).isEqualTo(409);
            assertThat(json(update.body())).containsEntry("code", "GROUP_ARCHIVED");
            for (UUID id : all) {
                assertThat(contacts.tagsOf(id)).isEmpty();
            }
            assertThat(audit.count(s.group())).isEqualTo(entriesBefore);
        }
    }

    @RepeatedTest(5)
    void aBulkUpdateRacingWithASingleEditOfTheSameContactIsSerialized() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createViaApi(s, input("Janez", "Novak"));
        UUID id = UUID.fromString((String) created.get("id"));
        long version = ((Number) created.get("version")).longValue();
        Map<String, Object> values = input("Janez", "Novak");
        values.put("phone", "031 999 888");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> bulkUpdate(s.token(Who.ADMIN), s.group(), request(List.of(id), "addTags", List.of("nova"))),
                () -> put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(values, version)))));

        HttpResponse<String> bulk = responses.get(0);
        HttpResponse<String> single = responses.get(1);
        assertThat(bulk.statusCode()).as(bulk.body()).isEqualTo(200);
        assertThat(contacts.tagsOf(id)).containsExactly("nova");
        if (single.statusCode() == 200) {
            // Posamično urejanje je bilo prvo, množično urejanje je videlo njegovo stanje.
            assertThat(contacts.row(id).get("phone")).isEqualTo("031 999 888");
            assertThat(contacts.version(id)).isEqualTo(2);
        } else {
            assertThat(single.statusCode()).as(single.body()).isEqualTo(409);
            assertThat(json(single.body())).containsEntry("code", "VERSION_CONFLICT");
            assertThat(contacts.row(id).get("phone")).isNull();
            assertThat(contacts.version(id)).isEqualTo(1);
        }
    }
}
