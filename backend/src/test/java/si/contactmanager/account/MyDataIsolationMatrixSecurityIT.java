package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;
import tools.jackson.databind.JsonNode;

/**
 * Matrika izolacije za uporabniško vezane endpointe 012 (workflow 2.5; FR-012-02, -03, -16): 401 pri vsaki neveljavni
 * prijavi, tuj identifikator v poti → 404 (operacije ni), izvoz samo lastnih podatkov, izbris samo lastnega računa.
 */
@Tag("FR-012-02")
@Tag("FR-012-03")
@Tag("FR-012-16")
class MyDataIsolationMatrixSecurityIT extends AccountApiTest {

    private static final String[][] ENDPOINTS = {
        {"GET", "/api/me/export"}, {"GET", "/api/me/deletion-blockers"}, {"POST", "/api/me/deletion"}
    };

    static Stream<Arguments> unauthenticatedCases() {
        List<String> kinds = List.of("none", "garbage", "forged", "expired");
        return Stream.of(ENDPOINTS)
                .flatMap(endpoint -> kinds.stream().map(kind -> Arguments.of(endpoint[0], endpoint[1], kind)));
    }

    @ParameterizedTest(name = "{0} {1} s {2} žetonom → 401")
    @MethodSource("unauthenticatedCases")
    void invalidAuthenticationIsAlways401(String method, String path, String kind) throws Exception {
        SignedIn pia = registeredUser("Pia Matrika");
        String token = switch (kind) {
            case "none" -> null;
            case "garbage" -> "to.ni.zeton";
            case "forged" -> Tokens.withForgedSignature(pia.idToken());
            default -> Tokens.withClaims(pia.idToken(), claims -> claims.put("exp", Tokens.epochSeconds(-3600)));
        };

        HttpResponse<String> response = Http.send(
                method,
                url(path),
                token == null ? java.util.Map.of() : Http.bearer(token),
                method.equals("POST") ? deletionBody(email(pia)) : null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("UNAUTHENTICATED");
        assertThat(account.appUserExists(pia.uid())).isTrue();
    }

    private static final String FORMATS_BODY =
            "{\"language\":null,\"theme\":null,\"phoneFormat\":\"E164\",\"dateFormat\":\"ISO\"}";

    static Stream<Arguments> unauthenticatedFormatCases() {
        List<String> paths = List.of("/api/me/preferences", "/api/me");
        return paths.stream()
                .flatMap(path ->
                        List.of("none", "garbage", "forged", "expired").stream().map(kind -> Arguments.of(path, kind)));
    }

    /** 016, FR-016-16: PUT /api/me/preferences, /api/me – 401 pri vsaki neveljavni prijavi, nič se ne spremeni. */
    @Tag("FR-016-16")
    @ParameterizedTest(name = "PUT {0} s {1} žetonom → 401")
    @MethodSource("unauthenticatedFormatCases")
    void changingDisplayFormatsRequiresAuthentication(String path, String kind) throws Exception {
        SignedIn pia = registeredUser("Pia Oblike 401");
        String token = switch (kind) {
            case "none" -> null;
            case "garbage" -> "to.ni.zeton";
            case "forged" -> Tokens.withForgedSignature(pia.idToken());
            default -> Tokens.withClaims(pia.idToken(), claims -> claims.put("exp", Tokens.epochSeconds(-3600)));
        };

        HttpResponse<String> response =
                Http.send("PUT", url(path), token == null ? java.util.Map.of() : Http.bearer(token), FORMATS_BODY);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("UNAUTHENTICATED");
        assertThat(JSON.readTree(export(pia).body())
                        .get("profile")
                        .get("phoneFormat")
                        .isNull())
                .isTrue();
    }

    /** FR-016-16: sprememba sheme vpliva samo na lastni profil; neveljavna vrednost je 400 brez sprememb. */
    @Tag("FR-016-16")
    @Test
    void changingDisplayFormatsAffectsOnlyTheCallersProfile() throws Exception {
        SignedIn pia = registeredUser("Pia Sheme");
        SignedIn ana = registeredUser("Ana Sheme");

        assertThat(put("/api/me/preferences", pia.idToken(), FORMATS_BODY).statusCode())
                .isEqualTo(200);
        assertThat(put("/api/me/preferences", pia.idToken(), "{\"language\":null,\"theme\":null,\"phoneFormat\":\"X\"}")
                        .statusCode())
                .isEqualTo(400);

        JsonNode piaProfile = JSON.readTree(export(pia).body()).get("profile");
        JsonNode anaProfile = JSON.readTree(export(ana).body()).get("profile");
        assertThat(piaProfile.get("phoneFormat").asString()).isEqualTo("E164");
        assertThat(anaProfile.get("phoneFormat").isNull()).isTrue();
        assertThat(anaProfile.get("dateFormat").isNull()).isTrue();
    }

    /** FR-016-17: izvoz vsebuje oblike zapisa samo lastnega uporabnika. */
    @Tag("FR-016-17")
    @Test
    void exportContainsOnlyTheCallersDisplayFormats() throws Exception {
        SignedIn pia = registeredUser("Pia Izvoz Sheme");
        SignedIn ana = registeredUser("Ana Izvoz Sheme");
        put(
                "/api/me/preferences",
                ana.idToken(),
                "{\"language\":null,\"theme\":null,\"addressFormat\":\"SINGLE_LINE\"}");

        JsonNode piaProfile = JSON.readTree(export(pia).body()).get("profile");
        JsonNode anaProfile = JSON.readTree(export(ana).body()).get("profile");

        assertThat(piaProfile.get("addressFormat").isNull()).isTrue();
        assertThat(anaProfile.get("addressFormat").asString()).isEqualTo("SINGLE_LINE");
    }

    /** 019, FR-019-05: izvoz vsebuje samo API ključe klicatelja. */
    @Tag("FR-019-05")
    @Test
    void exportContainsOnlyTheCallersApiKeys() throws Exception {
        SignedIn pia = registeredUser("Pia Izvoz Ključev");
        SignedIn ana = registeredUser("Ana Izvoz Ključev");
        post("/api/me/api-keys", pia.idToken(), "{\"name\":\"PiinKljuc\",\"allGroups\":true}");
        post("/api/me/api-keys", ana.idToken(), "{\"name\":\"AninKljuc\",\"allGroups\":true}");

        HttpResponse<String> response = export(pia);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode keys = JSON.readTree(response.body()).get("apiKeys");
        assertThat(keys).hasSize(1);
        assertThat(keys.get(0).get("name").asString()).isEqualTo("PiinKljuc");
        assertThat(response.body()).doesNotContain("AninKljuc");
    }

    @Test
    void pathsWithAnotherUsersIdentifierDoNotExist() throws Exception {
        SignedIn pia = registeredUser("Pia Pot");
        SignedIn ana = registeredUser("Ana Pot");
        String[] identifiers = {
            ana.uid(), String.valueOf(id(ana)), UUID.randomUUID().toString()
        };

        for (String identifier : identifiers) {
            assertThat(get("/api/users/" + identifier + "/export", pia.idToken())
                            .statusCode())
                    .isEqualTo(404);
            assertThat(Http.send("DELETE", url("/api/users/" + identifier), Http.bearer(pia.idToken()))
                            .statusCode())
                    .isEqualTo(404);
            assertThat(get("/api/me/" + identifier + "/export", pia.idToken()).statusCode())
                    .isEqualTo(404);
        }
        assertThat(Http.send("DELETE", url("/api/me"), Http.bearer(pia.idToken()))
                        .statusCode())
                .as("pot obstaja samo za PUT")
                .isEqualTo(405);
        assertThat(account.appUserExists(ana.uid())).isTrue();
        assertThat(account.appUserExists(pia.uid())).isTrue();
    }

    @Test
    void eachUsersExportContainsOnlyTheirOwnData() throws Exception {
        SignedIn pia = registeredUser("Pia Lastni");
        SignedIn ana = registeredUser("Ana Lastni");
        UUID piaGroup = activeGroup(pia, "PiaSkupinaUnikat");
        UUID anaGroup = activeGroup(ana, "AnaSkupinaUnikat");
        contacts.insert(piaGroup, id(pia), "PiaKontaktUnikat", "X");
        contacts.insert(anaGroup, id(ana), "AnaKontaktUnikat", "X");

        String piaBody = export(pia).body();
        String anaBody = export(ana).body();

        assertThat(piaBody)
                .contains("PiaSkupinaUnikat")
                .doesNotContain("AnaSkupinaUnikat")
                .doesNotContain("AnaKontaktUnikat")
                .doesNotContain(email(ana))
                .doesNotContain("Ana Lastni");
        assertThat(anaBody)
                .contains("AnaSkupinaUnikat")
                .doesNotContain("PiaSkupinaUnikat")
                .doesNotContain("PiaKontaktUnikat")
                .doesNotContain(email(pia))
                .doesNotContain("Pia Lastni");
        JsonNode piaData = JSON.readTree(piaBody);
        assertThat(piaData.get("profile").get("email").asString()).isEqualTo(email(pia));
    }

    @Test
    void aUserIdQueryParameterCannotSelectAnotherUsersData() throws Exception {
        SignedIn pia = registeredUser("Pia Parameter");
        SignedIn ana = registeredUser("Ana Parameter");
        activeGroup(ana, "AnaParameterSkupinaUnikat");

        HttpResponse<String> response = get("/api/me/export?userId=" + id(ana) + "&uid=" + ana.uid(), pia.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(JSON.readTree(response.body()).get("profile").get("email").asString())
                .isEqualTo(email(pia));
        assertThat(response.body()).doesNotContain("AnaParameterSkupinaUnikat").doesNotContain(email(ana));
    }

    @Test
    void deletingWithAnotherUsersEmailIsRejectedAndBothAccountsRemain() throws Exception {
        SignedIn pia = registeredUser("Pia Tuj E-naslov");
        SignedIn ana = registeredUser("Ana Tuj E-naslov");

        HttpResponse<String> response = deleteAccount(pia, email(ana));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(account.appUserExists(pia.uid())).isTrue();
        assertThat(account.appUserExists(ana.uid())).isTrue();
        assertThat(account.tombstone(pia.uid())).isEmpty();
        assertThat(account.tombstone(ana.uid())).isEmpty();
    }
}
