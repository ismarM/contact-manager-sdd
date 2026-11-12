package si.contactmanager.account;

import java.net.http.HttpClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import si.contactmanager.shared.security.FirebaseProperties;

/**
 * Nastavitve brisanja identitete (012): izbira vira OAuth žetona (emulator / produkcija), odjemalec Firebase in planer
 * ponavljanja. Brez skrivnosti v konfiguraciji; poverilnice samo iz okolja.
 */
@Configuration
@EnableConfigurationProperties(IdentityDeletionProperties.class)
public class IdentityDeletionConfig {

    @Bean
    AccessTokenSource accessTokenSource(FirebaseProperties firebase) {
        return firebase.emulator() ? new EmulatorAccessTokenSource() : new GoogleAccessTokenSource();
    }

    @Bean
    IdentityProvider identityProvider(
            AccessTokenSource tokens, IdentityDeletionProperties properties, FirebaseProperties firebase) {
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(properties.connectTimeout())
                .build();
        return new FirebaseIdentityProvider(http, tokens, properties, firebase);
    }

    /** Planer ponavljanja: prvi obhod ob zagonu, nato po intervalu (samo ob {@code scheduler-enabled=true}). */
    @Configuration
    @EnableScheduling
    @ConditionalOnProperty(prefix = "identity-deletion", name = "scheduler-enabled", havingValue = "true")
    static class Scheduling {

        @Bean
        IdentityDeletionScheduler identityDeletionScheduler(IdentityDeletionJob job) {
            return new IdentityDeletionScheduler(job);
        }
    }

    /** Zažene {@link IdentityDeletionJob} ob zagonu in nato periodično; napake obhoda ne ustavijo planerja. */
    static class IdentityDeletionScheduler {

        private static final Logger LOG = LoggerFactory.getLogger(IdentityDeletionScheduler.class);

        private final IdentityDeletionJob job;

        IdentityDeletionScheduler(IdentityDeletionJob job) {
            this.job = job;
        }

        @EventListener(ApplicationReadyEvent.class)
        void onReady() {
            run();
        }

        @Scheduled(fixedDelayString = "${identity-deletion.interval:30s}")
        void run() {
            try {
                job.runOnce();
            } catch (RuntimeException e) {
                LOG.warn("Obhod brisanja identitete ni uspel ({})", e.getClass().getSimpleName());
            }
        }
    }
}
