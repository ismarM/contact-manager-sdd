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
import si.contactmanager.audit.support.HistoryApiTest;

/**
 * Sočasnost obnove (FR-015-13, SC-005): dve obnovi, obnova in urejanje, obnova in izbris, obnova in rollback skupine;
 * natanko ena zahteva uspe, druga je zavrnjena z {@code 409}, veriga stanj ostane skladna, brez zastojev.
 */
class RestoreConcurrencyIT extends HistoryApiTest {

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

    private long count(List<HttpResponse<String>> responses, int status) {
        return responses.stream().filter(r -> r.statusCode() == status).count();
    }

    private Map<String, Object> bigEdit(Map<String, Object> detail) {
        Map<String, Object> values = withPhone(detail, "031 999 999");
        values.put("tags", List.of("vip"));
        return values;
    }

    @RepeatedTest(3)
    @Tag("FR-015-13")
    void twoSimultaneousRestoresOfTheSameContactOnlyOneSucceeds() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        UUID first = entryIds(s).get(0);
        int entries = audit.count(s.group());
        Map<String, Object> body = restoreBody(first, versionOf(edited));

        List<HttpResponse<String>> responses = concurrently(
                List.of(() -> restore(s, Who.EDITOR, idOf(a), body), () -> restore(s, Who.ADMIN, idOf(a), body)));

        assertThat(count(responses, 201)).isEqualTo(1);
        assertThat(count(responses, 409)).isEqualTo(1);
        assertThat(audit.count(s.group())).isEqualTo(entries + 1);
        assertChainIsConsistent(s.group());
    }

    @RepeatedTest(3)
    @Tag("FR-015-13")
    void twoSimultaneousRestoresOfADeletedContactOnlyOneSucceeds() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        remove(s, Who.EDITOR, idOf(a), versionOf(a));
        Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");
        String last = (String) asObject(history.get("contact")).get("lastEntryId");
        String version = (String) asObjects(history.get("items")).get(1).get("entryId");
        int entries = audit.count(s.group());
        Map<String, Object> body = restoreDeletedBody(version, last);

        List<HttpResponse<String>> responses = concurrently(
                List.of(() -> restore(s, Who.EDITOR, idOf(a), body), () -> restore(s, Who.ADMIN, idOf(a), body)));

        assertThat(count(responses, 201))
                .as(responses.stream()
                        .map(r -> r.statusCode() + " " + r.body())
                        .toList()
                        .toString())
                .isEqualTo(1);
        assertThat(count(responses, 409)).isEqualTo(1);
        assertThat(audit.count(s.group())).isEqualTo(entries + 1);
        assertThat(contacts.exists(idOf(a))).isTrue();
        assertChainIsConsistent(s.group());
    }

    @RepeatedTest(3)
    @Tag("FR-015-13")
    void aRestoreAndAnEditOfTheSameContactNeverBothUseTheSameVersion() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        UUID first = entryIds(s).get(0);
        int entries = audit.count(s.group());

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> restore(s, Who.EDITOR, idOf(a), restoreBody(first, versionOf(edited))),
                () -> put(
                        contactPath(s.group(), idOf(a)),
                        s.token(Who.ADMIN),
                        body(withVersion(withPhone(edited, "031 555 555"), versionOf(edited))))));

        assertThat(responses)
                .extracting(HttpResponse::statusCode)
                .containsExactlyInAnyOrder(
                        responses.get(0).statusCode() == 201 ? 201 : 409,
                        responses.get(1).statusCode() == 200 ? 200 : 409);
        assertThat(count(responses, 201) + count(responses, 200)).isEqualTo(1);
        assertThat(count(responses, 409)).isEqualTo(1);
        assertThat(audit.count(s.group())).isEqualTo(entries + 1);
        assertChainIsConsistent(s.group());
    }

    @RepeatedTest(3)
    @Tag("FR-015-13")
    @Tag("FR-015-17")
    void aRestoreAndAGroupRollbackAreSerializedWithoutDeadlockOrCorruptedChain() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> edited = update(s, Who.EDITOR, idOf(a), bigEdit(a), versionOf(a));
        List<UUID> entries = entryIds(s);
        UUID latest = audit.latestEntryId(s.group());

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> restore(s, Who.EDITOR, idOf(a), restoreBody(entries.get(0), versionOf(edited))),
                () -> rollback(s, Who.ADMIN, entries.get(0), latest)));

        assertThat(responses).allSatisfy(r -> assertThat(r.statusCode()).isIn(201, 409));
        assertThat(count(responses, 201)).isGreaterThanOrEqualTo(1);
        assertChainIsConsistent(s.group());
    }
}
