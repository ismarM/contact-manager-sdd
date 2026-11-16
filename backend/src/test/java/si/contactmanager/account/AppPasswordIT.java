package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Gesla za aplikacijo (FR-014-21, -25): geslo samo v odgovoru ustvarjanja, seznam brez gesel, meja 10
 * ({@code 409 APP_PASSWORD_LIMIT}), preklic samo lastnega gesla (tuje 404), 401 brez prijave, izvoz mojih podatkov z
 * imeni in časi, izbris računa izbriše gesla.
 */
@Tag("FR-014-21")
@Tag("FR-014-25")
class AppPasswordIT extends AccountApiTest {

    private static final String PATH = "/api/me/app-passwords";

    private HttpResponse<String> create(SignedIn user, String name) throws Exception {
        return post(PATH, user.idToken(), name == null ? "{}" : body(Map.of("name", name)));
    }

    private static String body(Object value) {
        return JSON.writeValueAsString(value);
    }

    @Test
    void aNewPasswordIsShownOnceAndStoredOnlyAsAHash() throws Exception {
        SignedIn pia = registeredUser("Pia Kos");

        HttpResponse<String> created = create(pia, "  iPhone  ");

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        Map<String, Object> body = json(created.body());
        String password = (String) body.get("password");
        assertThat(password).matches("([a-z0-9]{4}-){6}[a-z0-9]{4}");
        assertThat(body).containsEntry("name", "iPhone").containsEntry("username", email(pia));
        assertThat(body.get("lastUsedAt")).isNull();
        HttpResponse<String> list = get(PATH, pia.idToken());
        assertThat(list.body()).doesNotContain(password).doesNotContain("hash").doesNotContain("password");
        List<?> items = (List<?>) json(list.body()).get("items");
        assertThat(items).hasSize(1);
        byte[] stored =
                jdbc.queryForObject("select secret_hash from app_password where user_id = ?", byte[].class, id(pia));
        assertThat(stored).hasSize(32).isEqualTo(AppPasswords.hash(password));
        assertThat(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1))
                .doesNotContain(password);
    }

    @Test
    void nameIsValidatedAndTheEleventhPasswordIsRejected() throws Exception {
        SignedIn pia = registeredUser("Pia Kos");

        assertThat(create(pia, null).body()).contains("\"field\":\"name\"", "REQUIRED");
        assertThat(create(pia, "x".repeat(51)).body()).contains("TOO_LONG");
        for (int i = 0; i < 10; i++) {
            assertThat(create(pia, "Naprava " + i).statusCode()).isEqualTo(201);
        }
        HttpResponse<String> eleventh = create(pia, "Preveč");

        assertThat(eleventh.statusCode()).isEqualTo(409);
        assertThat(json(eleventh.body())).isEqualTo(Map.of("code", "APP_PASSWORD_LIMIT"));
        assertThat(jdbc.queryForObject("select count(*) from app_password where user_id = ?", Integer.class, id(pia)))
                .isEqualTo(10);
    }

    @Test
    void onlyOwnPasswordsCanBeRevokedAndOthersStay() throws Exception {
        SignedIn pia = registeredUser("Pia Kos");
        SignedIn ana = registeredUser("Ana Novak");
        String first = (String) json(create(pia, "iPhone").body()).get("id");
        String second = (String) json(create(pia, "Thunderbird").body()).get("id");

        HttpResponse<String> foreign = Http.send("DELETE", url(PATH + "/" + first), Http.bearer(ana.idToken()));
        HttpResponse<String> missing =
                Http.send("DELETE", url(PATH + "/" + UUID.randomUUID()), Http.bearer(pia.idToken()));
        HttpResponse<String> own = Http.send("DELETE", url(PATH + "/" + first), Http.bearer(pia.idToken()));

        assertThat(foreign.statusCode()).isEqualTo(404);
        assertThat(missing.statusCode()).isEqualTo(404);
        assertThat(own.statusCode()).isEqualTo(204);
        assertThat(json(get(PATH, pia.idToken()).body()).toString())
                .contains(second)
                .doesNotContain(first);
    }

    @Test
    void everyEndpointNeedsSignIn() throws Exception {
        assertThat(get(PATH, null).statusCode()).isEqualTo(401);
        assertThat(post(PATH, null, "{\"name\":\"x\"}").statusCode()).isEqualTo(401);
        assertThat(Http.send("DELETE", url(PATH + "/" + UUID.randomUUID()), Map.of())
                        .statusCode())
                .isEqualTo(401);
    }

    @Test
    void myDataExportListsNamesAndTimesAndAccountDeletionRemovesPasswords() throws Exception {
        SignedIn pia = registeredUser("Pia Kos");
        String password = (String) json(create(pia, "iPhone").body()).get("password");
        long user = id(pia);

        String exported = export(pia).body();

        assertThat(exported).contains("\"appPasswords\"", "\"name\":\"iPhone\"", "\"lastUsedAt\":null");
        assertThat(exported).doesNotContain(password).doesNotContain("secret");
        assertThat(deleteAccount(pia).statusCode()).isIn(204, 202);
        assertThat(jdbc.queryForObject("select count(*) from app_password where user_id = ?", Integer.class, user))
                .isZero();
    }
}
