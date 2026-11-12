package si.contactmanager.account;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Nastavitve brisanja identitete pri ponudniku prijave (012, research R-07, R-16). Ob zagonu se zavrnejo nevarne
 * vrednosti: hramba nadgrobnika pod 70 minut (ID žeton velja 1 h + 60 s zamika + rezerva) in zakup, ki ni daljši od
 * vsote časovnih omejitev klica (opravilo bi lahko prevzelo vrstico, ki jo zahtevek še obdeluje).
 */
@ConfigurationProperties("identity-deletion")
public record IdentityDeletionProperties(
        boolean schedulerEnabled,
        Duration interval,
        Duration lease,
        Duration requestTimeout,
        Duration connectTimeout,
        Duration tombstoneRetention) {

    private static final Duration MINIMUM_RETENTION = Duration.ofMinutes(70);

    public IdentityDeletionProperties {
        if (tombstoneRetention.compareTo(MINIMUM_RETENTION) < 0) {
            throw new IllegalArgumentException("identity-deletion.tombstone-retention must be at least 70 minutes");
        }
        if (lease.compareTo(connectTimeout.plus(requestTimeout)) <= 0) {
            throw new IllegalArgumentException(
                    "identity-deletion.lease must be longer than connect-timeout + request-timeout");
        }
    }
}
