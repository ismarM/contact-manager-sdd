package si.contactmanager.audit;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Javna pogodba beleženja za 004, 009 in 011 (plan.md, R-06): vnos nastane v isti transakciji kot operacija. Brez
 * obdajajoče transakcije klic vrže izjemo; napaka pri zapisu razveljavi celotno operacijo (FR-005-04).
 */
@Component
public class AuditLog {

    private final AuditRepository repository;

    AuditLog(AuditRepository repository) {
        this.repository = repository;
    }

    /**
     * Zapiše en vnos za dano operacijo nad kontakti skupine in vrne njegov id. Oblika: {@code CREATE} samo {@code
     * after}, {@code DELETE} samo {@code before}, {@code UPDATE} oba, {@code MERGE} vsak kontakt vsaj {@code before}
     * (ohranjen tudi {@code after}); {@code ROLLBACK} zapiše samo rollback; sicer {@link IllegalArgumentException}.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID record(UUID groupId, long actorId, AuditAction action, List<ContactChange> changes) {
        validate(action, changes);
        return repository.insert(groupId, actorId, action, changes, null, false);
    }

    /** Zapis vnosa rollbacka (samo {@code RollbackService}). */
    UUID recordRollback(UUID groupId, long actorId, List<ContactChange> changes, UUID targetEntry, boolean initial) {
        return repository.insert(groupId, actorId, AuditAction.ROLLBACK, changes, targetEntry, initial);
    }

    private static void validate(AuditAction action, List<ContactChange> changes) {
        if (action == AuditAction.ROLLBACK) {
            throw new IllegalArgumentException("ROLLBACK zapiše samo rollback");
        }
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("vnos mora imeti vsaj eno spremembo");
        }
        for (ContactChange change : changes) {
            boolean valid = switch (action) {
                case CREATE -> change.before() == null && change.after() != null;
                case DELETE -> change.before() != null && change.after() == null;
                case UPDATE -> change.before() != null && change.after() != null;
                case MERGE -> change.before() != null;
                case ROLLBACK -> false;
            };
            if (!valid) {
                throw new IllegalArgumentException("neveljavna oblika spremembe za " + action);
            }
        }
    }
}
