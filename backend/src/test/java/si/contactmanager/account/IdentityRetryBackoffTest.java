package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Odmik med ponovnimi poskusi: {@code min(30 s · 2^attempts, 1 h)} (FR-012-18). Dobesedna tabela. */
@Tag("FR-012-18")
class IdentityRetryBackoffTest {

    @ParameterizedTest
    @CsvSource({
        "0, 30",
        "1, 60",
        "2, 120",
        "3, 240",
        "5, 960",
        "6, 1920",
        "7, 3600",
        "8, 3600",
        "20, 3600",
        "62, 3600",
        "63, 3600",
        "1000, 3600",
        "2147483647, 3600"
    })
    void delayDoublesFromThirtySecondsAndIsCappedAtOneHour(int attempts, long expectedSeconds) {
        assertThat(IdentityRetryBackoff.delay(attempts)).isEqualTo(Duration.ofSeconds(expectedSeconds));
    }
}
