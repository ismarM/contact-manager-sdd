package si.contactmanager.account;

import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Component;

/** Nadgrobniki izbrisanih identitet ({@code deleted_identity}, data-model.md). Ogrodje – vedenje pride z implementacijo. */
@Component
class DeletedIdentities {

    /** Prevzeta vrstica: UID in dosedanje število poskusov. */
    record Leased(String uid, int attempts) {}

    void insert(String uid, Duration lease) {
        throw new UnsupportedOperationException("not implemented: DeletedIdentities.insert");
    }

    boolean contains(String uid) {
        throw new UnsupportedOperationException("not implemented: DeletedIdentities.contains");
    }

    List<Leased> lease(int limit, Duration lease) {
        throw new UnsupportedOperationException("not implemented: DeletedIdentities.lease");
    }

    void markDeleted(String uid) {
        throw new UnsupportedOperationException("not implemented: DeletedIdentities.markDeleted");
    }

    void markFailed(String uid, String error, Duration retryIn) {
        throw new UnsupportedOperationException("not implemented: DeletedIdentities.markFailed");
    }

    int purge(Duration retention) {
        throw new UnsupportedOperationException("not implemented: DeletedIdentities.purge");
    }
}
