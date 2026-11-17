package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys;
import si.contactmanager.support.ApiKeys.Key;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;
import tools.jackson.databind.JsonNode;

/**
 * Matrika izolacije upravljanja API ključev (019, FR-019-01, -03, -18; konstitucija §3.1 – endpointi, vezani na
 * uporabnika): 401 brez, z neveljavnim, ponarejenim ali poteklim Firebase žetonom in z veljavnim API ključem (ključi se
 * upravljajo samo v spletni aplikaciji); 404 za tuj ali neobstoječ ključ in skupino, katere uporabnik ni član; 2xx
 * lastnik. Ustvarjanje dovoli vsako člansko vlogo in arhivirano skupino.
 */
@Tag("FR-019-01")
@Tag("FR-019-03")
@Tag("FR-019-18")
class ApiKeyManagementSecurityIT extends ApiTest {

    private static final String KEYS = "/api/me/api-keys";
    private static final Scope ALL_READ = Scope.allGroups(Permission.READ);

    @Autowired
    ApiKeyTokens tokens;

    private ApiKeys keys;
    private GroupFixtures groups;
    private SignedIn ana;
    private long anaId;
    private UUID klub;

    @BeforeEach
    void ana() throws Exception {
        keys = new ApiKeys(tokens, jdbc);
        groups = new GroupFixtures(jdbc);
        ana = registeredUser("Ana Matrika Ključev");
        anaId = keys.userId(ana.uid());
        klub = groups.createGroup(anaId, "Klub");
    }

    private static String body(UUID group) {
        return "{\"name\":\"Matrika\",\"groups\":[{\"groupId\":\"" + group + "\",\"permission\":\"WRITE\"}]}";
    }

    private HttpResponse<String> send(String method, String path, String token, String body) throws Exception {
        return Http.send(method, url(path), token == null ? Map.of() : Http.bearer(token), body);
    }

    private int keyCount(long user) {
        Integer count = jdbc.queryForObject("select count(*) from api_key where user_id = ?", Integer.class, user);
        return count == null ? 0 : count;
    }

    private String credential(String kind) {
        return switch (kind) {
            case "none" -> null;
            case "garbage" -> "to.ni.zeton";
            case "forged" -> Tokens.withForgedSignature(ana.idToken());
            case "expired" -> Tokens.withClaims(ana.idToken(), claims -> claims.put("exp", Tokens.epochSeconds(-3600)));
            default -> keys.create(anaId, "Programski", ALL_READ).token();
        };
    }

    static Stream<Arguments> unauthenticated() {
        List<String> kinds = List.of("none", "garbage", "forged", "expired", "apiKey");
        return Stream.of("GET", "POST", "DELETE")
                .flatMap(method -> kinds.stream().map(k -> Arguments.of(method, k)));
    }

    @ParameterizedTest(name = "{0} /api/me/api-keys s prijavo {1} → 401")
    @MethodSource("unauthenticated")
    void invalidAuthenticationIs401(String method, String kind) throws Exception {
        Key existing = keys.create(anaId, "Obstoječi", ALL_READ);
        String path = method.equals("DELETE") ? KEYS + "/" + existing.id() : KEYS;
        int before = keyCount(anaId);

        HttpResponse<String> response = send(method, path, credential(kind), method.equals("POST") ? body(klub) : null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("UNAUTHENTICATED");
        assertThat(keyCount(anaId)).isEqualTo(before + (kind.equals("apiKey") ? 1 : 0));
        assertThat(jdbc.queryForObject(
                        "select revoked_at is null from api_key where id = ?", Boolean.class, existing.id()))
                .isTrue();
    }

    @Test
    void ownerListsOnlyOwnKeys() throws Exception {
        SignedIn bor = registeredUser("Bor Matrika Ključev");
        Key own = keys.create(anaId, "Moj", ALL_READ);
        Key foreign = keys.create(keys.userId(bor.uid()), "Tuj", ALL_READ);

        HttpResponse<String> response = send("GET", KEYS, ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode list = JSON.readTree(response.body());
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("id").asString()).isEqualTo(own.id().toString());
        assertThat(response.body()).doesNotContain(foreign.id().toString()).doesNotContain("Tuj");
    }

    @ParameterizedTest(name = "POST s skupino {0} → 404")
    @ValueSource(strings = {"foreign", "missing", "invalid"})
    void groupOutsideMembershipIs404(String kind) throws Exception {
        SignedIn bor = registeredUser("Bor Tuja Skupina");
        String group = switch (kind) {
            case "foreign" -> groups.createGroup(keys.userId(bor.uid()), "Tuja").toString();
            case "missing" -> UUID.randomUUID().toString();
            default -> "ni-uuid";
        };

        HttpResponse<String> response =
                send("POST", KEYS, ana.idToken(), "{\"name\":\"X\",\"groups\":[{\"groupId\":\"" + group + "\"}]}");

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(keyCount(anaId)).isZero();
    }

    @ParameterizedTest(name = "POST član z vlogo {0} → 201")
    @ValueSource(strings = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void anyMemberRoleMayCreate(String role) throws Exception {
        SignedIn member = registeredUser("Član " + role);
        long memberId = keys.userId(member.uid());
        UUID group = role.equals("OWNER") ? groups.createGroup(memberId, "Lastna") : klub;
        if (!role.equals("OWNER")) {
            groups.addMember(group, memberId, role);
        }

        HttpResponse<String> response = send("POST", KEYS, member.idToken(), body(group));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(keyCount(memberId)).isEqualTo(1);
    }

    @ParameterizedTest(name = "POST arhivirana skupina ({0}) → 201")
    @ValueSource(booleans = {false, true})
    void archivedGroupMayBeChosen(boolean permanently) throws Exception {
        SignedIn editor = registeredUser("Urednik Arhiv");
        groups.addMember(klub, keys.userId(editor.uid()), "EDITOR");
        groups.archive(klub);
        if (permanently) {
            groups.makePermanentlyArchived(klub);
        }

        assertThat(send("POST", KEYS, editor.idToken(), body(klub)).statusCode())
                .isEqualTo(201);
    }

    @Test
    void foreignKeyCannotBeRevokedAndStaysValid() throws Exception {
        SignedIn bor = registeredUser("Bor Tuj Ključ");
        Key foreign = keys.create(keys.userId(bor.uid()), "Borov", ALL_READ);

        HttpResponse<String> response = send("DELETE", KEYS + "/" + foreign.id(), ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject(
                        "select revoked_at is null from api_key where id = ?", Boolean.class, foreign.id()))
                .isTrue();
        assertThat(Http.send("GET", url("/v1/groups"), Http.bearer(foreign.token()))
                        .statusCode())
                .isNotEqualTo(401);
    }

    @ParameterizedTest(name = "DELETE {0} → 404")
    @ValueSource(strings = {"0193c4a2-7a1f-7c3e-9b1a-000000000000", "ni-uuid"})
    void missingKeyIs404(String id) throws Exception {
        assertThat(send("DELETE", KEYS + "/" + id, ana.idToken(), null).statusCode())
                .isEqualTo(404);
    }

    @Test
    void ownerRevokes() throws Exception {
        Key own = keys.create(anaId, "Moj", ALL_READ);

        assertThat(send("DELETE", KEYS + "/" + own.id(), ana.idToken(), null).statusCode())
                .isEqualTo(204);
        assertThat(jdbc.queryForObject(
                        "select revoked_at is not null from api_key where id = ?", Boolean.class, own.id()))
                .isTrue();
    }

    // --- GET /api/me/api-keys/{keyId}/usage (FR-019-20) ---

    private String usagePath(UUID key) {
        return KEYS + "/" + key + "/usage";
    }

    static Stream<Arguments> usageUnauthenticated() {
        return Stream.of("none", "garbage", "forged", "expired", "apiKey", "ownApiKey")
                .map(Arguments::of);
    }

    @ParameterizedTest(name = "GET usage s prijavo {0} → 401")
    @MethodSource("usageUnauthenticated")
    void usageWithoutValidFirebaseSignInIs401(String kind) throws Exception {
        Key existing = keys.create(anaId, "Obstoječi", ALL_READ);
        String credential = kind.equals("ownApiKey") ? existing.token() : credential(kind);

        HttpResponse<String> response = send("GET", usagePath(existing.id()), credential, null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("UNAUTHENTICATED");
    }

    @ParameterizedTest(name = "GET usage tujega ključa → 404 ({0})")
    @ValueSource(strings = {"foreign", "missing", "invalid"})
    void usageOfForeignMissingOrInvalidKeyIs404(String kind) throws Exception {
        SignedIn bor = registeredUser("Bor Statistika");
        Key foreign = keys.create(keys.userId(bor.uid()), "Borov", ALL_READ);
        String id = switch (kind) {
            case "foreign" -> foreign.id().toString();
            case "missing" -> UUID.randomUUID().toString();
            default -> "ni-uuid";
        };

        HttpResponse<String> response = send("GET", KEYS + "/" + id + "/usage", ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).doesNotContain("totals");
    }

    @ParameterizedTest(name = "GET usage lastnega ključa ({0}) → 200")
    @ValueSource(strings = {"active", "revoked", "expired"})
    void ownerReadsUsageOfActiveRevokedAndExpiredKeys(String kind) throws Exception {
        Key key = switch (kind) {
            case "revoked" -> keys.revoked(anaId, ALL_READ);
            case "expired" -> keys.expired(anaId, ALL_READ);
            default -> keys.create(anaId, "Aktiven", ALL_READ);
        };

        HttpResponse<String> response = send("GET", usagePath(key.id()), ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = JSON.readTree(response.body());
        assertThat(body.get("days").asInt()).isEqualTo(7);
        assertThat(body.get("perDay")).hasSize(7);
        assertThat(body.get("totals").get("total").asInt()).isZero();
    }

    @Test
    void usageOfAKeyEndedMoreThan90DaysAgoIs404() throws Exception {
        Key key = keys.create(anaId, "Star", ALL_READ);
        jdbc.update("update api_key set revoked_at = now() - interval '91 days' where id = ?", key.id());

        assertThat(send("GET", usagePath(key.id()), ana.idToken(), null).statusCode())
                .isEqualTo(404);
    }
}
