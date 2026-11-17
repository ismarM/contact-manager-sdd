package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Razvrstitev izida zahteve za statistiko (019, FR-019-20, research R-06). */
@Tag("FR-019-20")
class UsageOutcomeTest {

    @ParameterizedTest(name = "{0} {1} → {2}")
    @CsvSource({
        "GET, 200, READ_OK",
        "get, 200, READ_OK",
        "GET, 204, READ_OK",
        "POST, 201, WRITE_OK",
        "PUT, 200, WRITE_OK",
        "DELETE, 204, WRITE_OK",
        "GET, 400, ERROR",
        "GET, 404, ERROR",
        "POST, 400, ERROR",
        "PUT, 403, ERROR",
        "PUT, 409, ERROR",
        "DELETE, 409, ERROR",
        "GET, 500, ERROR",
        "POST, 503, ERROR",
        "GET, 429, RATE_LIMITED",
        "POST, 429, RATE_LIMITED",
        "GET, 399, ERROR",
        "GET, 300, ERROR"
    })
    void outcomeByMethodAndStatus(String method, int status, UsageOutcome expected) {
        assertThat(UsageOutcome.of(method, status)).isEqualTo(expected);
    }
}
