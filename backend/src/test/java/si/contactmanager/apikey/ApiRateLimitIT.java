package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import si.contactmanager.apikey.support.ApiV1Test;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.support.ApiKeys.Key;

/**
 * Zaščita pred zlorabo (019, FR-019-16, -20): po meji zahtev na ključ {@code 429 RATE_LIMITED} z {@code Retry-After};
 * drug ključ istega uporabnika in spletna aplikacija neprizadeta; zavrnjena zahteva se šteje kot {@code rate_limited};
 * po izteku okna ključ spet deluje. Meja je v testu znižana na 5.
 */
@Tag("FR-019-16")
@Tag("FR-019-20")
@TestPropertySource(properties = "api-keys.rate-limit=5")
class ApiRateLimitIT extends ApiV1Test {

    @Test
    void requestOverTheLimitGets429WithRetryAfterOthersUnaffectedAndCountedAndRecoversAfterTheWindow()
            throws Exception {
        Scenario s = scenario();
        Key limited = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());
        Key other = keys().forGroups(s.id(Who.EDITOR), Permission.READ, s.group());

        for (int i = 0; i < 5; i++) {
            assertThat(v1("GET", groupsV1(), limited.token()).statusCode()).isEqualTo(200);
        }
        HttpResponse<String> rejected = v1("GET", groupsV1(), limited.token());
        HttpResponse<String> rejectedAgain = v1("GET", contactsV1(s.group()), limited.token());

        assertThat(rejected.statusCode()).isEqualTo(429);
        assertThat(json(rejected.body())).containsEntry("code", "RATE_LIMITED");
        long retryAfter =
                Long.parseLong(rejected.headers().firstValue("Retry-After").orElseThrow());
        assertThat(retryAfter).isBetween(1L, 60L);
        assertThat(rejectedAgain.statusCode()).isEqualTo(429);
        assertThat(v1("GET", groupsV1(), other.token()).statusCode()).isEqualTo(200);
        assertThat(get("/api/groups", s.token(Who.EDITOR)).statusCode()).isEqualTo(200);

        Map<String, Object> totals =
                asObject(json(get("/api/me/api-keys/" + limited.id() + "/usage", s.token(Who.EDITOR))
                                .body())
                        .get("totals"));
        assertThat(totals).containsEntry("readOk", 5).containsEntry("rateLimited", 2);

        Thread.sleep((retryAfter + 1) * 1000);

        assertThat(v1("GET", groupsV1(), limited.token()).statusCode()).isEqualTo(200);
    }

    @Test
    void invalidKeyIsNotRateLimitedAndAnswers401() throws Exception {
        for (int i = 0; i < 7; i++) {
            assertThat(v1("GET", groupsV1(), "cmk_neveljaven").statusCode()).isEqualTo(401);
        }
    }
}
