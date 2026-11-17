package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys;
import si.contactmanager.support.ApiKeys.Key;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Prijava z API ključem na {@code /v1/**} (FR-019-04, -09, -17; research R-02): vsak 401 akter iz matrike izolacije
 * dobi {@code 401 UNAUTHENTICATED} že v verigi (pred krmilnikom). API ključ ne velja na {@code /api/**} in CardDAV;
 * ključ se nikoli ne zapiše v dnevnik.
 */
@Tag("FR-019-04")
@Tag("FR-019-09")
@Tag("FR-019-17")
@ExtendWith(OutputCaptureExtension.class)
class ApiKeyAuthenticationIT extends ApiTest {

    private static final String GROUPS = "/v1/groups";
    private static final Scope ALL_READ = Scope.allGroups(Permission.READ);

    @Autowired
    ApiKeyTokens tokens;

    private ApiKeys keys;
    private SignedIn owner;
    private long ownerId;

    @BeforeEach
    void owner() throws Exception {
        keys = new ApiKeys(tokens, jdbc);
        owner = registeredUser("Ana Novak");
        ownerId = keys.userId(owner.uid());
    }

    private HttpResponse<String> send(String path, Map<String, String> headers) throws Exception {
        return Http.send("GET", url(path), headers);
    }

    private static Map<String, String> bearer(String token) {
        return Map.of("Authorization", "Bearer " + token);
    }

    private static void assertUnauthenticated(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(Http.compact(response.body())).isEqualTo("{\"code\":\"UNAUTHENTICATED\"}");
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
    }

    private long sqlUser() {
        Long id = jdbc.queryForObject(
                "insert into app_user (firebase_uid, email) values (?, ?) returning id",
                Long.class,
                "uid-" + UUID.randomUUID(),
                uniqueEmail());
        return id == null ? -1 : id;
    }

    /** Akterji 401 iz matrike (plan.md, Constitution Check III) – vsak dobi svoj ključ. */
    enum Unauthenticated {
        NO_HEADER,
        FIREBASE_TOKEN,
        MALFORMED_KEY,
        JWT_WITHOUT_PREFIX,
        FORGED_SIGNATURE,
        OTHER_SIGNING_SECRET,
        EXPIRED_KEY,
        REVOKED_KEY,
        KEY_WITHOUT_ROW,
        KEY_OF_OTHER_OWNER,
        DELETED_ACCOUNT,
        KEY_IN_QUERY,
        KEY_IN_OTHER_HEADER,
        BASIC_AUTH
    }

    static Stream<Arguments> unauthenticatedActors() {
        return Stream.of(Unauthenticated.values()).map(Arguments::of);
    }

    private HttpResponse<String> request(Unauthenticated actor) throws Exception {
        return switch (actor) {
            case NO_HEADER -> send(GROUPS, Map.of());
            case FIREBASE_TOKEN -> send(GROUPS, bearer(owner.idToken()));
            case MALFORMED_KEY -> send(GROUPS, bearer("cmk_ni-zeton"));
            case JWT_WITHOUT_PREFIX ->
                send(
                        GROUPS,
                        bearer(keys.create(ownerId, "Brez predpone", ALL_READ)
                                .token()
                                .substring(4)));
            case FORGED_SIGNATURE -> {
                String token = keys.create(ownerId, "Ponarejen", ALL_READ).token();
                String[] parts = token.split("\\.");
                String forged = parts[0] + "." + parts[1] + "."
                        + Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
                yield send(GROUPS, bearer(forged));
            }
            case OTHER_SIGNING_SECRET ->
                send(
                        GROUPS,
                        bearer(keys.signedWithOtherSecret(ownerId, ALL_READ).token()));
            case EXPIRED_KEY ->
                send(GROUPS, bearer(keys.expired(ownerId, ALL_READ).token()));
            case REVOKED_KEY ->
                send(GROUPS, bearer(keys.revoked(ownerId, ALL_READ).token()));
            case KEY_WITHOUT_ROW -> send(GROUPS, bearer(keys.withoutRow(ownerId, ALL_READ)));
            case KEY_OF_OTHER_OWNER -> {
                Key key = keys.create(ownerId, "Tuj sub", ALL_READ);
                yield send(GROUPS, bearer(keys.withOtherSubject(key, sqlUser(), ALL_READ)));
            }
            case DELETED_ACCOUNT -> {
                long deleted = sqlUser();
                Key key = keys.create(deleted, "Izbrisan račun", ALL_READ);
                jdbc.update("delete from app_user where id = ?", deleted);
                yield send(GROUPS, bearer(key.token()));
            }
            case KEY_IN_QUERY -> {
                String token = keys.create(ownerId, "V naslovu", ALL_READ).token();
                String encoded = URLEncoder.encode(token, StandardCharsets.UTF_8);
                yield send(GROUPS + "?api_key=" + encoded + "&access_token=" + encoded, Map.of());
            }
            case KEY_IN_OTHER_HEADER ->
                send(
                        GROUPS,
                        Map.of(
                                "X-Api-Key",
                                keys.create(ownerId, "Druga glava", ALL_READ).token()));
            case BASIC_AUTH -> {
                String token = keys.create(ownerId, "Basic", ALL_READ).token();
                String basic =
                        Base64.getEncoder().encodeToString(("ana@primer.si:" + token).getBytes(StandardCharsets.UTF_8));
                yield send(GROUPS, Map.of("Authorization", "Basic " + basic));
            }
        };
    }

    @ParameterizedTest(name = "{0} → 401")
    @MethodSource("unauthenticatedActors")
    void everyUnauthenticatedActorGets401(Unauthenticated actor) throws Exception {
        assertUnauthenticated(request(actor));
    }

    @Test
    void validKeyPassesTheChain() throws Exception {
        Key key = keys.create(ownerId, "Veljaven", ALL_READ);
        UUID group = jdbc.queryForObject("insert into contact_group (title) values ('Klub') returning id", UUID.class);
        Key withoutExpiry = keys.withoutExpiry(ownerId, Scope.groups(Map.of(group, Permission.WRITE)));

        assertThat(send(GROUPS, bearer(key.token())).statusCode()).isNotEqualTo(401);
        assertThat(send(GROUPS, Map.of("Authorization", "bearer " + withoutExpiry.token()))
                        .statusCode())
                .isNotEqualTo(401);
    }

    @Test
    void revokingKeyStopsItAndOtherKeysKeepWorking() throws Exception {
        Key revoked = keys.create(ownerId, "Prekličem", ALL_READ);
        Key other = keys.create(ownerId, "Ostane", ALL_READ);
        assertThat(send(GROUPS, bearer(revoked.token())).statusCode()).isNotEqualTo(401);

        keys.revoke(revoked.id());

        assertUnauthenticated(send(GROUPS, bearer(revoked.token())));
        assertThat(send(GROUPS, bearer(other.token())).statusCode()).isNotEqualTo(401);
    }

    @Test
    void openApiDescriptionDoesNotRequireKey() throws Exception {
        Map<String, String> invalid = bearer("cmk_neveljaven");

        assertThat(send("/v1/openapi.json", Map.of()).statusCode()).isNotEqualTo(401);
        assertThat(send("/v1/openapi.json", invalid).statusCode()).isNotEqualTo(401);
        assertThat(send("/v1/openapi.json", bearer(owner.idToken())).statusCode())
                .isNotEqualTo(401);
    }

    @Test
    void apiKeyIsNotValidOnWebApi() throws Exception {
        Key key = keys.create(ownerId, "Spletna", Scope.allGroups(Permission.WRITE));

        for (String path : new String[] {"/api/groups", "/api/me", "/api/me/export"}) {
            assertUnauthenticated(send(path, bearer(key.token())));
        }
        assertThat(send("/api/groups", bearer(owner.idToken())).statusCode()).isEqualTo(200);
    }

    @Test
    void apiKeyIsNotValidOnCardDav() throws Exception {
        Key key = keys.create(ownerId, "CardDAV", ALL_READ);

        HttpResponse<String> response = send("/dav/", bearer(key.token()));

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("WWW-Authenticate"))
                .hasValueSatisfying(value -> assertThat(value).startsWith("Basic"));
    }

    @Test
    void keyIsNeverLoggedOnlyItsId(CapturedOutput output) throws Exception {
        Key revoked = keys.revoked(ownerId, ALL_READ);
        Key valid = keys.create(ownerId, "Dnevnik", ALL_READ);
        Map<String, String> sent = new LinkedHashMap<>();
        sent.put("revoked", revoked.token());
        sent.put("valid", valid.token());
        sent.put("expired", keys.expired(ownerId, ALL_READ).token());

        assertUnauthenticated(send(GROUPS, bearer(revoked.token())));
        send(GROUPS, bearer(valid.token()));
        assertUnauthenticated(send(GROUPS, bearer(sent.get("expired"))));
        send(GROUPS + "?api_key=" + URLEncoder.encode(valid.token(), StandardCharsets.UTF_8), Map.of());

        for (String token : sent.values()) {
            String signature = token.substring(token.lastIndexOf('.') + 1);
            assertThat(output.getAll()).doesNotContain(token).doesNotContain(signature);
        }
        assertThat(output.getAll()).contains("jti=" + revoked.id());
    }
}
