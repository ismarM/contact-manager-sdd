package si.contactmanager.contact.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Skupni pomočniki testov združevanja (T014 … T020): kontakti prek API-ja 004 (njihov izbris je v sledi, zato je
 * identiteta »znana« skupini), rollback 005 in sočasno izvajanje niti. Brez novih mehanizmov v produkcijski kodi.
 */
public abstract class MergeApiTest extends DuplicateApiTest {

    /** Ustvari kontakt prek API-ja 004 (kot urednik) z e-naslovom, atributi in značkami; vrne odgovor. */
    protected Map<String, Object> createContact(
            Scenario s,
            String first,
            String last,
            String email,
            List<Map<String, String>> attributes,
            List<String> tags)
            throws Exception {
        Map<String, Object> input = input(first, last);
        if (email != null) {
            input.put("email", email);
        }
        input.put("attributes", attributes == null ? List.of() : attributes);
        input.put("tags", tags == null ? List.of() : tags);
        return createViaApi(s, input);
    }

    /** Identiteta kontakta iz odgovora API-ja. */
    protected static UUID uuid(Map<String, Object> contact) {
        return UUID.fromString((String) contact.get("id"));
    }

    /** Rollback 005 na vnos {@code entry} z danim {@code latestEntryId} kot izbrani član. */
    protected HttpResponse<String> rollback(Scenario s, Who who, UUID entry, UUID latestEntryId) throws Exception {
        return post(
                "/api/groups/" + s.group() + "/audit/" + entry + "/rollback",
                s.token(who),
                body(Map.of("latestEntryId", latestEntryId.toString())));
    }

    /** Rollback na stanje tik pred vnosom {@code entry} je rollback na vnos pred njim; to je vnos s {@code seq - 1}. */
    protected UUID entryBefore(UUID group, UUID entry) {
        List<Map<String, Object>> entries = audit.entries(group);
        for (int i = 0; i < entries.size(); i++) {
            if (entry.equals(entries.get(i).get("id"))) {
                assertThat(i).as("vnos pred izbranim").isGreaterThan(0);
                return (UUID) entries.get(i - 1).get("id");
            }
        }
        throw new IllegalStateException("vnos ni v sledi: " + entry);
    }

    /** Zadnji vnos sledi skupine. */
    protected Map<String, Object> lastEntry(UUID group) {
        List<Map<String, Object>> entries = audit.entries(group);
        return entries.get(entries.size() - 1);
    }

    /** Preprost rezultat združitve: ime, priimek, e-naslov, brez atributov in značk. */
    protected static Map<String, Object> simpleResult(String first, String last, String email) {
        return result(first, last, null, email, null, null, null);
    }

    /** Vsebina kontakta (vrednosti, atributi z vrstnim redom, značke) brez metapodatkov; prazno, če kontakta ni. */
    protected Map<String, Object> content(UUID id) {
        Map<String, Object> state = audit.contactState(id);
        Map<String, Object> content = new LinkedHashMap<>();
        if (state.isEmpty()) {
            return content;
        }
        for (String key : List.of("first_name", "last_name", "address", "email", "phone", "attributes", "tags")) {
            content.put(key, state.get(key));
        }
        return content;
    }

    /** Zažene naloge hkrati (vrata) in vrne rezultate po vrstnem redu; zastoj bi presegel časovno mejo. */
    protected static <T> List<T> concurrently(List<Callable<T>> tasks) throws Exception {
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

    /** Koda napake iz telesa odgovora ali {@code null}. */
    protected static Object codeOf(HttpResponse<String> response) {
        return json(response.body()).get("code");
    }

    /** Vrstica {@code {id, version}} iz odgovora API-ja 004. */
    protected static Map<String, Object> ref(Map<String, Object> created) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", created.get("id"));
        row.put("version", ((Number) created.get("version")).longValue());
        return row;
    }
}
