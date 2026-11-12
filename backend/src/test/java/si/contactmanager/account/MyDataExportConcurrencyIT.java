package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/**
 * Izvoz med sočasnim izbrisom računa (spec, robni primer; research R-09, M10): izvoz je bodisi {@code 401} bodisi
 * popoln in notranje skladen posnetek, nikoli delen ali {@code 500}.
 */
@Tag("FR-012-02")
@Tag("FR-012-15")
class MyDataExportConcurrencyIT extends AccountApiTest {

    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @AfterEach
    void closePool() {
        pool.shutdownNow();
    }

    @Test
    void exportDuringDeletionIsCompleteOrUnauthenticatedNeverPartial() throws Exception {
        for (int round = 0; round < 30; round++) {
            SignedIn pia = registeredUser("Pia Tek " + round);
            SignedIn ana = registeredUser("Ana Tek " + round);
            for (int g = 0; g < 3; g++) {
                UUID group = activeGroup(ana, "Skupina " + round + "-" + g);
                groups.addMember(group, id(pia), "EDITOR");
            }
            UUID club = activeGroup(ana, "Klub " + round);
            invitations.invite(club, id(pia), id(ana), "VIEWER");
            UUID other = activeGroup(ana, "Drugi " + round);
            invitations.invite(other, id(ana), id(pia), "VIEWER");
            String ownEmail = email(pia);

            CompletableFuture<HttpResponse<String>> exporting =
                    CompletableFuture.supplyAsync(() -> call(() -> export(pia)), pool);
            CompletableFuture<HttpResponse<String>> deleting =
                    CompletableFuture.supplyAsync(() -> call(() -> deleteAccount(pia)), pool);
            HttpResponse<String> exported = exporting.get(30, TimeUnit.SECONDS);
            HttpResponse<String> deleted = deleting.get(30, TimeUnit.SECONDS);

            assertThat(deleted.statusCode()).as("izbris v krogu %d", round).isIn(204, 202);
            assertThat(exported.statusCode()).as("izvoz v krogu %d", round).isIn(200, 401);
            if (exported.statusCode() == 200) {
                JsonNode data = JSON.readTree(exported.body());
                assertThat(data.get("profile").get("email").asString()).isEqualTo(ownEmail);
                assertThat(data.get("memberships")).as("članstva").hasSize(3);
                assertThat(data.get("sentInvitations")).as("poslana povabila").hasSize(1);
                assertThat(data.get("receivedInvitations"))
                        .as("prejeta povabila")
                        .hasSize(1);
            }
        }
    }

    private interface Call {
        HttpResponse<String> run() throws Exception;
    }

    private static HttpResponse<String> call(Call call) {
        try {
            return call.run();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
