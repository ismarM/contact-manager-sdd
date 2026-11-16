package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/**
 * Prikazne sheme (016, FR-016-16, FR-016-17, FR-016-18): shranjevanje v profil, manjka = nespremenjeno, null =
 * privzeto, validacija, prednost profila ob prijavi, izvoz mojih podatkov, izbris z računom; API ostane kanoničen.
 */
class DisplayFormatsIT extends AccountApiTest {

    private static final String ALL =
            "{\"language\":\"sl\",\"theme\":null,\"phoneFormat\":\"NATIONAL\",\"dateFormat\":\"LONG\","
                    + "\"addressFormat\":\"SINGLE_LINE\"}";

    private static final String BASE = "{\"language\":\"en\",\"theme\":\"dark\"}";

    @Test
    @Tag("FR-016-16")
    @Tag("FR-016-17")
    void savesAllThreeFormatsInTheProfile() throws Exception {
        SignedIn pia = registeredUser("Pia Oblike");

        HttpResponse<String> response = put("/api/me/preferences", pia.idToken(), ALL);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsEntry("phoneFormat", "NATIONAL")
                .containsEntry("dateFormat", "LONG")
                .containsEntry("addressFormat", "SINGLE_LINE");
        assertThat(jdbc.queryForMap(
                        "select phone_format, date_format, address_format from app_user where firebase_uid = ?",
                        pia.uid()))
                .containsEntry("phone_format", "NATIONAL")
                .containsEntry("date_format", "LONG")
                .containsEntry("address_format", "SINGLE_LINE");
    }

    @Test
    @Tag("FR-016-17")
    void missingFieldsAreUnchangedAndNullResetsToDefault() throws Exception {
        SignedIn pia = registeredUser("Pia Nespremenjeno");
        put("/api/me/preferences", pia.idToken(), ALL);

        HttpResponse<String> unchanged = put("/api/me/preferences", pia.idToken(), BASE);
        HttpResponse<String> reset = put(
                "/api/me/preferences", pia.idToken(), "{\"language\":\"en\",\"theme\":\"dark\",\"dateFormat\":null}");

        assertThat(json(unchanged.body()))
                .containsEntry("phoneFormat", "NATIONAL")
                .containsEntry("dateFormat", "LONG")
                .containsEntry("addressFormat", "SINGLE_LINE");
        assertThat(json(reset.body()))
                .containsEntry("phoneFormat", "NATIONAL")
                .containsEntry("dateFormat", null)
                .containsEntry("addressFormat", "SINGLE_LINE");
    }

    @ParameterizedTest(name = "{0} → 400 {1}")
    @Tag("FR-016-16")
    @CsvSource(
            delimiter = '|',
            value = {
                "{\"language\":null,\"theme\":null,\"phoneFormat\":\"nacionalno\"} | phoneFormat",
                "{\"language\":null,\"theme\":null,\"dateFormat\":\"iso\"}         | dateFormat",
                "{\"language\":null,\"theme\":null,\"addressFormat\":5}            | addressFormat"
            })
    void invalidValueIsRejectedWithoutChanges(String body, String field) throws Exception {
        SignedIn pia = registeredUser("Pia Neveljavno");
        put("/api/me/preferences", pia.idToken(), ALL);
        List<Map<String, Object>> before = profileRows(pia.uid());

        HttpResponse<String> response = put("/api/me/preferences", pia.idToken(), body);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body()).get("errors"))
                .asInstanceOf(InstanceOfAssertFactories.LIST)
                .contains(Map.of("field", field, "code", "INVALID_VALUE"));
        assertThat(profileRows(pia.uid())).isEqualTo(before);
    }

    @Test
    @Tag("FR-016-17")
    void profileWinsOverDeviceOnSignInAndDeviceFillsEmptyFields() throws Exception {
        SignedIn pia = registeredUser("Pia Naprava");
        put("/api/me/preferences", pia.idToken(), "{\"language\":null,\"theme\":null,\"phoneFormat\":\"E164\"}");

        HttpResponse<String> response = put("/api/me", pia.idToken(), ALL);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsEntry("phoneFormat", "E164")
                .containsEntry("dateFormat", "LONG")
                .containsEntry("addressFormat", "SINGLE_LINE");
    }

    @Test
    @Tag("FR-016-17")
    void exportContainsOwnFormatsAndDeletionRemovesThem() throws Exception {
        SignedIn pia = registeredUser("Pia Izvoz");
        SignedIn ana = registeredUser("Ana Izvoz");
        put("/api/me/preferences", pia.idToken(), ALL);

        JsonNode profile = JSON.readTree(export(pia).body()).get("profile");
        JsonNode anaProfile = JSON.readTree(export(ana).body()).get("profile");

        assertThat(profile.get("phoneFormat").asString()).isEqualTo("NATIONAL");
        assertThat(profile.get("dateFormat").asString()).isEqualTo("LONG");
        assertThat(profile.get("addressFormat").asString()).isEqualTo("SINGLE_LINE");
        assertThat(anaProfile.get("phoneFormat").isNull()).isTrue();

        assertThat(deleteAccount(pia).statusCode()).isEqualTo(204);
        assertThat(account.appUserExists(pia.uid())).isFalse();
    }

    @Test
    @Tag("FR-016-18")
    void apiStaysCanonicalRegardlessOfTheScheme() throws Exception {
        SignedIn pia = registeredUser("Pia Kanonično");
        put("/api/me/preferences", pia.idToken(), ALL);
        UUID group = activeGroup(pia, "Skupina oblik");
        UUID contact = contacts.insert(group, id(pia), "Kontakt", "Oblik");
        contacts.addAttribute(contact, 0, "Tel", "+38641123456");

        HttpResponse<String> response = get("/api/groups/" + group + "/contacts/" + contact, pia.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("+38641123456").doesNotContain("041 123 456");
    }
}
