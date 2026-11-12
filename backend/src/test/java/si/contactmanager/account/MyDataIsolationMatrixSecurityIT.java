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
