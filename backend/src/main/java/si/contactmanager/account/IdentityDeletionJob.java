package si.contactmanager.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import si.contactmanager.account.DeletedIdentities.Leased;
import si.contactmanager.account.IdentityProvider.Result;

/**
 * Ponavljanje brisanja identitete in čiščenje nadgrobnikov (R-07, FR-012-18). En obhod: {@code purge}, nato prevzem
 * zapadlih vrstic (en kratek {@code UPDATE} z zakupom) in za vsako klic ponudnika ZUNAJ transakcije; izid v lastni kratki
 * transakciji. Stanje je samo v bazi, zato ponavljanje in čiščenje preživita ponovni zagon.
 */
@Component
public class IdentityDeletionJob {

    private static final Logger LOG = LoggerFactory.getLogger(IdentityDeletionJob.class);
    private static final int BATCH = 5;
    private static final int WARN_AFTER_ATTEMPTS = 10;

    private final DeletedIdentities deleted;
    private final IdentityProvider identities;
    private final IdentityDeletionProperties properties;

    IdentityDeletionJob(DeletedIdentities deleted, IdentityProvider identities, IdentityDeletionProperties properties) {
        this.deleted = deleted;
        this.identities = identities;
        this.properties = properties;
    }

    /** Eden obhod: čiščenje, prevzem zapadlih vrstic, brisanje pri ponudniku. */
    public void runOnce() {
        deleted.purge(properties.tombstoneRetention());
        for (Leased row : deleted.lease(BATCH, properties.lease())) {
            Result result;
            try {
                result = identities.deleteWithDetail(row.uid());
            } catch (RuntimeException e) {
                // Ena vrstica z nepričakovano napako ne sme ustaviti obhoda; ostane odprta in se ponovi (zakup poteče).
                LOG.error(
                        "Nepričakovana napaka pri brisanju identitete ({})",
                        e.getClass().getSimpleName());
                result = new Result(IdentityProvider.Outcome.RETRY, "INTERNAL");
            }
            if (result.outcome().success()) {
                deleted.markDeleted(row.uid());
            } else {
                deleted.markFailed(row.uid(), result.error(), IdentityRetryBackoff.delay(row.attempts()));
                if (row.attempts() + 1 >= WARN_AFTER_ATTEMPTS) {
                    LOG.warn("Brisanje identitete pri ponudniku še ne uspe po {} poskusih", row.attempts() + 1);
                }
            }
        }
    }
}
