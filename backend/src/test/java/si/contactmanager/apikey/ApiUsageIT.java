package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.apikey.support.ApiV1Test;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys.Key;

/**
 * Statistika uporabe ključa (019, FR-019-20, -21): točna števila po izidu in dnevih, ločena po ključih, vidna takoj po
 * zahtevi; neveljaven in preklican ključ ne štejeta; 24 ur na seznamu; obdobje 7/30 dni po {@code stats-zone}.
 */
@Tag("FR-019-20")
@Tag("FR-019-21")
class ApiUsageIT extends ApiV1Test {

    private static final ZoneId ZONE = ZoneId.of("Europe/Ljubljana");

    private HttpResponse<String> usage(Scenario s, Who who, UUID key, String query) throws Exception {
        return get("/api/me/api-keys/" + key + "/usage" + query, s.token(who));
    }

    private Map<String, Object> totals(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        return asObject(json(response.body()).get("totals"));
    }

    private int insertHour(UUID key, Instant hour, int read, int write, int errors, int limited) {
        return jdbc.update(
                "insert into api_key_usage (key_id, hour, read_ok, write_ok, errors, rate_limited)"
                        + " values (?, ?, ?, ?, ?, ?)",
                key,
                Timestamp.from(hour),
                read,
                write,
                errors,
                limited);
    }

    @Test
    void countsReadsWritesAndErrorsExactlyAndVisibleRightAfterTheRequest() throws Exception {
        Scenario s = scenario();
        Key key = keys().forGroups(s.id(Who.EDITOR), Permission.WRITE, s.group());

        for (int i = 0; i < 40; i++) {
            assertThat(v1("GET", contactsV1(s.group()), key.token()).statusCode())
                    .isEqualTo(200);
        }
        for (int i = 0; i < 5; i++) {
            assertThat(v1("POST", contactsV1(s.group()), key.token(), body(input("Ana" + i, "Novak")))
                            .statusCode())
                    .isEqualTo(201);
        }
        for (int i = 0; i < 3; i++) {
            assertThat(v1("GET", contactsV1(UUID.randomUUID()), key.token()).statusCode())
                    .isEqualTo(404);
        }

        HttpResponse<String> response = usage(s, Who.EDITOR, key.id(), "");

        assertThat(totals(response))
                .containsEntry("total", 48)
                .containsEntry("readOk", 40)
                .containsEntry("writeOk", 5)
                .containsEntry("errors", 3)
                .containsEntry("rateLimited", 0);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("days", 7);
        List<Map<String, Object>> perDay = asObjects(body.get("perDay"));
        assertThat(perDay).hasSize(7);
        assertThat(perDay.stream()
                        .mapToInt(d -> ((Number) d.get("total")).intValue())
                        .sum())
                .isEqualTo(48);
        assertThat(jdbc.queryForObject(
                        "select last_used_at is not null from api_key where id = ?", Boolean.class, key.id()))
                .isTrue();
    }

    @Test
    void keysOfTheSameUserAreCountedSeparately() throws Exception {
        Scenario s = scenario();
        Key a = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());
        Key b = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());

        for (int i = 0; i < 3; i++) {
            v1("GET", contactsV1(s.group()), a.token());
        }
        for (int i = 0; i < 2; i++) {
            v1("GET", contactsV1(s.group()), b.token());
        }

        assertThat(totals(usage(s, Who.EDITOR, a.id(), ""))).containsEntry("total", 3);
        assertThat(totals(usage(s, Who.EDITOR, b.id(), ""))).containsEntry("total", 2);
        List<Map<String, Object>> list = asObjects(
                JSON.readValue(get("/api/me/api-keys", s.token(Who.EDITOR)).body(), List.class));
        assertThat(list)
                .extracting(k -> k.get("id") + ":" + k.get("requestsLast24h"))
                .containsExactlyInAnyOrder(a.id() + ":3", b.id() + ":2");
    }

    @Test
    void invalidRevokedExpiredAndForeignSignedKeysAreNotCounted() throws Exception {
        Scenario s = scenario();
        long user = s.id(Who.EDITOR);
        Scope all = Scope.allGroups(Permission.READ);
        Key revoked = keys().revoked(user, all);
        Key expired = keys().expired(user, all);
        Key other = keys().signedWithOtherSecret(user, all);

        for (String token : List.of(revoked.token(), expired.token(), other.token(), "cmk_ni-zeton")) {
            assertThat(v1("GET", groupsV1(), token).statusCode()).isEqualTo(401);
        }
        assertThat(v1("GET", groupsV1(), null).statusCode()).isEqualTo(401);

        assertThat(jdbc.queryForObject(
                        "select count(*) from api_key_usage where key_id in (?, ?, ?)",
                        Integer.class,
                        revoked.id(),
                        expired.id(),
                        other.id()))
                .isZero();
        assertThat(jdbc.queryForObject(
                        "select count(*) from api_key where last_used_at is not null and user_id = ?",
                        Integer.class,
                        user))
                .isZero();
    }

    @Test
    void webAppRequestsAreNotCounted() throws Exception {
        Scenario s = scenario();
        Key key = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());

        get("/api/groups", s.token(Who.EDITOR));
        get(contactsPath(s.group()), s.token(Who.EDITOR));

        assertThat(totals(usage(s, Who.EDITOR, key.id(), ""))).containsEntry("total", 0);
    }

    @Test
    void last24HoursOnTheListCrossMidnightAndExcludeOlderHours() throws Exception {
        Scenario s = scenario();
        Key key = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());
        Instant hour = Instant.now().truncatedTo(ChronoUnit.HOURS);
        insertHour(key.id(), hour.minus(Duration.ofHours(23)), 2, 0, 1, 0);
        insertHour(key.id(), hour.minus(Duration.ofHours(25)), 7, 7, 7, 7);
        insertHour(key.id(), hour.minus(Duration.ofHours(1)), 0, 3, 0, 1);

        HttpResponse<String> response = get("/api/me/api-keys", s.token(Who.EDITOR));

        List<Map<String, Object>> list = asObjects(JSON.readValue(response.body(), List.class));
        assertThat(list).hasSize(1);
        assertThat(list.getFirst()).containsEntry("requestsLast24h", 7);
    }

    @Test
    void daysAreGroupedByTheStatsZoneAndMissingDaysAreZero() throws Exception {
        Scenario s = scenario();
        Key key = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());
        LocalDate today = LocalDate.now(ZONE);
        // včeraj 23:00 in danes 00:00 po lokalnem času sta različna dneva (čez polnoč), tudi ko UTC dan ni isti
        insertHour(key.id(), today.minusDays(1).atTime(23, 0).atZone(ZONE).toInstant(), 4, 0, 0, 0);
        insertHour(key.id(), today.atStartOfDay(ZONE).toInstant(), 1, 2, 3, 4);
        insertHour(key.id(), today.minusDays(10).atTime(12, 0).atZone(ZONE).toInstant(), 5, 5, 5, 5);

        Map<String, Object> seven =
                json(usage(s, Who.EDITOR, key.id(), "?days=7").body());
        Map<String, Object> thirty =
                json(usage(s, Who.EDITOR, key.id(), "?days=30").body());

        List<Map<String, Object>> days7 = asObjects(seven.get("perDay"));
        assertThat(days7).hasSize(7);
        assertThat(days7.getLast())
                .containsEntry("day", today.toString())
                .containsEntry("total", 10)
                .containsEntry("readOk", 1)
                .containsEntry("writeOk", 2)
                .containsEntry("errors", 3)
                .containsEntry("rateLimited", 4);
        assertThat(days7.get(5))
                .containsEntry("day", today.minusDays(1).toString())
                .containsEntry("readOk", 4);
        assertThat(days7.getFirst())
                .containsEntry("day", today.minusDays(6).toString())
                .containsEntry("total", 0);
        assertThat(asObject(seven.get("totals"))).containsEntry("total", 14);
        List<Map<String, Object>> days30 = asObjects(thirty.get("perDay"));
        assertThat(days30).hasSize(30);
        assertThat(thirty).containsEntry("days", 30);
        assertThat(asObject(thirty.get("totals"))).containsEntry("total", 34);
    }

    @Test
    void periodOtherThanSevenOrThirtyIsRejected() throws Exception {
        Scenario s = scenario();
        Key key = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());

        for (String query : List.of("?days=14", "?days=0", "?days=abc", "?days=")) {
            HttpResponse<String> response = usage(s, Who.EDITOR, key.id(), query);
            assertThat(response.statusCode()).as(query).isEqualTo(400);
            assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        }
    }

    @Test
    void usageOfARevokedKeyStaysReadable() throws Exception {
        Scenario s = scenario();
        Key key = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());
        v1("GET", groupsV1(), key.token());
        keys().revoke(key.id());

        assertThat(totals(usage(s, Who.EDITOR, key.id(), ""))).containsEntry("total", 1);
    }
}
