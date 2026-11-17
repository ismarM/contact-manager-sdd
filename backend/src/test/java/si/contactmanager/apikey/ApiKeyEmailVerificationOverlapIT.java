package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Prekrivanje 017 (Email/Password, potrditev e-naslova) in 019 (API ključi): upravljanje ključev je za nepotrjen
 * e-naslov zaprto z {@code 403 EMAIL_NOT_VERIFIED} (nič se ne ustvari); API ključ na {@code /v1/**} ne uporablja
 * Firebase žetona, zato ga filter potrditve ne zadeva, Firebase žeton pa tam ostane 401; ključ drugega uporabnika
 * nikoli ne vidi tuje skupine.
 */
@Tag("FR-017-02")
class ApiKeyEmailVerificationOverlapIT extends ApiTest {

    @Autowired
    ApiKeyTokens tokens;

    @Test
    void unverifiedPasswordAccountCannotManageApiKeys() throws Exception {
        SignedIn unverified = emulator().signUpWithPassword(uniqueEmail(), "geslo-12345678");
        int before = jdbc.queryForObject("select count(*) from api_key", Integer.class);

        HttpResponse<String> list = get("/api/me/api-keys", unverified.idToken());
        HttpResponse<String> create = post("/api/me/api-keys", unverified.idToken(), "{\"name\":\"Nepotrjen\"}");

        for (HttpResponse<String> response : java.util.List.of(list, create)) {
            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "EMAIL_NOT_VERIFIED"));
        }
        assertThat(jdbc.queryForObject("select count(*) from api_key", Integer.class))
                .isEqualTo(before);
        assertThat(profileRows(unverified.uid())).isEmpty();
    }

    @Test
    void apiKeyIsIndependentOfFirebaseVerificationAndFirebaseTokenIsNotAKey() throws Exception {
        SignedIn owner = registeredUser("Ana Ključ");
        ApiKeys keys = new ApiKeys(tokens, jdbc);
        long ownerId = keys.userId(owner.uid());
        ApiKeys.Key key = keys.create(ownerId, "Za skripte", Scope.allGroups(Permission.READ));
        // Račun izgubi potrditev (npr. po dodajanju gesla pri pravem Firebase): Firebase žeton je zaprt, ključ ni vezan
        // na
        // Firebase žeton in dela naprej.
        String unverifiedToken = unverifiedCopy(owner.idToken());

        HttpResponse<String> blocked = get("/api/groups", unverifiedToken);
        HttpResponse<String> viaKey =
                Http.send("GET", url("/v1/groups"), Map.of("Authorization", "Bearer " + key.token()));
        HttpResponse<String> firebaseOnV1 =
                Http.send("GET", url("/v1/groups"), Map.of("Authorization", "Bearer " + owner.idToken()));

        assertThat(blocked.statusCode()).isEqualTo(403);
        assertThat(json(blocked.body())).containsEntry("code", "EMAIL_NOT_VERIFIED");
        assertThat(viaKey.statusCode()).isEqualTo(200);
        assertThat(firebaseOnV1.statusCode()).isEqualTo(401);
    }

    private static String unverifiedCopy(String idToken) {
        return si.contactmanager.support.Tokens.withClaims(idToken, claims -> claims.put("email_verified", false));
    }
}
