package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import si.contactmanager.contact.support.ContactApiTest;

/**
 * Sočasna dejanja nad kontaktom (Edge Cases; research R-05): dvojno urejanje, urejanje ob izbrisu, dvojni izbris in
 * arhiviranje ob urejanju – nobena sprememba se ne prepiše ali izgubi tiho, izbrisan kontakt se ne ustvari znova.
 */
class ContactConcurrencyIT extends ContactApiTest {

    private List<HttpResponse<String>> race(Callable<HttpResponse<String>> first, Callable<HttpResponse<String>> second)
            throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<HttpResponse<String>> a = pool.submit(() -> {
                start.await();
                return first.call();
            });
            Future<HttpResponse<String>> b = pool.submit(() -> {
                start.await();
                return second.call();
            });
            start.countDown();
            return List.of(a.get(), b.get());
        }
    }

    private Map<String, Object> phoneChange(String phone) {
        Map<String, Object> values = input("Janez", "Novak");
        values.put("phone", phone);
        return withVersion(values, 0);
    }

    @RepeatedTest(10)
    @Tag("FR-004-11")
    void exactlyOneOfTwoConcurrentEditsWithTheSameVersionWins() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        List<HttpResponse<String>> responses = race(
                () -> put(contactPath(s.group(), id), s.token(Who.EDITOR), body(phoneChange("01 111 111"))),
                () -> put(contactPath(s.group(), id), s.token(Who.ADMIN), body(phoneChange("01 222 222"))));

        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
        HttpResponse<String> loser = responses.stream()
                .filter(r -> r.statusCode() == 409)
                .findFirst()
                .orElseThrow();
        assertThat(json(loser.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(contacts.version(id)).isEqualTo(1);
        assertThat(contacts.row(id).get("phone")).isIn("01 111 111", "01 222 222");
    }

    @RepeatedTest(10)
    @Tag("FR-004-11")
    @Tag("FR-004-12")
    @Tag("FR-004-13")
    void editAndDeleteOfTheSameVersionNeverRecreateTheContact() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        List<HttpResponse<String>> responses = race(
                () -> put(contactPath(s.group(), id), s.token(Who.EDITOR), body(phoneChange("01 111 111"))),
                () -> delete(contactPath(s.group(), id) + "?version=0", s.token(Who.ADMIN)));

        HttpResponse<String> edit = responses.get(0);
        HttpResponse<String> removal = responses.get(1);
        if (edit.statusCode() == 200) {
            assertThat(removal.statusCode()).isEqualTo(409);
            assertThat(contacts.exists(id)).isTrue();
            assertThat(contacts.version(id)).isEqualTo(1);
        } else {
            assertThat(removal.statusCode()).isEqualTo(204);
            assertThat(edit.statusCode()).isEqualTo(404);
            assertThat(contacts.exists(id)).isFalse();
        }
    }

    @RepeatedTest(10)
    @Tag("FR-004-12")
    @Tag("FR-004-13")
    void exactlyOneOfTwoConcurrentDeletesWins() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        List<HttpResponse<String>> responses = race(
                () -> delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR)),
                () -> delete(contactPath(s.group(), id) + "?version=0", s.token(Who.ADMIN)));

        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(204, 404);
        assertThat(contacts.exists(id)).isFalse();
    }

    @RepeatedTest(10)
    @Tag("FR-004-15")
    void archivingAndEditingNeverChangeAContactOfAnArchivedGroup() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        List<HttpResponse<String>> responses = race(
                () -> put(contactPath(s.group(), id), s.token(Who.EDITOR), body(phoneChange("01 111 111"))),
                () -> post("/api/groups/" + s.group() + "/archive", s.token(Who.OWNER), null));

        assertThat(responses.get(1).statusCode()).isEqualTo(200);
        int edit = responses.get(0).statusCode();
        assertThat(edit).isIn(200, 409);
        if (edit == 409) {
            assertThat(json(responses.get(0).body())).containsEntry("code", "GROUP_ARCHIVED");
            assertThat(contacts.version(id)).isZero();
        } else {
            assertThat(contacts.version(id)).isEqualTo(1);
        }
        // Po arhiviranju je vsako nadaljnje pisanje zavrnjeno in vrednosti ostanejo.
        Object phone = contacts.row(id).get("phone");
        assertThat(put(
                                contactPath(s.group(), id),
                                s.token(Who.EDITOR),
                                body(withVersion(input("X", "Y"), contacts.version(id))))
                        .statusCode())
                .isEqualTo(409);
        assertThat(contacts.row(id).get("phone")).isEqualTo(phone);
    }
}
