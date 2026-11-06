package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Sočasna dejanja nad stanjem skupine (Edge Cases; research R-03): dvojno arhiviranje in odarhiviranje, arhiviranje ob
 * urejanju podatkov – nikoli sprememba podatkov arhivirane skupine.
 */
class GroupArchiveConcurrencyIT extends ApiTest {

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

    @RepeatedTest(10)
    @Tag("FR-003-01")
    void exactlyOneOfTwoConcurrentArchivesWins() throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");

        List<HttpResponse<String>> responses = race(
                () -> post("/api/groups/" + group + "/archive", ana.idToken(), null),
                () -> post("/api/groups/" + group + "/archive", ana.idToken(), null));

        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
        assertThat(responses.stream()
                        .filter(r -> r.statusCode() == 409)
                        .findFirst()
                        .orElseThrow()
                        .body())
                .contains("GROUP_ARCHIVED");
        assertThat(fixtures.archivedAt(group)).isNotNull();
    }

    @RepeatedTest(10)
    @Tag("FR-003-06")
    void exactlyOneOfTwoConcurrentUnarchivesWins() throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.archive(group);

        List<HttpResponse<String>> responses = race(
                () -> post("/api/groups/" + group + "/unarchive", ana.idToken(), null),
                () -> post("/api/groups/" + group + "/unarchive", ana.idToken(), null));

        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
        assertThat(responses.stream()
                        .filter(r -> r.statusCode() == 409)
                        .findFirst()
                        .orElseThrow()
                        .body())
                .contains("GROUP_NOT_ARCHIVED");
        assertThat(fixtures.archivedAt(group)).isNull();
    }

    @RepeatedTest(10)
    @Tag("FR-003-03")
    @Tag("FR-003-04")
    void editingRacingWithArchivingNeverChangesAnArchivedGroup() throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Začetni naslov");
        fixtures.addMember(group, fixtures.userId(bojan.uid()), "ADMIN");

        List<HttpResponse<String>> responses = race(
                () -> post("/api/groups/" + group + "/archive", ana.idToken(), null),
                () -> put(
                        "/api/groups/" + group,
                        bojan.idToken(),
                        "{\"title\":\"Adminov\",\"description\":null,\"color\":\"tinta\",\"version\":0}"));

        HttpResponse<String> archive = responses.get(0);
        HttpResponse<String> edit = responses.get(1);
        assertThat(archive.statusCode()).isEqualTo(200);
        assertThat(edit.statusCode()).isIn(200, 409);
        if (edit.statusCode() == 409) {
            assertThat(edit.body()).contains("GROUP_ARCHIVED");
            assertThat(fixtures.row(group)).containsEntry("title", "Začetni naslov");
        } else {
            assertThat(fixtures.row(group)).containsEntry("title", "Adminov");
        }
        assertThat(fixtures.archivedAt(group)).isNotNull();
    }
}
