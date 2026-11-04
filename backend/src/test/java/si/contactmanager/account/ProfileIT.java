package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Registracija ob prvi prijavi, posodobitev ob naslednjih in branje lastnega profila (FR-001-02, FR-001-03,
 * FR-001-08) prek {@code PUT /api/me} (plan.md – REST endpoints).
 */
class ProfileIT extends ApiTest {

    @Test
    @Tag("FR-001-02")
    @Tag("FR-001-08")
    void firstSignInCreatesExactlyOneProfileFromGoogleAccount() throws Exception {
        String email = uniqueEmail();
        SignedIn ana = emulator().signInWithGoogle(email, "Ana Novak");

        HttpResponse<String> response = put("/api/me", ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsOnlyKeys("name", "email", "language", "theme");
        assertThat(body)
                .containsEntry("name", "Ana Novak")
                .containsEntry("email", email)
                .containsEntry("language", null)
                .containsEntry("theme", null);
        List<Map<String, Object>> rows = profileRows(ana.uid());
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst()).containsEntry("name", "Ana Novak").containsEntry("email", email);
    }

    @Test
    @Tag("FR-001-03")
    void laterSignInUpdatesTheSameProfile() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");
        assertThat(put("/api/me", ana.idToken(), null).statusCode()).isEqualTo(201);

        HttpResponse<String> again = put("/api/me", ana.idToken(), null);

        assertThat(again.statusCode()).isEqualTo(200);
        assertThat(profileRows(ana.uid())).hasSize(1);
    }

    @Test
    @Tag("FR-001-03")
    void changedNameAndEmailInGoogleAreTakenOverOnNextSignIn() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");
        assertThat(put("/api/me", ana.idToken(), null).statusCode()).isEqualTo(201);
        String newEmail = uniqueEmail();
        String newToken = emulator().updateUser(ana.idToken(), "Ana Kovač", newEmail);

        HttpResponse<String> response = put("/api/me", newToken, null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("name", "Ana Kovač").containsEntry("email", newEmail);
        List<Map<String, Object>> rows = profileRows(ana.uid());
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst()).containsEntry("name", "Ana Kovač").containsEntry("email", newEmail);
    }

    @Test
    @Tag("FR-001-03")
    void concurrentFirstSignInsCreateExactlyOneProfile() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");
        Callable<Integer> signIn = () -> put("/api/me", ana.idToken(), null).statusCode();

        List<Integer> statuses;
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            List<Future<Integer>> futures = pool.invokeAll(List.of(signIn, signIn));
            statuses = futures.stream().map(ProfileIT::get).toList();
        }

        assertThat(statuses).containsExactlyInAnyOrder(200, 201);
        assertThat(profileRows(ana.uid())).hasSize(1);
    }

    @Test
    @Tag("FR-001-02")
    void accountWithoutNameHasNullName() throws Exception {
        String email = uniqueEmail();
        SignedIn noName = emulator().signInWithGoogle(email, null);

        HttpResponse<String> response = put("/api/me", noName.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("name", null).containsEntry("email", email);
    }

    @Test
    @Tag("FR-001-07")
    @Tag("FR-001-08")
    void userIsTakenOnlyFromTokenNeverFromBody() throws Exception {
        String email = uniqueEmail();
        SignedIn ana = emulator().signInWithGoogle(email, "Ana Novak");
        assertThat(put("/api/me", ana.idToken(), null).statusCode()).isEqualTo(201);

        HttpResponse<String> response =
                put("/api/me", ana.idToken(), "{\"email\":\"" + uniqueEmail() + "\",\"name\":\"Napadalec\"}");

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VALIDATION_FAILED");
        assertThat(body.get("errors"))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.LIST)
                .contains(Map.of("field", "email", "code", "UNKNOWN_FIELD"));
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("email", email)
                .containsEntry("name", "Ana Novak");
    }

    private static Integer get(Future<Integer> future) {
        try {
            return future.get();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
