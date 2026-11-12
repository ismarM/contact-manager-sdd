package si.contactmanager.account;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Nastavitve brisanja identitete pri ponudniku prijave (012, research R-07, R-16). Validacija (najmanj 70 minut hrambe
 * nadgrobnika, zakup daljši od časovnih omejitev) pride z implementacijo.
 */
@ConfigurationProperties("identity-deletion")
public record IdentityDeletionProperties(
        boolean schedulerEnabled,
        Duration interval,
        Duration lease,
        Duration requestTimeout,
        Duration connectTimeout,
        Duration tombstoneRetention) {}
