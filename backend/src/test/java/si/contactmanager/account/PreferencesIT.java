package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Izbira jezika in teme v profilu (FR-001-15, FR-001-17, FR-001-19; contracts/openapi.yaml): sprememba, brisanje,
 * validacija, prednost profila pred izbiro naprave ob prijavi in veljavnost na drugi napravi.
 */
class PreferencesIT extends ApiTest {

    @Test
    @Tag("FR-001-15")
    @Tag("FR-001-17")
    void savesLanguageAndTheme() throws Exception {
        SignedIn ana = signedUpUser();

        HttpResponse<String> response =
                put("/api/me/preferences", ana.idToken(), "{\"language\":\"en\",\"theme\":\"dark\"}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("language", "en").containsEntry("theme", "dark");
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("language", "en")
                .containsEntry("theme", "dark");
    }

    @Test
    @Tag("FR-001-17")
    void nullClearsTheChoice() throws Exception {
        SignedIn ana = signedUpUser();
        savePreferences(ana.idToken(), "{\"language\":\"en\",\"theme\":\"dark\"}");

        HttpResponse<String> response = put("/api/me/preferences", ana.idToken(), "{\"language\":null,\"theme\":null}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("language", null).containsEntry("theme", null);
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("language", null)
                .containsEntry("theme", null);
    }

    @ParameterizedTest(name = "{0} → 400 {1} {2}")
    @Tag("FR-001-15")
    @Tag("FR-001-17")
    @CsvSource(
            delimiter = '|',
            value = {
                "{\"language\":\"de\",\"theme\":\"dark\"}   | language | INVALID_VALUE",
                "{\"language\":\"en\",\"theme\":\"blue\"}   | theme    | INVALID_VALUE",
                "{\"language\":\"SL\",\"theme\":null}       | language | INVALID_VALUE",
                "{\"theme\":\"dark\"}                       | language | REQUIRED",
                "{\"language\":\"en\"}                      | theme    | REQUIRED",
                "{\"language\":\"en\",\"theme\":\"dark\",\"x\":1} | x  | UNKNOWN_FIELD",
                "{\"language\":                             | body     | MALFORMED"
            })
    void invalidPreferencesAreRejectedWithoutChanges(String body, String field, String code) throws Exception {
        SignedIn ana = signedUpUser();
        savePreferences(ana.idToken(), "{\"language\":\"sl\",\"theme\":\"light\"}");
        List<Map<String, Object>> before = profileRows(ana.uid());

        HttpResponse<String> response = put("/api/me/preferences", ana.idToken(), body);

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> error = json(response.body());
        assertThat(error).containsEntry("code", "VALIDATION_FAILED");
        assertThat(error.get("errors"))
                .asInstanceOf(InstanceOfAssertFactories.LIST)
                .contains(Map.of("field", field, "code", code));
        assertThat(profileRows(ana.uid())).isEqualTo(before);
    }

    @Test
    @Tag("FR-001-19")
    void deviceChoiceIsSavedWhenProfileHasNone() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");

        HttpResponse<String> response = put("/api/me", ana.idToken(), "{\"language\":\"en\",\"theme\":\"dark\"}");

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("language", "en").containsEntry("theme", "dark");
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("language", "en")
                .containsEntry("theme", "dark");
    }

    @Test
    @Tag("FR-001-19")
    void profileChoiceWinsOverDeviceChoiceOnSignIn() throws Exception {
        SignedIn ana = signedUpUser();
        savePreferences(ana.idToken(), "{\"language\":\"en\",\"theme\":\"dark\"}");

        HttpResponse<String> response = put("/api/me", ana.idToken(), "{\"language\":\"sl\",\"theme\":\"light\"}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("language", "en").containsEntry("theme", "dark");
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("language", "en")
                .containsEntry("theme", "dark");
    }

    @Test
    @Tag("FR-001-19")
    void ruleAppliesPerField() throws Exception {
        SignedIn ana = signedUpUser();
        savePreferences(ana.idToken(), "{\"language\":\"en\",\"theme\":null}");

        HttpResponse<String> response = put("/api/me", ana.idToken(), "{\"language\":\"sl\",\"theme\":\"dark\"}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("language", "en").containsEntry("theme", "dark");
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("language", "en")
                .containsEntry("theme", "dark");
    }

    @Test
    @Tag("FR-001-19")
    void deviceWithoutChoiceKeepsProfileEmpty() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");

        HttpResponse<String> response = put("/api/me", ana.idToken(), "{\"language\":null,\"theme\":null}");

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("language", null).containsEntry("theme", null);
        assertThat(profileRows(ana.uid()).getFirst())
                .containsEntry("language", null)
                .containsEntry("theme", null);
    }

    @Test
    @Tag("FR-001-19")
    void choiceFollowsTheUserToAnotherDevice() throws Exception {
        String googleSub = "google-" + java.util.UUID.randomUUID();
        String email = uniqueEmail();
        SignedIn firstDevice = emulator().signInWithGoogle(googleSub, email, "Ana Novak");
        assertThat(put("/api/me", firstDevice.idToken(), null).statusCode()).isEqualTo(201);
        savePreferences(firstDevice.idToken(), "{\"language\":\"en\",\"theme\":\"dark\"}");

        SignedIn secondDevice = emulator().signInWithGoogle(googleSub, email, "Ana Novak");
        HttpResponse<String> response =
                put("/api/me", secondDevice.idToken(), "{\"language\":\"sl\",\"theme\":\"light\"}");

        assertThat(secondDevice.uid()).isEqualTo(firstDevice.uid());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("language", "en").containsEntry("theme", "dark");
    }

    @Test
    @Tag("FR-001-19")
    void invalidDeviceChoiceOnSignInIsRejectedWithoutCreatingProfile() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");

        HttpResponse<String> response = put("/api/me", ana.idToken(), "{\"language\":\"de\",\"theme\":null}");

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> error = json(response.body());
        assertThat(error).containsEntry("code", "VALIDATION_FAILED");
        assertThat(error.get("errors"))
                .asInstanceOf(InstanceOfAssertFactories.LIST)
                .contains(Map.of("field", "language", "code", "INVALID_VALUE"));
        assertThat(profileRows(ana.uid())).isEmpty();
    }

    @Test
    @Tag("FR-001-19")
    void preferencesBeforeFirstSyncCreateTheProfile() throws Exception {
        String email = uniqueEmail();
        SignedIn ana = emulator().signInWithGoogle(email, "Ana Novak");

        HttpResponse<String> response =
                put("/api/me/preferences", ana.idToken(), "{\"language\":\"en\",\"theme\":null}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsEntry("email", email)
                .containsEntry("language", "en")
                .containsEntry("theme", null);
        assertThat(profileRows(ana.uid())).hasSize(1);
    }

    private void savePreferences(String token, String body) throws Exception {
        assertThat(put("/api/me/preferences", token, body).statusCode())
                .as("priprava izbire uspe")
                .isEqualTo(200);
    }

    private SignedIn signedUpUser() throws Exception {
        SignedIn ana = newGoogleUser("Ana Novak");
        assertThat(put("/api/me", ana.idToken(), null).statusCode()).isEqualTo(201);
        return ana;
    }
}
