package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Konfiguracija brisanja identitete (FR-012-18): nevarne vrednosti se zavrnejo ob zagonu, skrivnosti niso v kodi ali
 * konfiguraciji (D-74).
 */
@Tag("FR-012-18")
class ConfigurationSecurityTest {

    private static Map<String, String> settings(String retention, String lease) {
        return Map.of(
                "identity-deletion.scheduler-enabled", "true",
                "identity-deletion.interval", "30s",
                "identity-deletion.lease", lease,
                "identity-deletion.request-timeout", "5s",
                "identity-deletion.connect-timeout", "2s",
                "identity-deletion.tombstone-retention", retention);
    }

    private static IdentityDeletionProperties bind(Map<String, String> source) {
        return new Binder(new MapConfigurationPropertySource(source))
                .bind("identity-deletion", IdentityDeletionProperties.class)
                .get();
    }

    @Test
    void retentionBelowSeventyMinutesIsRejected() {
        assertThatThrownBy(() -> bind(settings("69m", "30s"))).isInstanceOf(RuntimeException.class);
    }

    @Test
    void retentionOfSeventyMinutesAndTwoHoursIsAccepted() {
        assertThat(bind(settings("70m", "30s")).tombstoneRetention()).hasMinutes(70);
        assertThat(bind(settings("2h", "30s")).tombstoneRetention()).hasHours(2);
    }

    @Test
    void leaseShorterThanTheSumOfTimeoutsIsRejected() {
        assertThatThrownBy(() -> bind(settings("2h", "6s"))).isInstanceOf(RuntimeException.class);
        assertThat(bind(settings("2h", "8s")).lease()).hasSeconds(8);
    }

    @Test
    void noSecretsInSourcesOrConfiguration() throws IOException {
        Pattern secret = Pattern.compile("(BEGIN [A-Z ]*PRIVATE KEY|\"private_key\"|client_secret\\s*[:=]\\s*\\S+"
                + "|GOOGLE_APPLICATION_CREDENTIALS\\s*[:=]\\s*\\S+)");
        List<Path> roots = List.of(
                Path.of("src/main"),
                Path.of("../compose.yaml"),
                Path.of("../compose.override.yaml"),
                Path.of("../compose.verify.yaml"));
        for (Path root : roots) {
            if (!Files.exists(root)) {
                continue;
            }
            try (Stream<Path> files = Files.walk(root)) {
                for (Path file : files.filter(Files::isRegularFile).toList()) {
                    assertThat(secret.matcher(Files.readString(file)).find())
                            .as("skrivnost v " + file)
                            .isFalse();
                }
            }
        }
    }
}
