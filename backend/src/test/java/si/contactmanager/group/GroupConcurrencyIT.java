package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
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
 * Sočasni spremembi podatkov skupine z isto verzijo (FR-002-12, SC-004): natanko ena uspe, druga dobi 409
 * VERSION_CONFLICT; nobena sprememba se ne prepiše tiho.
 */
class GroupConcurrencyIT extends ApiTest {

    @RepeatedTest(10)
    @Tag("FR-002-12")
    void exactlyOneOfTwoConcurrentUpdatesWins() throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        UUID group = fixtures.createGroup(fixtures.userId(owner.uid()), "Začetni naslov", null, "tinta");
        fixtures.addMember(group, fixtures.userId(admin.uid()), "ADMIN");
        CountDownLatch start = new CountDownLatch(1);

        List<HttpResponse<String>> responses;
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<HttpResponse<String>> first = pool.submit(() -> {
                start.await();
                return put(
                        "/api/groups/" + group,
                        owner.idToken(),
                        "{\"title\":\"Lastnikov\",\"description\":null,\"color\":\"tinta\",\"version\":0}");
            });
            Future<HttpResponse<String>> second = pool.submit(() -> {
                start.await();
                return put(
                        "/api/groups/" + group,
                        admin.idToken(),
                        "{\"title\":\"Adminov\",\"description\":null,\"color\":\"tinta\",\"version\":0}");
            });
            start.countDown();
            responses = List.of(first.get(), second.get());
        }

        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
        HttpResponse<String> winner = responses.stream()
                .filter(r -> r.statusCode() == 200)
                .findFirst()
                .orElseThrow();
        HttpResponse<String> loser = responses.stream()
                .filter(r -> r.statusCode() == 409)
                .findFirst()
                .orElseThrow();
        assertThat(json(loser.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(fixtures.version(group)).isEqualTo(1);
        assertThat(fixtures.row(group))
                .containsEntry("title", json(winner.body()).get("title"));
    }
}
