package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import si.contactmanager.support.ApiKeySigningSecret;

/** Konfiguracija API ključev (FR-019-01, -16, -20): brez veljavne podpisne skrivnosti zagon pade. */
@Tag("FR-019-01")
class ApiKeyPropertiesTest {

    private static ApiKeyProperties bind(String secret) {
        String zone = "Europe/Ljubljana";
        Map<String, String> source = new HashMap<>(Map.of(
                "api-keys.rate-limit", "120",
                "api-keys.stats-zone", zone,
                "api-keys.purge-interval", "1h"));
        if (secret != null) {
            source.put("api-keys.signing-secret", secret);
        }
        return new Binder(new MapConfigurationPropertySource(source))
                .bind("api-keys", ApiKeyProperties.class)
                .get();
    }

    @Test
    void validSecretIsAcceptedWithDefaults() {
        ApiKeyProperties properties = bind(ApiKeySigningSecret.random());

        assertThat(properties.rateLimit()).isEqualTo(120);
        assertThat(properties.statsZone().getId()).isEqualTo("Europe/Ljubljana");
        assertThat(properties.purgeInterval()).hasHours(1);
        assertThat(properties.secretKey()).hasSize(32);
    }

    @Test
    void missingOrBlankSecretFailsStartup() {
        assertThatThrownBy(() -> bind(null)).hasStackTraceContaining("API_KEY_SIGNING_SECRET");
        assertThatThrownBy(() -> bind("")).hasStackTraceContaining("API_KEY_SIGNING_SECRET");
        assertThatThrownBy(() -> bind("   ")).hasStackTraceContaining("API_KEY_SIGNING_SECRET");
    }

    @Test
    void secretShorterThan32BytesFailsStartup() {
        String short31 = Base64.getEncoder().encodeToString(new byte[31]);

        assertThatThrownBy(() -> bind(short31)).hasStackTraceContaining("at least 32 bytes");
        assertThat(bind(Base64.getEncoder().encodeToString(new byte[32])).secretKey())
                .hasSize(32);
    }

    @Test
    void nonBase64SecretFailsStartup() {
        assertThatThrownBy(() -> bind("to ni base64 !!! ".repeat(4))).hasStackTraceContaining("base64");
    }

    @Test
    void secretIsNotPrinted() {
        String secret = ApiKeySigningSecret.random();

        assertThat(bind(secret).toString()).doesNotContain(secret);
    }
}
