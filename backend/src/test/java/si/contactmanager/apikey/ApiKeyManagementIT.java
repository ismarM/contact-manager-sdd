package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
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
 * Upravljanje API ključev pod {@code /api/me/api-keys} (019, FR-019-01 … -04, -21; research R-09): enkraten prikaz
 * ključa, seznam brez vrednosti, preverjanje vnosa, meja 10 aktivnih (tudi sočasno), preklic in potek → 401 na
 * {@code /v1}, skrivanje starih ključev in ustvarjanje brez sveže prijave. Ključ se ne zapiše v bazo ali dnevnik.
 */
@Tag("FR-019-01")
@Tag("FR-019-02")
@Tag("FR-019-03")
@Tag("FR-019-04")
@ExtendWith(OutputCaptureExtension.class)
class ApiKeyManagementIT extends ApiTest {

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
        ana = registeredUser("Ana Ključ");
        anaId = keys.userId(ana.uid());
        klub = groups.createGroup(anaId, "Klub");
    }

    private HttpResponse<String> create(String body) throws Exception {
        return post(KEYS, ana.idToken(), body);
    }

    private static String klubBody(String name, UUID group) {
        return "{\"name\":\"" + name + "\",\"groups\":[{\"groupId\":\"" + group + "\",\"permission\":\"READ\"}]}";
    }

    private JsonNode list() throws Exception {
        HttpResponse<String> response = get(KEYS, ana.idToken());
        assertThat(response.statusCode()).isEqualTo(200);
        return JSON.readTree(response.body());
    }

    private JsonNode listed(String id) throws Exception {
        for (JsonNode key : list()) {
            if (key.get("id").asString().equals(id)) {
                return key;
            }
        }
        return null;
    }

    private int v1(String token) throws Exception {
        return Http.send("GET", url("/v1/groups"), Http.bearer(token)).statusCode();
    }

    private int keyCount() {
        Integer count = jdbc.queryForObject("select count(*) from api_key where user_id = ?", Integer.class, anaId);
        return count == null ? 0 : count;
    }

    @Test
    void createdKeyIsShownOnceAndNeverListedOrStored(CapturedOutput output) throws Exception {
        HttpResponse<String> response = create(klubBody("Nočni izvoz", klub));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        JsonNode created = JSON.readTree(response.body());
        String token = created.get("token").asString();
        assertThat(token).startsWith("cmk_");
        JsonNode key = created.get("key");
        String id = key.get("id").asString();
        assertThat(key.get("name").asString()).isEqualTo("Nočni izvoz");
        assertThat(key.get("hint").asString()).isEqualTo(token.substring(token.length() - 6));
        assertThat(key.get("allGroups").asBoolean()).isFalse();
        assertThat(key.get("groups").get(0).get("title").asString()).isEqualTo("Klub");
        assertThat(key.get("groups").get(0).get("permission").asString()).isEqualTo("READ");
        assertThat(key.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(key.get("lastUsedAt").isNull()).isTrue();
        Instant createdAt = Instant.parse(key.get("createdAt").asString());
        assertThat(Instant.parse(key.get("expiresAt").asString())).isEqualTo(createdAt.plus(Duration.ofDays(90)));
        assertThat(tokens.verify(token).orElseThrow().keyId()).isEqualTo(UUID.fromString(id));

        HttpResponse<String> listResponse = get(KEYS, ana.idToken());
        assertThat(listResponse.body()).doesNotContain(token).doesNotContain("token");
        assertThat(listed(id).get("name").asString()).isEqualTo("Nočni izvoz");
        assertThat(jdbc.queryForList("select * from api_key where id = ?", UUID.fromString(id))
                        .toString())
                .doesNotContain(token.substring(4));
        assertThat(v1(token)).isNotEqualTo(401);
        assertThat(output.getAll()).doesNotContain(token.substring(4));
    }

    @Test
    void scopeOptionsAndDefaults() throws Exception {
        JsonNode all = JSON.readTree(create("{\"name\":\"  Skripta  \",\"allGroups\":true,"
                                + "\"allGroupsPermission\":\"WRITE\",\"expiresInDays\":null}")
                        .body())
                .get("key");
        assertThat(all.get("name").asString()).isEqualTo("Skripta");
        assertThat(all.get("allGroups").asBoolean()).isTrue();
        assertThat(all.get("allGroupsPermission").asString()).isEqualTo("WRITE");
        assertThat(all.get("groups")).isEmpty();
        assertThat(all.get("expiresAt").isNull()).isTrue();

        JsonNode defaults = JSON.readTree(create("{\"name\":\"Privzeto\",\"allGroups\":true,\"expiresInDays\":365}")
                        .body())
                .get("key");
        assertThat(defaults.get("allGroupsPermission").asString()).isEqualTo("READ");
        assertThat(Instant.parse(defaults.get("expiresAt").asString()))
                .isEqualTo(Instant.parse(defaults.get("createdAt").asString()).plus(Duration.ofDays(365)));
    }

    @Test
    void invalidInputIsRejectedAndNothingIsCreated() throws Exception {
        String group = "{\"groupId\":\"" + klub + "\"}";
        Map<String, String[]> cases = Map.of(
                "{\"name\":\"   \",\"groups\":[" + group + "]}",
                new String[] {"name", "REQUIRED"},
                "{\"name\":\"" + "a".repeat(51) + "\",\"groups\":[" + group + "]}",
                new String[] {"name", "TOO_LONG"},
                "{\"name\":\"X\",\"groups\":[]}",
                new String[] {"groups", "REQUIRED"},
                "{\"name\":\"X\",\"groups\":[" + group + "," + group + "]}",
                new String[] {"groups[1].groupId", "DUPLICATE"},
                "{\"name\":\"X\",\"groups\":[{\"groupId\":\"" + klub + "\",\"permission\":\"ALL\"}]}",
                new String[] {"groups[0].permission", "INVALID_VALUE"},
                "{\"name\":\"X\",\"groups\":[" + group + "],\"expiresInDays\":7}",
                new String[] {"expiresInDays", "INVALID_VALUE"},
                "{\"name\":\"X\",\"allGroups\":true,\"groups\":[" + group + "]}",
                new String[] {"groups", "INVALID_VALUE"},
                "{\"name\":\"X\",\"allGroups\":true,\"allGroupsPermission\":\"ADMIN\"}",
                new String[] {"allGroupsPermission", "INVALID_VALUE"},
                "{\"name\":\"X\",\"groups\":[" + group + "],\"secret\":1}",
                new String[] {"secret", "UNKNOWN_FIELD"},
                "ni json",
                new String[] {"body", "MALFORMED"});

        for (var entry : cases.entrySet()) {
            HttpResponse<String> response = create(entry.getKey());
            assertThat(response.statusCode()).as(entry.getKey()).isEqualTo(400);
            JsonNode body = JSON.readTree(response.body());
            assertThat(body.get("code").asString()).isEqualTo("VALIDATION_FAILED");
            assertThat(body.get("errors").toString())
                    .as(entry.getKey())
                    .contains("\"field\":\"" + entry.getValue()[0] + "\"")
                    .contains("\"code\":\"" + entry.getValue()[1] + "\"");
        }
        String tooMany = "{\"name\":\"X\",\"groups\":["
                + String.join(",", java.util.Collections.nCopies(51, "{\"groupId\":\"" + UUID.randomUUID() + "\"}"))
                + "]}";
        assertThat(JSON.readTree(create(tooMany).body()).get("errors").toString())
                .contains("TOO_MANY");
        assertThat(keyCount()).isZero();
    }

    @Test
    void groupTheUserIsNotAMemberOfIs404AndNothingIsCreated() throws Exception {
        SignedIn bor = registeredUser("Bor Tuj");
        UUID foreign = groups.createGroup(keys.userId(bor.uid()), "Tuja");

        for (String id : new String[] {foreign.toString(), UUID.randomUUID().toString(), "ni-uuid"}) {
            String body = "{\"name\":\"X\",\"groups\":[{\"groupId\":\"" + klub + "\"},{\"groupId\":\"" + id + "\"}]}";
            HttpResponse<String> response = create(body);
            assertThat(response.statusCode()).as(id).isEqualTo(404);
            assertThat(response.body()).doesNotContain("Tuja");
        }
        assertThat(keyCount()).isZero();
    }

    @Test
    void eleventhActiveKeyIsRejectedAndRevokedOrExpiredDoNotCount() throws Exception {
        keys.revoked(anaId, ALL_READ);
        keys.expired(anaId, ALL_READ);
        List<Key> active = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            active.add(keys.create(anaId, "Ključ " + i, ALL_READ));
        }

        HttpResponse<String> rejected = create(klubBody("Enajsti", klub));

        assertThat(rejected.statusCode()).isEqualTo(409);
        assertThat(Http.compact(rejected.body())).isEqualTo("{\"code\":\"API_KEY_LIMIT\"}");
        assertThat(keyCount()).isEqualTo(12);

        assertThat(Http.send("DELETE", url(KEYS + "/" + active.getFirst().id()), Http.bearer(ana.idToken()))
                        .statusCode())
                .isEqualTo(204);
        assertThat(create(klubBody("Enajsti", klub)).statusCode()).isEqualTo(201);
    }

    @Test
    void concurrentCreationNeverExceedsTheLimit() throws Exception {
        for (int i = 0; i < 9; i++) {
            keys.create(anaId, "Ključ " + i, ALL_READ);
        }
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                String body = klubBody("Sočasni " + i, klub);
                Callable<Integer> call = () -> create(body).statusCode();
                results.add(pool.submit(call));
            }
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get());
            }
            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        } finally {
            pool.shutdownNow();
        }
        assertThat(keyCount()).isEqualTo(10);
    }

    @Test
    void revokedKeyStopsWorkingAndOthersContinue(CapturedOutput output) throws Exception {
        JsonNode first = JSON.readTree(create(klubBody("Prvi", klub)).body());
        JsonNode second = JSON.readTree(create(klubBody("Drugi", klub)).body());
        String firstId = first.get("key").get("id").asString();
        String firstToken = first.get("token").asString();

        HttpResponse<String> revoked = Http.send("DELETE", url(KEYS + "/" + firstId), Http.bearer(ana.idToken()));

        assertThat(revoked.statusCode()).isEqualTo(204);
        assertThat(v1(firstToken)).isEqualTo(401);
        assertThat(v1(second.get("token").asString())).isNotEqualTo(401);
        JsonNode listed = listed(firstId);
        assertThat(listed.get("status").asString()).isEqualTo("REVOKED");
        assertThat(listed.get("revokedAt").isNull()).isFalse();
        assertThat(Http.send("DELETE", url(KEYS + "/" + firstId), Http.bearer(ana.idToken()))
                        .statusCode())
                .isEqualTo(204);
        assertThat(output.getAll()).doesNotContain(firstToken.substring(4));
    }

    @Test
    void expiredKeyIs401AndListedAsExpiredExpiringSoonIsMarked() throws Exception {
        Key expired = keys.expired(anaId, ALL_READ);
        Key soon = keys.create(anaId, "Kmalu", ALL_READ);
        jdbc.update("update api_key set expires_at = now() + interval '3 days' where id = ?", soon.id());
        Key later = keys.create(anaId, "Pozneje", ALL_READ);

        assertThat(v1(expired.token())).isEqualTo(401);
        JsonNode expiredView = listed(expired.id().toString());
        assertThat(expiredView.get("status").asString()).isEqualTo("EXPIRED");
        assertThat(expiredView.get("expiringSoon").asBoolean()).isFalse();
        assertThat(listed(soon.id().toString()).get("expiringSoon").asBoolean()).isTrue();
        assertThat(listed(later.id().toString()).get("expiringSoon").asBoolean())
                .isFalse();
    }

    @Test
    void revokedOrExpiredKeysOlderThan90DaysAreHiddenNewestFirst() throws Exception {
        Key oldRevoked = keys.revoked(anaId, ALL_READ);
        jdbc.update("update api_key set revoked_at = now() - interval '91 days' where id = ?", oldRevoked.id());
        Key oldExpired = keys.expired(anaId, ALL_READ);
        jdbc.update(
                "update api_key set created_at = now() - interval '200 days', expires_at = now() - interval '91 days'"
                        + " where id = ?",
                oldExpired.id());
        Key recentRevoked = keys.revoked(anaId, ALL_READ);
        jdbc.update("update api_key set revoked_at = now() - interval '89 days' where id = ?", recentRevoked.id());
        Key older = keys.create(anaId, "Starejši", ALL_READ);
        jdbc.update("update api_key set created_at = now() - interval '1 day' where id = ?", older.id());

        List<String> ids = new ArrayList<>();
        list().forEach(key -> ids.add(key.get("id").asString()));

        assertThat(ids)
                .doesNotContain(oldRevoked.id().toString(), oldExpired.id().toString());
        assertThat(ids)
                .containsExactly(recentRevoked.id().toString(), older.id().toString());
    }

    @Test
    void deletedGroupLeavesKeyWithoutValidGroups() throws Exception {
        String id = JSON.readTree(create(klubBody("Klubski", klub)).body())
                .get("key")
                .get("id")
                .asString();

        jdbc.update("delete from contact_group where id = ?", klub);

        JsonNode key = listed(id);
        assertThat(key.get("allGroups").asBoolean()).isFalse();
        assertThat(key.get("groups")).isEmpty();
    }

    @Test
    void creationDoesNotRequireRecentSignIn() throws Exception {
        String staleSignIn =
                Tokens.withClaims(ana.idToken(), claims -> claims.put("auth_time", Tokens.epochSeconds(-3 * 86400)));

        assertThat(post(KEYS, staleSignIn, klubBody("Brez sveže prijave", klub)).statusCode())
                .isEqualTo(201);
    }
}
